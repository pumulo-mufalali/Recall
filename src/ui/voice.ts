/**
 * The browser side of speech in a study session: speaking (Gemini's voice through Firebase AI Logic, or the
 * device's own speech synthesis) and listening (Chrome's on-device speech recognition, or a
 * recording that Gemini transcribes when the device cannot), with a live microphone level.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { cachedSpeech, speechStream, transcribe } from '../services/engine';
import type { Settings } from '../services/firebase';
import { downsample, floatToPcm16, pcmToWav, type Listen, type Speak } from '../core/speech';

// ----- Speech recognition (typed loosely: not in TypeScript's DOM library everywhere) -----

interface Recognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  processLocally?: boolean;
  start(): void;
  stop(): void;
  abort(): void;
}
interface RecognitionStatic {
  new (): Recognition;
  available?(o: { langs: string[]; processLocally: boolean }): Promise<'available' | 'downloadable' | 'downloading' | 'unavailable'>;
  install?(o: { langs: string[]; processLocally: boolean }): Promise<boolean>;
}
interface RecognitionResultEvent extends Event {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

const LANG = 'en-US';
const Recognizer = (): RecognitionStatic | undefined => {
  const w = globalThis as unknown as { SpeechRecognition?: RecognitionStatic; webkitSpeechRecognition?: RecognitionStatic };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};

export type SpeechOnDevice = 'available' | 'downloadable' | 'downloading' | 'unavailable';

/** Whether Chrome can turn speech into text on this device, without sending audio anywhere. */
export async function speechOnDevice(): Promise<SpeechOnDevice> {
  const R = Recognizer();
  if (!R?.available) return 'unavailable';
  try {
    return await R.available({ langs: [LANG], processLocally: true });
  } catch {
    return 'unavailable';
  }
}

/** Downloads Chrome's on-device speech model for English (small; must follow a click). */
export async function installSpeechOnDevice(): Promise<boolean> {
  try {
    return (await Recognizer()?.install?.({ langs: [LANG], processLocally: true })) ?? false;
  } catch {
    return false;
  }
}

export const canRecord = () => typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

// ----- Speaking -----

let playing: HTMLAudioElement | null = null;
let streaming: AudioContext | null = null;
/** Each call to say() takes a turn: a newer one, or hush(), ends an older one. */
let turn = 0;

/** Stops whatever is being read aloud (and any reading still on its way). */
export function hush(): void {
  turn++;
  playing?.pause();
  playing = null;
  void streaming?.close().catch(() => {});
  streaming = null;
  if ('speechSynthesis' in globalThis) speechSynthesis.cancel();
}

/**
 * Reads text aloud: Gemini's voice when asked and reachable (streamed, so it starts in about a
 * second), else the device's most natural one. `onStart` runs when the sound begins. Resolves
 * with the voice that read it, once it has finished or was stopped; null if it never played.
 */
export async function say(text: string, voice: Speak, settings: Settings, onStart?: () => void): Promise<Speak | null> {
  hush();
  const mine = ++turn;
  if (voice === 'cloud') {
    const cached = cachedSpeech(text, settings);
    if (cached) {
      await playBlob(cached, onStart);
      return 'cloud';
    }
    try {
      if (await playStream(text, settings, () => mine === turn, onStart)) return 'cloud';
    } catch (e) {
      console.warn('[recall] cloud voice unavailable; using the device voice', e);
    }
    if (mine !== turn) return null;
  }
  if (!('speechSynthesis' in globalThis)) return null;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = LANG;
  u.voice = deviceVoice(navigator.onLine);
  await new Promise<void>((done) => {
    u.onstart = () => onStart?.();
    u.onend = u.onerror = () => done();
    speechSynthesis.speak(u);
  });
  return 'device';
}

/** Plays a finished reading. */
async function playBlob(wav: Blob, onStart?: () => void): Promise<void> {
  const url = URL.createObjectURL(wav);
  const audio = new Audio(url);
  playing = audio;
  await new Promise<void>((done) => {
    audio.onended = audio.onpause = audio.onerror = () => done();
    audio.onplaying = () => onStart?.();
    audio.play().catch(() => done());
  });
  URL.revokeObjectURL(url);
}

