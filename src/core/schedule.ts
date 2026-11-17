/**
 * When each card comes back: FSRS (Free Spaced Repetition Scheduler), which models how fast
 * each memory fades and brings the card back just before it would be forgotten.
 *
 * FSRS needs a rating (Again / Hard / Good / Easy). Recall never asks for one: the rating
 * comes from how well the answer was actually marked, adjusted by what the learner claimed
 * beforehand. A correct answer given with no confidence was likely a lucky guess, so it is
 * not rated Easy; a confident wrong answer is the most important mistake to bring back soon.
 */
import { Rating, State, createEmptyCard, fsrs, generatorParameters, type Card as FsrsCard, type Grade as FsrsGrade } from 'ts-fsrs';
import type { Confidence, SrsState } from './types';

const scheduler = fsrs(generatorParameters({ request_retention: 0.9, maximum_interval: 365, enable_fuzz: true }));

export function newSrs(now: Date): SrsState {
  return fromFsrs(createEmptyCard(now));
}

/** The FSRS rating for a marked answer. */
export function ratingFor(score: number, confidence: Confidence): FsrsGrade {
  const rating: FsrsGrade = score < 0.4 ? Rating.Again : score < 0.7 ? Rating.Hard : score < 0.9 ? Rating.Good : Rating.Easy;
  // Right, but with no idea it would be: one step down, shaky rather than mastered.
  if (confidence === 1 && rating === Rating.Easy) return Rating.Good;
  if (confidence === 1 && rating === Rating.Good) return Rating.Hard;
  return rating;
}

/** The card's next state after a review. */
export function review(srs: SrsState, score: number, confidence: Confidence, now: Date): SrsState {
  return fromFsrs(scheduler.next(toFsrs(srs), now, ratingFor(score, confidence)).card);
}

/** Cards due by `now`, most overdue first; new cards after reviews, capped per session. */
export function dueCards<T extends { srs: SrsState }>(cards: T[], now: Date, newPerSession = 10): T[] {
  const time = now.getTime();
  const due = cards.filter((c) => c.srs.state !== State.New && Date.parse(c.srs.due) <= time);
  due.sort((a, b) => Date.parse(a.srs.due) - Date.parse(b.srs.due));
  const fresh = cards.filter((c) => c.srs.state === State.New).slice(0, newPerSession);
  return [...due, ...fresh];
}

function toFsrs(s: SrsState): FsrsCard {
  return {
    due: new Date(s.due),
    stability: s.stability,
    difficulty: s.difficulty,
    elapsed_days: 0,
    scheduled_days: s.scheduledDays,
    learning_steps: s.learningSteps,
    reps: s.reps,
    lapses: s.lapses,
    state: s.state as State,
    last_review: s.lastReview ? new Date(s.lastReview) : undefined,
  };
}

function fromFsrs(c: FsrsCard): SrsState {
  return {
    due: c.due.toISOString(),
    stability: c.stability,
    difficulty: c.difficulty,
    scheduledDays: c.scheduled_days,
    learningSteps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state as SrsState['state'],
    ...(c.last_review ? { lastReview: c.last_review.toISOString() } : {}),
  };
}
