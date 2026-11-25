/**
 * Self-auditing marking: Recall calibrates its own AI the way it calibrates the learner.
 *
 * Gemini Nano marks every answer on the device: instant, free and private. But a small model
 * can be wrong, so each mark is weighed for doubt, from signals that cost nothing:
 *   - what Nano says about its own confidence;
 *   - whether a plain word-matching marker (no model) agrees with it, key point by key point;
 *   - whether one key point would flip the verdict (a borderline mark changes the schedule);
 *   - whether a near-empty answer got credit.
 * A doubtful mark is escalated to the larger cloud model before the learner sees it. And a
 * random sample of confident marks is audited by the cloud model in the background: the
 * agreement rate becomes Nano's trust score on this learner's material. The more Nano is
 * trusted, the less is escalated or audited, so the less of the learner's writing leaves the
 * device: privacy is earned, measured, and shown.
 *
 * Pure: the caller passes in the marks, the history and a random number.
 */
import { RIGHT } from './calibration';
import type { Attempt, Grade } from './types';

/** What the on-device model says about its own mark. */
export type SelfConfidence = 'high' | 'medium' | 'low';

export interface Doubt {
  /** 0 (sure) to 1 (no idea). */
  value: number;
  /** Plain reasons, for the learner and the AI engine page. */
  reasons: string[];
}

/** How doubtful an on-device mark is, from free signals. */
export function doubt(nano: Grade, self: SelfConfidence | null, lexical: Grade, answer: string, right = RIGHT): Doubt {
  const reasons: string[] = [];
  let v = 0;

  if (self === 'low') {
    v += 0.45;
    reasons.push('Nano was not confident in its own mark');
  } else if (self === 'medium') {
    v += 0.2;
    reasons.push('Nano was only fairly confident');
  } else if (self === null) {
    v += 0.15;
    reasons.push('Nano did not rate its confidence');
  }

  // Key points where Nano and the word-matcher disagree. Credit with no shared words at all
  // may be Nano being lenient; words present but no credit may be Nano being strict (or the
  // words used wrongly). Paraphrase makes the first common, so it weighs less.
  const n = nano.covered.length + nano.missing.length;
  if (n) {
    const lex = new Set(lexical.covered);
    const lenient = nano.covered.filter((p) => !lex.has(p)).length;
    const strict = nano.missing.filter((p) => lex.has(p)).length;
    if (lenient) {
      v += (0.3 * lenient) / n;
      reasons.push(`${lenient} key point${lenient > 1 ? 's' : ''} credited without matching words`);
    }
    if (strict) {
      v += (0.4 * strict) / n;
      reasons.push(`${strict} key point${strict > 1 ? 's' : ''} not credited though the words are there`);
    }
    // One key point either way would change right into wrong, or wrong into right.
    const step = 1 / n;
    if ((nano.score >= right && nano.score < 1 && nano.score - step < right) || (nano.score < right && nano.score + step >= right)) {
      v += 0.15;
      reasons.push('one key point decides between right and wrong');
    }
  }

  if (answer.trim().length < 12 && nano.score > 0) {
    v += 0.3;
    reasons.push('a very short answer got credit');
  }

  return { value: Math.min(1, v), reasons };
}

/** Two marks agree when they are close and on the same side of "right". */
export function agrees(a: number, b: number, right = RIGHT): boolean {
  return Math.abs(a - b) <= 0.25 && a >= right === b >= right;
}

export interface Audit {
  id: string;
  at: string;
  cardId: string;
  nano: number;
  cloud: number;
  agree: boolean;
  doubt: number;
  /** Escalated (the learner waited for the cloud mark) or a background spot-check. */
  kind: 'escalated' | 'spot-check';
}

export interface Trust {
  /** Audits counted (the most recent window). */
  total: number;
  agreed: number;
  /** Posterior mean of the agreement rate, with a mildly optimistic prior. */
  mean: number;
  /** A cautious lower bound (Wilson, 90%): what the router acts on. */
  low: number;
}

const PRIOR_AGREE = 3;
const PRIOR_TOTAL = 4;

