/**
 * Runs AI work where the router decides, through Firebase AI Logic's hybrid inference, and
 * reports where it actually ran (the SDK's `inferenceSource`: a "prefer" mode may fall back).
 *
 * The on-device model takes its instructions and output format differently from the cloud one
 * (Chrome's Prompt API: `initialPrompts` and `responseConstraint`), so each task configures
 * both, and the same request means the same thing on either.
 */
import { InferenceSource, ResponseModality, Schema, getGenerativeModel, type GenerativeModel, type Part } from 'firebase/ai';
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
  TRANSCRIBE_PROMPT,
  toCards,
  toGrade,
  toSelfConfidence,
  type DraftCard,
} from '../core/prompts';
import { isBusy } from '../core/busy';
import { localGrade } from '../core/localGrade';
import { pcmToWav, rateOf } from '../core/speech';
import { agrees, decide, doubt, type Decision, type Doubt, type Policy, type Trust } from '../core/audit';
import { VERIFY_SYSTEM, judge, toChecks, verifyPrompt, type CardCheck } from '../core/verify';
import { chunkText, route, type Conditions, type DeviceModel, type Mode, type Route, type Task } from '../core/route';
import type { Engine, Grade } from '../core/types';
import { ai, type Settings } from './firebase';

// ----- The device model -----

interface LanguageModelStatic {
  availability(options?: object): Promise<DeviceModel>;
}
const languageModel = (): LanguageModelStatic | undefined => (globalThis as unknown as { LanguageModel?: LanguageModelStatic }).LanguageModel;

