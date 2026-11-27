import { describe, expect, it } from 'vitest';
import { Rating } from 'ts-fsrs';
import { calibrate } from './calibration';
import { localGrade, terms } from './localGrade';
import { cardCount, parseJson, toCards, toGrade } from './prompts';
import { chunkText, route, type Conditions } from './route';
import { dueCards, newSrs, ratingFor, review } from './schedule';
import type { Attempt, Confidence } from './types';

const online: Conditions = { online: true, device: 'available' };
const offline: Conditions = { online: false, device: 'available' };
const noDevice: Conditions = { online: true, device: 'unavailable' };
const stranded: Conditions = { online: false, device: 'unavailable' };

describe('route', () => {
  it('marks answers on the device whenever it can', () => {
    expect(route({ kind: 'grade', chars: 200 }, online)).toMatchObject({ run: 'model', mode: 'prefer_on_device' });
    expect(route({ kind: 'grade', chars: 200 }, offline)).toMatchObject({ run: 'model', mode: 'prefer_on_device' });
  });
  it('marks in the cloud without a device model, and locally when stranded', () => {
    expect(route({ kind: 'grade', chars: 200 }, noDevice)).toMatchObject({ run: 'model', mode: 'only_in_cloud' });
    expect(route({ kind: 'grade', chars: 200 }, stranded).run).toBe('local');
  });
  it('keeps answers off the cloud when cloud marking is switched off', () => {
    expect(route({ kind: 'grade', chars: 200 }, noDevice, { deviceMaxChars: 12000, deviceMaxImageBytes: 4e6, cloudGrading: false }).run).toBe('local');
  });
  it('a download in progress does not count as ready', () => {
    expect(route({ kind: 'grade', chars: 200 }, { online: true, device: 'downloading' })).toMatchObject({ mode: 'only_in_cloud' });
  });
  it('sends long text to the cloud, and splits it for the device when offline', () => {
    expect(route({ kind: 'generate', source: 'text', chars: 3000 }, online)).toMatchObject({ mode: 'prefer_on_device' });
    expect(route({ kind: 'generate', source: 'text', chars: 30000 }, online)).toMatchObject({ mode: 'prefer_in_cloud' });
    expect(route({ kind: 'generate', source: 'text', chars: 30000 }, offline)).toMatchObject({ mode: 'only_on_device', chunks: 3 });
    expect(route({ kind: 'generate', source: 'text', chars: 300 }, stranded).run).toBe('queue');
  });
  it('reads JPEG/PNG photos on the device, other files in the cloud', () => {
    expect(route({ kind: 'generate', source: 'image', mime: 'image/png', bytes: 1e6 }, online)).toMatchObject({ mode: 'prefer_on_device' });
    expect(route({ kind: 'generate', source: 'image', mime: 'image/webp', bytes: 1e6 }, online)).toMatchObject({ mode: 'only_in_cloud' });
    expect(route({ kind: 'generate', source: 'image', mime: 'image/webp', bytes: 1e6 }, offline).run).toBe('queue');
    expect(route({ kind: 'generate', source: 'pdf', bytes: 1e6 }, online)).toMatchObject({ mode: 'only_in_cloud' });
    expect(route({ kind: 'generate', source: 'pdf', bytes: 1e6 }, offline).run).toBe('queue');
  });
  it('fact-checks with the cloud model online, on the device offline when it can', () => {
    expect(route({ kind: 'verify', source: 'text', chars: 3000 }, online)).toMatchObject({ mode: 'prefer_in_cloud' });
    expect(route({ kind: 'verify', source: 'text', chars: 30000 }, offline)).toMatchObject({ mode: 'only_on_device', chunks: 3 });
    expect(route({ kind: 'verify', source: 'image', mime: 'image/png', bytes: 1e6 }, offline)).toMatchObject({ mode: 'only_on_device' });
    expect(route({ kind: 'verify', source: 'pdf', bytes: 1e6 }, offline).run).toBe('queue');
    expect(route({ kind: 'verify', source: 'text', chars: 300 }, stranded).run).toBe('queue');
  });
  it('explains in the cloud online, briefly on the device offline', () => {
    expect(route({ kind: 'explain' }, online)).toMatchObject({ mode: 'prefer_in_cloud' });
    expect(route({ kind: 'explain' }, offline)).toMatchObject({ mode: 'only_on_device' });
    expect(route({ kind: 'explain' }, stranded).run).toBe('queue');
  });
});

