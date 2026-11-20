/**
 * The learner's data in Firestore, under users/{uid}/:
 *   decks/{deckId}               a set of cards made from one piece of material
 *   decks/{deckId}/cards/{id}    one question, its model answer, key points, schedule
 *   attempts/{id}                every answer, with confidence and marking (for calibration)
 *   queue/{id}                   material waiting for a connection (see route.ts)
 *   audits/{id}                  the cloud model's check of an on-device mark (see audit.ts)
 *   sessions/{id}                a planned study session (see plan.ts)
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
  increment,
  onSnapshot,
  orderBy,
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
import type { Audit } from '../core/audit';
import type { Session } from '../core/plan';
import { db } from './firebase';

const decks = (uid: string) => collection(db, 'users', uid, 'decks');
const cards = (uid: string, deckId: string) => collection(db, 'users', uid, 'decks', deckId, 'cards');
const attempts = (uid: string) => collection(db, 'users', uid, 'attempts');
const queue = (uid: string) => collection(db, 'users', uid, 'queue');
const audits = (uid: string) => collection(db, 'users', uid, 'audits');
const sessions = (uid: string) => collection(db, 'users', uid, 'sessions');

/** Logs a write that the server later refused (offline writes are retried on their own). */
const settle = (p: Promise<unknown>) => void p.catch((e) => console.error('[recall] write failed', e));

export function watchDecks(uid: string, on: (decks: Deck[]) => void): Unsubscribe {
  return onSnapshot(query(decks(uid), orderBy('createdAt', 'desc')), (s) => on(s.docs.map((d) => d.data() as Deck)));
}

/** Every card the learner has, across decks (one listener, for due counts and sessions). */
export function watchCards(uid: string, on: (cards: Card[]) => void): Unsubscribe {
  return onSnapshot(query(collectionGroup(db, 'cards'), where('owner', '==', uid)), (s) => on(s.docs.map((d) => d.data() as Card)));
}

export function watchAttempts(uid: string, on: (attempts: Attempt[]) => void): Unsubscribe {
  return onSnapshot(query(attempts(uid), orderBy('at', 'desc')), (s) => on(s.docs.map((d) => d.data() as Attempt)));
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
export function recordAnswer(uid: string, card: Card, answer: string, confidence: Confidence, grade: Grade): Attempt {
  const now = new Date();
  const ref = doc(attempts(uid));
  const attempt: Attempt = { id: ref.id, cardId: card.id, deckId: card.deckId, at: now.toISOString(), answer, confidence, grade };
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
  return onSnapshot(query(audits(uid), orderBy('at', 'desc')), (s) => on(s.docs.map((d) => d.data() as Audit)));
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
  return onSnapshot(query(queue(uid), orderBy('at')), (s) => on(s.docs.map((d) => d.data() as QueuedJob)));
}

export function enqueue(uid: string, job: Omit<QueuedJob, 'id' | 'at'>): void {
  const ref = doc(queue(uid));
  settle(setDoc(ref, { ...job, id: ref.id, at: new Date().toISOString() }));
}

export function dequeue(uid: string, id: string): void {
  settle(deleteDoc(doc(queue(uid), id)));
}

export function watchSessions(uid: string, on: (sessions: Session[]) => void): Unsubscribe {
  return onSnapshot(query(sessions(uid), orderBy('at')), (s) => on(s.docs.map((d) => d.data() as Session)));
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
