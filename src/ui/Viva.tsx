/**
 * The oral exam. Each card is a short spoken exchange:
 *   1. Recall reads the question aloud;
 *   2. the learner says how sure they are (before answering, as in a typed session);
 *   3. they answer out loud, and see their words as they are heard;
 *   4. if a key point is missing, the examiner asks one follow-up that nudges toward it without
 *      giving it away, and listens again;
 *   5. the mark: points recalled unprompted, after the nudge (half credit) and missed.
 *
 * Where each step runs is decided by the voice plan (core/viva.ts) and shown before the start.
 *
 * Keyboard: Space starts and stops the microphone, 1–4 pick a confidence, R repeats the
 * question, Enter goes on, Esc leaves.
 */
import { useEffect, useRef, useState } from 'react';
import { CONFIDENCE_CLAIM, CONFIDENCE_LABEL, type Attempt, type Card, type Confidence, type Deck, type Grade } from '../core/types';
import { RIGHT } from '../core/calibration';
import { agrees } from '../core/audit';
import { mergeOral, oralTranscript, shouldProbe, voicePlan, type Listen, type VoicePlan } from '../core/viva';
import { grade, probe, type Hybrid } from '../services/engine';
import type { Settings } from '../services/firebase';
import { recordAnswer, recordAudit, reviseAnswer } from '../services/store';
import { EngineBadge } from './EngineBadge';
import { Icon } from './Icon';
import { Ring } from './charts';
import { Summary } from './Study';
import { canRecord, hush, installSpeechOnDevice, say, speechOnDevice, useMic, type SpeechOnDevice } from './voice';

interface Props {
  uid: string;
  cards: Card[];
  decks: Deck[];
  settings: Settings;
  hybrid: Hybrid;
  online: boolean;
  onDone: () => void;
}

export function Viva({ uid, cards, decks, settings, hybrid, online, onDone }: Props) {
  const [session] = useState(cards);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<{ card: Card; attempt: Attempt }[]>([]);
  const [plan, setPlan] = useState<VoicePlan | null>(null);
  const card = session[index];
  const deckName = new Map(decks.map((d) => [d.id, d.title]));

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('dialog[open]') && (hush(), onDone());
    addEventListener('keydown', esc);
    return () => {
      removeEventListener('keydown', esc);
      hush();
    };
  }, [onDone]);

  const done = !card;
  return (
    <div className="study viva">
      <header className="study-top">
        <button className="icon-btn" onClick={() => (hush(), onDone())} aria-label="End oral exam" title="End (Esc)"><Icon name="x" /></button>
        <div className="study-progress" role="progressbar" aria-valuemin={0} aria-valuemax={session.length} aria-valuenow={results.length}>
          <span style={{ width: `${session.length ? (results.length / session.length) * 100 : 0}%` }} />
        </div>
        <span className="study-count small muted">{done ? session.length : index + 1} / {session.length}</span>
      </header>

      {!session.length ? (
        <div className="study-body center">
          <span className="empty-icon"><Icon name="check" size={30} /></span>
          <h2>Nothing due</h2>
          <p className="muted">You are up to date. Practise a whole deck from the library instead.</p>
          <button className="btn primary" onClick={onDone}>Back</button>
        </div>
      ) : !plan ? (
        <Lobby count={session.length} settings={settings} hybrid={hybrid} online={online} onStart={setPlan} />
      ) : done ? (
        <Summary results={results} onDone={onDone} />
      ) : (
        <Exchange
          key={card.id}
          uid={uid}
          card={card}
          deck={deckName.get(card.deckId)}
          settings={settings}
          hybrid={hybrid}
          plan={plan}
          last={index === session.length - 1}
          onAnswered={(attempt) => setResults((r) => [...r, { card, attempt }])}
          onRevised={(attempt) => setResults((r) => r.map((x) => (x.attempt.id === attempt.id ? { ...x, attempt } : x)))}
          onNext={() => setIndex((i) => i + 1)}
          onTypeInstead={() => setPlan({ ...plan, listen: 'type', listenReason: 'You chose to type your answers.' })}
        />
      )}
    </div>
  );
}

