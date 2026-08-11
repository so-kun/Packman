// Decodes the tunes out of the program ROM's music sequences.
//
//   node tools/extract-music.mjs <pacman.rom> [--check]
//
// The board does not store its music as register values; it stores compact
// sequences that a player routine at $2D44 walks once per frame. This decodes
// those sequences the way that routine does, so the result is what the machine
// plays rather than a transcription of it.
//
// Format, read off the disassembly:
//
//   $3BC8   table of six 16-bit pointers, one per voice-and-tune
//   $3BB0   duration table: 1, 2, 4, 8, 16, 32, 64, 128 frames
//   $3BB8   note table: 0 (silence) then thirteen semitones, 87..195
//
//   byte >= 0xF0 is a command:
//     F0 lo hi   jump to address (this is how a tune loops)
//     F1 n       waveform
//     F2 n       octave: how far the note value is shifted left
//     F3 n       volume
//     F4 n       flags; bit 3 silences the voice
//     FF         end
//
//   any other byte is a note:
//     duration   = durations[(b >> 5) & 7]
//     if b & 0x1F is zero the previous note simply holds for that long
//     otherwise  note = notes[b & 0x0F], shifted left by the octave plus one
//                more if bit 4 is set; silence when the note value is 0
//
// The frequency register is that shifted value; voices 1 and 2 have four
// nibbles rather than five, so theirs is shifted up another four bits.

import { readFileSync, writeFileSync } from 'node:fs';
import { unpackDump } from '../src/audio.js';
import { SND_PRELUDE } from '../src/romdata.js';

const POINTER_TABLE = 0x3bc8;
const DURATION_TABLE = 0x3bb0;
const NOTE_TABLE = 0x3bb8;

const romPath = process.argv[2];
if (!romPath) {
  console.error('usage: extract-music.mjs <pacman.rom> [--check]');
  process.exit(1);
}
const rom = readFileSync(romPath);
if (rom.length !== 16384) {
  console.error(`expected a 16384-byte program ROM, got ${rom.length}`);
  process.exit(1);
}

const word = (a) => rom[a] | (rom[a + 1] << 8);
const durations = [...Array(8)].map((_, i) => rom[DURATION_TABLE + i]);
const notes = [...Array(16)].map((_, i) => rom[NOTE_TABLE + i]);

/**
 * Walk one sequence into per-tick register values.
 * `lowNibble` is true for voice 0, whose frequency register has one more
 * nibble than the others and so is not shifted up.
 */
function decode(addr, { lowNibble = false, maxTicks = 4096 } = {}) {
  const out = [];
  let pc = addr;
  let waveform = 0;
  let octave = 0;
  let volume = 0;
  let flags = 0;
  let note = 0;
  const seen = new Set();

  while (out.length < maxTicks) {
    const b = rom[pc];
    pc += 1;
    if (b === 0xff) break;
    if (b === 0xf0) {
      const target = word(pc);
      pc = target;
      // A tune that loops has no end; stop once the loop closes.
      if (seen.has(target)) break;
      seen.add(target);
      continue;
    }
    if (b > 0xf0 && b <= 0xf4) {
      const arg = rom[pc];
      pc += 1;
      if (b === 0xf1) waveform = arg;
      else if (b === 0xf2) octave = arg;
      else if (b === 0xf3) volume = arg;
      else flags = arg;
      continue;
    }
    const ticks = durations[(b >> 5) & 7];
    if (b & 0x1f) {
      const shift = octave + ((b & 0x10) ? 1 : 0);
      note = notes[b & 0x0f] << shift;
    }
    const f = (note && !(flags & 8)) ? (lowNibble ? note : note << 4) : 0;
    for (let t = 0; t < ticks; t++) {
      out.push({ f, w: waveform & 7, v: f ? volume & 0x0f : 0 });
    }
  }
  return out;
}

const pointers = [...Array(6)].map((_, i) => word(POINTER_TABLE + i * 2));
console.log('sequence pointers:', pointers.map((p) => `$${p.toString(16).toUpperCase()}`).join(' '));

