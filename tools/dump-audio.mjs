// Renders the game's sounds to a WAV so they can be listened to outside the
// browser.
//   node tools/dump-audio.mjs out.wav [name]
// With no name, writes every sound one after another with short gaps.

import { writeFileSync } from 'node:fs';
import { renderProgram, unpackDump, progSiren } from '../src/audio.js';
import { SND_PRELUDE, SND_DEAD } from '../src/romdata.js';

const RATE = 44100;

// Rebuilt here rather than exported from audio.js, which keeps its programs
// private to the engine. These mirror the register routines it uses.
const eatDot = (rising) => {
  const out = [];
  let f = rising ? 0x0700 : 0x1500;
  for (let t = 0; t < 5; t++) { out.push({ f, w: 2, v: 12 }); f += rising ? 0x300 : -0x300; }
  return out;
};
const eatGhost = () => [...Array(32)].map((_, t) => ({ f: t * 0x20, w: 5, v: 12 }));
const eatFruit = () => {
  const out = [];
  let f = 0x1600;
  for (let t = 0; t < 23; t++) { out.push({ f, w: 6, v: 15 }); f += t < 10 ? -0x200 : 0x200; }
  return out;
};
const frightened = () => [...Array(8)].map((_, t) => ({ f: 0x180 * (t + 1), w: 4, v: 10 }));
const repeat = (prog, times) => [...Array(times)].flatMap(() => prog);

const SOUNDS = {
  prelude: () => unpackDump(SND_PRELUDE, 2),
  death: () => unpackDump(SND_DEAD, 1),
  'eat-dot': () => [[...eatDot(false), ...eatDot(true), ...eatDot(false), ...eatDot(true)]],
  'eat-ghost': () => [eatGhost()],
  'eat-fruit': () => [eatFruit()],
  siren: () => [repeat(progSiren(0), 4)],
  'siren-stage4': () => [repeat(progSiren(4), 4)],
  frightened: () => [repeat(frightened(), 8)],
};

function wav(samples, rate) {
  const pcm = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    pcm.writeInt16LE(Math.round(v * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);   // PCM
  header.writeUInt16LE(1, 22);   // mono
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

const out = process.argv[2] || 'sounds.wav';
const only = process.argv[3];
const names = only ? [only] : Object.keys(SOUNDS);
if (only && !SOUNDS[only]) {
  console.error(`unknown sound "${only}"; try one of: ${Object.keys(SOUNDS).join(', ')}`);
  process.exit(1);
}

const parts = [];
const gap = new Float32Array(Math.round(RATE * 0.4));
for (const name of names) {
  const samples = renderProgram(SOUNDS[name](), RATE);
  console.log(`  ${name.padEnd(14)} ${(samples.length / RATE).toFixed(2)}s`);
  parts.push(samples, gap);
}
const total = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
let off = 0;
for (const p of parts) { total.set(p, off); off += p.length; }

writeFileSync(out, wav(total, RATE));
console.log(`wrote ${out} (${(total.length / RATE).toFixed(2)}s)`);
