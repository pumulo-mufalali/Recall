/**
 * "Talk it through": a conversation with the tutor about a card the learner missed. Replies
 * stream in as they are written, each marked with where it ran; "Ask a bigger model" hands the
 * conversation so far to a larger cloud model.
 */
import { useEffect, useRef, useState } from 'react';
import type { Policy } from '../core/audit';
import { friendly, type Friendly } from '../core/errors';
import type { Route } from '../core/route';
import { TUTOR_STARTERS, type TutorTurn } from '../core/tutor';
import { Queued } from '../services/engine';
import type { Settings } from '../services/firebase';
import { askTutor, tutorRoute, type TutorContext } from '../services/tutor';
import { EngineBadge } from './EngineBadge';
import { ErrorNote } from './ErrorNote';
import { Icon } from './Icon';

const DEEPER_ASK = 'Explain that in more depth, please.';

export function Tutor({ ctx, settings, policy }: { ctx: TutorContext; settings: Settings; policy: Policy }) {
  const [turns, setTurns] = useState<TutorTurn[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<{ text: string; deeper: boolean } | null>(null);
  const [error, setError] = useState<{ friendly: Friendly; retry: () => void } | null>(null);
  const [blocked, setBlocked] = useState('');
  const [deeperRoute, setDeeperRoute] = useState<Route | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Whether going deeper (a bigger model) is possible right now.
  useEffect(() => {
    void tutorRoute(settings, policy, true).then(setDeeperRoute);
  }, [settings, policy, turns.length]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [turns, pending]);

  const send = async (message: string, deeper = false) => {
    const text = message.trim();
    if (!text || pending) return;
    const history = turns;
    // A "go deeper" request is marked by its flag (not by its words), so typing "Go deeper" is just a message.
    const withQuestion: TutorTurn[] = [...history, { role: 'user', text, ...(deeper ? { deeper: true } : {}) }];
    setTurns(withQuestion);
    setDraft('');
    setError(null);
    setBlocked('');
    setPending({ text: '', deeper });
    try {
      const reply = await askTutor(ctx, history, text, {
        deeper,
        settings,
        policy,
        onText: (soFar) => setPending({ text: soFar, deeper }),
      });
      if (!reply.text) throw new Error('The tutor did not reply. Try asking again.');
      setTurns([...withQuestion, { role: 'model', text: reply.text, engine: reply.engine, deeper }]);
    } catch (e) {
      setTurns(history);
      // Give back what the learner typed, so a failed send does not lose it.
      if (!deeper) setDraft((d) => d || text);
      if (e instanceof Queued) setBlocked(e.route.reason);
      else {
        console.error('[recall] tutor failed', e);
        setError({ friendly: friendly(e), retry: () => void send(text, deeper) });
      }
    } finally {
      setPending(null);
      inputRef.current?.focus();
    }
  };

  const canDeepen = deeperRoute?.run === 'model' && turns.some((t) => t.role === 'model');

  return (
    <section className="tutor" aria-label="Talk it through with the tutor">
      <div className="tutor-head">
        <h3><Icon name="chat" size={18} /> Talk it through</h3>
      </div>

      <div className="tutor-log" ref={logRef} aria-live="polite">
        {turns.length === 0 && !pending && (
          <div className="tutor-starters">
            <p className="muted small">Ask anything about this card. The tutor knows the answer, and what you missed.</p>
            <div className="tutor-chips">
              {TUTOR_STARTERS.map((s) => (
                <button key={s} className="btn sm" onClick={() => void send(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {turns.map((t, i) =>
          t.role === 'user' ? (
            t.deeper ? (
              <p key={i} className="tutor-handoff"><Icon name="cloud" size={14} /> A bigger model takes over, with your conversation so far</p>
            ) : (
              <p key={i} className="tutor-msg mine">{t.text}</p>
            )
          ) : (
            <div key={i} className="tutor-msg theirs">
              <p>{t.text}</p>
              {t.engine && <EngineBadge engine={t.engine} />}
            </div>
          ),
        )}
        {pending && (
          <div className="tutor-msg theirs writing">
            <p>{pending.text || <span className="tutor-dots" aria-label="Writing"><span /><span /><span /></span>}</p>
          </div>
        )}
      </div>

      {blocked && <p className="muted small tutor-blocked"><Icon name="clock" size={14} /> {blocked}</p>}
      {error && <ErrorNote error={error.friendly} onRetry={error.retry} />}

      <form
        className="tutor-form"
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
      >
        <input ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask the tutor…" aria-label="Your message to the tutor" disabled={!!pending} />
        <button className="btn primary" type="submit" disabled={!draft.trim() || !!pending} aria-label="Send">
          <Icon name="arrow" size={18} />
        </button>
      </form>
      {turns.some((t) => t.role === 'model') && (
        <button
          className="btn sm ghost tutor-deeper"
          onClick={() => void send(DEEPER_ASK, true)}
          disabled={!canDeepen || !!pending}
          title={deeperRoute?.run === 'model' ? 'A bigger model answers, with your conversation so far' : deeperRoute?.reason}
        >
          <Icon name="cloud" size={15} /> Ask a bigger model
          {!canDeepen && deeperRoute && deeperRoute.run !== 'model' && <span className="muted small"> · {deeperRoute.reason}</span>}
        </button>
      )}
    </section>
  );
}
