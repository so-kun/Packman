# External material

None of this is vendored: it is copyrighted, and the game does not need it at
run time. It is only required to regenerate `src/romdata.js` and
`src/musicdata.js`, or to check a sound against the machine. Clone into a
scratch directory, not into the repository.

| What | Where | Used for |
|---|---|---|
| ROM and PROM dumps as C arrays, plus register captures of the start tune and death sound | `github.com/floooh/pacman.c` (MIT), `pacman.c` | `tools/extract-rom-data.py` |
| The 16 KB program ROM and annotated Z80 disassemblies | `github.com/shaunlebron/pacman`, `doc/disasm/ida/pacman.rom` and `doc/disasm/*.asm` | `tools/extract-music.mjs`, reading the sound player at `$2D44` |
| Recordings of the machine, one file per sound | `github.com/masonicGIT/pacman` (a fork), `sounds/` | `tools/measure-sound.mjs` |

```sh
git clone --depth 1 https://github.com/floooh/pacman.c   /tmp/src/floooh
git clone --depth 1 https://github.com/shaunlebron/pacman /tmp/src/shaunlebron
git clone --depth 1 https://github.com/masonicGIT/pacman  /tmp/src/masonic
```

Two things worth knowing before you go looking:

- The recordings live in the **masonicGIT fork**, not in shaunlebron's own
  repository — they were removed upstream. `sounds/` there has one MP3 per
  sound, including all five siren stages (`ghost-normal-move` plus
  `ghost-spurt-move-1..4`) and the coffee-break tune.
- shaunlebron/pacman is GPLv3. Its recordings and disassembly are read as
  reference material; do not copy code from it into this repository.

The environment here has no MP3 decoder on the command line — the Playwright
build of ffmpeg is stripped down and cannot read MP3. `tools/measure-sound.mjs`
works around this by decoding in headless Chromium, which is why it needs
Playwright.
