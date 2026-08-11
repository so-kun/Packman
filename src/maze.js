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
