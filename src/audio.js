// Web Audio sound engine, restructured to mirror the behavior of the era's
// 3-voice wavetable sound generators: three persistent voices whose frequency
// and volume are re-programmed every 60 Hz tick from small parametric
// "effect programs" (start frequency, per-tick increment, duration, repeats),
// which recreates the characteristic stepped sweeps of the arcade hardware.
//
// All waveforms and programs are original synthesis tuned by ear against the
// documented character of the arcade sounds — no ROM waveform data is used.
// The start-up jingle is an original composition in period style.

const NOTE = (semisFromA4) => 440 * Math.pow(2, semisFromA4 / 12);

// seg: {f0, df, n, vol, wave} — n ticks starting at f0 Hz, +df Hz per tick.
function seg(f0, df, n, vol, wave = 'buzz') { return { f0, df, n, vol, wave }; }
// sweep from f0 to f1 over n ticks
function sweep(f0, f1, n, vol, wave = 'buzz') { return seg(f0, (f1 - f0) / n, n, vol, wave); }
function rest(n) { return seg(0, 0, n, 0); }

class Voice {
  constructor(ctx, waves, dest) {
    this.waves = waves;
    this.osc = ctx.createOscillator();
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.osc.setPeriodicWave(waves.buzz);
    this.osc.connect(this.gain).connect(dest);
    this.osc.start();
    this.prog = null;   // array of segs
    this.idx = 0;       // current seg
    this.i = 0;         // tick within seg
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
    this.gain.gain.value = 0;
  }

  tick() {
    if (!this.prog) { this.gain.gain.value = 0; return; }
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
    if (s.vol <= 0 || s.f0 <= 0) {
      this.gain.gain.value = 0;
    } else {
      if (s.wave !== this.curWave && this.waves[s.wave]) {
        this.osc.setPeriodicWave(this.waves[s.wave]);
        this.curWave = s.wave;
      }
      const f = s.f0 + s.df * this.i;
      this.osc.frequency.value = Math.max(20, Math.min(4000, f));
      this.gain.gain.value = s.vol;
    }
    this.i++;
  }
}

// Ambient loop programs. Five siren stages: pitch and sweep rate rise as the
// board empties; each cycle is a slow up-then-down glide (~1 s at stage 0).
function sirenProg(stage) {
  const base = 330 + stage * 115;
  const range = 390 + stage * 25;
  const half = Math.max(18, 32 - stage * 3); // ticks per half-sweep
  return [
    sweep(base, base + range, half, 0.16, 'hollow'),
    sweep(base + range, base, half, 0.16, 'hollow'),
  ];
}
// Frightened: rising-only wobble repeating ~6x per second.
const FRIGHT_PROG = [sweep(130, 420, 10, 0.15, 'hollow')];
// Eyes flying home: fast high whine, up and down.
const EYES_PROG = [
  sweep(680, 1350, 11, 0.11, 'hollow'),
  sweep(1350, 680, 11, 0.11, 'hollow'),
];

// One chomp per dot, alternating a falling "wa" and rising "ka".
const WAKA_DOWN = [sweep(550, 110, 5, 0.26)];
const WAKA_UP = [sweep(110, 550, 5, 0.26)];

function deathProg() {
  // Center pitch steps down through six quick warbles, then two "puffs".
  const p = [];
  for (const c of [900, 760, 630, 510, 400, 300]) {
    p.push(sweep(c + 140, c - 60, 11, 0.22));
    p.push(rest(1));
  }
  p.push(rest(8));
  p.push(sweep(80, 420, 8, 0.24));
  p.push(rest(6));
  p.push(sweep(80, 420, 8, 0.24));
  return p;
}

const EAT_GHOST_PROG = [sweep(250, 1050, 30, 0.2)];

const EAT_FRUIT_PROG = [sweep(500, 170, 8, 0.24), sweep(170, 430, 8, 0.2)];

function extraLifeProg() {
  const p = [];
  for (let i = 0; i < 9; i++) {
    p.push(sweep(1350, 950, 6, 0.16, 'hollow'));
    p.push(rest(4));
  }
  return p;
}

