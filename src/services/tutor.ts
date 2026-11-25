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
import { Queued, TEXT_IO, build, conditions, deviceModel, engineOf, writers } from './engine';
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

  const stream = async (mode: Mode, cloudModel: string, routeUsed: Route): Promise<TutorReply> => {
    const short = mode === 'only_on_device' || mode === 'prefer_on_device';
    const chat = build(mode, tutorSystem(ctx.card, ctx.said, ctx.missing, short), null, TEXT_IO, cloudModel).startChat({
      history: recentHistory(history).map((t) => ({ role: t.role, parts: [{ type: 'text' as const, text: t.text }] })),
    });
    const result = await chat.sendMessageStream(message);
    let text = '';
    for await (const chunk of result.stream) {
      text += chunk.text();
      opts.onText(text);
    }
    const final = await result.response;
    return { text: text.trim() || final.text().trim(), engine: engineOf(final.inferenceSource), route: routeUsed };
  };

  const cloudModel = opts.deeper ? opts.settings.checkModel : writers(opts.settings)[0];
  try {
    return await stream(r.mode, cloudModel, r);
  } catch (e) {
    // A busy cloud: Nano answers instead, when it is ready and the learner did not ask for the cloud.
    if (!opts.deeper && isBusy(e) && r.mode !== 'only_on_device' && (await deviceModel()) === 'available') {
      opts.onText('');
      return stream('only_on_device', cloudModel, model('only_on_device', 'The cloud was busy, so this device answered.'));
    }
    throw e;
  }
}