describe('chunkText', () => {
  it('splits at paragraphs and sentences, never beyond the limit', () => {
    const text = Array.from({ length: 12 }, (_, i) => `Paragraph ${i}. ` + 'This sentence carries an idea. '.repeat(8)).join('\n\n');
    const parts = chunkText(text, 600);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(600);
    expect(parts.join(' ').replace(/\s+/g, ' ')).toBe(text.replace(/\s+/g, ' ').trim());
  });
  it('cuts a sentence only when it alone exceeds the limit', () => {
    const parts = chunkText('x'.repeat(250), 100);
    expect(parts.map((p) => p.length)).toEqual([100, 100, 50]);
  });
});

describe('schedule', () => {
  it('rates from the mark, and distrusts a lucky guess', () => {
    expect(ratingFor(0.2, 4)).toBe(Rating.Again);
    expect(ratingFor(0.5, 3)).toBe(Rating.Hard);
    expect(ratingFor(0.8, 3)).toBe(Rating.Good);
    expect(ratingFor(1, 4)).toBe(Rating.Easy);
    expect(ratingFor(1, 1)).toBe(Rating.Good);
    expect(ratingFor(0.8, 1)).toBe(Rating.Hard);
  });
  it('a good answer pushes the card further out than a wrong one', () => {
    const now = new Date('2026-11-17T10:00:00Z');
    let good = newSrs(now);
    let bad = newSrs(now);
    let t = now;
    for (let i = 0; i < 4; i++) {
      good = review(good, 1, 4, t);
      bad = review(bad, 0.1, 2, t);
      t = new Date(Math.max(Date.parse(good.due), Date.parse(bad.due)));
    }
    expect(Date.parse(good.due)).toBeGreaterThan(Date.parse(bad.due));
    expect(good.stability).toBeGreaterThan(bad.stability);
  });
  it('serves overdue reviews first, then a capped number of new cards', () => {
    const now = new Date('2026-11-17T10:00:00Z');
    const reviewed = (due: string) => ({ srs: { ...review(newSrs(now), 1, 3, now), due } });
    const cards = [reviewed('2026-11-16T00:00:00Z'), reviewed('2026-11-10T00:00:00Z'), reviewed('2026-12-01T00:00:00Z'), ...Array.from({ length: 5 }, () => ({ srs: newSrs(now) }))];
    const due = dueCards(cards, now, 2);
    expect(due.length).toBe(4);
    expect(due[0].srs.due).toBe('2026-11-10T00:00:00Z');
    expect(due[1].srs.due).toBe('2026-11-16T00:00:00Z');
  });
});

