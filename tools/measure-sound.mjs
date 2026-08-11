// Measures a recording of the arcade into what a WSG register program needs.
//
//   node tools/measure-sound.mjs <audio file> [floorDb]
//   node tools/measure-sound.mjs <audio file> --fit <startHz> <endHz> <ticks> <firstTick>
//
// The default mode prints the pitch and level of each 60 Hz tick, which is the
// grid the hardware reprograms its voices on — read the contour off that.
//
// --fit then answers the other question: which of the eight ROM waveforms is
// it. Comparing harmonic ratios directly does not work, because four of the
// waveforms are not single-cycle and their harmonics do not land where a
// naive comparison looks. Instead this synthesises the contour you measured on
// every waveform in turn and compares spectra under identical analysis, so the
// smearing a fast sweep causes affects candidate and recording alike.
//
// Decoding runs in headless Chromium because it is the MP3 decoder to hand.

import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { renderProgram, WAVEFORM_CYCLES } from '../src/audio.js';

const file = process.argv[2];
if (!file) {
  console.error('usage: measure-sound.mjs <audio file> [floorDb]');
  console.error('       measure-sound.mjs <audio file> --fit <startHz> <endHz> <ticks> <firstTick>');
  process.exit(1);
}
const fitting = process.argv[3] === '--fit';
const [fitStart, fitEnd, fitTicks, fitFirst] = process.argv.slice(4).map(Number);
const floorDb = Number((fitting ? undefined : process.argv[3]) ?? -34);

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const b64 = readFileSync(file).toString('base64');

const { rate, samples } = await page.evaluate(async (data) => {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ctx = new OfflineAudioContext(1, 1, 44100);
  const buf = await ctx.decodeAudioData(bytes.buffer);
  return { rate: buf.sampleRate, samples: Array.from(buf.getChannelData(0)) };
}, b64);
await browser.close();

const TICK = rate / 60;
const WINDOW = 2048;   // ~46 ms — enough resolution to separate low sweeps
const MIN_HZ = 60;
const MAX_HZ = 4500;

/** In-place iterative radix-2 FFT. */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k];
        const ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

/**
 * Dominant partial of one window.
 *
 * This deliberately does not try to be a fundamental tracker. Autocorrelation
 * loses a sweep that moves this fast, and a harmonic product spectrum is worse
 * than useless here: several of the ROM waveforms have no even harmonics at
 * all, so folding the spectrum by 2 zeroes out the very bin being looked for.
 * The strongest partial is what these sounds are heard as, and for the ROM
 * waveforms it is the fundamental — read the printed contour, not one number.
 */
function pitch(start) {
  if (start + WINDOW > samples.length) return 0;
  const re = new Float64Array(WINDOW);
  const im = new Float64Array(WINDOW);
  for (let i = 0; i < WINDOW; i++) {
    // Hann window, or the sweep's edges ring across the whole spectrum.
    re[i] = samples[start + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (WINDOW - 1)));
  }
  fft(re, im);
  const half = WINDOW / 2;
  const mag = new Float64Array(half);
  for (let i = 0; i < half; i++) mag[i] = Math.hypot(re[i], im[i]);

  const lo = Math.max(1, Math.ceil((MIN_HZ * WINDOW) / rate));
  const hi = Math.min(half - 2, Math.floor((MAX_HZ * WINDOW) / rate));
  let bin = 0;
  let best = 0;
  for (let i = lo; i <= hi; i++) if (mag[i] > best) { best = mag[i]; bin = i; }
  if (!bin) return 0;
  // Parabolic interpolation against the plain spectrum for sub-bin accuracy.
  const a = mag[bin - 1];
  const b = mag[bin];
  const c = mag[bin + 1];
  const shift = (0.5 * (a - c)) / (a - 2 * b + c || 1);
  return ((bin + shift) * rate) / WINDOW;
}

function rms(start, n) {
  let sum = 0;
  let count = 0;
  for (let i = start; i < start + n && i < samples.length; i++, count++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / (count || 1));
}

