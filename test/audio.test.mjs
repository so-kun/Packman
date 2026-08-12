// Checks on the sound generator. The point of these is that the WSG is easy
// to get subtly wrong — an off-by-one in the accumulator shift or a missing
// nibble mask still produces sound, just not the right sound.
//
//   node --test 'test/*.test.mjs'

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AudioEngine, renderProgram, unpackDump, progSiren, SOUND_PROGRAMS, WAVEFORM_CYCLES,
} from '../src/audio.js';
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

test('the mix has headroom for everything the chip can play at once', () => {
  // The prelude used to arrive at nearly twice full scale, because each voice
  // was normalised to 1.0 and two of them were summed. Anything that clips
  // here is heard as the limiter clamping down on the whole mix.
  const flatOut = (f, w, v) => [...Array(30)].map(() => ({ f, w, v }));
  const loudest = [flatOut(0x1000, 0, 15), flatOut(0x1400, 0, 15), flatOut(0x1800, 0, 15)];
  for (let voices = 1; voices <= 3; voices++) {
    const samples = renderProgram(loudest.slice(0, voices), SAMPLE_RATE);
    let peak = 0;
    for (const x of samples) peak = Math.max(peak, Math.abs(x));
    assert.ok(peak <= 1, `${voices} voices at full volume peak at ${peak.toFixed(3)}`);
  }
  // The real tunes have to fit too.
  for (const name of ['prelude', 'intermission', 'death']) {
    const samples = renderProgram(SOUND_PROGRAMS[name](), SAMPLE_RATE);
    let peak = 0;
    for (const x of samples) peak = Math.max(peak, Math.abs(x));
    assert.ok(peak <= 1, `${name} peaks at ${peak.toFixed(3)}`);
    assert.ok(peak > 0.1, `${name} is too quiet at ${peak.toFixed(3)}`);
  }
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

test('the siren matches the five measured stages and loops cleanly', () => {
  // Ranges measured off the five recordings, at the turn of each cycle.
  const expected = [
    { half: 12, low: 386, high: 928 },
    { half: 11, low: 485, high: 1099 },
    { half: 10, low: 577, high: 1247 },
    { half: 9, low: 716, high: 1431 },
    { half: 8, low: 855, high: 1582 },
  ];
  let previousLow = 0;
  expected.forEach((want, stage) => {
    const prog = progSiren(stage);
    assert.equal(prog.length, want.half * 2, `stage ${stage} period`);
    const hz = prog.map((s) => (s.f * 96000 * WAVEFORM_CYCLES[s.w]) / (1 << 20));
    assert.ok(prog.every((s) => s.w === 6 && s.v === 6), `stage ${stage} voice settings`);

    // Rises to the halfway point and falls back, so the ends meet.
    const peak = hz.indexOf(Math.max(...hz));
    assert.equal(peak, want.half, `stage ${stage} peaks at its half-period`);
    const step = prog[1].f - prog[0].f;
    assert.equal(prog[prog.length - 1].f - step, prog[0].f,
      `stage ${stage} does not join back up`);

    assert.ok(Math.abs(Math.min(...hz) - want.low) < 20,
      `stage ${stage} bottoms at ${Math.min(...hz).toFixed(0)} Hz, measured ${want.low}`);
    assert.ok(Math.abs(Math.max(...hz) - want.high) < 35,
      `stage ${stage} peaks at ${Math.max(...hz).toFixed(0)} Hz, measured ${want.high}`);

    // Each stage sits above the last: the siren leans on the player as the
    // board empties, and hurries as well as climbing.
    assert.ok(Math.min(...hz) > previousLow, `stage ${stage} should sit above stage ${stage - 1}`);
    previousLow = Math.min(...hz);
  });
  // The step grows by exactly 0x80 a stage.
  for (let stage = 1; stage < 5; stage++) {
    const before = progSiren(stage - 1);
    const after = progSiren(stage);
    assert.equal((after[1].f - after[0].f) - (before[1].f - before[0].f), 0x80);
  }
});

test('the extend fanfare is one struck pitch, not a tune', () => {
  const [prog] = SOUND_PROGRAMS.extraLife();
  const hz = prog.map((s) => (s.f * 96000 * WAVEFORM_CYCLES[s.w]) / (1 << 20));
  assert.ok(hz.every((v) => Math.abs(v - 374) < 8), 'the pitch never moves');
  assert.equal(prog.length % 12, 0, 'struck every twelve ticks');
  // Each strike starts loud and decays, which is the envelope measured.
  for (let i = 0; i < prog.length; i += 12) {
    assert.equal(prog[i].v, 15, `strike at ${i} should start at full volume`);
    for (let t = 1; t < 12; t++) {
      assert.ok(prog[i + t].v < prog[i + t - 1].v, `tick ${i + t} should decay`);
    }
  }
});

test('the waveform period table matches what is actually in the ROM', () => {
  // Half the waveforms complete more than one cycle inside their 32 samples,
  // so the pitch heard is a multiple of the frequency register. Getting this
  // wrong sounds like a working effect at the wrong octave, which is exactly
  // the kind of mistake that survives casual listening — so derive it from the
  // ROM here rather than trusting the constant.
  for (let w = 0; w < 8; w++) {
    let bestBin = 1;
    let best = 0;
    for (let k = 1; k < 16; k++) {
      let re = 0;
      let im = 0;
      for (let i = 0; i < 32; i++) {
        const sample = (WAVETABLE[(w << 5) | i] & 0x0f) - 8;
        re += sample * Math.cos((-2 * Math.PI * k * i) / 32);
        im += sample * Math.sin((-2 * Math.PI * k * i) / 32);
      }
      const mag = Math.hypot(re, im);
      if (mag > best) { best = mag; bestBin = k; }
    }
    assert.equal(WAVEFORM_CYCLES[w], bestBin,
      `waveform ${w} completes ${bestBin} cycles per table, not ${WAVEFORM_CYCLES[w]}`);
  }
});

test('the coin sound is the measured V, not a flat beep', () => {
  const [prog] = SOUND_PROGRAMS.credit();
  assert.equal(prog.length, 14);
  const hz = prog.map((s) => (s.f * 96000 * WAVEFORM_CYCLES[s.w]) / (1 << 20));
  // Falls for six ticks, sits on the bottom for one, then rises past where it
  // began — the shape measured off the recording.
  const bottom = hz.indexOf(Math.min(...hz));
  assert.equal(bottom, 5);
  for (let i = 1; i <= bottom; i++) assert.ok(hz[i] < hz[i - 1], `tick ${i} should fall`);
  assert.equal(hz[6], hz[5], 'the bottom is held for one tick');
  for (let i = 7; i < hz.length; i++) assert.ok(hz[i] > hz[i - 1], `tick ${i} should rise`);
  assert.ok(Math.abs(hz[0] - 633) < 15, `starts at ${hz[0].toFixed(0)} Hz`);
  assert.ok(Math.abs(hz[bottom] - 76) < 15, `bottoms at ${hz[bottom].toFixed(0)} Hz`);
  assert.ok(Math.abs(hz[hz.length - 1] - 856) < 20, `ends at ${hz[hz.length - 1].toFixed(0)} Hz`);
});

test('the eyes-returning sound is the measured falling sweep, and it loops', () => {
  const [prog] = SOUND_PROGRAMS.eyes();
  assert.equal(prog.length, 16, 'the original resets every 16 ticks');
  const hz = prog.map((s) => (s.f * 96000 * WAVEFORM_CYCLES[s.w]) / (1 << 20));
  for (let i = 1; i < hz.length; i++) {
    assert.ok(hz[i] < hz[i - 1], `tick ${i} should fall`);
  }
  // Measured off the recording: 2484 Hz down to 375, snapping back each cycle.
  assert.ok(Math.abs(hz[0] - 2484) < 25, `starts at ${hz[0].toFixed(0)} Hz`);
  assert.ok(Math.abs(hz[15] - 375) < 25, `ends at ${hz[15].toFixed(0)} Hz`);
  // A constant register step is what makes the sweep linear and the loop join.
  const steps = new Set(prog.slice(1).map((s, i) => prog[i].f - s.f));
  assert.equal(steps.size, 1, 'the register step should be constant');
});

test('the frightened sound keeps the original register ramp', () => {
  // This one is not a guess and must not drift: it matches a recording of the
  // machine at 283/560/844/1120/1408/1686/1971/2251 Hz.
  const [prog] = SOUND_PROGRAMS.fright();
  assert.equal(prog.length, 8);
  const hz = prog.map((s) => (s.f * 96000 * WAVEFORM_CYCLES[s.w]) / (1 << 20));
  const expected = [281, 563, 844, 1125, 1406, 1688, 1969, 2250];
  hz.forEach((v, i) => {
    assert.ok(Math.abs(v - expected[i]) < 12, `tick ${i}: ${v.toFixed(0)} Hz, expected ~${expected[i]}`);
  });
});

test('the coffee-break tune is the ROM sequence, two voices deep', () => {
  const voices = SOUND_PROGRAMS.intermission();
  assert.equal(voices.length, 2, 'bass and lead');
  const [bass, lead] = voices;
  assert.equal(bass.length, lead.length, 'both voices run the same length');
  assert.equal(bass.length, 640, 'one pass through the looping sequence');

  const hz = (s) => (s.f * 96000 * WAVEFORM_CYCLES[s.w]) / (1 << 20);
  // The bass sits around 180 Hz on waveform 2, the lead around 360 on
  // waveform 1 — the figures a recording of the machine shows.
  assert.equal(bass[0].w, 2);
  assert.equal(lead[0].w, 1);
  assert.ok(Math.abs(hz(bass[0]) - 180) < 5, `bass starts at ${hz(bass[0]).toFixed(0)} Hz`);
  assert.ok(Math.abs(hz(lead[0]) - 340) < 8, `lead starts at ${hz(lead[0]).toFixed(0)} Hz`);

  // Every note has to be a real semitone off the ROM's table, or the decode
  // has drifted: the table is 87..195 shifted left by a whole number of bits.
  const NOTE_TABLE = [87, 92, 97, 103, 109, 116, 123, 130, 138, 146, 154, 163, 173, 184, 195];
  for (const voice of voices) {
    for (const step of voice) {
      if (step.f === 0) continue;
      const base = step.w === 1 ? step.f >> 4 : step.f;
      const ok = NOTE_TABLE.some((n) => {
        for (let shift = 0; shift <= 8; shift++) if (n << shift === base) return true;
        return false;
      });
      assert.ok(ok, `frequency 0x${step.f.toString(16)} is not a table note`);
    }
  }

  // Both voices must actually play; a decode that fell off the end would
  // leave one of them silent.
  for (const [i, voice] of voices.entries()) {
    const sounding = voice.filter((s) => s.f > 0 && s.v > 0).length;
    assert.ok(sounding > 200, `voice ${i} sounds for only ${sounding} frames`);
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

// --- the browser's audio clock -------------------------------------------
//
// A tab that was in the background when the game loaded gets an AudioContext
// that is suspended and stays that way through the first keypress. Its clock
// is stopped, so anything started against it is not merely inaudible: it
// queues, and fires all at once whenever the context does start. This is what
// "no sound until I switched tabs" was.

/** Enough of an AudioContext to drive the engine's start/stop decisions. */
function fakeContext(state = 'suspended') {
  const started = [];
  return {
    state,
    sampleRate: 44100,
    started,
    createBuffer: (ch, len, rate) => ({
      length: len, sampleRate: rate, copyToChannel() {},
    }),
    createBufferSource() {
      const src = { buffer: null, loop: false, connect() { return src; },
                    start: () => started.push(src), stop() {} };
      return src;
    },
  };
}

function engineWith(ctx) {
  const engine = new AudioEngine();
  engine.ctx = ctx;
  engine.master = { connect() {}, gain: { value: 1 } };
  return engine;
}

test('nothing is emitted while the audio clock is stopped', () => {
  const ctx = fakeContext('suspended');
  const engine = engineWith(ctx);
  assert.equal(engine.live, false, 'a suspended context is not live');

  engine.setLoop('siren', 0);
  engine.waka();
  engine.credit();
  assert.equal(ctx.started.length, 0, 'sounds were queued against a stopped clock');
  // What the game asked for is still remembered, ready for the context waking.
  assert.equal(engine.loopMode, 'siren');
  assert.equal(engine.loopPlaying, null);
});

test('the loop starts by itself once the context wakes up', () => {
  const ctx = fakeContext('suspended');
  const engine = engineWith(ctx);
  engine.setLoop('siren', 2);
  assert.equal(ctx.started.length, 0);

  ctx.state = 'running';   // what coming back to the tab does
  engine.applyLoop();
  assert.equal(ctx.started.length, 1, 'the siren should start without further input');
  assert.equal(engine.loopPlaying, 'siren2');
  assert.equal(ctx.started[0].loop, true);
});

test('waking up repeatedly does not chop the loop into pieces', () => {
  // resume() runs on every gesture, so restarting the loop there would cut the
  // siren back to its beginning on every keypress.
  const ctx = fakeContext('running');
  const engine = engineWith(ctx);
  engine.setLoop('siren', 0);
  assert.equal(ctx.started.length, 1);
  for (let i = 0; i < 10; i++) engine.applyLoop();
  assert.equal(ctx.started.length, 1, 'the loop was restarted');

  // A genuine change of mode still swaps it.
  engine.setLoop('fright');
  assert.equal(ctx.started.length, 2);
  assert.equal(engine.loopPlaying, 'fright');
  engine.setLoop('none');
  assert.equal(engine.loopPlaying, null);
});
