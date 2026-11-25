import { describe, expect, it } from 'vitest';
import { agrees, auditStats, decide, doubt, thresholds, trustFrom } from './audit';
import type { Grade } from './types';

const KP = ['light energy is captured', 'carbon dioxide is fixed', 'oxygen is released'];
const g = (covered: string[], engine: Grade['engine'] = 'on-device'): Grade => ({
  score: covered.length / KP.length,
  covered,
  missing: KP.filter((k) => !covered.includes(k)),
  feedback: '',
  engine,
});
const ANSWER = 'Plants capture light energy, fix carbon dioxide into sugar and release oxygen.';

describe('doubt', () => {
  it('is low when Nano is sure and the word check agrees', () => {
    const d = doubt(g(KP), 'high', g(KP, 'local'), ANSWER);
    expect(d.value).toBe(0);
    expect(d.reasons).toEqual([]);
  });
  it('rises with low self-confidence', () => {
    expect(doubt(g(KP), 'low', g(KP, 'local'), ANSWER).value).toBeGreaterThanOrEqual(0.45);
  });
  it('weighs credit without matching words, and missed words, differently', () => {
    const lenient = doubt(g([KP[0], KP[1], KP[2]]), 'high', g([KP[0], KP[1]], 'local'), ANSWER);
    const strict = doubt(g([KP[0], KP[1]]), 'high', g(KP, 'local'), ANSWER);
    expect(lenient.reasons.join()).toMatch(/without matching words/);
    expect(strict.reasons.join()).toMatch(/words are there/);
  });
  it('flags a mark one key point away from flipping', () => {
    // 2 of 3 is 67%: one more point makes it right.
    expect(doubt(g([KP[0], KP[1]]), 'high', g([KP[0], KP[1]], 'local'), ANSWER).reasons.join()).toMatch(/decides/);
  });
  it('flags credit for a near-empty answer', () => {
    expect(doubt(g([KP[0]]), 'high', g([], 'local'), 'light').value).toBeGreaterThan(0.3);
  });
  it('never exceeds 1', () => {
    expect(doubt(g(KP), 'low', g([], 'local'), 'x').value).toBeLessThanOrEqual(1);
  });
});

describe('agrees', () => {
  it('needs close scores on the same side of right', () => {
    expect(agrees(1, 0.8)).toBe(true);
    expect(agrees(0.75, 0.6)).toBe(false); // close, but one is right and one is not
    expect(agrees(0.2, 0.6)).toBe(false);
  });
});

describe('trust', () => {
  it('starts cautious and grows with agreement', () => {
    const none = trustFrom([]);
    const good = trustFrom(Array.from({ length: 40 }, () => ({ agree: true })));
    const bad = trustFrom(Array.from({ length: 40 }, (_, i) => ({ agree: i % 2 === 0 })));
    expect(none.low).toBeLessThan(0.6);
    expect(good.low).toBeGreaterThan(0.85);
    expect(bad.low).toBeLessThan(0.5);
  });
  it('counts only the recent window', () => {
    const audits = [...Array.from({ length: 60 }, () => ({ agree: true })), ...Array.from({ length: 100 }, () => ({ agree: false }))];
    expect(trustFrom(audits).agreed).toBe(60);
  });
});

describe('decide', () => {
  const sure = { value: 0, reasons: [] };
  const unsure = { value: 0.8, reasons: ['Nano was not confident in its own mark'] };
  const fresh = trustFrom([]);
  const trusted = trustFrom(Array.from({ length: 60 }, () => ({ agree: true })));

  it('escalates doubtful marks, keeps sure ones', () => {
    expect(decide(unsure, fresh, 'balanced', true, 0.99).kind).toBe('escalate');
    expect(decide(sure, fresh, 'balanced', true, 0.99).kind).toBe('keep');
  });
  it('spot-checks a sample, less as trust grows', () => {
    expect(decide(sure, fresh, 'balanced', true, 0.1).kind).toBe('spot-check');
    expect(thresholds(trusted, 'balanced').auditRate).toBeLessThan(thresholds(fresh, 'balanced').auditRate);
    expect(thresholds(trusted, 'balanced').escalateAbove).toBeGreaterThan(thresholds(fresh, 'balanced').escalateAbove);
  });
  it('never sends answers out in private mode or offline', () => {
    expect(decide(unsure, fresh, 'private', true, 0).kind).toBe('keep');
    expect(decide(unsure, fresh, 'balanced', false, 0).kind).toBe('keep');
  });
  it('accuracy first escalates more readily than balanced', () => {
    const mid = { value: 0.4, reasons: ['x'] };
    expect(decide(mid, fresh, 'accurate', true, 0.99).kind).toBe('escalate');
    expect(decide(mid, trusted, 'balanced', true, 0.99).kind).toBe('keep');
  });
});

describe('auditStats', () => {
  const answer = (at: string, engine: 'on-device' | 'cloud') => ({ at, grade: { score: 1, covered: [], missing: [], feedback: '', engine } });
  const audit = (at: string, kind: 'escalated' | 'spot-check') => ({ at, kind });
  it('counts all of a short history', () => {
    const s = auditStats([audit('2026-11-03', 'escalated'), audit('2026-11-02', 'spot-check')], [answer('2026-11-01', 'on-device'), answer('2026-11-02', 'on-device'), answer('2026-11-03', 'cloud'), answer('2026-11-04', 'on-device')], 300);
    expect(s).toEqual({ windowed: false, escalated: 1, stayed: 2 / 4 });
  });
  it('when the history is capped, measures answers since its oldest audit', () => {
    // Cap of 2: the window starts at the oldest loaded audit (11-02); the 11-01 answer is outside it.
    const s = auditStats([audit('2026-11-03', 'spot-check'), audit('2026-11-02', 'spot-check')], [answer('2026-11-01', 'cloud'), answer('2026-11-02', 'on-device'), answer('2026-11-03', 'on-device'), answer('2026-11-04', 'on-device')], 2);
    expect(s).toEqual({ windowed: true, escalated: 0, stayed: 1 / 3 });
  });
  it('has no share without answers', () => {
    expect(auditStats([], [], 300).stayed).toBeNull();
  });
});
