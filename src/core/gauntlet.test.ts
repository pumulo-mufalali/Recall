import { describe, expect, it } from 'vitest';
import { attemptXp, levelOf, pickCards, playedToday, pointsFor, toRulings, toStatements, totalXp, trapsPrompt, type GauntletRun } from './gauntlet';
import { route } from './route';
import type { Attempt, Card } from './types';

const card = (id: string, stability = 3): Card => ({
  id, deckId: 'd', prompt: `Q ${id}`, answer: `A ${id}`, keyPoints: [], createdAt: '', madeBy: 'local',
  srs: { due: '', stability, difficulty: 5, scheduledDays: 1, learningSteps: 0, reps: 1, lapses: 0, state: 2 },
});
const attempt = (cardId: string, score: number, at: string, confidence: 1 | 2 | 3 | 4 = 3, answer = 'wrong'): Attempt => ({
  id: cardId + at, cardId, deckId: 'd', at, answer, confidence,
  grade: { score, covered: [], missing: [], feedback: '', engine: 'local' },
});

describe('pickCards', () => {
  const cards = [card('a', 5), card('b', 1), card('c', 9), card('d', 2)];
  it('takes recently missed cards first, once each, then the weakest others', () => {
    const attempts = [attempt('c', 0.2, '2026-11-20'), attempt('a', 0.1, '2026-11-22'), attempt('a', 0.0, '2026-11-21'), attempt('d', 0.9, '2026-11-23')];
    expect(pickCards(cards, attempts, 3).map((c) => c.id)).toEqual(['a', 'c', 'b']);
  });
  it('works with no history at all', () => {
    expect(pickCards(cards, [], 2).map((c) => c.id)).toEqual(['b', 'd']);
  });
});

describe('trapsPrompt', () => {
  it('includes the learner\'s wrong answer when there is one', () => {
    const p = trapsPrompt([card('a'), card('b')], [attempt('a', 0.1, 'x', 3, 'a germ'), undefined]);
    expect(p).toContain("Student's wrong answer: a germ");
    expect(p.split("Student's wrong answer").length).toBe(2);
  });
});

describe('toStatements', () => {
  it('keeps well-formed statements and drops the rest', () => {
    const s = toStatements({ statements: [
      { card: 0, text: 'Antigens are recognised by the immune system.', truth: true, why: 'Model answer.' },
      { card: 0, text: 'An antigen is a whole germ.', truth: 'false', why: 'It is a molecule.' },
      { card: 5, text: 'Out of range card index here.', truth: true, why: '' },
      { card: 1, text: 'short', truth: true, why: '' },
      { card: 1, text: 'No label on this statement at all.', why: '' },
      { card: 0, text: 'an antigen is a whole germ.', truth: false, why: 'duplicate' },
    ] }, 2);
    expect(s).toHaveLength(2);
    expect(s.find((x) => x.text.startsWith('An antigen'))?.truth).toBe(false);
  });
  it('returns nothing for a malformed reply', () => {
    expect(toStatements(null, 3)).toEqual([]);
    expect(toStatements({ statements: 'nope' }, 3)).toEqual([]);
  });
});

describe('toRulings', () => {
  it('reads valid rulings only', () => {
    const r = toRulings({ rulings: [{ statement: 0, fair: true, reason: 'ok' }, { statement: 1, fair: false, reason: 'label wrong' }, { statement: 9, fair: false }, { statement: 2, fair: 'no' }] }, 3);
    expect(r).toEqual([{ statement: 0, fair: true, reason: 'ok' }, { statement: 1, fair: false, reason: 'label wrong' }]);
  });
});

describe('scoring', () => {
  it('rewards honest confidence', () => {
    expect(pointsFor(true, true)).toBe(3);
    expect(pointsFor(true, false)).toBe(1);
    expect(pointsFor(false, false)).toBe(0);
    expect(pointsFor(false, true)).toBe(-2);
    expect(pointsFor(null, true)).toBe(0);
  });
  it('gives study XP for honest answers', () => {
    expect(attemptXp(1, 4)).toBe(4);
    expect(attemptXp(0.2, 4)).toBe(0);
    expect(attemptXp(0.2, 1)).toBe(1);
  });
  it('adds counted gauntlets, never negative', () => {
    const runs: GauntletRun[] = [
      { id: '1', at: '', points: 10, right: 5, answered: 6, withdrawn: 0, counted: true },
      { id: '2', at: '', points: -4, right: 1, answered: 6, withdrawn: 0, counted: true },
      { id: '3', at: '', points: 12, right: 6, answered: 6, withdrawn: 0, counted: false },
    ];
    expect(totalXp([attempt('a', 1, 'x', 4)], runs)).toBe(4 + 20);
  });
});

describe('levels', () => {
  it('needs 50 more XP each level', () => {
    expect(levelOf(0)).toMatchObject({ level: 1, into: 0, need: 50, title: 'Newcomer' });
    expect(levelOf(49).level).toBe(1);
    expect(levelOf(50)).toMatchObject({ level: 2, into: 0, need: 100 });
    expect(levelOf(160)).toMatchObject({ level: 3, into: 10, need: 150 });
  });
  it('knows whether today\'s gauntlet counted', () => {
    const now = new Date(2026, 10, 25, 15);
    const run = (at: Date, counted: boolean): GauntletRun => ({ id: 'x', at: at.toISOString(), points: 1, right: 1, answered: 1, withdrawn: 0, counted });
    expect(playedToday([run(new Date(2026, 10, 25, 9), true)], now)).toBe(true);
    expect(playedToday([run(new Date(2026, 10, 25, 9), false), run(new Date(2026, 10, 24, 9), true)], now)).toBe(false);
  });
});

describe('gauntlet routing', () => {
  it('writes traps on the device when it can, else the cloud', () => {
    expect(route({ kind: 'gauntlet' }, { online: true, device: 'available' })).toMatchObject({ run: 'model', mode: 'only_on_device' });
    expect(route({ kind: 'gauntlet' }, { online: true, device: 'unavailable' })).toMatchObject({ run: 'model', mode: 'only_in_cloud' });
    expect(route({ kind: 'gauntlet' }, { online: false, device: 'unavailable' }).run).toBe('local');
  });
  it('referees in the cloud only', () => {
    expect(route({ kind: 'referee' }, { online: true, device: 'available' })).toMatchObject({ run: 'model', mode: 'only_in_cloud' });
    expect(route({ kind: 'referee' }, { online: false, device: 'available' }).run).toBe('local');
  });
});
