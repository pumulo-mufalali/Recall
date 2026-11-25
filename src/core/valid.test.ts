import { describe, expect, it, vi } from 'vitest';
import { isAttempt, isCard, isDeck, keepValid } from './valid';

const card = { id: 'c', deckId: 'd', prompt: 'Q', answer: 'A', keyPoints: [], srs: { due: '2026-11-25', state: 0 } };
const attempt = { id: 'a', cardId: 'c', at: '2026-11-25', confidence: 3, grade: { score: 0.5, missing: [], covered: [] } };

describe('record shape checks', () => {
  it('accepts well-formed records', () => {
    expect(isDeck({ id: 'd', title: 'T', createdAt: 'x' })).toBe(true);
    expect(isCard(card)).toBe(true);
    expect(isAttempt(attempt)).toBe(true);
  });
  it('rejects records missing what the app relies on', () => {
    expect(isCard({ ...card, srs: undefined })).toBe(false);
    expect(isAttempt({ ...attempt, grade: undefined })).toBe(false);
    expect(isAttempt({ ...attempt, grade: { score: 'high', missing: [], covered: [] } })).toBe(false);
    expect(isDeck(null)).toBe(false);
  });
  it('keeps the valid ones and reports the rest', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(keepValid([attempt, { id: 'bad' }, attempt], isAttempt, 'answers')).toHaveLength(2);
    expect(warn).toHaveBeenCalledWith('[recall] skipped 1 malformed answers');
    warn.mockRestore();
  });
});
