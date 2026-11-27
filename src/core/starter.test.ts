import { describe, expect, it } from 'vitest';
import { STARTER_DECKS, starterDeckId } from './starter';

describe('starter decks', () => {
  it('are three real documents, each with its source', () => {
    expect(STARTER_DECKS.length).toBe(3);
    for (const d of STARTER_DECKS) {
      expect(d.title.trim()).not.toBe('');
      expect(d.publisher.trim()).not.toBe('');
      expect(d.url).toMatch(/^https:\/\/\S+\.pdf$/);
      expect(d.madeBy).toBe('cloud');
    }
  });

  it('hold usable cards, fact-checked by the cloud', () => {
    for (const d of STARTER_DECKS) {
      expect(d.checkedBy).toBe('cloud');
      expect(d.cards.length).toBeGreaterThanOrEqual(6);
      for (const c of d.cards) {
        expect(c.prompt.trim().length).toBeGreaterThan(5);
        expect(c.answer.trim().length).toBeGreaterThan(0);
        expect(c.keyPoints.length).toBeGreaterThan(0);
        expect(c.keyPoints.every((k) => k.trim().length > 0)).toBe(true);
      }
    }
  });

  it('get stable, distinct ids, so loading twice overwrites rather than duplicates', () => {
    const ids = STARTER_DECKS.map(starterDeckId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^starter-[a-z0-9-]+$/.test(id))).toBe(true);
  });
});
