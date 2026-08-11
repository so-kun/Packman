// Level-256 kill screen: the original's level counter is a single byte, and
// on the 256th board the fruit-drawing routine runs away, blanketing the
// right half of the screen with garbage tiles. Movement and walls still
// follow the normal maze data (only the video tiles were corrupted), but
// most right-half dots are gone — leaving too few to finish the board.

import { COLS, ROWS } from './constants.js';
import { drawRomTile } from './render.js';

export function isKillScreen(level) { return level % 256 === 0; }

// Nine dots survive amid the garbage on the right half.
export const HIDDEN_DOTS = [
  [16, 4], [18, 8], [21, 5], [25, 9], [17, 20], [22, 23], [26, 26], [19, 29], [24, 32],
];

// The corruption is video RAM holding tile and colour numbers that were never
// meant to be there, so it is drawn the same way: arbitrary codes into the
// same graphics ROM and palette the rest of the screen uses. That is why the
// real kill screen is full of letters, score fragments, fruit and bits of
// maze rather than noise.
const COLOR_CODES = [0x01, 0x03, 0x05, 0x07, 0x09, 0x0f, 0x10, 0x14, 0x16, 0x18];

// Draw pseudo-random garbage tiles over columns [c0, c1). Used for the
// level-256 corruption and for the power-on uninitialized-VRAM screen.
export function drawGarbageTiles(ctx, c0, c1, seedIn, fillPct = 70) {
  let seed = seedIn | 0 || 0xC0DE;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed >> 7; // discard low bits (poor randomness in an LCG)
  };
  for (let r = 0; r < ROWS; r++) {
    for (let col = c0; col < c1; col++) {
      const roll = rnd() % 100;
      if (roll >= fillPct) continue; // some tiles stay black
      const colorCode = COLOR_CODES[rnd() % COLOR_CODES.length];
      // Skip the blank tile so the fill stays as dense as the original's.
      let code = rnd() % 256;
      if (code === 0x40) code = 0x41;
      drawRomTile(ctx, code, colorCode, col, r);
    }
  }
}

let cache = null;

export function drawKillScreenGarbage(ctx) {
  if (!cache) {
    cache = document.createElement('canvas');
    cache.width = COLS * TILE; cache.height = ROWS * TILE;
    drawGarbageTiles(cache.getContext('2d'), 14, COLS, 0xC0DE);
  }
  ctx.drawImage(cache, 0, 0);
}
