import { describe, expect, it } from 'vitest';

import type { Word } from './types';
import {
  editDistance,
  similarity,
  soundex,
  suggestCorrections,
} from './vocab';

const words = (texts: string[]): Word[] =>
  texts.map((text, i) => ({
    id: `w${i}`,
    text,
    origText: text,
    start: i,
    end: i + 1,
    conf: 0.9,
    edited: false,
    timeLocked: false,
  }));

describe('soundex', () => {
  it('collapses different spellings of the same sound', () => {
    // The real failures from the 39-minute call, all meaning "Amadeus".
    expect(soundex('Amadius')).toBe(soundex('Amadeus'));
    expect(soundex("Amadie's")).toBe(soundex('Amadeus'));
  });

  it('produces a four-character key', () => {
    for (const term of ['Amadeus', 'ARC', 'a', 'Nigeria']) {
      expect(soundex(term)).toHaveLength(4);
    }
  });

  it('distinguishes genuinely different words', () => {
    expect(soundex('Amadeus')).not.toBe(soundex('booking'));
  });

  it('returns empty for input with no letters', () => {
    expect(soundex('123')).toBe('');
    expect(soundex('...')).toBe('');
  });
});

describe('editDistance and similarity', () => {
  it('measures ordinary near-misses', () => {
    expect(editDistance('iata', 'iatta')).toBe(1);
    expect(similarity('IATA', 'IATTA')).toBeGreaterThan(0.7);
  });

  it('is 1 for identical words and ignores case and punctuation', () => {
    expect(similarity('ARC', 'arc,')).toBe(1);
  });

  it('scores unrelated words low', () => {
    expect(similarity('Amadeus', 'booking')).toBeLessThan(0.4);
  });
});

describe('suggestCorrections', () => {
  it('finds a phonetic mis-spelling of a supplied term', () => {
    const found = suggestCorrections(
      words(['we', 'used', 'Amadius', 'API']),
      ['Amadeus']
    );

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      term: 'Amadeus',
      found: 'Amadius',
      reason: 'phonetic',
      count: 1,
    });
  });

  it('finds a spelling near-miss that is not phonetically equal', () => {
    const found = suggestCorrections(words(['the', 'IATTA', 'number']), ['IATA']);

    expect(found.map((s) => s.found)).toContain('IATTA');
  });

  it('does not suggest a term that is already correct', () => {
    expect(suggestCorrections(words(['the', 'ARC', 'number']), ['ARC'])).toEqual(
      []
    );
  });

  it('ranks by how many occurrences a fix would correct', () => {
    const found = suggestCorrections(
      words(['Amadius', 'Amadius', 'Amadius', "Amadie's"]),
      ['Amadeus']
    );

    // Fixing the term that occurs three times is worth more attention.
    expect(found[0]!.found).toBe('Amadius');
    expect(found[0]!.count).toBe(3);
  });

  it('ignores very short tokens, which would match everything', () => {
    const found = suggestCorrections(words(['a', 'an', 'is']), ['ARC']);

    expect(found).toEqual([]);
  });

  it('returns nothing without a vocabulary', () => {
    expect(suggestCorrections(words(['anything']), [])).toEqual([]);
    expect(suggestCorrections(words(['anything']), ['  '])).toEqual([]);
  });

  it('does not suggest unrelated words', () => {
    const found = suggestCorrections(
      words(['because', 'the', 'documentation', 'difficult']),
      ['Amadeus']
    );

    expect(found).toEqual([]);
  });
});
