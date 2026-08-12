# Verifying a change

Sound and graphics both fail quietly here. A wrong pixel order still draws
something, a wrong waveform still makes a noise, and a sound at the wrong
octave still sounds like a working effect. So the check is never "does it run".

**Run both**, every time:

```sh
npm test                 # tests over the ROM decode, the sound generator and the record store
npm run shots -- <dir>   # ten screens headless; exits non-zero on any page error
```

`npm run shots` needs `npm run serve` in another shell and Playwright resolvable
(`playwright` is a devDependency; in a sandbox a symlink to a global install
works). It drives the three coffee breaks directly rather than playing to board
9, and puts the game into name entry rather than requiring a record-beating
run, so both are visible without playing for an hour.

Two things about browser audio that headless runs hide. Playwright launches
Chromium with `--autoplay-policy=no-user-gesture-required`, so a run that
proves sound works has proved nothing about a real browser — pass
`ignoreDefaultArgs: ['--autoplay-policy=no-user-gesture-required']` when the
question is whether audio starts at all. And a tab that was in the background
when the game loaded gets an AudioContext that stays suspended: the game looks
fine and is silent. `AudioEngine.live` refuses to emit into a stopped clock and
`resume()` retries on every gesture and on `visibilitychange`, which is what
makes it recover; the tests around `fakeContext` pin that.

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
