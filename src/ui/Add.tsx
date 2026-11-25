/**
 * Adding material: paste notes, or choose a photo or a PDF. Before anything runs, Recall says
 * where it will run and why. Then it writes the cards, fact-checks every one against the
 * material, and shows the review: verified cards, and flagged ones with what is off, the
 * supporting passage and a suggested correction. Flagged cards must be resolved before saving:
 * a card learned wrong is worse than no card.
 */
import { useEffect, useMemo, useState } from 'react';
import { route, type Route, type Task } from '../core/route';
import { Queued, cardsFromFile, cardsFromText, type Material } from '../services/engine';
import { reviewOf, type Draft, type Review } from '../services/review';
import type { Settings } from '../services/firebase';
import { QUEUE_MAX_FILE, dequeue, enqueue, saveDeck, type QueuedJob } from '../services/store';
import { EngineBadge } from './EngineBadge';
import { ErrorNote } from './ErrorNote';
import { Icon } from './Icon';
import { Plain, friendly, type Friendly } from '../core/errors';
import type { LiveConditions } from './useConditions';

/** A card under review: its check, and whether the learner has dealt with a flag. */
interface Props {
  uid: string;
  settings: Settings;
  conditions: LiveConditions;
  /** Material that waited for a connection and has now been turned into cards. */
  ready?: { job: QueuedJob; review: Review };
  /** Called with the new deck's id when saved; without one when the material was queued or abandoned. */
  onDone: (deckId?: string) => void;
}

type Source = 'text' | 'image' | 'pdf';
type Stage = '' | 'writing' | 'checking';

