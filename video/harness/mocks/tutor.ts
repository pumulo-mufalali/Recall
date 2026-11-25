// Stand-in for src/services/tutor.ts: streams scripted replies about the card on screen (memory B
// cells), on the device unless asked to go deeper.
const reply = (deeper: boolean) => deeper
  ? 'Going deeper: after vaccination, some B cells become long-lived memory B cells. On a second exposure they multiply fast and turn into plasma cells that release matching antibodies within days, instead of the week or two a first response takes.'
  : 'You said they remember the germ, and that is the heart of it. The part you left out is what they do next: on a second exposure they quickly make the right antibodies. Why do you think speed matters here?';
export async function tutorRoute(_s: unknown, policy: string, deeper: boolean) {
  if (deeper) return policy === 'private' ? { run: 'local', reason: 'Private mode: the conversation stays on this device.' } : { run: 'model', mode: 'only_in_cloud', chunks: 1, reason: 'A larger cloud model, given the conversation so far.' };
  return { run: 'model', mode: 'prefer_on_device', chunks: 1, reason: 'On this device: instant, and the conversation stays private.' };
}
export async function askTutor(_ctx: unknown, _h: unknown, _m: string, opts: { deeper: boolean; onText: (s: string) => void }) {
  await new Promise((r) => setTimeout(r, opts.deeper ? 900 : 350));
  const words = reply(opts.deeper).split(' ');
  let text = '';
  for (const w of words) { text += (text ? ' ' : '') + w; opts.onText(text); await new Promise((r) => setTimeout(r, 45)); }
  const r = await tutorRoute(null, 'balanced', opts.deeper);
  return { text, engine: opts.deeper ? 'cloud' : 'on-device', route: r };
}
