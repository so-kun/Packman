// The high-score record, and the name attached to it.
//
// This is a deliberate departure from the arcade rather than a reproduction of
// it. The 1980 board has no name entry — the complete text in its program ROM
// is HIGH SCORE, CREDIT, the roster, the service-mode strings and the
// copyright lines, with no prompt of any kind — and its high score does not
// survive being switched off. Both are additions, kept in the machine's visual
// language but not claimed as fidelity. See docs/fidelity-checklist.md.
//
// Storage lives behind these functions so the rules can be tested without a
// browser, and so a corrupt or unavailable localStorage degrades to "no
// record" instead of breaking the game.

export const NAME_LENGTH = 3;
/** A-Z and a space, which is what an arcade initials entry offers. */
export const NAME_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ ';
export const DEFAULT_NAME = 'AAA';

const KEY = 'packman.record';
const LEGACY_KEY = 'packman.highscore'; // scores saved before names existed

const EMPTY = { score: 0, name: '' };

/** Trim to the allowed characters and length; anything else becomes a space. */
export function sanitizeName(name) {
  const upper = String(name ?? '').toUpperCase();
  let out = '';
  for (let i = 0; i < NAME_LENGTH; i++) {
    const ch = upper[i] ?? ' ';
    out += NAME_ALPHABET.includes(ch) ? ch : ' ';
  }
  return out;
}

export function loadRecord(storage) {
  if (!storage) return { ...EMPTY };
  try {
    const raw = storage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const score = Number(parsed?.score);
      if (Number.isFinite(score) && score >= 0) {
        return { score: Math.floor(score), name: sanitizeName(parsed?.name) };
      }
    }
    // A score saved by an earlier version has no name to go with it.
    const legacy = Number(storage.getItem(LEGACY_KEY));
    if (Number.isFinite(legacy) && legacy > 0) return { score: Math.floor(legacy), name: '' };
  } catch {
    // Corrupt JSON, or storage blocked by the browser: start from nothing.
  }
  return { ...EMPTY };
}

export function saveRecord(storage, score, name) {
  const record = { score: Math.floor(Number(score) || 0), name: sanitizeName(name) };
  try {
    storage?.setItem(KEY, JSON.stringify(record));
    // Keep the old key in step so downgrading does not lose the score.
    storage?.removeItem(LEGACY_KEY);
  } catch {
    // Private browsing and full quotas both throw; the game plays on.
  }
  return record;
}

/** Step one character of the name up or down the alphabet, wrapping round. */
export function cycleLetter(ch, delta) {
  const at = NAME_ALPHABET.indexOf(ch);
  const from = at < 0 ? 0 : at;
  const n = NAME_ALPHABET.length;
  return NAME_ALPHABET[(((from + delta) % n) + n) % n];
}
