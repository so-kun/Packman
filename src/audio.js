// Sound: an emulation of the board's Namco 3-voice wavetable generator (WSG),
// driven by the same register values the original writes.
//
// The WSG has no oscillators. Each voice owns a 20-bit accumulator that is
// advanced by a frequency register at 96 kHz; the top five bits of that
// accumulator index one of eight 32-entry waveforms held in a PROM, and the
// 4-bit sample it finds there is multiplied by a 4-bit volume. That is the
// whole chip. Because the waveforms come from ROM (src/romdata.js) and the
// register values come from the game, the timbre here is the arcade timbre
// rather than a synthesis that approximates it.
//
// Sounds are rendered to AudioBuffers on first use and then played back. The
// two looping sounds have exact periods in game ticks, so their buffers loop
// seamlessly. See docs/fidelity-checklist.md for what is taken from the
// original and what is still guessed.

import { WAVETABLE, SND_PRELUDE, SND_DEAD } from './romdata.js';
import { SND_INTERMISSION } from './musicdata.js';

const TICK_HZ = 60;
const WSG_CLOCK = 96000;          // accumulator updates per second
const ACC_BITS = 20;              // one waveform cycle per full accumulator wrap
const OVERSAMPLE = 4;
const NUM_VOICES = 3;             // what the chip mixes into its single output
// Dividing by three costs the same 3.5 dB everywhere, so the bus gives it
// back. All three voices flat out would reach 1.5 and clip, but that never
// happens: the loudest real moment is the siren under an effect, which lands
// near 0.7. The limiter stays as a backstop rather than doing the work.
const MASTER_GAIN = 1.5;

/**
 * How many cycles each of the eight ROM waveforms completes inside its 32
 * samples. Four of them are not single-cycle, so the pitch heard is a multiple
 * of what the frequency register would suggest — waveform 5 sounds fifteen
 * times higher than its register value reads. The original's own routines pick
 * register values that already account for this; anything written here has to
 * divide by it. `test/audio.test.mjs` re-derives this table from the ROM.
 */
export const WAVEFORM_CYCLES = [1, 1, 2, 1, 8, 15, 1, 2];

// ---------------------------------------------------------------------------
// Per-tick register programs
//
// Each entry is one 60 Hz tick: {f} frequency register, {w} waveform number,
// {v} volume. These follow the original's own sound routines.

/** Eating a dot: alternate ticks sweep down from 0x1500 and up from 0x0700. */
function progEatDot(rising) {
  const out = [];
  let f = rising ? 0x0700 : 0x1500;
  const step = rising ? 0x0300 : -0x0300;
  for (let t = 0; t < 5; t++) {
    out.push({ f, w: 2, v: 12 });
    f += step;
  }
  return out;
}

/** Eating a ghost: a rising slurp over 32 ticks. */
function progEatGhost() {
  const out = [];
  for (let t = 0; t < 32; t++) out.push({ f: t * 0x20, w: 5, v: 12 });
  return out;
}

/** Eating fruit: down for 11 ticks, then back up. */
function progEatFruit() {
  const out = [];
  let f = 0x1600;
  for (let t = 0; t < 23; t++) {
    out.push({ f, w: 6, v: 15 });
    f += t < 10 ? -0x0200 : 0x0200;
  }
  return out;
}

/**
 * The siren, measured from recordings of all five stages. As the board empties
 * it both climbs and hurries: the half-period shortens by a tick per stage
 * while the per-tick step grows by exactly 0x80, which is regular enough to be
 * the board's own scheme rather than a coincidence.
 *
 *   stage  bottom   step   half-period   measured range
 *     0    0x1080  0x0200      12          386 - 928 Hz
 *     1    0x14B0  0x0280      11          485 - 1099
 *     2    0x18A0  0x0300      10          577 - 1247
 *     3    0x1E80  0x0380       9          716 - 1431
 *     4    0x2480  0x0400       8          855 - 1582
 *
 * Rising then falling over 2x the half-period returns to the start, so the
 * rendered buffer loops without a seam.
 */
const SIREN_BOTTOM = [0x1080, 0x14b0, 0x18a0, 0x1e80, 0x2480];

export function progSiren(stage) {
  const s = Math.max(0, Math.min(4, stage));
  const bottom = SIREN_BOTTOM[s];
  const step = 0x0200 + s * 0x0080;
  const half = 12 - s;
  const out = [];
  for (let t = 0; t < half * 2; t++) {
    const rise = t < half ? t : half * 2 - t;
    out.push({ f: bottom + step * rise, w: 6, v: 6 });
  }
  return out;
}

