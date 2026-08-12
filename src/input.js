// Keyboard (arrows / WASD) and touch-swipe input.

import { DIR } from './constants.js';

export class Input {
  constructor(target = window) {
    this.dir = null;        // last requested direction, held until replaced
    // Menus need one event per press rather than a held direction, so the
    // presses are queued separately from `dir` instead of reading it.
    this.dirPresses = [];
    this.startPressed = false;
    this.coinPressed = false;
    this.mutePressed = false;
    target.addEventListener('keydown', (e) => this.onKey(e), { passive: false });
    // touch swipe; a plain tap doubles as coin slot + start button
    this.tapPressed = false;
    let sx = 0, sy = 0, active = false;
    target.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      sx = t.clientX; sy = t.clientY; active = true;
      this.tapPressed = true;
    }, { passive: true });
    target.addEventListener('touchmove', (e) => {
      if (!active) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) < 18 && Math.abs(dy) < 18) return;
      if (Math.abs(dx) > Math.abs(dy)) this.dir = dx > 0 ? DIR.RIGHT : DIR.LEFT;
      else this.dir = dy > 0 ? DIR.DOWN : DIR.UP;
      this.pushDir(this.dir);
      sx = t.clientX; sy = t.clientY;
    }, { passive: true });
    target.addEventListener('touchend', () => { active = false; }, { passive: true });
  }

  /** Queue one directional press, bounded so a held key cannot pile up. */
  pushDir(dir) {
    this.dirPresses.push(dir);
    if (this.dirPresses.length > 8) this.dirPresses.shift();
  }

  onKey(e) {
    switch (e.key) {
      case 'ArrowUp': case 'w': case 'W': this.dir = DIR.UP; this.pushDir(DIR.UP); break;
      case 'ArrowDown': case 's': case 'S': this.dir = DIR.DOWN; this.pushDir(DIR.DOWN); break;
      case 'ArrowLeft': case 'a': case 'A': this.dir = DIR.LEFT; this.pushDir(DIR.LEFT); break;
      case 'ArrowRight': case 'd': case 'D': this.dir = DIR.RIGHT; this.pushDir(DIR.RIGHT); break;
      case 'Enter': case ' ': this.startPressed = true; break;
      case '5': case 'c': case 'C': this.coinPressed = true; break;
      case 'm': case 'M': this.mutePressed = true; break;
      default: return;
    }
    e.preventDefault();
  }

  /**
   * Drop everything queued or latched. Worth doing when a menu opens: the
   * direction queue fills up during play (nothing reads it there, the player
   * uses `dir`), and without this the first thing a menu sees is whichever way
   * the player happened to be running when they died.
   */
  flush() {
    this.dirPresses.length = 0;
    this.startPressed = false;
    this.tapPressed = false;
  }

  /** The oldest unread directional press, or null. */
  consumeDir() {
    return this.dirPresses.shift() ?? null;
  }

  consumeStart() {
    const v = this.startPressed;
    this.startPressed = false;
    return v;
  }

  consumeCoin() {
    const v = this.coinPressed;
    this.coinPressed = false;
    return v;
  }

  consumeTap() {
    const v = this.tapPressed;
    this.tapPressed = false;
    return v;
  }

  consumeMute() {
    const v = this.mutePressed;
    this.mutePressed = false;
    return v;
  }
}
