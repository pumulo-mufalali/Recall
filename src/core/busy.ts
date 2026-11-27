/**
 * Errors that mean "busy, try again": rate limits, overload, temporary unavailability. Anything
 * else (a malformed request, App Check refusing the app) is not worth retrying.
 */
export function isBusy(e: unknown): boolean {
  const text = e instanceof Error ? `${e.message} ${(e as { code?: string }).code ?? ''}` : String(e);
  if (/app.?check|permission|api key|invalid argument|\b(400|401|403|404)\b/i.test(text)) return false;
  // A request that ran out of time is a busy model too: another may answer.
  return /high demand|overloaded|try again later|unavailable|resource.?exhausted|timed? ?out|timeout|deadline|aborted|\b(429|500|502|503|504)\b/i.test(text);
}

/**
 * The order to try cloud models in: the preferred order, but models that were busy a moment ago
 * (resting until a time still to come) go to the back, so a struggling model is not waited on
 * again while others are free.
 */
export function modelOrder(models: string[], restingUntil: ReadonlyMap<string, number>, now: number): string[] {
  const resting = (m: string) => (restingUntil.get(m) ?? 0) > now;
  return [...models.filter((m) => !resting(m)), ...models.filter(resting)];
}
