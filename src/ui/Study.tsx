/**
 * A study session: for each due card, write an answer in your own words, say how sure you are
 * (before seeing anything), then see the marking: what you covered, what you missed, the model
 * answer, and which engine marked it. Committing to a confidence first is the point: it turns
 * every card into a small, honest check of what you actually know.
 *
 * The learner's answers are saved only on this device (services/words.ts), and the screen says so
 * under the answer box: nobody likes wondering where their wrong answers end up.
 *
 * Answers can be typed or spoken, in the same box: the microphone writes what it hears into it
 * (on this device when Chrome can, else transcribed by Gemini; see voicePlan in core/speech.ts),
 * and the speaker reads the question aloud.
 *
 * Keyboard: 1–4 pick a confidence, Ctrl/Cmd+Enter checks, Enter goes to the next card, Esc leaves.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { CONFIDENCE_CLAIM, CONFIDENCE_LABEL, type Attempt, type Card, type Confidence, type Deck } from '../core/types';
import { RIGHT } from '../core/calibration';
import type { DeviceModel, Route } from '../core/route';
import { Queued, explain, grade, type Hybrid, type Marked, type Outcome } from '../services/engine';
import type { Settings } from '../services/firebase';
import { recordAnswer, recordAudit, reviseAnswer } from '../services/store';
import { agrees } from '../core/audit';
import { EngineBadge } from './EngineBadge';
import { Tutor } from './Tutor';
import { ErrorNote } from './ErrorNote';
import { Icon } from './Icon';
import { Ring } from './charts';
import { friendly, type Friendly } from '../core/errors';
import { voicePlan, type VoicePlan } from '../core/speech';
import { canRecord, hush, installSpeechOnDevice, say, speechOnDevice, useMic, type SpeechOnDevice } from './voice';

interface Props {
  uid: string;
  cards: Card[];
  decks: Deck[];
  settings: Settings;
  hybrid: Hybrid;
  online: boolean;
  device: DeviceModel;
  onDone: () => void;
}

export function Study({ uid, cards, decks, settings, hybrid, online, device, onDone }: Props) {
  // The session's cards are fixed when it starts; answering reschedules them underneath.
  const [session] = useState(cards);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<{ card: Card; attempt: Attempt }[]>([]);
  const card = session[index];
  const deckName = new Map(decks.map((d) => [d.id, d.title]));

  // Whether Chrome can hear speech on this device decides where a spoken answer is heard.
  const [speech, setSpeech] = useState<SpeechOnDevice | null>(null);
  useEffect(() => void speechOnDevice().then(setSpeech), []);
  const plan = voicePlan({ online, speechOnDevice: speech === 'available', canRecord: canRecord(), cloudGrading: settings.cloudGrading, policy: hybrid.policy });
  const getSpeech = async () => {
    await installSpeechOnDevice();
    setSpeech(await speechOnDevice());
  };

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      const typing = ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName);
      if (e.key === 'Escape' && !typing && !document.querySelector('dialog[open]')) {
        hush();
        onDone();
      }
    };
    addEventListener('keydown', esc);
    return () => {
      removeEventListener('keydown', esc);
      hush();
    };
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
          plan={plan}
          privacy={privacyNote(device === 'available', online && settings.cloudGrading, hybrid.policy)}
          speech={speech}
          onGetSpeech={getSpeech}
          last={index === session.length - 1}
          onAnswered={(attempt) => setResults((r) => [...r, { card, attempt }])}
          onRevised={(attempt) => setResults((r) => r.map((x) => (x.attempt.id === attempt.id ? { ...x, attempt } : x)))}
          onNext={() => setIndex((i) => i + 1)}
        />
      )}
    </div>
  );
}

/** One plain line on where an answer goes: always saved only here; marked here, or in the cloud. */
function privacyNote(builtIn: boolean, cloud: boolean, policy: Hybrid['policy']): string {
  if (policy === 'private' || !cloud) return 'Only you see your answers: they are saved and marked on this device.';
  return builtIn ? 'Your answers are saved and marked on this device. An unsure mark may get a second look in the cloud.' : 'Your answers are saved only on this device. The cloud AI marks them.';
}

