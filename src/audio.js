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

const TICK_HZ = 60;
const WSG_CLOCK = 96000;          // accumulator updates per second
const ACC_BITS = 20;              // one waveform cycle per full accumulator wrap
const OVERSAMPLE = 4;

/** Frequency register value for a pitch in Hz — only used by the guessed sounds. */
const REG = (hz) => Math.round((hz * (1 << ACC_BITS)) / WSG_CLOCK);

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
 * The siren. The original's cycle is 24 ticks — twelve up, twelve down — which
 * makes the buffer loop exactly. Stage 0 is the board's own values; the later
 * stages raise the base pitch and the step, which is the part still tuned by
 * ear (the original speeds the siren up as the board empties).
 */
export function progSiren(stage) {
  const base = 0x1000 + stage * 0x0300;
  const step = 0x0200 + stage * 0x0060;
  const out = [];
  let f = base;
  for (let t = 0; t < 24; t++) {
    out.push({ f, w: 6, v: 6 });
    f += (t % 24) < 11 ? step : -step;
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

/** Eyes flying home: a fast high two-tone whine, 16 ticks per cycle. */
function progEyes() {
  const out = [];
  for (let t = 0; t < 16; t++) {
    const f = t < 8 ? REG(1000) + t * REG(60) : REG(1420) - (t - 8) * REG(60);
    out.push({ f, w: 6, v: 5 });
  }
  return out;
}

/** Swallowing an energizer: one long rise before the frightened loop starts. */
function progEatEnergizer() {
  const out = [];
  for (let t = 0; t < 26; t++) {
    out.push({ f: REG(90 + t * 62), w: 4, v: Math.max(4, 14 - (t >> 2)) });
  }
  return out;
}

/** The extend fanfare at 10000 points. */
function progExtraLife() {
  const out = [];
  for (let i = 0; i < 9; i++) {
    for (let t = 0; t < 5; t++) out.push({ f: REG(1400 - t * 100), w: 6, v: 10 });
    for (let t = 0; t < 3; t++) out.push({ f: 0, w: 6, v: 0 });
  }
  return out;
}

/** Coin insert. */
function progCredit() {
  const out = [];
  for (let t = 0; t < 3; t++) out.push({ f: REG(600), w: 2, v: 13 });
  for (let t = 0; t < 7; t++) out.push({ f: REG(1000), w: 2, v: 13 - t });
  return out;
}

// The coffee-break tune. Unlike the start tune, no register capture of it
// exists, so the melody is an original composition. Its timing, articulation
// and register are the measured ones: notes step every 5 ticks (81 ms) and
// sound for four of them, and the bass moves half as often, two beats low to
// one high so its median sits on the low note.
const STEP = 5, GATE = 4;
const NOTE_REG = (semi) => REG(440 * Math.pow(2, semi / 12));

function tuneVoice(notes, waveform, volume) {
  const out = [];
  for (const [semi, steps] of notes) {
    const ticks = steps * STEP;
    for (let t = 0; t < ticks; t++) {
      const sounding = semi !== null && t < ticks - (STEP - GATE);
      out.push(sounding
        ? { f: NOTE_REG(semi), w: waveform, v: volume }
        : { f: 0, w: waveform, v: 0 });
    }
  }
  return out;
}

function bassVoice(totalTicks, low, high, waveform, volume) {
  const out = [];
  for (let i = 0; out.length < totalTicks; i++) {
    const semi = i % 3 === 2 ? high : low;
    for (let t = 0; t < 2 * STEP; t++) {
      out.push(t < 2 * STEP - 2
        ? { f: NOTE_REG(semi), w: waveform, v: volume }
        : { f: 0, w: waveform, v: 0 });
    }
  }
  return out.slice(0, totalTicks);
}

function progIntermission() {
  const notes = [];
  const skip = (a, b) => notes.push([a, 1], [null, 1], [b, 1], [null, 1]);
  skip(-6, -1); skip(-4, 1); skip(-6, -1); skip(-11, -6);
  notes.push([-8, 2], [-6, 2], [-4, 3], [null, 1]);
  skip(-1, 4); skip(1, 6); skip(-1, 4); skip(-6, -1);
  notes.push([-4, 2], [-1, 2], [3, 4]);
  const lead = tuneVoice(notes, 1, 9);
  return [lead, bassVoice(lead.length, -29, -17, 0, 7)];
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
      // 8 is the sample magnitude, 15 the maximum volume.
      out[i] += (sum / OVERSAMPLE) * step.v / (8 * 15);
    }
  }
  return out;
}

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
    this.master.gain.value = this.muted ? 0 : 0.5;
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

  play(name, build) {
    if (!this.live) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer(name, build);
    src.connect(this.master);
    src.start();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
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
    else if (mode === 'fright') buf = this.buffer('fright', () => [progFrightened()]);
    else if (mode === 'eyes') buf = this.buffer('eyes', () => [progEyes()]);
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
    const rising = this.wakaFlip;
    this.play(rising ? 'wakaUp' : 'wakaDown', () => [progEatDot(rising)]);
  }

  eatGhost() { this.play('eatGhost', () => [progEatGhost()]); }
  eatEnergizer() { this.play('eatEnergizer', () => [progEatEnergizer()]); }
  eatFruit() { this.play('eatFruit', () => [progEatFruit()]); }
  extraLife() { this.play('extraLife', () => [progExtraLife()]); }
  credit() { this.play('credit', () => [progCredit()]); }
  death() { this.play('death', () => unpackDump(SND_DEAD, 1)); }
  intro() { this.play('prelude', () => unpackDump(SND_PRELUDE, 2)); }
  intermission() { this.play('intermission', () => progIntermission()); }
}