/** Nano's trust score from recent audits (newest first or any order: only counts matter). */
export function trustFrom(audits: Pick<Audit, 'agree'>[], window = 60): Trust {
  const recent = audits.slice(0, window);
  const agreed = recent.filter((a) => a.agree).length;
  const total = recent.length;
  const n = total + PRIOR_TOTAL;
  const p = (agreed + PRIOR_AGREE) / n;
  const z = 1.645;
  const low = (p + (z * z) / (2 * n) - z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / (1 + (z * z) / n);
  return { total, agreed, mean: p, low: Math.max(0, low) };
}

/** How far the learner lets answers leave the device. */
export type Policy = 'private' | 'balanced' | 'accurate';

export const POLICY_LABEL: Record<Policy, string> = { private: 'Private', balanced: 'Balanced', accurate: 'Accuracy first' };
export const POLICY_HELP: Record<Policy, string> = {
  private: 'Answers never leave this device. Nano’s marks stand as they are.',
  balanced: 'Doubtful marks go to the cloud; a few others are spot-checked. Fewer as Nano earns trust.',
  accurate: 'Escalates more readily and spot-checks more often, for the most reliable marks.',
};

export interface Thresholds {
  /** Escalate when doubt is above this. */
  escalateAbove: number;
  /** Share of kept marks to spot-check in the background. */
  auditRate: number;
}

/** The router's thresholds: trust earned on the device relaxes both. */
export function thresholds(trust: Trust, policy: Policy): Thresholds {
  const t = trust.low;
  if (policy === 'private') return { escalateAbove: Infinity, auditRate: 0 };
  if (policy === 'accurate') return { escalateAbove: 0.25 + 0.2 * t, auditRate: clamp(0.6 * (1 - t), 0.1, 0.6) };
  return { escalateAbove: 0.35 + 0.35 * t, auditRate: clamp(0.45 * (1 - t), 0.05, 0.45) };
}

export type Decision =
  | { kind: 'keep'; reason: string }
  | { kind: 'escalate'; reason: string }
  | { kind: 'spot-check'; reason: string };

/** Keep Nano's mark, escalate it, or keep it and spot-check it. `roll` is uniform in [0, 1). */
export function decide(d: Doubt, trust: Trust, policy: Policy, cloudReachable: boolean, roll: number): Decision {
  if (policy === 'private') return { kind: 'keep', reason: 'Private mode: marked on this device only.' };
  if (!cloudReachable) return { kind: 'keep', reason: 'Offline: marked on this device.' };
  const th = thresholds(trust, policy);
  if (d.value > th.escalateAbove) return { kind: 'escalate', reason: `Escalated: ${d.reasons[0] ?? 'doubtful mark'}.` };
  if (roll < th.auditRate) return { kind: 'spot-check', reason: `Spot-checked by the cloud (${Math.round(th.auditRate * 100)}% of confident marks at Nano’s current trust).` };
  return { kind: 'keep', reason: d.reasons.length ? 'Confident enough to keep on this device.' : 'Nano was sure, and the word check agrees.' };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** How many of the latest audits are loaded: the trust score needs only the latest 60. */
export const AUDIT_HISTORY = 300;

/**
 * The self-audit's counts for the AI engine page. `audits` are newest first and capped at
 * AUDIT_HISTORY; when the cap is reached, the counts cover the same window (answers since the
 * oldest loaded audit), so the privacy share is never flattered by spot-checks left out.
 */
export function auditStats(audits: Pick<Audit, 'kind' | 'at'>[], attempts: Pick<Attempt, 'at' | 'grade'>[], cap = AUDIT_HISTORY) {
  const windowed = audits.length >= cap;
  const since = windowed ? audits[audits.length - 1].at : null;
  const answers = since ? attempts.filter((a) => a.at >= since) : attempts;
  const escalated = audits.filter((a) => a.kind === 'escalated').length;
  const spot = audits.filter((a) => a.kind === 'spot-check').length;
  const left = answers.filter((a) => a.grade.engine === 'cloud').length + spot;
  return { windowed, escalated, stayed: answers.length ? Math.max(0, answers.length - left) / answers.length : null };
}
