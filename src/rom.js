// Decoding of the board's ROM and PROM contents into pixels and colours.
//
// Nothing here is a design decision — it is the wiring of the 1980 board
// expressed in JavaScript. The tile and sprite ROMs store 2-bit pixels in an
// order that only makes sense given how the video hardware scans them out
// (the display is rotated 90 degrees, so the stored artwork is counter-
// rotated), and colour arrives through two PROMs feeding a resistor ladder.
//
// Layout and decode order follow MAME's pacman driver and floooh/pacman.c.

import {
  TILE_ROM, SPRITE_ROM, HW_COLORS, PALETTE_PROM,
} from './romdata.js';

// ---------------------------------------------------------------------------
// Colour
//
// The 32-entry colour PROM packs one RGB value per byte, driving a resistor
// ladder. Red and green get three resistors each, blue only two — so blue
// saturates lower than the other channels, an asymmetry that is visible in
// the game (the maze walls are #2121ff, never a pure bright blue).
const R_WEIGHTS = [0x21, 0x47, 0x97];

function hwColor(entry) {
  const r = ((entry >> 0) & 1) * R_WEIGHTS[0] + ((entry >> 1) & 1) * R_WEIGHTS[1]
          + ((entry >> 2) & 1) * R_WEIGHTS[2];
  const g = ((entry >> 3) & 1) * R_WEIGHTS[0] + ((entry >> 4) & 1) * R_WEIGHTS[1]
          + ((entry >> 5) & 1) * R_WEIGHTS[2];
  const b = ((entry >> 6) & 1) * R_WEIGHTS[1] + ((entry >> 7) & 1) * R_WEIGHTS[2];
  return [r, g, b];
}

// 256 palette entries = 64 colour codes of 4 pens. Pen 0 of every code is the
// transparent one, which is how the hardware gets sprites over background.
export const PALETTE = (() => {
  const hw = [];
  for (let i = 0; i < 32; i++) hw.push(hwColor(HW_COLORS[i]));
  const out = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const [r, g, b] = hw[PALETTE_PROM[i] & 0x0f];
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = (i & 3) === 0 ? 0 : 255;
  }
  return out;
})();

const HEX = (n) => n.toString(16).padStart(2, '0');

/** CSS colour for one pen of one colour code, or null where it is transparent. */
export function cssColor(colorCode, pen) {
  const i = ((colorCode * 4) & 0xff) | (pen & 3);
  if (PALETTE[i * 4 + 3] === 0) return null;
  return `#${HEX(PALETTE[i * 4])}${HEX(PALETTE[i * 4 + 1])}${HEX(PALETTE[i * 4 + 2])}`;
}

// ---------------------------------------------------------------------------
// Tile and sprite pixels
//
// Each ROM byte holds four pixels stacked vertically: bit (7-n) is the high
// plane and bit (3-n) the low plane of row n. A byte therefore paints an 8x4
// column strip, and tiles/sprites are assembled from those strips.
function decodeStrip(out, outStride, ox, oy, rom, stride, offset, code) {
  for (let tx = 0; tx < 8; tx++) {
    const byte = rom[code * stride + offset + (7 - tx)];
    for (let ty = 0; ty < 4; ty++) {
      const hi = (byte >> (7 - ty)) & 1;
      const lo = (byte >> (3 - ty)) & 1;
      out[(oy + ty) * outStride + ox + tx] = (hi << 1) | lo;
    }
  }
}

/** 256 tiles of 8x8 pen indices, laid out one tile after another. */
export const TILE_PIXELS = (() => {
  const out = new Uint8Array(256 * 64);
  for (let code = 0; code < 256; code++) {
    const base = code * 64;
    const view = out.subarray(base, base + 64);
    decodeStrip(view, 8, 0, 0, TILE_ROM, 16, 8, code);
    decodeStrip(view, 8, 0, 4, TILE_ROM, 16, 0, code);
  }
  return out;
})();

