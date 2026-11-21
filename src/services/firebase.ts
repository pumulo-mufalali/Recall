/**
 * Firebase, set up once: App Check first (Firebase AI Logic refuses calls without it), then
 * Authentication, Firestore with its offline cache (so studying works with no connection and
 * syncs on reconnect), Remote Config (routing limits, tunable without a release) and AI Logic.
 */
import { initializeApp } from 'firebase/app';
import { ReCaptchaEnterpriseProvider, initializeAppCheck } from 'firebase/app-check';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { fetchAndActivate, getRemoteConfig, getValue } from 'firebase/remote-config';
import { GoogleAIBackend, getAI } from 'firebase/ai';
import { DEFAULT_LIMITS, type Limits } from '../core/route';

// Either name works (see envPrefix in vite.config.ts).
const config = JSON.parse(import.meta.env.VITE_FIREBASE_CONFIG || import.meta.env.FIREBASE_CONFIG || '{}');
if (!config.apiKey) throw new Error('VITE_FIREBASE_CONFIG (or FIREBASE_CONFIG) is missing: copy .env.example to .env.local and fill it in.');

export const app = initializeApp(config);

// In development, App Check uses a debug token (printed in the console the first time; register
// it in the Firebase console). Production uses reCAPTCHA Enterprise.
if (import.meta.env.DEV) (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: boolean | string }).FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN || true;
export const appCheck = initializeAppCheck(app, {
  provider: new ReCaptchaEnterpriseProvider(import.meta.env.VITE_RECAPTCHA_ENTERPRISE_KEY || import.meta.env.RECAPTCHA_ENTERPRISE_KEY || 'unset'),
  isTokenAutoRefreshEnabled: true,
});

export const auth = getAuth(app);

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

export const ai = getAI(app, { backend: new GoogleAIBackend(), useLimitedUseAppCheckTokens: true });

const remote = getRemoteConfig(app);
remote.settings.minimumFetchIntervalMillis = import.meta.env.DEV ? 60_000 : 3_600_000;
remote.defaultConfig = {
  device_max_chars: DEFAULT_LIMITS.deviceMaxChars,
  device_max_image_bytes: DEFAULT_LIMITS.deviceMaxImageBytes,
  cloud_grading: DEFAULT_LIMITS.cloudGrading,
  cloud_model: 'gemini-3.5-flash-lite',
  check_model: 'gemini-3.8-flash',
  cloud_fallback_models: 'gemini-3.8-flash,gemini-4-hydrogen',
  new_cards_per_session: 10,
  tts_model: 'gemini-2.5-flash-preview-tts',
  tts_voice: 'Kore',
};

/** Routing limits and settings from Remote Config (defaults offline or before the first fetch). */
export interface Settings extends Limits {
  /** Writes cards and marks answers: fast and cheap. */
  cloudModel: string;
  /** Fact-checks cards and explains: a larger model than the writer. */
  checkModel: string;
  /** Tried in turn when a model is busy. */
  fallbackModels: string[];
  newPerSession: number;
  /** Reads questions aloud in an oral exam (a Gemini text-to-speech model). */
  ttsModel: string;
  /** One of its prebuilt voices. */
  ttsVoice: string;
}

export async function loadSettings(): Promise<Settings> {
  await fetchAndActivate(remote).catch(() => false); // offline: cached or default values
  return {
    deviceMaxChars: getValue(remote, 'device_max_chars').asNumber(),
    deviceMaxImageBytes: getValue(remote, 'device_max_image_bytes').asNumber(),
    cloudGrading: getValue(remote, 'cloud_grading').asBoolean(),
    cloudModel: getValue(remote, 'cloud_model').asString(),
    checkModel: getValue(remote, 'check_model').asString(),
    fallbackModels: getValue(remote, 'cloud_fallback_models').asString().split(',').map((m) => m.trim()).filter(Boolean),
    newPerSession: getValue(remote, 'new_cards_per_session').asNumber(),
    ttsModel: getValue(remote, 'tts_model').asString(),
    ttsVoice: getValue(remote, 'tts_voice').asString(),
  };
}
