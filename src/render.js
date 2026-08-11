// Rendering: the board's own tiles and sprites, coloured through its palette.
//
// Nothing here draws artwork. Every glyph, maze segment, ghost and fruit is a
// numbered tile or sprite in the graphics ROMs, and every colour is a code
// into the palette PROM — so this file is mostly a translation of "what the
// game asks for" into "which ROM entry that is". See src/rom.js for the decode
// and docs/fidelity-checklist.md for what is exact and what is not.

import {
  TILE, COLS, ROWS, WIDTH, HEIGHT, COLORS, fruitForLevel,
} from './constants.js';
import { MAZE_TILES } from './maze.js';
import { GSTATE } from './ghosts.js';
import {
  TILE_PIXELS, SPRITE_PIXELS, PALETTE, charTile,
  TILE_CODE, SPRITE_CODE, COLOR_CODE, FRUIT_SPRITE,
} from './rom.js';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// ---------------------------------------------------------------------------
// Turning ROM entries into canvases
//
// A tile or sprite is a grid of 2-bit pen numbers; the colour code says which
// four palette entries those pens mean. Pen 0 is always transparent.

function paintInto(img, pixels, base, size, colorCode, flipX, flipY) {
  const palBase = (colorCode * 4) & 0xff;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx = flipX ? size - 1 - x : x;
      const sy = flipY ? size - 1 - y : y;
      const pen = pixels[base + sy * size + sx];
      if (pen === 0) continue;
      const p = (palBase | pen) * 4;
      const o = (y * size + x) * 4;
      img.data[o] = PALETTE[p];
      img.data[o + 1] = PALETTE[p + 1];
      img.data[o + 2] = PALETTE[p + 2];
      img.data[o + 3] = 255;
    }
  }
}

function spriteCanvas(code, colorCode, flipX = false, flipY = false, scale = 1) {
  const cv = makeCanvas(16, 16);
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(16, 16);
  paintInto(img, SPRITE_PIXELS, code * 256, 16, colorCode, flipX, flipY);
  ctx.putImageData(img, 0, 0);
  if (scale === 1) return cv;
  const big = makeCanvas(16 * scale, 16 * scale);
  const bctx = big.getContext('2d');
  bctx.imageSmoothingEnabled = false;
  bctx.drawImage(cv, 0, 0, 16 * scale, 16 * scale);
  return big;
}

function tileCanvas(code, colorCode) {
  const cv = makeCanvas(TILE, TILE);
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(TILE, TILE);
  paintInto(img, TILE_PIXELS, code * 64, TILE, colorCode, false, false);
  ctx.putImageData(img, 0, 0);
  return cv;
}

// ---------------------------------------------------------------------------
// Text
//
// Text tiles sit at their ASCII code points in the ROM and are single-pen, so
// callers can keep naming a CSS colour instead of a palette code. Glyphs are
// cached per colour because the HUD redraws every frame.

const glyphCache = new Map();

function glyph(ch, color) {
  const key = `${ch}|${color}`;
  let cv = glyphCache.get(key);
  if (cv) return cv;
  cv = makeCanvas(TILE, TILE);
  const ctx = cv.getContext('2d');
  const code = charTile(ch);
  ctx.fillStyle = color;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      if (TILE_PIXELS[code * 64 + y * TILE + x]) ctx.fillRect(x, y, 1, 1);
    }
  }
  glyphCache.set(key, cv);
  return cv;
}

export function drawText(ctx, text, tx, ty, color) {
  for (let i = 0; i < text.length; i++) {
    ctx.drawImage(glyph(text[i].toUpperCase(), color), (tx + i) * TILE, ty * TILE);
  }
  // Callers have long relied on drawText leaving the fill colour set.
  ctx.fillStyle = color;
}

// The attract screen's "PTS" is a half-height face that the ROM stores packed
// two characters to a tile; it is redrawn here rather than unpacked.
const SMALL_FONT = {
  P: ['###.', '#..#', '###.', '#...', '#...'],
  T: ['####', '.#..', '.#..', '.#..', '.#..'],
  S: ['.###', '#...', '.##.', '...#', '###.'],
  ' ': ['....', '....', '....', '....', '....'],
};

export function drawSmallText(ctx, text, x, y, color) {
  ctx.fillStyle = color;
  let ox = x;
  for (const ch of text.toUpperCase()) {
    const g = SMALL_FONT[ch] || SMALL_FONT[' '];
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 4; c++) if (g[r][c] === '#') ctx.fillRect(ox + c, y + r, 1, 1);
    }
    ox += 5;
  }
}

