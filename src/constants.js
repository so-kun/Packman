// Game constants and per-level data tables.
// Values follow the publicly documented behavior of the 1980 arcade original
// (see README.md for sources). The colours below are read from the board's
// palette PROM; everything else here is written from the published tables.

import { cssColor, COLOR_CODE } from './rom.js';

export const TILE = 8;
export const COLS = 28;
export const ROWS = 36;
export const WIDTH = COLS * TILE;   // 224
export const HEIGHT = ROWS * TILE;  // 288
export const FPS = 60;

// 100% actor speed in pixels per frame (~75.76 px/s).
export const BASE_SPEED = 75.75757625 / 60;

export const DIR = {
  UP:    { x: 0, y: -1, name: 'UP' },
  LEFT:  { x: -1, y: 0, name: 'LEFT' },
  DOWN:  { x: 0, y: 1, name: 'DOWN' },
  RIGHT: { x: 1, y: 0, name: 'RIGHT' },
};
// Tie-break priority when choosing a direction: up, left, down, right.
export const DIR_PRIORITY = [DIR.UP, DIR.LEFT, DIR.DOWN, DIR.RIGHT];
export const OPPOSITE = { UP: DIR.DOWN, DOWN: DIR.UP, LEFT: DIR.RIGHT, RIGHT: DIR.LEFT };

export const SCORE = {
  PELLET: 10,
  ENERGIZER: 50,
  GHOST: [200, 400, 800, 1600],
};
export const EXTRA_LIFE_AT = 10000;
export const START_LIVES = 3;

// Fruit per level: [spriteKey, points]
const FRUITS = [
  ['cherry', 100], ['strawberry', 300], ['orange', 500], ['orange', 500],
  ['apple', 700], ['apple', 700], ['melon', 1000], ['melon', 1000],
  ['galaxian', 2000], ['galaxian', 2000], ['bell', 3000], ['bell', 3000],
  ['key', 5000],
];
export function fruitForLevel(level) {
  const f = FRUITS[Math.min(level - 1, FRUITS.length - 1)];
  return { sprite: f[0], points: f[1] };
}

// Fruit appears when 70 and 170 dots have been eaten; stays ~9.5 s.
export const FRUIT_DOTS = [70, 170];
export const FRUIT_TICKS = 570;
export const FRUIT_POS = { x: 14 * TILE, y: 20 * TILE + TILE / 2 }; // (13.5, 20)

// Per-level speeds (fractions of full speed), frightened durations and
// Cruise-Elroy dot thresholds, per the published tables.
export function levelSpec(level) {
  const s = {};
  if (level === 1) {
    Object.assign(s, { pac: 0.80, pacFright: 0.90, ghost: 0.75, ghostFright: 0.50, tunnel: 0.40 });
  } else if (level <= 4) {
    Object.assign(s, { pac: 0.90, pacFright: 0.95, ghost: 0.85, ghostFright: 0.55, tunnel: 0.45 });
  } else if (level <= 20) {
    Object.assign(s, { pac: 1.00, pacFright: 1.00, ghost: 0.95, ghostFright: 0.60, tunnel: 0.50 });
  } else {
    Object.assign(s, { pac: 0.90, pacFright: 0.90, ghost: 0.95, ghostFright: 0.60, tunnel: 0.50 });
  }
  // Cruise Elroy thresholds (dots remaining) and speeds.
  let e1;
  if (level === 1) e1 = 20;
  else if (level === 2) e1 = 30;
  else if (level <= 5) e1 = 40;
  else if (level <= 8) e1 = 50;
  else if (level <= 11) e1 = 60;
  else if (level <= 14) e1 = 80;
  else if (level <= 18) e1 = 100;
  else e1 = 120;
  s.elroy1Dots = e1;
  s.elroy2Dots = Math.floor(e1 / 2);
  if (level === 1) { s.elroy1 = 0.80; }
  else if (level <= 4) { s.elroy1 = 0.90; }
  else { s.elroy1 = 1.00; }
  s.elroy2 = s.elroy1 + 0.05;
  // Frightened time in seconds and number of white flashes.
  const frightTable = [
    [6, 5], [5, 5], [4, 5], [3, 5], [2, 5], [5, 5], [2, 5], [2, 5], [1, 3],
    [5, 5], [2, 5], [1, 3], [1, 3], [3, 5], [1, 3], [1, 3], [0, 0], [1, 3],
  ];
  const ft = level <= 18 ? frightTable[level - 1] : [0, 0];
  s.frightTicks = ft[0] * FPS;
  s.frightFlashes = ft[1];
  return s;
}

