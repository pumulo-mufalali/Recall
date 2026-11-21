/**
 * Where each piece of AI work runs. Recall uses two models as a team:
 * - Gemini Nano, on the device (Chrome's built-in model): instant, free, private, offline;
 *   text and JPEG/PNG input, single turn, structured output, about 9,000 tokens in all;
 * - Gemini in the cloud: bigger, multi-turn, any file type, but needs a connection.
 *
 * The rule of thumb: what happens often and touches the learner's own words (marking every
 * answer) stays on the device; what is rare and heavy (turning a long chapter or a PDF into
 * questions, a full explanation) goes to the cloud. Every decision carries its reason, shown
 * in the app, so the learner (and anyone judging) can see why each engine was chosen.
 *
 * Pure: the caller passes in what is known about the device and the connection.
 */

/** Firebase AI Logic's inference modes (same string values as `InferenceMode`). */
export type Mode = 'prefer_on_device' | 'only_on_device' | 'prefer_in_cloud' | 'only_in_cloud';

/** Chrome's answer to "can the on-device model run here?" (LanguageModel.availability()). */
export type DeviceModel = 'available' | 'downloading' | 'downloadable' | 'unavailable';

export interface Conditions {
  online: boolean;
  device: DeviceModel;
}

/** Tunable from Remote Config without a release. */
export interface Limits {
  /** Largest source text (characters) sent to the on-device model in one request. */
  deviceMaxChars: number;
  /** Largest image (bytes) sent to the on-device model. */
  deviceMaxImageBytes: number;
  /** Whether learner answers may ever be marked in the cloud (privacy switch). */
  cloudGrading: boolean;
}

export const DEFAULT_LIMITS: Limits = { deviceMaxChars: 12000, deviceMaxImageBytes: 4_000_000, cloudGrading: true };

export type Task =
  | { kind: 'grade'; chars: number }
  | { kind: 'generate'; source: 'text'; chars: number }
  | { kind: 'generate'; source: 'image'; mime: string; bytes: number }
  | { kind: 'generate'; source: 'pdf'; bytes: number }
  | { kind: 'explain' }
  /** An oral exam's follow-up question, written from what the learner said. */
  | { kind: 'probe' }
  /** Reading a question aloud in an oral exam. */
  | { kind: 'speak' }
  /** Fact-checking cards against the material they came from. */
  | { kind: 'verify'; source: 'text'; chars: number }
  | { kind: 'verify'; source: 'image'; mime: string; bytes: number }
  | { kind: 'verify'; source: 'pdf'; bytes: number };

export type Route =
  /** Run through Firebase AI Logic in this mode. `chunks` > 1: split the source first. */
  | { run: 'model'; mode: Mode; chunks: number; reason: string }
  /** Recall's own keyword marker: no model available, but the learner keeps studying. */
  | { run: 'local'; reason: string }
  /** Cannot run now: keep it and run when back online. */
  | { run: 'queue'; reason: string };

/** The device model counts once it is ready; a download in progress is not ready yet. */
const ready = (c: Conditions) => c.device === 'available';

