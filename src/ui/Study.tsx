/**
 * A study session: for each due card, write an answer in your own words, say how sure you are
 * (before seeing anything), then see the marking: what you covered, what you missed, the model
 * answer, and which engine marked it. Committing to a confidence first is the point: it turns
 * every card into a small, honest check of what you actually know.
 *
 * Keyboard: 1–4 pick a confidence, Ctrl/Cmd+Enter checks, Enter goes to the next card, Esc leaves.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { CONFIDENCE_CLAIM, CONFIDENCE_LABEL, type Attempt, type Card, type Confidence, type Deck } from '../core/types';
import { RIGHT } from '../core/calibration';
import type { Route } from '../core/route';
import { Queued, explain, grade, type Hybrid, type Marked, type Outcome } from '../services/engine';
import type { Settings } from '../services/firebase';
import { recordAnswer, recordAudit, reviseAnswer } from '../services/store';
import { agrees } from '../core/audit';
import { EngineBadge } from './EngineBadge';
import { ErrorNote } from './ErrorNote';
import { Icon } from './Icon';
import { Ring } from './charts';
import { friendly, type Friendly } from '../core/errors';

interface Props {
  uid: string;
  cards: Card[];
  decks: Deck[];
  settings: Settings;
  hybrid: Hybrid;
  onDone: () => void;
}

export function Study({ uid, cards, decks, settings, hybrid, onDone }: Props) {
  // The session's cards are fixed when it starts; answering reschedules them underneath.
  const [session] = useState(cards);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<{ card: Card; attempt: Attempt }[]>([]);
  const card = session[index];
  const deckName = new Map(decks.map((d) => [d.id, d.title]));

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('dialog[open]') && onDone();
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, [onDone]);

  const done = !card;
  return (
    <div className="study">
      <header className="study-top">
        <button className="icon-btn" onClick={onDone} aria-label="End session" title="End session (Esc)"><Icon name="x" /></button>
        <div className="study-progress" role="progressbar" aria-valuemin={0} aria-valuemax={session.length} aria-valuenow={results.length}>
          <span style={{ width: `${session.length ? (results.length / session.length) * 100 : 0}%` }} />
        </div>
        <span className="study-count small muted">{done ? session.length : index + 1} / {session.length}</span>
      </header>

      {!session.length ? (
        <div className="study-body center">
          <span className="empty-icon"><Icon name="check" size={30} /></span>
          <h2>Nothing due</h2>
          <p className="muted">You are up to date. Cards come back just before you would forget them.</p>
          <button className="btn primary" onClick={onDone}>Back</button>
        </div>
      ) : done ? (
        <Summary results={results} onDone={onDone} />
      ) : (
        <CardView
          key={card.id}
          uid={uid}
          card={card}
          deck={deckName.get(card.deckId)}
          settings={settings}
          hybrid={hybrid}
          last={index === session.length - 1}
          onAnswered={(attempt) => setResults((r) => [...r, { card, attempt }])}
          onRevised={(attempt) => setResults((r) => r.map((x) => (x.attempt.id === attempt.id ? { ...x, attempt } : x)))}
          onNext={() => setIndex((i) => i + 1)}
        />
      )}
    </div>
  );
}

function CardView({ uid, card, deck, settings, hybrid, last, onAnswered, onRevised, onNext }: {
  uid: string;
  card: Card;
  deck?: string;
  settings: Settings;
  hybrid: Hybrid;
  last: boolean;
  onAnswered: (a: Attempt) => void;
  onRevised: (a: Attempt) => void;
  onNext: () => void;
}) {
  const [answer, setAnswer] = useState('');
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [marking, setMarking] = useState(false);
  const [result, setResult] = useState<{ attempt: Attempt; route: Route; marked: Marked } | null>(null);
  /** The background spot-check: running, its verdict, or none. */
  const [second, setSecond] = useState<'running' | { agree: boolean; nano: number; cloud: number } | null>(null);
  const [help, setHelp] = useState<Outcome<string> | { queued: string } | { failed: Friendly } | null>(null);
  const [explaining, setExplaining] = useState(false);
  const nextRef = useRef<HTMLButtonElement>(null);

  const check = async () => {
    if (!confidence || !answer.trim() || marking) return;
    setMarking(true);
    const marked = await grade(card.prompt, card.keyPoints, answer, settings, hybrid);
    const attempt = recordAnswer(uid, card, answer, confidence, marked.value);
    onAnswered(attempt);
    setResult({ attempt, route: marked.route, marked });
    setMarking(false);

    const doubtValue = marked.doubt?.value ?? 0;
    const check = marked.value.check;
    if (check) recordAudit(uid, { cardId: card.id, nano: check.nano, cloud: check.cloud, agree: check.agree, doubt: doubtValue, kind: 'escalated' });

    // A spot-check: Nano's mark stands now; if the larger cloud model disagrees, its mark
    // replaces Nano's and the card is rescheduled. Either way, the result trains Nano's trust.
    if (marked.secondOpinion) {
      setSecond('running');
      const cloud = await marked.secondOpinion;
      if (!cloud) return setSecond(null);
      const nano = marked.value.score;
      const agree = agrees(nano, cloud.score);
      recordAudit(uid, { cardId: card.id, nano, cloud: cloud.score, agree, doubt: doubtValue, kind: 'spot-check' });
      setSecond({ agree, nano, cloud: cloud.score });
      if (!agree) {
        const revised: Attempt = { ...attempt, grade: { ...cloud, check: { kind: 'spot-check', nano, cloud: cloud.score, agree } } };
        reviseAnswer(uid, card, attempt, revised.grade);
        onRevised(revised);
        setResult((r) => (r ? { ...r, attempt: revised } : r));
      }
    }
  };

  const askWhy = async () => {
    setExplaining(true);
    try {
      setHelp(await explain(card.prompt, card.answer, result?.attempt.grade.missing ?? [], settings));
    } catch (e) {
      if (e instanceof Queued) setHelp({ queued: e.message });
      else {
        console.error('[recall] explaining failed', e);
        setHelp({ failed: friendly(e) });
      }
    } finally {
      setExplaining(false);
    }
  };

  useEffect(() => {
    if (result) nextRef.current?.focus();
  }, [result]);

  // Shortcuts: 1–4 for confidence (when not typing), Ctrl/Cmd+Enter to check.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (result) return;
      const typing = (e.target as HTMLElement)?.tagName === 'TEXTAREA';
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        check();
      } else if (!typing && ['1', '2', '3', '4'].includes(e.key)) setConfidence(Number(e.key) as Confidence);
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  });

  const g = result?.attempt.grade;
  const confidentMiss = g && confidence === 4 && g.score < RIGHT;
  const luckyGuess = g && confidence === 1 && g.score >= RIGHT;
  const tone = g ? (g.score >= RIGHT ? 'good' : g.score >= 0.4 ? 'mid' : 'low') : '';

  return (
    <div className="study-body">
      <div className="qcard">
        {deck && <p className="eyebrow">{deck}</p>}
        <h1 className="question">{card.prompt}</h1>
      </div>

      {!result && (
        <div className="answer-area">
          <textarea
            autoFocus
            rows={5}
            className="answer-box"
            placeholder="Answer in your own words, from memory."
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            disabled={marking}
          />
          <p className="label">How sure are you? <span className="muted small">Decide before you check: it is what makes this honest.</span></p>
          <div className="confidence" role="radiogroup" aria-label="Confidence">
            {([1, 2, 3, 4] as Confidence[]).map((c) => (
              <button
                key={c}
                role="radio"
                aria-checked={confidence === c}
                className={`conf conf-${c}${confidence === c ? ' chosen' : ''}`}
                onClick={() => setConfidence(c)}
                disabled={marking}
              >
                <kbd>{c}</kbd>
                <span className="conf-label">{CONFIDENCE_LABEL[c]}</span>
                <span className="conf-pct">{Math.round(CONFIDENCE_CLAIM[c] * 100)}%</span>
              </button>
            ))}
          </div>
          <div className="actions end">
            <span className="muted small hide-touch"><kbd>Ctrl</kbd> + <kbd>Enter</kbd> to check</span>
            <button className="btn primary lg" onClick={check} disabled={!answer.trim() || !confidence || marking}>
              {marking ? <><span className="spinner sm" /> Marking…</> : 'Check my answer'}
            </button>
          </div>
        </div>
      )}

      {result && g && (
        <div className="result">
          <div className={`verdict tone-${tone}`}>
            <Ring value={g.score} size={84} stroke={8}>
              <span className="ring-num sm">{Math.round(g.score * 100)}%</span>
            </Ring>
            <div>
              <h2>{g.score >= 0.9 ? 'Spot on.' : g.score >= RIGHT ? 'Got it.' : g.score >= 0.4 ? 'Partly there.' : 'Not yet.'}</h2>
              <p>{g.feedback}</p>
              <EngineBadge engine={g.engine} route={result.route} />
            </div>
          </div>

          <AuditNote marked={result.marked} second={second} />

          {confidentMiss && <p className="nudge"><Icon name="warn" size={16} /> You were certain, and missed part of it. This is the gap re-reading hides: it will come back soon.</p>}
          {luckyGuess && <p className="nudge calm"><Icon name="bulb" size={16} /> Right, though you were not sure. It will come back a little sooner, to make it stick.</p>}

          {(g.covered.length > 0 || g.missing.length > 0) && (
            <ul className="points">
              {g.covered.map((p) => <li key={p} className="hit"><Icon name="check" size={15} /> {p}</li>)}
              {g.missing.map((p) => <li key={p} className="miss"><Icon name="x" size={15} /> {p}</li>)}
            </ul>
          )}

          <div className="compare">
            <div><span className="muted small">Your answer</span><p>{result.attempt.answer}</p></div>
            <div><span className="muted small">Model answer</span><p>{card.answer}</p></div>
          </div>

          {g.missing.length > 0 && !help && (
            <button className="btn" onClick={askWhy} disabled={explaining}>
              {explaining ? <><span className="spinner sm" /> Explaining…</> : <><Icon name="bulb" size={16} /> Explain this to me</>}
            </button>
          )}
          {help && 'queued' in help && <p className="muted"><Icon name="clock" size={14} /> {help.queued}</p>}
          {help && 'failed' in help && <ErrorNote error={help.failed} onRetry={askWhy} />}
          {help && 'value' in help && (
            <div className="explain">
              <EngineBadge engine={help.engine} route={help.route} />
              <p>{help.value}</p>
            </div>
          )}

          <div className="actions end">
            <span className="muted small hide-touch"><kbd>Enter</kbd> to continue</span>
            <button ref={nextRef} className="btn primary lg" onClick={onNext}>
              {last ? 'See results' : 'Next card'} <Icon name="arrow" size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** What the self-audit did with this mark: escalated it, is spot-checking it, or revised it. */
function AuditNote({ marked, second }: { marked: Marked; second: 'running' | { agree: boolean; nano: number; cloud: number } | null }) {
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const check = marked.value.check;
  if (check?.kind === 'escalated') {
    return (
      <div className="audit-note escalated">
        <Icon name="cloud" size={16} />
        <div>
          <strong>Escalated to the cloud.</strong> Nano marked this {pct(check.nano)}, but {marked.doubt?.reasons[0]?.toLowerCase() ?? 'the mark was doubtful'}. The larger model marked it {pct(check.cloud)}
          {check.agree ? ', so Nano was right this time.' : ', and its mark is the one that counts.'}
        </div>
      </div>
    );
  }
  if (second === 'running') {
    return (
      <div className="audit-note">
        <span className="spinner sm" />
        <div>The cloud model is spot-checking Nano’s mark in the background. Carry on.</div>
      </div>
    );
  }
  if (second && second.agree) {
    return (
      <div className="audit-note agreed">
        <Icon name="check" size={16} />
        <div><strong>Spot-check agreed.</strong> The cloud model marked it {pct(second.cloud)} too. Nano’s trust goes up.</div>
      </div>
    );
  }
  if (second && !second.agree) {
    return (
      <div className="audit-note revised">
        <Icon name="warn" size={16} />
        <div><strong>Spot-check revised the mark</strong> from {pct(second.nano)} (Nano) to {pct(second.cloud)} (cloud). Your schedule was updated, and Nano’s trust goes down.</div>
      </div>
    );
  }
  return null;
}

function Summary({ results, onDone }: { results: { card: Card; attempt: Attempt }[]; onDone: () => void }) {
  const stats = useMemo(() => {
    const n = results.length || 1;
    const claimed = results.reduce((s, r) => s + CONFIDENCE_CLAIM[r.attempt.confidence], 0) / n;
    const right = results.filter((r) => r.attempt.grade.score >= RIGHT).length / n;
    const onDevice = results.filter((r) => r.attempt.grade.engine === 'on-device').length;
    return { claimed, right, onDevice };
  }, [results]);
  const gap = stats.claimed - stats.right;

  if (!results.length) {
    return (
      <div className="study-body center">
        <h2>Session ended</h2>
        <button className="btn primary" onClick={onDone}>Done</button>
      </div>
    );
  }

  return (
    <div className="study-body summary">
      <span className="empty-icon tone-good"><Icon name="check" size={30} /></span>
      <h1>Session complete</h1>
      <p className="muted">{results.length} {results.length === 1 ? 'card' : 'cards'} answered</p>

      <div className="versus">
        <div><span className="versus-num">{Math.round(stats.claimed * 100)}%</span><span className="muted small">you expected</span></div>
        <span className="versus-vs">vs</span>
        <div><span className="versus-num accent">{Math.round(stats.right * 100)}%</span><span className="muted small">you got right</span></div>
      </div>
      <p className="lede">
        {Math.abs(gap) <= 0.1
          ? 'Your confidence matched your results: you know what you know.'
          : gap > 0
            ? 'You expected more than you got. Those cards felt familiar but were not yet known; they come back soon.'
            : 'You knew more than you thought. Trust yourself a little more.'}
      </p>

      <ul className="session-list">
        {results.map(({ card, attempt }) => (
          <li key={attempt.id}>
            <span className={`score-pill tone-${attempt.grade.score >= RIGHT ? 'good' : attempt.grade.score >= 0.4 ? 'mid' : 'low'}`}>{Math.round(attempt.grade.score * 100)}</span>
            <span className="session-q">{card.prompt}</span>
            <span className="muted small">{CONFIDENCE_LABEL[attempt.confidence]}</span>
          </li>
        ))}
      </ul>

      <p className="private-note"><Icon name="shield" size={16} /> {stats.onDevice} of {results.length} answers were marked on this device and never left it.</p>
      <div className="actions center">
        <a className="btn" href="#/insights">See insights</a>
        <button className="btn primary" onClick={onDone} autoFocus>Done</button>
      </div>
    </div>
  );
}
