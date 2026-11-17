/**
 * Runs AI work where the router decides, through Firebase AI Logic's hybrid inference, and
 * reports where it actually ran (the SDK's `inferenceSource`: a "prefer" mode may fall back).
 *
 * The on-device model takes its instructions and output format differently from the cloud one
 * (Chrome's Prompt API: `initialPrompts` and `responseConstraint`), so each task configures
 * both, and the same request means the same thing on either.
 */
import { InferenceSource, Schema, getGenerativeModel, type GenerativeModel, type Part } from 'firebase/ai';
import {
  CARDS_FROM_IMAGE,
  CARDS_SYSTEM,
  EXPLAIN_SYSTEM,
  GRADE_SYSTEM,
  cardCount,
  cardsPrompt,
  explainPrompt,
  gradePrompt,
  parseJson,
  toCards,
  toGrade,
  type DraftCard,
} from '../core/prompts';
import { localGrade } from '../core/localGrade';
import { chunkText, route, type Conditions, type DeviceModel, type Mode, type Route, type Task } from '../core/route';
import type { Engine, Grade } from '../core/types';
import { ai, type Settings } from './firebase';

// ----- The device model -----

interface LanguageModelStatic {
  availability(options?: object): Promise<DeviceModel>;
}
const languageModel = (): LanguageModelStatic | undefined => (globalThis as unknown as { LanguageModel?: LanguageModelStatic }).LanguageModel;