/** Frightened: a rising ramp that resets every 8 ticks. */
function progFrightened() {
  const out = [];
  for (let t = 0; t < 8; t++) out.push({ f: 0x0180 * (t + 1), w: 4, v: 10 });
  return out;
}

// --- sounds the original has but no register capture covers ----------------
// These use the ROM waveforms and the same register model, but their contours
// are chosen by ear rather than taken from the game.

/**
 * Eyes flying home. Measured off a recording: a sawtooth sweep that falls from
 * about 2484 Hz to 375 Hz over sixteen ticks and snaps straight back, so the
 * buffer loops on its own period. Waveform 6 fits the recording's spectrum
 * best of the eight (229 against 285 for the next candidate), and being
 * single-cycle its register value is the pitch.
 */
function progEyes() {
  const out = [];
  let f = 0x6a00;
  for (let t = 0; t < 16; t++) {
    out.push({ f, w: 6, v: 6 });
    f -= 0x0600;
  }
  return out;
}

/**
 * The extend fanfare at 10000 points. Measured: one pitch throughout, about
 * 374 Hz on waveform 3, struck every twelve ticks and decaying between
 * strikes — a repeated blip rather than a tune.
 */
function progExtraLife() {
  const out = [];
  for (let i = 0; i < 9; i++) {
    for (let t = 0; t < 12; t++) out.push({ f: 0x1000, w: 3, v: 15 - t });
  }
  return out;
}

/**
 * Coin insert. Measured off a recording of the machine rather than guessed: a
 * V that falls from about 633 Hz to 76 Hz over six ticks and climbs back past
 * its start to about 856 Hz over eight, stepping by a constant register
 * amount throughout. Waveform 2 matches the recording's harmonic ratios
 * closely (0.17 away against 0.49 for the next candidate), and being a
 * two-cycle waveform it sounds an octave above its register value.
 * `tools/measure-sound.mjs` produces both measurements.
 */
function progCredit() {
  const START = 0x0d80;
  const STEP = 0x0260;
  const out = [];
  let f = START;
  for (let t = 0; t < 6; t++) { out.push({ f, w: 2, v: 12 }); f -= STEP; }
  // The recording sits on the bottom for one extra tick before turning round.
  f += STEP;
  for (let t = 0; t < 8; t++) { out.push({ f, w: 2, v: 12 }); f += STEP; }
  return out;
}

/**
 * The coffee-break tune, decoded out of the program ROM's music sequences
 * rather than composed (see tools/extract-music.mjs). Stored as note events;
 * expanded here to the per-tick registers the renderer wants.
 */
function progIntermission() {
  return SND_INTERMISSION.map((voice) => {
    const out = [];
    for (const [f, w, v, frames] of voice) {
      for (let t = 0; t < frames; t++) out.push({ f, w, v });
    }
    return out;
  });
}

// ---------------------------------------------------------------------------
// Register dumps
//
// One 32-bit word per voice per tick: bits 0-19 frequency, 24-26 waveform,
// 28-31 volume. The prelude drives two voices, the death sound one.

export function unpackDump(dump, numVoices) {
  const ticks = dump.length / numVoices;
  const voices = [];
  for (let v = 0; v < numVoices; v++) voices.push([]);
  for (let t = 0; t < ticks; t++) {
    for (let v = 0; v < numVoices; v++) {
      const word = dump[t * numVoices + v];
      voices[v].push({
        f: word & 0xfffff,
        w: (word >> 24) & 7,
        v: (word >> 28) & 0xf,
      });
    }
  }
  return voices;
}

// ---------------------------------------------------------------------------
// Synthesis

/**
 * Render one or more per-tick register programs into interleaved mono samples.
 * The accumulator arithmetic mirrors the hardware; oversampling then averaging
 * takes the edge off the aliasing a 32-step wavetable would otherwise produce
 * at browser sample rates.
 */