/** 64 sprites of 16x16 pen indices, laid out one sprite after another. */
export const SPRITE_PIXELS = (() => {
  const out = new Uint8Array(64 * 256);
  // The eight 8x4 strips of a 16x16 sprite are stored in this order.
  const strips = [
    [0, 0, 40], [8, 0, 8], [0, 4, 48], [8, 4, 16],
    [0, 8, 56], [8, 8, 24], [0, 12, 32], [8, 12, 0],
  ];
  for (let code = 0; code < 64; code++) {
    const base = code * 256;
    const view = out.subarray(base, base + 256);
    for (const [ox, oy, offset] of strips) {
      decodeStrip(view, 16, ox, oy, SPRITE_ROM, 64, offset, code);
    }
  }
  return out;
})();

// ---------------------------------------------------------------------------
// Codes
//
// Tile and sprite numbers as the game's own code uses them. The text tiles sit
// at their ASCII positions, with five punctuation marks relocated.
export function charTile(ch) {
  switch (ch) {
    case ' ': return 0x40;
    case '/': return 58;
    case '-': return 59;
    case '"': return 38;
    case '!': return 'Z'.charCodeAt(0) + 1;
    default: return ch.charCodeAt(0);
  }
}

export const TILE_CODE = {
  SPACE: 0x40,
  DOT: 0x10,
  PILL: 0x14,
  DOOR: 0xcf,
};

export const SPRITE_CODE = {
  // Fruit, in the order the board numbers them.
  CHERRIES: 0, STRAWBERRY: 1, PEACH: 2, BELL: 3,
  APPLE: 4, GRAPES: 5, GALAXIAN: 6, KEY: 7,
  FRIGHTENED: [28, 29],
  INVISIBLE: 30,
  // Ghost bodies and, reused with the eyes-only colour code, ghost eyes.
  GHOST: { RIGHT: [32, 33], DOWN: [34, 35], LEFT: [36, 37], UP: [38, 39] },
  SCORE: { 200: 40, 400: 41, 800: 42, 1600: 43 },
  // Pac-Man: horizontal frames are flipped for LEFT, vertical ones for UP.
  PAC_H: [44, 46, 48, 46],
  PAC_V: [45, 47, 48, 47],
  PAC_CLOSED: 48,
  DEATH_FIRST: 52,
  DEATH_LAST: 63,
};

export const COLOR_CODE = {
  BLANK: 0x00,
  DEFAULT: 0x0f,
  DOT: 0x10,
  PACMAN: 0x09,
  BLINKY: 0x01,
  PINKY: 0x03,
  INKY: 0x05,
  CLYDE: 0x07,
  FRIGHTENED: 0x11,
  FRIGHTENED_BLINKING: 0x12,
  GHOST_SCORE: 0x18,
  // The ghost-house door tile draws on pen 2, and 0x18 is the only code whose
  // pen 2 is the pink the door shows — the playfield's own code paints it
  // black, which is why the door needs its own colour cell.
  DOOR: 0x18,
  EYES: 0x19,
  WHITE_BORDER: 0x1f,
  FRUIT_SCORE: 0x03,
  // Bonus fruit, keyed by the sprite names this project already uses.
  cherry: 0x14,
  strawberry: 0x0f,
  orange: 0x15,
  bell: 0x16,
  apple: 0x14,
  melon: 0x17,
  galaxian: 0x09,
  key: 0x16,
};

// This project names the fruit as the Dossier does; the board numbers them in
// the same order under two different names (peach/grapes).
export const FRUIT_SPRITE = {
  cherry: SPRITE_CODE.CHERRIES,
  strawberry: SPRITE_CODE.STRAWBERRY,
  orange: SPRITE_CODE.PEACH,
  apple: SPRITE_CODE.APPLE,
  melon: SPRITE_CODE.GRAPES,
  galaxian: SPRITE_CODE.GALAXIAN,
  bell: SPRITE_CODE.BELL,
  key: SPRITE_CODE.KEY,
};
