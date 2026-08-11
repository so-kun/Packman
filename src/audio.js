// Web Audio sound engine, structured after the era's 3-voice wavetable sound
// generators: three persistent voices whose frequency and volume are
// re-programmed every 60 Hz tick from small parametric "effect programs"
// (start frequency, per-tick frequency step, per-tick volume step, duration),
// which is what produces the characteristic stepped sweeps and abrupt decays
// of arcade hardware rather than the smooth glides a plain oscillator gives.
//
// All waveforms and programs are original synthesis, tuned by ear against the
// documented character of the arcade sounds — no ROM waveform data is used,
// and the tunes are original compositions in period style.

const NOTE = (semisFromA4) => 440 * Math.pow(2, semisFromA4 / 12);

// One program step: n ticks starting at f0 Hz, stepping df Hz and dv volume
// each tick.
function seg(f0, df, n, vol, wave = 'buzz', dv = 0) {
  return { f0, df, n, vol, wave, dv };
}
function sweep(f0, f1, n, vol, wave = 'buzz', dv = 0) {
  return seg(f0, (f1 - f0) / n, n, vol, wave, dv);
}
function rest(n) { return seg(0, 0, n, 0); }

class Voice {
  constructor(ctx, waves, dest) {
    this.ctx = ctx;
    this.waves = waves;
    this.osc = ctx.createOscillator();
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.osc.setPeriodicWave(waves.buzz);
    this.osc.connect(this.gain).connect(dest);
    this.osc.start();
    this.prog = null;
    this.idx = 0;
    this.i = 0;
    this.loop = false;
    this.curWave = 'buzz';
  }

  play(prog, loop = false) {
    this.prog = prog;
    this.idx = 0;
    this.i = 0;
    this.loop = loop;
  }

  stop() {
    this.prog = null;
    this.setGain(0);
  }

  // A hard jump in gain clicks; a very short ramp keeps the stepped character
  // without the click.
  setGain(v) {
    this.gain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.003);
  }

  tick() {
    if (!this.prog) return;
    let s = this.prog[this.idx];
    while (s && this.i >= s.n) {
      this.idx++;
      this.i = 0;
      if (this.idx >= this.prog.length) {
        if (this.loop) this.idx = 0;
        else { this.stop(); return; }
      }
      s = this.prog[this.idx];
    }
    if (!s) { this.stop(); return; }
    const vol = s.vol + s.dv * this.i;
    if (vol <= 0 || s.f0 <= 0) {
      this.setGain(0);
    } else {
      if (s.wave !== this.curWave && this.waves[s.wave]) {
        this.osc.setPeriodicWave(this.waves[s.wave]);
        this.curWave = s.wave;
      }
      this.osc.frequency.value = Math.max(20, Math.min(4000, s.f0 + s.df * this.i));
      this.setGain(Math.min(0.4, vol));
    }
    this.i++;
  }
}

// --- ambient loops ---------------------------------------------------------

// Five siren stages: pitch and rate both climb as the board empties. Each
// cycle glides up then drops back a little faster, which is what gives the
// siren its lean rather than a symmetric warble.
function sirenProg(stage) {
  const base = 340 + stage * 105;
  const range = 300 + stage * 30;
  const up = 22 - stage * 2;
  const down = 14 - stage;
  return [
    sweep(base, base + range, up, 0.15, 'hollow'),
    sweep(base + range, base, down, 0.15, 'hollow'),
  ];
}
// Frightened: a rising-only wobble, low and fast.
const FRIGHT_PROG = [sweep(130, 400, 9, 0.14, 'hollow')];
// Eyes flying home: fast high whine.
const EYES_PROG = [
  sweep(700, 1400, 9, 0.10, 'hollow'),
  sweep(1400, 700, 9, 0.10, 'hollow'),
];

// --- effects ---------------------------------------------------------------

// One chomp per dot, alternating a falling and a rising sweep. Short and
// decaying so a fast run of dots reads as continuous munching.
const WAKA_DOWN = [sweep(600, 140, 6, 0.30, 'buzz', -0.035)];
const WAKA_UP = [sweep(140, 600, 6, 0.30, 'buzz', -0.035)];

function deathProg() {
  // Six warbles whose centre pitch steps down, then two rising puffs.
  const p = [];
  const centres = [880, 750, 620, 500, 390, 290];
  for (let i = 0; i < centres.length; i++) {
    p.push(sweep(centres[i] + 150, centres[i] - 70, 10, 0.24 - i * 0.012));
    p.push(rest(2));
  }
  p.push(rest(8));
  p.push(sweep(70, 430, 7, 0.26, 'buzz', -0.02));
  p.push(rest(7));
  p.push(sweep(70, 430, 7, 0.26, 'buzz', -0.02));
  return p;
}

// Gulp down, then the rising slurp as the ghost is swallowed.
const EAT_GHOST_PROG = [
  sweep(420, 150, 7, 0.24),
  sweep(200, 1000, 22, 0.22, 'buzz', -0.004),
];

const EAT_FRUIT_PROG = [
  sweep(520, 180, 7, 0.26),
  sweep(180, 620, 9, 0.24, 'buzz', -0.012),
];

function extraLifeProg() {
  const p = [];
  for (let i = 0; i < 9; i++) {
    p.push(sweep(1400, 900, 5, 0.16, 'hollow', -0.012));
    p.push(rest(3));
  }
  return p;
}

const CREDIT_PROG = [seg(600, 0, 3, 0.24), seg(1000, 0, 7, 0.24, 'buzz', -0.02)];

