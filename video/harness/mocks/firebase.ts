// Stand-in for src/services/firebase.ts: no Firebase at all; default settings.
import { DEFAULT_LIMITS } from '../../../src/core/route';

export const app = {};
export const appCheck = {};
export const auth = {};
export const db = {};
export const ai = {};

export async function loadSettings() {
  return {
    ...DEFAULT_LIMITS,
    cloudModel: 'gemini-3.5-flash-lite',
    checkModel: 'gemini-3.8-flash',
    fallbackModels: ['gemini-3.8-flash'],
    newPerSession: 10,
    ttsModel: 'gemini-3.8-flash-tts',
    ttsVoice: 'Sulafat',
  };
}