/**
 * Plays Gemini's reading as it streams in: each PCM chunk is scheduled right after the one
 * before, with a short lead so a late chunk does not leave a gap. Resolves true once it has
 * played (or was stopped after starting), false if no audio ever came; throws if none could.
 */
async function playStream(text: string, settings: Settings, current: () => boolean, onStart?: () => void): Promise<boolean> {
  const ctx = new AudioContext();
  streaming = ctx;
  const closed = new Promise<void>((done) => (ctx.onstatechange = () => ctx.state === 'closed' && done()));
  let at = 0;
  let ended: Promise<void> = Promise.resolve();
  let carry: Uint8Array | null = null; // a byte left over when a chunk splits a sample
  try {
    for await (const { pcm, rate } of speechStream(text, settings)) {
      if (!current()) return at > 0;
      const bytes: Uint8Array = carry ? concatBytes(carry, pcm) : pcm;
      const even = bytes.length - (bytes.length % 2);
      carry = even < bytes.length ? bytes.slice(even) : null;
      if (!even) continue;
      const buffer = ctx.createBuffer(1, even / 2, rate);
      const samples = buffer.getChannelData(0);
      const view = new DataView(bytes.buffer, bytes.byteOffset, even);
      for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 32768;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      if (!at) {
        await ctx.resume();
        at = ctx.currentTime + 0.12;
        onStart?.();
      }
      at = Math.max(at, ctx.currentTime + 0.03);
      source.start(at);
      at += buffer.duration;
      ended = new Promise<void>((done) => (source.onended = () => done()));
    }
    if (at && current()) await Promise.race([ended, closed]);
    return at > 0;
  } finally {
    if (streaming === ctx) streaming = null;
    void ctx.close().catch(() => {});
  }
}

const concatBytes = (a: Uint8Array, b: Uint8Array) => {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
};

/**
 * The most natural English voice the browser has. Neural voices (Edge's "Online (Natural)",
 * Chrome's "Google" voices, Apple's enhanced and premium ones) sound far less robotic than the
 * system defaults; the online ones need a connection, so offline only voices on the device count.
 */
function deviceVoice(online: boolean): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en') && (online || v.localService));
  const rank = (v: SpeechSynthesisVoice) =>
    (/natural|neural|premium|enhanced/i.test(v.name) ? 4 : 0) + (/^google/i.test(v.name) ? 2 : 0) + (v.lang === LANG ? 1 : 0);
  return voices.sort((a, b) => rank(b) - rank(a))[0] ?? null;
}

// ----- Listening -----

export type MicState = 'idle' | 'listening' | 'transcribing' | 'error';

export interface Mic {
  state: MicState;
  /** What has been heard so far (live with on-device recognition). */
  text: string;
  /** Microphone loudness, 0..1, for the meter. */
  level: number;
  /** Seconds since listening began. */
  seconds: number;
  error: string | null;
  start: () => Promise<void>;
  /** Stops listening and resolves with the full transcript. */
  stop: () => Promise<string>;
  cancel: () => void;
}

/**
 * The microphone, heard the way the voice plan says: on the device (live transcript), or
 * recorded and transcribed by Gemini when the learner stops.
 */
