/**
 * The home screen: what is due and a way to start, the streak and this week's numbers,
 * material waiting for a connection, the decks in progress and recent activity.
 */
import { useMemo } from 'react';
import type { User } from 'firebase/auth';
import { activity, dayKey, deckProgress, engineSplit, nextDue, relative, streak } from '../core/stats';
import { RIGHT } from '../core/calibration';
import type { Attempt, Card, Deck } from '../core/types';
import { saveDeck, type QueuedJob } from '../services/store';
import type { Review } from './Add';
import { Icon } from './Icon';
import { Heatmap, ProgressBar, Ring } from './charts';
import { href } from './router';
import { SAMPLE_CARDS, SAMPLE_TITLE } from './sample';
import type { LiveConditions } from './useConditions';

interface Props {
  user: User;
  due: Card[];
  decks: Deck[];
  cards: Card[];
  attempts: Attempt[];
  jobs: QueuedJob[];
  ready: Record<string, Review>;
  conditions: LiveConditions;
  onDropJob: (j: QueuedJob) => void;
}

export function Today({ user, due, decks, cards, attempts, jobs, ready, conditions, onDropJob }: Props) {
  const now = new Date();
  const stats = useMemo(() => {
    const week = attempts.filter((a) => Date.now() - Date.parse(a.at) < 7 * 86_400_000);
    const split = engineSplit(attempts);
    const today = dayKey(new Date());
    return {
      today: attempts.filter((a) => dayKey(new Date(a.at)) === today).length,
      streak: streak(attempts, new Date()),
      week: week.length,
      accuracy: week.length ? week.filter((a) => a.grade.score >= RIGHT).length / week.length : null,
      private: attempts.length ? split['on-device'] / attempts.length : null,
      cols: activity(attempts, new Date(), 16),
    };
  }, [attempts]);

  const reviews = due.filter((c) => c.srs.state !== 0).length;
  const fresh = due.length - reviews;
  const minutes = Math.max(1, Math.round(due.length * 0.75));
  const next = nextDue(cards, now);
  const first = (user.displayName ?? '').split(' ')[0];

  if (!decks.length && !jobs.length) return <Welcome uid={user.uid} name={first} conditions={conditions} />;

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">{now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1>{greeting(now)}{first ? `, ${first}` : ''}.</h1>
        </div>
      </header>

      <section className={`hero-card${due.length ? '' : ' done'}`}>
        <Ring value={due.length ? stats.today / (stats.today + due.length) : 1} size={112} stroke={10}>
          <span className="ring-num">{due.length || <Icon name="check" size={36} />}</span>
          {due.length > 0 && <span className="ring-label">due</span>}
        </Ring>
        <div className="hero-copy">
          {due.length ? (
            <>
              <h2>{due.length} {due.length === 1 ? 'card' : 'cards'} ready for you</h2>
              <p className="muted">
                {reviews > 0 && `${reviews} to review`}
                {reviews > 0 && fresh > 0 && ' · '}
                {fresh > 0 && `${fresh} new`} · about {minutes} min{stats.today > 0 && ` · ${stats.today} done today`}
              </p>
              <a className="btn primary lg" href={href({ name: 'study' })}>
                <Icon name="play" size={18} /> Start session
              </a>
            </>
          ) : (
            <>
              <h2>All caught up</h2>
              <p className="muted">{next ? `The next card comes back ${relative(next, now)}.` : 'Add some material to get your next cards.'} Cards return just before you would forget them.</p>
              <a className="btn" href={href({ name: 'add' })}>
                <Icon name="add" size={18} /> Add material
              </a>
            </>
          )}
        </div>
      </section>

      <section className="tiles">
        <Tile icon="flame" tone="warm" value={stats.streak} unit={stats.streak === 1 ? 'day' : 'days'} label="Streak" />
        <Tile icon="check" value={stats.week} label="Answered this week" />
        <Tile icon="insights" value={stats.accuracy === null ? '–' : `${Math.round(stats.accuracy * 100)}%`} label="Right this week" />
        <Tile icon="shield" tone="device" value={stats.private === null ? '–' : `${Math.round(stats.private * 100)}%`} label="Marked privately on device" href="#/engine" />
      </section>

      {jobs.length > 0 && (
        <section className="card">
          <div className="card-head">
            <h3>Waiting material</h3>
            <span className="muted small">{conditions.online ? 'Working on it…' : 'Runs when you are back online'}</span>
          </div>
          <ul className="rows">
            {jobs.map((j) => {
              const r = ready[j.id];
              return (
                <li key={j.id} className="row-item">
                  <span className={`row-icon ${r ? 'tone-good' : ''}`}><Icon name={r ? 'check' : 'clock'} size={18} /></span>
                  <span className="row-main">
                    <strong>{j.title}</strong>
                    <span className="muted small">{r ? `${r.drafts.length} questions ready to review` : j.reason}</span>
                  </span>
                  {r && <a className="btn sm primary" href={href({ name: 'review', jobId: j.id })}>Review</a>}
                  <button className="btn sm ghost" onClick={() => onDropJob(j)}>Drop</button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="split">
        <section className="card">
          <div className="card-head">
            <h3>Your decks</h3>
            <a className="link" href="#/library">See all <Icon name="arrow" size={14} /></a>
          </div>
          <ul className="rows">
            {decks.slice(0, 5).map((d) => {
              const p = deckProgress(cards.filter((c) => c.deckId === d.id), attempts, now);
              return (
                <li key={d.id}>
                  <a className="row-item link-row" href={href({ name: 'deck', id: d.id })}>
                    <span className="row-icon"><Icon name={d.source === 'pdf' ? 'pdf' : d.source === 'image' ? 'image' : 'text'} size={18} /></span>
                    <span className="row-main">
                      <strong>{d.title}</strong>
                      <ProgressBar known={p.known} learning={p.learning} total={p.total} />
                    </span>
                    {p.due > 0 ? <span className="pill warm">{p.due} due</span> : <span className="muted small">{p.known}/{p.total}</span>}
                  </a>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="card">
          <div className="card-head">
            <h3>Activity</h3>
            <span className="muted small">last 16 weeks</span>
          </div>
          <Heatmap cols={stats.cols} />
          <p className="muted small">{attempts.length} answers in all.</p>
        </section>
      </div>
    </div>
  );
}

function Tile({ icon, value, unit, label, tone, href: link }: { icon: 'flame' | 'check' | 'insights' | 'shield'; value: number | string; unit?: string; label: string; tone?: 'warm' | 'device'; href?: string }) {
  const body = (
    <>
      <span className={`tile-icon ${tone ? `tone-${tone}` : ''}`}><Icon name={icon} size={18} /></span>
      <span className="tile-value">{value}{unit && <small> {unit}</small>}</span>
      <span className="tile-label">{label}</span>
    </>
  );
  return link ? <a className="tile" href={link}>{body}</a> : <div className="tile">{body}</div>;
}

function Welcome({ uid, name, conditions }: { uid: string; name: string; conditions: LiveConditions }) {
  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">Welcome{name ? `, ${name}` : ''}</p>
          <h1>Let’s make your first deck.</h1>
        </div>
      </header>
      <section className="onboard">
        <a className="onboard-main" href={href({ name: 'add' })}>
          <span className="onboard-icon"><Icon name="upload" size={28} /></span>
          <h2>Add your own material</h2>
          <p>Paste notes, snap a photo of a textbook page or upload a PDF. Recall writes the questions and fact-checks them against your material.</p>
          <span className="btn primary">Add material <Icon name="arrow" size={16} /></span>
        </a>
        <button className="onboard-alt" onClick={() => saveDeck(uid, SAMPLE_TITLE, 'text', SAMPLE_CARDS, 'local')}>
          <span className="onboard-icon alt"><Icon name="sparkle" size={24} /></span>
          <h3>Or try a sample deck</h3>
          <p className="muted">Six questions on how vaccines work, ready to study now.</p>
        </button>
      </section>
      <section className="how">
        <h3>How a session works</h3>
        <ol className="how-steps">
          <li><strong>Answer from memory.</strong> <span className="muted">Type it in your own words; no multiple choice.</span></li>
          <li><strong>Say how sure you are.</strong> <span className="muted">Before you see anything, so it is an honest claim.</span></li>
          <li><strong>See what you missed.</strong> <span className="muted">{conditions.device === 'available' ? 'Marked on this device, privately and instantly.' : 'Marked by AI against the key points.'}</span></li>
          <li><strong>It comes back at the right time.</strong> <span className="muted">Spaced repetition schedules each card just before you would forget it.</span></li>
        </ol>
      </section>
    </div>
  );
}

function greeting(d: Date): string {
  const h = d.getHours();
  return h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}
