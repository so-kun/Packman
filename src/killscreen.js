// Level-256 kill screen: the original's level counter is a single byte, and
// on the 256th board the fruit-drawing routine runs away, blanketing the
// right half of the screen with garbage tiles. Movement and walls still
// follow the normal maze data (only the video tiles were corrupted), but
// most right-half dots are gone — leaving too few to finish the board.

import { TILE, COLS, ROWS, COLORS } from './constants.js';
import { drawText } from './render.js';

export function isKillScreen(level) { return level % 256 === 0; }

// Nine dots survive amid the garbage on the right half.
export const HIDDEN_DOTS = [
  [16, 4], [18, 8], [21, 5], [25, 9], [17, 20], [22, 23], [26, 26], [19, 29], [24, 32],
];

// Deterministic pseudo-garbage: letters, digits and colored fragments.
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-/!."';
const PALETTE = [
  COLORS.red, COLORS.pink, COLORS.cyan, COLORS.orange,
  COLORS.yellow, COLORS.peach, COLORS.text, COLORS.wall,
];

let cache = null;

export function drawKillScreenGarbage(ctx) {
  if (!cache) {
    cache = document.createElement('canvas');
    cache.width = COLS * TILE; cache.height = ROWS * TILE;
    const c = cache.getContext('2d');
    let seed = 0xC0DE;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed >> 7; // discard low bits (poor randomness in an LCG)
    };
    for (let r = 0; r < ROWS; r++) {
      for (let col = 14; col < COLS; col++) {
        const roll = rnd() % 100;
        if (roll < 30) continue; // some tiles stay black
        const color = PALETTE[rnd() % PALETTE.length];
        if (roll < 82) {
          const ch = CHARS[rnd() % CHARS.length];
          drawText(c, ch, col, r, color);
        } else {
          // colored fragment blocks
          c.fillStyle = color;
          c.fillRect(col * TILE + (rnd() % 4), r * TILE + (rnd() % 4), 2 + (rnd() % 4), 2 + (rnd() % 3));
        }
      }
    }
  }
  ctx.drawImage(cache, 0, 0);
}
