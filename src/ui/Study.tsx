/**
 * A study session: for each due card, write an answer in your own words, say how sure you are
 * (before seeing anything), then see the marking: what you covered, what you missed, the model
 * answer, and which engine marked it. Committing to a confidence first is the point: it turns
 * every card into a small, honest check of what you actually know.
 */
import { useMemo, useState } from 'react';
import { CONFIDENCE_CLAIM, CONFIDENCE_LABEL, type Attempt, type Card, type Confidence } from '../core/types';
import { RIGHT } from '../core/calibration';
import type { Route } from '../core/route';
import { Queued, explain, grade, type Outcome } from '../services/engine';
import type { Settings } from '../services/firebase';
import { recordAnswer } from '../services/store';
import { EngineBadge } from './EngineBadge';

interface Props {
  uid: string;
  cards: Card[];
  settings: Settings;
  onDone: () => void;
}

export function Study({ uid, cards, settings, onDone }: Props) {
  // The session's cards are fixed when it starts; answering reschedules them underneath.
  const [session] = useState(cards);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<Attempt[]>([]);
  const card = session[index];

  if (!session.length) {
    return (
      <section className="panel center">
        <h2>Nothing due</h2>
        <p>You are up to date. Add material, or come back when cards are due.</p>
        <button onClick={onDone}>Back</button>
      </section>
    );
  }
  if (!card) return <Summary results={results} onDone={onDone} />;
  return (
    <CardView
      key={card.id}
      uid={uid}
      card={card}
      settings={settings}
      position={`${index + 1} of ${session.length}`}
      onAnswered={(a) => setResults((r) => [...r, a])}
      onNext={() => setIndex((i) => i + 1)}
    />
  );
}

function CardView({ uid, card, settings, position, onAnswered, onNext }: {
  uid: string;
  card: Card;
  settings: Settings;
  position: string;
  onAnswered: (a: Attempt) => void;
  onNext: () => void;
}) {
  const [answer, setAnswer] = useState('');
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [marking, setMarking] = useState(false);
  const [result, setResult] = useState<{ attempt: Attempt; route: Route } | null>(null);
  const [help, setHelp] = useState<Outcome<string> | { queued: string } | null>(null);
  const [explaining, setExplaining] = useState(false);

  const check = async () => {
    if (!confidence || !answer.trim()) return;
    setMarking(true);
    const marked = await grade(card.prompt, card.keyPoints, answer, settings);
    const attempt = recordAnswer(uid, card, answer, confidence, marked.value);
    onAnswered(attempt);
    setResult({ attempt, route: marked.route });
    setMarking(false);
  };

  const askWhy = async () => {
    setExplaining(true);
    try {
      setHelp(await explain(card.prompt, card.answer, result?.attempt.grade.missing ?? [], settings));
    } catch (e) {
      setHelp({ queued: e instanceof Queued ? e.message : 'Could not explain right now. Try again in a moment.' });
    } finally {
      setExplaining(false);
    }
  };

  const g = result?.attempt.grade;
  const confidentMiss = g && confidence === 4 && g.score < RIGHT;
  const luckyGuess = g && confidence === 1 && g.score >= RIGHT;

  return (
    <section className="panel study">
      <p className="muted small">{position}</p>
      <h2 className="prompt">{card.prompt}</h2>

      {!result && (
        <>
          <textarea
            autoFocus
            rows={5}
            placeholder="Answer in your own words, from memory."
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            disabled={marking}
          />
          <p className="label">How sure are you?</p>
          <div className="confidence" role="radiogroup" aria-label="Confidence">
            {([1, 2, 3, 4] as Confidence[]).map((c) => (
              <button
                key={c}
                role="radio"
                aria-checked={confidence === c}
                className={confidence === c ? 'chosen' : ''}
                onClick={() => setConfidence(c)}
                disabled={marking}
              >
                {CONFIDENCE_LABEL[c]}
                <span className="small muted">{Math.round(CONFIDENCE_CLAIM[c] * 100)}%</span>
              </button>
            ))}
          </div>
          <button className="primary" onClick={check} disabled={!answer.trim() || !confidence || marking}>
            {marking ? 'Marking…' : 'Check my answer'}
          </button>
        </>
      )}

      {result && g && (
        <div className="result">
          <div className="score-row">
            <div className="meter" aria-label={`Score ${Math.round(g.score * 100)}%`}>
              <div className={`meter-fill ${g.score >= RIGHT ? 'good' : g.score >= 0.4 ? 'mid' : 'low'}`} style={{ width: `${Math.max(4, g.score * 100)}%` }} />
            </div>
            <strong>{Math.round(g.score * 100)}%</strong>
          </div>
          <EngineBadge engine={g.engine} route={result.route} />
          <p>{g.feedback}</p>
          <ul className="points">
            {g.covered.map((p) => <li key={p} className="hit">✓ {p}</li>)}
            {g.missing.map((p) => <li key={p} className="miss">✗ {p}</li>)}
          </ul>
          {confidentMiss && <p className="nudge">You were certain, and missed part of it. This is the gap that re-reading hides: it will come back soon.</p>}
          {luckyGuess && <p className="nudge calm">Right, though you were not sure. It will come back a little sooner, to make it stick.</p>}
          <details>
            <summary>Model answer</summary>
            <p>{card.answer}</p>
            <p className="muted small">Your answer: {result.attempt.answer}</p>
          </details>
          {g.missing.length > 0 && !help && (
            <button onClick={askWhy} disabled={explaining}>{explaining ? 'Explaining…' : 'Explain this to me'}</button>
          )}
          {help && 'queued' in help && <p className="muted">{help.queued}</p>}
          {help && 'value' in help && (
            <div className="explain">
              <EngineBadge engine={help.engine} route={help.route} />
              <p style={{ whiteSpace: 'pre-wrap' }}>{help.value}</p>
            </div>
          )}
          <button className="primary" onClick={onNext}>Next</button>
        </div>
      )}
    </section>
  );
}

function Summary({ results, onDone }: { results: Attempt[]; onDone: () => void }) {
  const stats = useMemo(() => {
    const n = results.length || 1;
    const claimed = results.reduce((s, a) => s + CONFIDENCE_CLAIM[a.confidence], 0) / n;
    const right = results.filter((a) => a.grade.score >= RIGHT).length / n;
    const onDevice = results.filter((a) => a.grade.engine === 'on-device').length;
    return { claimed, right, onDevice };
  }, [results]);
  const gap = stats.claimed - stats.right;
  return (
    <section className="panel center">
      <h2>Session done</h2>
      <p className="big">{results.length} cards</p>
      <div className="versus">
        <div><span className="big">{Math.round(stats.claimed * 100)}%</span><span className="muted small">you expected</span></div>
        <div><span className="big">{Math.round(stats.right * 100)}%</span><span className="muted small">you got right</span></div>
      </div>
      <p>
        {Math.abs(gap) <= 0.1
          ? 'Your confidence matched your results: you know what you know.'
          : gap > 0
            ? 'You expected more than you got: those cards felt familiar but were not yet known. They come back soon.'
            : 'You knew more than you thought. Trust yourself a little more.'}
      </p>
      <p className="muted small">{stats.onDevice} of {results.length} answers were marked on this device: they never left it.</p>
      <button className="primary" onClick={onDone}>Done</button>
    </section>
  );
}