export function renderProgram(voicePrograms, sampleRate) {
  const ticks = Math.max(...voicePrograms.map((p) => p.length));
  const samplesPerTick = sampleRate / TICK_HZ;
  const total = Math.round(ticks * samplesPerTick);
  const out = new Float32Array(total);
  const rate = sampleRate * OVERSAMPLE;
  const accMask = (1 << ACC_BITS) - 1;

  for (const prog of voicePrograms) {
    let acc = 0;
    for (let i = 0; i < total; i++) {
      const step = prog[Math.min(Math.floor(i / samplesPerTick), prog.length - 1)];
      if (!step || step.v === 0 || step.f === 0) continue;
      // Advance the accumulator once per oversampled step and average.
      const inc = (step.f * WSG_CLOCK) / rate;
      let sum = 0;
      for (let k = 0; k < OVERSAMPLE; k++) {
        acc = (acc + inc) % (accMask + 1);
        const index = (((step.w & 7) << 5) | ((acc >> 15) & 0x1f)) & 0xff;
        sum += (WAVETABLE[index] & 0x0f) - 8;
      }
      // 8 is the sample magnitude, 15 the maximum volume, and three is how
      // many voices the chip sums into one output. Dividing by all three is
      // what keeps a two-voice tune from arriving at almost twice full scale
      // and leaning on the limiter for the whole of its four seconds.
      out[i] += (sum / OVERSAMPLE) * step.v / (8 * 15 * NUM_VOICES);
    }
  }
  return out;
}

/**
 * Every sound as a list of per-tick register programs, one per voice. Shared
 * with the tools and tests so a change here cannot drift from what is measured
 * or listened to. The siren is not here because it is per-stage.
 */
export const SOUND_PROGRAMS = {
  prelude: () => unpackDump(SND_PRELUDE, 2),
  death: () => unpackDump(SND_DEAD, 1),
  intermission: () => progIntermission(),
  wakaUp: () => [progEatDot(true)],
  wakaDown: () => [progEatDot(false)],
  eatGhost: () => [progEatGhost()],
  eatFruit: () => [progEatFruit()],
  extraLife: () => [progExtraLife()],
  credit: () => [progCredit()],
  fright: () => [progFrightened()],
  eyes: () => [progEyes()],
};

// ---------------------------------------------------------------------------

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.suppressed = false; // true during the attract-mode demo (silent)
    this.loopMode = 'none';
    this.sirenLevel = -1;
    this.wakaFlip = false;
    this.buffers = new Map();
    this.loopSource = null;
  }

  ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : MASTER_GAIN;
    // Three voices summing into one bus clip easily; a gentle limiter keeps
    // the mix clean when a chomp lands on top of the siren.
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 6;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.1;
    this.master.connect(comp).connect(this.ctx.destination);
  }

  /** Render (once) and cache the buffer for a named sound. */
  buffer(name, build) {
    let buf = this.buffers.get(name);
    if (buf) return buf;
    const samples = renderProgram(build(), this.ctx.sampleRate);
    buf = this.ctx.createBuffer(1, samples.length, this.ctx.sampleRate);
    buf.copyToChannel(samples, 0);
    this.buffers.set(name, buf);
    return buf;
  }

  play(name) {
    if (!this.live) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer(name, SOUND_PROGRAMS[name]);
    src.connect(this.master);
    src.start();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : MASTER_GAIN;
  }
  toggleMute() { this.setMuted(!this.muted); }

  resume() {
    this.ensure();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  stopLoop() {
    if (this.loopSource) {
      this.loopSource.stop();
      this.loopSource = null;
    }
  }

  setLoop(mode, sirenLevel = 0) {
    if (this.suppressed) mode = 'none';
    if (!this.ctx) { this.loopMode = mode; this.sirenLevel = sirenLevel; return; }
    if (mode === this.loopMode && sirenLevel === this.sirenLevel) return;
    this.loopMode = mode;
    this.sirenLevel = sirenLevel;
    this.stopLoop();
    let buf = null;
    if (mode === 'siren') buf = this.buffer(`siren${sirenLevel}`, () => [progSiren(sirenLevel)]);
    else if (mode === 'fright' || mode === 'eyes') buf = this.buffer(mode, SOUND_PROGRAMS[mode]);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(this.master);
    src.start();
    this.loopSource = src;
  }

  // Kept for the game loop's benefit: the sequencing now lives in the rendered
  // buffers, so there is nothing to advance per tick.
  update() {}

  get live() { return this.ctx && !this.suppressed; }

  waka() {
    if (!this.live) return;
    this.wakaFlip = !this.wakaFlip;
    this.play(this.wakaFlip ? 'wakaUp' : 'wakaDown');
  }

  eatGhost() { this.play('eatGhost'); }
  eatFruit() { this.play('eatFruit'); }
  extraLife() { this.play('extraLife'); }
  credit() { this.play('credit'); }
  death() { this.play('death'); }
  intro() { this.play('prelude'); }
  intermission() { this.play('intermission'); }
}