export function useMic(listen: Listen, settings: Settings): Mic {
  const [state, setState] = useState<MicState>('idle');
  const [text, setText] = useState('');
  const [level, setLevel] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const live = useRef<{ stream?: MediaStream; ctx?: AudioContext; raf?: number; timer?: number; rec?: Recognition; recorder?: MediaRecorder; chunks: Blob[]; finals: string; ended?: Promise<void> } | null>(null);

  const release = useCallback(() => {
    const l = live.current;
    if (!l) return;
    if (l.raf) cancelAnimationFrame(l.raf);
    if (l.timer) clearInterval(l.timer);
    l.stream?.getTracks().forEach((t) => t.stop());
    void l.ctx?.close().catch(() => {});
    setLevel(0);
  }, []);

  const cancel = useCallback(() => {
    live.current?.rec?.abort();
    if (live.current?.recorder?.state === 'recording') live.current.recorder.stop();
    release();
    live.current = null;
    setState('idle');
  }, [release]);

  useEffect(() => cancel, [cancel]);

  const start = useCallback(async () => {
    if (listen === 'type') return;
    setError(null);
    setText('');
    setSeconds(0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const l: NonNullable<typeof live.current> = { stream, chunks: [], finals: '' };
      live.current = l;

      // The meter: loudness from an analyser, a few times a second.
      const ctx = new AudioContext();
      l.ctx = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      let lastPaint = 0;
      const tick = (t: number) => {
        if (t - lastPaint > 60) {
          analyser.getFloatTimeDomainData(buf);
          const rms = Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length);
          setLevel(Math.min(1, rms * 6));
          lastPaint = t;
        }
        l.raf = requestAnimationFrame(tick);
      };
      l.raf = requestAnimationFrame(tick);
      const began = Date.now();
      l.timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - began) / 1000)), 250);

      if (listen === 'device') {
        const R = Recognizer()!;
        const rec = new R();
        rec.lang = LANG;
        rec.continuous = true;
        rec.interimResults = true;
        rec.processLocally = true;
        l.rec = rec;
        rec.addEventListener('result', (ev) => {
          const e = ev as RecognitionResultEvent;
          let interim = '';
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const r = e.results[i];
            if (r.isFinal) l.finals += `${r[0].transcript.trim()} `;
            else interim += r[0].transcript;
          }
          setText(`${l.finals}${interim}`.trim());
        });
        rec.addEventListener('error', (ev) => {
          const code = (ev as Event & { error?: string }).error;
          if (code !== 'no-speech' && code !== 'aborted') setError(code === 'not-allowed' ? 'Microphone access was refused.' : 'Speech recognition stopped. Try again, or type.');
        });
        l.ended = new Promise((done) => rec.addEventListener('end', () => done(), { once: true }));
        rec.start();
      } else {
        const recorder = new MediaRecorder(stream);
        l.recorder = recorder;
        recorder.ondataavailable = (e) => e.data.size && l.chunks.push(e.data);
        l.ended = new Promise((done) => (recorder.onstop = () => done()));
        recorder.start();
      }
      setState('listening');
    } catch (e) {
      release();
      live.current = null;
      setState('error');
      setError((e as DOMException)?.name === 'NotAllowedError' ? 'Microphone access was refused: allow it in the address bar, or type your answer.' : 'The microphone could not start: type your answer instead.');
    }
  }, [listen, release]);

  const stop = useCallback(async (): Promise<string> => {
    const l = live.current;
    if (!l) return text;
    if (l.rec) {
      l.rec.stop();
      await Promise.race([l.ended, new Promise((r) => setTimeout(r, 1500))]);
      release();
      live.current = null;
      setState('idle');
      const heard = l.finals.trim() || text;
      setText(heard);
      return heard;
    }
    // Recorded: stop, turn it into 16 kHz WAV, and have Gemini write it down.
    if (l.recorder?.state === 'recording') l.recorder.stop();
    await l.ended;
    release();
    live.current = null;
    setState('transcribing');
    try {
      const wav = await toWav(new Blob(l.chunks, { type: l.recorder?.mimeType || 'audio/webm' }));
      const heard = await transcribe(wav, settings);
      setText(heard);
      setState('idle');
      return heard;
    } catch (e) {
      console.warn('[recall] transcription failed', e);
      setError('The recording could not be transcribed: type your answer instead.');
      setState('error');
      return '';
    }
  }, [release, settings, text]);

  return { state, text, level, seconds, error, start, stop, cancel };
}

/** Any recording the browser can decode, as 16 kHz mono 16-bit WAV (small, and Gemini reads it). */
async function toWav(recording: Blob): Promise<Blob> {
  const ctx = new AudioContext();
  try {
    const audio = await ctx.decodeAudioData(await recording.arrayBuffer());
    const mono = new Float32Array(audio.length);
    for (let ch = 0; ch < audio.numberOfChannels; ch++) {
      const data = audio.getChannelData(ch);
      for (let i = 0; i < data.length; i++) mono[i] += data[i] / audio.numberOfChannels;
    }
    const rate = 16_000;
    return new Blob([pcmToWav(floatToPcm16(downsample(mono, audio.sampleRate, rate)), rate)], { type: 'audio/wav' });
  } finally {
    void ctx.close();
  }
}
