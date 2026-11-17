/**
 * Errors that mean "busy, try again": rate limits, overload, temporary unavailability. Anything
 * else (a malformed request, App Check refusing the app) is not worth retrying.
 */
export function isBusy(e: unknown): boolean {
  const text = e instanceof Error ? `${e.message} ${(e as { code?: string }).code ?? ''}` : String(e);
  if (/app.?check|permission|api key|invalid argument|\b(400|401|403|404)\b/i.test(text)) return false;
  return /high demand|overloaded|try again later|unavailable|resource.?exhausted|\b(429|500|502|503|504)\b/i.test(text);
}
