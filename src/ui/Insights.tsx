/**
 * Calibration, shown plainly: for each confidence level, what you claimed against how often
 * you were actually right, and the questions you were certain about and got wrong.
 */
import { calibrate, MIN_ATTEMPTS } from '../core/calibration';
import { CONFIDENCE_LABEL, type Attempt, type Card } from '../core/types';

export function Insights({ attempts, cards, onBack }: { attempts: Attempt[]; cards: Card[]; onBack: () => void }) {
  const c = calibrate(attempts);
  const byId = new Map(cards.map((card) => [card.id, card]));
  const engines = { 'on-device': 0, cloud: 0, local: 0 };
  for (const a of attempts) engines[a.grade.engine]++;

  return (
    <section className="panel">
      <h2>How well do you know what you know?</h2>
      {c.verdict === 'not enough data' ? (
        <p>Answer at least {MIN_ATTEMPTS} cards to see your calibration. So far: {c.attempts}.</p>
      ) : (
        <p className="big-line">
          {c.verdict === 'overconfident' && `You tend to be overconfident: on average you expect ${Math.round(c.gap * 100)} points more than you score.`}
          {c.verdict === 'underconfident' && `You know more than you think: you score ${Math.round(-c.gap * 100)} points above what you expect.`}
          {c.verdict === 'well calibrated' && 'Well calibrated: your confidence matches your results.'}
        </p>
      )}

      <div className="levels" role="table" aria-label="Claimed versus actual, by confidence">
        {c.levels.map((l) => (
          <div className="level" role="row" key={l.confidence}>
            <span role="cell" className="level-name">{CONFIDENCE_LABEL[l.confidence]}</span>
            <span role="cell" className="bars">
              <span className="bar claimed" style={{ width: `${l.claimed * 100}%` }} title={`Claimed ${Math.round(l.claimed * 100)}%`} />
              {l.actual !== null && <span className="bar actual" style={{ width: `${Math.max(1, l.actual * 100)}%` }} title={`Actual ${Math.round(l.actual * 100)}%`} />}
            </span>
            <span role="cell" className="small muted">
              {l.actual === null ? 'no answers' : `${Math.round(l.actual * 100)}% right of ${l.count}`}
            </span>
          </div>
        ))}
        <p className="legend small muted"><span className="swatch claimed" /> what you claimed <span className="swatch actual" /> how often you were right</p>
      </div>

      {c.confidentMisses.length > 0 && (
        <>
          <h3>Certain, but wrong</h3>
          <p className="muted small">These felt known and were not: the most valuable cards to practise.</p>
          <ul>
            {c.confidentMisses.slice(0, 8).map((id) => byId.get(id) && <li key={id}>{byId.get(id)!.prompt}</li>)}
          </ul>
        </>
      )}

      {attempts.length > 0 && (
        <p className="muted small">
          Of {attempts.length} answers, {engines['on-device']} were marked on this device, {engines.cloud} in the cloud and {engines.local} by the offline marker.
        </p>
      )}
      <button onClick={onBack}>Back</button>
    </section>
  );
}
