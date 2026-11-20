/**
 * The study calendar. Each day shows how many cards come due (from the spaced-repetition
 * schedule), so sessions go where they are needed. Sessions can be added to the learner's own
 * calendar app, which reminds them when Recall is closed; while it is open, Recall reminds them
 * itself (see reminders.ts).
 */
import { useMemo, useState } from 'react';
import { REMIND_OPTIONS, SESSION_LENGTHS, forecast, googleCalendarUrl, monthGrid, toIcs, upcoming, type Session } from '../core/plan';
import { dayKey } from '../core/stats';
import type { Card, Deck } from '../core/types';
import { removeSession, saveSession } from '../services/store';
import { Icon } from './Icon';
import { useNotifyPermission } from './reminders';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
/** Short enough for a calendar cell: "4 PM", "4:30 PM" (or 16:00 where the 24-hour clock is used). */
const chipTime = (d: Date) => d.toLocaleTimeString(undefined, d.getMinutes() ? { hour: 'numeric', minute: '2-digit' } : { hour: 'numeric' });
const longDay = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

/** What a session is called, says and opens; shared with the reminders in App. */
export function sessionText(s: Session, decks: Deck[]): { title: string; body: string; hash: string } {
  const deck = s.deckId ? decks.find((d) => d.id === s.deckId) : undefined;
  const what = deck ? deck.title : 'Your due cards';
  return {
    title: `Recall: ${what}`,
    body: `${s.minutes}-minute study session at ${time(new Date(s.at))}`,
    hash: deck ? `#/study/${deck.id}` : '#/study',
  };
}