export function Add({ uid, settings, conditions, ready, onDone }: Props) {
  const [source, setSource] = useState<Source>('text');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>('');
  const [error, setError] = useState<Friendly | null>(null);
  const [review, setReview] = useState<Review | null>(ready?.review ?? null);
  const busy = stage !== '';

  const material = source === 'text' ? (text.trim() ? 'text' : null) : file ? 'file' : null;
  const task: Task | null =
    material === 'file' && file
      ? file.type === 'application/pdf'
        ? { kind: 'generate', source: 'pdf', bytes: file.size }
        : { kind: 'generate', source: 'image', mime: file.type, bytes: file.size }
      : material === 'text'
        ? { kind: 'generate', source: 'text', chars: text.length }
        : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const plan = useMemo(() => (task ? route(task, conditions, settings) : null), [material, file, text.length, conditions.online, conditions.device, settings]);

  const make = async () => {
    setError(null);
    const useFile = material === 'file' ? file : null;
    const name = title.trim() || (useFile ? useFile.name.replace(/\.[^.]+$/, '') : firstLine(text));
    try {
      setStage('writing');
      const made = useFile ? await cardsFromFile(useFile, settings) : await cardsFromText(text, settings);
      if (!made.value.length) throw new Plain('No usable questions came back.', 'Try clearer or longer material.', true);
      const m: Material = useFile ? { kind: 'file', file: useFile } : { kind: 'text', text };
      setStage('checking');
      setReview(await reviewOf(name, m, made.value, made.engine, made.route, settings));
    } catch (e) {
      if (e instanceof Queued) await queueIt(name, e.message, useFile);
      else {
        console.error('[recall] making questions failed', e);
        setError(friendly(e));
      }
    } finally {
      setStage('');
    }
  };

  const queueIt = async (name: string, reason: string, f: File | null) => {
    if (f) {
      if (f.size > QUEUE_MAX_FILE) {
        setError(friendly(new Plain('This file is too large to keep until you reconnect.', 'Try again when you are online.')));
        return;
      }
      enqueue(uid, { title: name, reason, file: { name: f.name, type: f.type, data: await base64(f) } });
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
        onBack={ready ? () => onDone() : () => setReview(null)}
        onSave={(drafts) => {
          const id = saveDeck(uid, review.title, review.source, drafts.map(({ prompt, answer, keyPoints }) => ({ prompt, answer, keyPoints })), review.madeBy);
          if (ready) dequeue(uid, ready.job.id);
          onDone(id);
        }}
      />
    );
  }

  if (busy) return <Working stage={stage} plan={plan} />;

  const onDevice = plan?.run === 'model' && plan.mode.includes('device');

  return (
    <div className="stack narrow">
      <header className="page-head">
        <div>
          <p className="eyebrow">New deck</p>
          <h1>Add material</h1>
          <p className="muted">Recall writes questions from it, then fact-checks every answer against it before you study.</p>
        </div>
      </header>

      <section className="card">
        <div className="seg big" role="tablist" aria-label="Kind of material">
          {(
            [
              ['text', 'text', 'Notes'],
              ['image', 'image', 'Photo'],
              ['pdf', 'pdf', 'PDF'],
            ] as const
          ).map(([s, icon, label]) => (
            <button
              key={s}
              role="tab"
              aria-selected={source === s}
              className={source === s ? 'on' : ''}
              onClick={() => {
                setSource(s);
                setFile(null);
                setError(null);
              }}
            >
              <Icon name={icon} size={17} /> {label}
            </button>
          ))}
        </div>

        <label className="field">
          <span>Title <span className="muted">(optional)</span></span>
          <input placeholder={source === 'text' ? 'e.g. Biology, chapter 4' : 'Uses the file name if left empty'} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>

        {source === 'text' ? (
          <label className="field">
            <span>Your notes</span>
            <textarea
              className="notes"
              rows={12}
              placeholder="Paste your notes, a chapter, an article: anything you need to know."
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <span className="field-foot muted small">
              {text.length.toLocaleString()} characters
              {text.length > settings.deviceMaxChars && ` · longer than the device takes at once (${settings.deviceMaxChars.toLocaleString()})`}
            </span>
          </label>
        ) : (
          <Drop kind={source} file={file} onFile={setFile} />
        )}
      </section>

      {plan && (
        <section className={`plan plan-${plan.run === 'queue' ? 'queue' : onDevice ? 'device' : 'cloud'}`}>
          <span className="plan-icon"><Icon name={plan.run === 'queue' ? 'clock' : onDevice ? 'device' : 'cloud'} size={20} /></span>
          <div>
            <strong>{plan.run === 'queue' ? 'Will wait for a connection' : onDevice ? 'Runs on this device' : 'Runs in the cloud'}</strong>
            <p>{plan.reason}{plan.run === 'model' && ' Then a second model fact-checks every card.'}</p>
          </div>
        </section>
      )}

      {error && <ErrorNote error={error} onRetry={make} />}

      <div className="actions end">
        <button className="btn ghost" onClick={() => onDone()}>Cancel</button>
        <button className="btn primary lg" onClick={make} disabled={!task}>
          {plan?.run === 'queue' ? <><Icon name="clock" size={18} /> Keep for later</> : <><Icon name="sparkle" size={18} /> Make questions</>}
        </button>
      </div>
    </div>
  );
}

