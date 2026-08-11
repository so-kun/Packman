// Renders the game's sounds to a WAV so they can be listened to outside the
// browser.
//   node tools/dump-audio.mjs out.wav [name]
// With no name, writes every sound one after another with short gaps.

import { writeFileSync } from 'node:fs';
import { renderProgram, progSiren, SOUND_PROGRAMS } from '../src/audio.js';

const RATE = 44100;

const repeat = (prog, times) => [...Array(times)].flatMap(() => prog);

const SOUNDS = {
  ...SOUND_PROGRAMS,
  siren: () => [repeat(progSiren(0), 4)],
  'siren-stage4': () => [repeat(progSiren(4), 4)],
  fright: () => [repeat(SOUND_PROGRAMS.fright()[0], 8)],
  eyes: () => [repeat(SOUND_PROGRAMS.eyes()[0], 6)],
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
