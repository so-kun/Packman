// Web Audio sound engine. All sounds are synthesized here in the style of
// the era's 3-voice wavetable sound generators — original synthesis, no
// sampled or transcribed ROM waveform data. The start-up jingle is an
// original composition in period style.

const NOTE = (semisFromA4) => 440 * Math.pow(2, semisFromA4 / 12);

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.loopMode = 'none'; // none | siren | fright | eyes
    this.sirenLevel = 0;
    this.phase = 0;
  }

  ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.25;
    this.master.connect(this.ctx.destination);
    // Hollow square-ish tone reminiscent of the old wavetable voices.
    const real = new Float32Array([0, 1, 0, 0.55, 0, 0.32, 0, 0.18, 0, 0.08]);
    const imag = new Float32Array(real.length);
    this.wave = this.ctx.createPeriodicWave(real, imag);
    // Continuous loop voice (siren / fright / eyes)
    this.loopOsc = this.ctx.createOscillator();
    this.loopOsc.setPeriodicWave(this.wave);
    this.loopGain = this.ctx.createGain();
    this.loopGain.gain.value = 0;
    this.loopOsc.connect(this.loopGain).connect(this.master);
    this.loopOsc.start();
    this.wakaFlip = false;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.25;
  }
  toggleMute() { this.setMuted(!this.muted); }

  resume() {
    this.ensure();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setLoop(mode, sirenLevel = 0) {
    this.loopMode = mode;
    this.sirenLevel = sirenLevel;
  }

  // Called once per game tick to steer the loop voice.
  update() {
    if (!this.ctx) return;
    const g = this.loopGain.gain;
    const f = this.loopOsc.frequency;
    this.phase += 1;
    switch (this.loopMode) {
      case 'siren': {
        const base = 320 + this.sirenLevel * 110;
        const tri = Math.abs(((this.phase * 2.4) % 60) - 30) / 30; // 0..1
        f.value = base + tri * 130;
        g.value = 0.16;
        break;
      }
      case 'fright': {
        const saw = ((this.phase * 3.4) % 42) / 42;
        f.value = 90 + saw * 240;
        g.value = 0.15;
        break;
      }
      case 'eyes': {
        const tri = Math.abs(((this.phase * 5) % 50) - 25) / 25;
        f.value = 620 + tri * 500;
        g.value = 0.11;
        break;
      }
      default:
        g.value = 0;
    }
  }

  blip(freqFrom, freqTo, dur, vol = 0.2, type = 'wave', when = 0) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    if (type === 'wave') osc.setPeriodicWave(this.wave);
    else osc.type = type;
    const gain = this.ctx.createGain();
    osc.frequency.setValueAtTime(Math.max(20, freqFrom), t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqTo), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.setValueAtTime(vol, t0 + dur * 0.7);
    gain.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  waka() {
    this.wakaFlip = !this.wakaFlip;
    if (this.wakaFlip) this.blip(520, 190, 0.07, 0.22);
    else this.blip(190, 520, 0.07, 0.22);
  }

  eatGhost() { this.blip(160, 1100, 0.42, 0.25); }

  eatFruit() { this.blip(700, 140, 0.12, 0.25); this.blip(140, 500, 0.1, 0.2, 'wave', 0.12); }

  extraLife() {
    for (let i = 0; i < 3; i++) this.blip(880, 1760, 0.16, 0.2, 'wave', i * 0.18);
  }

  credit() { this.blip(990, 990, 0.06, 0.25); this.blip(1320, 1320, 0.08, 0.25, 'wave', 0.07); }

  death() {
    // wavering descent then two small "puffs"
    if (!this.ctx || this.muted) return;
    let t = 0;
    for (let i = 0; i < 6; i++) {
      this.blip(720 - i * 90, 320 - i * 40, 0.14, 0.2, 'wave', t);
      t += 0.15;
    }
    this.blip(90, 380, 0.12, 0.24, 'wave', t + 0.05);
    this.blip(90, 380, 0.12, 0.24, 'wave', t + 0.25);
  }

  // Original start-of-game jingle (period-style chiptune, ~4 s).
  intro() {
    if (!this.ctx || this.muted) return;
    const lead = [
      [3, 0.14], [15, 0.14], [10, 0.14], [7, 0.14], [15, 0.11], [10, 0.18], [7, 0.30],
      [5, 0.14], [17, 0.14], [12, 0.14], [8, 0.14], [17, 0.11], [12, 0.18], [8, 0.30],
      [3, 0.14], [15, 0.14], [10, 0.14], [7, 0.14], [15, 0.11], [10, 0.18], [7, 0.30],
      [7, 0.12], [8, 0.12], [9, 0.12], [10, 0.12], [11, 0.12], [12, 0.12], [15, 0.4],
    ];
    let t = 0;
    for (const [n, d] of lead) {
      this.blip(NOTE(n - 24), NOTE(n - 24), d * 0.9, 0.16, 'wave', t);
      t += d;
    }
    const bassLen = t;
    let bt = 0;
    let step = 0;
    while (bt < bassLen) {
      const n = (step % 4 < 2) ? -33 : -31;
      this.blip(NOTE(n), NOTE(n), 0.22, 0.18, 'triangle', bt);
      bt += 0.28;
      step++;
    }
  }
}
