// Maze layout and tile queries.
// The 28x31 playfield (screen rows 3..33) encoded as ASCII:
//   '#' wall  '.' pellet  'o' energizer  '-' ghost house door  ' ' open path
// This tile layout reproduces the classic single-maze arrangement
// (244 dots total: 240 pellets + 4 energizers).

import { TILE, COLS, ROWS } from './constants.js';

export const MAZE_TOP = 3; // first maze row on screen
export const TUNNEL_ROW = 17;

const ASCII = [
  '############################',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#o####.#####.##.#####.####o#',
  '#.####.#####.##.#####.####.#',
  '#..........................#',
  '#.####.##.########.##.####.#',
  '#.####.##.########.##.####.#',
  '#......##....##....##......#',
  '######.##### ## #####.######',
  '     #.##### ## #####.#     ',
  '     #.##          ##.#     ',
  '     #.## ###--### ##.#     ',
  '######.## #      # ##.######',
  '      .   #      #   .      ',
  '######.## #      # ##.######',
  '     #.## ######## ##.#     ',
  '     #.##          ##.#     ',
  '     #.## ######## ##.#     ',
  '######.## ######## ##.######',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#.####.#####.##.#####.####.#',
  '#o..##.......  .......##..o#',
  '###.##.##.########.##.##.###',
  '###.##.##.########.##.##.###',
  '#......##....##....##......#',
  '#.##########.##.##########.#',
  '#.##########.##.##########.#',
  '#..........................#',
  '############################',
];

// The same maze as the board draws it, one background-ROM tile code per cell.
// The arcade builds its playfield from a tile set with pre-drawn corners and
// junctions rather than from generic wall blocks, so the double-line outline
// and its rounded corners come out of the artwork instead of being traced.
//
// Each letter below names one tile of that set (the mapping is the game's own,
// recovered from video RAM). Dots and energizers are drawn separately from the
// live dot grid, so their cells are left blank here.
const TILE_ASCII = [
  '0UUUUUUUUUUUU45UUUUUUUUUUUU1',
  'L............rl............R',
  'L.ebbf.ebbbf.rl.ebbbf.ebbf.R',
  'LPr  l.r   l.rl.r   l.r  lPR',
  'L.guuh.guuuh.gh.guuuh.guuh.R',
  'L..........................R',
  'L.ebbf.ef.ebbbbbbf.ef.ebbf.R',
  'L.guuh.rl.guuyxuuh.rl.guuh.R',
  'L......rl....rl....rl......R',
  '2BBBBf.rzbbf rl ebbwl.eBBBB3',
  '     L.rxuuh gh guuyl.R     ',
  '     L.rl          rl.R     ',
  '     L.rl mjs--tjn rl.R     ',
  'UUUUUh.gh i      q gh.gUUUUU',
  '      .   i      q   .      ',
  'BBBBBf.ef i      q ef.eBBBBB',
  '     L.rl okkkkkkp rl.R     ',
  '     L.rl          rl.R     ',
  '     L.rl ebbbbbbf rl.R     ',
  '0UUUUh.gh guuyxuuh gh.gUUUU1',
  'L............rl............R',
  'L.ebbf.ebbbf.rl.ebbbf.ebbf.R',
  'L.guyl.guuuh.gh.guuuh.rxuh.R',
  'LP..rl.......  .......rl..PR',
  '6bf.rl.ef.ebbbbbbf.ef.rl.eb8',
  '7uh.gh.rl.guuyxuuh.rl.gh.gu9',
  'L......rl....rl....rl......R',
  'L.ebbbbwzbbf.rl.ebbwzbbbbf.R',
  'L.guuuuuuuuh.gh.guuuuuuuuh.R',
  'L..........................R',
  '2BBBBBBBBBBBBBBBBBBBBBBBBBB3',
];

const TILE_FOR_CHAR = {
  '0': 0xd1, '1': 0xd0, '2': 0xd5, '3': 0xd4, '4': 0xfb, '5': 0xfa,
  '6': 0xd7, '7': 0xd9, '8': 0xd6, '9': 0xd8,
  U: 0xdb, L: 0xd3, R: 0xd2, B: 0xdc, b: 0xdf,
  e: 0xe7, f: 0xe6, g: 0xeb, h: 0xea, l: 0xe8, r: 0xe9, u: 0xe5,
  w: 0xf5, x: 0xf2, y: 0xf3, z: 0xf4,
  m: 0xed, n: 0xec, o: 0xef, p: 0xee, j: 0xdd,
  i: 0xd2, k: 0xdb, q: 0xd3, s: 0xf1, t: 0xf0,
  '-': 0xcf,  // ghost-house door
};
const BLANK_TILE = 0x40;

