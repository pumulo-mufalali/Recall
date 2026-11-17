/**
 * The learner's data in Firestore, under users/{uid}/:
 *   decks/{deckId}               a set of cards made from one piece of material
 *   decks/{deckId}/cards/{id}    one question, its model answer, key points, schedule
 *   attempts/{id}                every answer, with confidence and marking (for calibration)
 *   queue/{id}                   material waiting for a connection (see route.ts)
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
import { db } from './firebase';

const decks = (uid: string) => collection(db, 'users', uid, 'decks');
const cards = (uid: string, deckId: string) => collection(db, 'users', uid, 'decks', deckId, 'cards');
const attempts = (uid: string) => collection(db, 'users', uid, 'attempts');
const queue = (uid: string) => collection(db, 'users', uid, 'queue');

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
