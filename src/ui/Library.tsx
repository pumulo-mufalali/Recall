/** The library (every deck at a glance) and one deck (its cards: browse, edit, study). */
import { useMemo, useState, type ReactNode } from 'react';
import { RIGHT } from '../core/calibration';
import { deckProgress, nextDue, relative } from '../core/stats';
import type { Attempt, Card, Deck } from '../core/types';
import { editCard, removeCard } from '../services/store';
import { Icon } from './Icon';
import { ProgressBar, Ring } from './charts';
import { href } from './router';

type Ask = (a: { title: string; body?: ReactNode; confirm: string; danger?: boolean }) => Promise<boolean>;

const SOURCE_ICON = { text: 'text', image: 'image', pdf: 'pdf' } as const;
const SOURCE_LABEL = { text: 'Notes', image: 'Photo', pdf: 'PDF' } as const;

export function Library({ decks, cards, attempts, onDelete }: { decks: Deck[]; cards: Card[]; attempts: Attempt[]; onDelete: (d: Deck) => void }) {
  const [q, setQ] = useState('');
  const now = new Date();
  const shown = decks.filter((d) => d.title.toLowerCase().includes(q.trim().toLowerCase()));
  const totalDue = useMemo(() => deckProgress(cards, attempts, new Date()), [cards, attempts]);

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">Library</p>
          <h1>Your decks</h1>
          <p className="muted">{decks.length} {decks.length === 1 ? 'deck' : 'decks'} · {cards.length} cards · {totalDue.known} known</p>
        </div>
        <a className="btn primary" href="#/add"><Icon name="add" size={18} /> New deck</a>
      </header>

      {decks.length > 3 && (
        <input className="search" type="search" placeholder="Search decks" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search decks" />
      )}

      {decks.length === 0 ? (
        <div className="empty">
          <span className="empty-icon"><Icon name="library" size={30} /></span>
          <h2>No decks yet</h2>
          <p className="muted">Add notes, a photo of a page or a PDF, and Recall will turn it into questions.</p>
          <a className="btn primary" href="#/add">Add material</a>
        </div>
      ) : (
        <div className="shelf">
          {shown.map((d) => {
            const mine = cards.filter((c) => c.deckId === d.id);
            const p = deckProgress(mine, attempts, now);
            return (
              <article className={`deck deck-${d.source}`} key={d.id}>
                {/* The deck as a book: a coloured cover with the title on a label plate, and a
                    bookmark ribbon when cards are due. The numbers sit underneath, on the shelf. */}
                <a className="book" href={href({ name: 'deck', id: d.id })} aria-label={`${d.title}: ${p.total} cards${p.due ? `, ${p.due} due` : ''}`}>
                  <span className="book-icon"><Icon name={SOURCE_ICON[d.source]} size={16} /></span>
                  {p.due > 0 && <span className="book-ribbon">{p.due}<small>due</small></span>}
                  <span className="book-plate">
                    <span className="book-title">{d.title}</span>
                    <span className="book-sub">{SOURCE_LABEL[d.source]} · {p.total} cards</span>
                  </span>
                </a>
                <div className="book-meta">
                  <ProgressBar known={p.known} learning={p.learning} total={p.total} />
                  <p className="deck-foot small">
                    <span><b>{p.known}</b> known</span>
                    <span><b>{p.learning}</b> learning</span>
                    <span><b>{p.fresh}</b> new</span>
                  </p>
                  <p className="book-foot small">
                    <span className="muted">Added {new Date(d.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
                    {p.accuracy !== null && <span className="deck-acc">{Math.round(p.accuracy * 100)}% right</span>}
                    <button className="icon-btn danger deck-del" onClick={() => onDelete(d)} aria-label={`Delete ${d.title}`} title="Delete deck">
                      <Icon name="trash" size={16} />
                    </button>
                  </p>
                </div>
              </article>
            );
          })}
          {shown.length === 0 && <p className="muted">No deck matches “{q}”.</p>}
        </div>
      )}
    </div>
  );
}

export function DeckView({ uid, deck, cards, attempts, newPerSession, ask, onDelete }: { uid: string; deck: Deck; cards: Card[]; attempts: Attempt[]; newPerSession: number; ask: Ask; onDelete: () => void }) {
  const now = new Date();
  const p = deckProgress(cards, attempts, now);
  const next = nextDue(cards, now);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'due' | 'new' | 'learning' | 'known'>('all');
  const studyNow = p.due + Math.min(p.fresh, newPerSession);

  const lastByCard = useMemo(() => {
    const m = new Map<string, Attempt>();
    for (const a of attempts) if (!m.has(a.cardId)) m.set(a.cardId, a); // attempts come newest first
    return m;
  }, [attempts]);

  const shown = cards
    .filter((c) => {
      const t = now.getTime();
      if (filter === 'due') return c.srs.state !== 0 && Date.parse(c.srs.due) <= t;
      if (filter === 'new') return c.srs.state === 0;
      if (filter === 'known') return c.srs.state === 2;
      if (filter === 'learning') return c.srs.state === 1 || c.srs.state === 3;
      return true;
    })
    .filter((c) => (c.prompt + c.answer).toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

  return (
    <div className="stack">
      <a className="back-link" href="#/library"><Icon name="back" size={16} /> Library</a>
      <header className="deck-hero">
        <Ring value={p.total ? p.known / p.total : 0} size={92} stroke={8}>
          <span className="ring-num sm">{p.total ? Math.round((p.known / p.total) * 100) : 0}%</span>
          <span className="ring-label">known</span>
        </Ring>
        <div className="deck-hero-copy">
          <p className="eyebrow"><Icon name={SOURCE_ICON[deck.source]} size={14} /> {SOURCE_LABEL[deck.source]}</p>
          <h1>{deck.title}</h1>
          <p className="muted">
            {p.total} cards · {p.known} known · {p.learning} learning · {p.fresh} new
            {p.accuracy !== null && ` · ${Math.round(p.accuracy * 100)}% right so far`}
          </p>
          <div className="actions">
            {studyNow > 0 ? (
              <a className="btn primary" href={href({ name: 'study', deckId: deck.id })}><Icon name="play" size={16} /> Study {studyNow} now</a>
            ) : (
              <span className="muted small">{next ? `Next card ${relative(next, now)}.` : 'Nothing due.'}</span>
            )}
            {p.total > 0 && <a className="btn" href={href({ name: 'study', deckId: deck.id, all: true })}>Practise all {p.total}</a>}
            <button className="btn ghost danger-text" onClick={onDelete}><Icon name="trash" size={16} /> Delete</button>
          </div>
        </div>
      </header>

      <div className="toolbar">
        <div className="seg" role="tablist" aria-label="Filter cards">
          {(['all', 'due', 'new', 'learning', 'known'] as const).map((f) => (
            <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
              {f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <input className="search" type="search" placeholder="Search cards" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search cards" />
      </div>

      <ul className="card-list">
        {shown.map((c, i) => (
          <CardRow key={c.id} n={i + 1} card={c} last={lastByCard.get(c.id)} now={now}
            onSave={(change) => editCard(uid, c, change)}
            onRemove={async () => {
              if (await ask({ title: 'Delete this card?', body: <p>“{c.prompt}”</p>, confirm: 'Delete', danger: true })) removeCard(uid, c);
            }}
          />
        ))}
        {shown.length === 0 && <li className="muted center pad">No cards here.</li>}
      </ul>
    </div>
  );
}

function CardRow({ n, card, last, now, onSave, onRemove }: { n: number; card: Card; last?: Attempt; now: Date; onSave: (c: Pick<Card, 'prompt' | 'answer' | 'keyPoints'>) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ prompt: card.prompt, answer: card.answer, keyPoints: card.keyPoints.join('\n') });
  const due = Date.parse(card.srs.due);
  const state = card.srs.state === 0 ? { label: 'New', tone: 'new' } : card.srs.state === 2 ? { label: 'Known', tone: 'known' } : { label: 'Learning', tone: 'learning' };

  return (
    <li className={`crow${open ? ' open' : ''}`}>
      <button className="crow-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="crow-n">{n}</span>
        <span className="crow-q">{card.prompt}</span>
        <span className={`chip chip-${state.tone}`}>{state.label}</span>
        <span className="crow-due small muted">{card.srs.state === 0 ? '' : due <= now.getTime() ? 'due now' : relative(new Date(due), now)}</span>
      </button>
      {open && !editing && (
        <div className="crow-body">
          <p>{card.answer}</p>
          <ul className="kp">
            {card.keyPoints.map((k) => <li key={k}>{k}</li>)}
          </ul>
          {last && (
            <p className="small muted">
              Last answer: {Math.round(last.grade.score * 100)}% {last.grade.score >= RIGHT ? '✓' : ''} · {new Date(last.at).toLocaleDateString()} · {card.srs.reps} reviews{card.srs.lapses ? `, forgotten ${card.srs.lapses}×` : ''}
            </p>
          )}
          <div className="actions">
            <button className="btn sm" onClick={() => setEditing(true)}><Icon name="edit" size={15} /> Edit</button>
            <button className="btn sm ghost danger-text" onClick={onRemove}><Icon name="trash" size={15} /> Delete</button>
          </div>
        </div>
      )}
      {open && editing && (
        <div className="crow-body form">
          <label>Question<input value={draft.prompt} onChange={(e) => setDraft({ ...draft, prompt: e.target.value })} /></label>
          <label>Model answer<textarea rows={3} value={draft.answer} onChange={(e) => setDraft({ ...draft, answer: e.target.value })} /></label>
          <label>Key points <span className="muted small">(one per line: what a good answer must contain)</span>
            <textarea rows={3} value={draft.keyPoints} onChange={(e) => setDraft({ ...draft, keyPoints: e.target.value })} />
          </label>
          <div className="actions">
            <button className="btn ghost" onClick={() => setEditing(false)}>Cancel</button>
            <button
              className="btn primary"
              disabled={!draft.prompt.trim() || !draft.answer.trim()}
              onClick={() => {
                onSave({ prompt: draft.prompt.trim(), answer: draft.answer.trim(), keyPoints: draft.keyPoints.split('\n').map((k) => k.trim()).filter(Boolean) });
                setEditing(false);
              }}
            >
              Save
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
