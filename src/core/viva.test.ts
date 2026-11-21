import { describe, expect, it } from 'vitest';
import { cleanProbe, downsample, fallbackProbe, floatToPcm16, leaks, mergeOral, oralTranscript, pcmToWav, rateOf, shouldProbe, voicePlan, type VoiceConditions } from './viva';
import type { Grade } from './types';

const Q = 'How do vaccines protect you from a disease?';
const KP = ['They expose the immune system to a harmless antigen', 'Memory cells remember the pathogen', 'A later infection is fought off faster'];
const g = (covered: string[], engine: Grade['engine'] = 'on-device'): Grade => ({
  score: covered.length / KP.length,
  covered,
  missing: KP.filter((k) => !covered.includes(k)),
  feedback: 'Good start.',
  engine,
});

describe('leaks', () => {
  it('flags a follow-up that says the missing point', () => {
    expect(leaks('Do memory cells remember the pathogen?', Q, [KP[1]])).toBe(true);
  });
  it('allows a nudge that does not', () => {
    expect(leaks('What happens if you meet the same germ again years later?', Q, [KP[1], KP[2]])).toBe(false);
  });
  it('ignores words the question already used', () => {
    expect(leaks('What does the vaccine do to protect you over time?', Q, ['Vaccines protect you'])).toBe(false);
  });
});

describe('cleanProbe', () => {
  it('keeps the first question and strips quotes', () => {
    expect(cleanProbe('"What happens the second time you meet it? And why?"', Q, KP)).toBe('What happens the second time you meet it?');
  });
  it('rejects statements, repeats and leaks', () => {
    expect(cleanProbe('Think about memory.', Q, KP)).toBeNull();
    expect(cleanProbe(Q, Q, KP)).toBeNull();
    expect(cleanProbe('Which memory cells remember the pathogen?', Q, KP)).toBeNull();
  });
  it('has a fallback for how and why questions', () => {
    expect(fallbackProbe(Q)).toMatch(/steps/);
    expect(fallbackProbe('Why is the sky blue?')).toMatch(/reason/);
    expect(fallbackProbe('What is osmosis?')).toMatch(/\?/);
  });
});

describe('oral marking', () => {
  it('probes only a partial answer, once', () => {
    expect(shouldProbe(g([KP[0]]), 0)).toBe(true);
    expect(shouldProbe(g([KP[0]]), 1)).toBe(false);
    expect(shouldProbe(g(KP), 0)).toBe(false);
  });
  it('counts prompted points at half', () => {
    const m = mergeOral(g([KP[0]]), g([KP[1]]), KP);
    expect(m.score).toBeCloseTo((1 + 0.5) / 3);
    expect(m.prompted).toEqual([KP[1]]);
    expect(m.missing).toEqual([KP[2]]);
    expect(m.covered).toEqual([KP[0]]);
  });
  it('does not count a point twice, and reports the cloud when either part used it', () => {
    const m = mergeOral(g([KP[0]]), g([KP[0], KP[2]], 'cloud'), KP);
    expect(m.prompted).toEqual([KP[2]]);
    expect(m.engine).toBe('cloud');
  });
  it('keeps the first mark with no follow-up', () => {
    const first = g([KP[0]]);
    expect(mergeOral(first, null, KP)).toBe(first);
  });
  it('writes the transcript with the follow-up', () => {
    expect(oralTranscript(' a ', null, null)).toBe('a');
    expect(oralTranscript('a', 'Why?', '')).toBe('a\n\nFollow-up: Why?\n(no answer)');
  });
});

describe('voicePlan', () => {
  const base: VoiceConditions = { online: true, speechOnDevice: true, canRecord: true, cloudGrading: true, policy: 'balanced' };
  it('hears on the device when it can', () => {
    expect(voicePlan(base).listen).toBe('device');
    expect(voicePlan({ ...base, policy: 'private' }).listen).toBe('device');
  });
  it('falls back to cloud transcription, never in private mode or offline', () => {
    expect(voicePlan({ ...base, speechOnDevice: false }).listen).toBe('cloud');
    expect(voicePlan({ ...base, speechOnDevice: false, policy: 'private' }).listen).toBe('type');
    expect(voicePlan({ ...base, speechOnDevice: false, online: false }).listen).toBe('type');
    expect(voicePlan({ ...base, speechOnDevice: false, cloudGrading: false }).listen).toBe('type');
  });
  it('reads replies on the device in private mode, everything offline', () => {
    expect(voicePlan({ ...base, policy: 'private' })).toMatchObject({ speakQuestion: 'cloud', speakReply: 'device' });
    expect(voicePlan({ ...base, online: false })).toMatchObject({ speakQuestion: 'device', speakReply: 'device' });
  });
});

describe('audio', () => {
  it('reads the rate from a PCM type', () => {
    expect(rateOf('audio/L16;codec=pcm;rate=16000')).toBe(16000);
    expect(rateOf('audio/L16')).toBe(24000);
  });
  it('wraps PCM in a valid WAV header', () => {
    const wav = pcmToWav(new Uint8Array([1, 2, 3, 4]), 24000);
    const v = new DataView(wav.buffer);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF');
    expect(v.getUint32(4, true)).toBe(40);
    expect(v.getUint32(24, true)).toBe(24000);
    expect(v.getUint32(40, true)).toBe(4);
    expect([...wav.slice(44)]).toEqual([1, 2, 3, 4]);
  });
  it('converts and downsamples', () => {
    const pcm = floatToPcm16(new Float32Array([0, 1, -1, 2]));
    const v = new DataView(pcm.buffer);
    expect([v.getInt16(0, true), v.getInt16(2, true), v.getInt16(4, true), v.getInt16(6, true)]).toEqual([0, 32767, -32767, 32767]);
    expect([...downsample(new Float32Array([1, 3, 5, 7]), 32000, 16000)]).toEqual([2, 6]);
  });
});
