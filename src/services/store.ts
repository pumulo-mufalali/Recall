/**
 * The learner's data in Firestore, under users/{uid}/:
 *   decks/{deckId}               a set of cards made from one piece of material
 *   decks/{deckId}/cards/{id}    one question, its model answer, key points, schedule
 *   attempts/{id}                every answer, with confidence and marking (for calibration)
 *   queue/{id}                   material waiting for a connection (see route.ts)
 *   audits/{id}                  the cloud model's check of an on-device mark (see audit.ts)
 *   sessions/{id}                a planned study session (see plan.ts)
 *   prefs/study                  study preferences from Settings (see prefs.ts)
 *   gauntlets/{id}               a finished Trap Gauntlet (see gauntlet.ts)
 *
 * Firestore's persistent cache makes all of it work offline: reads come from the cache, and
 * writes apply locally at once and sync when the connection returns. Offline, a write's promise
 * resolves only once the server has it, so the app never waits on writes: it fires them and
 * reads its own changes back through the listeners.
 */
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  limit,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import type { DraftCard } from '../core/prompts';
import { newSrs, review } from '../core/schedule';
import type { Attempt, Card, Confidence, Deck, Engine, Grade } from '../core/types';
import { AUDIT_HISTORY, type Audit } from '../core/audit';
import type { Session } from '../core/plan';
import type { GauntletRun } from '../core/gauntlet';
import { DEFAULT_STUDY_PREFS, type StudyPrefs } from '../core/prefs';
import { isAttempt, isCard, isDeck, keepValid } from '../core/valid';
import type { ExampleData } from '../core/example';
import { db } from './firebase';

const decks = (uid: string) => collection(db, 'users', uid, 'decks');
const cards = (uid: string, deckId: string) => collection(db, 'users', uid, 'decks', deckId, 'cards');
const attempts = (uid: string) => collection(db, 'users', uid, 'attempts');
const queue = (uid: string) => collection(db, 'users', uid, 'queue');
const audits = (uid: string) => collection(db, 'users', uid, 'audits');
const sessions = (uid: string) => collection(db, 'users', uid, 'sessions');
const gauntlets = (uid: string) => collection(db, 'users', uid, 'gauntlets');

/** Logs a listener that failed (no permission, App Check, a missing index): otherwise the app would just look empty. */
const failed = (what: string) => (e: Error) => console.error(`[recall] could not load ${what}`, e);

/** Logs a write that the server later refused (offline writes are retried on their own). */
const settle = (p: Promise<unknown>) => void p.catch((e) => console.error('[recall] write failed', e));

export function watchDecks(uid: string, on: (decks: Deck[]) => void): Unsubscribe {
  return onSnapshot(query(decks(uid), orderBy('createdAt', 'desc')), (s) => on(keepValid(s.docs.map((d) => d.data()), isDeck, 'decks')), failed('decks'));
}

/** Every card the learner has, across decks (one listener, for due counts and sessions). */
export function watchCards(uid: string, on: (cards: Card[]) => void): Unsubscribe {
  return onSnapshot(query(collectionGroup(db, 'cards'), where('owner', '==', uid)), (s) => on(keepValid(s.docs.map((d) => d.data()), isCard, 'cards')), failed('cards'));
}

export function watchAttempts(uid: string, on: (attempts: Attempt[]) => void): Unsubscribe {
  return onSnapshot(query(attempts(uid), orderBy('at', 'desc')), (s) => on(keepValid(s.docs.map((d) => d.data()), isAttempt, 'answers')), failed('answers'));
}

export function saveDeck(uid: string, title: string, source: Deck['source'], drafts: DraftCard[], madeBy: Engine): string {
  const deckRef = doc(decks(uid));
  const now = new Date();
  const batch = writeBatch(db);
  batch.set(deckRef, { id: deckRef.id, title, createdAt: now.toISOString(), source, cardCount: drafts.length } satisfies Deck);
  for (const d of drafts) {
    const ref = doc(cards(uid, deckRef.id));
    const card: Card & { owner: string } = { id: ref.id, deckId: deckRef.id, owner: uid, ...d, createdAt: now.toISOString(), madeBy, srs: newSrs(now) };
    batch.set(ref, card);
  }
  settle(batch.commit());
  return deckRef.id;
}

