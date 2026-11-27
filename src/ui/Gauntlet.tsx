/**
 * The Trap Gauntlet screen: intro, Nano writing the traps, the timed game with the cloud referee
 * ruling live, and the results with XP. See core/gauntlet.ts for the rules.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Policy } from '../core/audit';
import { friendly, type Friendly } from '../core/errors';
import { GAUNTLET_CARDS, SECONDS_PER_STATEMENT, levelOf, pickCards, playedToday, pointsFor, totalXp, type GauntletRun, type Ruling, type Statement } from '../core/gauntlet';
import type { Route } from '../core/route';
import type { Attempt, Card, Engine } from '../core/types';
import { Queued } from '../services/engine';
import type { Settings } from '../services/firebase';
import { gauntletRoute, referee, writeTraps } from '../services/gauntlet';
import { saveGauntlet } from '../services/store';
import { EngineBadge } from './EngineBadge';
import { ErrorNote } from './ErrorNote';
import { Icon } from './Icon';
import { LevelBar } from './LevelBar';

interface Props {
  uid: string;
  cards: Card[];
  attempts: Attempt[];
  runs: GauntletRun[];
  settings: Settings;
  policy: Policy;
  onDone: () => void;
}

interface Answer {
  choice: boolean | null;
  sure: boolean;
  points: number;
}

type Referee = { state: 'checking' } | { state: 'done'; rulings: Ruling[] } | { state: 'off'; reason: string } | { state: 'failed' };

const FEEDBACK_MS = 1800;

export function Gauntlet({ uid, cards, attempts, runs, settings, policy, onDone }: Props) {
  const source = useMemo(() => pickCards(cards, attempts, GAUNTLET_CARDS), [cards, attempts]);
  // Whether this run earns XP is settled when it starts: saving it adds it to the history, which
  // would otherwise make it look like a second run of the day.
  const countsNow = !playedToday(runs, new Date());
  const [counted, setCounted] = useState(countsNow);
  // Likewise the XP before this run, so the results do not count the saved run twice.
  const xpNow = totalXp(attempts, runs);
  const [xpBefore, setXpBefore] = useState(xpNow);
  const [phase, setPhase] = useState<'intro' | 'writing' | 'play' | 'done'>('intro');
  const [where, setWhere] = useState<Route | null>(null);
  const [failure, setFailure] = useState<Friendly | string | null>(null);
  const [statements, setStatements] = useState<Statement[]>([]);
  const [engine, setEngine] = useState<Engine>('on-device');
  const [writeRoute, setWriteRoute] = useState<Route | null>(null);
  const [ref, setRef] = useState<Referee>({ state: 'checking' });
  const [answers, setAnswers] = useState<Map<number, Answer>>(new Map());
  const [index, setIndex] = useState(0);
  const [sure, setSure] = useState(true);
  const [feedback, setFeedback] = useState<{ index: number; answer: Answer } | null>(null);
  const [notice, setNotice] = useState('');
  const [left, setLeft] = useState(SECONDS_PER_STATEMENT);
  const saved = useRef(false);

  useEffect(() => {
    void gauntletRoute(settings, policy).then(setWhere);
  }, [settings, policy]);

  const withdrawn = useMemo(() => new Set(ref.state === 'done' ? ref.rulings.filter((r) => !r.fair).map((r) => r.statement) : []), [ref]);
  const points = [...answers].reduce((sum, [i, a]) => sum + (withdrawn.has(i) ? 0 : a.points), 0);

  // A statement the referee withdraws: skipped if still to come, its points given back if answered.
  useEffect(() => {
    if (ref.state !== 'done') return;
    const struck = ref.rulings.filter((r) => !r.fair);
    if (!struck.length) return;
    const answered = struck.filter((r) => answers.has(r.statement) && answers.get(r.statement)!.points < 0);
    setNotice(
      `Referee withdrew ${struck.length} unfair ${struck.length === 1 ? 'statement' : 'statements'}` +
        (answered.length ? `, and gave back ${-answered.reduce((s, r) => s + answers.get(r.statement)!.points, 0)} points.` : '.'),
    );
    // Only when the ruling arrives, not on every answer, so `answers` is left out on purpose.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [ref]);

  const start = async () => {
    // The run just saved (by "Play again") may not be in `runs` yet: count it in by hand.
    const finished = saved.current || latest.current.phase === 'done';
    setCounted(!finished && !playedToday(runs, new Date()));
    setXpBefore(totalXp(attempts, runs) + (finished && latest.current.counted ? Math.max(0, latest.current.points) * 2 : 0));
    setFailure(null);
    setPhase('writing');
    try {
      const out = await writeTraps(source, attempts, settings, policy);
      setStatements(out.value);
      setEngine(out.engine);
      setWriteRoute(out.route);
      setAnswers(new Map());
      setIndex(0);
      setRef({ state: 'checking' });
      setPhase('play');
      // The referee works while the learner plays.
      referee(out.value, source, settings, policy)
        .then((r) => setRef(r.rulings ? { state: 'done', rulings: r.rulings } : { state: 'off', reason: r.route.reason }))
        .catch((e) => {
          console.warn('[recall] referee failed', e);
          setRef({ state: 'failed' });
        });
    } catch (e) {
      setPhase('intro');
      setFailure(e instanceof Queued ? e.route.reason : friendly(e));
    }
  };

  const next = useCallback(
    (from: number) => {
      let i = from + 1;
      while (i < statements.length && withdrawn.has(i)) i++;
      if (i >= statements.length) setPhase('done');
      else setIndex(i);
    },
    [statements.length, withdrawn],
  );

  // One answer per statement, even if two clicks or key repeats land before the screen updates.
  const answered = useRef(-1);
  const answer = useCallback(
    (choice: boolean | null) => {
      if (feedback || phase !== 'play' || answered.current === index) return;
      answered.current = index;
      const s = statements[index];
      const a: Answer = { choice, sure, points: pointsFor(choice === null ? null : choice === s.truth, sure) };
      setAnswers((m) => new Map(m).set(index, a));
      setFeedback({ index, answer: a });
      setTimeout(() => {
        setFeedback(null);
        next(index);
      }, FEEDBACK_MS);
    },
    [feedback, phase, statements, index, sure, next],
  );

  // The timer: a fresh countdown per statement; running out counts as no answer. It restarts only
  // for a new statement: toggling "I'm sure" or the referee's ruling must not reset the clock.
  // Refs are updated after each render (not during it), as React requires.
  const answerRef = useRef(answer);
  useEffect(() => {
    answerRef.current = answer;
  });
  useEffect(() => {
    if (phase !== 'play' || feedback) return;
    setLeft(SECONDS_PER_STATEMENT);
    const started = Date.now();
    const t = setInterval(() => {
      const remaining = SECONDS_PER_STATEMENT - (Date.now() - started) / 1000;
      setLeft(Math.max(0, remaining));
      if (remaining <= 0) {
        clearInterval(t);
        answerRef.current(null);
      }
    }, 100);
    return () => clearInterval(t);
  }, [phase, index, feedback]);

  // A statement withdrawn while on screen: move on.
  useEffect(() => {
    if (phase === 'play' && !feedback && withdrawn.has(index)) next(index);
  }, [phase, feedback, withdrawn, index, next]);

  // Keyboard: T true, F false, S toggles "I'm sure".
  useEffect(() => {
    if (phase !== 'play') return;
    const key = (e: KeyboardEvent) => {
      // Browser shortcuts (Ctrl+F, Cmd+T...) and held keys are not answers.
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (e.key === 't' || e.key === 'T') answer(true);
      else if (e.key === 'f' || e.key === 'F') answer(false);
      else if (e.key === 's' || e.key === 'S') setSure((v) => !v);
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, [phase, answer]);

  // Saving the run. `latest` always holds what a save needs, so a save can happen from anywhere:
  // at the end, when leaving (also mid-game, so quitting a bad run cannot re-roll today's), and
  // before "Play again" (so the next run cannot count as today's first as well).
  const latest = useRef({ phase, answers, withdrawn, points, statements, counted });
  useEffect(() => {
    latest.current = { phase, answers, withdrawn, points, statements, counted };
  });
  const flush = useCallback(() => {
    const s = latest.current;
    if (saved.current || !(s.phase === 'done' || (s.phase === 'play' && s.answers.size > 0))) return;
    saved.current = true;
    const scored = [...s.answers].filter(([i]) => !s.withdrawn.has(i));
    saveGauntlet(uid, {
      at: new Date().toISOString(),
      points: s.points,
      right: scored.filter(([i, a]) => a.choice === s.statements[i].truth).length,
      answered: scored.length,
      withdrawn: s.withdrawn.size,
      // A run with nothing left to score (every statement withdrawn) does not use up today's XP.
      counted: s.counted && scored.length > 0,
    });
  }, [uid]);

  // At the end: once the referee has ruled, or after a short wait for it.
  useEffect(() => {
    if (phase !== 'done' || saved.current) return;
    if (ref.state !== 'checking') return flush();
    const t = setTimeout(flush, 10_000);
    return () => clearTimeout(t);
  }, [phase, ref, flush]);

  // Leaving the screen, at any point after the first answer.
  useEffect(() => () => flush(), [flush]);

  const gained = phase === 'done' && counted ? Math.max(0, points) * 2 : 0;

  return (
    <div className="gauntlet">
      <div className="study-top">
        <button className="icon-btn" onClick={onDone} aria-label="Leave the gauntlet" title="Leave"><Icon name="x" /></button>
        {phase === 'play' && (
          <>
            <span className="study-progress" role="progressbar" aria-valuemin={0} aria-valuemax={statements.length} aria-valuenow={index}>
              <span style={{ width: `${(index / statements.length) * 100}%` }} />
            </span>
            <span className="study-count">{points} pts</span>
          </>
        )}
      </div>

      {phase === 'intro' && <Intro source={source} where={where} xp={xpNow} counted={countsNow} failure={failure} onStart={start} />}

      {phase === 'writing' && (
        <div className="gauntlet-writing">
          <div className="spinner lg" />
          <h2>Writing your traps…</h2>
          <p className="muted">From the cards you recently got wrong: one true statement and one trap for each.</p>
        </div>
      )}

      {phase === 'play' && statements[index] && (
        <div className="gauntlet-play">
          <div className="gauntlet-meta">
            <EngineBadge engine={engine} route={writeRoute ?? undefined} />
            <RefereeChip referee={ref} withdrawn={withdrawn.size} />
          </div>
          {notice && <p className="gauntlet-notice"><Icon name="shield" size={15} /> {notice}</p>}

          <div className={`trap-card${feedback ? (feedback.answer.choice === statements[feedback.index].truth ? ' right' : ' wrong') : ''}`}>
            <div className="trap-timer" aria-hidden><span style={{ width: `${(left / SECONDS_PER_STATEMENT) * 100}%` }} /></div>
            <p className="eyebrow">True or false? · {index + 1} of {statements.length}</p>
            <p className="trap-text">{statements[index].text}</p>
            {feedback && (
              <div className="trap-feedback">
                <strong>
                  {feedback.answer.choice === null ? 'Out of time.' : feedback.answer.choice === statements[feedback.index].truth ? 'Right!' : 'A trap!'}{' '}
                  It is {statements[feedback.index].truth ? 'true' : 'false'}.
                  <span className="trap-points">{feedback.answer.points > 0 ? `+${feedback.answer.points}` : feedback.answer.points}</span>
                </strong>
                {statements[feedback.index].why && <p>{statements[feedback.index].why}</p>}
              </div>
            )}
          </div>

          <div className="trap-controls">
            <label className="trap-sure">
              <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} disabled={!!feedback} />
              <span>I'm sure <span className="muted small">(+3 if right, −2 if wrong; a guess risks nothing)</span></span>
            </label>
            <div className="trap-buttons">
              <button className="btn lg trap-true" onClick={() => answer(true)} disabled={!!feedback}><Icon name="check" size={18} /> True <kbd>T</kbd></button>
              <button className="btn lg trap-false" onClick={() => answer(false)} disabled={!!feedback}><Icon name="x" size={18} /> False <kbd>F</kbd></button>
            </div>
          </div>
        </div>
      )}

      {phase === 'done' && (
        <Results
          statements={statements}
          answers={answers}
          referee={ref}
          withdrawn={withdrawn}
          points={points}
          counted={counted}
          xpBefore={xpBefore}
          gained={gained}
          onAgain={() => {
            flush();
            saved.current = false;
            answered.current = -1;
            void start();
          }}
          onDone={onDone}
        />
      )}
    </div>
  );
}

function Intro({ source, where, xp, counted, failure, onStart }: { source: Card[]; where: Route | null; xp: number; counted: boolean; failure: Friendly | string | null; onStart: () => void }) {
  const lvl = levelOf(xp);
  const can = where?.run === 'model' && source.length > 0;
  return (
    <div className="gauntlet-intro">
      <p className="eyebrow">Daily challenge</p>
      <h1>The Trap Gauntlet</h1>
      <p className="lede">True or false, against the clock. The AI writes traps from <em>your</em> past mistakes; a referee in the cloud makes sure every one is fair.</p>
      <LevelBar xp={xp} />
      <ul className="gauntlet-rules">
        <li><b>Sure and right:</b> +3 · <b>a right guess:</b> +1 · <b>a wrong guess:</b> 0 · <b>sure and wrong:</b> −2</li>
        <li>{counted ? 'Your first run today earns XP (points × 2).' : 'You have played today: this run is practice, with no XP.'}</li>
        <li>Built from {source.length} {source.length === 1 ? 'card' : 'cards'}{source.length ? `: ${source.map((c) => `“${c.prompt.length > 40 ? c.prompt.slice(0, 40) + '…' : c.prompt}”`).join(', ')}` : ''}.</li>
      </ul>
      {where && where.run !== 'model' && <p className="muted small">{where.reason}</p>}
      {typeof failure === 'string' && <p className="muted"><Icon name="clock" size={14} /> {failure}</p>}
      {failure && typeof failure !== 'string' && <ErrorNote error={failure} onRetry={onStart} />}
      {!source.length && <p className="muted">Add a deck first: the gauntlet is built from your cards.</p>}
      <div className="actions">
        <button className="btn primary lg" onClick={onStart} disabled={!can}><Icon name="play" size={18} /> Start the gauntlet</button>
        <span className="muted small">Level {lvl.level} · {lvl.title}</span>
      </div>
    </div>
  );
}

function RefereeChip({ referee, withdrawn }: { referee: Referee; withdrawn: number }) {
  if (referee.state === 'checking') return <span className="ref-chip checking"><span className="spinner sm" /> Referee checking every statement…</span>;
  if (referee.state === 'done') return <span className="ref-chip done"><Icon name="shield" size={14} /> Referee: {withdrawn ? `${withdrawn} withdrawn as unfair` : 'all fair'}</span>;
  if (referee.state === 'off') return <span className="ref-chip off" title={referee.reason}><Icon name="shield" size={14} /> No referee: {referee.reason.replace(/^[^:]*:\s*/, '')}</span>;
  return <span className="ref-chip off"><Icon name="shield" size={14} /> Referee unavailable: every statement stands</span>;
}

