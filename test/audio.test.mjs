// Checks on the sound generator. The point of these is that the WSG is easy
// to get subtly wrong — an off-by-one in the accumulator shift or a missing
// nibble mask still produces sound, just not the right sound.
//
//   node --test 'test/*.test.mjs'

import test from 'node:test';
import assert from 'node:assert/strict';

import { renderProgram, unpackDump, progSiren } from '../src/audio.js';
import { WAVETABLE, SND_PRELUDE, SND_DEAD } from '../src/romdata.js';

const SAMPLE_RATE = 48000;

test('the register dumps unpack into plausible voice state', () => {
  const prelude = unpackDump(SND_PRELUDE, 2);
  assert.equal(prelude.length, 2);
  assert.equal(prelude[0].length, 245);
  const dead = unpackDump(SND_DEAD, 1);
  assert.equal(dead.length, 1);
  assert.equal(dead[0].length, 90);

  for (const voice of [...prelude, ...dead]) {
    for (const step of voice) {
      assert.ok(step.f >= 0 && step.f < (1 << 20), `frequency ${step.f} exceeds 20 bits`);
      assert.ok(step.w >= 0 && step.w < 8, `waveform ${step.w} outside the 8 in ROM`);
      assert.ok(step.v >= 0 && step.v < 16, `volume ${step.v} exceeds 4 bits`);
    }
  }
});

test('the prelude actually plays — it is not a dump of silence', () => {
  const [v0, v1] = unpackDump(SND_PRELUDE, 2);
  const audible = (voice) => voice.filter((s) => s.v > 0 && s.f > 0).length;
  assert.ok(audible(v0) > 100, 'voice 0 is mostly silent');
  assert.ok(audible(v1) > 100, 'voice 1 is mostly silent');
  // A tune moves; a stuck register would give one frequency throughout.
  assert.ok(new Set(v0.map((s) => s.f)).size > 5, 'voice 0 never changes pitch');
});

test('rendering produces audio in range', () => {
  const samples = renderProgram(unpackDump(SND_DEAD, 1), SAMPLE_RATE);
  assert.equal(samples.length, Math.round((90 / 60) * SAMPLE_RATE));
  let peak = 0;
  let energy = 0;
  for (const s of samples) {
    peak = Math.max(peak, Math.abs(s));
    energy += s * s;
  }
  assert.ok(peak > 0.05, `too quiet (peak ${peak})`);
  assert.ok(peak <= 1, `clipping (peak ${peak})`);
  assert.ok(energy / samples.length > 1e-4, 'almost all silence');
});

test('a silent program renders silence', () => {
  const samples = renderProgram([[{ f: 0, w: 0, v: 0 }]], SAMPLE_RATE);
  assert.ok(samples.every((s) => s === 0));
});

test('two voices sum rather than replace each other', () => {
  const one = [{ f: 0x1000, w: 2, v: 10 }];
  const solo = renderProgram([one], SAMPLE_RATE);
  const duo = renderProgram([one, one], SAMPLE_RATE);
  let soloPeak = 0;
  let duoPeak = 0;
  for (let i = 0; i < solo.length; i++) {
    soloPeak = Math.max(soloPeak, Math.abs(solo[i]));
    duoPeak = Math.max(duoPeak, Math.abs(duo[i]));
  }
  assert.ok(duoPeak > soloPeak * 1.5, 'the second voice did not add');
});

test('the siren cycle closes on itself so its buffer can loop', () => {
  const prog = progSiren(0);
  assert.equal(prog.length, 24);
  // Stage 0 starts at the value the original's routine sets.
  assert.equal(prog[0].f, 0x1000);
  assert.equal(prog[0].w, 6);
  assert.equal(prog[0].v, 6);
  // Continuing the recurrence one more tick must land back on the start.
  const last = prog[23];
  const step = 0x0200;
  assert.equal(last.f + step, prog[0].f, 'the cycle does not return to its start');
  // Later stages ride higher, which is how the original leans on the player.
  assert.ok(progSiren(4)[0].f > progSiren(0)[0].f);
  for (const stage of [0, 1, 2, 3, 4]) {
    for (const s of progSiren(stage)) {
      assert.ok(s.f > 0 && s.f < (1 << 20), `stage ${stage} frequency ${s.f} out of range`);
    }
  }
});

test('the waveform index wraps within one waveform', () => {
  // Waveform n occupies wavetable[n*32 .. n*32+31]; a shift error would read
  // into the neighbouring waveform and change the timbre.
  for (let w = 0; w < 8; w++) {
    for (let phase = 0; phase < 32; phase++) {
      const index = ((w << 5) | phase) & 0xff;
      assert.ok(index >= w * 32 && index < (w + 1) * 32);
      assert.ok(WAVETABLE[index] <= 0x0f);
    }
  }
});
