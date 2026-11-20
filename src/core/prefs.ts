/**
 * Study preferences the learner sets in Settings. They are saved to their account, so they
 * follow them between devices. (Appearance and privacy mode are per device; see theme.ts,
 * textSize.ts and usePolicy.ts.)
 */
export interface StudyPrefs {
  /** New cards introduced per session; null uses the app's default (Remote Config). */
  newPerSession: number | null;
  /** Default length for a planned session, in minutes. */
  sessionMinutes: number;
  /** Default reminder for a planned session, in minutes before; 0 for none. */
  remind: number;
}

export const DEFAULT_STUDY_PREFS: StudyPrefs = { newPerSession: null, sessionMinutes: 25, remind: 10 };

export const NEW_CARD_OPTIONS = [5, 10, 15, 20, 30] as const;
