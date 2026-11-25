import { describe, expect, it } from 'vitest';
import { downsample, floatToPcm16, pcmToWav, rateOf, voicePlan, type VoiceConditions } from './speech';

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
  it('reads questions in Gemini’s voice online, the device’s offline', () => {
    expect(voicePlan(base).speakQuestion).toBe('cloud');
    expect(voicePlan({ ...base, online: false }).speakQuestion).toBe('device');
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
