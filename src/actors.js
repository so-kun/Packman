// Movement physics shared by Pac and the ghosts: pixel positions on an
// 8px tile grid, whole-pixel stepping with a fractional accumulator so tile
// centers are never skipped, tunnel wrap-around, and Pac's cornering.

import { TILE, COLS, BASE_SPEED, DIR, OPPOSITE } from './constants.js';
import { TUNNEL_ROW } from './maze.js';

export const CENTER = TILE / 2; // 4: pixel offset of a tile's center line

export function tileOf(px) { return Math.floor(px / TILE); }

export class Actor {
  constructor(maze) {
    this.maze = maze;
    this.x = 0; this.y = 0;
    this.dir = DIR.LEFT;
    this.accum = 0;
  }

  place(x, y, dir) { this.x = x; this.y = y; this.dir = dir; this.accum = 0; }

  get tileX() { return tileOf(this.x); }
  get tileY() { return tileOf(this.y); }

  atCenter() {
    return (Math.round(this.x) - CENTER) % TILE === 0 &&
           (Math.round(this.y) - CENTER) % TILE === 0 &&
           Math.round(this.x) === this.x && Math.round(this.y) === this.y;
  }

  centerOf(c, r) { return { x: c * TILE + CENTER, y: r * TILE + CENTER }; }

  canGo(dir) {
    return this.maze.walkable(this.tileX + dir.x, this.tileY + dir.y);
  }

  wrap() {
    if (this.tileY === TUNNEL_ROW) {
      if (this.x < -CENTER) this.x += (COLS + 1) * TILE;
      else if (this.x > COLS * TILE + CENTER) this.x -= (COLS + 1) * TILE;
    }
  }

  // Move up to speedPct of full speed this frame, in 1px steps.
  // onCenter() is called whenever the actor sits exactly on a tile center
  // (direction decisions happen there). Returns pixels actually moved.
  advance(speedPct, onCenter) {
    this.accum += speedPct * BASE_SPEED;
    let moved = 0;
    while (this.accum >= 1) {
      this.accum -= 1;
      if (this.atCenter() && onCenter) onCenter();
      if (!this.stepPixel()) { this.accum = 0; break; }
      moved++;
      this.wrap();
    }
    if (this.atCenter() && onCenter) onCenter();
    return moved;
  }

  // One 1px step along this.dir; blocked at a wall when centered. Returns
  // false if the actor could not move (Pac resting against a wall).
  stepPixel() {
    if (this.atCenter() && !this.canGo(this.dir)) return false;
    this.x += this.dir.x;
    this.y += this.dir.y;
    return true;
  }
}

// Player actor: buffered input direction plus arcade-style cornering (a
// perpendicular turn may begin before the tile center; the actor then moves
// on both axes at once until re-aligned, gaining a small distance advantage).
export class Pac extends Actor {
  constructor(maze) {
    super(maze);
    this.wantDir = DIR.LEFT;
    this.frame = 0;      // animation phase accumulator
    this.moving = false;
  }

  setWant(dir) { this.wantDir = dir; }

  advancePac(speedPct) {
    this.accum += speedPct * BASE_SPEED;
    let moved = 0;
    while (this.accum >= 1) {
      this.accum -= 1;
      if (!this.stepPac()) { this.accum = 0; break; }
      moved++;
      this.wrap();
    }
    this.moving = moved > 0;
    if (this.moving) this.frame += 0.35;
    return moved;
  }

  stepPac() {
    const w = this.wantDir;
    const perpendicular = w !== this.dir && (w.x * this.dir.x + w.y * this.dir.y) === 0;
    // Take a buffered turn as soon as it is legal from the current tile.
    if (w !== this.dir) {
      if (w === OPPOSITE[this.dir.name]) {
        this.dir = w; // reversing is always allowed
      } else if (perpendicular && this.canGo(w) && this.nearCenterOnAxis(w)) {
        this.dir = w;
      }
    }
    // Cornering: while mis-aligned on the perpendicular axis, close in on the
    // center line in the same step (diagonal movement).
    let offAxisFixed = false;
    if (this.dir.x !== 0) {
      const cy = this.tileY * TILE + CENTER;
      if (this.y !== cy) { this.y += Math.sign(cy - this.y); offAxisFixed = true; }
    } else {
      const cx = this.tileX * TILE + CENTER;
      if (this.x !== cx) { this.x += Math.sign(cx - this.x); offAxisFixed = true; }
    }
    if (this.atCenter() && !this.canGo(this.dir)) return offAxisFixed;
    // Don't overshoot into a wall between centers.
    if (!this.centeredOnAxis() || this.canGo(this.dir)) {
      const beforeCenter = this.beforeCenterAlongDir();
      if (beforeCenter || this.canGo(this.dir)) {
        this.x += this.dir.x;
        this.y += this.dir.y;
        return true;
      }
      return offAxisFixed;
    }
    return offAxisFixed;
  }

  // True when still approaching the current tile's center along this.dir.
  beforeCenterAlongDir() {
    if (this.dir.x !== 0) {
      const cx = this.tileX * TILE + CENTER;
      return (cx - this.x) * this.dir.x > 0;
    }
    const cy = this.tileY * TILE + CENTER;
    return (cy - this.y) * this.dir.y > 0;
  }

  centeredOnAxis() {
    if (this.dir.x !== 0) return this.x === this.tileX * TILE + CENTER;
    return this.y === this.tileY * TILE + CENTER;
  }

  // A perpendicular turn is allowed within 4px of the tile center.
  nearCenterOnAxis(w) {
    if (w.x !== 0) {
      const cy = this.tileY * TILE + CENTER;
      return Math.abs(this.y - cy) <= 4 && this.maze.walkable(this.tileX + w.x, this.tileY);
    }
    const cx = this.tileX * TILE + CENTER;
    return Math.abs(this.x - cx) <= 4 && this.maze.walkable(this.tileX, this.tileY + w.y);
  }
}
