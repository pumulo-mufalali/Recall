/**
 * Shape checks for documents read from Firestore. A malformed record (written by an older
 * version, or partly synced) is skipped instead of crashing the screens that use it. Only the
 * fields the app relies on are checked. Pure.
 */
import type { Attempt, Card, Deck } from './types';

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';
const isString = (v: unknown): v is string => typeof v === 'string';
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function isDeck(v: unknown): v is Deck {
  return isObject(v) && isString(v.id) && isString(v.title) && isString(v.createdAt);
}

export function isCard(v: unknown): v is Card {
  return (
    isObject(v) && isString(v.id) && isString(v.deckId) && isString(v.prompt) && isString(v.answer) &&
    Array.isArray(v.keyPoints) && isObject(v.srs) && isString(v.srs.due) && isNumber(v.srs.state)
  );
}

export function isAttempt(v: unknown): v is Attempt {
  return (
    isObject(v) && isString(v.id) && isString(v.cardId) && isString(v.at) && isNumber(v.confidence) &&
    isObject(v.grade) && isNumber(v.grade.score) && Array.isArray(v.grade.missing) && Array.isArray(v.grade.covered)
  );
}

/** Keeps the records that pass `check`, reporting how many were skipped. */
export function keepValid<T>(items: unknown[], check: (v: unknown) => v is T, what: string): T[] {
  const kept = items.filter(check);
  if (kept.length < items.length) console.warn(`[recall] skipped ${items.length - kept.length} malformed ${what}`);
  return kept;
}
