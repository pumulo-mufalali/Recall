/**
 * The tutor: after a miss, a short conversation about one card. Grounded in the card's model
 * answer and key points, and in what the learner said, so it explains rather than invents.
 *
 * Hybrid: it runs as a Firebase AI Logic chat session on the device when Gemini Nano is ready
 * (private, instant, offline), else in the cloud. "Go deeper" hands the conversation so far to a
 * larger cloud model. Pure: prompts and history only; services/tutor.ts makes the calls.
 */
import type { Engine } from './types';

export interface TutorTurn {
  role: 'user' | 'model';
  text: string;
  /** Where a reply was written. */
  engine?: Engine;
  /** A reply from the larger cloud model, after the learner asked to go deeper. */
  deeper?: boolean;
}

export interface TutorCard {
  prompt: string;
  answer: string;
  keyPoints: string[];
}

/** Ways to start, offered as one-tap chips. */
export const TUTOR_STARTERS = ['Why is that the answer?', 'Give me an analogy', 'What did I mix up?', 'Quiz me on it'] as const;

/**
 * How many earlier turns go with each message. Gemini Nano's context is small (a few thousand
 * tokens), and a tutor needs the recent exchange, not the whole history.
 */
export const TUTOR_MEMORY = 8;

/** The tutor's instructions: its role, the card, and what the learner said and missed. */
export function tutorSystem(card: TutorCard, said: string, missing: string[], short: boolean): string {
  return [
    'You are a warm, patient study tutor helping a student understand one flashcard they partly got wrong.',
    'Stay grounded in the model answer and key points below. Do not add facts they do not support; if the student asks beyond them, say what you are unsure of.',
    'Teach by guiding: build on what the student already got right, explain the missing idea simply, and use an everyday example or analogy when it helps.',
    'When asked to quiz, ask exactly one short question and wait for the answer; then say whether it is right and why.',
    `Reply in plain sentences, no headings or lists, at most ${short ? 70 : 150} words.`,
    '',
    `Question: ${card.prompt}`,
    `Model answer: ${card.answer}`,
    card.keyPoints.length ? `Key points: ${card.keyPoints.join('; ')}` : '',
    `What the student answered: ${said.trim() || '(nothing)'}`,
    missing.length ? `What the student missed: ${missing.join('; ')}` : '',
  ]
    .filter((line, i, all) => line !== '' || (i > 0 && all[i - 1] !== ''))
    .join('\n');
}

/**
 * The turns sent with a new message: the most recent ones, starting with a learner turn (a chat
 * history must open with the user) and without replies that failed or are still empty.
 */
export function recentHistory(turns: TutorTurn[], max = TUTOR_MEMORY): TutorTurn[] {
  const usable = turns.filter((t) => t.text.trim());
  let recent = usable.slice(-max);
  while (recent.length && recent[0].role !== 'user') recent = recent.slice(1);
  return recent;
}
