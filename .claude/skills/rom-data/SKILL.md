---
name: rom-data
description: Work with the data extracted from the arcade board's ROMs — regenerating src/romdata.js or src/musicdata.js, finding a tile or sprite number, understanding how a colour code becomes a colour, or decoding something new out of the program ROM such as a tune or a sound table. Use this whenever a change touches src/rom.js, src/romdata.js, src/musicdata.js or tools/extract-*, whenever artwork or a colour looks wrong, and whenever a piece of the game seems to need data that documentation cannot supply.
---

# The extracted ROM data

Two generated files, two generators. Neither the source material nor the
program ROM lives in this repository — see `.claude/rules/sources.md` for where
to clone them.

```sh
python3 tools/extract-rom-data.py /tmp/src/floooh/pacman.c        # -> src/romdata.js
node tools/extract-music.mjs /tmp/src/shaunlebron/doc/disasm/ida/pacman.rom
                                                                   # -> src/musicdata.js
node tools/extract-music.mjs <pacman.rom> --check                  # proves the decoder
```

`src/romdata.js` carries the tile ROM, sprite ROM, both colour PROMs, the WSG
waveform PROM, and register captures of the start tune and death sound.
`src/musicdata.js` carries the coffee-break tune. Both are generated: edit the
tool, never the output.

## Graphics

`src/rom.js` does the decoding and is the place to read for detail. The facts
worth knowing before you go looking:

- A ROM byte is an **8x4 column strip**, the high plane in bits 7-4 and the low
  plane in bits 3-0. Tiles are two strips, sprites eight. The display is rotated
  90 degrees on the real cabinet, which is why the stored artwork looks
  counter-rotated.
- Colour arrives through two PROMs and a resistor ladder. **Blue is a 2-bit
  channel** where red and green have three, so blue saturates lower — the maze
  is `#2121de`, never a bright blue. Colours that are not in the palette are
  wrong by construction; do not hand-pick hex values.
- **Pen 0 of every colour code is transparent.** That is how sprites overlay
  tiles, and it is why a tile drawn with the wrong colour code can vanish: the
  ghost-house door draws on pen 2, and only code `0x18` makes pen 2 pink. Under
  the playfield's own code it renders black and disappears.
- Sprite and colour numbers are in `SPRITE_CODE` and `COLOR_CODE`. Ghosts are
  one sprite set recoloured; the eyes are the same sprites under the eyes-only
  colour code.

To see what a code actually is, render it rather than reasoning about it:

```sh
node tools/dump-gfx.mjs out.png    # all 256 tiles and 64 sprites
```

## The music sequence format

The board does not store music as register values. It stores compact sequences
that a player routine at `$2D44` walks once per frame. `tools/extract-music.mjs`
implements that routine; this is the format it reads.

```
$3BC8   six 16-bit pointers, one per voice and tune
$3BB0   durations: 1, 2, 4, 8, 16, 32, 64, 128 frames
$3BB8   silence, then thirteen semitones, 87..195

F0 lo hi   jump — how a tune loops        F3 n   volume
F1 n       waveform                       F4 n   flags, bit 3 mutes
F2 n       octave, as a left shift        FF     end
```

Any other byte is a note: duration from bits 5-7, pitch from `notes[b & 0x0F]`
shifted left by the octave plus one more if bit 4 is set, and a hold on the
previous note if bits 0-4 are all clear. Voice 0's frequency register has five
nibbles where voices 1 and 2 have four, so theirs is shifted up another four
bits.

**The decode is checkable, and that is the point.** The start tune exists both
as a sequence in ROM and as a register capture, so decoding it tests the
decoder rather than the ROM. `--check` compares them and should report every
note identical in pitch and waveform, with note lengths drifting by at most a
frame or two — the capture came off a running machine, the decode is clean.
Run it before trusting anything decoded that has no capture to check against.

## Decoding something new

The disassembly in shaunlebron/pacman is how the format above was recovered,
and the same route is open for anything else. `z80dis` (pip) disassembles the
ROM directly, which is often quicker than searching the annotated `.asm` files:

```py
from z80dis import z80
ins = z80.decode(rom[pc:pc+4], pc); print(z80.disasm(ins))
```

Look for the jump table a routine dispatches through — the sound player's sits
inline at `$2D85` right after its `RST 0x20` — and for lookup tables reached by
`RST 0x10`. Prefer finding ground truth to check against before trusting a
newly decoded structure; that is what made the music decode believable rather
than merely plausible.