if (fitting) {
  // Average log-spectrum over a run of ticks, normalised to its own peak.
  const spectrum = (buf, tick0, n) => {
    const acc = new Float64Array(WINDOW / 2);
    for (let t = tick0; t < tick0 + n; t++) {
      const s = Math.max(0, Math.min(buf.length - WINDOW, Math.round(t * TICK - (WINDOW - TICK) / 2)));
      const re = new Float64Array(WINDOW);
      const im = new Float64Array(WINDOW);
      for (let i = 0; i < WINDOW; i++) {
        re[i] = (buf[s + i] || 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (WINDOW - 1)));
      }
      fft(re, im);
      for (let k = 1; k < WINDOW / 2; k++) acc[k] += Math.hypot(re[k], im[k]);
    }
    let mx = 0;
    for (let k = 1; k < WINDOW / 2; k++) mx = Math.max(mx, acc[k]);
    return acc.map((v) => Math.log10(v / (mx || 1) + 1e-4));
  };

  const recorded = spectrum(samples, fitFirst, fitTicks);
  console.log(`fitting ${file}: ${fitStart} -> ${fitEnd} Hz over ${fitTicks} ticks\n`);
  let best = null;
  for (let w = 0; w < 8; w++) {
    const cycles = WAVEFORM_CYCLES[w];
    const prog = [];
    for (let rep = 0; rep < 8; rep++) {
      for (let t = 0; t < fitTicks; t++) {
        const hz = fitStart + ((fitEnd - fitStart) * t) / (fitTicks - 1);
        prog.push({ f: Math.round((hz / cycles) * (1 << 20) / 96000), w, v: 12 });
      }
    }
    const synth = spectrum(renderProgram([prog], rate), fitTicks * 2, fitTicks);
    let d = 0;
    for (let k = 1; k < WINDOW / 2; k++) d += Math.abs(synth[k] - recorded[k]);
    console.log(` w=${w} (x${String(cycles).padStart(2)})  spectral distance ${d.toFixed(1)}`);
    if (!best || d < best.d) best = { w, d, cycles };
  }
  const reg = (hz) => `0x${Math.round((hz / best.cycles) * (1 << 20) / 96000).toString(16)}`;
  console.log(`\nbest: waveform ${best.w} (plays x${best.cycles})`);
  console.log(`registers: ${fitStart} Hz -> ${reg(fitStart)},  ${fitEnd} Hz -> ${reg(fitEnd)}`);
  process.exit(0);
}

const ticks = Math.floor(samples.length / TICK);
let peak = 0;
for (let t = 0; t < ticks; t++) peak = Math.max(peak, rms(Math.round(t * TICK), Math.round(TICK)));

console.log(`${file}: ${(samples.length / rate).toFixed(3)}s at ${rate} Hz, ${ticks} ticks`);
console.log('tick    Hz    dB   register');
const rows = [];
for (let t = 0; t < ticks; t++) {
  const start = Math.round(t * TICK);
  const level = rms(start, Math.round(TICK));
  const db = 20 * Math.log10(level / (peak || 1));
  // Centre the analysis window on the tick, clamped to the buffer.
  const centred = Math.max(0, Math.min(samples.length - WINDOW, Math.round(start - (WINDOW - TICK) / 2)));
  const hz = db < floorDb ? 0 : pitch(centred);
  const reg = Math.round((hz * (1 << 20)) / 96000);
  rows.push({ t, hz, db, reg });
  console.log(
    `${String(t).padStart(4)}  ${hz.toFixed(0).padStart(4)}  ${db.toFixed(1).padStart(5)}`
    + `   0x${reg.toString(16).padStart(4, '0')}`,
  );
}

const sounding = rows.filter((r) => r.hz > 0);
if (sounding.length) {
  console.log(`\nsounding ticks ${sounding[0].t}..${sounding[sounding.length - 1].t}`
    + ` (${sounding.length}), ${Math.min(...sounding.map((r) => r.hz)).toFixed(0)}`
    + `-${Math.max(...sounding.map((r) => r.hz)).toFixed(0)} Hz`);
}