// Draw any background tile at a cell. The kill screen uses this: what the
// original shows there is not drawn garbage but real tiles with wrong numbers,
// so the corruption is reproduced by picking tile codes rather than shapes.
const romTileCache = new Map();

export function drawRomTile(ctx, code, colorCode, col, row) {
  const key = (code << 8) | (colorCode & 0xff);
  let cv = romTileCache.get(key);
  if (!cv) {
    cv = tileCanvas(code & 0xff, colorCode);
    romTileCache.set(key, cv);
  }
  ctx.drawImage(cv, col * TILE, row * TILE);
}

// ---------------------------------------------------------------------------

const DIRS = ['RIGHT', 'DOWN', 'LEFT', 'UP'];
// Pac-Man has one horizontal and one vertical animation; LEFT is the
// horizontal pair flipped in x, UP the vertical pair flipped in y.
const PAC_FLIP = { RIGHT: [false, false], LEFT: [true, false], DOWN: [false, false], UP: [false, true] };
const PAC_VERTICAL = { UP: true, DOWN: true, LEFT: false, RIGHT: false };

const GHOST_COLOR = {
  blinky: COLOR_CODE.BLINKY,
  pinky: COLOR_CODE.PINKY,
  inky: COLOR_CODE.INKY,
  clyde: COLOR_CODE.CLYDE,
};

