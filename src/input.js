// Keyboard (arrows / WASD) and touch-swipe input.

import { DIR } from './constants.js';

export class Input {
  constructor(target = window) {
    this.dir = null;        // last requested direction
    this.startPressed = false;
    this.mutePressed = false;
    target.addEventListener('keydown', (e) => this.onKey(e), { passive: false });
    // touch swipe
    let sx = 0, sy = 0, active = false;
    target.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      sx = t.clientX; sy = t.clientY; active = true;
      this.startPressed = true;
    }, { passive: true });
    target.addEventListener('touchmove', (e) => {
      if (!active) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) < 18 && Math.abs(dy) < 18) return;
      if (Math.abs(dx) > Math.abs(dy)) this.dir = dx > 0 ? DIR.RIGHT : DIR.LEFT;
      else this.dir = dy > 0 ? DIR.DOWN : DIR.UP;
      sx = t.clientX; sy = t.clientY;
    }, { passive: true });
    target.addEventListener('touchend', () => { active = false; }, { passive: true });
  }

  onKey(e) {
    switch (e.key) {
      case 'ArrowUp': case 'w': case 'W': this.dir = DIR.UP; break;
      case 'ArrowDown': case 's': case 'S': this.dir = DIR.DOWN; break;
      case 'ArrowLeft': case 'a': case 'A': this.dir = DIR.LEFT; break;
      case 'ArrowRight': case 'd': case 'D': this.dir = DIR.RIGHT; break;
      case 'Enter': case ' ': this.startPressed = true; break;
      case 'm': case 'M': this.mutePressed = true; break;
      default: return;
    }
    e.preventDefault();
  }

  consumeStart() {
    const v = this.startPressed;
    this.startPressed = false;
    return v;
  }

  consumeMute() {
    const v = this.mutePressed;
    this.mutePressed = false;
    return v;
  }
}