function Results(p: {
  statements: Statement[];
  answers: Map<number, Answer>;
  referee: Referee;
  withdrawn: Set<number>;
  points: number;
  counted: boolean;
  xpBefore: number;
  gained: number;
  onAgain: () => void;
  onDone: () => void;
}) {
  const scored = [...p.answers].filter(([i]) => !p.withdrawn.has(i));
  const right = scored.filter(([i, a]) => a.choice === p.statements[i].truth).length;
  const before = levelOf(p.xpBefore).level;
  const after = levelOf(p.xpBefore + p.gained).level;
  const rulings = p.referee.state === 'done' ? new Map(p.referee.rulings.map((r) => [r.statement, r])) : new Map<number, Ruling>();
  return (
    <div className="gauntlet-results">
      <div className="verdict-card">
        <div className="verdict-main">
          <p className="eyebrow">Gauntlet complete</p>
          <h2>{p.points} points · {right} of {scored.length} right</h2>
          <p>{p.counted ? (p.gained ? `+${p.gained} XP.` : 'No XP this time: points below zero count as zero.') : 'Practice run: no XP.'}{after > before ? ` Level up: you reached level ${after}!` : ''}</p>
        </div>
        <RefereeChip referee={p.referee} withdrawn={p.withdrawn.size} />
      </div>
      <LevelBar xp={p.xpBefore + p.gained} />
      <ol className="trap-list">
        {p.statements.map((s, i) => {
          const a = p.answers.get(i);
          const struck = p.withdrawn.has(i);
          return (
            <li key={i} className={struck ? 'struck' : a ? (a.choice === s.truth ? 'right' : 'wrong') : 'skipped'}>
              <span className="trap-mark" aria-hidden>{struck ? '—' : a ? (a.choice === s.truth ? '✓' : '✗') : '·'}</span>
              <span className="trap-item">
                <span>{s.text} <b>({s.truth ? 'true' : 'false'})</b></span>
                {struck ? <span className="small trap-ruling"><Icon name="shield" size={13} /> Withdrawn by the referee: {rulings.get(i)?.reason || 'unfair'}</span> : s.why && <span className="muted small">{s.why}</span>}
              </span>
              {!struck && a && <span className="trap-points">{a.points > 0 ? `+${a.points}` : a.points}</span>}
            </li>
          );
        })}
      </ol>
      <div className="actions end">
        <button className="btn" onClick={p.onAgain}><Icon name="play" size={16} /> Play again</button>
        <button className="btn primary" onClick={p.onDone}>Done <Icon name="arrow" size={16} /></button>
      </div>
    </div>
  );
}