const CREDIT_PROG = [seg(620, 0, 4, 0.22), seg(990, 0, 8, 0.22)];

// Original start-up jingle (period-style: bright wavetable lead over an
// octave-hopping bass). Notes are semitones relative to A4.
function jingleLead() {
  const E = 9; // ticks per eighth note
  const n = (semi, ticks) => seg(NOTE(semi), 0, ticks, 0.15, 'lead');
  const p = [];
  const phrase = (a, b, c, d) => {
    p.push(n(a, E), n(b, E), n(c, E), n(d, E), n(c, E), n(b, E), n(a, E * 2), rest(E));
  };
  phrase(3, 7, 10, 15);   // C5 E5 G5 C6 ...
  phrase(5, 9, 12, 17);   // D5 F#5 A5 D6 ...
  // closing run up
  for (const s of [7, 8, 9, 10, 11, 12]) p.push(n(s, 6));
  p.push(n(15, E * 3));
  return p;
}
function jingleBass(leadLen) {
  const p = [];
  let low = true;
  let t = 0;
  while (t < leadLen) {
    p.push(seg(NOTE(low ? -33 : -21), 0, 10, 0.2, 'tri'), rest(4));
    t += 14;
    low = !low;
  }
  return p;
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.loopMode = 'none';
    this.sirenLevel = -1;
    this.wakaFlip = false;
  }

  ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.3;
    this.master.connect(this.ctx.destination);
    // Hand-built harmonic recipes approximating small wavetable timbres:
    const mk = (harm) => this.ctx.createPeriodicWave(
      new Float32Array(harm), new Float32Array(harm.length));
    this.waves = {
      // bright and buzzy (effects, waka): strong odd+even harmonic mix
      buzz: mk([0, 1, 0.62, 0.85, 0.4, 0.55, 0.25, 0.3, 0.12, 0.15, 0.06]),
      // rounder hollow tone (sirens): mostly odd harmonics
      hollow: mk([0, 1, 0, 0.5, 0, 0.28, 0, 0.12, 0, 0.05]),
      // lead voice for the jingle
      lead: mk([0, 1, 0.4, 0.6, 0.2, 0.3, 0.1, 0.12]),
      // soft triangle-ish bass
      tri: mk([0, 1, 0, 0.11, 0, 0.04]),
    };
    this.fx = new Voice(this.ctx, this.waves, this.master);      // effects
    this.ambient = new Voice(this.ctx, this.waves, this.master); // siren etc.
    this.melody = new Voice(this.ctx, this.waves, this.master);  // jingle lead
    this.voices = [this.fx, this.ambient, this.melody];
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.3;
  }
  toggleMute() { this.setMuted(!this.muted); }

  resume() {
    this.ensure();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setLoop(mode, sirenLevel = 0) {
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

  waka() {
    if (!this.ctx) return;
    this.wakaFlip = !this.wakaFlip;
    // Don't cut an in-flight chomp for smoother continuous munching.
    if (this.fx.prog && this.fx.prog === (this.wakaFlip ? WAKA_UP : WAKA_DOWN)) return;
    this.fx.play(this.wakaFlip ? WAKA_DOWN : WAKA_UP);
  }

  eatGhost() { if (this.ctx) this.fx.play(EAT_GHOST_PROG); }
  eatFruit() { if (this.ctx) this.fx.play(EAT_FRUIT_PROG); }
  // The extend fanfare rides the (otherwise idle) melody voice so rapid
  // waka chomps don't cut it short.
  extraLife() { if (this.ctx) this.melody.play(extraLifeProg()); }
  credit() { if (this.ctx) this.fx.play(CREDIT_PROG); }
  death() { if (this.ctx) this.fx.play(deathProg()); }

  intro() {
    if (!this.ctx) return;
    const lead = jingleLead();
    const len = lead.reduce((a, s) => a + s.n, 0);
    this.melody.play(lead);
    this.fx.play(jingleBass(len));
  }
}
