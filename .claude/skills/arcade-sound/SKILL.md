---
name: arcade-sound
description: Derive, correct or verify one of the game's sounds against the real arcade machine. Use this whenever a sound is reported as wrong or "different", whenever adding a sound, and whenever touching src/audio.js — including cases phrased as "the music is off", "that effect doesn't sound right", or a complaint about a specific moment like eating a ghost or inserting a coin. The method is measurement, not ear-tuning, and there is one hardware trap that makes wrong answers sound plausible.
---

# Deriving a sound from the machine

Every sound is a list of per-tick register values `{f, w, v}` fed to an
emulation of the board's Namco WSG. Getting one right means finding the real
`f` contour and the real `w`, not something that sounds close.

## First: where does this sound already come from?

Check `docs/fidelity-checklist.md` before measuring anything. Sounds that came
out of the original's own routines — eat-dot, eat-ghost, eat-fruit, frightened —
are already exact, and a complaint about "the sound after eating a ghost" more
likely concerns a neighbour (there, the eyes-returning loop). Measuring the
recordings of the neighbours is cheap and tells you which one actually moved.

An energizer has no sound of its own on the real board. If something seems to
be missing a sound, check the original's behaviour before inventing one.

## The trap: four waveforms are not single-cycle

The waveform PROM holds eight 32-sample waveforms, but they do not all complete
one cycle in those 32 samples:

| waveform | cycles per table | sounds at |
|---|---|---|
| 0, 1, 3, 6 | 1 | the register value |
| 2, 7 | 2 | 2x |
| 4 | 8 | 8x |
| 5 | 15 | 15x |

Two consequences, both of which have already caused a wrong answer here:

- **Comparing harmonic ratios naively picks the wrong waveform.** Waveform 5's
  energy sits at bin 15, so a comparison over bins 1-8 reads noise and happily
  reports a match.
- **Anything written in Hz has to divide by the multiple.** `WAVEFORM_CYCLES`
  in `src/audio.js` records it; a test re-derives the table from the ROM by DFT
  so the constant cannot drift.

An effect at the wrong octave still sounds like a working effect. This is the
failure that survives listening, so let the tool decide the waveform.

## Procedure

Clone the recordings first — see `.claude/rules/sources.md`. Then:

**1. Measure the contour.** One row per 60 Hz tick, which is the grid the
hardware reprograms its voices on.

```sh
node tools/measure-sound.mjs <recording.mp3> [floorDb]
```

Read the shape off the output rather than any single number: where it rises,
where it turns, where it repeats. A looping sound's period is the tick count
between repeats, and it matters — a program whose length is the real period
loops seamlessly as a rendered buffer.

The tool reports the strongest partial, deliberately. Autocorrelation loses a
fast sweep and a harmonic product spectrum is worse than useless here, because
folding by 2 zeroes out the fundamental of the odd-harmonic waveforms.

**2. Fit the waveform.** Feed back the contour you just read:

```sh
node tools/measure-sound.mjs <recording.mp3> --fit <startHz> <endHz> <ticks> <firstTick>
```

This synthesises your contour on all eight waveforms and compares spectra under
identical analysis, so the smearing a fast sweep causes affects candidate and
recording alike. Take the winner; the margin is usually clear.

**3. Write the register program** in `src/audio.js` and register it in
`SOUND_PROGRAMS`. Prefer expressing it the way the hardware would — a start
register and a constant step, rather than a table of frequencies. When that
lands on round numbers it is evidence you have found the board's own scheme
rather than fitting a curve: the siren's step turned out to be exactly `0x80`
per stage, and its half-period exactly one tick shorter per stage.

**4. Re-measure your own output** and compare against the recording:

```sh
node tools/dump-audio.mjs out.wav <name>
node tools/measure-sound.mjs out.wav
```

Agreement within about 10 Hz across the contour is what a correct fit looks
like. Send the WAV to the user — they can judge it and you cannot.

**5. Pin it with a test** asserting the measured contour, and move the entry in
`docs/fidelity-checklist.md` out of the guessed list. Every sound here was
wrong once; the tests are what stop them going back.

## Polyphonic material

The single-peak measurement cannot follow two voices — bass and lead take turns
being loudest and the trace jumps between them. Music is not a measurement
problem in this project: the tunes come out of the ROM instead, via the
**rom-data** skill.