export const TEXT_IO = {
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
export interface Format {
  cloud: Schema;
  device: object;
}

const GRADE_FORMAT: Format = {
  cloud: Schema.object({
    properties: {
      covered: Schema.array({ items: Schema.integer(), description: 'Numbers of the key points the answer covers' }),
      feedback: Schema.string({ description: 'At most two short sentences to the student' }),
      confidence: Schema.enumString({ enum: ['high', 'medium', 'low'], description: 'Confidence in this marking' }),
    },
    optionalProperties: ['confidence'],
  }),
  device: {
    type: 'object',
    properties: {
      covered: { type: 'array', items: { type: 'integer' } },
      feedback: { type: 'string' },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    },
    required: ['covered', 'feedback', 'confidence'],
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
export function build(mode: Mode, system: string, format: Format | null, io: object, cloudModel: string): GenerativeModel {
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

// ----- Calling a model, resiliently -----

/** A request's set-up: where it may run, its instructions and format, and its cloud models in order. */
export interface Spec {
  mode: Mode;
  system: string;
  format: Format | null;
  io: object;
  /** Cloud models to try in turn when one is busy: the first is preferred. */
  models: string[];
  /** Whether the on-device model can take this request if the cloud stays busy. */
  deviceCan: boolean;
}

const PAUSES_MS = [1000, 3000, 7000];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms + Math.random() * 400));

/**
 * Runs a request: each cloud model in turn, retrying with growing pauses while it is busy;
 * then, if the cloud stays busy and the request fits, the on-device model. Errors that are not
 * "busy" (a bad request, App Check) fail at once.
 */
export async function call(spec: Spec, request: Parameters<GenerativeModel['generateContent']>[0]) {
  let last: unknown;
  for (const model of spec.models) {
    for (let attempt = 0; attempt <= PAUSES_MS.length; attempt++) {
      try {
        return await build(spec.mode, spec.system, spec.format, spec.io, model).generateContent(request);
      } catch (e) {
        if (!isBusy(e)) throw e;
        last = e;
        if (attempt < PAUSES_MS.length) await sleep(PAUSES_MS[attempt]);
      }
    }
  }
  if (spec.deviceCan && spec.mode !== 'only_on_device' && (await deviceModel()) === 'available') {
    return build('only_on_device', spec.system, spec.format, spec.io, spec.models[0]).generateContent(request);
  }
  throw last;
}

export const engineOf = (source: string | undefined): Engine => (source === InferenceSource.ON_DEVICE ? 'on-device' : 'cloud');

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

/** How the hybrid marker should behave: Nano's earned trust, and the learner's privacy choice. */
export interface Hybrid {
  trust: Trust;
  policy: Policy;
}

/** A mark, and when Nano made it, what the self-audit decided. */
export interface Marked extends Outcome<Grade> {
  doubt?: Doubt;
  decision?: Decision;
  /** A spot-check running in the background: the cloud's mark, or null if it could not run. */
  secondOpinion?: Promise<Grade | null>;
}

/**
 * Marks an answer. Never fails: with no model at all it falls back to the key-point matcher.
 *
 * With the built-in model ready, Nano marks first and the mark is weighed for doubt (see
 * core/audit.ts): doubtful marks are escalated to the larger cloud model before the learner
 * sees them; a sample of confident ones is spot-checked by it in the background.
 */
export async function grade(question: string, keyPoints: string[], answer: string, settings: Settings, hybrid?: Hybrid): Promise<Marked> {
  const r = route({ kind: 'grade', chars: answer.length }, await conditions(), settings);
  const prompt = gradePrompt(question, keyPoints, answer);
  const cloudGrade = async (): Promise<Grade | null> => {
    const result = await call({ mode: 'only_in_cloud', system: GRADE_SYSTEM, format: GRADE_FORMAT, io: TEXT_IO, models: checkers(settings), deviceCan: false }, prompt);
    return toGrade(parseJson(result.response.text()), keyPoints, 'cloud');
  };

  if (r.run === 'model' && r.mode !== 'only_in_cloud' && hybrid) {
    try {
      const result = await call({ mode: 'only_on_device', system: GRADE_SYSTEM, format: GRADE_FORMAT, io: TEXT_IO, models: writers(settings), deviceCan: true }, prompt);
      const reply = parseJson(result.response.text());
      const nano = toGrade(reply, keyPoints, 'on-device');
      if (nano) {
        const d = doubt(nano, toSelfConfidence(reply), localGrade(answer, keyPoints), answer);
        const decision = decide(d, hybrid.trust, hybrid.policy, navigator.onLine && settings.cloudGrading, Math.random());
        const routed: Route = { ...r, reason: decision.reason };

        if (decision.kind === 'escalate') {
          try {
            const cloud = await cloudGrade();
            if (cloud) {
              const check = { kind: 'escalated' as const, nano: nano.score, cloud: cloud.score, agree: agrees(nano.score, cloud.score) };
              return { value: { ...cloud, check }, engine: 'cloud', route: routed, doubt: d, decision };
            }
          } catch (e) {
            console.warn('[recall] escalation failed; keeping the on-device mark', e);
          }
          return {
            value: nano,
            engine: 'on-device',
            route: { ...r, reason: 'The cloud could not be reached, so the on-device mark stands.' },
            doubt: d,
            decision: { kind: 'keep', reason: 'Cloud unreachable.' },
          };
        }

        const secondOpinion =
          decision.kind === 'spot-check'
            ? cloudGrade().catch((e) => {
                console.warn('[recall] spot-check failed', e);
                return null;
              })
            : undefined;
        return { value: nano, engine: 'on-device', route: routed, doubt: d, decision, secondOpinion };
      }
    } catch (e) {
      console.warn('[recall] on-device marking failed; falling back', e);
    }
  }

  if (r.run === 'model') {
    try {
      const result = await call({ mode: r.mode, system: GRADE_SYSTEM, format: GRADE_FORMAT, io: TEXT_IO, models: writers(settings), deviceCan: true }, prompt);
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
  const spec: Spec = { mode: r.mode, system: CARDS_SYSTEM, format: CARDS_FORMAT, io: TEXT_IO, models: writers(settings), deviceCan: true };
  const cards: DraftCard[] = [];
  const engines = new Set<Engine>();
  for (const [part, piece] of pieces.entries()) {
    const result = await call(spec, cardsPrompt(piece, cardCount(piece.length)));
    engines.add(engineOf(result.response.inferenceSource));
    cards.push(...toCards(parseJson(result.response.text())).map((c) => (pieces.length > 1 ? { ...c, part } : c)));
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
  const deviceCan = !isPdf && (file.type === 'image/jpeg' || file.type === 'image/png') && file.size <= settings.deviceMaxImageBytes;
  const result = await call({ mode: r.mode, system: CARDS_SYSTEM, format: CARDS_FORMAT, io: IMAGE_IO, models: writers(settings), deviceCan }, [instruction, data]);
  return { value: dedupe(toCards(parseJson(result.response.text()))), engine: engineOf(result.response.inferenceSource), route: r };
}

// ----- Fact-checking -----

const VERDICTS = ['supported', 'partial', 'wrong'];

const CHECK_FORMAT: Format = {
  cloud: Schema.object({
    properties: {
      checks: Schema.array({
        items: Schema.object({
          properties: {
            card: Schema.integer(),
            verdict: Schema.enumString({ enum: VERDICTS }),
            evidence: Schema.string(),
            issue: Schema.string(),
            answer: Schema.string(),
            keyPoints: Schema.array({ items: Schema.string() }),
          },
          optionalProperties: ['answer', 'keyPoints'],
        }),
      }),
    },
  }),
  device: {
    type: 'object',
    properties: {
      checks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            card: { type: 'integer' },
            verdict: { type: 'string', enum: VERDICTS },
            evidence: { type: 'string' },
            issue: { type: 'string' },
            answer: { type: 'string' },
            keyPoints: { type: 'array', items: { type: 'string' } },
          },
          required: ['card', 'verdict', 'evidence', 'issue'],
        },
      },
    },
    required: ['checks'],
  },
};

/** The material cards were made from, for checking them against it. */
export type Material = { kind: 'text'; text: string } | { kind: 'file'; file: File };

/**
 * Fact-checks cards against their material (see core/verify.ts). Never throws: what cannot be
 * checked now comes back "unchecked", with the reason, so the learner can decide.
 */
export async function verifyCards(drafts: DraftCard[], material: Material, settings: Settings): Promise<Outcome<CardCheck[]>> {
  const task: Task =
    material.kind === 'text'
      ? { kind: 'verify', source: 'text', chars: material.text.length }
      : material.file.type === 'application/pdf'
        ? { kind: 'verify', source: 'pdf', bytes: material.file.size }
        : { kind: 'verify', source: 'image', mime: material.file.type, bytes: material.file.size };
  const r = route(task, await conditions(), settings);
  const unchecked = (note: string): CardCheck => ({ status: 'unchecked', notes: [note], evidence: '' });
  if (r.run !== 'model') return { value: drafts.map(() => unchecked(r.reason)), engine: 'local', route: r };

  const checks: CardCheck[] = drafts.map(() => unchecked('Not checked.'));
  const engines = new Set<Engine>();
  // The checker is a different, larger model than the writer where possible, so it does not
  // simply repeat the writer's misreading.
  const spec: Spec = {
    mode: r.mode,
    system: VERIFY_SYSTEM,
    format: CHECK_FORMAT,
    io: material.kind === 'file' ? IMAGE_IO : TEXT_IO,
    models: checkers(settings),
    deviceCan: material.kind === 'text' ? material.text.length <= settings.deviceMaxChars : material.file.type === 'image/jpeg' || material.file.type === 'image/png',
  };

  // Which cards to check against which piece of the material.
  const batches: { source: string | File; cards: number[] }[] = [];
  if (material.kind === 'file') batches.push({ source: material.file, cards: drafts.map((_, i) => i) });
  else if (r.chunks <= 1) batches.push({ source: material.text, cards: drafts.map((_, i) => i) });
  else {
    const pieces = chunkText(material.text, settings.deviceMaxChars);
    pieces.forEach((piece, part) => batches.push({ source: piece, cards: drafts.flatMap((d, i) => (d.part === part ? [i] : [])) }));
    drafts.forEach((d, i) => {
      if (d.part === undefined) checks[i] = unchecked('Too long to check offline in one piece: check again when online.');
    });
  }

  for (const batch of batches) {
    if (!batch.cards.length) continue;
    const these = batch.cards.map((i) => drafts[i]);
    try {
      const ask = verifyPrompt(these);
      const result =
        typeof batch.source === 'string'
          ? await call(spec, `${ask}

Source:
${batch.source}`)
          : await call(spec, [ask, { type: 'inlineData', inlineData: { mimeType: batch.source.type, data: await base64(batch.source) } }]);
      engines.add(engineOf(result.response.inferenceSource));
      const replies = toChecks(parseJson(result.response.text()), these.length);
      batch.cards.forEach((cardIndex, j) => {
        checks[cardIndex] = judge(drafts[cardIndex], replies.get(j), typeof batch.source === 'string' ? batch.source : undefined);
      });
    } catch (e) {
      console.warn('[recall] fact-check failed', e);
      for (const i of batch.cards) checks[i] = unchecked('The fact-check failed: try again.');
    }
  }
  return { value: checks, engine: engines.has('cloud') ? 'cloud' : engines.size ? 'on-device' : 'local', route: r };
}

/** Explains a card the learner keeps missing. */
export async function explain(question: string, answer: string, missing: string[], settings: Settings): Promise<Outcome<string>> {
  const c = await conditions();
  const r = route({ kind: 'explain' }, c, settings);
  if (r.run !== 'model') throw new Queued(r);
  const short = r.mode === 'only_on_device';
  const result = await call(
    { mode: r.mode, system: EXPLAIN_SYSTEM, format: null, io: TEXT_IO, models: [settings.checkModel, ...writers(settings)], deviceCan: true },
    explainPrompt(question, answer, missing, short),
  );
  return { value: result.response.text().trim(), engine: engineOf(result.response.inferenceSource), route: r };
}

// ----- Speech -----

/**
 * Gemini TTS models, best first, after the configured one. Each has its own requests-per-minute
 * quota (on the free tier, a handful), so when one is used up the next reads instead of the
 * device's flatter voice.
 */
const TTS_MODELS = ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts', 'gemini-2.5-flash-preview-tts'];
/** How the question is spoken: the style goes beside the text, so it is never read out itself. */
const TTS_STYLE = 'warm, natural and clear, like a friendly tutor asking a question; relaxed pace';

/** Models resting until a time (ms): out of quota for a minute, or retired for the session. */
const ttsResting = new Map<string, number>();
/** Finished readings as WAV, so a question read twice costs one request. */
const voiceCache = new Map<string, Blob>();
const voiceKey = (text: string, s: Settings) => `${s.ttsVoice}|${text}`;

/** A reading already made for this text, if any. */
export const cachedSpeech = (text: string, settings: Settings): Blob | undefined => voiceCache.get(voiceKey(text, settings));

/**
 * A question read aloud by Gemini's text-to-speech through Firebase AI Logic, streamed: raw
 * 16-bit PCM chunks arrive while the rest is still being made, so playback can start in about
 * a second rather than after the whole reading. When a model cannot start (out of quota,
 * retired), the next one is tried; once audio has begun, an error ends the reading. The whole
 * reading is cached when it completes. Throws when no model can read it.
 */
export async function* speechStream(text: string, settings: Settings): AsyncGenerator<{ pcm: Uint8Array; rate: number }> {
  const now = Date.now();
  const all = unique([settings.ttsModel, ...TTS_MODELS]);
  const awake = all.filter((m) => (ttsResting.get(m) ?? 0) <= now);
  let last: unknown = new Error('every voice model is resting');
  for (const name of awake.length ? awake : all) {
    const model = getGenerativeModel(ai, {
      model: name,
      generationConfig: {
        responseModalities: [ResponseModality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: settings.ttsVoice } } },
      },
    });
    const parts: Uint8Array[] = [];
    let rate = 24_000;
    try {
      const result = await model.generateContentStream([{ type: 'text', text, speechMetadata: { style: TTS_STYLE } }]);
      for await (const chunk of result.stream) {
        for (const p of chunk.inlineDataParts() ?? []) {
          if (!p.inlineData.mimeType.startsWith('audio/')) continue;
          let pcm = Uint8Array.from(atob(p.inlineData.data), (ch) => ch.charCodeAt(0));
          // Streamed audio is raw PCM (audio/l16); should a chunk come as WAV, drop its header.
          if (/wav/i.test(p.inlineData.mimeType) && String.fromCharCode(...pcm.slice(0, 4)) === 'RIFF') pcm = pcm.slice(44);
          else rate = rateOf(p.inlineData.mimeType);
          parts.push(pcm);
          yield { pcm, rate };
        }
      }
      if (!parts.length) throw new Error('no audio in the reply');
      const whole = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
      parts.reduce((at, p) => (whole.set(p, at), at + p.length), 0);
      if (voiceCache.size > 60) voiceCache.delete(voiceCache.keys().next().value!);
      voiceCache.set(voiceKey(text, settings), new Blob([pcmToWav(whole, rate)], { type: 'audio/wav' }));
      return;
    } catch (e) {
      if (parts.length) throw e; // mid-sentence: no switching voices now
      last = e;
      console.warn(`[recall] voice ${name} unavailable`, e);
      // Out of quota: rest for a minute. Retired or refused: rest for this session.
      ttsResting.set(name, isBusy(e) ? Date.now() + 60_000 : Infinity);
    }
  }
  throw last;
}

/** A spoken answer (WAV) as text, by Gemini in the cloud: used only when the device cannot. */
export async function transcribe(wav: Blob, settings: Settings): Promise<string> {
  const result = await call(
    { mode: 'only_in_cloud', system: 'You transcribe speech accurately.', format: null, io: TEXT_IO, models: writers(settings), deviceCan: false },
    [TRANSCRIBE_PROMPT, { type: 'inlineData', inlineData: { mimeType: 'audio/wav', data: await base64(wav) } }],
  );
  return result.response.text().trim();
}

/** Cloud models for writing and marking: the configured one, then the backups. */
export const writers = (s: Settings) => unique([s.cloudModel, ...s.fallbackModels]);
/** Cloud models for fact-checking: the larger checker first, then the rest. */
export const checkers = (s: Settings) => unique([s.checkModel, ...s.fallbackModels, s.cloudModel]);
const unique = (list: string[]) => [...new Set(list.filter(Boolean))];

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