/** Records an answer and moves the card's schedule on, in one batch. */
export function recordAnswer(uid: string, card: Card, answer: string, confidence: Confidence, grade: Grade, mode: Attempt['mode'] = 'typed'): Attempt {
  const now = new Date();
  const ref = doc(attempts(uid));
  const attempt: Attempt = { id: ref.id, cardId: card.id, deckId: card.deckId, at: now.toISOString(), answer, confidence, grade, mode };
  const batch = writeBatch(db);
  batch.set(ref, attempt);
  batch.update(doc(cards(uid, card.deckId), card.id), { srs: review(card.srs, grade.score, confidence, now) });
  settle(batch.commit());
  return attempt;
}

/**
 * A spot-check disagreed: the larger cloud model's mark replaces Nano's, and the card is
 * rescheduled from where it stood before the answer (`card` is that earlier state).
 */
export function reviseAnswer(uid: string, card: Card, attempt: Attempt, grade: Grade): void {
  const batch = writeBatch(db);
  batch.update(doc(attempts(uid), attempt.id), { grade });
  batch.update(doc(cards(uid, card.deckId), card.id), { srs: review(card.srs, grade.score, attempt.confidence, new Date(attempt.at)) });
  settle(batch.commit());
}

export function recordAudit(uid: string, audit: Omit<Audit, 'id' | 'at'>): void {
  const ref = doc(audits(uid));
  settle(setDoc(ref, { ...audit, id: ref.id, at: new Date().toISOString() } satisfies Audit));
}

export function watchAudits(uid: string, on: (audits: Audit[]) => void): Unsubscribe {
  // Only the latest checks: the trust score uses 60, the AI engine page shows 40.
  return onSnapshot(query(audits(uid), orderBy('at', 'desc'), limit(AUDIT_HISTORY)), (s) => on(s.docs.map((d) => d.data() as Audit)), failed('audits'));
}

export function editCard(uid: string, card: Card, change: Partial<Pick<Card, 'prompt' | 'answer' | 'keyPoints'>>): void {
  settle(updateDoc(doc(cards(uid, card.deckId), card.id), change));
}

export function removeCard(uid: string, card: Card): void {
  settle(deleteDoc(doc(cards(uid, card.deckId), card.id)));
  settle(updateDoc(doc(decks(uid), card.deckId), { cardCount: increment(-1) }));
}

export function removeDeck(uid: string, deckId: string, deckCards: Card[]): void {
  const batch = writeBatch(db);
  for (const c of deckCards) batch.delete(doc(cards(uid, deckId), c.id));
  batch.delete(doc(decks(uid), deckId));
  settle(batch.commit());
}

// ----- Waiting for a connection -----

/** Material that could not be turned into cards yet. Files are kept inline (Firestore's 1 MB cap). */
export interface QueuedJob {
  id: string;
  title: string;
  at: string;
  reason: string;
  text?: string;
  file?: { name: string; type: string; data: string };
}

export const QUEUE_MAX_FILE = 700_000;

export function watchQueue(uid: string, on: (jobs: QueuedJob[]) => void): Unsubscribe {
  return onSnapshot(query(queue(uid), orderBy('at')), (s) => on(s.docs.map((d) => d.data() as QueuedJob)), failed('waiting material'));
}

export function enqueue(uid: string, job: Omit<QueuedJob, 'id' | 'at'>): void {
  const ref = doc(queue(uid));
  settle(setDoc(ref, { ...job, id: ref.id, at: new Date().toISOString() }));
}

export function dequeue(uid: string, id: string): void {
  settle(deleteDoc(doc(queue(uid), id)));
}

export function watchSessions(uid: string, on: (sessions: Session[]) => void): Unsubscribe {
  return onSnapshot(query(sessions(uid), orderBy('at')), (s) => on(s.docs.map((d) => d.data() as Session)), failed('planned sessions'));
}

export function saveSession(uid: string, session: Omit<Session, 'id' | 'createdAt'>): Session {
  const ref = doc(sessions(uid));
  const saved: Session = { ...session, id: ref.id, createdAt: new Date().toISOString() };
  settle(setDoc(ref, saved));
  return saved;
}

export function removeSession(uid: string, id: string): void {
  settle(deleteDoc(doc(sessions(uid), id)));
}

const prefsDoc = (uid: string) => doc(db, 'users', uid, 'prefs', 'study');