export class Renderer {
  constructor(canvas, maze) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.maze = maze;
    this.buildSprites();
    // The playfield never changes shape, so both colour variants of it are
    // drawn once: the normal blue, and the white flash on a completed level.
    this.wallBlue = this.paintMaze(COLOR_CODE.DOT);
    this.wallWhite = this.paintMaze(COLOR_CODE.WHITE_BORDER);
  }

  buildSprites() {
    const S = this.sprites = {};

    // Pac-Man. Index 0 is the half-open mouth, index 1 the wide one, matching
    // the animation order this project's game loop already uses.
    S.pacClosed = spriteCanvas(SPRITE_CODE.PAC_CLOSED, COLOR_CODE.PACMAN);
    S.pac = {};
    S.pacGiant = {};
    for (const d of DIRS) {
      const frames = PAC_VERTICAL[d] ? SPRITE_CODE.PAC_V : SPRITE_CODE.PAC_H;
      const [fx, fy] = PAC_FLIP[d];
      S.pac[d] = [
        spriteCanvas(frames[1], COLOR_CODE.PACMAN, fx, fy),
        spriteCanvas(frames[0], COLOR_CODE.PACMAN, fx, fy),
      ];
      if (d === 'LEFT' || d === 'RIGHT') {
        S.pacGiant[d] = [
          spriteCanvas(frames[1], COLOR_CODE.PACMAN, fx, fy, 2),
          spriteCanvas(frames[0], COLOR_CODE.PACMAN, fx, fy, 2),
        ];
      }
    }

    // The death sequence is its own run of sprites, 52 through 63.
    S.pacDeath = [];
    for (let code = SPRITE_CODE.DEATH_FIRST; code <= SPRITE_CODE.DEATH_LAST; code++) {
      S.pacDeath.push(spriteCanvas(code, COLOR_CODE.PACMAN));
    }

    // Ghosts share one set of body sprites; the colour code makes them
    // different ghosts, and the eyes-only code hides the body entirely.
    S.ghost = {};
    for (const name of Object.keys(GHOST_COLOR)) {
      S.ghost[name] = {};
      for (const d of DIRS) {
        S.ghost[name][d] = SPRITE_CODE.GHOST[d].map((c) => spriteCanvas(c, GHOST_COLOR[name]));
      }
    }
    S.eyes = {};
    for (const d of DIRS) S.eyes[d] = spriteCanvas(SPRITE_CODE.GHOST[d][0], COLOR_CODE.EYES);
    S.fright = SPRITE_CODE.FRIGHTENED.map((c) => spriteCanvas(c, COLOR_CODE.FRIGHTENED));
    S.frightFlash = SPRITE_CODE.FRIGHTENED.map(
      (c) => spriteCanvas(c, COLOR_CODE.FRIGHTENED_BLINKING),
    );

    S.fruit = {};
    for (const [name, code] of Object.entries(FRUIT_SPRITE)) {
      S.fruit[name] = spriteCanvas(code, COLOR_CODE[name]);
    }
    S.score = {};
    for (const [points, code] of Object.entries(SPRITE_CODE.SCORE)) {
      S.score[points] = spriteCanvas(Number(code), COLOR_CODE.GHOST_SCORE);
    }

    // Dots and energizers are background tiles, not sprites.
    S.dot = tileCanvas(TILE_CODE.DOT, COLOR_CODE.DOT);
    S.pill = tileCanvas(TILE_CODE.PILL, COLOR_CODE.DOT);
  }

  paintMaze(colorCode) {
    const cv = makeCanvas(WIDTH, HEIGHT);
    const ctx = cv.getContext('2d');
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const code = MAZE_TILES[r][c];
        if (code === TILE_CODE.SPACE) continue;
        const cc = code === TILE_CODE.DOOR ? COLOR_CODE.DOOR : colorCode;
        ctx.drawImage(tileCanvas(code, cc), c * TILE, r * TILE);
      }
    }
    return cv;
  }

  clear() {
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  drawMaze(flashWhite = false) {
    this.ctx.drawImage(flashWhite ? this.wallWhite : this.wallBlue, 0, 0);
  }

  drawDots(tick) {
    const ctx = this.ctx;
    const blinkOn = (tick % 20) < 10;
    for (let r = 0; r < ROWS; r++) {
      const row = this.maze.dots[r];
      for (let c = 0; c < COLS; c++) {
        const d = row[c];
        if (d === 1) ctx.drawImage(this.sprites.dot, c * TILE, r * TILE);
        else if (d === 2 && blinkOn) ctx.drawImage(this.sprites.pill, c * TILE, r * TILE);
      }
    }
  }

  blit(sprite, cx, cy) {
    this.ctx.drawImage(sprite, Math.round(cx - sprite.width / 2), Math.round(cy - sprite.height / 2));
  }

  drawPac(pac) {
    // Cycle shut -> half -> wide -> half, freezing when Pac is not moving.
    const phase = Math.floor(pac.frame) % 4;
    let sprite;
    if (phase === 0) sprite = this.sprites.pacClosed;
    else if (phase === 2) sprite = this.sprites.pac[pac.dir.name][1];
    else sprite = this.sprites.pac[pac.dir.name][0];
    this.blit(sprite, pac.x, pac.y);
  }

  drawPacDeath(frameIndex) {
    const frames = this.sprites.pacDeath;
    return frames[Math.min(frameIndex, frames.length - 1)];
  }

  drawGhost(g, game) {
    const fi = (game.tick >> 3) & 1;
    if (g.state === GSTATE.EYES || g.state === GSTATE.ENTERING) {
      this.blit(this.sprites.eyes[g.dir.name], g.x, g.y);
      return;
    }
    if (g.frightened) {
      const t = game.frightTimer;
      const flashing = t > 0 && t < game.spec.frightFlashes * 28 && ((t / 14) | 0) % 2 === 0;
      this.blit((flashing ? this.sprites.frightFlash : this.sprites.fright)[fi], g.x, g.y);
      return;
    }
    this.blit(this.sprites.ghost[g.name][g.dir.name][fi], g.x, g.y);
  }

  drawHud(game) {
    const ctx = this.ctx;
    // The active player's "1UP" label blinks during play; the score itself
    // stays on screen (matches the arcade original). No blink in attract or
    // during the autoplay demo — there is no active player then.
    const inGame = game.state && game.state !== 'attract' && !game.demoMode;
    if (!inGame || (game.tick % 32) < 16) drawText(ctx, '1UP', 3, 0, COLORS.text);
    drawText(ctx, 'HIGH SCORE', 9, 0, COLORS.text);
    // "2UP" sits opposite "1UP" while the machine is idle; a one-player game
    // in progress shows only the active side.
    if (!inGame) drawText(ctx, '2UP', 22, 0, COLORS.text);
    const s = String(game.score === 0 ? '00' : game.score);
    drawText(ctx, s.padStart(6, ' '), 1, 1, COLORS.text);
    const hs = String(game.highScore === 0 ? '00' : game.highScore);
    drawText(ctx, hs.padStart(6, ' '), 11, 1, COLORS.text);
    // lives (bottom-left), facing left as on the original
    for (let i = 0; i < Math.min(game.lives, 5); i++) {
      this.blit(this.sprites.pac.LEFT[1], 20 + i * 16, 34.5 * TILE + 4);
    }
    // Fruit history (bottom-right): the last 7 levels, anchored at the right
    // edge with the oldest there — new fruit pushes in from the left.
    const first = Math.max(1, game.level - 6);
    let x = 24.5 * TILE;
    for (let lv = first; lv <= game.level; lv++) {
      const f = fruitForLevel(lv);
      this.blit(this.sprites.fruit[f.sprite], x, 34.5 * TILE + 4);
      x -= 16;
    }
  }
}
