# Packman

A browser recreation of the 1980 Namco Pac-Man arcade machine. The gameplay
logic is reimplemented from published documentation; the artwork, colours,
sound waveforms and music are the board's own data, read out of its ROMs.

That split is the project's one governing decision. Most questions that come up
resolve against it: if a thing can be read out of the ROM, read it rather than
recreating it — hand-drawn artwork and synthesised approximations are what this
project spent its early history getting wrong.

`docs/fidelity-checklist.md` is the truth table for which parts of the game are
ROM data, which are measured, and which are still guesses. Keep it current in
the same commit as the change — it is where a reader finds out whether what
they are seeing and hearing is the arcade or an imitation of it.

## Commands

```sh
npm test                  # ROM decode and sound generation
npm run serve             # local server on :8123 — npm run shots needs it
npm run shots -- <dir>    # headless capture of nine screens; fails on page errors
```

## Layout

```
src/rom.js        decodes the graphics ROMs and palette PROMs into pixels and colours
src/romdata.js    generated — ROM/PROM blobs, two sound-register captures
src/musicdata.js  generated — the coffee-break tune, decoded from the program ROM
src/audio.js      Namco WSG emulation, and every sound as a register program
src/render.js     draws the game from ROM tiles and sprites
tools/            extraction, measurement and verification
```

Two skills cover the work that recurs here: **arcade-sound** for deriving or
correcting a sound, **rom-data** for regenerating the extracted data.

@.claude/rules/sources.md
@.claude/rules/fidelity.md
@.claude/rules/verification.md
