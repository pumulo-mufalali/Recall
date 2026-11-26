import { describe, expect, it } from 'vitest';
import { exampleData } from './example';
import { trustFrom } from './audit';
import { dueCards } from './schedule';
import { levelOf, playedToday, totalXp } from './gauntlet';
import { dayKey, streak } from './stats';
import { isAttempt, isCard, isDeck } from './valid';

const now = new Date('2026-11-26T14:00:00');
const data = exampleData(now);

describe('example data', () => {
  it('is the same every time', () => {
    expect(exampleData(now)).toEqual(data);
  });

  it('passes the store’s shape checks', () => {
    expect(data.decks.every(isDeck)).toBe(true);
    expect(data.cards.every(isCard)).toBe(true);
    expect(data.attempts.every(isAttempt)).toBe(true);
  });

  it('only answers cards that exist, after their deck was made, and none today', () => {
    const cards = new Map(data.cards.map((c) => [c.id, c]));
    expect(data.attempts.length).toBeGreaterThan(150);
    for (const a of data.attempts) {
      const card = cards.get(a.cardId)!;
      expect(card).toBeDefined();
      expect(a.deckId).toBe(card.deckId);
      expect(Date.parse(a.at)).toBeGreaterThanOrEqual(Date.parse(card.createdAt));
      expect(dayKey(new Date(a.at))).not.toBe(dayKey(now));
    }
  });

  it('has cards due now, and some never studied', () => {
    expect(dueCards(data.cards, now).length).toBeGreaterThanOrEqual(3);
    expect(data.cards.some((c) => c.srs.state === 0)).toBe(true);
  });

  it('gives the deck counts their cards', () => {
    for (const d of data.decks) expect(data.cards.filter((c) => c.deckId === d.id).length).toBe(d.cardCount);
  });

  it('leaves today’s gauntlet to play, with a level and a streak to show', () => {
    expect(playedToday(data.runs, now)).toBe(false);
    expect(levelOf(totalXp(data.attempts, data.runs)).level).toBeGreaterThanOrEqual(3);
    // No answers today yet: the streak counts up to yesterday.
    expect(streak(data.attempts, new Date(now.getTime() - 86_400_000))).toBeGreaterThanOrEqual(5);
  });

  it('gives Nano a trust score worth showing', () => {
    const t = trustFrom(data.audits);
    expect(t.mean).toBeGreaterThan(0.7);
    expect(t.mean).toBeLessThan(0.95);
  });

  it('plans a session in the future', () => {
    expect(Date.parse(data.sessions[0].at)).toBeGreaterThan(now.getTime());
  });
});
