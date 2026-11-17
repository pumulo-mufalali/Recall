/**
 * Fact-checking generated cards against their source. A wrong card is worse than no card: the
 * learner memorises the mistake. Asking a model "is this right?" is not enough on its own, as
 * it can repeat the first model's misreading, so three independent checks are combined:
 *
 * 1. Evidence: a fact-checking pass must quote, word for word, the source text that supports
 *    each answer, and give a verdict (supported, partly, wrong) with a correction when needed.
 * 2. Numbers: every number in a card's answer and key points must appear in that evidence.
 *    Plain code, no model: "£4.33" against evidence saying "£4.53" is caught every time.
 * 3. Quotes: when the source is text, the evidence must really be in it (whitespace, case
 *    and punctuation aside), so a checker cannot invent support.
 *
 * Pure: the model's reply comes in as data.
 */
import type { DraftCard } from './prompts';

export type Verdict = 'supported' | 'partial' | 'wrong';

/** What the fact-checking model said about one card. */
export interface CheckReply {
  verdict: Verdict;
  evidence: string;
  issue: string;
  /** Its corrected version, used only when the card is not supported. */
  answer?: string;
  keyPoints?: string[];
}

export type CheckStatus = 'verified' | 'flagged' | 'unchecked';

export interface CardCheck {
  status: CheckStatus;
  /** Why it was flagged (or why it could not be checked), for the learner. */
  notes: string[];
  evidence: string;
  /** A suggested fix, when the checker gave one. */
  correction?: { answer: string; keyPoints: string[] };
}

/**
 * Numbers in a text, normalised: "£4.53" → "4.53", "6,000" → "6000", "0.50" → "0.5", ".5" → "0.5".
 * Years, prices, weights and counts are where misreadings hide.
 */
export function numbers(text: string): string[] {
  const found = text.match(/\d[\d,]*(?:\.\d+)?|\.\d+/g) ?? [];
  return found.map((n) => {
    const plain = n.replace(/,(?=\d{3}\b)/g, '').replace(/,/g, '');
    const value = Number(plain.startsWith('.') ? `0${plain}` : plain);
    return Number.isFinite(value) ? String(value) : plain;
  });
}

/**
 * Numbers that are names rather than facts: a capitalised word and a small whole number,
 * as in "Zone 1", "Chapter 3", "Figure 2" or "World War 2". These identify things; the facts
 * worth checking are the values attached to them.
 */
export function labels(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/\b[A-Z][a-zA-Z]+\s+(\d{1,2})\b(?![.,]\d)/g)) out.add(String(Number(m[1])));
  return out;
}

/**
 * The numbers a card actually claims: those in its answer and key points, minus numbers the
 * question already gives ("What does a 10 kg parcel cost?" claims only the price) and labels.
 */
export function claimedNumbers(card: DraftCard): string[] {
  const body = [card.answer, ...card.keyPoints].join(' ');
  const given = new Set([...numbers(card.prompt), ...labels(body), ...labels(card.prompt)]);
  return [...new Set(numbers(body))].filter((n) => !given.has(n));
}

/** Text reduced for comparing quotes: lowercase letters, digits and single spaces. */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/\.(?!\d)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Whether `quote` appears in `source`; long quotes may be split by the model with "...". */
export function quoted(quote: string, source: string): boolean {
  const hay = normalise(source);
  const parts = quote.split(/\.{3}|…/).map(normalise).filter((p) => p.length >= 8);
  return parts.length > 0 && parts.every((p) => hay.includes(p));
}

/** Combines the checker's verdict with the plain-code checks into one status for the card. */
export function judge(card: DraftCard, reply: CheckReply | undefined, sourceText?: string): CardCheck {
  if (!reply) return { status: 'unchecked', notes: ['The fact-checker gave no verdict for this card.'], evidence: '' };
  const notes: string[] = [];
  const evidence = reply.evidence.trim();

  if (reply.verdict === 'wrong') notes.push(reply.issue.trim() || 'The source does not support this answer.');
  if (reply.verdict === 'partial') notes.push(reply.issue.trim() || 'Only part of this answer is in the source.');
  if (!evidence) notes.push('No supporting passage was found in the source.');

  if (evidence && sourceText && !quoted(evidence, sourceText)) notes.push('The quoted evidence is not in your material.');

  if (evidence) {
    const inEvidence = new Set(numbers(evidence));
    const inSource = sourceText ? new Set(numbers(sourceText)) : null;
    const unsupported = claimedNumbers(card).filter((n) => !inEvidence.has(n) && !(inSource?.has(n) ?? false));
    if (unsupported.length) {
      const list = unsupported.join(', ');
      // With the source text in hand the check is complete; for a photo or PDF, only the quoted
      // passage can be checked, so say exactly that.
      notes.push(
        sourceText
          ? `${list} ${unsupported.length > 1 ? 'do' : 'does'} not appear in your material.`
          : `${list} ${unsupported.length > 1 ? 'are' : 'is'} not in the passage the checker quoted: check against your material.`,
      );
    }
  }

  const correction =
    reply.verdict !== 'supported' && reply.answer?.trim() && reply.keyPoints?.length
      ? { answer: reply.answer.trim(), keyPoints: reply.keyPoints.map((k) => k.trim()).filter(Boolean) }
      : undefined;
  return { status: notes.length ? 'flagged' : 'verified', notes, evidence, ...(correction ? { correction } : {}) };
}

/** The checker's reply, validated: one entry per card number (1-based), malformed ones dropped. */
export function toChecks(reply: unknown, count: number): Map<number, CheckReply> {
  const list = reply && typeof reply === 'object' && Array.isArray((reply as { checks?: unknown }).checks) ? (reply as { checks: unknown[] }).checks : Array.isArray(reply) ? reply : [];
  const out = new Map<number, CheckReply>();
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const card = typeof r.card === 'number' ? r.card : Number.parseInt(String(r.card), 10);
    const verdict = String(r.verdict ?? '').toLowerCase();
    if (!Number.isInteger(card) || card < 1 || card > count) continue;
    if (verdict !== 'supported' && verdict !== 'partial' && verdict !== 'wrong') continue;
    out.set(card - 1, {
      verdict,
      evidence: String(r.evidence ?? ''),
      issue: String(r.issue ?? ''),
      ...(typeof r.answer === 'string' ? { answer: r.answer } : {}),
      ...(Array.isArray(r.keyPoints) ? { keyPoints: r.keyPoints.map(String) } : {}),
    });
  }
  return out;
}

export const VERIFY_SYSTEM =
  'You are a strict fact-checker for study cards. You check each card against the source material only, never your own knowledge. ' +
  'For each card: copy, word for word, the passages of the source that support its answer (for a table, the row and column labels and the value). ' +
  'The evidence must contain every number the answer uses; join separate passages with " ... ". ' +
  'Compare every number, name, unit and detail exactly; a single digit wrong makes the card "wrong". ' +
  'Verdict "supported" if all of it is in the source, "partial" if only some is, "wrong" if any of it contradicts or is missing from the source. ' +
  'For "partial" or "wrong", say what is off in "issue" and give a corrected answer and key points using only the source.';

export function verifyPrompt(cards: DraftCard[]): string {
  return [
    'Check these cards against the source.',
    ...cards.map((c, i) => `Card ${i + 1}\nQ: ${c.prompt}\nA: ${c.answer}\nKey points: ${c.keyPoints.join(' | ')}`),
  ].join('\n\n');
}
