// The high-score record: what gets stored, and what happens when the store
// contains something unexpected. localStorage survives across versions of the
// game and can be edited by hand, so none of it can be trusted on the way in.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  loadRecord, saveRecord, sanitizeName, cycleLetter,
  NAME_ALPHABET, NAME_LENGTH, DEFAULT_NAME,
} from '../src/record.js';

/** Minimal stand-in for localStorage. */
function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    get size() { return data.size; },
    dump: () => Object.fromEntries(data),
  };
}

test('an empty store means no record yet', () => {
  assert.deepEqual(loadRecord(fakeStorage()), { score: 0, name: '' });
});

test('a saved record round-trips', () => {
  const storage = fakeStorage();
  saveRecord(storage, 128760, 'PAC');
  assert.deepEqual(loadRecord(storage), { score: 128760, name: 'PAC' });
});

test('a score saved before names existed is still read', () => {
  // Earlier versions wrote a bare number under a different key. Losing
  // someone's high score to a refactor would be a poor trade.
  const storage = fakeStorage({ 'packman.highscore': '54320' });
  assert.deepEqual(loadRecord(storage), { score: 54320, name: '' });
});

test('saving retires the old key so the two cannot disagree', () => {
  const storage = fakeStorage({ 'packman.highscore': '100' });
  saveRecord(storage, 200, 'ABC');
  assert.equal(storage.getItem('packman.highscore'), null);
  assert.equal(loadRecord(storage).score, 200);
});

test('a store full of nonsense reads as no record rather than breaking', () => {
  for (const raw of ['', 'not json', '{', '[]', '{"score":"abc"}', '{"score":-5}', 'null']) {
    const storage = fakeStorage({ 'packman.record': raw });
    assert.deepEqual(loadRecord(storage), { score: 0, name: '' }, `raw: ${raw}`);
  }
});

test('a missing or throwing store is survivable', () => {
  assert.deepEqual(loadRecord(null), { score: 0, name: '' });
  const hostile = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('quota'); },
    removeItem() { throw new Error('blocked'); },
  };
  assert.deepEqual(loadRecord(hostile), { score: 0, name: '' });
  // Private browsing throws on write; the game has to play on regardless.
  assert.deepEqual(saveRecord(hostile, 10, 'ABC'), { score: 10, name: 'ABC' });
});

test('names are forced into the shape the screen can draw', () => {
  assert.equal(sanitizeName('pac'), 'PAC');
  assert.equal(sanitizeName('TOOLONG'), 'TOO');
  assert.equal(sanitizeName('A'), 'A  ', 'short names are padded');
  assert.equal(sanitizeName(''), '   ');
  assert.equal(sanitizeName(undefined), '   ');
  // The font has no punctuation to draw these with, so they become spaces.
  assert.equal(sanitizeName('a1!'), 'A  ');
  assert.equal(sanitizeName('a b'), 'A B');
  for (const name of ['PAC', 'zzz', '###', '']) {
    assert.equal(sanitizeName(name).length, NAME_LENGTH);
  }
});

test('a stored name is sanitized on the way out, not just in', () => {
  // Somebody editing localStorage by hand should not be able to put glyphs on
  // the screen that the ROM font cannot draw.
  const storage = fakeStorage({ 'packman.record': '{"score":10,"name":"<b>"}' });
  // Filtering is per character: the letter survives, the brackets do not.
  assert.equal(loadRecord(storage).name, ' B ');
});

test('the letter wheel wraps in both directions', () => {
  assert.equal(cycleLetter('A', 1), 'B');
  assert.equal(cycleLetter('B', -1), 'A');
  // A is the first entry and space the last, so they meet.
  assert.equal(cycleLetter('A', -1), NAME_ALPHABET[NAME_ALPHABET.length - 1]);
  assert.equal(cycleLetter(NAME_ALPHABET[NAME_ALPHABET.length - 1], 1), 'A');
  // Anything unexpected lands somewhere valid rather than off the end.
  assert.ok(NAME_ALPHABET.includes(cycleLetter('!', 1)));
  assert.ok(NAME_ALPHABET.includes(cycleLetter(undefined, -1)));
  // Walking the whole wheel returns to where it started.
  let ch = 'A';
  for (let i = 0; i < NAME_ALPHABET.length; i++) ch = cycleLetter(ch, 1);
  assert.equal(ch, 'A');
});

test('the default name is one the entry screen can start from', () => {
  assert.equal(sanitizeName(DEFAULT_NAME), DEFAULT_NAME);
});
