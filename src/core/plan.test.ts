import { describe, expect, it } from 'vitest';
import { current, forecast, googleCalendarUrl, monthGrid, toIcs, upcoming, type Session } from './plan';
import type { Card } from './types';

const card = (due: Date): Card => ({
  id: due.toISOString(), deckId: 'd', prompt: '', answer: '', keyPoints: [], createdAt: '', madeBy: 'local',
  srs: { due: due.toISOString(), stability: 1, difficulty: 5, scheduledDays: 1, learningSteps: 0, reps: 1, lapses: 0, state: 2 },
});
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);
const session = (start: Date, minutes = 25, remind = 10): Session => ({ id: 's1', at: start.toISOString(), minutes, deckId: null, remind, createdAt: '' });

describe('forecast', () => {
  const now = at(2026, 11, 20, 9);
  it('counts overdue cards towards today', () => {
    const f = forecast([card(at(2026, 11, 10)), card(at(2026, 11, 20, 18))], now, 7);
    expect(f.get('2026-11-20')).toBe(2);
  });
  it('places future cards on their own day and ignores those beyond the window', () => {
    const f = forecast([card(at(2026, 11, 22)), card(at(2026, 11, 22, 20)), card(at(2026, 12, 30))], now, 7);
    expect(f.get('2026-11-22')).toBe(2);
    expect([...f.values()].reduce((a, b) => a + b, 0)).toBe(2);
  });
});

describe('monthGrid', () => {
  it('starts on a Monday and covers the whole month', () => {
    const weeks = monthGrid(2026, 10); // November 2026 starts on a Sunday
    expect(weeks[0][0].getDay()).toBe(1);
    expect(weeks[0][6].getDate()).toBe(1);
    const days = weeks.flat();
    expect(days.some((d) => d.getMonth() === 10 && d.getDate() === 30)).toBe(true);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });
});

describe('upcoming and current', () => {
  const now = at(2026, 11, 20, 12);
  it('keeps sessions that have not ended, soonest first', () => {
    const past = { ...session(at(2026, 11, 19)), id: 'past' };
    const later = { ...session(at(2026, 11, 22)), id: 'later' };
    const soon = { ...session(at(2026, 11, 21)), id: 'soon' };
    expect(upcoming([later, past, soon], now).map((s) => s.id)).toEqual(['soon', 'later']);
  });
  it('finds a session in progress', () => {
    const live = session(new Date(now.getTime() - 10 * 60_000), 25);
    expect(current([live], now)).toBe(live);
    expect(current([session(new Date(now.getTime() - 30 * 60_000), 25)], now)).toBeUndefined();
  });
});

describe('calendar exports', () => {
  const s = session(new Date(Date.UTC(2026, 10, 21, 15, 0)), 45, 30);
  it('writes an iCalendar event with a reminder alarm', () => {
    const ics = toIcs(s, 'Recall: Biology, ch. 3', 'Study 12 cards', 'https://example.com/#/study', new Date(Date.UTC(2026, 10, 20)));
    expect(ics).toContain('DTSTART:20261121T150000Z');
    expect(ics).toContain('DTEND:20261121T154500Z');
    expect(ics).toContain('SUMMARY:Recall: Biology\\, ch. 3');
    expect(ics).toContain('TRIGGER:-PT30M');
    expect(ics.split('\r\n').filter(Boolean).at(-1)).toBe('END:VCALENDAR');
  });
  it('leaves the alarm out when no reminder is wanted', () => {
    expect(toIcs({ ...s, remind: 0 }, 't', 'd', 'u', new Date())).not.toContain('VALARM');
  });
  it('builds a Google Calendar link', () => {
    const u = new URL(googleCalendarUrl(s, 'Recall session', 'Study', 'https://example.com'));
    expect(u.searchParams.get('dates')).toBe('20261121T150000Z/20261121T154500Z');
    expect(u.searchParams.get('text')).toBe('Recall session');
  });
});
