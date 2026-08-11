# Fidelity policy

Everything the game draws or plays comes from one of four places. They are
ranked, and the ranking is the whole point: work down it only when the step
above is genuinely unavailable.

1. **ROM or PROM data** — artwork, colours, sound waveforms, the music
   sequences. Not reproducible from documentation at any effort, because it is
   data rather than an algorithm.
2. **A capture of the original's register writes** — the start tune and the
   death sound. Exact, and borrowed rather than derived.
3. **A measurement of a recording** — the coin, eyes-returning, siren and
   extend sounds. Objective, but limited by the recording.
4. **A guess.** Last resort, and it has to be written down as one.

Documentation follows the same move: when something changes rank, update
`docs/fidelity-checklist.md` and the matching line in `README.md` in the same
commit. A silent upgrade is worse than none — the value of the checklist is
that a reader can trust it without reading the source.

## Two mistakes this project has already made

**Recreating what could have been read.** The maze outline was traced by hand,
the sprites drawn procedurally, the colours picked by eye. Five of those
colours were ones the hardware physically cannot produce. If you find yourself
writing artwork or a waveform, stop and check whether the ROM has it.

**Claiming more than was done.** The README asserted no ROM-derived data was
used, and stayed that way after it stopped being true. When the posture
changes — and reading the program ROM for the music was a real change — say so
plainly in `README.md`'s rights section rather than letting an old claim stand.

## What is deliberately not attempted

Running the program ROM. It would reproduce the original bit for bit, including
its random sequence, but would require shipping the copyrighted image. The
logic is reimplemented instead. The ROM is read offline by
`tools/extract-music.mjs` and its output committed; nothing at run time needs
it.
