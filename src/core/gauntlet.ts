/**
 * The Trap Gauntlet: a daily rapid-fire game built from the learner's own mistakes.
 *
 * Gemini Nano writes it on the device: for each card the learner recently got wrong, one true
 * statement and one trap (a plausible misconception, often the very mistake they made). The
 * learner answers True or False against a timer, saying whether they are sure. Meanwhile the
 * larger cloud model referees: it checks each statement against the card's model answer, and
 * an unfair one is withdrawn, live, with any points it cost given back.
 *
 * Scoring rewards honest confidence, as the rest of Recall does: sure and right scores most, a
 * sure miss costs, and a guess risks nothing. The same rule turns ordinary study answers into
 * XP, so XP measures knowing what you know, not just answering a lot.
 *
 * Pure: the caller passes in cards, attempts, the models' replies and "now".
 */
import { RIGHT } from './calibration';
import { dayKey } from './stats';
import type { Attempt, Card, Confidence } from './types';

/** One statement to judge True or False. */
export interface Statement {
  /** Which source card it tests (an index into the cards the gauntlet was built from). */
  card: number;
  text: string;
  /** Whether the statement is true. */
  truth: boolean;
  /** One short sentence on why: shown after the learner answers. */
  why: string;
}

/** The cloud referee's ruling on one statement. */
export interface Ruling {
  statement: number;
  /** Fair: the label matches the model answer, and the statement is clear. */
  fair: boolean;
  reason: string;
}

/** A finished gauntlet, as saved. */
export interface GauntletRun {
  id: string;
  at: string;
  points: number;
  right: number;
  answered: number;
  withdrawn: number;
  /** Whether it counted towards XP (the first run of the day) or was practice. */
  counted: boolean;
}

export const GAUNTLET_CARDS = 4;
export const SECONDS_PER_STATEMENT = 12;

// ----- Choosing the cards -----

/**
 * The cards to build traps from: those most recently answered wrong (most recent first, one
 * entry per card), topped up with the weakest-known others when there are too few mistakes.
 */
export function pickCards(cards: Card[], attempts: Attempt[], n = GAUNTLET_CARDS): Card[] {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const picked: Card[] = [];
  const seen = new Set<string>();
  const sorted = [...attempts].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  for (const a of sorted) {
    if (a.grade.score >= RIGHT || seen.has(a.cardId)) continue;
    const c = byId.get(a.cardId);
    if (!c) continue;
    seen.add(c.id);
    picked.push(c);
    if (picked.length === n) return picked;
  }
  const rest = cards.filter((c) => !seen.has(c.id)).sort((a, b) => a.srs.stability - b.srs.stability);
  return [...picked, ...rest].slice(0, n);
}

/** The learner's latest wrong answer to a card, if any: material for a trap. */
export function lastMiss(card: Card, attempts: Attempt[]): Attempt | undefined {
  return attempts
    .filter((a) => a.cardId === card.id && a.grade.score < RIGHT)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
}

// ----- Writing the statements -----

export const TRAPS_SYSTEM =
  'You write a quick true-or-false quiz for one student. For each card you get the question, the model answer, and sometimes the student\'s wrong answer. ' +
  'For each card write exactly two short statements: one TRUE statement that restates a key point of the model answer in new words, and one FALSE "trap": a plausible misconception, ideally the student\'s own mistake, stated confidently. ' +
  'Every statement must be judged true or false using only the model answer. Keep each under 25 words, with no "always/never" tricks. ' +
  'For each, give a one-sentence "why" that explains the truth from the model answer.';

