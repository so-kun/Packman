// Entry point: fixed 60 Hz simulation with integer-scaled presentation.

import { WIDTH, HEIGHT, FPS } from './constants.js';
import { Game } from './game.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';

const canvas = document.getElementById('screen');
canvas.width = WIDTH;
canvas.height = HEIGHT;

const audio = new AudioEngine();
const input = new Input(window);
const game = new Game(canvas, input, audio);
window.__game = game; // debug/testing handle

// Unlock audio on any user gesture, and again whenever the page comes back
// into view. A tab that was in the background when the game loaded keeps its
// audio context suspended through the first keypress, which looks exactly like
// the sound being broken until you switch tabs and it starts working.
for (const ev of ['keydown', 'pointerdown', 'touchstart']) {
  window.addEventListener(ev, () => audio.resume(), { once: false, passive: true });
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) audio.resume();
});

function fitCanvas() {
  const scale = Math.max(1, Math.floor(Math.min(
    window.innerWidth / WIDTH, (window.innerHeight - 8) / HEIGHT,
  )));
  canvas.style.width = `${WIDTH * scale}px`;
  canvas.style.height = `${HEIGHT * scale}px`;
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

const STEP = 1000 / FPS;
let last = performance.now();
let acc = 0;

function frame(now) {
  acc += Math.min(100, now - last);
  last = now;
  while (acc >= STEP) {
    game.update();
    acc -= STEP;
  }
  game.draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
