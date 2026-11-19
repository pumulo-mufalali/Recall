import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { dueCards } from './core/schedule';
import type { Attempt, Card, Deck } from './core/types';
import { cardsFromFile, cardsFromText, Queued } from './services/engine';
import { auth, loadSettings, type Settings } from './services/firebase';
import { dequeue, removeDeck, watchAttempts, watchAudits, watchCards, watchDecks, watchQueue, type QueuedJob } from './services/store';
import { trustFrom, type Audit } from './core/audit';
import { usePolicy } from './ui/usePolicy';
import { Add, reviewOf, type Review } from './ui/Add';
import { Insights } from './ui/Insights';
import { Study } from './ui/Study';
import { useConditions, type LiveConditions } from './ui/useConditions';
import { Today } from './ui/Today';
import { Library, DeckView } from './ui/Library';
import { EnginePage } from './ui/EnginePage';
import { SignIn } from './ui/SignIn';
import { Icon, type IconName } from './ui/Icon';
import { Logo } from './ui/Logo';
import { useConfirm } from './ui/Dialog';
import { go, href, useRoute, type Route } from './ui/router';

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => onAuthStateChanged(auth, setUser), []);

  if (user === undefined) return <Splash />;
  if (!user) return <SignIn />;
  return <Signed user={user} />;
}

function Splash() {
  return (
    <div className="splash">
      <Logo />
      <div className="spinner" aria-label="Loading" />
    </div>
  );
}

const NAV: { route: Route; label: string; icon: IconName }[] = [
  { route: { name: 'today' }, label: 'Today', icon: 'today' },
  { route: { name: 'library' }, label: 'Library', icon: 'library' },
  { route: { name: 'add' }, label: 'Add', icon: 'add' },
  { route: { name: 'insights' }, label: 'Insights', icon: 'insights' },
  { route: { name: 'engine' }, label: 'AI engine', icon: 'engine' },
];

/** Which nav item a screen belongs to. */
const section = (r: Route): Route['name'] => (r.name === 'deck' ? 'library' : r.name === 'review' ? 'add' : r.name === 'study' ? 'today' : r.name);

function Signed({ user }: { user: User }) {
  const uid = user.uid;
  const route = useRoute();
  const conditions = useConditions();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [jobs, setJobs] = useState<QueuedJob[]>([]);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [policy, setPolicy] = usePolicy();
  const [ready, setReady] = useState<Record<string, Review>>({});
  const [ask, dialog] = useConfirm();

  useEffect(() => void loadSettings().then(setSettings), []);
  useEffect(() => watchDecks(uid, setDecks), [uid]);
  useEffect(() => watchCards(uid, setCards), [uid]);
  useEffect(() => watchAttempts(uid, setAttempts), [uid]);
  useEffect(() => watchQueue(uid, setJobs), [uid]);
  useEffect(() => watchAudits(uid, setAudits), [uid]);
  const trust = useMemo(() => trustFrom(audits), [audits]);
  const hybrid = useMemo(() => ({ trust, policy }), [trust, policy]);

  const onReady = useCallback((id: string, review: Review) => setReady((r) => ({ ...r, [id]: review })), []);
  useQueueRunner(jobs, ready, conditions, settings, onReady);

  // Recomputed when cards change or the screen changes (so returning shows fresh due counts).
  const newPerSession = settings?.newPerSession ?? 10;
  const due = useMemo(() => dueCards(cards, new Date(), newPerSession), [cards, newPerSession, route]);

  const deleteDeck = async (d: Deck) => {
    const yes = await ask({
      title: `Delete “${d.title}”?`,
      body: <p>Its {d.cardCount} cards and their schedule go too. Your past answers stay in Insights.</p>,
      confirm: 'Delete',
      danger: true,
    });
    if (!yes) return false;
    removeDeck(uid, d.id, cards.filter((c) => c.deckId === d.id));
    return true;
  };

  const leave = async () => {
    if (await ask({ title: 'Sign out?', body: <p>Your cards are saved to your account and will be here when you sign back in.</p>, confirm: 'Sign out' })) signOut(auth);
  };

  if (!settings) return <Splash />;

  const focus = route.name === 'study';
  const active = section(route);

  let screen;
  switch (route.name) {
    case 'today':
      screen = <Today user={user} due={due} decks={decks} cards={cards} attempts={attempts} jobs={jobs} ready={ready} conditions={conditions} onDropJob={(j) => dequeue(uid, j.id)} />;
      break;
    case 'library':
      screen = <Library decks={decks} cards={cards} attempts={attempts} onDelete={deleteDeck} />;
      break;
    case 'deck': {
      const deck = decks.find((d) => d.id === route.id);
      screen = deck ? (
        <DeckView uid={uid} deck={deck} cards={cards.filter((c) => c.deckId === deck.id)} attempts={attempts} newPerSession={newPerSession} ask={ask} onDelete={async () => (await deleteDeck(deck)) && go({ name: 'library' }, true)} />
      ) : (
        <Missing what="This deck" />
      );
      break;
    }
    case 'add':
      screen = <Add key="new" uid={uid} settings={settings} conditions={conditions} onDone={(deckId) => go(deckId ? { name: 'deck', id: deckId } : { name: 'today' }, true)} />;
      break;
    case 'review': {
      const job = jobs.find((j) => j.id === route.jobId);
      const review = ready[route.jobId];
      screen =
        job && review ? (
          <Add key={job.id} uid={uid} settings={settings} conditions={conditions} ready={{ job, review }} onDone={(deckId) => go(deckId ? { name: 'deck', id: deckId } : { name: 'today' }, true)} />
        ) : (
          <Missing what="These questions" />
        );
      break;
    }
    case 'study': {
      const pick = route.deckId ? (route.all ? cards.filter((c) => c.deckId === route.deckId) : dueCards(cards.filter((c) => c.deckId === route.deckId), new Date(), newPerSession)) : due;
      screen = <Study key={href(route)} uid={uid} cards={pick} decks={decks} settings={settings} hybrid={hybrid} onDone={() => history.length > 1 ? history.back() : go({ name: 'today' })} />;
      break;
    }
    case 'insights':
      screen = <Insights attempts={attempts} cards={cards} decks={decks} />;
      break;
    case 'engine':
      screen = <EnginePage conditions={conditions} settings={settings} attempts={attempts} audits={audits} trust={trust} policy={policy} onPolicy={setPolicy} />;
      break;
  }

  return (
    <div className={`shell${focus ? ' focus' : ''}`}>
      {!focus && (
        <aside className="sidebar">
          <a className="brand" href="#/">
            <Logo /> <span>Recall</span>
          </a>
          <nav className="nav" aria-label="Main">
            {NAV.map((n) => (
              <a key={n.label} href={href(n.route)} className={`nav-item${active === n.route.name ? ' active' : ''}${n.route.name === 'add' ? ' nav-add' : ''}`} aria-current={active === n.route.name ? 'page' : undefined}>
                <Icon name={n.icon} />
                <span>{n.label}</span>
                {n.route.name === 'today' && due.length > 0 && <span className="nav-count">{due.length}</span>}
              </a>
            ))}
          </nav>
          <div className="sidebar-foot">
            <StatusPill conditions={conditions} />
            <div className="me">
              {user.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : <span className="avatar">{(user.displayName ?? '?')[0]}</span>}
              <span className="me-name">{user.displayName ?? user.email}</span>
              <button className="icon-btn" onClick={leave} title="Sign out" aria-label="Sign out">
                <Icon name="out" size={18} />
              </button>
            </div>
          </div>
        </aside>
      )}
      <main className="main">
        {!focus && (
          <header className="mobile-top">
            <a className="brand" href="#/">
              <Logo size={24} /> <span>Recall</span>
            </a>
            <StatusPill conditions={conditions} compact />
          </header>
        )}
        <div className="screen" key={active}>{screen}</div>
      </main>
      {!focus && (
        <nav className="tabbar" aria-label="Main">
          {NAV.map((n) => (
            <a key={n.label} href={href(n.route)} className={`tab${active === n.route.name ? ' active' : ''}${n.route.name === 'add' ? ' tab-add' : ''}`} aria-current={active === n.route.name ? 'page' : undefined}>
              <Icon name={n.icon} size={n.route.name === 'add' ? 24 : 21} />
              <span>{n.route.name === 'engine' ? 'AI' : n.label}</span>
            </a>
          ))}
        </nav>
      )}
      {dialog}
    </div>
  );
}