/** Before the start: what will happen, where each part runs, and one click (which unlocks audio and the microphone). */
function Lobby({ count, settings, hybrid, online, onStart }: { count: number; settings: Settings; hybrid: Hybrid; online: boolean; onStart: (p: VoicePlan) => void }) {
  const [speech, setSpeech] = useState<SpeechOnDevice | null>(null);
  const [installing, setInstalling] = useState(false);
  useEffect(() => void speechOnDevice().then(setSpeech), []);

  const plan = voicePlan({ online, speechOnDevice: speech === 'available', canRecord: canRecord(), cloudGrading: settings.cloudGrading, policy: hybrid.policy });
  const install = async () => {
    setInstalling(true);
    await installSpeechOnDevice();
    setSpeech(await speechOnDevice());
    setInstalling(false);
  };

  return (
    <div className="study-body viva-lobby">
      <span className="viva-orb idle" aria-hidden><Icon name="mic" size={34} /></span>
      <h1>Oral exam</h1>
      <p className="lede">
        {count} {count === 1 ? 'question' : 'questions'}, answered out loud. Miss a point and you get one follow-up; what you recall after it earns half marks.
      </p>

      <ul className="viva-plan">
        <li>
          <span className={`row-icon ${plan.speakQuestion === 'cloud' ? 'tone-cloud' : 'tone-device'}`}><Icon name="speaker" size={18} /></span>
          <span><strong>Voice</strong><span className="muted small">{plan.speakReason}</span></span>
        </li>
        <li>
          <span className={`row-icon ${plan.listen === 'device' ? 'tone-device' : plan.listen === 'cloud' ? 'tone-cloud' : ''}`}><Icon name={plan.listen === 'type' ? 'edit' : 'mic'} size={18} /></span>
          <span>
            <strong>{plan.listen === 'type' ? 'Answers: typed' : 'Listening'}</strong>
            <span className="muted small">{speech === null ? 'Checking this browser…' : plan.listenReason}</span>
            {speech === 'downloadable' && (
              <button className="btn sm" onClick={install} disabled={installing}>
                {installing ? <><span className="spinner sm" /> Getting it…</> : <><Icon name="download" size={14} /> Listen on this device instead</>}
              </button>
            )}
          </span>
        </li>
      </ul>

      <button className="btn primary lg" onClick={() => onStart(plan)} disabled={speech === null} autoFocus>
        <Icon name="play" size={18} /> Begin
      </button>
      <p className="muted small">Headphones help.</p>
    </div>
  );
}

type Step =
  | { at: 'asking' }
  | { at: 'confidence' }
  | { at: 'answer'; round: 1 | 2 }
  | { at: 'marking'; round: 1 | 2 }
  | { at: 'probing' }
  | { at: 'result' };

