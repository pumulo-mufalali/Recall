import { useEffect, useMemo, useRef, useState } from 'react';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { dueCards } from './core/schedule';
import type { Attempt, Card, Deck } from './core/types';
import { cardsFromFile, cardsFromText, Queued } from './services/engine';
import { auth, loadSettings, type Settings } from './services/firebase';
import { dequeue, removeDeck, saveDeck, watchAttempts, watchCards, watchDecks, watchQueue, type QueuedJob } from './services/store';
import { Add } from './ui/Add';
import { Insights } from './ui/Insights';
import { Study } from './ui/Study';
import { useConditions, type LiveConditions } from './ui/useConditions';

type View = 'home' | 'add' | 'study' | 'insights';

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => onAuthStateChanged(auth, setUser), []);

  if (user === undefined) return <main className="app"><p className="muted center">Loading…</p></main>;
  if (!user) return <SignIn />;
  return <Signed user={user} />;
}

function SignIn() {
  const [error, setError] = useState('');
  return (
    <main className="app">
      <section className="panel center hero">
        <h1>Recall</h1>
        <p className="tagline">Know what you know.</p>
        <p>Turn your notes into questions, answer them from memory, and see the honest gap between how sure you feel and what you actually know. Marking happens on your device: private, instant, and offline.</p>
        <button
          className="primary"
          onClick={() => signInWithPopup(auth, new GoogleAuthProvider()).catch((e) => setError(navigator.onLine ? e.message : 'Signing in needs a connection the first time.'))}
        >
          Sign in with Google
        </button>
        {error && <p className="error">{error}</p>}
      </section>
    </main>
  );
}

function Signed({ user }: { user: User }) {
  const uid = user.uid;
  const conditions = useConditions();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [view, setView] = useState<View>('home');
  const [decks, setDecks] = useState<Deck[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [jobs, setJobs] = useState<QueuedJob[]>([]);

  useEffect(() => void loadSettings().then(setSettings), []);
  useEffect(() => watchDecks(uid, setDecks), [uid]);
  useEffect(() => watchCards(uid, setCards), [uid]);
  useEffect(() => watchAttempts(uid, setAttempts), [uid]);
  useEffect(() => watchQueue(uid, setJobs), [uid]);

  useQueueRunner(uid, jobs, conditions, settings);

  // Recomputed when cards change or the view changes (so returning home shows fresh due counts).
  const due = useMemo(() => dueCards(cards, new Date(), settings?.newPerSession ?? 10), [cards, settings, view]);

  if (!settings) return <main className="app"><p className="muted center">Loading…</p></main>;

  return (
    <main className="app">
      <header className="top">
        <button className="brand" onClick={() => setView('home')}>Recall</button>
        <Status conditions={conditions} />
        <button className="link" onClick={() => signOut(auth)}>Sign out</button>
      </header>

      {view === 'home' && (
        <Home
          due={due.length}
          decks={decks}
          cards={cards}
          jobs={jobs}
          attempts={attempts.length}
          onStudy={() => setView('study')}
          onAdd={() => setView('add')}
          onInsights={() => setView('insights')}
          onRemoveDeck={(d) => removeDeck(uid, d.id, cards.filter((c) => c.deckId === d.id))}
          onDropJob={(j) => dequeue(uid, j.id)}
        />
      )}
      {view === 'add' && <Add uid={uid} settings={settings} conditions={conditions} onDone={() => setView('home')} />}
      {view === 'study' && <Study uid={uid} cards={due} settings={settings} onDone={() => setView('home')} />}
      {view === 'insights' && <Insights attempts={attempts} cards={cards} onBack={() => setView('home')} />}
    </main>
  );
}

/** Connection and built-in model, at a glance; offers the one-time model download. */
function Status({ conditions: c }: { conditions: LiveConditions }) {
  return (
    <div className="status">
      <span className={`dot ${c.online ? 'on' : 'off'}`} /> {c.online ? 'Online' : 'Offline'}
      <span className="sep">·</span>
      {c.device === 'available' && <span title="Gemini Nano runs in this browser">◆ Built-in AI ready</span>}
      {c.device === 'downloading' && <span>◆ Downloading built-in AI{c.progress !== null ? ` ${Math.round(c.progress * 100)}%` : '…'}</span>}
      {c.device === 'downloadable' && <button className="link" onClick={c.download} disabled={!c.online}>◆ Get built-in AI</button>}
      {c.device === 'unavailable' && <span className="muted" title="This browser or device cannot run Gemini Nano: Recall uses the cloud, or its offline marker">No built-in AI here</span>}
    </div>
  );
}

function Home(props: {
  due: number;
  decks: Deck[];
  cards: Card[];
  jobs: QueuedJob[];
  attempts: number;
  onStudy: () => void;
  onAdd: () => void;
  onInsights: () => void;
  onRemoveDeck: (d: Deck) => void;
  onDropJob: (j: QueuedJob) => void;
}) {
  const { due, decks, cards, jobs } = props;
  return (
    <>
      <section className="panel center">
        <p className="big">{due}</p>
        <p className="muted">{due === 1 ? 'card due' : 'cards due'}</p>
        <div className="row center">
          <button className="primary" onClick={props.onStudy} disabled={!due}>Study now</button>
          <button onClick={props.onAdd}>Add material</button>
          <button onClick={props.onInsights} disabled={!props.attempts}>Insights</button>
        </div>
      </section>

      {jobs.length > 0 && (
        <section className="panel">
          <h3>Waiting for a connection</h3>
          <ul className="list">
            {jobs.map((j) => (
              <li key={j.id}>
                <span>{j.title}<span className="muted small"> · {j.reason}</span></span>
                <button className="link" onClick={() => props.onDropJob(j)}>Drop</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel">
        <h3>Your material</h3>
        {decks.length === 0 && <p className="muted">Nothing yet. Add notes, a photo of a page or a PDF to begin.</p>}
        <ul className="list">
          {decks.map((d) => {
            const mine = cards.filter((c) => c.deckId === d.id);
            const learned = mine.filter((c) => c.srs.state === 2).length;
            return (
              <li key={d.id}>
                <span>
                  {d.title}
                  <span className="muted small"> · {mine.length} cards · {learned} learned</span>
                </span>
                <button className="link" onClick={() => confirm(`Delete "${d.title}" and its cards?`) && props.onRemoveDeck(d)}>Delete</button>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

/** Turns queued material into cards once it can run (back online, or the model arrived). */
function useQueueRunner(uid: string, jobs: QueuedJob[], c: LiveConditions, settings: Settings | null) {
  const running = useRef(false);
  useEffect(() => {
    if (!settings || running.current || !jobs.length || !c.online) return;
    running.current = true;
    (async () => {
      for (const job of jobs) {
        try {
          const out = job.file
            ? await cardsFromFile(new File([bytes(job.file.data)], job.file.name, { type: job.file.type }), settings)
            : await cardsFromText(job.text ?? '', settings);
          if (out.value.length) saveDeck(uid, job.title, job.file ? (job.file.type === 'application/pdf' ? 'pdf' : 'image') : 'text', out.value, out.engine);
          dequeue(uid, job.id);
        } catch (e) {
          if (!(e instanceof Queued)) console.warn('[recall] queued job failed; will retry', e);
          break;
        }
      }
      running.current = false;
    })();
  }, [uid, jobs, c.online, c.device, settings]);
}

function bytes(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
