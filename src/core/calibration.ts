/**
 * Calibration: how well the learner's confidence matches how they actually do.
 *
 * Re-reading notes makes material feel familiar, and familiar feels known: the "illusion of
 * competence". Asking for a confidence level before every answer, then showing the gap between
 * claims and results, is the most direct way to break it. Recall reports:
 * - per confidence level: how often answers at that level were actually right;
 * - the overall gap (mean claimed minus mean scored): positive means overconfident;
 * - a verdict judged level by level, so an overconfident "Certain" is never hidden by an
 *   underconfident "No idea" in the average;
 * - the Brier score (mean squared error of the claims): 0 is perfect, 0.25 is coin-flipping;
 * - the confident misses: cards answered "Certain" and got wrong, worth most attention.
 */
import { CONFIDENCE_CLAIM, type Attempt, type Confidence } from './types';

/** An answer counts as right at this score or above. */
export const RIGHT = 0.7;

export interface LevelStats {
  confidence: Confidence;
  claimed: number;
  /** Share of answers at this level that were right; null with no answers. */
  actual: number | null;
  count: number;
}

export interface Calibration {
  attempts: number;
  levels: LevelStats[];
  /** Mean claimed probability minus share right. Positive: overconfident. */
  gap: number;
  brier: number;
  /** Card ids answered "Certain" and got wrong, most recent first, unique. */
  confidentMisses: string[];
  verdict: 'not enough data' | 'overconfident' | 'underconfident' | 'mixed' | 'well calibrated';
  /** The level furthest from its claim, among those that count; null when none is off. */
  worst: LevelStats | null;
}

/** Below this many attempts, the numbers say little. */
export const MIN_ATTEMPTS = 10;
/** A confidence level counts once it has this many answers... */
export const LEVEL_MIN = 5;
/** ...and is off when its accuracy is further than this from its claim. */
export const LEVEL_TOLERANCE = 0.12;

/** Over, under, mixed or well calibrated, from the levels that are off. */
function judge(levels: LevelStats[]): { verdict: Calibration['verdict']; worst: LevelStats | null } {
  const off = levels.filter((l) => l.actual !== null && l.count >= LEVEL_MIN && Math.abs(l.claimed - l.actual) > LEVEL_TOLERANCE);
  if (!off.length) return { verdict: 'well calibrated', worst: null };
  const worst = [...off].sort((a, b) => Math.abs(b.claimed - b.actual!) - Math.abs(a.claimed - a.actual!))[0];
  const over = off.some((l) => l.claimed > l.actual!);
  const under = off.some((l) => l.claimed < l.actual!);
  return { verdict: over && under ? 'mixed' : over ? 'overconfident' : 'underconfident', worst };
}

export function calibrate(attempts: Attempt[]): Calibration {
  const levels: LevelStats[] = ([1, 2, 3, 4] as Confidence[]).map((confidence) => {
    const at = attempts.filter((a) => a.confidence === confidence);
    const right = at.filter((a) => a.grade.score >= RIGHT).length;
    return { confidence, claimed: CONFIDENCE_CLAIM[confidence], actual: at.length ? right / at.length : null, count: at.length };
  });
  let claimed = 0;
  let scored = 0;
  let brier = 0;
  for (const a of attempts) {
    const p = CONFIDENCE_CLAIM[a.confidence];
    const right = a.grade.score >= RIGHT ? 1 : 0;
    claimed += p;
    scored += right;
    brier += (p - right) ** 2;
  }
  const n = attempts.length;
  const gap = n ? (claimed - scored) / n : 0;
  const misses = [...attempts]
    .filter((a) => a.confidence === 4 && a.grade.score < RIGHT)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .map((a) => a.cardId);
  const judged = n < MIN_ATTEMPTS ? { verdict: 'not enough data' as const, worst: null } : judge(levels);
  return {
    attempts: n,
    levels,
    gap,
    brier: n ? brier / n : 0,
    confidentMisses: [...new Set(misses)],
    ...judged,
  };
}
