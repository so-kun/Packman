// Checks on the ROM decode. These are the tests that would catch a silently
// wrong pixel order or palette wiring, which is the failure mode that makes a
// recreation look almost-but-not-quite right.
//
//   node --test test/

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TILE_PIXELS, SPRITE_PIXELS, PALETTE, cssColor, charTile,
  TILE_CODE, SPRITE_CODE, COLOR_CODE, FRUIT_SPRITE,
} from '../src/rom.js';
import {
  TILE_ROM, SPRITE_ROM, HW_COLORS, PALETTE_PROM, WAVETABLE, SND_PRELUDE, SND_DEAD,
} from '../src/romdata.js';
import { MAZE_TILES, MAZE_TOP, DOOR_TILES } from '../src/maze.js';
import { Maze } from '../src/maze.js';
import { COLS, ROWS, COLORS } from '../src/constants.js';

const tilePixel = (code, x, y) => TILE_PIXELS[code * 64 + y * 8 + x];
const spritePixel = (code, x, y) => SPRITE_PIXELS[code * 256 + y * 16 + x];

// Render one tile as text so a failure message shows the actual shape.
function tileArt(code) {
  const rows = [];
  for (let y = 0; y < 8; y++) {
    let s = '';
    for (let x = 0; x < 8; x++) s += '.123'[tilePixel(code, x, y)];
    rows.push(s);
  }
  return rows.join('\n');
}

test('ROM blobs are the sizes the board has', () => {
  assert.equal(TILE_ROM.length, 4096);    // 256 tiles x 16 bytes
  assert.equal(SPRITE_ROM.length, 4096);  // 64 sprites x 64 bytes
  assert.equal(HW_COLORS.length, 32);
  assert.equal(PALETTE_PROM.length, 256);
  assert.equal(WAVETABLE.length, 256);    // 8 waveforms x 32 samples
  assert.equal(SND_PRELUDE.length, 490);  // 245 ticks x 2 voices
  assert.equal(SND_DEAD.length, 90);      // 90 ticks x 1 voice
});

test('the waveform PROM only holds 4-bit samples', () => {
  for (let i = 0; i < WAVETABLE.length; i++) {
    assert.ok(WAVETABLE[i] <= 0x0f, `wavetable[${i}] = ${WAVETABLE[i]} exceeds 4 bits`);
  }
});

test('text tiles sit at their ASCII code points', () => {
  assert.equal(charTile('A'), 0x41);
  assert.equal(charTile('0'), 0x30);
  assert.equal(charTile(' '), 0x40);
  // The five relocated punctuation marks.
  assert.equal(charTile('/'), 58);
  assert.equal(charTile('-'), 59);
  assert.equal(charTile('"'), 38);
  assert.equal(charTile('!'), 0x5b);
});

test("the letter A decodes to a legible A", () => {
  // If the pixel order were wrong this would come out mirrored or scrambled.
  assert.equal(tileArt(charTile('A')), [
    '...333..',
    '..33.33.',
    '.33...33',
    '.33...33',
    '.3333333',
    '.33...33',
    '.33...33',
    '........',
  ].join('\n'));
});

test('the space tile is blank and the dot tile is not', () => {
  for (let i = 0; i < 64; i++) assert.equal(TILE_PIXELS[TILE_CODE.SPACE * 64 + i], 0);
  const dotPixels = [...Array(64)].filter((_, i) => TILE_PIXELS[TILE_CODE.DOT * 64 + i]).length;
  assert.equal(dotPixels, 4, 'the dot is a 2x2 block');
  const pillPixels = [...Array(64)].filter((_, i) => TILE_PIXELS[TILE_CODE.PILL * 64 + i]).length;
  assert.ok(pillPixels > 30, 'the energizer fills most of its tile');
});

test('the ghost-house door draws on pen 2, which only 0x18 makes pink', () => {
  const pens = new Set();
  for (let i = 0; i < 64; i++) pens.add(TILE_PIXELS[TILE_CODE.DOOR * 64 + i]);
  assert.deepEqual([...pens].sort(), [0, 2]);
  assert.equal(cssColor(COLOR_CODE.DOOR, 2), '#ffb8de');
  assert.equal(cssColor(COLOR_CODE.DOT, 2), '#000000', 'the playfield code would hide it');
});

test('the palette reproduces the resistor ladder, including the blue asymmetry', () => {
  // Red and green have three resistors, blue only two, so blue cannot reach
  // the lowest step on its own and saturates differently.
  const levels = new Set();
  for (let i = 0; i < 256; i++) levels.add(PALETTE[i * 4 + 2]); // blue channel
  for (const b of levels) {
    assert.ok([0x00, 0x47, 0x97, 0xde].includes(b), `unexpected blue level ${b}`);
  }
  // Pen 0 of every colour code is the transparent one.
  for (let cc = 0; cc < 64; cc++) assert.equal(cssColor(cc, 0), null);
});

