/**
 * Adding material: paste notes, or choose a photo or a PDF. Before anything runs, Recall says
 * where it will run and why; then it writes the cards, and you review them (edit or drop any)
 * before saving. With no way to run it now, the material waits for a connection.
 */
import { useMemo, useState } from 'react';
import type { DraftCard } from '../core/prompts';
import { route, type Task } from '../core/route';
import type { Engine } from '../core/types';
import { Queued, cardsFromFile, cardsFromText, type Outcome } from '../services/engine';
import type { Settings } from '../services/firebase';
import { QUEUE_MAX_FILE, enqueue, saveDeck } from '../services/store';
import { EngineBadge } from './EngineBadge';
import type { LiveConditions } from './useConditions';

interface Props {
  uid: string;
  settings: Settings;
  conditions: LiveConditions;
  onDone: () => void;
}

export function Add({ uid, settings, conditions, onDone }: Props) {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [made, setMade] = useState<Outcome<DraftCard[]> | null>(null);
  const [drafts, setDrafts] = useState<DraftCard[]>([]);

  const task: Task | null = file
    ? file.type === 'application/pdf'
      ? { kind: 'generate', source: 'pdf', bytes: file.size }
      : { kind: 'generate', source: 'image', mime: file.type, bytes: file.size }
    : text.trim()
      ? { kind: 'generate', source: 'text', chars: text.length }
      : null;
  const plan = useMemo(() => (task ? route(task, conditions, settings) : null), [task?.kind, file, text.length, conditions.online, conditions.device, settings]); // eslint-disable-line

  const make = async () => {
    setBusy(true);
    setError('');
    try {
      const out = file ? await cardsFromFile(file, settings) : await cardsFromText(text, settings);
      if (!out.value.length) throw new Error('No usable questions came back. Try clearer or longer material.');
      setMade(out);
      setDrafts(out.value);
    } catch (e) {
      if (e instanceof Queued) await queueIt(e.message);
      else setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const queueIt = async (reason: string) => {
    const name = title.trim() || (file ? file.name : firstLine(text));
    if (file) {
      if (file.size > QUEUE_MAX_FILE) {
        setError('This file is too large to keep until you reconnect. Try again when you are online.');
        return;
      }
      enqueue(uid, { title: name, reason, file: { name: file.name, type: file.type, data: await base64(file) } });
    } else enqueue(uid, { title: name, reason, text });
    onDone();
  };

  const save = () => {
    const source = file ? (file.type === 'application/pdf' ? 'pdf' : 'image') : 'text';
    saveDeck(uid, title.trim() || (file ? file.name : firstLine(text)), source, drafts, made?.engine ?? ('cloud' as Engine));
    onDone();
  };

  if (made) {
    return (
      <section className="panel">
        <h2>{drafts.length} questions</h2>
        <EngineBadge engine={made.engine} route={made.route} />
        <p className="muted small">Edit anything that is off, or drop it. Good questions make good practice.</p>
        <ol className="drafts">
          {drafts.map((d, i) => (
            <li key={i}>
              <input value={d.prompt} onChange={(e) => setDrafts(update(drafts, i, { prompt: e.target.value }))} aria-label="Question" />
              <textarea rows={2} value={d.answer} onChange={(e) => setDrafts(update(drafts, i, { answer: e.target.value }))} aria-label="Model answer" />
              <p className="muted small">Key points: {d.keyPoints.join(' · ')}</p>
              <button className="link" onClick={() => setDrafts(drafts.filter((_, j) => j !== i))}>Remove</button>
            </li>
          ))}
        </ol>
        <div className="row">
          <button onClick={() => setMade(null)}>Back</button>
          <button className="primary" onClick={save} disabled={!drafts.length}>Save {drafts.length} cards</button>
        </div>
      </section>
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
        disabled={busy}
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
          disabled={busy}
        />
      </label>
      {plan && (
        <p className={`plan plan-${plan.run}`}>
          <strong>{plan.run === 'queue' ? 'Will wait' : plan.run === 'model' && plan.mode.includes('device') ? 'On this device' : 'In the cloud'}:</strong> {plan.reason}
        </p>
      )}
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button onClick={onDone} disabled={busy}>Cancel</button>
        <button className="primary" onClick={make} disabled={!task || busy}>
          {busy ? 'Writing questions…' : plan?.run === 'queue' ? 'Keep for later' : 'Make questions'}
        </button>
      </div>
    </section>
  );
}

const update = (list: DraftCard[], i: number, change: Partial<DraftCard>) => list.map((d, j) => (j === i ? { ...d, ...change } : d));
const firstLine = (t: string) => t.trim().split('\n')[0].slice(0, 60) || 'Notes';

async function base64(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
