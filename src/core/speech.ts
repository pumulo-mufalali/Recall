/**
 * Speaking in a study session: the learner can answer out loud, and have the question read
 * aloud. Pure: where each part runs (the voice plan), and the WAV encoding the audio needs. The
 * browser side is ui/voice.ts; the model calls are in services/engine.ts.
 */
import type { Policy } from './audit';

// ----- Where speech runs -----

export type Listen = 'device' | 'cloud' | 'type';
export type Speak = 'cloud' | 'device';

export interface VoiceConditions {
  online: boolean;
  /** Chrome can recognise speech on this device (on-device speech recognition). */
  speechOnDevice: boolean;
  /** A microphone can be recorded at all (MediaRecorder and getUserMedia). */
  canRecord: boolean;
  /** Remote Config's privacy switch: may answers be processed in the cloud at all. */
  cloudGrading: boolean;
  policy: Policy;
}

export interface VoicePlan {
  listen: Listen;
  listenReason: string;
  /** For the question: it comes from the learner's material, not from their answer. */
  speakQuestion: Speak;
}

/**
 * Where speech runs. The learner's voice is the most personal thing in the app, so it is heard
 * on the device whenever Chrome can; it goes to the cloud only when it cannot, never in private
 * mode. Speech out is the reverse: the questions come from the learner's own material, so a
 * natural cloud voice reads them when online.
 */
export function voicePlan(c: VoiceConditions): VoicePlan {
  const cloudOk = c.online && c.cloudGrading && c.policy !== 'private';
  const listen: Listen = c.speechOnDevice ? 'device' : c.canRecord && cloudOk ? 'cloud' : 'type';
  const listenReason =
    listen === 'device'
      ? 'On this device. Your voice never leaves it.'
      : listen === 'cloud'
        ? 'Gemini transcribes your recording in the cloud.'
        : !c.canRecord
          ? 'No microphone access in this browser.'
          : c.policy === 'private'
            ? 'Private mode, and no on-device speech recognition.'
            : 'Offline, and no on-device speech recognition.';
  const speakQuestion: Speak = c.online ? 'cloud' : 'device';
  return { listen, listenReason, speakQuestion };
}

// ----- Audio -----

/** The sample rate in a raw PCM MIME type ("audio/L16;codec=pcm;rate=24000"), or 24 kHz. */
export function rateOf(mime: string): number {
  const m = mime.match(/rate=(\d+)/);
  return m ? Number(m[1]) : 24_000;
}

/** A WAV file (16-bit mono) around raw little-endian PCM, which browsers cannot play as-is. */
export function pcmToWav(pcm: Uint8Array, rate: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(44 + pcm.length));
  const v = new DataView(out.buffer);
  const text = (at: number, s: string) => [...s].forEach((ch, i) => v.setUint8(at + i, ch.charCodeAt(0)));
  text(0, 'RIFF');
  v.setUint32(4, 36 + pcm.length, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  v.setUint32(16, 16, true); // fmt chunk size
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); // bytes per second
  v.setUint16(32, 2, true); // block align
  v.setUint16(34, 16, true); // bits per sample
  text(36, 'data');
  v.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
}

/** Float samples (-1..1) as 16-bit little-endian PCM. */
export function floatToPcm16(samples: Float32Array): Uint8Array {
  const out = new Uint8Array(samples.length * 2);
  const v = new DataView(out.buffer);
  samples.forEach((s, i) => v.setInt16(i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true));
  return out;
}

/** Averages samples down to a lower rate (speech needs no more than 16 kHz). */
export function downsample(samples: Float32Array, from: number, to: number): Float32Array {
  if (to >= from) return samples;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(samples.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(samples.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += samples[j];
    out[i] = sum / Math.max(1, end - start);
  }
  return out;
}
