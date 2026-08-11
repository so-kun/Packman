# Fidelity checklist

What is reproduced exactly, what is modelled from documentation, and what is
still guessed. Kept honest so nobody has to read the source to find out which
is which.

## Sources

- **Jamey Pittman, *The Pac-Man Dossier*** — ghost AI, speed tables, timers,
  the ghost-house release rules and the level-256 bug. This is where the
  gameplay in `src/game.js`, `src/ghosts.js` and `src/constants.js` comes from.
- **Chris Lomont, *Pac-Man Emulation Guide*** — board hardware: Z80 memory map,
  the tile/sprite video, the Namco WSG.
- **The program ROM's own music player**, at `$2D44` — the sequence format the
  coffee-break tune is decoded from. Reading it needs the disassembly in
  shaunlebron/pacman (`doc/disasm/`), which also carries the ROM image.
- **floooh/pacman.c** (MIT) — carries the ROM and PROM dumps as plain arrays,
  plus two captures of the sound chip's register writes. The blobs in
  `src/romdata.js` and the playfield tile map in `src/maze.js` come from there;
  `tools/extract-rom-data.py` regenerates the former.
- **MAME's pacman driver** — the tile and sprite bit layouts, and the colour
  ladder the palette decode implements.

## Exact — ROM data, or algorithms that follow the hardware

| Item | Where |
|---|---|
| **Tile artwork: the actual `pacman.5e` ROM**, 256 tiles of 8x8 at 2bpp | `src/romdata.js`, `src/rom.js` |
| **Sprite artwork: the actual `pacman.5f` ROM**, 64 sprites of 16x16 | `src/romdata.js`, `src/rom.js` |
| **Colour PROM `82s123.7f` and palette PROM `82s126.4a`** | `src/romdata.js` |
| Resistor-ladder colour decode; blue is a 2-bit channel and saturates lower | `src/rom.js` |
| Pen 0 of every colour code is transparent, which is how sprites overlay tiles | `src/rom.js` |
| Tile/sprite bit order: one byte is an 8x4 column strip, planes at bits 7-4 and 3-0 | `src/rom.js` |
| Text tiles at their ASCII code points, with `/ - " !` relocated | `src/rom.js` |
| Playfield tile map, including the hollow wall blocks and their pre-drawn corners | `src/maze.js` |
| Ghost-house door on pen 2, needing its own colour cell to read pink | `src/render.js` |
| Sprite numbering: Pac-Man 44-48, death 52-63, ghosts 32-39, frightened 28-29, score 40-43, fruit 0-7 | `src/rom.js` |
| The maker's wordmark, tiles 0x28-0x2E — proportionally spaced, so it cannot be set in the text font | `src/render.js` |
| Pac-Man's left and up animations are the right/down artwork flipped | `src/render.js` |
| Ghost bodies are one sprite set recoloured; the eyes-only colour code hides the body | `src/render.js` |
| **Sound waveform PROM `82s126.1m`**: 8 waveforms of 32 4-bit samples | `src/romdata.js` |
| WSG voice model: 20-bit accumulator at 96 kHz, top 5 bits index the waveform, 4-bit volume | `src/audio.js` |
| Waveform periods: four of the eight ROM waveforms are not single-cycle, so they sound 2x, 8x or 15x their register value | `src/audio.js` |
| **Start-of-round tune: a capture of the original's register writes**, 245 ticks over 2 voices | `src/romdata.js`, `src/audio.js` |
| **Death sound: a capture of the original's register writes**, 90 ticks | `src/romdata.js`, `src/audio.js` |
| **Coffee-break tune: decoded from the program ROM's own music sequences** | `src/musicdata.js`, `src/audio.js` |
| Music sequence format: duration table at `$3BB0`, semitone table at `$3BB8`, commands `F0`-`F4`/`FF` | `tools/extract-music.mjs` |
| Eat-dot, eat-ghost and eat-fruit register programs | `src/audio.js` |
| Frightened sound: ramp resetting every 8 ticks | `src/audio.js` |

## Modelled — written from published documentation, not from the ROM

| Item | Where |
|---|---|
| Four ghost targeting rules, including Pinky's and Inky's up-vector overflow | `src/ghosts.js` |
| Scatter/chase schedule per level, and the forced reversal on each switch | `src/game.js` |
| Speed tables: normal, frightened, tunnel, Cruise Elroy | `src/constants.js` |
| Ghost-house release: personal dot counters, the global counter after a death, the no-dot timer | `src/game.js` |
| Cornering, tile-coincidence collision (so the original's pass-throughs happen) | `src/actors.js` |
| The 1-frame stop on a dot and 3-frame stop on an energizer | `src/game.js` |
| Fruit at 70 and 170 dots; ghost chain scoring 200/400/800/1600 | `src/game.js` |
| Level-256 kill screen: 8-bit counter overflow, garbled right half, too few dots to clear | `src/killscreen.js` |
| Coin insert: measured off a recording rather than captured — a V from 633 Hz down to 76 and up to 856 over 14 ticks, on waveform 2 | `src/audio.js` |
| Eyes returning home: measured — a sawtooth falling 2484 Hz to 375 over 16 ticks and snapping back, on waveform 6 | `src/audio.js` |

## Approximated — still guesses

| Item | Why | Where |
|---|---|---|
| **Random number sequence** | The original's PRNG state is in the program ROM, which this project does not run. Pattern strategies from the arcade will not transfer. | `src/ghosts.js` |
| **Siren stages 1-4** | Only the base cycle is captured. The waveform, volume and 24-tick period are the original's; the per-stage rise in pitch and rate is by ear. | `src/audio.js` |
| **Energizer and extend sounds** | No register capture covers them and they have not been measured. They use the ROM waveforms and the same register model, but their contours are chosen by ear. | `src/audio.js` |
| The attract screen's small "PTS" face | The ROM packs it two characters to a tile; it is redrawn rather than unpacked. | `src/render.js` |
| Kill-screen garbage layout | Drawn from real tile and colour codes, but which codes land where is this project's PRNG, not the original's corrupted memory. | `src/killscreen.js` |
| Cutscene staging | Timings and positions are eyeballed from recordings. | `src/cutscenes.js` |
| Lives and fruit counters at the screen edges | Drawn from sprites; the original draws them from 2x2 tile blocks. Same picture, different mechanism. | `src/render.js` |

## Not attempted

Running the program ROM. The gameplay logic lives inside it, so an emulator
would reproduce the original bit for bit — including its random sequence — but
would also require the copyrighted ROM image to be present at run time. This
project reimplements the logic instead, and uses ROM contents only for what
cannot be derived from documentation: artwork, colour, sound waveforms and the
music. The music extraction reads the program ROM offline and commits its
output; the ROM itself is not part of this repository and the game does not
need it.