function Missing({ what }: { what: string }) {
  return (
    <div className="empty">
      <h2>{what} could not be found.</h2>
      <p className="muted">It may have been deleted, or it only existed before the page was reloaded.</p>
      <a className="btn" href="#/">Back to Today</a>
    </div>
  );
}

/** Connection and built-in model at a glance; links to the AI engine page for details. */
function StatusPill({ conditions: c, compact }: { conditions: LiveConditions; compact?: boolean }) {
  const model = c.device === 'available' ? 'On-device AI' : c.device === 'downloading' ? `Getting AI${c.progress !== null ? ` ${Math.round(c.progress * 100)}%` : '…'}` : 'Cloud AI';
  return (
    <a className={`status-pill${compact ? ' compact' : ''}`} href="#/engine" title="Where Recall's AI runs right now">
      <span className={`dot ${c.online ? 'on' : 'off'}`} />
      <span>{c.online ? 'Online' : 'Offline'}</span>
      <span className="sep" />
      <Icon name={c.device === 'available' ? 'device' : 'cloud'} size={14} />
      <span className="status-model">{model}</span>
    </a>
  );
}

/**
 * Turns waiting material into cards once it can run (back online, or the model arrived), and
 * fact-checks them. Nothing is saved without the learner's review: results wait on the Today
 * screen as "ready to review" (kept in memory; the material itself stays queued until saved).
 */
function useQueueRunner(jobs: QueuedJob[], ready: Record<string, Review>, c: LiveConditions, settings: Settings | null, onReady: (id: string, review: Review) => void) {
  const running = useRef(false);
  useEffect(() => {
    const todo = jobs.filter((j) => !ready[j.id]);
    if (!settings || running.current || !todo.length || !c.online) return;
    running.current = true;
    (async () => {
      for (const job of todo) {
        try {
          const file = job.file ? new File([bytes(job.file.data)], job.file.name, { type: job.file.type }) : null;
          const made = file ? await cardsFromFile(file, settings) : await cardsFromText(job.text ?? '', settings);
          if (!made.value.length) continue;
          onReady(job.id, await reviewOf(job.title, file ? { kind: 'file', file } : { kind: 'text', text: job.text ?? '' }, made.value, made.engine, made.route, settings));
        } catch (e) {
          if (!(e instanceof Queued)) console.warn('[recall] waiting material failed; will retry', e);
          break;
        }
      }
      running.current = false;
    })();
  }, [jobs, ready, c.online, c.device, settings, onReady]);
}

function bytes(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