export function watchPrefs(uid: string, on: (prefs: StudyPrefs) => void): Unsubscribe {
  return onSnapshot(prefsDoc(uid), (d) => on({ ...DEFAULT_STUDY_PREFS, ...(d.data() as Partial<StudyPrefs> | undefined) }), failed('study preferences'));
}

export function savePrefs(uid: string, change: Partial<StudyPrefs>): void {
  settle(setDoc(prefsDoc(uid), change, { merge: true }));
}

/**
 * Deletes everything stored for this learner: decks and their cards, answers, audits, planned
 * sessions, waiting material and preferences. Unlike other writes it waits for the server (the
 * caller may delete the account next, after which these documents could no longer be removed).
 */
export async function deleteAllData(uid: string): Promise<void> {
  const refs = [];
  const deckDocs = await getDocs(decks(uid));
  for (const d of deckDocs.docs) {
    refs.push(...(await getDocs(cards(uid, d.id))).docs.map((c) => c.ref), d.ref);
  }
  for (const col of [attempts(uid), audits(uid), sessions(uid), queue(uid), gauntlets(uid)]) refs.push(...(await getDocs(col)).docs.map((d) => d.ref));
  refs.push(prefsDoc(uid));
  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(db);
    refs.slice(i, i + 400).forEach((r) => batch.delete(r));
    await batch.commit();
  }
}

// ----- Example data -----

/** Most writes a Firestore batch may hold is 500; stay well under. */
const BATCH = 400;

/**
 * Writes the example data (core/example.ts) into this learner's account, every document marked
 * `example: true`. Like other writes it applies locally at once; the listeners show it straight
 * away. Writing it twice overwrites the same documents.
 */
export function seedExample(uid: string, data: ExampleData): void {
  const writes: [ReturnType<typeof doc>, object][] = [
    ...data.decks.map((d): [ReturnType<typeof doc>, object] => [doc(decks(uid), d.id), { ...d, example: true }]),
    ...data.cards.map((c): [ReturnType<typeof doc>, object] => [doc(cards(uid, c.deckId), c.id), { ...c, owner: uid, example: true }]),
    ...data.attempts.map((a): [ReturnType<typeof doc>, object] => [doc(attempts(uid), a.id), { ...a, example: true }]),
    ...data.audits.map((a): [ReturnType<typeof doc>, object] => [doc(audits(uid), a.id), { ...a, example: true }]),
    ...data.runs.map((r): [ReturnType<typeof doc>, object] => [doc(gauntlets(uid), r.id), { ...r, example: true }]),
    ...data.sessions.map((s): [ReturnType<typeof doc>, object] => [doc(sessions(uid), s.id), { ...s, example: true }]),
  ];
  for (let i = 0; i < writes.length; i += BATCH) {
    const batch = writeBatch(db);
    writes.slice(i, i + BATCH).forEach(([ref, value]) => batch.set(ref, value));
    settle(batch.commit());
  }
}

/** Removes the example data, and only it: the learner's own decks and answers stay. */
export async function removeExample(uid: string): Promise<void> {
  const refs = [];
  const exampleOnly = (col: ReturnType<typeof collection>) => getDocs(query(col, where('example', '==', true)));
  for (const d of (await exampleOnly(decks(uid))).docs) {
    refs.push(...(await getDocs(cards(uid, d.id))).docs.map((c) => c.ref), d.ref);
  }
  for (const col of [attempts(uid), audits(uid), sessions(uid), gauntlets(uid)]) refs.push(...(await exampleOnly(col)).docs.map((d) => d.ref));
  for (let i = 0; i < refs.length; i += BATCH) {
    const batch = writeBatch(db);
    refs.slice(i, i + BATCH).forEach((r) => batch.delete(r));
    await batch.commit();
  }
}

export function watchGauntlets(uid: string, on: (runs: GauntletRun[]) => void): Unsubscribe {
  return onSnapshot(query(gauntlets(uid), orderBy('at')), (s) => on(s.docs.map((d) => d.data() as GauntletRun)), failed('gauntlet runs'));
}

export function saveGauntlet(uid: string, run: Omit<GauntletRun, 'id'>): void {
  const ref = doc(gauntlets(uid));
  settle(setDoc(ref, { ...run, id: ref.id }));
}
