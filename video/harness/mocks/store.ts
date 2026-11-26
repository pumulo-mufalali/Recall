// Stand-in for src/services/store.ts: the film data, kept in memory, so writes update the screen.
// ?empty in the URL starts a brand-new account (no decks), to film or test the welcome screen.
import { attempts, audits, cards, decks } from './data';

type Listener<T> = (d: T) => void;
function live<T>(initial: T) {
  let value = initial;
  const listeners = new Set<Listener<T>>();
  return {
    get: () => value,
    set(next: T) { value = next; listeners.forEach((l) => l(value)); },
    watch: (_uid: string, on: Listener<T>) => { listeners.add(on); setTimeout(() => on(value), 0); return () => { listeners.delete(on); }; },
  };
}

const empty = location.search.includes('empty');
const hour = 3_600_000;
const inHours = (h: number) => { const d = new Date(Date.now() + h * hour); d.setMinutes(0, 0, 0); return d.toISOString(); };

const deckStore = live<any[]>(empty ? [] : decks);
const cardStore = live<any[]>(empty ? [] : cards);
const attemptStore = live<any[]>(empty ? [] : attempts);
const auditStore = live<any[]>(empty ? [] : audits);
const sessionStore = live<any[]>(empty ? [] : [
  { id: 's1', at: inHours(3), minutes: 25, deckId: 'd1', remind: 10, createdAt: '' },
  { id: 's2', at: inHours(26), minutes: 45, deckId: null, remind: 30, createdAt: '' },
  { id: 's3', at: inHours(98), minutes: 15, deckId: 'd3', remind: 0, createdAt: '' },
]);
const runStore = live<any[]>([]);

export const watchDecks = deckStore.watch;
export const watchCards = cardStore.watch;
export const watchAttempts = (uid: string, on: Listener<any[]>) => attemptStore.watch(uid, (a) => on([...a].sort((x, y) => Date.parse(y.at) - Date.parse(x.at))));
export const watchAudits = (uid: string, on: Listener<any[]>) => auditStore.watch(uid, (a) => on([...a].sort((x, y) => Date.parse(y.at) - Date.parse(x.at))));
export const watchQueue = live<any[]>([]).watch;
export const watchSessions = sessionStore.watch;
export const watchGauntlets = runStore.watch;
export const QUEUE_MAX_FILE = 700_000;
export const saveDeck = () => 'd1';
export const recordAnswer = (_uid: string, card: any, answer: string, confidence: any, grade: any) => ({ id: 'new', cardId: card.id, deckId: card.deckId, at: new Date().toISOString(), answer, confidence, grade });
export const reviseAnswer = () => {};
export const recordAudit = () => {};
export const editCard = () => {};
export const removeCard = () => {};
export const removeDeck = () => {};
export const enqueue = () => {};
export const dequeue = () => {};
export const saveSession = (_uid: string, s: any) => { const saved = { ...s, id: `s${Date.now()}`, createdAt: new Date().toISOString() }; sessionStore.set([...sessionStore.get(), saved]); return saved; };
export const removeSession = (_uid: string, id: string) => sessionStore.set(sessionStore.get().filter((s) => s.id !== id));
export const saveGauntlet = (_uid: string, run: any) => runStore.set([...runStore.get(), { ...run, id: `g${Date.now()}` }]);

// Study preferences: in memory, so changing a setting updates the screen.
const prefStore = live<any>({ newPerSession: null, sessionMinutes: 25, remind: 10 });
export const watchPrefs = prefStore.watch;
export const savePrefs = (_uid: string, change: any) => prefStore.set({ ...prefStore.get(), ...change });

export const deleteAllData = async () => {
  for (const s of [deckStore, cardStore, attemptStore, auditStore, sessionStore, runStore]) s.set([]);
};

// The example data, as the real store writes it: every document marked example.
export const seedExample = (_uid: string, data: any) => {
  const mark = (xs: any[]) => xs.map((x) => ({ ...x, example: true }));
  deckStore.set([...mark(data.decks), ...deckStore.get()]);
  cardStore.set([...cardStore.get(), ...mark(data.cards)]);
  attemptStore.set([...attemptStore.get(), ...mark(data.attempts)]);
  auditStore.set([...auditStore.get(), ...mark(data.audits)]);
  runStore.set([...runStore.get(), ...mark(data.runs)]);
  sessionStore.set([...sessionStore.get(), ...mark(data.sessions)]);
};
export const removeExample = async () => {
  await new Promise((r) => setTimeout(r, 900));
  for (const s of [deckStore, cardStore, attemptStore, auditStore, sessionStore, runStore]) s.set(s.get().filter((x: any) => !x.example));
};
