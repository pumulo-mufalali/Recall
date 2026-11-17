/**
 * Adding material: paste notes, or choose a photo or a PDF. Before anything runs, Recall says
 * where it will run and why. Then it writes the cards, fact-checks every one against the
 * material, and shows the review: verified cards, and flagged ones with what is off, the
 * supporting passage and a suggested correction. Flagged cards must be resolved before saving:
 * a card learned wrong is worse than no card.
 */
import { useMemo, useState } from 'react';
import type { DraftCard } from '../core/prompts';
import { route, type Route, type Task } from '../core/route';
import type { Engine } from '../core/types';
import type { CardCheck } from '../core/verify';
import { Queued, cardsFromFile, cardsFromText, verifyCards, type Material } from '../services/engine';
import type { Settings } from '../services/firebase';
import { QUEUE_MAX_FILE, dequeue, enqueue, saveDeck, type QueuedJob } from '../services/store';
import { EngineBadge } from './EngineBadge';
import type { LiveConditions } from './useConditions';

/** A card under review: its check, and whether the learner has dealt with a flag. */
export interface Draft extends DraftCard {
  check: CardCheck;
  resolved: boolean;
}

export interface Review {
  title: string;
  source: 'text' | 'image' | 'pdf';
  material: Material;
  drafts: Draft[];
  madeBy: Engine;
  madeRoute: Route;
  checkedBy: Engine;
  checkRoute: Route;
}

interface Props {
  uid: string;
  settings: Settings;
  conditions: LiveConditions;
  /** Material that waited for a connection and has now been turned into cards. */
  ready?: { job: QueuedJob; review: Review };
  onDone: () => void;
}

export function Add({ uid, settings, conditions, ready, onDone }: Props) {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [review, setReview] = useState<Review | null>(ready?.review ?? null);

  const task: Task | null = file
    ? file.type === 'application/pdf'
      ? { kind: 'generate', source: 'pdf', bytes: file.size }
      : { kind: 'generate', source: 'image', mime: file.type, bytes: file.size }
    : text.trim()
      ? { kind: 'generate', source: 'text', chars: text.length }
      : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const plan = useMemo(() => (task ? route(task, conditions, settings) : null), [file, text.length, conditions.online, conditions.device, settings]);

  const make = async () => {
    setError('');
    const name = title.trim() || (file ? file.name : firstLine(text));
    try {
      setBusy('Writing questions…');
      const made = file ? await cardsFromFile(file, settings) : await cardsFromText(text, settings);
      if (!made.value.length) throw new Error('No usable questions came back. Try clearer or longer material.');
      const material: Material = file ? { kind: 'file', file } : { kind: 'text', text };
      setBusy('Fact-checking every answer against your material…');
      setReview(await reviewOf(name, material, made.value, made.engine, made.route, settings));
    } catch (e) {
      if (e instanceof Queued) await queueIt(name, e.message);
      else setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };

  const queueIt = async (name: string, reason: string) => {
    if (file) {
      if (file.size > QUEUE_MAX_FILE) {
        setError('This file is too large to keep until you reconnect. Try again when you are online.');
        return;
      }
      enqueue(uid, { title: name, reason, file: { name: file.name, type: file.type, data: await base64(file) } });
    } else enqueue(uid, { title: name, reason, text });
    onDone();
  };

  if (review) {
    return (
      <ReviewView
        review={review}
        setReview={setReview}
        settings={settings}
        online={conditions.online}
        onBack={ready ? onDone : () => setReview(null)}
        onSave={(drafts) => {
          saveDeck(uid, review.title, review.source, drafts.map(({ prompt, answer, keyPoints }) => ({ prompt, answer, keyPoints })), review.madeBy);
          if (ready) dequeue(uid, ready.job.id);
          onDone();
        }}
      />
    );
  }

  return (
    <section className="panel">
      <h2>Add material</h2>
      <input placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea
        rows={10}
        placeholder="Paste your notes, a chapter, or anything you need to know."
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setFile(null);
        }}
        disabled={!!busy}
      />
      <label className="file">
        <span>…or a photo of a page, or a PDF</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setText('');
          }}
          disabled={!!busy}
        />
      </label>
      {plan && (
        <p className={`plan plan-${plan.run}`}>
          <strong>{plan.run === 'queue' ? 'Will wait' : plan.run === 'model' && plan.mode.includes('device') ? 'On this device' : 'In the cloud'}:</strong> {plan.reason}
        </p>
      )}
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button onClick={onDone} disabled={!!busy}>Cancel</button>
        <button className="primary" onClick={make} disabled={!task || !!busy}>
          {busy || (plan?.run === 'queue' ? 'Keep for later' : 'Make questions')}
        </button>
      </div>
    </section>
  );
}