export function route(task: Task, c: Conditions, limits: Limits = DEFAULT_LIMITS): Route {
  switch (task.kind) {
    case 'grade':
      if (ready(c)) return model('prefer_on_device', 'Marked on this device: instant, and your answer stays private.');
      if (c.online && limits.cloudGrading) return model('only_in_cloud', 'This device has no built-in model, so the cloud marks it.');
      return { run: 'local', reason: c.online ? 'Cloud marking is off: marked by matching key points.' : 'Offline with no built-in model: marked by matching key points.' };

    case 'generate':
      if (task.source === 'pdf') {
        return c.online
          ? model('only_in_cloud', 'PDFs need the cloud model.')
          : { run: 'queue', reason: 'PDFs need the cloud: queued until you are back online.' };
      }
      if (task.source === 'image') {
        const fits = (task.mime === 'image/jpeg' || task.mime === 'image/png') && task.bytes <= limits.deviceMaxImageBytes;
        if (fits && ready(c)) return model(c.online ? 'prefer_on_device' : 'only_on_device', 'Read on this device.');
        if (c.online) return model('only_in_cloud', fits ? 'This device has no built-in model: read in the cloud.' : 'This image is too large or not JPEG/PNG: read in the cloud.');
        return { run: 'queue', reason: 'Offline, and this image cannot be read on this device: queued.' };
      }
      // Text: short goes to the device; long goes to the cloud, or, offline, is split into
      // pieces the device can take one at a time.
      if (task.chars <= limits.deviceMaxChars && ready(c)) return model(c.online ? 'prefer_on_device' : 'only_on_device', 'Short enough for this device.');
      if (c.online) return model('prefer_in_cloud', task.chars > limits.deviceMaxChars ? 'Long material: the cloud model sees it whole.' : 'This device has no built-in model: made in the cloud.');
      if (ready(c)) {
        const chunks = Math.ceil(task.chars / limits.deviceMaxChars);
        return { run: 'model', mode: 'only_on_device', chunks, reason: `Offline: split into ${chunks} parts this device can read one by one.` };
      }
      return { run: 'queue', reason: 'Offline with no built-in model: queued until you are back online.' };

    case 'verify':
      // Online, a second and larger model checks the cards: "the small model writes, the big
      // one checks". Offline, the device checks what it can read; the rest waits.
      if (c.online) return model('prefer_in_cloud', 'Fact-checked by the cloud model, a second and larger model.');
      if (ready(c)) {
        if (task.source === 'text') {
          const chunks = Math.ceil(task.chars / limits.deviceMaxChars);
          return { run: 'model', mode: 'only_on_device', chunks, reason: chunks > 1 ? `Offline: fact-checked on this device, part by part (${chunks}).` : 'Offline: fact-checked on this device.' };
        }
        if (task.source === 'image' && (task.mime === 'image/jpeg' || task.mime === 'image/png') && task.bytes <= limits.deviceMaxImageBytes) {
          return model('only_on_device', 'Offline: fact-checked on this device.');
        }
      }
      return { run: 'queue', reason: 'Not fact-checked yet: that needs a connection.' };

    case 'probe':
      // Written from the learner's own words, so like marking it stays on the device if it can.
      if (ready(c)) return model('only_on_device', 'Written on this device from what you said: it stays private.');
      if (c.online && limits.cloudGrading) return model('only_in_cloud', 'This device has no built-in model, so the cloud writes the follow-up.');
      return { run: 'local', reason: 'An open follow-up that needs no model.' };

    case 'speak':
      if (c.online) return model('only_in_cloud', 'Read aloud by Gemini’s text-to-speech voice.');
      return { run: 'local', reason: 'Offline: this device’s own voice reads it.' };

    case 'explain':
      if (c.online) return model('prefer_in_cloud', 'A full explanation from the cloud model.');
      if (ready(c)) return model('only_on_device', 'Offline: a short explanation from this device.');
      return { run: 'queue', reason: 'Offline: the explanation will come when you reconnect.' };
  }
}

function model(mode: Mode, reason: string): Route {
  return { run: 'model', mode, chunks: 1, reason };
}

/**
 * Splits text into at most `max`-character pieces at paragraph, then sentence, boundaries,
 * so no idea is cut in half.
 */
export function chunkText(text: string, max: number): string[] {
  const pieces: string[] = [];
  let current = '';
  const push = () => {
    if (current.trim()) pieces.push(current.trim());
    current = '';
  };
  for (const paragraph of text.split(/\n\s*\n/)) {
    const units = paragraph.length <= max ? [paragraph] : paragraph.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [paragraph];
    for (let unit of units) {
      while (unit.length > max) {
        push();
        pieces.push(unit.slice(0, max).trim());
        unit = unit.slice(max);
      }
      if (current.length + unit.length + 2 > max) push();
      current += (current ? '\n\n' : '') + unit;
    }
  }
  push();
  return pieces;
}
