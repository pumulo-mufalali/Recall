// Stand-in for src/services/store.ts: serves the fake data, writes go nowhere.
import { attempts, audits, cards, decks } from './data';

const serve = <T,>(data: T) => (_uid: string, on: (d: T) => void) => {
  setTimeout(() => on(data), 0);
  return () => {};
};

export const watchDecks = serve(decks);
export const watchCards = serve(cards);
export const watchAttempts = serve(attempts);
export const watchAudits = serve(audits);
export const watchQueue = serve([]);
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

// Sessions: kept in memory so scheduling and removing update the screen.
const hour = 3_600_000;
const inHours = (h: number) => { const d = new Date(Date.now() + h * hour); d.setMinutes(0, 0, 0); return d.toISOString(); };
let sessions: any[] = [
  { id: 's1', at: inHours(3), minutes: 25, deckId: 'd1', remind: 10, createdAt: '' },
  { id: 's2', at: inHours(26), minutes: 45, deckId: null, remind: 30, createdAt: '' },
  { id: 's3', at: inHours(98), minutes: 15, deckId: 'd3', remind: 0, createdAt: '' },
];
const listeners = new Set<(s: any[]) => void>();
const emit = () => listeners.forEach((l) => l([...sessions]));
export const watchSessions = (_uid: string, on: (s: any[]) => void) => { listeners.add(on); setTimeout(() => on([...sessions]), 0); return () => listeners.delete(on); };
export const saveSession = (_uid: string, s: any) => { const saved = { ...s, id: `s${Date.now()}`, createdAt: new Date().toISOString() }; sessions = [...sessions, saved]; emit(); return saved; };
export const removeSession = (_uid: string, id: string) => { sessions = sessions.filter((s) => s.id !== id); emit(); };

// Study preferences: in memory, so changing a setting updates the screen.
let prefs: any = { newPerSession: null, sessionMinutes: 25, remind: 10 };
const prefListeners = new Set<(p: any) => void>();
export const watchPrefs = (_uid: string, on: (p: any) => void) => { prefListeners.add(on); setTimeout(() => on({ ...prefs }), 0); return () => prefListeners.delete(on); };
export const savePrefs = (_uid: string, change: any) => { prefs = { ...prefs, ...change }; prefListeners.forEach((l) => l({ ...prefs })); };
export const deleteAllData = async () => {};

// Trap Gauntlet runs: in memory.
let runs: any[] = [];
const runListeners = new Set<(r: any[]) => void>();
export const watchGauntlets = (_uid: string, on: (r: any[]) => void) => { runListeners.add(on); setTimeout(() => on([...runs]), 0); return () => runListeners.delete(on); };
export const saveGauntlet = (_uid: string, run: any) => { runs = [...runs, { ...run, id: `g${Date.now()}` }]; runListeners.forEach((l) => l([...runs])); };
