// Ghost AI: per-ghost targeting (including the documented up-direction
// offset quirk shared by Pinky and Inky), scatter/chase scheduling with
// forced reversals, frightened pseudo-random turns, ghost-house dot
// counters, and Cruise Elroy.

import {
  TILE, DIR, DIR_PRIORITY, OPPOSITE, levelSpec,
} from './constants.js';
import { Actor, CENTER } from './actors.js';
import { RESTRICTED_UP, HOUSE, TUNNEL_ROW } from './maze.js';

export const MODE = { SCATTER: 'scatter', chase: 'chase', CHASE: 'chase' };
export const GSTATE = {
  IN_HOUSE: 'inHouse',
  LEAVING: 'leaving',
  OUTSIDE: 'outside',
  EYES: 'eyes',
  ENTERING: 'entering',
};

const SCATTER_TARGETS = {
  blinky: { x: 25, y: 0 },
  pinky: { x: 2, y: 0 },
  inky: { x: 27, y: 34 },
  clyde: { x: 0, y: 34 },
};

// Small deterministic PRNG for frightened direction choices.
let rngState = 0x2a6d;
export function seedRng(n) { rngState = (n | 0) || 0x2a6d; }
function rng() {
  rngState = (rngState * 1103515245 + 12345) & 0x7fffffff;
  return rngState;
}

export class Ghost extends Actor {
  constructor(maze, name) {
    super(maze);
    this.name = name; // blinky | pinky | inky | clyde
    this.state = GSTATE.IN_HOUSE;
    this.frightened = false;
    this.pendingReverse = false;
    this.dotCounter = 0;
    this.elroy = 0; // 0, 1 or 2 (blinky only)
    this.bobDir = 1;
  }

  resetFor(level) {
    this.frightened = false;
    this.pendingReverse = false;
    this.elroy = 0;
    if (this.name === 'blinky') {
      this.place(HOUSE.doorX, HOUSE.doorY, DIR.LEFT);
      this.state = GSTATE.OUTSIDE;
    } else {
      const x = this.name === 'pinky' ? HOUSE.pinkyX
        : this.name === 'inky' ? HOUSE.inkyX : HOUSE.clydeX;
      this.place(x, HOUSE.insideY, this.name === 'pinky' ? DIR.DOWN : DIR.UP);
      this.state = GSTATE.IN_HOUSE;
    }
  }

  scatterTarget() { return SCATTER_TARGETS[this.name]; }

  chaseTarget(pac, blinky) {
    const pt = { x: pac.tileX, y: pac.tileY };
    const pd = pac.dir;
    switch (this.name) {
      case 'blinky':
        return pt;
      case 'pinky': {
        const t = { x: pt.x + 4 * pd.x, y: pt.y + 4 * pd.y };
        if (pd === DIR.UP) t.x -= 4; // original's overflow quirk
        return t;
      }
      case 'inky': {
        const pivot = { x: pt.x + 2 * pd.x, y: pt.y + 2 * pd.y };
        if (pd === DIR.UP) pivot.x -= 2; // same quirk
        return {
          x: pivot.x + (pivot.x - blinky.tileX),
          y: pivot.y + (pivot.y - blinky.tileY),
        };
      }
      case 'clyde': {
        const dx = this.tileX - pt.x, dy = this.tileY - pt.y;
        return (dx * dx + dy * dy > 64) ? pt : this.scatterTarget();
      }
    }
    return pt;
  }

  currentTarget(game) {
    if (this.state === GSTATE.EYES) return { x: 13, y: 14 };
    if (this.elroy > 0 && this.state === GSTATE.OUTSIDE) {
      return this.chaseTarget(game.pac, game.blinky); // Elroy ignores scatter
    }
    return game.mode === MODE.SCATTER
      ? this.scatterTarget()
      : this.chaseTarget(game.pac, game.blinky);
  }

