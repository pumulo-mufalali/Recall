/**
 * Study plans: sessions the learner schedules, the forecast of cards coming due that guides
 * where to put them, and exports to the learner's own calendar app (which is what reminds them
 * when Recall is closed: no server needed). Pure: the caller passes in "now".
 */
import type { Card } from './types';
import { dayKey } from './stats';

/** A planned study session. */
export interface Session {
  id: string;
  /** Start, as an ISO timestamp. */
  at: string;
  minutes: number;
  /** A deck to study, or null for whatever is due across all decks. */
  deckId: string | null;
  /** Minutes before the start to remind; 0 for no reminder. */
  remind: number;
  createdAt: string;
}

export const SESSION_LENGTHS = [15, 25, 45] as const;
export const REMIND_OPTIONS = [0, 10, 30, 60] as const;

/**
 * Cards coming due per local day, from today for `days` days. Anything already overdue counts
 * towards today: it is waiting now.
 */
export function forecast(cards: Card[], now: Date, days: number): Map<string, number> {
  const out = new Map<string, number>();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + days);
  const today = dayKey(now);
  for (const c of cards) {
    const due = new Date(c.srs.due);
    if (due >= end) continue;
    const k = due < start ? today : dayKey(due);
    out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}

/** The weeks of a month for a calendar, Monday first, padded with days of the months around it. */
export function monthGrid(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7));
  const weeks: Date[][] = [];
  const d = new Date(start);
  do {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    weeks.push(week);
  } while (d.getMonth() === month);
  return weeks;
}

/** Sessions that have not ended yet, soonest first. */
export function upcoming(sessions: Session[], now: Date): Session[] {
  return sessions
    .filter((s) => Date.parse(s.at) + s.minutes * 60_000 > now.getTime())
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/** A session in progress, if any. */
export function current(sessions: Session[], now: Date): Session | undefined {
  const t = now.getTime();
  return sessions.find((s) => Date.parse(s.at) <= t && t < Date.parse(s.at) + s.minutes * 60_000);
}

const utc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/**
 * An iCalendar file (.ics) for one session, with its reminder as an alarm, so Apple Calendar,
 * Outlook and Google Calendar can add it and notify the learner even when Recall is closed.
 */
export function toIcs(s: Session, title: string, details: string, url: string, now: Date): string {
  const start = new Date(s.at);
  const end = new Date(start.getTime() + s.minutes * 60_000);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Recall//Study sessions//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${s.id}@recall`,
    `DTSTAMP:${utc(now)}`,
    `DTSTART:${utc(start)}`,
    `DTEND:${utc(end)}`,
    `SUMMARY:${escape(title)}`,
    `DESCRIPTION:${escape(`${details}\n${url}`)}`,
    `URL:${url}`,
    ...(s.remind > 0 ? ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escape(title)}`, `TRIGGER:-PT${s.remind}M`, 'END:VALARM'] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n') + '\r\n';
}

/** A link that opens Google Calendar with the session filled in (it uses the learner's default reminders). */
export function googleCalendarUrl(s: Session, title: string, details: string, url: string): string {
  const start = new Date(s.at);
  const end = new Date(start.getTime() + s.minutes * 60_000);
  const q = new URLSearchParams({ action: 'TEMPLATE', text: title, dates: `${utc(start)}/${utc(end)}`, details: `${details}\n${url}` });
  return `https://calendar.google.com/calendar/render?${q}`;
}
