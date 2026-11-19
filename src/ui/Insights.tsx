/**
 * Calibration, shown plainly: for each confidence level, what you claimed against how often
 * you were actually right; the trend over time; the questions you were certain about and got
 * wrong; and how each deck is going.
 */
import { useMemo } from 'react';
import { calibrate, MIN_ATTEMPTS, RIGHT } from '../core/calibration';
import { accuracyTrend, deckProgress } from '../core/stats';
import type { Attempt, Card, Deck } from '../core/types';
import { CalibrationChart, TrendChart } from './charts';
import { Icon } from './Icon';
import { href } from './router';

export function Insights({ attempts, cards, decks }: { attempts: Attempt[]; cards: Card[]; decks: Deck[] }) {
  const c = useMemo(() => calibrate(attempts), [attempts]);
  const trend = useMemo(() => accuracyTrend(attempts, 21), [attempts]);
  const byId = new Map(cards.map((card) => [card.id, card]));
  const right = attempts.length ? attempts.filter((a) => a.grade.score >= RIGHT).length / attempts.length : 0;
  const enough = c.verdict !== 'not enough data';

  if (!attempts.length) {
    return (
      <div className="stack">
        <header className="page-head"><div><p className="eyebrow">Insights</p><h1>How well do you know what you know?</h1></div></header>
        <div className="empty">
          <span className="empty-icon"><Icon name="insights" size={30} /></span>
          <h2>No answers yet</h2>
          <p className="muted">After every answer you say how sure you are. Once you have answered {MIN_ATTEMPTS} cards, this page shows where your confidence can be trusted, and where it fools you.</p>
          <a className="btn primary" href="#/study">Start studying</a>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <header className="page-head"><div><p className="eyebrow">Insights</p><h1>How well do you know what you know?</h1></div></header>

      <section className={`verdict-card v-${c.verdict.replace(/ /g, '-')}`}>
        <div className="verdict-main">
          <p className="eyebrow">Your calibration</p>
          {enough ? (
            <h2>
              {c.verdict === 'overconfident' && <>You tend to be <em>overconfident</em>.</>}
              {c.verdict === 'underconfident' && <>You know <em>more than you think</em>.</>}
              {c.verdict === 'well calibrated' && <>You are <em>well calibrated</em>.</>}
            </h2>
          ) : (
            <h2>Answer {MIN_ATTEMPTS - c.attempts} more to see your calibration.</h2>
          )}
          <p className="muted">
            {enough && c.verdict === 'overconfident' && `On average you expect ${Math.round(c.gap * 100)} points more than you score. The cards below are where that shows.`}
            {enough && c.verdict === 'underconfident' && `You score ${Math.round(-c.gap * 100)} points above what you expect. Trust your recall a little more.`}
            {enough && c.verdict === 'well calibrated' && 'When you feel sure you usually are, and when you doubt yourself it is with reason.'}
            {!enough && `${c.attempts} of ${MIN_ATTEMPTS} answers so far. A handful of answers says little.`}
          </p>
        </div>
        <div className="verdict-stats">
          <div><span className="stat-num">{attempts.length}</span><span className="muted small">answers</span></div>
          <div><span className="stat-num">{Math.round(right * 100)}%</span><span className="muted small">right</span></div>
          <div title="Brier score: the mean squared error of your confidence. 0 is perfect; 0.25 is no better than a coin flip.">
            <span className="stat-num">{c.brier.toFixed(2)}</span><span className="muted small">Brier score</span>
          </div>
        </div>
      </section>

      <div className="split">
        <section className="card">
          <div className="card-head"><h3>Claimed vs actual</h3></div>
          <p className="muted small">Each column is a confidence level. When the bar reaches its dashed line, that confidence can be trusted.</p>
          <CalibrationChart levels={c.levels} />
        </section>
        <section className="card">
          <div className="card-head"><h3>Accuracy by day</h3><span className="muted small">dashed line: 70%, counted as right</span></div>
          <TrendChart points={trend} />
        </section>
      </div>

      {c.confidentMisses.length > 0 && (
        <section className="card">
          <div className="card-head">
            <h3><Icon name="warn" size={18} /> Certain, but wrong</h3>
            <span className="muted small">felt known, was not: the most valuable cards to practise</span>
          </div>
          <ul className="rows">
            {c.confidentMisses.slice(0, 8).map((id) => {
              const card = byId.get(id);
              if (!card) return null;
              return (
                <li key={id}>
                  <a className="row-item link-row" href={href({ name: 'deck', id: card.deckId })}>
                    <span className="row-icon tone-bad"><Icon name="x" size={16} /></span>
                    <span className="row-main"><strong>{card.prompt}</strong><span className="muted small">{decks.find((d) => d.id === card.deckId)?.title}</span></span>
                    <Icon name="arrow" size={16} />
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {decks.length > 0 && (
        <section className="card">
          <div className="card-head"><h3>By deck</h3></div>
          <table className="table">
            <thead><tr><th>Deck</th><th>Known</th><th>Right</th><th>Due</th></tr></thead>
            <tbody>
              {decks.map((d) => {
                const p = deckProgress(cards.filter((x) => x.deckId === d.id), attempts, new Date());
                return (
                  <tr key={d.id}>
                    <td><a href={href({ name: 'deck', id: d.id })}>{d.title}</a></td>
                    <td>{p.known}/{p.total}</td>
                    <td>{p.accuracy === null ? '–' : `${Math.round(p.accuracy * 100)}%`}</td>
                    <td>{p.due || '–'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