describe('calibrate', () => {
  const attempt = (confidence: Confidence, score: number, i: number): Attempt => ({
    id: `a${i}`,
    cardId: `c${i % 4}`,
    deckId: 'd',
    at: new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString(),
    answer: '',
    confidence,
    grade: { score, covered: [], missing: [], feedback: '', engine: 'on-device' },
  });
  it('flags overconfidence and lists confident misses', () => {
    const attempts = Array.from({ length: 12 }, (_, i) => attempt(4, i % 3 === 0 ? 1 : 0.2, i));
    const c = calibrate(attempts);
    expect(c.verdict).toBe('overconfident');
    expect(c.gap).toBeGreaterThan(0.5);
    expect(c.levels[3].actual).toBeCloseTo(4 / 12);
    expect(c.confidentMisses.length).toBeGreaterThan(0);
  });
  it('recognises good calibration and waits for enough data', () => {
    expect(calibrate([attempt(4, 1, 0)]).verdict).toBe('not enough data');
    const fair = [...Array.from({ length: 10 }, (_, i) => attempt(4, 1, i)), ...Array.from({ length: 10 }, (_, i) => attempt(1, 0, i + 10))];
    expect(calibrate(fair).verdict).toBe('well calibrated');
  });
  it('judges each level, so opposite errors cannot cancel out in the average', () => {
    // "No idea" right half the time (claims 10%), "Certain" right half the time (claims 95%):
    // the averages nearly match, but both ends are off.
    const mixed = [...Array.from({ length: 10 }, (_, i) => attempt(1, i % 2 ? 1 : 0, i)), ...Array.from({ length: 10 }, (_, i) => attempt(4, i % 2 ? 1 : 0, i + 10))];
    const c = calibrate(mixed);
    expect(Math.abs(c.gap)).toBeLessThan(0.1);
    expect(c.verdict).toBe('mixed');
    expect(c.worst?.confidence).toBe(4);
    // Only "Certain" off, too sure: overconfident, and it names the level.
    const sure = [...Array.from({ length: 10 }, (_, i) => attempt(4, i < 6 ? 1 : 0, i)), ...Array.from({ length: 10 }, (_, i) => attempt(2, i < 4 ? 1 : 0, i + 10))];
    expect(calibrate(sure).verdict).toBe('overconfident');
    expect(calibrate(sure).worst?.confidence).toBe(4);
  });
  it('ignores a level with too few answers to say anything', () => {
    const few = [...Array.from({ length: 12 }, (_, i) => attempt(2, i % 5 < 2 ? 1 : 0, i)), ...Array.from({ length: 3 }, (_, i) => attempt(4, 0, i + 12))];
    expect(calibrate(few).verdict).toBe('well calibrated');
  });
});

describe('localGrade', () => {
  it('matches key points by meaning-bearing words, ignoring form', () => {
    const g = localGrade('Plants are converting light energy into chemical energy, stored as glucose.', [
      'converts light energy into chemical energy',
      'energy is stored as glucose',
      'happens in the chloroplasts',
    ]);
    expect(g.covered.length).toBe(2);
    expect(g.missing).toEqual(['happens in the chloroplasts']);
    expect(g.score).toBeCloseTo(2 / 3);
    expect(g.engine).toBe('local');
  });
  it('drops stop words', () => {
    expect(terms('The cell and the nucleus')).toEqual(['cell', 'nucleus']);
  });
});

describe('replies', () => {
  it('parses JSON in fences or prose', () => {
    expect(parseJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJson('Here you go: [1,2] done')).toEqual([1, 2]);
  });
  it('builds a grade from covered numbers, ignoring nonsense', () => {
    const g = toGrade({ covered: [1, '3', 9, 'x'], feedback: ' Good. ' }, ['a', 'b', 'c'], 'on-device');
    expect(g).toMatchObject({ covered: ['a', 'c'], missing: ['b'], feedback: 'Good.', score: 2 / 3 });
    expect(toGrade({ feedback: 'hi' }, ['a'], 'cloud')).toBeNull();
  });
  it('keeps only usable, distinct cards', () => {
    const cards = toCards({
      cards: [
        { prompt: 'Why do leaves look green?', answer: 'They reflect green light.', keyPoints: ['reflect green light'] },
        { prompt: 'why do leaves look green', answer: 'dup', keyPoints: ['x'] },
        { question: 'What does chlorophyll absorb?', answer: 'Red and blue light.', keyPoints: ['red light', 'blue light'] },
        { prompt: 'Too', answer: 'short', keyPoints: ['x'] },
        { prompt: 'No key points here at all?', answer: 'yes', keyPoints: [] },
      ],
    });
    expect(cards.map((c) => c.prompt)).toEqual(['Why do leaves look green?', 'What does chlorophyll absorb?']);
  });
  it('asks for a sensible number of cards', () => {
    expect(cardCount(100)).toBe(3);
    expect(cardCount(6000)).toBe(10);
    expect(cardCount(1e6)).toBe(15);
  });
});
