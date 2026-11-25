/**
 * The Trap Gauntlet's AI calls, through Firebase AI Logic. Gemini Nano writes the statements on
 * the device when it can (structured output: the same JSON on either engine); a larger cloud
 * model referees them while the learner plays.
 */
import { Schema } from 'firebase/ai';
import type { Policy } from '../core/audit';
import { REFEREE_SYSTEM, TRAPS_SYSTEM, lastMiss, refereePrompt, toRulings, toStatements, trapsPrompt, type Ruling, type Statement } from '../core/gauntlet';
import { parseJson } from '../core/prompts';
import { route, type Route } from '../core/route';
import type { Attempt, Card } from '../core/types';
import { Queued, TEXT_IO, call, checkers, conditions, engineOf, writers, type Format, type Outcome } from './engine';
import type { Settings } from './firebase';

const STATEMENTS_FORMAT: Format = {
  cloud: Schema.object({
    properties: {
      statements: Schema.array({
        items: Schema.object({
          properties: { card: Schema.integer(), text: Schema.string(), truth: Schema.boolean(), why: Schema.string() },
        }),
      }),
    },
  }),
  device: {
    type: 'object',
    properties: {
      statements: {
        type: 'array',
        items: {
          type: 'object',
          properties: { card: { type: 'integer' }, text: { type: 'string' }, truth: { type: 'boolean' }, why: { type: 'string' } },
          required: ['card', 'text', 'truth', 'why'],
        },
      },
    },
    required: ['statements'],
  },
};

const RULINGS_FORMAT: Format = {
  cloud: Schema.object({
    properties: {
      rulings: Schema.array({
        items: Schema.object({ properties: { statement: Schema.integer(), fair: Schema.boolean(), reason: Schema.string() } }),
      }),
    },
  }),
  device: {
    type: 'object',
    properties: {
      rulings: {
        type: 'array',
        items: { type: 'object', properties: { statement: { type: 'integer' }, fair: { type: 'boolean' }, reason: { type: 'string' } }, required: ['statement', 'fair', 'reason'] },
      },
    },
    required: ['rulings'],
  },
};

/** Where the statements will be written. Private mode never sends the learner's answers to the cloud. */
export async function gauntletRoute(settings: Settings, policy: Policy): Promise<Route> {
  const r = route({ kind: 'gauntlet' }, await conditions(), settings);
  if (r.run === 'model' && r.mode === 'only_in_cloud' && policy === 'private') {
    return { run: 'local', reason: 'Private mode: your traps are written from your answers, so the built-in AI is needed.' };
  }
  return r;
}

/** Writes the gauntlet: two statements per card, one true and one trap. */
export async function writeTraps(cards: Card[], attempts: Attempt[], settings: Settings, policy: Policy): Promise<Outcome<Statement[]>> {
  const r = await gauntletRoute(settings, policy);
  if (r.run !== 'model') throw new Queued(r);
  const misses = cards.map((c) => lastMiss(c, attempts));
  const result = await call(
    { mode: r.mode, system: TRAPS_SYSTEM, format: STATEMENTS_FORMAT, io: TEXT_IO, models: writers(settings), deviceCan: true },
    trapsPrompt(cards, misses),
  );
  const statements = toStatements(parseJson(result.response.text()), cards.length);
  if (statements.length < 3) throw new Error('The model wrote too few usable statements.');
  return { value: statements, engine: engineOf(result.response.inferenceSource), route: r };
}

/**
 * The referee's rulings, or null when there is no referee (offline, or Private mode, which keeps
 * the statements, written from the learner's mistakes, on the device).
 */
export async function referee(statements: Statement[], cards: Card[], settings: Settings, policy: Policy): Promise<{ rulings: Ruling[]; route: Route } | { rulings: null; route: Route }> {
  const r = route({ kind: 'referee' }, await conditions(), settings);
  if (r.run !== 'model') return { rulings: null, route: r };
  if (policy === 'private') return { rulings: null, route: { run: 'local', reason: 'Private mode: no referee, so nothing leaves this device.' } };
  const result = await call(
    { mode: r.mode, system: REFEREE_SYSTEM, format: RULINGS_FORMAT, io: TEXT_IO, models: checkers(settings), deviceCan: false },
    refereePrompt(statements, cards),
  );
  return { rulings: toRulings(parseJson(result.response.text()), statements.length), route: r };
}
