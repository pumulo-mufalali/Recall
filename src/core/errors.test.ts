import { describe, expect, it } from 'vitest';
import { Plain, friendly } from './errors';

const err = (m: string) => new Error(m);

describe('friendly', () => {
  it('turns the real overload error into plain words', () => {
    const f = friendly(err('AI: Error fetching from https://firebasevertexai.googleapis.com/v1beta/projects/p/models/gemini-3.5-flash-lite:generateContent: [500 ] This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later. (AI/fetch-error)'));
    expect(f.message).toBe('The AI is very busy right now.');
    expect(f.retry).toBe(true);
    expect(f.detail).toContain('high demand');
  });
  it('names App Check problems without retry loops', () => {
    expect(friendly(err('AI: AppCheck: Fetch server returned an HTTP error status. HTTP status: 403. (appCheck/fetch-status-error)')).message).toContain('App Check');
  });
  it('separates a used-up allowance from a busy moment', () => {
    expect(friendly(err('[429 ] You exceeded your current quota')).message).toContain('allowance');
  });
  it('explains garbled replies and dropped connections', () => {
    expect(friendly(err('no JSON in reply')).message).toContain('garbled');
    expect(friendly(err('TypeError: Failed to fetch')).message).toBe('The connection dropped.');
  });
  it('passes learner-ready messages through', () => {
    expect(friendly(new Plain('No usable questions came back.', 'Try longer material.', true))).toMatchObject({ message: 'No usable questions came back.', hint: 'Try longer material.', retry: true });
  });
  it('has a fallback that still says what to do', () => {
    const f = friendly(err('something odd'));
    expect(f.message).toBe('Something went wrong.');
    expect(f.hint).toContain('Details');
  });
});
