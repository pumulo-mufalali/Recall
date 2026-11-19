/**
 * Numbers for the dashboard and the library, computed from cards and attempts. Pure: the
 * caller passes in "now", so the same data gives the same picture in tests.
 */
import { RIGHT } from './calibration';
import type { Attempt, Card, Engine } from './types';

/** Local calendar day, as YYYY-MM-DD. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/** Answers per local day. */
export function perDay(attempts: Attempt[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const a of attempts) {
    const k = dayKey(new Date(a.at));
    out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}

/**
 * Days in a row with at least one answer, ending today, or yesterday when today has none yet
 * (a streak is not lost until the day is over).
 */
export function streak(attempts: Attempt[], now: Date): number {
  const days = perDay(attempts);
  let d = days.has(dayKey(now)) ? now : addDays(now, -1);
  let n = 0;
  while (days.has(dayKey(d))) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

/** The last `weeks` weeks as columns of 7 days (Monday first), oldest first, for a heatmap. */
export function activity(attempts: Attempt[], now: Date, weeks = 12): { day: string; count: number; future: boolean }[][] {
  const days = perDay(attempts);
  const monday = addDays(now, -((now.getDay() + 6) % 7));
  const start = addDays(monday, -7 * (weeks - 1));
  const today = dayKey(now);
  const cols: { day: string; count: number; future: boolean }[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col = [];
    for (let i = 0; i < 7; i++) {
      const k = dayKey(addDays(start, w * 7 + i));
      col.push({ day: k, count: days.get(k) ?? 0, future: k > today });
    }
    cols.push(col);
  }
  return cols;
}

export interface DeckProgress {
  total: number;
  fresh: number;
  learning: number;
  known: number;
  due: number;
  /** Share right across this deck's answers; null with none. */
  accuracy: number | null;
}

export function deckProgress(cards: Card[], attempts: Attempt[], now: Date): DeckProgress {
  const t = now.getTime();
  const fresh = cards.filter((c) => c.srs.state === 0).length;
  const known = cards.filter((c) => c.srs.state === 2).length;
  const due = cards.filter((c) => c.srs.state !== 0 && Date.parse(c.srs.due) <= t).length;
  const ids = new Set(cards.map((c) => c.id));
  const mine = attempts.filter((a) => ids.has(a.cardId));
  return {
    total: cards.length,
    fresh,
    learning: cards.length - fresh - known,
    known,
    due,
    accuracy: mine.length ? mine.filter((a) => a.grade.score >= RIGHT).length / mine.length : null,
  };
}

/** When the next review comes due, for "nothing due" screens; null if none is scheduled. */
export function nextDue(cards: Card[], now: Date): Date | null {
  const t = now.getTime();
  let best: number | null = null;
  for (const c of cards) {
    if (c.srs.state === 0) continue;
    const d = Date.parse(c.srs.due);
    if (d > t && (best === null || d < best)) best = d;
  }
  return best === null ? null : new Date(best);
}

/** "in 3 hours", "tomorrow", "in 5 days". */
export function relative(when: Date, now: Date): string {
  const mins = Math.round((when.getTime() - now.getTime()) / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `in ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 20) return `in ${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.round((dayStart(when) - dayStart(now)) / 86_400_000);
  if (days <= 1) return 'tomorrow';
  return `in ${days} days`;
}

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** How many answers each engine marked. */
export function engineSplit(attempts: Attempt[]): Record<Engine, number> {
  const out: Record<Engine, number> = { 'on-device': 0, cloud: 0, local: 0 };
  for (const a of attempts) out[a.grade.engine]++;
  return out;
}

/** Share right per day for the last `days` days with answers (oldest first), for a trend line. */
export function accuracyTrend(attempts: Attempt[], days = 14): { day: string; accuracy: number; count: number }[] {
  const by = new Map<string, { right: number; count: number }>();
  for (const a of attempts) {
    const k = dayKey(new Date(a.at));
    const e = by.get(k) ?? { right: 0, count: 0 };
    e.count++;
    if (a.grade.score >= RIGHT) e.right++;
    by.set(k, e);
  }
  return [...by.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .slice(-days)
    .map(([day, e]) => ({ day, accuracy: e.right / e.count, count: e.count }));
}