  speedPct(game) {
    const spec = game.spec;
    if (this.state === GSTATE.EYES || this.state === GSTATE.ENTERING) return 1.5;
    if (this.state === GSTATE.IN_HOUSE || this.state === GSTATE.LEAVING) return 0.45;
    if (this.maze.inTunnelSlowZone(this.tileX, this.tileY)) return spec.tunnel;
    if (this.frightened) return spec.ghostFright;
    if (this.name === 'blinky' && this.elroy === 2) return spec.elroy2;
    if (this.name === 'blinky' && this.elroy === 1) return spec.elroy1;
    return spec.ghost;
  }

  // --- movement -----------------------------------------------------------

  update(game) {
    switch (this.state) {
      case GSTATE.IN_HOUSE: this.bobInHouse(); break;
      case GSTATE.LEAVING: this.leaveHouse(); break;
      case GSTATE.ENTERING: this.enterHouse(); break;
      default: this.advance(this.speedPct(game), () => this.decide(game));
    }
  }

  bobInHouse() {
    const top = HOUSE.insideY - 4, bottom = HOUSE.insideY + 4;
    this.y += 0.45 * this.bobDir;
    if (this.y <= top) { this.y = top; this.bobDir = 1; this.dir = DIR.DOWN; }
    if (this.y >= bottom) { this.y = bottom; this.bobDir = -1; this.dir = DIR.UP; }
  }

  leaveHouse() {
    const speed = 0.6;
    if (Math.abs(this.x - HOUSE.doorX) > 0.5) {
      this.x += Math.sign(HOUSE.doorX - this.x) * speed;
      this.dir = this.x < HOUSE.doorX ? DIR.RIGHT : DIR.LEFT;
    } else if (this.y > HOUSE.doorY) {
      this.x = HOUSE.doorX;
      this.y = Math.max(HOUSE.doorY, this.y - speed);
      this.dir = DIR.UP;
    } else {
      this.place(HOUSE.doorX, HOUSE.doorY, DIR.LEFT);
      this.state = GSTATE.OUTSIDE;
    }
  }

  enterHouse() {
    const speed = 1.5;
    const homeX = this.name === 'inky' ? HOUSE.inkyX
      : this.name === 'clyde' ? HOUSE.clydeX : HOUSE.pinkyX;
    if (this.y < HOUSE.insideY) {
      this.x = HOUSE.doorX;
      this.y = Math.min(HOUSE.insideY, this.y + speed);
      this.dir = DIR.DOWN;
    } else if (Math.abs(this.x - homeX) > 1) {
      this.x += Math.sign(homeX - this.x) * speed;
      this.dir = this.x < homeX ? DIR.RIGHT : DIR.LEFT;
    } else {
      // Revived: leave again immediately.
      this.x = homeX; this.y = HOUSE.insideY;
      this.frightened = false;
      this.state = GSTATE.LEAVING;
    }
  }

  // Direction decision at a tile center.
  decide(game) {
    if (this.pendingReverse) {
      this.pendingReverse = false;
      const rev = OPPOSITE[this.dir.name];
      if (this.maze.walkable(this.tileX + rev.x, this.tileY + rev.y)) {
        this.dir = rev;
        return;
      }
    }
    const exits = [];
    for (const d of DIR_PRIORITY) {
      if (d === OPPOSITE[this.dir.name]) continue;
      if (!this.maze.walkable(this.tileX + d.x, this.tileY + d.y)) continue;
      if (d === DIR.UP && this.state !== GSTATE.EYES && !this.frightened &&
          RESTRICTED_UP.has(`${this.tileX},${this.tileY}`)) continue;
      exits.push(d);
    }
    if (exits.length === 0) {
      // Dead end (can only happen via reversal edge cases): turn back.
      this.dir = OPPOSITE[this.dir.name];
      return;
    }
    if (this.frightened && this.state === GSTATE.OUTSIDE) {
      this.dir = exits[rng() % exits.length];
      return;
    }
    const t = this.currentTarget(game);
    let best = exits[0], bestDist = Infinity;
    for (const d of exits) {
      const nx = this.tileX + d.x - t.x, ny = this.tileY + d.y - t.y;
      const dist = nx * nx + ny * ny;
      if (dist < bestDist) { bestDist = dist; best = d; }
    }
    this.dir = best;
    // Eyes arriving above the door start descending into the house.
    if (this.state === GSTATE.EYES &&
        this.tileY === 14 && Math.abs(this.x - HOUSE.doorX) <= 4 &&
        this.y === 14 * TILE + CENTER) {
      this.x = HOUSE.doorX;
      this.state = GSTATE.ENTERING;
    }
  }