/** Writes nothing: checks drafts and packages them for review. */
export async function reviewOf(title: string, material: Material, drafts: DraftCard[], madeBy: Engine, madeRoute: Route, settings: Settings): Promise<Review> {
  const checked = await verifyCards(drafts, material, settings);
  const source = material.kind === 'text' ? 'text' : material.file.type === 'application/pdf' ? 'pdf' : 'image';
  return {
    title,
    source,
    material,
    drafts: drafts.map((d, i) => ({ ...d, check: checked.value[i], resolved: checked.value[i].status !== 'flagged' })),
    madeBy,
    madeRoute,
    checkedBy: checked.engine,
    checkRoute: checked.route,
  };
}

function ReviewView({ review, setReview, settings, online, onBack, onSave }: {
  review: Review;
  setReview: (r: Review) => void;
  settings: Settings;
  online: boolean;
  onBack: () => void;
  onSave: (drafts: Draft[]) => void;
}) {
  const [rechecking, setRechecking] = useState(false);
  const { drafts } = review;
  const flagged = drafts.filter((d) => d.check.status === 'flagged' && !d.resolved).length;
  const verified = drafts.filter((d) => d.check.status === 'verified').length;
  const unchecked = drafts.filter((d) => d.check.status === 'unchecked').length;
  const set = (i: number, change: Partial<Draft>) => setReview({ ...review, drafts: drafts.map((d, j) => (j === i ? { ...d, ...change } : d)) });

  const recheck = async () => {
    setRechecking(true);
    try {
      const again = await reviewOf(review.title, review.material, drafts, review.madeBy, review.madeRoute, settings);
      setReview(again);
    } finally {
      setRechecking(false);
    }
  };

  return (
    <section className="panel">
      <h2>{review.title}</h2>
      <div className="row tight">
        <span className="small muted">Written:</span> <EngineBadge engine={review.madeBy} route={review.madeRoute} />
      </div>
      <div className="row tight">
        <span className="small muted">Fact-checked:</span> <EngineBadge engine={review.checkedBy} route={review.checkRoute} />
      </div>
      <p className="summary-line">
        <span className="ok">✓ {verified} match the source</span>
        {flagged > 0 && <span className="warn">⚠ {flagged} need your attention</span>}
        {unchecked > 0 && <span className="muted">○ {unchecked} not checked</span>}
      </p>
      {unchecked > 0 && online && <button onClick={recheck} disabled={rechecking}>{rechecking ? 'Checking…' : 'Fact-check again'}</button>}

      <ol className="drafts">
        {drafts.map((d, i) => (
          <li key={i} className={`draft draft-${d.check.status}${d.resolved ? ' resolved' : ''}`}>
            <input value={d.prompt} onChange={(e) => set(i, { prompt: e.target.value, resolved: true })} aria-label="Question" />
            <textarea rows={2} value={d.answer} onChange={(e) => set(i, { answer: e.target.value, resolved: true })} aria-label="Model answer" />
            <input
              value={d.keyPoints.join(' | ')}
              onChange={(e) => set(i, { keyPoints: e.target.value.split('|').map((k) => k.trim()).filter(Boolean), resolved: true })}
              aria-label="Key points, separated by |"
              className="small"
            />

            {d.check.status === 'verified' && (
              <details className="evidence">
                <summary>✓ Matches the source</summary>
                <blockquote>{d.check.evidence}</blockquote>
              </details>
            )}
            {d.check.status === 'unchecked' && <p className="muted small">○ {d.check.notes.join(' ')}</p>}
            {d.check.status === 'flagged' && (
              <div className="flag">
                <p><strong>{d.resolved ? '✓ Resolved' : '⚠ Check this card'}:</strong> {d.check.notes.join(' ')}</p>
                {d.check.evidence && <blockquote>{d.check.evidence}</blockquote>}
                {d.check.correction && !d.resolved && (
                  <p className="small">Suggested: {d.check.correction.answer}</p>
                )}
                {!d.resolved && (
                  <div className="row tight">
                    {d.check.correction && (
                      <button className="primary" onClick={() => set(i, { answer: d.check.correction!.answer, keyPoints: d.check.correction!.keyPoints, resolved: true })}>
                        Use the correction
                      </button>
                    )}
                    <button onClick={() => set(i, { resolved: true })}>It is right, keep it</button>
                  </div>
                )}
              </div>
            )}
            <button className="link" onClick={() => setReview({ ...review, drafts: drafts.filter((_, j) => j !== i) })}>Remove</button>
          </li>
        ))}
      </ol>
      <div className="row">
        <button onClick={onBack}>Back</button>
        <button className="primary" onClick={() => onSave(drafts)} disabled={!drafts.length || flagged > 0}>
          {flagged > 0 ? `Resolve ${flagged} flagged first` : `Save ${drafts.length} cards`}
        </button>
      </div>
    </section>
  );
}

const firstLine = (t: string) => t.trim().split('\n')[0].slice(0, 60) || 'Notes';

export async function base64(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