// --- tunes (original compositions) -----------------------------------------

// Start-up jingle: bright wavetable lead over an octave-hopping bass.
function jingleLead() {
  const E = 9;
  const n = (semi, ticks) => seg(NOTE(semi), 0, ticks, 0.15, 'lead');
  const p = [];
  const phrase = (a, b, c, d) => {
    p.push(n(a, E), n(b, E), n(c, E), n(d, E), n(c, E), n(b, E), n(a, E * 2), rest(E));
  };
  phrase(3, 7, 10, 15);
  phrase(5, 9, 12, 17);
  phrase(3, 7, 10, 15);
  for (const s of [7, 8, 9, 10, 11, 12]) p.push(n(s, 6));
  p.push(n(15, E * 3));
  return p;
}

// Intermission tune: lighter and bouncier than the start jingle, so the
// coffee breaks do not simply replay the opening.
function intermissionLead() {
  const n = (semi, ticks) => seg(NOTE(semi), 0, ticks, 0.14, 'lead');
  const p = [];
  const skip = (a, b) => p.push(n(a, 7), rest(2), n(b, 7), rest(2));
  skip(10, 14); skip(12, 15); skip(10, 14); skip(7, 12);
  p.push(n(9, 10), rest(3), n(11, 10), rest(3), n(12, 20), rest(8));
  skip(12, 17); skip(14, 19); skip(12, 17); skip(9, 14);
  p.push(n(10, 10), rest(3), n(12, 10), rest(3), n(15, 26));
  return p;
}

function bassFor(totalTicks, low, high) {
  const p = [];
  let t = 0, alt = true;
  while (t < totalTicks) {
    p.push(seg(NOTE(alt ? low : high), 0, 9, 0.18, 'tri'), rest(5));
    t += 14;
    alt = !alt;
  }
  return p;
}

const progLength = (p) => p.reduce((a, s) => a + s.n, 0);

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.suppressed = false; // true during the attract-mode demo (silent)
    this.loopMode = 'none';
    this.sirenLevel = -1;
    this.wakaFlip = false;
  }

  ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    // Three voices summing into one bus clip easily; a gentle limiter keeps
    // the mix clean when a chomp lands on top of the siren.
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 6;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.1;
    this.master.connect(comp).connect(this.ctx.destination);
    // Hand-built harmonic recipes approximating small wavetable timbres.
    const mk = (harm) => this.ctx.createPeriodicWave(
      new Float32Array(harm), new Float32Array(harm.length));
    this.waves = {
      // bright and buzzy (chomps, effects): dense odd+even harmonics
      buzz: mk([0, 1, 0.7, 0.9, 0.5, 0.62, 0.34, 0.4, 0.2, 0.24, 0.12, 0.14]),
      // rounder hollow tone (sirens): mostly odd harmonics
      hollow: mk([0, 1, 0.06, 0.52, 0.05, 0.3, 0.03, 0.15, 0, 0.07]),
      // lead voice for the tunes
      lead: mk([0, 1, 0.45, 0.62, 0.24, 0.32, 0.12, 0.14]),
      // soft triangle-ish bass
      tri: mk([0, 1, 0, 0.12, 0, 0.045, 0, 0.02]),
    };
    this.fx = new Voice(this.ctx, this.waves, this.master);      // effects
    this.ambient = new Voice(this.ctx, this.waves, this.master); // siren etc.
    this.melody = new Voice(this.ctx, this.waves, this.master);  // tunes
    this.voices = [this.fx, this.ambient, this.melody];
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

  setLoop(mode, sirenLevel = 0) {
    if (this.suppressed) mode = 'none';
    if (!this.ctx) { this.loopMode = mode; this.sirenLevel = sirenLevel; return; }
    if (mode === this.loopMode && sirenLevel === this.sirenLevel) return;
    this.loopMode = mode;
    this.sirenLevel = sirenLevel;
    switch (mode) {
      case 'siren': this.ambient.play(sirenProg(sirenLevel), true); break;
      case 'fright': this.ambient.play(FRIGHT_PROG, true); break;
      case 'eyes': this.ambient.play(EYES_PROG, true); break;
      default: this.ambient.stop();
    }
  }

  // One tick of the 60 Hz sequencer; call once per game update.
  update() {
    if (!this.ctx) return;
    for (const v of this.voices) v.tick();
  }

  get live() { return this.ctx && !this.suppressed; }

  waka() {
    if (!this.live) return;
    this.wakaFlip = !this.wakaFlip;
    this.fx.play(this.wakaFlip ? WAKA_DOWN : WAKA_UP);
  }

  eatGhost() { if (this.live) this.fx.play(EAT_GHOST_PROG); }
  eatFruit() { if (this.live) this.fx.play(EAT_FRUIT_PROG); }
  // The extend fanfare rides the (otherwise idle) melody voice so rapid
  // chomps don't cut it short.
  extraLife() { if (this.live) this.melody.play(extraLifeProg()); }
  credit() { if (this.live) this.fx.play(CREDIT_PROG); }
  death() { if (this.live) this.fx.play(deathProg()); }

  intro() {
    if (!this.live) return;
    const lead = jingleLead();
    this.melody.play(lead);
    this.fx.play(bassFor(progLength(lead), -33, -21));
  }

  intermission() {
    if (!this.live) return;
    const lead = intermissionLead();
    this.melody.play(lead);
    this.fx.play(bassFor(progLength(lead), -29, -17));
  }
}