export function trapsPrompt(cards: Card[], misses: (Attempt | undefined)[]): string {
  return cards
    .map((c, i) =>
      [`Card ${i}`, `Question: ${c.prompt}`, `Model answer: ${c.answer}`, misses[i] ? `Student's wrong answer: ${misses[i]!.answer}` : '']
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n\n');
}

/** Statements from a model's reply, kept only when well formed; trues and traps interleaved. */
export function toStatements(reply: unknown, cardCount: number): Statement[] {
  const list = reply && typeof reply === 'object' && Array.isArray((reply as { statements?: unknown }).statements) ? (reply as { statements: unknown[] }).statements : [];
  const out: Statement[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const card = typeof r.card === 'number' ? r.card : Number.parseInt(String(r.card), 10);
    const text = typeof r.text === 'string' ? r.text.trim() : '';
    const truth = typeof r.truth === 'boolean' ? r.truth : r.truth === 'true' ? true : r.truth === 'false' ? false : null;
    const why = typeof r.why === 'string' ? r.why.trim() : '';
    if (!Number.isInteger(card) || card < 0 || card >= cardCount || text.length < 8 || text.length > 240 || truth === null) continue;
    if (out.some((s) => s.text.toLowerCase() === text.toLowerCase())) continue;
    out.push({ card, text, truth, why });
  }
  // Mix the order so a card's true statement is not always right before its trap.
  return shuffle(out);
}

function shuffle<T>(items: T[]): T[] {
  // Deterministic for a given list (so tests and replays are stable): sort by a text hash.
  const hash = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  return [...items].sort((a, b) => hash(JSON.stringify(a)) - hash(JSON.stringify(b)));
}

// ----- The referee -----

export const REFEREE_SYSTEM =
  'You referee a true-or-false quiz. For each statement you get the card\'s model answer and the label the quiz-writer gave (true or false). ' +
  'Rule it fair only if the label is correct according to the model answer and the statement is clear enough to judge. ' +
  'Rule it unfair if the label is wrong, the model answer does not settle it, or it is ambiguous. Give a short reason.';

export function refereePrompt(statements: Statement[], cards: Card[]): string {
  return statements
    .map((s, i) => [`Statement ${i}: "${s.text}"`, `Label: ${s.truth ? 'true' : 'false'}`, `Model answer: ${cards[s.card]?.answer ?? ''}`].join('\n'))
    .join('\n\n');
}

export function toRulings(reply: unknown, count: number): Ruling[] {
  const list = reply && typeof reply === 'object' && Array.isArray((reply as { rulings?: unknown }).rulings) ? (reply as { rulings: unknown[] }).rulings : [];
  const out = new Map<number, Ruling>();
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const statement = typeof r.statement === 'number' ? r.statement : Number.parseInt(String(r.statement), 10);
    if (!Number.isInteger(statement) || statement < 0 || statement >= count || typeof r.fair !== 'boolean') continue;
    out.set(statement, { statement, fair: r.fair, reason: typeof r.reason === 'string' ? r.reason.trim() : '' });
  }
  return [...out.values()];
}

// ----- Scoring -----

/** Points for one answer: sure and right 3, a right guess 1, a wrong guess 0, sure and wrong -2; out of time 0. */
export function pointsFor(right: boolean | null, sure: boolean): number {
  if (right === null) return 0;
  if (right) return sure ? 3 : 1;
  return sure ? -2 : 0;
}

/**
 * XP from one study answer, by the same honest-confidence rule: confident and right earns most;
 * a confident miss earns nothing; admitting you were unsure earns a little either way.
 */
export function attemptXp(score: number, confidence: Confidence): number {
  const right = score >= RIGHT;
  if (right) return [0, 1, 2, 3, 4][confidence];
  return [0, 1, 1, 0, 0][confidence];
}

/** All XP: from every study answer, and from the counted gauntlets (never below zero each). */
export function totalXp(attempts: Attempt[], runs: GauntletRun[]): number {
  const fromStudy = attempts.reduce((sum, a) => sum + attemptXp(a.grade.score, a.confidence), 0);
  const fromGames = runs.filter((r) => r.counted).reduce((sum, r) => sum + Math.max(0, r.points) * 2, 0);
  return fromStudy + fromGames;
}

const TITLES = ['Newcomer', 'Apprentice', 'Scholar', 'Sharp Mind', 'Sage', 'Master', 'Grandmaster'];

/** Level from XP: each level needs 50 more XP than the last (50, 150, 300, 500...). */
export function levelOf(xp: number): { level: number; title: string; into: number; need: number } {
  let level = 1;
  let floor = 0;
  while (xp >= floor + 50 * level) {
    floor += 50 * level;
    level++;
  }
  return { level, title: TITLES[Math.min(level - 1, TITLES.length - 1)], into: xp - floor, need: 50 * level };
}

/** Whether today's counted gauntlet has been played. */
export function playedToday(runs: GauntletRun[], now: Date): boolean {
  const today = dayKey(now);
  return runs.some((r) => r.counted && dayKey(new Date(r.at)) === today);
}
