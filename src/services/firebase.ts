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

const config = JSON.parse(import.meta.env.VITE_FIREBASE_CONFIG ?? '{}');
if (!config.apiKey) throw new Error('VITE_FIREBASE_CONFIG is missing: copy .env.example to .env.local and fill it in.');

export const app = initializeApp(config);

// In development, App Check uses a debug token (printed in the console the first time; register
// it in the Firebase console). Production uses reCAPTCHA Enterprise.
if (import.meta.env.DEV) (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: boolean | string }).FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN || true;
export const appCheck = initializeAppCheck(app, {
  provider: new ReCaptchaEnterpriseProvider(import.meta.env.VITE_RECAPTCHA_ENTERPRISE_KEY ?? 'unset'),
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
  new_cards_per_session: 10,
};

/** Routing limits and settings from Remote Config (defaults offline or before the first fetch). */
export interface Settings extends Limits {
  cloudModel: string;
  newPerSession: number;
}

export async function loadSettings(): Promise<Settings> {
  await fetchAndActivate(remote).catch(() => false); // offline: cached or default values
  return {
    deviceMaxChars: getValue(remote, 'device_max_chars').asNumber(),
    deviceMaxImageBytes: getValue(remote, 'device_max_image_bytes').asNumber(),
    cloudGrading: getValue(remote, 'cloud_grading').asBoolean(),
    cloudModel: getValue(remote, 'cloud_model').asString(),
    newPerSession: getValue(remote, 'new_cards_per_session').asNumber(),
  };
}
