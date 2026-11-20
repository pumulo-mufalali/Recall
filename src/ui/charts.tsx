/** Small charts drawn as inline SVG and CSS, so they need no library and work offline. */
import type { ReactNode } from 'react';
import type { LevelStats } from '../core/calibration';
import { CONFIDENCE_LABEL } from '../core/types';

export function Ring({ value, size = 96, stroke = 8, children }: { value: number; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.min(1, Math.max(0, value));
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * v} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dasharray .6s ease' }}
        />
      </svg>
      <div className="ring-inner">{children}</div>
    </div>
  );
}

/** Known, learning and new, as one segmented bar. */
export function ProgressBar({ known, learning, total }: { known: number; learning: number; total: number }) {
  const pct = (n: number) => `${total ? (n / total) * 100 : 0}%`;
  return (
    <span className="pbar" role="img" aria-label={`${known} known, ${learning} learning, ${total - known - learning} new, of ${total}`}>
      <span className="pbar-known" style={{ width: pct(known) }} />
      <span className="pbar-learning" style={{ width: pct(learning) }} />
    </span>
  );
}

const WEEKDAYS = ['Mon', '', 'Wed', '', 'Fri', '', ''];

/**
 * Answers per day as a grid: one column per week (Monday at the top), with month names
 * where a new month starts, Mon/Wed/Fri down the side and a Less-to-More legend.
 */
export function Heatmap({ cols }: { cols: { day: string; count: number; future: boolean }[][] }) {
  const max = Math.max(1, ...cols.flat().map((d) => d.count));
  const level = (n: number) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)));
  const monthOf = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { month: 'short' });
  // A column is labelled when the month of its first day differs from the previous column's
  // (the first column only if it starts in the first week of its month, to avoid a stray label).
  const months = cols.map((col, i) => {
    const m = monthOf(col[0].day);
    if (i === 0) return Number(col[0].day.slice(8)) <= 7 ? m : '';
    return m !== monthOf(cols[i - 1][0].day) ? m : '';
  });
  return (
    <div className="heatmap-wrap">
      <div className="heatmap" role="img" aria-label="Answers per day over recent weeks" style={{ gridTemplateColumns: `auto repeat(${cols.length}, minmax(0, 18px))` }}>
        {months.map((m, i) => <span key={`m${i}`} className="heat-month" style={{ gridColumn: i + 2, gridRow: 1 }}>{m}</span>)}
        {WEEKDAYS.map((w, r) => <span key={`w${r}`} className="heat-weekday" style={{ gridColumn: 1, gridRow: r + 2 }}>{w}</span>)}
        {cols.map((col, i) =>
          col.map((d, r) => (
            <span
              key={d.day}
              className={`heat heat-${d.future ? 'future' : level(d.count)}`}
              style={{ gridColumn: i + 2, gridRow: r + 2 }}
              title={d.future ? '' : `${d.day}: ${d.count} ${d.count === 1 ? 'answer' : 'answers'}`}
            />
          )),
        )}
      </div>
      <div className="heat-legend" aria-hidden>
        Less {[0, 1, 2, 3, 4].map((l) => <span key={l} className={`heat heat-${l}`} />)} More
      </div>
    </div>
  );
}

/**
 * Claimed against actual, per confidence level: a reliability diagram as paired columns.
 * The dashed marker on each column is what that level claims; the bar is how often it was right.
 */
export function CalibrationChart({ levels }: { levels: LevelStats[] }) {
  return (
    <div className="calib" role="table" aria-label="Claimed versus actual, by confidence">
      <div className="calib-plot">
        <div className="calib-grids" aria-hidden>
          {[100, 75, 50, 25, 0].map((t) => (
            <span key={t} className="calib-grid" style={{ bottom: `${t}%` }}><span>{t}%</span></span>
          ))}
        </div>
        {levels.map((l) => {
          const off = l.actual === null ? null : l.actual - l.claimed;
          const tone = off === null ? 'none' : Math.abs(off) <= 0.12 ? 'good' : off < 0 ? 'over' : 'under';
          return (
            <div className="calib-col" role="row" key={l.confidence}>
              <div className="calib-bar-area">
                {l.actual !== null && <span className={`calib-bar tone-${tone}`} style={{ height: `${Math.max(2, l.actual * 100)}%` }} />}
                <span className="calib-claim" style={{ bottom: `${l.claimed * 100}%` }} title={`Claims ${Math.round(l.claimed * 100)}%`} />
              </div>
              <span role="cell" className="calib-name">{CONFIDENCE_LABEL[l.confidence]}</span>
              <span role="cell" className="calib-val">{l.actual === null ? '–' : `${Math.round(l.actual * 100)}%`}<small> of {l.count}</small></span>
            </div>
          );
        })}
      </div>
      <p className="legend small muted">
        <span className="swatch claim" /> what that confidence claims <span className="swatch actual" /> how often you were right
      </p>
    </div>
  );
}

export function TrendChart({ points }: { points: { day: string; accuracy: number; count: number }[] }) {
  if (points.length < 2) return <p className="muted small">Study on two or more days to see a trend.</p>;
  const w = 320;
  const h = 120;
  const pad = 8;
  const x = (i: number) => pad + (i / (points.length - 1)) * (w - pad * 2);
  const y = (v: number) => h - pad - v * (h - pad * 2);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.accuracy).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${h - pad} L${x(0).toFixed(1)},${h - pad} Z`;
  return (
    <svg className="trend" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="Share of answers right per study day">
      <line x1={pad} x2={w - pad} y1={y(0.7)} y2={y(0.7)} className="trend-target" />
      <path d={area} className="trend-area" />
      <path d={line} className="trend-line" vectorEffect="non-scaling-stroke" />
      {points.map((p, i) => (
        <circle key={p.day} cx={x(i)} cy={y(p.accuracy)} r={3} className="trend-dot">
          <title>{`${p.day}: ${Math.round(p.accuracy * 100)}% right of ${p.count}`}</title>
        </circle>
      ))}
    </svg>
  );
}