/** Background tile code per screen cell; 0x40 (blank) outside the maze. */
export const MAZE_TILES = (() => {
  const grid = [];
  for (let r = 0; r < ROWS; r++) grid.push(new Array(COLS).fill(BLANK_TILE));
  for (let i = 0; i < TILE_ASCII.length; i++) {
    for (let c = 0; c < COLS; c++) {
      const code = TILE_FOR_CHAR[TILE_ASCII[i][c]];
      if (code !== undefined) grid[i + MAZE_TOP][c] = code;
    }
  }
  return grid;
})();

// Junction tiles where ghosts may not choose to turn upward (chase/scatter
// only): in the corridor above the ghost house and on Pac's home row. These
// must be the junction tiles themselves — one row further up are plain
// vertical-corridor tiles, and banning "up" there would leave an upbound
// ghost with no legal exit at all (a two-tile bounce loop).
export const RESTRICTED_UP = new Set(['12,14', '15,14', '12,26', '15,26']);

export const DOOR_TILES = [[13, 15], [14, 15]];
export const HOUSE = {
  doorX: 112,          // pixel x of the door center (tile 13.5)
  doorY: 14 * TILE + 4, // pixel y just above the door (row 14 center)
  insideY: TUNNEL_ROW * TILE + 4, // pixel y of the home row inside the house
  pinkyX: 13.5 * TILE + 4 - 4,   // 112
  inkyX: 11.5 * TILE + 4 - 4,    // 96
  clydeX: 15.5 * TILE + 4 - 4,   // 128
};

export class Maze {
  constructor() {
    this.wall = [];   // [row][col] booleans, full 36-row screen space
    this.door = [];
    for (let r = 0; r < ROWS; r++) {
      this.wall.push(new Array(COLS).fill(false));
      this.door.push(new Array(COLS).fill(false));
    }
    for (let i = 0; i < ASCII.length; i++) {
      const row = ASCII[i];
      for (let c = 0; c < COLS; c++) {
        const ch = row[c];
        const r = i + MAZE_TOP;
        if (ch === '#') this.wall[r][c] = true;
        if (ch === '-') this.door[r][c] = true;
      }
    }
    this.reset();
  }

  // Rebuild dots for a fresh level. killScreen removes the right-half dots
  // except for the 9 "hidden" ones, making level 256 impossible to clear.
  reset(killScreen = false, hiddenDots = []) {
    this.dots = [];
    for (let r = 0; r < ROWS; r++) this.dots.push(new Array(COLS).fill(0));
    this.dotsLeft = 0;
    for (let i = 0; i < ASCII.length; i++) {
      for (let c = 0; c < COLS; c++) {
        const ch = ASCII[i][c];
        const r = i + MAZE_TOP;
        if (ch === '.' || ch === 'o') {
          if (killScreen && c >= 14) continue;
          this.dots[r][c] = ch === 'o' ? 2 : 1;
          this.dotsLeft++;
        }
      }
    }
    if (killScreen) {
      for (const [c, r] of hiddenDots) {
        if (!this.dots[r][c]) { this.dots[r][c] = 1; this.dotsLeft++; }
      }
    }
    this.totalDots = this.dotsLeft;
  }

  inBounds(c, r) { return c >= 0 && c < COLS && r >= 0 && r < ROWS; }

  isWall(c, r) {
    if (r === TUNNEL_ROW && (c < 0 || c >= COLS)) return false; // tunnel
    if (!this.inBounds(c, r)) return true;
    return this.wall[r][c];
  }

  isDoor(c, r) { return this.inBounds(c, r) && this.door[r][c]; }

  // Walkable for normal movement (door counts as a wall; the house state
  // machine moves ghosts through it explicitly).
  walkable(c, r) { return !this.isWall(c, r) && !this.isDoor(c, r); }

  inTunnelSlowZone(c, r) {
    return r === TUNNEL_ROW && (c <= 5 || c >= 22);
  }

  eatDotAt(c, r) {
    if (!this.inBounds(c, r)) return 0;
    const d = this.dots[r][c];
    if (d) { this.dots[r][c] = 0; this.dotsLeft--; }
    return d;
  }
}
