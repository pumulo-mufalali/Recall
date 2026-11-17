/**
 * What Recall asks the models, and how it checks what comes back. The same prompts serve the
 * on-device and the cloud model, so a card or a mark means the same thing whichever ran it.
 * Replies are JSON (structured output); a small model can still drift, so every reply is
 * validated and repaired here before the app uses it.
 */
import type { Grade } from './types';

export const GRADE_SYSTEM =
  'You mark a student\'s short answer against the key points of a model answer. ' +
  'Judge meaning, not wording: synonyms, paraphrase and different order are fine; spelling mistakes do not matter. ' +
  'A key point is covered only if the answer states it or something equivalent; vague hints do not count. ' +
  'Never invent key points. Feedback: at most two short sentences, kind and specific, addressed to the student as "you".';

export function gradePrompt(question: string, keyPoints: string[], answer: string): string {
  return [
    `Question: ${question}`,
    'Key points:',
    ...keyPoints.map((p, i) => `${i + 1}. ${p}`),
    `Student answer: ${answer.trim() || '(blank)'}`,
    'For each key point, say whether the answer covers it. Then give feedback.',
  ].join('\n');
}

/** JSON schema for the grade (Firebase AI Logic's Schema builder mirrors this shape). */
export const GRADE_SHAPE = {
  covered: 'array of the key point numbers the answer covers',
  feedback: 'string',
} as const;

export const CARDS_SYSTEM =
  'You turn study material into recall questions for active practice. ' +
  'Each question asks for one idea that matters, answerable in one to three sentences, without seeing the material. ' +
  'Prefer "why" and "how" over trivia. Use only facts from the material. ' +
  'For each question give a model answer and its key points: two to four short, checkable statements a good answer must contain.';

export function cardsPrompt(material: string, count: number): string {
  return `Write ${count} questions from this material.\n\nMaterial:\n${material}`;
}

export const CARDS_FROM_IMAGE = (count: number) =>
  `This is a photo of study material (notes, a textbook page or slides). Read it and write ${count} questions from it.`;

export const EXPLAIN_SYSTEM =
  'You are a patient tutor. The student keeps getting this question wrong. Explain the idea clearly and simply, ' +
  'build it up from what they already know, and end with one short memory hook. Use plain language.';

export function explainPrompt(question: string, answer: string, missing: string[], deviceShort: boolean): string {
  return [
    `Question: ${question}`,
    `Model answer: ${answer}`,
    missing.length ? `What the student keeps missing: ${missing.join('; ')}` : '',
    deviceShort ? 'Keep it under 120 words.' : 'Keep it under 300 words.',
  ]
    .filter(Boolean)
    .join('\n');
}

/** How many questions to ask for, from the material's length: about one per 600 characters. */
export function cardCount(chars: number): number {
  return Math.max(3, Math.min(15, Math.round(chars / 600)));
}

// ----- Checking replies -----

export interface DraftCard {
  prompt: string;
  answer: string;
  keyPoints: string[];
  /** Which part of split material it came from (offline, on the device), to check it against. */
  part?: number;
}

/** Pulls JSON out of a reply that may be wrapped in a code fence or prose. */
export function parseJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.search(/[[{]/);
  if (start < 0) throw new Error('no JSON in reply');
  const open = body[start];
  const end = body.lastIndexOf(open === '{' ? '}' : ']');
  return JSON.parse(body.slice(start, end + 1));
}

/** A grade from a model reply, or null if it is unusable. Score comes from coverage. */
export function toGrade(reply: unknown, keyPoints: string[], engine: Grade['engine']): Grade | null {
  if (!reply || typeof reply !== 'object') return null;
  const r = reply as { covered?: unknown; feedback?: unknown };
  if (!Array.isArray(r.covered)) return null;
  const hits = new Set<number>();
  for (const v of r.covered) {
    const n = typeof v === 'number' ? v : Number.parseInt(String(v), 10);
    if (Number.isInteger(n) && n >= 1 && n <= keyPoints.length) hits.add(n - 1);
  }
  const covered = keyPoints.filter((_, i) => hits.has(i));
  const missing = keyPoints.filter((_, i) => !hits.has(i));
  const feedback = typeof r.feedback === 'string' && r.feedback.trim() ? r.feedback.trim() : missing.length ? `Missing: ${missing.join('; ')}.` : 'All there.';
  return { score: keyPoints.length ? covered.length / keyPoints.length : 0, covered, missing, feedback, engine };
}

/** Cards from a model reply: malformed entries dropped, duplicates removed, sizes bounded. */
export function toCards(reply: unknown): DraftCard[] {
  const list = Array.isArray(reply) ? reply : reply && typeof reply === 'object' && Array.isArray((reply as { cards?: unknown }).cards) ? (reply as { cards: unknown[] }).cards : [];
  const seen = new Set<string>();
  const out: DraftCard[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const c = item as { prompt?: unknown; question?: unknown; answer?: unknown; keyPoints?: unknown };
    const prompt = String(c.prompt ?? c.question ?? '').trim();
    const answer = String(c.answer ?? '').trim();
    const keyPoints = Array.isArray(c.keyPoints) ? c.keyPoints.map((k) => String(k).trim()).filter(Boolean).slice(0, 5) : [];
    if (prompt.length < 8 || !answer || keyPoints.length === 0) continue;
    const key = prompt.toLowerCase().replace(/\W+/g, ' ').trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ prompt, answer, keyPoints });
  }
  return out;
}