function downloadIcs(s: Session, decks: Deck[]) {
  const t = sessionText(s, decks);
  const ics = toIcs(s, t.title, t.body, `${location.origin}/${t.hash}`, new Date());
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  a.download = 'recall-session.ics';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function Plan({ uid, cards, decks, sessions }: { uid: string; cards: Card[]; decks: Deck[]; sessions: Session[] }) {
  const now = new Date();
  const todayKey = dayKey(now);
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [picked, setPicked] = useState<Date>(() => new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  const [justAdded, setJustAdded] = useState<string | null>(null);

  const due = useMemo(() => forecast(cards, new Date(), 70), [cards]);
  const peak = Math.max(1, ...[...due].filter(([day]) => day !== todayKey).map(([, n]) => n));
  const byDay = useMemo(() => {
    const m = new Map<string, Session[]>();
    for (const s of [...sessions].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
      const k = dayKey(new Date(s.at));
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return m;
  }, [sessions]);
  const weeks = monthGrid(view.year, view.month);
  const next = upcoming(sessions, now).slice(0, 5);

  const shift = (n: number) => setView((v) => {
    const d = new Date(v.year, v.month + n, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const pick = (d: Date) => {
    setPicked(d);
    if (d.getMonth() !== view.month) setView({ year: d.getFullYear(), month: d.getMonth() });
  };
  const goToday = () => pick(new Date(now.getFullYear(), now.getMonth(), now.getDate()));

  const pickedKey = dayKey(picked);
  const pickedPast = pickedKey < todayKey;
  const level = (n: number) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / peak) * 4)));

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">Plan</p>
          <h1>Your study calendar</h1>
          <p className="muted">Each day shows how many cards come due. Put your sessions where they are needed, and add them to your calendar so your phone reminds you.</p>
        </div>
      </header>

      <div className="plan-layout">
        <section className="card cal">
          <div className="cal-head">
            <h3>{new Date(view.year, view.month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h3>
            <div className="cal-nav">
              <button className="btn sm ghost" onClick={goToday}>Today</button>
              <button className="icon-btn" onClick={() => shift(-1)} aria-label="Previous month"><Icon name="chevronLeft" size={18} /></button>
              <button className="icon-btn" onClick={() => shift(1)} aria-label="Next month"><Icon name="chevronRight" size={18} /></button>
            </div>
          </div>
          <div className="cal-grid" role="grid" aria-label="Study calendar">
            {WEEKDAYS.map((w, i) => <span key={i} className="cal-weekday" aria-hidden>{w}</span>)}
            {weeks.flat().map((d) => {
              const k = dayKey(d);
              const past = k < todayKey;
              const n = past ? 0 : due.get(k) ?? 0;
              const list = byDay.get(k) ?? [];
              const label = `${longDay(d)}${n ? `: ${n} ${n === 1 ? 'card' : 'cards'} due` : ''}${list.length ? `, ${list.length} ${list.length === 1 ? 'session' : 'sessions'}` : ''}`;
              return (
                <button
                  key={k}
                  className={`cal-day load-${level(n)}${d.getMonth() !== view.month ? ' other' : ''}${past ? ' past' : ''}${k === todayKey ? ' today' : ''}${k === pickedKey ? ' picked' : ''}`}
                  onClick={() => pick(d)}
                  aria-label={label}
                  aria-pressed={k === pickedKey}
                >
                  <span className="cal-date">{d.getDate()}</span>
                  {n > 0 && <span className="cal-due"><Icon name="library" size={11} />{n}</span>}
                  {list.length > 0 && (
                    <span className="cal-sessions" aria-hidden>
                      {list.slice(0, 2).map((s) => <span key={s.id} className="cal-session">{chipTime(new Date(s.at))}</span>)}
                      {list.length > 2 && <span className="cal-more">+{list.length - 2}</span>}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="cal-legend muted small" aria-hidden>
            <span className="cal-key load-1" /> fewer <span className="cal-key load-4" /> more cards due
            <span className="cal-key-session" /> session
          </p>
        </section>

        <div className="stack">
          <section className="card day-panel">
            <h3>{pickedKey === todayKey ? 'Today · ' : ''}{longDay(picked)}</h3>
            <p className="muted small day-due">
              {pickedPast ? 'This day has passed.' : (() => {
                const n = due.get(pickedKey) ?? 0;
                return n ? <><b>{n}</b> {n === 1 ? 'card comes' : 'cards come'} due{pickedKey === todayKey ? ' (including any overdue)' : ''}.</> : 'No cards come due. A good day for something new, or a rest.';
              })()}
            </p>

            {(byDay.get(pickedKey) ?? []).map((s) => (
              <SessionRow key={s.id} s={s} decks={decks} highlight={s.id === justAdded} onRemove={() => removeSession(uid, s.id)} />
            ))}

            {!pickedPast && (
              <ScheduleForm
                day={picked}
                decks={decks}
                onSave={(s) => setJustAdded(saveSession(uid, s).id)}
              />
            )}
          </section>

          <Reminders />
        </div>
      </div>

      {next.length > 0 && (
        <section className="card">
          <div className="card-head">
            <h3>Coming up</h3>
            <span className="muted small">{upcoming(sessions, now).length} planned</span>
          </div>
          {next.map((s) => (
            <SessionRow key={s.id} s={s} decks={decks} showDay onRemove={() => removeSession(uid, s.id)} />
          ))}
        </section>
      )}
    </div>
  );
}

function SessionRow({ s, decks, showDay, highlight, onRemove }: { s: Session; decks: Deck[]; showDay?: boolean; highlight?: boolean; onRemove: () => void }) {
  const t = sessionText(s, decks);
  const start = new Date(s.at);
  const live = Date.now() >= start.getTime() - 15 * 60_000;
  return (
    <div className={`session-row${highlight ? ' fresh' : ''}`}>
      <span className="session-time">
        <b>{time(start)}</b>
        <small>{showDay ? start.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) : `${s.minutes} min`}</small>
      </span>
      <span className="session-main">
        <strong>{t.title.replace(/^Recall: /, '')}</strong>
        <span className="muted small">{s.minutes} min{s.remind ? ` · reminder ${s.remind} min before` : ' · no reminder'}</span>
        <span className="session-actions">
          {live && <a className="btn sm primary" href={t.hash}><Icon name="play" size={14} /> Start</a>}
          <a className="btn sm" href={googleCalendarUrl(s, t.title, t.body, `${location.origin}/${t.hash}`)} target="_blank" rel="noreferrer">
            <Icon name="calendar" size={14} /> Google Calendar
          </a>
          <button className="btn sm" onClick={() => downloadIcs(s, decks)} title="For Apple Calendar, Outlook and most phone calendars">
            <Icon name="download" size={14} /> Apple / Outlook
          </button>
        </span>
        {highlight && <span className="small session-tip">Saved. Add it to your calendar so your phone reminds you even when Recall is closed.</span>}
      </span>
      <button className="icon-btn" onClick={onRemove} aria-label={`Remove the ${time(start)} session`} title="Remove">
        <Icon name="trash" size={16} />
      </button>
    </div>
  );
}

function ScheduleForm({ day, decks, onSave }: { day: Date; decks: Deck[]; onSave: (s: Omit<Session, 'id' | 'createdAt'>) => void }) {
  // Today: the next full hour; other days: late afternoon.
  const [clock, setClock] = useState(() => {
    const isToday = dayKey(day) === dayKey(new Date());
    const h = isToday ? Math.min(23, new Date().getHours() + 1) : 17;
    return `${String(h).padStart(2, '0')}:00`;
  });
  const [minutes, setMinutes] = useState<number>(25);
  const [deckId, setDeckId] = useState('');
  const [remind, setRemind] = useState<number>(10);

  const [h, m] = clock.split(':').map(Number);
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h || 0, m || 0);
  const inPast = start.getTime() < Date.now();

  return (
    <form
      className="schedule"
      onSubmit={(e) => {
        e.preventDefault();
        if (!inPast) onSave({ at: start.toISOString(), minutes, deckId: deckId || null, remind });
      }}
    >
      <p className="label">Schedule a session</p>
      <div className="schedule-row">
        <label className="field">
          <span>Time</span>
          <input type="time" value={clock} onChange={(e) => setClock(e.target.value)} required />
        </label>
        <label className="field">
          <span>Remind me before</span>
          <select value={remind} onChange={(e) => setRemind(Number(e.target.value))}>
            {REMIND_OPTIONS.map((r) => <option key={r} value={r}>{r === 0 ? 'No reminder' : r === 60 ? '1 hour' : `${r} min`}</option>)}
          </select>
        </label>
      </div>
      <label className="field">
        <span>Study</span>
        <select value={deckId} onChange={(e) => setDeckId(e.target.value)}>
          <option value="">All due cards</option>
          {decks.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
        </select>
      </label>
      <div className="field">
        <span>Length</span>
        <div className="seg big" role="radiogroup" aria-label="Session length">
          {SESSION_LENGTHS.map((n) => (
            <button type="button" key={n} role="radio" aria-checked={minutes === n} className={minutes === n ? 'on' : ''} onClick={() => setMinutes(n)}>
              {n} min
            </button>
          ))}
        </div>
      </div>
      <div className="actions">
        <button className="btn primary" type="submit" disabled={inPast}>
          <Icon name="calendar" size={16} /> Schedule
        </button>
        {inPast && <span className="muted small">That time has already passed.</span>}
      </div>
    </form>
  );
}

function Reminders() {
  const [permission, ask] = useNotifyPermission();
  return (
    <section className="card reminders">
      <h3><Icon name="bell" size={18} /> Reminders</h3>
      <p className="muted small">
        <b>When Recall is closed,</b> your calendar app reminds you: add each session with the buttons above.
        {' '}<b>While it is open,</b> Recall can notify you itself.
      </p>
      {permission === 'default' && <button className="btn sm" onClick={ask}><Icon name="bell" size={14} /> Turn on notifications</button>}
      {permission === 'granted' && <p className="small reminders-on"><Icon name="check" size={14} /> Notifications are on in this browser.</p>}
      {permission === 'denied' && <p className="small muted">Notifications are blocked for Recall in this browser's site settings. Calendar reminders still work.</p>}
      {permission === 'unsupported' && <p className="small muted">This browser cannot show notifications. Calendar reminders still work.</p>}
    </section>
  );
}