  frighten() {
    if (this.state === GSTATE.EYES || this.state === GSTATE.ENTERING) return;
    this.frightened = true;
    if (this.state === GSTATE.OUTSIDE) this.pendingReverse = true;
  }

  eaten() {
    this.frightened = false;
    this.state = GSTATE.EYES;
    this.pendingReverse = false;
    // Snap to the tile center so pathing restarts cleanly.
    this.x = this.tileX * TILE + CENTER;
    this.y = this.tileY * TILE + CENTER;
  }
}

// House release logic: personal dot counters (one active ghost at a time in
// Pinky→Inky→Clyde order), the global counter used after a death, and the
// no-dot release timer.
export class HouseController {
  constructor(game) {
    this.game = game;
    this.reset(true);
  }

  reset(newLevel) {
    this.globalActive = false;
    this.globalCounter = 0;
    this.noDotTimer = 0;
    if (newLevel) {
      for (const g of this.game.ghostList()) g.dotCounter = 0;
    }
  }

  afterDeath() {
    this.globalActive = true;
    this.globalCounter = 0;
    this.noDotTimer = 0;
  }

  inHouseOrder() {
    return ['pinky', 'inky', 'clyde']
      .map(n => this.game.ghost(n))
      .filter(g => g.state === GSTATE.IN_HOUSE);
  }

  onDotEaten() {
    this.noDotTimer = 0;
    const limits = this.game.houseLimits;
    if (this.globalActive) {
      this.globalCounter++;
      const pinky = this.game.ghost('pinky');
      const inky = this.game.ghost('inky');
      const clyde = this.game.ghost('clyde');
      if (this.globalCounter === 7 && pinky.state === GSTATE.IN_HOUSE) this.release(pinky);
      if (this.globalCounter === 17 && inky.state === GSTATE.IN_HOUSE) this.release(inky);
      if (this.globalCounter === 32) {
        if (clyde.state === GSTATE.IN_HOUSE) {
          // Reaching 32 with Clyde still home reverts to personal counters.
          this.globalActive = false;
        }
      }
      return;
    }
    const waiting = this.inHouseOrder()[0];
    if (waiting) {
      waiting.dotCounter++;
      if (waiting.dotCounter >= limits[waiting.name]) this.release(waiting);
    }
  }

  tick() {
    // Immediate release for ghosts whose limit is already met.
    if (!this.globalActive) {
      const limits = this.game.houseLimits;
      const waiting = this.inHouseOrder()[0];
      if (waiting && waiting.dotCounter >= limits[waiting.name]) this.release(waiting);
    }
    this.noDotTimer++;
    if (this.noDotTimer >= this.game.noDotLimit) {
      this.noDotTimer = 0;
      const waiting = this.inHouseOrder()[0];
      if (waiting) this.release(waiting);
    }
  }

  release(ghost) {
    if (ghost.state === GSTATE.IN_HOUSE) ghost.state = GSTATE.LEAVING;
  }
}

export function makeGhosts(maze) {
  return {
    blinky: new Ghost(maze, 'blinky'),
    pinky: new Ghost(maze, 'pinky'),
    inky: new Ghost(maze, 'inky'),
    clyde: new Ghost(maze, 'clyde'),
  };
}

export function updateElroy(game) {
  const blinky = game.blinky;
  const spec = game.spec;
  const clyde = game.ghost('clyde');
  // Elroy is suspended after a death until Clyde has left the house.
  if (game.elroySuspended && clyde.state !== GSTATE.IN_HOUSE) {
    game.elroySuspended = false;
  }
  if (game.elroySuspended) { blinky.elroy = 0; return; }
  const left = game.maze.dotsLeft;
  if (left <= spec.elroy2Dots) blinky.elroy = 2;
  else if (left <= spec.elroy1Dots) blinky.elroy = 1;
  else blinky.elroy = 0;
}

export { levelSpec };
