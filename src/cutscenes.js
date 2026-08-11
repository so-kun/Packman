// The three "coffee break" intermissions, played after boards 2, 5 and
// 9/13/17: (1) the chase reverses with a giant Pac, (2) the red ghost snags
// his cloak on a nail, (3) the patched ghost returns... exposed.

import { WIDTH, TILE, COLORS, DIR } from './constants.js';
import { GSTATE } from './ghosts.js';

const ROW_Y = 17 * TILE + 4;

export function cutsceneForLevel(level) {
  if (level === 2) return 1;
  if (level === 5) return 2;
  if (level >= 9 && (level - 9) % 4 === 0) return 3;
  return 0;
}

export class Cutscene {
  constructor(index, renderer, audio) {
    this.index = index;
    this.r = renderer;
    this.audio = audio;
    this.t = 0;
    this.duration = index === 1 ? 640 : 620;
    audio.setLoop('none');
    audio.intermission();
  }

  get done() { return this.t >= this.duration; }

  update() { this.t += 1; }

  draw() {
    const r = this.r, ctx = r.ctx;
    // The coffee breaks play on an empty screen: the original clears the
    // playfield and leaves only the score row and the counters at the edges.
    r.clear();
    r.drawHud({ score: this.score, ...this.hud });
    const t = this.t;
    if (this.index === 1) this.drawCut1(ctx, r, t);
    else if (this.index === 2) this.drawCut2(ctx, r, t);
    else this.drawCut3(ctx, r, t);
  }

  ghostSprite(name, dirName, t) {
    return this.r.sprites.ghost[name][dirName][(t >> 3) & 1];
  }

  pacSprite(dirName, t, giant = false) {
    const set = giant ? this.r.sprites.pacGiant : this.r.sprites.pac;
    return set[dirName][(t >> 3) & 1];
  }

  drawCut1(ctx, r, t) {
    if (t < 300) {
      // ghost chases pac right-to-left
      const pacX = WIDTH + 20 - t * 1.35;
      const gX = pacX + 40;
      r.blit(this.pacSprite('LEFT', t), pacX, ROW_Y);
      r.blit(this.ghostSprite('blinky', 'LEFT', t), gX, ROW_Y);
    } else {
      // giant pac chases the frightened ghost back
      const tt = t - 300;
      const gX = -20 + tt * 1.35;
      const pacX = gX - 50;
      r.blit(this.r.sprites.fright[(t >> 3) & 1], gX, ROW_Y);
      r.blit(this.pacSprite('RIGHT', t, true), pacX, ROW_Y);
    }
  }

  drawCut2(ctx, r, t) {
    const nailX = WIDTH / 2;
    // the nail
    ctx.fillStyle = COLORS.text;
    ctx.fillRect(nailX, ROW_Y - 10, 2, 8);
    ctx.fillRect(nailX - 2, ROW_Y - 12, 6, 2);
    const pacX = WIDTH + 20 - Math.min(t, 420) * 1.2;
    r.blit(this.pacSprite('LEFT', t), pacX, ROW_Y);
    // ghost catches the cloak on the nail and stretches it
    let gX;
    if (t < 210) gX = WIDTH + 60 - t * 1.2;
    else gX = Math.max(nailX + 8, WIDTH + 60 - 210 * 1.2 - (t - 210) * 0.25);
    r.blit(this.ghostSprite('blinky', 'LEFT', t), gX, ROW_Y);
    if (t >= 210) {
      // stretched cloak between nail and ghost
      ctx.fillStyle = COLORS.blinky;
      const x0 = nailX + 2, x1 = gX - 6;
      if (x1 > x0) {
        ctx.fillRect(x0, ROW_Y + 2, x1 - x0, 2);
        ctx.fillRect(x0, ROW_Y + 5, Math.max(0, (x1 - x0) * 0.6), 1);
      }
      if (t > 480) {
        // the rip: torn patch of cloak left hanging
        ctx.fillRect(x0, ROW_Y - 1, 4, 8);
      }
    }
  }

  drawCut3(ctx, r, t) {
    if (t < 300) {
      // patched ghost chases pac
      const pacX = WIDTH + 20 - t * 1.35;
      const gX = pacX + 44;
      r.blit(this.pacSprite('LEFT', t), pacX, ROW_Y);
      r.blit(this.ghostSprite('blinky', 'LEFT', t), gX, ROW_Y);
      // safety-pin patch
      ctx.fillStyle = COLORS.text;
      ctx.fillRect(gX + 2, ROW_Y + 2, 4, 1);
      ctx.fillRect(gX + 4, ROW_Y, 1, 4);
    } else {
      // the ghost slinks back the other way, out of costume
      const tt = t - 300;
      const gX = -20 + tt * 1.1;
      ctx.fillStyle = COLORS.blinky;
      ctx.fillRect(gX - 6, ROW_Y - 2, 12, 6);
      ctx.fillRect(gX - 8, ROW_Y, 3, 3);
      ctx.fillStyle = COLORS.eyeWhite;
      ctx.fillRect(gX - 2, ROW_Y - 1, 2, 2);
      ctx.fillRect(gX + 2, ROW_Y - 1, 2, 2);
    }
  }
}

export { GSTATE, DIR };