// Scatter/chase alternation schedule, in ticks. Last phase runs forever.
export function scatterChaseSchedule(level) {
  if (level === 1) {
    return [420, 1200, 420, 1200, 300, 1200, 300, Infinity];
  } else if (level <= 4) {
    return [420, 1200, 420, 1200, 300, 61980, 1, Infinity];
  }
  return [300, 1200, 300, 1200, 300, 62220, 1, Infinity];
}

// Ghost-house exit: personal dot limits per level, and the global counter
// limits used after a life is lost.
export function houseDotLimits(level) {
  if (level === 1) return { pinky: 0, inky: 30, clyde: 60 };
  if (level === 2) return { pinky: 0, inky: 0, clyde: 50 };
  return { pinky: 0, inky: 0, clyde: 0 };
}
export const GLOBAL_DOT_LIMITS = { pinky: 7, inky: 17, clyde: 32 };
export function noDotTimerTicks(level) { return (level <= 4 ? 4 : 3) * FPS; }

// Timing (ticks)
export const T = {
  READY_FIRST: 255,     // with intro tune (~4.2 s)
  READY: 120,
  GHOST_EAT_PAUSE: 60,
  DEATH_FREEZE: 60,
  DEATH_ANIM: 110,
  LEVEL_FREEZE: 60,
  LEVEL_FLASH: 132,     // 4 flashes
  GAME_OVER: 180,
  FRUIT_SCORE: 120,
};

// Colours are read out of the board's palette PROM rather than named here, so
// every one of them is a colour the hardware can actually produce. The pen
// numbers are which of a colour code's four entries is wanted: pen 0 is always
// transparent, and the remaining three are what a tile or sprite draws with.
export const COLORS = {
  wall: cssColor(COLOR_CODE.DOT, 3),
  door: cssColor(COLOR_CODE.PINKY, 3),
  dot: cssColor(COLOR_CODE.DOT, 1),
  pac: cssColor(COLOR_CODE.PACMAN, 3),
  blinky: cssColor(COLOR_CODE.BLINKY, 3),
  pinky: cssColor(COLOR_CODE.PINKY, 3),
  inky: cssColor(COLOR_CODE.INKY, 3),
  clyde: cssColor(COLOR_CODE.CLYDE, 3),
  frightBody: cssColor(COLOR_CODE.FRIGHTENED, 2),
  frightFace: cssColor(COLOR_CODE.FRIGHTENED, 3),
  flashBody: cssColor(COLOR_CODE.FRIGHTENED_BLINKING, 2),
  flashFace: cssColor(COLOR_CODE.FRIGHTENED_BLINKING, 3),
  eyeWhite: cssColor(COLOR_CODE.EYES, 1),
  pupil: cssColor(COLOR_CODE.EYES, 2),
  text: cssColor(COLOR_CODE.DEFAULT, 3),
  red: cssColor(COLOR_CODE.BLINKY, 3),
  cyan: cssColor(COLOR_CODE.INKY, 3),
  orange: cssColor(COLOR_CODE.CLYDE, 3),
  pink: cssColor(COLOR_CODE.PINKY, 3),
  yellow: cssColor(COLOR_CODE.PACMAN, 3),
  peach: cssColor(COLOR_CODE.DOT, 1),
};
