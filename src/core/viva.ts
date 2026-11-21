/**
 * The oral exam (a viva): Recall reads each question aloud, the learner answers by voice, and
 * when the answer leaves a key point out, an examiner's follow-up nudges toward it without
 * giving it away. A point recalled only after the nudge counts half: needing a hint is partial
 * recall, and the schedule should know.
 *
 * Pure: the follow-up guard, the oral marking, where each part of the voice loop runs, and
 * the WAV encoding the audio needs. The browser and model calls live in services/ and ui/.
 */
import { terms } from './localGrade';
import type { Policy } from './audit';
import type { Grade } from './types';

// ----- The follow-up -----

/** Most follow-ups an examiner asks on one card. */
export const MAX_PROBES = 1;
/** What a key point recalled only after a follow-up is worth, against one recalled unprompted. */
export const PROMPTED_WORTH = 0.5;

/**
 * Whether a follow-up gives a missing key point away: it says most of that point's own words
 * (words already in the question are fair game, since the learner has heard them).
 */
export function leaks(followUp: string, question: string, missing: string[]): boolean {
  const asked = new Set(terms(question));
  const said = new Set(terms(followUp));
  return missing.some((point) => {
    const own = [...new Set(terms(point))].filter((t) => !asked.has(t));
    if (!own.length) return false;
    const hits = own.filter((t) => said.has(t)).length;
    return own.length === 1 ? hits === 1 && own[0].length > 5 : hits / own.length >= 0.5;
  });
}

/**
 * A model's follow-up made safe to ask: one question, short, not the original question again,
 * and not giving the answer away. Null when it is none of those (the caller falls back).
 */
export function cleanProbe(reply: string, question: string, missing: string[]): string | null {
  let text = reply.replace(/^["'“\s]+|["'”\s]+$/g, '').replace(/\s+/g, ' ').trim();
  // Keep the first question only, should the model ask two.
  const q = text.indexOf('?');
  if (q < 0) return null;
  text = text.slice(0, q + 1).trim();
  if (text.length < 12 || text.length > 220) return null;
  const same = (s: string) => s.toLowerCase().replace(/\W+/g, ' ').trim();
  if (same(text) === same(question)) return null;
  if (leaks(text, question, missing)) return null;
  return text;
}

/** The follow-up when no model can write one: an open invitation, which leaks nothing. */
export function fallbackProbe(question: string): string {
  const lead = /^\s*why\b/i.test(question) ? 'What is the reason behind that, in more detail?' : /^\s*how\b/i.test(question) ? 'Can you walk me through the steps, one at a time?' : 'Is there anything else that matters here? Take a moment and add it.';
  return lead;
}

/** Whether to ask a follow-up: something was missed, and not everything (nothing said is not a gap to probe). */
export function shouldProbe(first: Grade, probesSoFar: number): boolean {
  return probesSoFar < MAX_PROBES && first.missing.length > 0 && first.score < 1;
}

// ----- Marking an oral answer -----

/** A grade for an oral answer: unprompted points count in full, prompted ones at PROMPTED_WORTH. */
export function mergeOral(first: Grade, followUp: Grade | null, keyPoints: string[]): Grade {
  if (!followUp) return first;
  const firstHit = new Set(first.covered);
  const prompted = followUp.covered.filter((p) => !firstHit.has(p) && keyPoints.includes(p));
  const promptedSet = new Set(prompted);
  const missing = keyPoints.filter((p) => !firstHit.has(p) && !promptedSet.has(p));
  const n = keyPoints.length || 1;
  const score = Math.min(1, (first.covered.length + PROMPTED_WORTH * prompted.length) / n);
  const feedback = prompted.length
    ? `${followUp.feedback} You got there with a nudge, so it counts for part marks: it will come back a little sooner.`
    : followUp.feedback || first.feedback;
  // Which engine marked it: the more powerful one, if either part went to the cloud.
  const engine = first.engine === 'cloud' || followUp.engine === 'cloud' ? 'cloud' : first.engine === 'on-device' || followUp.engine === 'on-device' ? 'on-device' : 'local';
  return { ...first, score, covered: first.covered, missing, prompted, feedback, engine };
}

/** The transcript of an oral answer as stored: what was said, the follow-up, what was added. */
export function oralTranscript(first: string, probe: string | null, second: string | null): string {
  if (!probe) return first.trim();
  return `${first.trim()}\n\nFollow-up: ${probe}\n${(second ?? '').trim() || '(no answer)'}`;
}

// ----- Where the voice loop runs -----

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
  /** For the question itself: it comes from the learner's material, not from their answer. */
  speakQuestion: Speak;
  /** For follow-ups and feedback, which are written from what the learner said. */
  speakReply: Speak;
  speakReason: string;
}

/**
 * Where each part of the voice loop runs. The learner's voice is the most personal thing in the
 * app, so it is heard on the device whenever Chrome can; it goes to the cloud only when it
 * cannot, never in private mode. Speech out is the reverse: the questions come from the
 * learner's own material, so a natural cloud voice reads them; what is said back is written
 * from their answers, so in private mode the device reads that.
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
  const speakReply: Speak = c.online && c.policy !== 'private' ? 'cloud' : 'device';
  const speakReason = !c.online
    ? 'This device’s voice (offline).'
    : c.policy === 'private'
      ? 'Gemini reads questions; this device reads replies (private mode).'
      : 'Gemini text-to-speech.';
  return { listen, listenReason, speakQuestion, speakReply, speakReason };
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
