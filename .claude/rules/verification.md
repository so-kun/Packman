# Verifying a change

Sound and graphics both fail quietly here. A wrong pixel order still draws
something, a wrong waveform still makes a noise, and a sound at the wrong
octave still sounds like a working effect. So the check is never "does it run".

**Run both**, every time:

```sh
npm test                 # 27 tests over the decode and the sound generator
npm run shots -- <dir>   # nine screens headless; exits non-zero on any page error
```

`npm run shots` needs `npm run serve` in another shell and Playwright resolvable
(`playwright` is a devDependency; in a sandbox a symlink to a global install
works). It drives the three coffee breaks directly rather than playing to board
9, so cutscene changes are visible without a long game.

**Look at the screenshots.** They are the only check on layout and colour, and
several real bugs here were invisible to the tests and obvious in an image: the
ghost-house door rendering black, the maze drawn behind a cutscene.

## Pin what you fixed

Every corrected sound in this project got a test asserting its measured
contour, because they had all been wrong once and nothing else would notice
them drifting back. Follow that: a fix without a test that fails on the old
behaviour is half a fix.

Prefer tests that re-derive the expected value from the ROM over tests that
restate a constant — `test/audio.test.mjs` recomputes the waveform period table
by DFT rather than trusting `WAVEFORM_CYCLES`, so the two cannot silently
disagree.

## Look at and listen to the output

```sh
node tools/dump-gfx.mjs out.png            # every tile and sprite, decoded
node tools/dump-audio.mjs out.wav [name]   # one sound, or all of them in sequence
```

Both exist because eyeballing a decode caught things reasoning about it did
not. Send the file to the user when a change is about how something looks or
sounds — they can judge it in a second and you cannot judge it at all.