// Voice 0 carries the bass, voice 1 the lead; the pointer table pairs them.
const TUNES = {
  prelude: { bass: pointers[0], lead: pointers[2] },
  intermission: { bass: pointers[1], lead: pointers[3] },
};

const decodeTune = (t) => [
  decode(t.bass, { lowNibble: true }),
  decode(t.lead),
];

if (process.argv.includes('--check')) {
  // The start tune has a known register capture, so decoding it is a test of
  // the decoder itself rather than of the ROM.
  const [bass, lead] = decodeTune(TUNES.prelude);
  const [refBass, refLead] = unpackDump(SND_PRELUDE, 2);
  // Compare the note sequences rather than tick-for-tick. The capture drifts
  // by a frame here and there against a clean decode — it was taken off a
  // running machine — but the notes it plays are the thing being checked.
  const events = (ticks) => {
    const out = [];
    let prev = null;
    for (const s of ticks) {
      const key = `${s.f}/${s.w}`;
      if (key !== prev) { out.push({ f: s.f, w: s.w, n: 1 }); prev = key; }
      else out[out.length - 1].n += 1;
    }
    return out;
  };
  const compare = (got, want, label) => {
    const a = events(got);
    const b = events(want);
    const n = Math.min(a.length, b.length);
    let same = 0;
    let firstBad = null;
    for (let i = 0; i < n; i++) {
      if (a[i].f === b[i].f && a[i].w === b[i].w) same++;
      else if (firstBad === null) firstBad = i;
    }
    const drift = a.slice(0, n).map((e, i) => Math.abs(e.n - b[i].n));
    console.log(`${label}: decoded ${got.length} ticks / ${a.length} notes,`
      + ` capture ${want.length} ticks / ${b.length} notes`);
    console.log(`        ${same}/${n} notes identical in pitch and waveform`
      + `, worst length drift ${Math.max(...drift)} frame(s)`
      + (firstBad === null ? '' : `, first mismatch at note ${firstBad}`));
  };
  compare(bass, refBass, 'bass ');
  compare(lead, refLead, 'lead ');
  process.exit(0);
}

const [bass, lead] = decodeTune(TUNES.intermission);
console.log(`\nintermission: bass ${bass.length} ticks, lead ${lead.length} ticks`);

// Store note events rather than one entry per frame: the same information in
// a fraction of the space, and legible in a diff.
const events = (ticks) => {
  const out = [];
  for (const s of ticks) {
    const last = out[out.length - 1];
    if (last && last[0] === s.f && last[1] === s.w && last[2] === s.v) last[3] += 1;
    else out.push([s.f, s.w, s.v, 1]);
  }
  return out;
};

const voices = [events(bass), events(lead)];
const body = voices.map((v, i) => {
  const lines = [];
  for (let i2 = 0; i2 < v.length; i2 += 6) {
    lines.push('    ' + v.slice(i2, i2 + 6).map((e) => `[${e.join(',')}]`).join(', '));
  }
  return `  // voice ${i}: ${v.length} notes, ${v.reduce((a, e) => a + e[3], 0)} frames\n`
    + `  [\n${lines.join(',\n')},\n  ]`;
}).join(',\n');

const out = `// Generated by tools/extract-music.mjs — do not edit by hand.
//
// The coffee-break tune, decoded from the sequences the program ROM feeds to
// its music player. Unlike the start tune there is no register capture of it
// to borrow, so it is read out of the ROM directly; the same decoder
// reproduces the start tune note for note against its capture, which is what
// says the reading is right (\`--check\` in the tool).
//
// Each entry is [frequency register, waveform, volume, frames].
//
// PAC-MAN is a trademark of Bandai Namco. This project is an unofficial
// tribute; see README.md.

export const SND_INTERMISSION = [
${body},
];
`;
const target = new URL('../src/musicdata.js', import.meta.url);
writeFileSync(target, out);
console.log(`wrote ${target.pathname}`);
