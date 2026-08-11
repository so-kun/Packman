// Web Audio sound engine, structured after the era's 3-voice wavetable sound
// generators: three persistent voices whose frequency and volume are
// re-programmed every 60 Hz tick from small parametric "effect programs"
// (start frequency, per-tick frequency step, per-tick volume step, duration),
// which is what produces the characteristic stepped sweeps and abrupt decays
// of arcade hardware rather than the smooth glides a plain oscillator gives.
//
// The chomp, death, bonus and frightened programs are tuned to per-tick pitch
// and harmonic measurements taken from recordings of the arcade machine (the
// sirens and the ghost-eat slurp were not covered by those recordings and are
// still by ear). Nothing here is ROM data: the waveforms are rebuilt from
// measured harmonic ratios, and both tunes are original compositions — the
// arcade's start tune is a copyrighted piece of music and is not reproduced.

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
// Frightened: measured as a descending sweep from ~2350 Hz to ~500 Hz over
// 16 ticks, repeating — not the rising wobble this once used.
const FRIGHT_PROG = [sweep(2350, 500, 16, 0.13, 'scared')];
// Swallowing an energizer: one long rising sweep before the loop takes over.
const EAT_ENERGIZER_PROG = [sweep(80, 1650, 26, 0.22, 'scared', -0.004)];
// Eyes flying home: fast high whine.
const EYES_PROG = [
  sweep(700, 1400, 9, 0.10, 'hollow'),
  sweep(1400, 700, 9, 0.10, 'hollow'),
];

// --- effects ---------------------------------------------------------------

// One chomp per dot: a six-tick ramp between ~420 and ~980 Hz, alternating
// direction, then a two-tick fade — measured straight off a recording of
// continuous munching, where chomps land every ~7.5 ticks.
const WAKA_UP = [
  seg(433, 104, 6, 0.30, 'buzz', -0.015),  // measured 433,540,640,765,855,955
  seg(975, -45, 2, 0.20, 'buzz', -0.09),
];
const WAKA_DOWN = [
  seg(962, -105, 6, 0.30, 'buzz', -0.015), // measured 962,857,765,645,543,435
  seg(430, 45, 2, 0.20, 'buzz', -0.09),
];

function deathProg() {
  // Six warble cycles whose bounds step down together, then the two fast
  // rising sweeps that finish it. Frequencies are the measured per-tick track.
  const hi  = [725, 677, 629, 637, 579, 517];
  const lo  = [633, 564, 520, 476, 433, 382];
  const top = [767, 694, 638, 595, 552, 414];
  const p = [];
  for (let i = 0; i < 6; i++) {
    p.push(sweep(hi[i], lo[i], 5, 0.26, 'pure'));
    p.push(sweep(lo[i], top[i], 6, 0.26, 'pure'));
  }
  p.push(rest(1));
  for (let i = 0; i < 2; i++) {
    p.push(seg(190, 187, 11, 0.28, 'pure', -0.014)); // measured ~187 Hz/tick
    p.push(rest(1));
  }
  return p;
}

// Gulp down, then the rising slurp as the ghost is swallowed.
const EAT_GHOST_PROG = [
  sweep(420, 150, 7, 0.24),
  sweep(200, 1000, 22, 0.22, 'buzz', -0.004),
];

const EAT_FRUIT_PROG = [
  sweep(515, 50, 11, 0.26, 'soft'),
  sweep(50, 610, 12, 0.26, 'soft', -0.005),
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

// Timing, articulation and register for both tunes come from measuring the
// recording: notes step every ~5 ticks (81 ms) and sound for about 84% of the
// step, the lead sits between roughly 205 and 1055 Hz, and the bass alternates
// around a 59 Hz median. The melodies themselves are original — the arcade's
// tunes are copyrighted music and are not reproduced here.
const STEP = 5, GATE = 4;

function tuneVoice(notes, vol) {
  const p = [];
  for (const [semi, steps] of notes) {
    if (semi === null) { p.push(rest(steps * STEP)); continue; }
    p.push(seg(NOTE(semi), 0, steps * STEP - (STEP - GATE), vol, 'lead'));
    p.push(rest(STEP - GATE));
  }
  return p;
}

// Start-up jingle: rising arpeggio figures that climb, then a closing run.
function jingleLead() {
  const notes = [];
  const figure = (root) => {
    for (const iv of [0, 4, 7, 12, 7, 4]) notes.push([root + iv, 1]);
    notes.push([root, 2]);
  };
  figure(-13); figure(-11); figure(-8); figure(-6);
  for (const s of [-1, 1, 3, 5, 7, 9, 11, 13]) notes.push([s, 1]);
  notes.push([15, 3], [null, 1]);
  return tuneVoice(notes, 0.15);
}

// Intermission tune: a lighter, skipping figure so the coffee breaks do not
// simply replay the opening.
function intermissionLead() {
  const notes = [];
  const skip = (a, b) => notes.push([a, 1], [null, 1], [b, 1], [null, 1]);
  skip(-6, -1); skip(-4, 1); skip(-6, -1); skip(-11, -6);
  notes.push([-8, 2], [-6, 2], [-4, 3], [null, 1]);
  skip(-1, 4); skip(1, 6); skip(-1, 4); skip(-6, -1);
  notes.push([-4, 2], [-1, 2], [3, 4]);
  return tuneVoice(notes, 0.14);
}

// Bass: the measured line alternates octaves around a ~59 Hz median, moving
// half as often as the lead.
function bassFor(totalTicks, low, high) {
  const p = [];
  let t = 0, i = 0;
  while (t < totalTicks) {
    // Two beats low to one high, so the line's median sits on the low note
    // the way the measured bass does.
    p.push(seg(NOTE(i % 3 === 2 ? high : low), 0, 2 * STEP - 2, 0.18, 'tri'), rest(2));
    t += 2 * STEP;
    i++;
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
    // Harmonic recipes measured from arcade recordings (see MEASUREMENTS in
    // README): the chomp is harmonically dense, while the death, bonus and
    // frightened voices are close to a pure tone.
    this.waves = {
      buzz: mk([0, 1, 0.44, 0.24, 0.40, 0.13, 0.07, 0.05, 0.09, 0.05, 0.07]),
      pure: mk([0, 1, 0.06, 0.09, 0.02, 0.03, 0.01]),
      soft: mk([0, 1, 0.10, 0.19, 0.06, 0.06, 0.04, 0.03]),
      scared: mk([0, 1, 0.15, 0.06, 0.03]),
      // sirens (not covered by the recordings, so still tuned by ear)
      hollow: mk([0, 1, 0.06, 0.52, 0.05, 0.3, 0.03, 0.15, 0, 0.07]),
      lead: mk([0, 1, 0.48, 0.30, 0.25, 0.15, 0.19, 0.23, 0.24, 0.27, 0.66]),
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
  eatEnergizer() { if (this.live) this.fx.play(EAT_ENERGIZER_PROG); }
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
    this.fx.play(bassFor(progLength(lead), -35, -23)); // ~58 / 117 Hz
  }

  intermission() {
    if (!this.live) return;
    const lead = intermissionLead();
    this.melody.play(lead);
    this.fx.play(bassFor(progLength(lead), -33, -21)); // ~65 / 131 Hz
  }
}
