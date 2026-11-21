/**
 * Recall's data, as stored (Firestore, with its offline cache) and as used by the pure core.
 * Dates are ISO strings so documents serialise as-is.
 */

/** How the user rated their confidence before seeing the answer. */
export type Confidence = 1 | 2 | 3 | 4;

/** What each confidence level claims, as a probability of being right. */
export const CONFIDENCE_CLAIM: Record<Confidence, number> = { 1: 0.1, 2: 0.4, 3: 0.7, 4: 0.95 };
export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  1: 'No idea',
  2: 'Unsure',
  3: 'Fairly sure',
  4: 'Certain',
};

/** Where a piece of AI work ran. `local` is Recall's own offline marker, with no model at all. */
export type Engine = 'on-device' | 'cloud' | 'local';

export interface Deck {
  id: string;
  title: string;
  createdAt: string;
  /** What the cards were made from. */
  source: 'text' | 'image' | 'pdf';
  cardCount: number;
}

/** Spaced-repetition state of one card (FSRS), serialisable. */
export interface SrsState {
  due: string;
  stability: number;
  difficulty: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  /** 0 New, 1 Learning, 2 Review, 3 Relearning (FSRS State). */
  state: 0 | 1 | 2 | 3;
  lastReview?: string;
}

export interface Card {
  id: string;
  deckId: string;
  /** The question, answerable in a sentence or two. */
  prompt: string;
  /** A model answer, written from the source material. */
  answer: string;
  /** The ideas a good answer must contain: what grading checks for. */
  keyPoints: string[];
  createdAt: string;
  /** Which engine wrote this card. */
  madeBy: Engine;
  srs: SrsState;
}

/** The marking of one answer. */
export interface Grade {
  /** 0..1: how much of the key points the answer got right. */
  score: number;
  covered: string[];
  missing: string[];
  /** One or two sentences for the learner. */
  feedback: string;
  engine: Engine;
  /**
   * When the cloud model also marked an answer Nano marked: escalated (the learner saw the
   * cloud mark) or spot-checked (Nano's mark stood unless the cloud disagreed).
   */
  check?: { kind: 'escalated' | 'spot-check'; nano: number; cloud: number; agree: boolean };
  /** In an oral exam: key points recalled only after a follow-up question (they count half). */
  prompted?: string[];
}

/** One review: what was claimed, what was written, how it was marked. */
export interface Attempt {
  id: string;
  cardId: string;
  deckId: string;
  at: string;
  answer: string;
  confidence: Confidence;
  grade: Grade;
  /** How it was answered: typed (the default) or spoken in an oral exam. */
  mode?: 'typed' | 'oral';
}