test('the ghost colours are the hardware colours, not approximations of them', () => {
  assert.equal(COLORS.blinky, '#ff0000');
  assert.equal(COLORS.pinky, '#ffb8de');
  assert.equal(COLORS.inky, '#00ffde');
  assert.equal(COLORS.clyde, '#ffb847');
  assert.equal(COLORS.wall, '#2121de');
  assert.equal(COLORS.dot, '#ffb897');
});

test('every sprite the renderer asks for exists and is non-empty', () => {
  const used = [
    SPRITE_CODE.PAC_CLOSED,
    ...SPRITE_CODE.PAC_H, ...SPRITE_CODE.PAC_V,
    ...SPRITE_CODE.FRIGHTENED,
    ...Object.values(SPRITE_CODE.GHOST).flat(),
    ...Object.values(SPRITE_CODE.SCORE),
    ...Object.values(FRUIT_SPRITE),
  ];
  // The last death frame is deliberately empty — Pac-Man has vanished by then.
  for (let c = SPRITE_CODE.DEATH_FIRST; c < SPRITE_CODE.DEATH_LAST; c++) used.push(c);
  for (const code of used) {
    assert.ok(code >= 0 && code < 64, `sprite ${code} out of range`);
    const filled = [...Array(256)].filter((_, i) => SPRITE_PIXELS[code * 256 + i]).length;
    assert.ok(filled > 0, `sprite ${code} decoded to nothing`);
  }
});

test('the death sequence shrinks to nothing', () => {
  const filled = (code) => [...Array(256)].filter((_, i) => SPRITE_PIXELS[code * 256 + i]).length;
  // Frames 52..61 collapse Pac-Man, 62 is the burst, 63 is empty.
  for (let c = SPRITE_CODE.DEATH_FIRST + 2; c <= 61; c++) {
    assert.ok(filled(c) < filled(c - 1), `frame ${c} should be smaller than ${c - 1}`);
  }
  assert.ok(filled(62) > filled(61), 'the burst frame is larger than the last sliver');
  assert.equal(filled(SPRITE_CODE.DEATH_LAST), 0);
});

test('Pac-Man facing left is the right-facing sprite mirrored', () => {
  // The board stores one horizontal animation and flips it, so the artwork
  // must actually be asymmetric — otherwise the flip would be a no-op.
  const open = SPRITE_CODE.PAC_H[0];
  let asymmetric = false;
  for (let y = 0; y < 16 && !asymmetric; y++) {
    for (let x = 0; x < 16; x++) {
      if (spritePixel(open, x, y) !== spritePixel(open, 15 - x, y)) { asymmetric = true; break; }
    }
  }
  assert.ok(asymmetric, 'the open-mouth sprite should not be left-right symmetric');
});

test('the maze tile map agrees with the maze the game plays on', () => {
  const maze = new Maze();
  let walls = 0;
  // The arcade draws wall blocks as outlines, so a wall cell only carries a
  // tile where it borders open space; cells buried inside a block are blank.
  const wallAt = (c, r) => (c < 0 || c >= COLS || r < 0 || r >= ROWS ? true : maze.wall[r][c]);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const tile = MAZE_TILES[r][c];
      const isWall = maze.wall[r][c] && !maze.door[r][c];
      if (isWall) {
        walls++;
        const onEdge = !wallAt(c - 1, r) || !wallAt(c + 1, r)
                    || !wallAt(c, r - 1) || !wallAt(c, r + 1);
        if (onEdge) {
          assert.notEqual(tile, TILE_CODE.SPACE, `wall edge at ${c},${r} has no tile`);
        }
      }
      // Cells that carry a dot must be blank in the static layer, or the dot
      // would be drawn over solid artwork.
      if (maze.dots[r][c]) {
        assert.equal(tile, TILE_CODE.SPACE, `dot cell ${c},${r} is not blank`);
      }
    }
  }
  assert.ok(walls > 200, 'sanity: the maze has walls');
});

test('the door cells carry the door tile', () => {
  for (const [c, r] of DOOR_TILES) {
    assert.equal(MAZE_TILES[r][c], TILE_CODE.DOOR, `no door tile at ${c},${r}`);
  }
});

test('the maze occupies exactly the rows the screen reserves for it', () => {
  const nonBlank = (r) => MAZE_TILES[r].some((t) => t !== TILE_CODE.SPACE);
  for (let r = 0; r < MAZE_TOP; r++) assert.ok(!nonBlank(r), `row ${r} should be HUD space`);
  assert.ok(nonBlank(MAZE_TOP), 'the maze starts at MAZE_TOP');
  assert.ok(nonBlank(MAZE_TOP + 30), 'the maze is 31 rows tall');
  for (let r = MAZE_TOP + 31; r < ROWS; r++) assert.ok(!nonBlank(r), `row ${r} should be free`);
});