const TEXT_IO = {
  expectedInputs: [{ type: 'text', languages: ['en'] }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
};
const IMAGE_IO = {
  expectedInputs: [{ type: 'text', languages: ['en'] }, { type: 'image' }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
};

/** Whether Chrome's built-in model can run here: available, downloadable, downloading or unavailable. */
export async function deviceModel(): Promise<DeviceModel> {
  const lm = languageModel();
  if (!lm) return 'unavailable';
  try {
    return await lm.availability(TEXT_IO);
  } catch {
    return 'unavailable';
  }
}

/** Starts (or joins) the model download. Must follow a user gesture, such as a click. */
export async function downloadDeviceModel(onProgress: (fraction: number) => void): Promise<void> {
  await build('prefer_on_device', GRADE_SYSTEM, GRADE_FORMAT, TEXT_IO, 'gemini-3.5-flash-lite').initializeDeviceModel(onProgress);
}

// ----- Output formats -----

/** Each format twice: as Firebase's Schema (cloud) and as plain JSON Schema (Chrome's Prompt API). */
interface Format {
  cloud: Schema;
  device: object;
}

const GRADE_FORMAT: Format = {
  cloud: Schema.object({
    properties: {
      covered: Schema.array({ items: Schema.integer(), description: 'Numbers of the key points the answer covers' }),
      feedback: Schema.string({ description: 'At most two short sentences to the student' }),
    },
  }),
  device: {
    type: 'object',
    properties: { covered: { type: 'array', items: { type: 'integer' } }, feedback: { type: 'string' } },
    required: ['covered', 'feedback'],
  },
};

const CARD_JSON = {
  type: 'object',
  properties: { prompt: { type: 'string' }, answer: { type: 'string' }, keyPoints: { type: 'array', items: { type: 'string' } } },
  required: ['prompt', 'answer', 'keyPoints'],
};

const CARDS_FORMAT: Format = {
  cloud: Schema.object({
    properties: {
      cards: Schema.array({
        items: Schema.object({
          properties: {
            prompt: Schema.string(),
            answer: Schema.string(),
            keyPoints: Schema.array({ items: Schema.string() }),
          },
        }),
      }),
    },
  }),
  device: { type: 'object', properties: { cards: { type: 'array', items: CARD_JSON } }, required: ['cards'] },
};

/** A model set up the same way for both engines: instructions, and JSON output when given. */
function build(mode: Mode, system: string, format: Format | null, io: object, cloudModel: string): GenerativeModel {
  return getGenerativeModel(ai, {
    mode,
    inCloudParams: {
      model: cloudModel,
      systemInstruction: system,
      generationConfig: format ? { responseMimeType: 'application/json', responseSchema: format.cloud, temperature: 0.2 } : { temperature: 0.4 },
    },
    onDeviceParams: {
      createOptions: { ...io, initialPrompts: [{ role: 'system', content: [{ type: 'text', value: system }] }] },
      ...(format ? { promptOptions: { responseConstraint: format.device } } : {}),
    },
  });
}

const engineOf = (source: string | undefined): Engine => (source === InferenceSource.ON_DEVICE ? 'on-device' : 'cloud');

// ----- Tasks -----

export interface Outcome<T> {
  value: T;
  engine: Engine;
  route: Route;
}

/** Work the router says cannot run now; the caller keeps it for later. */
export class Queued extends Error {
  readonly route: Route;
  constructor(route: Route) {
    super(route.reason);
    this.route = route;
  }
}

export async function conditions(): Promise<Conditions> {
  return { online: navigator.onLine, device: await deviceModel() };
}

/** Marks an answer. Never fails: with no model at all it falls back to the key-point matcher. */
export async function grade(question: string, keyPoints: string[], answer: string, settings: Settings): Promise<Outcome<Grade>> {
  const r = route({ kind: 'grade', chars: answer.length }, await conditions(), settings);
  if (r.run === 'model') {
    try {
      const result = await build(r.mode, GRADE_SYSTEM, GRADE_FORMAT, TEXT_IO, settings.cloudModel).generateContent(gradePrompt(question, keyPoints, answer));
      const engine = engineOf(result.response.inferenceSource);
      const g = toGrade(parseJson(result.response.text()), keyPoints, engine);
      if (g) return { value: g, engine, route: r };
    } catch (e) {
      console.warn('[recall] model marking failed; marking locally', e);
    }
  }
  const local: Route = r.run === 'local' ? r : { run: 'local', reason: 'The model could not mark this one: marked by matching key points.' };
  return { value: localGrade(answer, keyPoints), engine: 'local', route: local };
}

/** Makes cards from text, splitting it for the device when the router says so. */
export async function cardsFromText(text: string, settings: Settings): Promise<Outcome<DraftCard[]>> {
  const r = route({ kind: 'generate', source: 'text', chars: text.length }, await conditions(), settings);
  if (r.run !== 'model') throw new Queued(r);
  const pieces = r.chunks > 1 ? chunkText(text, settings.deviceMaxChars) : [text];
  const model = build(r.mode, CARDS_SYSTEM, CARDS_FORMAT, TEXT_IO, settings.cloudModel);
  const cards: DraftCard[] = [];
  const engines = new Set<Engine>();
  for (const piece of pieces) {
    const result = await model.generateContent(cardsPrompt(piece, cardCount(piece.length)));
    engines.add(engineOf(result.response.inferenceSource));
    cards.push(...toCards(parseJson(result.response.text())));
  }
  return { value: dedupe(cards), engine: engines.has('cloud') ? 'cloud' : 'on-device', route: r };
}

/** Makes cards from a photo or a PDF (inline data). */
export async function cardsFromFile(file: File, settings: Settings): Promise<Outcome<DraftCard[]>> {
  const isPdf = file.type === 'application/pdf';
  const task: Task = isPdf ? { kind: 'generate', source: 'pdf', bytes: file.size } : { kind: 'generate', source: 'image', mime: file.type, bytes: file.size };
  const r = route(task, await conditions(), settings);
  if (r.run !== 'model') throw new Queued(r);
  const data: Part = { type: 'inlineData', inlineData: { mimeType: file.type, data: await base64(file) } };
  const count = isPdf ? 12 : 6;
  const instruction = isPdf ? `Read this document and write ${count} questions from it.` : CARDS_FROM_IMAGE(count);
  const result = await build(r.mode, CARDS_SYSTEM, CARDS_FORMAT, IMAGE_IO, settings.cloudModel).generateContent([instruction, data]);
  return { value: dedupe(toCards(parseJson(result.response.text()))), engine: engineOf(result.response.inferenceSource), route: r };
}

/** Explains a card the learner keeps missing. */
export async function explain(question: string, answer: string, missing: string[], settings: Settings): Promise<Outcome<string>> {
  const c = await conditions();
  const r = route({ kind: 'explain' }, c, settings);
  if (r.run !== 'model') throw new Queued(r);
  const short = r.mode === 'only_on_device';
  const result = await build(r.mode, EXPLAIN_SYSTEM, null, TEXT_IO, settings.cloudModel).generateContent(explainPrompt(question, answer, missing, short));
  return { value: result.response.text().trim(), engine: engineOf(result.response.inferenceSource), route: r };
}

function dedupe(cards: DraftCard[]): DraftCard[] {
  const seen = new Set<string>();
  return cards.filter((c) => {
    const key = c.prompt.toLowerCase().replace(/\W+/g, ' ').trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function base64(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
