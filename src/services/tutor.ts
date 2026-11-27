/**
 * The tutor's calls: a Firebase AI Logic chat session, streamed, on whichever engine the router
 * picks. Each message starts a session seeded with the recent turns, so a conversation can move
 * between engines (Nano, then a larger cloud model when the learner asks to go deeper) without
 * losing its thread.
 */
import type { Policy } from '../core/audit';
import { isBusy } from '../core/busy';
import { route, type Mode, type Route } from '../core/route';
import { recentHistory, tutorSystem, type TutorCard, type TutorTurn } from '../core/tutor';
import type { Engine } from '../core/types';
import { INTERACTIVE_TIMEOUT_MS, Queued, TEXT_IO, build, checkers, cloudOrder, conditions, deviceModel, engineOf, restModel, writers } from './engine';
import type { Settings } from './firebase';

export interface TutorContext {
  card: TutorCard;
  /** What the learner answered, and the key points they missed. */
  said: string;
  missing: string[];
}

export interface TutorReply {
  text: string;
  engine: Engine;
  route: Route;
}

const model = (mode: Mode, reason: string): Route => ({ run: 'model', mode, chunks: 1, reason });

/**
 * Where the next reply would be written. `deeper` asks for the larger cloud model, which is only
 * possible online and outside Private mode. In Private mode the tutor stays on the device: it
 * never uses "prefer on device", which could quietly fall back to the cloud.
 */
export async function tutorRoute(settings: Settings, policy: Policy, deeper: boolean): Promise<Route> {
  const c = await conditions();
  if (deeper) {
    if (!c.online) return { run: 'local', reason: 'Going deeper needs a connection.' };
    if (policy === 'private') return { run: 'local', reason: 'Private mode: the conversation stays on this device.' };
    return model('only_in_cloud', 'A larger cloud model, given the conversation so far.');
  }
  const r = route({ kind: 'tutor' }, c, settings);
  if (r.run !== 'model' || policy !== 'private') return r;
  if (r.mode === 'only_in_cloud') return { run: 'local', reason: 'Private mode: the tutor needs the built-in AI on this device.' };
  return model('only_on_device', 'Private mode: written on this device, and the conversation stays here.');
}

/**
 * Sends a message and streams the reply: `onText` gets the reply so far as it grows. Resolves
 * with the whole reply and where it was written. If the cloud is busy and Nano is ready, the
 * reply comes from the device instead.
 */
export async function askTutor(
  ctx: TutorContext,
  history: TutorTurn[],
  message: string,
  opts: { deeper: boolean; settings: Settings; policy: Policy; onText: (soFar: string) => void },
): Promise<TutorReply> {
  const r = await tutorRoute(opts.settings, opts.policy, opts.deeper);
  if (r.run !== 'model') throw new Queued(r);

  const stream = async (mode: Mode, cloudModel: string, routeUsed: Route, onStart?: () => void): Promise<TutorReply> => {
    const short = mode === 'only_on_device' || mode === 'prefer_on_device';
    const chat = build(mode, tutorSystem(ctx.card, ctx.said, ctx.missing, short), null, TEXT_IO, cloudModel, INTERACTIVE_TIMEOUT_MS).startChat({
      history: recentHistory(history).map((t) => ({ role: t.role, parts: [{ type: 'text' as const, text: t.text }] })),
    });
    const result = await chat.sendMessageStream(message);
    let text = '';
    for await (const chunk of result.stream) {
      onStart?.();
      text += chunk.text();
      opts.onText(text);
    }
    const final = await result.response;
    return { text: text.trim() || final.text().trim(), engine: engineOf(final.inferenceSource), route: routeUsed };
  };

  // The cloud models in turn (busy ones last): a busy or slow one hands over to the next, as
  // long as it has not started replying.
  const models = cloudOrder(opts.deeper ? checkers(opts.settings) : writers(opts.settings));
  let last: unknown;
  let mode = r.mode;
  let used: Route = r;
  for (const cloudModel of models) {
    let started = false;
    try {
      return await stream(mode, cloudModel, used, () => (started = true));
    } catch (e) {
      if (started) throw e;
      // The safety net: the built-in AI failed before replying, so the cloud takes the
      // conversation (only where the learner's settings let it, and online).
      if (!isBusy(e) && mode === 'prefer_on_device' && navigator.onLine && (await deviceModel()) === 'available') {
        console.warn('[recall] the built-in AI failed; the cloud takes the conversation', e);
        mode = 'only_in_cloud';
        used = model('only_in_cloud', 'The built-in AI failed, so the cloud answered.');
        try {
          return await stream(mode, cloudModel, used, () => (started = true));
        } catch (e2) {
          if (started || !isBusy(e2)) throw e2;
          restModel(cloudModel);
          last = e2;
          continue;
        }
      }
      if (!isBusy(e)) throw e;
      restModel(cloudModel);
      last = e;
      if (r.mode === 'only_on_device') break;
    }
  }
  // A busy cloud: Nano answers instead, when it is ready and the learner did not ask for the cloud.
  if (!opts.deeper && r.mode !== 'only_on_device' && (await deviceModel()) === 'available') {
    opts.onText('');
    return stream('only_on_device', models[0], model('only_on_device', 'The cloud was busy, so this device answered.'));
  }
  throw last;
}