/** A drop zone for a photo or a PDF, with a preview. */
function Drop({ kind, file, onFile }: { kind: 'image' | 'pdf'; file: File | null; onFile: (f: File | null) => void }) {
  const [over, setOver] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const accept = kind === 'pdf' ? 'application/pdf' : 'image/jpeg,image/png,image/webp';
  const fits = (f: File) => (kind === 'pdf' ? f.type === 'application/pdf' : f.type.startsWith('image/'));

  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div
      className={`drop${over ? ' over' : ''}${file ? ' has' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files[0];
        if (f && fits(f)) onFile(f);
      }}
    >
      {file ? (
        <div className="drop-file">
          {preview ? <img src={preview} alt="" /> : <span className="drop-thumb"><Icon name="pdf" size={30} /></span>}
          <div>
            <strong>{file.name}</strong>
            <p className="muted small">{size(file.size)}</p>
            <button className="btn sm ghost" onClick={() => onFile(null)}>Choose another</button>
          </div>
        </div>
      ) : (
        <>
          <span className="drop-icon"><Icon name={kind === 'pdf' ? 'pdf' : 'image'} size={30} /></span>
          <p><strong>{kind === 'pdf' ? 'Drop a PDF here' : 'Drop a photo of a page here'}</strong></p>
          <p className="muted small">{kind === 'pdf' ? 'Lecture slides, a paper, a chapter.' : 'A textbook page, a whiteboard, handwritten notes. JPEG or PNG reads on this device.'}</p>
          <div className="actions center">
            <label className="btn">
              <Icon name="upload" size={16} /> Choose {kind === 'pdf' ? 'a file' : 'a photo'}
              <input type="file" accept={accept} hidden onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
            </label>
            {kind === 'image' && (
              <label className="btn ghost only-touch">
                Take a photo
                <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
              </label>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Working({ stage, plan }: { stage: Stage; plan: Route | null }) {
  const onDevice = plan?.run === 'model' && plan.mode.includes('device');
  const steps: [Stage, string, string][] = [
    ['writing', 'Writing questions', onDevice ? 'Gemini Nano, on this device' : 'Gemini, in the cloud'],
    ['checking', 'Fact-checking every answer', 'A second, larger model checks each one against your material'],
  ];
  const at = steps.findIndex(([s]) => s === stage);
  return (
    <div className="working">
      <div className="spinner lg" />
      <h2>{steps[at]?.[1]}…</h2>
      <ol className="stepper">
        {steps.map(([s, label, sub], i) => (
          <li key={s} className={i < at ? 'done' : i === at ? 'now' : ''}>
            <span className="stepper-dot">{i < at ? <Icon name="check" size={14} /> : i + 1}</span>
            <span><strong>{label}</strong><span className="muted small">{sub}</span></span>
          </li>
        ))}
        <li>
          <span className="stepper-dot">3</span>
          <span><strong>Your review</strong><span className="muted small">Nothing is saved until you approve it</span></span>
        </li>
      </ol>
    </div>
  );
}

/** Writes nothing: checks drafts and packages them for review. */
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
  const fixed = drafts.filter((d) => d.check.status === 'flagged' && d.resolved).length;
  const unchecked = drafts.filter((d) => d.check.status === 'unchecked').length;
  const set = (i: number, change: Partial<Draft>) => setReview({ ...review, drafts: drafts.map((d, j) => (j === i ? { ...d, ...change } : d)) });

  const recheck = async () => {
    setRechecking(true);
    try {
      setReview(await reviewOf(review.title, review.material, drafts, review.madeBy, review.madeRoute, settings));
    } finally {
      setRechecking(false);
    }
  };

  return (
    <div className="stack narrow">
      <header className="page-head">
        <div>
          <p className="eyebrow">Review before saving</p>
          <input className="title-input" value={review.title} onChange={(e) => setReview({ ...review, title: e.target.value })} aria-label="Deck title" />
        </div>
      </header>

      <section className="card review-summary">
        <div className="tally">
          <span className="tally-item tone-good"><Icon name="check" size={16} /> <b>{verified}</b> match the source</span>
          {flagged + fixed > 0 && <span className="tally-item tone-bad"><Icon name="warn" size={16} /> <b>{flagged}</b> to check{fixed > 0 && ` · ${fixed} resolved`}</span>}
          {unchecked > 0 && <span className="tally-item"><Icon name="clock" size={16} /> <b>{unchecked}</b> not checked</span>}
        </div>
        <div className="engines">
          <div><span className="muted small">Written</span><EngineBadge engine={review.madeBy} route={review.madeRoute} /></div>
          <div><span className="muted small">Fact-checked</span><EngineBadge engine={review.checkedBy} route={review.checkRoute} /></div>
        </div>
        {unchecked > 0 && online && (
          <button className="btn sm" onClick={recheck} disabled={rechecking}>{rechecking ? 'Checking…' : 'Fact-check again'}</button>
        )}
      </section>

      <ol className="drafts">
        {drafts.map((d, i) => {
          const status = d.check.status === 'flagged' ? (d.resolved ? 'fixed' : 'flagged') : d.check.status;
          return (
            <li key={i} className={`draft draft-${status}`}>
              <div className="draft-top">
                <span className="draft-n">{i + 1}</span>
                <span className={`chip chip-${status}`}>
                  {status === 'verified' ? 'Verified' : status === 'flagged' ? 'Needs a look' : status === 'fixed' ? 'Resolved' : 'Not checked'}
                </span>
                <button className="icon-btn danger" onClick={() => setReview({ ...review, drafts: drafts.filter((_, j) => j !== i) })} aria-label="Remove this card" title="Remove">
                  <Icon name="trash" size={16} />
                </button>
              </div>
              <textarea className="draft-q" rows={1} value={d.prompt} onChange={(e) => set(i, { prompt: e.target.value, resolved: true })} aria-label="Question" />
              <textarea className="draft-a" rows={2} value={d.answer} onChange={(e) => set(i, { answer: e.target.value, resolved: true })} aria-label="Model answer" />
              <div className="kp-edit">
                {d.keyPoints.map((k, j) => (
                  <span className="kp-chip" key={j}>
                    {k}
                    <button aria-label={`Remove key point ${k}`} onClick={() => set(i, { keyPoints: d.keyPoints.filter((_, x) => x !== j), resolved: true })}>
                      <Icon name="x" size={12} />
                    </button>
                  </span>
                ))}
                <input
                  className="kp-new"
                  placeholder="+ key point"
                  onKeyDown={(e) => {
                    const v = e.currentTarget.value.trim();
                    if (e.key === 'Enter' && v) {
                      set(i, { keyPoints: [...d.keyPoints, v], resolved: true });
                      e.currentTarget.value = '';
                    }
                  }}
                  aria-label="Add a key point"
                />
              </div>

              {d.check.status === 'verified' && d.check.evidence && (
                <details className="evidence">
                  <summary><Icon name="check" size={14} /> Supported by your material</summary>
                  <blockquote>{d.check.evidence}</blockquote>
                </details>
              )}
              {d.check.status === 'unchecked' && <p className="muted small">{d.check.notes.join(' ')}</p>}
              {d.check.status === 'flagged' && (
                <div className={`flag${d.resolved ? ' resolved' : ''}`}>
                  <p><strong>{d.resolved ? 'Resolved.' : 'The fact-check disagrees.'}</strong> {d.check.notes.join(' ')}</p>
                  {d.check.evidence && <blockquote>{d.check.evidence}</blockquote>}
                  {!d.resolved && (
                    <>
                      {d.check.correction && <p className="suggest"><span className="muted small">Suggested answer</span>{d.check.correction.answer}</p>}
                      <div className="actions">
                        {d.check.correction && (
                          <button className="btn sm primary" onClick={() => set(i, { answer: d.check.correction!.answer, keyPoints: d.check.correction!.keyPoints, resolved: true })}>
                            Use the correction
                          </button>
                        )}
                        <button className="btn sm" onClick={() => set(i, { resolved: true })}>It is right, keep it</button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <div className="save-bar">
        <button className="btn ghost" onClick={onBack}>Back</button>
        <span className="muted small">{drafts.length} cards</span>
        <button className="btn primary" onClick={() => onSave(drafts)} disabled={!drafts.length || flagged > 0}>
          {flagged > 0 ? `Resolve ${flagged} flagged first` : `Save ${drafts.length} cards`}
        </button>
      </div>
    </div>
  );
}

const firstLine = (t: string) => t.trim().split('\n')[0].slice(0, 60) || 'Notes';
const size = (n: number) => (n < 1_000_000 ? `${Math.round(n / 1000)} KB` : `${(n / 1_000_000).toFixed(1)} MB`);

async function base64(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