function CardView({ uid, card, deck, settings, hybrid, plan, privacy, speech, onGetSpeech, last, onAnswered, onRevised, onNext }: {
  uid: string;
  card: Card;
  deck?: string;
  settings: Settings;
  hybrid: Hybrid;
  plan: VoicePlan;
  privacy: string;
  speech: SpeechOnDevice | null;
  onGetSpeech: () => Promise<void>;
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
  const [tutoring, setTutoring] = useState(false);
  const nextRef = useRef<HTMLButtonElement>(null);

  // ----- Speaking the answer: the microphone writes into the same box -----
  const mic = useMic(plan.listen, settings);
  const listening = mic.state === 'listening';
  const transcribing = mic.state === 'transcribing';
  /** What was in the box when the microphone started: what is heard is added after it. */
  const before = useRef('');
  const spoke = useRef(false);
  const [gettingSpeech, setGettingSpeech] = useState(false);

  useEffect(() => {
    if (listening) setAnswer(join(before.current, mic.text));
  }, [listening, mic.text]);

  const talk = async () => {
    hush();
    before.current = answer;
    spoke.current = true;
    await mic.start();
  };
  const stopTalking = async () => {
    const heard = await mic.stop();
    const full = join(before.current, heard);
    setAnswer(full);
    return full;
  };
  const getSpeech = async () => {
    setGettingSpeech(true);
    await onGetSpeech();
    setGettingSpeech(false);
  };

  const checking = useRef(false);
  const check = async () => {
    if (!confidence || marking || transcribing || checking.current) return;
    checking.current = true;
    try {
      const text = listening ? await stopTalking() : answer;
      if (text.trim()) await mark(text, confidence);
    } finally {
      checking.current = false;
    }
  };

  const mark = async (answer: string, confidence: Confidence) => {
    hush();
    setMarking(true);
    const marked = await grade(card.prompt, card.keyPoints, answer, settings, hybrid);
    const attempt = recordAnswer(uid, card, answer, confidence, marked.value, spoke.current ? 'oral' : 'typed');
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
        <div className="qcard-head">
          <p className="eyebrow">{deck ?? 'Question'}</p>
          <ReadAloud text={card.prompt} voice={plan.speakQuestion} settings={settings} />
        </div>
        <h1 className="question">{card.prompt}</h1>
      </div>

      {!result && (
        <div className="answer-area">
          <div className={`answer-wrap${listening ? ' listening' : ''}`}>
            <textarea
              autoFocus
              rows={5}
              className="answer-box"
              placeholder={listening ? 'Listening…' : 'Answer in your own words, from memory: type it, or tap the microphone and say it.'}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              readOnly={listening || transcribing}
              disabled={marking}
            />
            <MicButton
              plan={plan}
              speech={speech}
              state={mic.state}
              level={mic.level}
              getting={gettingSpeech}
              disabled={marking}
              onTalk={() => void talk()}
              onStop={() => void stopTalking()}
              onGetSpeech={() => void getSpeech()}
            />
          </div>
          <p className="privacy-note small muted"><Icon name="shield" size={13} /> {privacy}</p>
          {(listening || transcribing || mic.error) && (
            <p className={`voice-note small${mic.error ? ' error' : ' muted'}`} aria-live="polite">
              {mic.error ?? (transcribing ? 'Writing down what you said…' : <><Icon name={plan.listen === 'device' ? 'device' : 'cloud'} size={13} /> {plan.listen === 'device' ? 'Listening on this device: your voice never leaves it.' : 'Recording: your words appear when you stop.'}</>)}
            </p>
          )}
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
            <button className="btn primary lg" onClick={() => void check()} disabled={(!answer.trim() && !listening) || !confidence || marking || transcribing}>
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

          {g.missing.length > 0 && (!help || !tutoring) && (
            <div className="actions">
              {!help && (
                <button className="btn" onClick={askWhy} disabled={explaining}>
                  {explaining ? <><span className="spinner sm" /> Explaining…</> : <><Icon name="bulb" size={16} /> Explain this to me</>}
                </button>
              )}
              {!tutoring && (
                <button className="btn" onClick={() => setTutoring(true)}>
                  <Icon name="chat" size={16} /> Talk it through
                </button>
              )}
            </div>
          )}
          {help && 'queued' in help && <p className="muted"><Icon name="clock" size={14} /> {help.queued}</p>}
          {help && 'failed' in help && <ErrorNote error={help.failed} onRetry={askWhy} />}
          {help && 'value' in help && (
            <div className="explain">
              <EngineBadge engine={help.engine} route={help.route} />
              <p>{help.value}</p>
            </div>
          )}

          {tutoring && (
            <Tutor
              ctx={{ card: { prompt: card.prompt, answer: card.answer, keyPoints: card.keyPoints }, said: result.attempt.answer, missing: g.missing }}
              settings={settings}
              policy={hybrid.policy}
            />
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

/** The speaker on a question: loading while Gemini's voice arrives, then speaking; press again to stop. */
function ReadAloud({ text, voice, settings }: { text: string; voice: VoicePlan['speakQuestion']; settings: Settings }) {
  const [state, setState] = useState<'idle' | 'loading' | 'speaking'>('idle');
  const run = useRef(0);
  useEffect(() => () => void run.current++, []);

  const press = async () => {
    if (state !== 'idle') {
      run.current++;
      hush();
      return setState('idle');
    }
    const mine = ++run.current;
    setState('loading');
    await say(text, voice, settings, () => mine === run.current && setState('speaking'));
    if (mine === run.current) setState('idle');
  };

  return (
    <button
      className={`icon-btn read-aloud ${state}`}
      onClick={() => void press()}
      aria-label={state === 'idle' ? 'Read the question aloud' : 'Stop reading'}
      aria-pressed={state !== 'idle'}
      title={state === 'idle' ? 'Read aloud' : 'Stop'}
    >
      {state === 'loading' ? <span className="spinner sm" /> : <Icon name={state === 'speaking' ? 'stop' : 'speaker'} size={18} />}
    </button>
  );
}

/** Two pieces of an answer, typed then spoken, as one. */
const join = (a: string, b: string) => [a.trim(), b.trim()].filter(Boolean).join(' ');

/** The microphone in the answer box: talk, stop, or why it cannot be used here. */
function MicButton({ plan, speech, state, level, getting, disabled, onTalk, onStop, onGetSpeech }: {
  plan: VoicePlan;
  speech: SpeechOnDevice | null;
  state: string;
  level: number;
  getting: boolean;
  disabled: boolean;
  onTalk: () => void;
  onStop: () => void;
  onGetSpeech: () => void;
}) {
  if (state === 'transcribing' || getting) {
    return <span className="mic-btn busy" role="status" aria-label={getting ? 'Getting speech recognition' : 'Transcribing'}><span className="spinner sm" /></span>;
  }
  if (state === 'listening') {
    return (
      <button type="button" className="mic-btn on" style={{ ['--lvl' as string]: level }} onClick={onStop} aria-label="Stop listening" title="Stop">
        <Icon name="stop" size={16} />
      </button>
    );
  }
  if (plan.listen === 'type') {
    // Speech cannot be heard right now; offer Chrome's on-device recogniser when it can be downloaded.
    const canGet = speech === 'downloadable';
    return (
      <button type="button" className="mic-btn" onClick={canGet ? onGetSpeech : undefined} disabled={disabled || !canGet} aria-label={canGet ? 'Get speech recognition for this device' : 'Speaking is unavailable'} title={canGet ? 'Get speech recognition on this device (a small download)' : plan.listenReason}>
        <Icon name={canGet ? 'download' : 'mic'} size={18} />
      </button>
    );
  }
  return (
    <button type="button" className="mic-btn" onClick={onTalk} disabled={disabled} aria-label="Answer out loud" title={`Answer out loud. ${plan.listenReason}`}>
      <Icon name="mic" size={18} />
    </button>
  );
}

/** What the second check did with this mark, in plain words: double-checked first, or changed after. */
function AuditNote({ marked, second }: { marked: Marked; second: 'running' | { agree: boolean; nano: number; cloud: number } | null }) {
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  if (marked.value.check?.kind === 'escalated') {
    return (
      <div className="audit-note escalated">
        <Icon name="cloud" size={16} />
        <div><strong>Double-checked.</strong> A second AI checked this mark before showing it to you.</div>
      </div>
    );
  }
  if (second && second !== 'running' && !second.agree) {
    return (
      <div className="audit-note revised">
        <Icon name="warn" size={16} />
        <div><strong>Mark updated</strong> from {pct(second.nano)} to {pct(second.cloud)} after a second check. Your schedule was updated too.</div>
      </div>
    );
  }
  return null;
}

export function Summary({ results, onDone }: { results: { card: Card; attempt: Attempt }[]; onDone: () => void }) {
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

      <p className="private-note"><Icon name="shield" size={16} /> Your answers are saved only on this device.{stats.onDevice > 0 && ` ${stats.onDevice} of ${results.length} were marked here too.`}</p>
      <div className="actions center">
        <a className="btn" href="#/insights">See insights</a>
        <button className="btn primary" onClick={onDone} autoFocus>Done</button>
      </div>
    </div>
  );
}