function Exchange({ uid, card, deck, settings, hybrid, plan, last, onAnswered, onRevised, onNext, onTypeInstead }: {
  uid: string;
  card: Card;
  deck?: string;
  settings: Settings;
  hybrid: Hybrid;
  plan: VoicePlan;
  last: boolean;
  onAnswered: (a: Attempt) => void;
  onRevised: (a: Attempt) => void;
  onNext: () => void;
  onTypeInstead: () => void;
}) {
  const [step, setStep] = useState<Step>({ at: 'asking' });
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [first, setFirst] = useState('');
  const [followUp, setFollowUp] = useState<{ text: string; engine: Grade['engine']; reason: string } | null>(null);
  const [second, setSecond] = useState('');
  const [typed, setTyped] = useState('');
  const [outcome, setOutcome] = useState<{ attempt: Attempt; grade: Grade; reason: string } | null>(null);
  const mic = useMic(plan.listen, settings);
  const nextRef = useRef<HTMLButtonElement>(null);

  const speak = async (text: string, kind: 'question' | 'reply') => {
    await say(text, kind === 'question' ? plan.speakQuestion : plan.speakReply, settings);
  };

  // 1. Read the question, then ask for a confidence.
  useEffect(() => {
    let live = true;
    void speak(card.prompt, 'question').then(() => live && setStep((s) => (s.at === 'asking' ? { at: 'confidence' } : s)));
    return () => {
      live = false;
      hush();
    };
    // Once per card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const listening = mic.state === 'listening';
  const answering = step.at === 'answer';

  const choose = (c: Confidence) => {
    if (step.at !== 'confidence' && step.at !== 'asking') return;
    hush();
    setConfidence(c);
    setStep({ at: 'answer', round: 1 });
    if (plan.listen !== 'type') void mic.start();
  };

  // 3–5. Stop listening, mark, and maybe follow up.
  const finishing = useRef(false);
  const finish = async () => {
    if (step.at !== 'answer' || !confidence || finishing.current) return;
    finishing.current = true;
    try {
      await answered(step.round);
    } finally {
      finishing.current = false;
    }
  };
  const answered = async (round: 1 | 2) => {
    const said = plan.listen === 'type' ? typed.trim() : (await mic.stop()).trim();
    setTyped('');
    if (round === 1) {
      setFirst(said);
      setStep({ at: 'marking', round: 1 });
      const marked = await grade(card.prompt, card.keyPoints, said, settings, hybrid);
      if (marked.value.check) recordAudit(uid, { cardId: card.id, nano: marked.value.check.nano, cloud: marked.value.check.cloud, agree: marked.value.check.agree, doubt: marked.doubt?.value ?? 0, kind: 'escalated' });
      firstMark.current = { marked: marked.value, reason: marked.route.reason, secondOpinion: marked.secondOpinion, doubt: marked.doubt?.value ?? 0 };
      if (said && shouldProbe(marked.value, 0)) {
        setStep({ at: 'probing' });
        const p = await probe(card.prompt, said, marked.value.missing, settings, hybrid.policy);
        setFollowUp({ text: p.value, engine: p.engine, reason: p.route.reason });
        await speak(p.value, 'reply');
        setStep({ at: 'answer', round: 2 });
        if (plan.listen !== 'type') void mic.start();
        return;
      }
      return conclude(said, null, null, null);
    }
    setSecond(said);
    setStep({ at: 'marking', round: 2 });
    // The second answer is marked against what was still missing.
    const missing = firstMark.current!.marked.missing;
    const again = said ? (await grade(`${card.prompt} (follow-up: ${followUp?.text ?? ''})`, missing, said, settings)).value : null;
    return conclude(first, followUp?.text ?? null, said, again);
  };

  const firstMark = useRef<{ marked: Grade; reason: string; secondOpinion?: Promise<Grade | null>; doubt: number } | null>(null);

  const conclude = async (said1: string, probeText: string | null, said2: string | null, again: Grade | null) => {
    const fm = firstMark.current!;
    const merged = mergeOral(fm.marked, again ? remap(again, card.keyPoints) : null, card.keyPoints);
    const attempt = recordAnswer(uid, card, oralTranscript(said1, probeText, said2), confidence!, merged, 'oral');
    onAnswered(attempt);
    setOutcome({ attempt, grade: merged, reason: fm.reason });
    setStep({ at: 'result' });
    const verdict = merged.score >= 0.9 ? 'Spot on.' : merged.score >= RIGHT ? 'Got it.' : merged.score >= 0.4 ? 'Partly there.' : 'Not yet.';
    void speak(`${verdict} ${merged.feedback}`, 'reply');

    // The background spot-check of Nano's first mark: if the cloud disagrees, its mark becomes
    // the base and the card is rescheduled, as in a typed session.
    if (fm.secondOpinion) {
      const cloud = await fm.secondOpinion;
      if (!cloud) return;
      const nano = fm.marked.score;
      const agree = agrees(nano, cloud.score);
      recordAudit(uid, { cardId: card.id, nano, cloud: cloud.score, agree, doubt: fm.doubt, kind: 'spot-check' });
      if (!agree) {
        const base = { ...cloud, check: { kind: 'spot-check' as const, nano, cloud: cloud.score, agree } };
        const revisedGrade = mergeOral(base, again ? remap(again, card.keyPoints) : null, card.keyPoints);
        const revised: Attempt = { ...attempt, grade: revisedGrade };
        reviseAnswer(uid, card, attempt, revisedGrade);
        onRevised(revised);
        setOutcome((o) => (o ? { ...o, attempt: revised, grade: revisedGrade } : o));
      }
    }
  };

  useEffect(() => {
    if (step.at === 'result') nextRef.current?.focus();
  }, [step.at]);

  // Keyboard.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.tagName === 'TEXTAREA';
      if (typing && !(e.key === 'Enter' && (e.ctrlKey || e.metaKey))) return;
      if ((step.at === 'confidence' || step.at === 'asking') && ['1', '2', '3', '4'].includes(e.key)) choose(Number(e.key) as Confidence);
      else if (answering && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        void finish();
      } else if (e.key.toLowerCase() === 'r' && step.at !== 'result') void speak(followUp && step.at === 'answer' && step.round === 2 ? followUp.text : card.prompt, followUp ? 'reply' : 'question');
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  });

  const g = outcome?.grade;
  const tone = g ? (g.score >= RIGHT ? 'good' : g.score >= 0.4 ? 'mid' : 'low') : '';
  const speaking = step.at === 'asking' || step.at === 'probing';

  return (
    <div className="study-body viva-body">
      <div className="qcard">
        <div className="qcard-head">
          <p className="eyebrow">{deck ?? 'Question'}</p>
          <button className="icon-btn" onClick={() => void speak(card.prompt, 'question')} aria-label="Read the question again" title="Read again (R)"><Icon name="repeat" size={18} /></button>
        </div>
        <h1 className="question">{card.prompt}</h1>
      </div>

      {followUp && step.at !== 'result' && (
        <div className="viva-probe">
          <span className="viva-probe-tag"><Icon name="mic" size={13} /> Follow-up</span>
          <p>{followUp.text}</p>
          <EngineBadge engine={followUp.engine} route={{ run: followUp.engine === 'local' ? 'local' : 'model', mode: 'only_on_device', chunks: 1, reason: followUp.reason }} />
        </div>
      )}

      {(step.at === 'asking' || step.at === 'confidence') && (
        <div className="answer-area">
          <p className="label">How sure are you?</p>
          <div className="confidence" role="radiogroup" aria-label="Confidence">
            {([1, 2, 3, 4] as Confidence[]).map((c) => (
              <button key={c} role="radio" aria-checked={confidence === c} className={`conf conf-${c}${confidence === c ? ' chosen' : ''}`} onClick={() => choose(c)}>
                <kbd>{c}</kbd>
                <span className="conf-label">{CONFIDENCE_LABEL[c]}</span>
                <span className="conf-pct">{Math.round(CONFIDENCE_CLAIM[c] * 100)}%</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {answering && (
        <div className="answer-area">
          {plan.listen === 'type' ? (
            <textarea autoFocus rows={4} className="answer-box" placeholder={step.round === 2 ? 'Answer the follow-up.' : 'Answer in your own words.'} value={typed} onChange={(e) => setTyped(e.target.value)} />
          ) : (
            <MicPanel listen={plan.listen} state={mic.state} level={mic.level} seconds={mic.seconds} text={mic.text} error={mic.error} />
          )}
          <div className="actions end">
            {plan.listen !== 'type' && (
              <button className="btn ghost" onClick={() => (mic.cancel(), onTypeInstead())}><Icon name="edit" size={16} /> Type instead</button>
            )}
            {plan.listen !== 'type' && mic.state !== 'listening' && mic.state !== 'transcribing' ? (
              <button className="btn primary lg" onClick={() => void mic.start()}><Icon name="mic" size={18} /> {mic.error ? 'Try again' : 'Start talking'}</button>
            ) : (
              <button className="btn primary lg" onClick={() => void finish()} disabled={mic.state === 'transcribing' || (plan.listen === 'type' && !typed.trim())}>
                {listening ? <><Icon name="stop" size={16} /> I’m done</> : 'Check my answer'}
              </button>
            )}
          </div>
          <p className="muted small hide-touch end-note">{plan.listen === 'type' ? <><kbd>Ctrl</kbd> + <kbd>Enter</kbd> to check</> : <><kbd>Space</kbd> done · <kbd>R</kbd> repeat</>}</p>
        </div>
      )}

      {(step.at === 'marking' || step.at === 'probing' || mic.state === 'transcribing') && (
        <div className="viva-wait">
          <span className={`viva-orb ${speaking ? 'speaking' : 'thinking'}`} aria-hidden><Icon name={speaking ? 'speaker' : 'sparkle'} size={28} /></span>
          <p className="muted">{mic.state === 'transcribing' ? 'Transcribing…' : step.at === 'probing' ? 'Preparing a follow-up…' : 'Marking…'}</p>
        </div>
      )}

      {step.at === 'result' && g && outcome && (
        <div className="result">
          <div className={`verdict tone-${tone}`}>
            <Ring value={g.score} size={84} stroke={8}>
              <span className="ring-num sm">{Math.round(g.score * 100)}%</span>
            </Ring>
            <div>
              <h2>{g.score >= 0.9 ? 'Spot on.' : g.score >= RIGHT ? 'Got it.' : g.score >= 0.4 ? 'Partly there.' : 'Not yet.'}</h2>
              <p>{g.feedback}</p>
              <EngineBadge engine={g.engine} route={{ run: g.engine === 'local' ? 'local' : 'model', mode: g.engine === 'cloud' ? 'only_in_cloud' : 'only_on_device', chunks: 1, reason: outcome.reason }} />
            </div>
          </div>

          <ul className="points">
            {g.covered.map((p) => <li key={p} className="hit"><Icon name="check" size={15} /> {p}</li>)}
            {(g.prompted ?? []).map((p) => <li key={p} className="prompted"><Icon name="bulb" size={15} /> {p} <span className="muted small">after follow-up · half</span></li>)}
            {g.missing.map((p) => <li key={p} className="miss"><Icon name="x" size={15} /> {p}</li>)}
          </ul>

          <div className="compare">
            <div>
              <span className="muted small">What you said</span>
              <p>{first || <em className="muted">Nothing was heard.</em>}</p>
              {followUp && (
                <>
                  <span className="muted small">Follow-up: {followUp.text}</span>
                  <p>{second || <em className="muted">No answer.</em>}</p>
                </>
              )}
            </div>
            <div><span className="muted small">Model answer</span><p>{card.answer}</p></div>
          </div>

          <div className="actions end">
            <span className="muted small hide-touch"><kbd>Enter</kbd> to continue</span>
            <button ref={nextRef} className="btn primary lg" onClick={() => (hush(), onNext())}>
              {last ? 'See results' : 'Next question'} <Icon name="arrow" size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The microphone while answering: a live level, the time, and the words as they are heard. */
function MicPanel({ listen, state, level, seconds, text, error }: { listen: Listen; state: string; level: number; seconds: number; text: string; error: string | null }) {
  const bars = 24;
  const on = state === 'listening';
  return (
    <div className={`mic-panel${on ? ' on' : ''}`}>
      <div className="mic-row">
        <span className={`viva-orb ${on ? 'listening' : 'idle'}`} style={{ ['--lvl' as string]: level }} aria-hidden><Icon name="mic" size={26} /></span>
        <div className="mic-meter" aria-hidden>
          {Array.from({ length: bars }, (_, i) => {
            // A gentle wave shaped by the live level, tallest in the middle.
            const shape = Math.sin(((i + 0.5) / bars) * Math.PI);
            const h = on ? 12 + shape * level * 88 * (0.75 + 0.25 * Math.sin(i * 1.7 + seconds)) : 8;
            return <span key={i} style={{ height: `${Math.max(8, Math.min(100, h))}%` }} />;
          })}
        </div>
        <span className="mic-time small muted">{on ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : ''}</span>
      </div>
      <p className={`mic-text${text ? '' : ' muted'}`} aria-live="polite">
        {error ?? (text || (on ? (listen === 'device' ? 'Listening…' : 'Recording…') : ''))}
      </p>
      <span className="muted small mic-where"><Icon name={listen === 'device' ? 'device' : 'cloud'} size={13} /> {listen === 'device' ? 'On this device' : 'Transcribed by Gemini'}</span>
    </div>
  );
}

/** The follow-up was marked against the missing points only; its key points are those same strings. */
function remap(g: Grade, keyPoints: string[]): Grade {
  return { ...g, covered: g.covered.filter((p) => keyPoints.includes(p)) };
}
