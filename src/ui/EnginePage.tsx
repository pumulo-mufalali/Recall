/**
 * Where Recall's AI works, in plain words: the AI built into Chrome (with its one-time
 * download), the cloud, and, for the everyday jobs, where each one happens right now. Go offline
 * or get the built-in AI and the list changes in front of you. How the routing decides is in
 * core/route.ts; it is not shown here, so the page stays readable for anyone.
 */
import { askDownload, ModelState } from './ModelState';
import { POLICY_HELP, POLICY_LABEL, type Policy } from '../core/audit';
import { route, type Route, type Task } from '../core/route';
import { engineSplit } from '../core/stats';
import type { Attempt } from '../core/types';
import type { Settings } from '../services/firebase';
import { useConfirm } from './Dialog';
import { Icon } from './Icon';
import type { LiveConditions } from './useConditions';

const TASKS: { label: string; task: Task }[] = [
  { label: 'Marking your answers', task: { kind: 'grade', chars: 200 } },
  { label: 'Questions from notes or a photo', task: { kind: 'generate', source: 'text', chars: 4000 } },
  { label: 'Questions from a PDF', task: { kind: 'generate', source: 'pdf', bytes: 2_000_000 } },
  { label: 'Talking it through', task: { kind: 'tutor' } },
  { label: 'The Trap Gauntlet', task: { kind: 'gauntlet' } },
];

export function EnginePage({ conditions: c, settings, attempts, policy }: {
  conditions: LiveConditions;
  settings: Settings;
  attempts: Attempt[];
  policy: Policy;
}) {
  const [ask, dialog] = useConfirm();
  const split = engineSplit(attempts);
  const total = attempts.length;
  const getModel = () => askDownload(ask, c);

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">AI engine</p>
          <h1>Where your AI works</h1>
          <p className="muted">Everyday work happens on this device: fast, free and private. Big jobs, like a PDF, go to the cloud.</p>
        </div>
      </header>

      <section className="engine-cards">
        <div className={`engine-card ${c.device === 'available' ? 'live' : ''}`}>
          <span className="engine-icon device"><Icon name="device" size={22} /></span>
          <div>
            <h3>Built-in AI <span className="muted small">on this device</span></h3>
            <p className="muted small">Part of Chrome. Free, instant and private, and it works offline.</p>
            <ModelState c={c} onGet={getModel} />
          </div>
        </div>
        <div className={`engine-card ${c.online ? 'live' : ''}`}>
          <span className="engine-icon cloud"><Icon name="cloud" size={22} /></span>
          <div>
            <h3>Cloud AI <span className="muted small">online</span></h3>
            <p className="muted small">For PDFs, long chapters and fact-checking.</p>
            <p className={`state ${c.online ? 'ok' : 'off'}`}><Icon name={c.online ? 'wifi' : 'wifiOff'} size={15} /> {c.online ? 'Connected' : 'Offline'}</p>
          </div>
        </div>
        <div className="engine-card">
          <span className="engine-icon local"><Icon name="local" size={22} /></span>
          <div>
            <h3>Offline backup</h3>
            <p className="muted small">If no AI can run, Recall still marks your answer by checking its key points.</p>
            <p className="state ok"><Icon name="check" size={15} /> Always available</p>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h3>Right now</h3>
          <span className="muted small">{c.online ? 'Online' : 'Offline'}</span>
        </div>
        <ul className="routes plain">
          {TASKS.map((t) => (
            <li key={t.label}>
              <span className="route-task"><strong>{t.label}</strong></span>
              <RouteChip r={route(t.task, c, settings)} />
            </li>
          ))}
        </ul>
      </section>

      <div className="split">
        <section className="card">
          <div className="card-head"><h3>Who marked your answers</h3><span className="muted small">{total} in all</span></div>
          {total ? (
            <>
              <div className="stack-bar" role="img" aria-label={`${split['on-device']} on this device, ${split.cloud} in the cloud, ${split.local} by the offline backup`}>
                {(['on-device', 'cloud', 'local'] as const).map((e) => split[e] > 0 && <span key={e} className={`sb-${e}`} style={{ width: `${(split[e] / total) * 100}%` }} />)}
              </div>
              <ul className="legend-list">
                <li><span className="swatch sb-on-device" /> On this device <b>{split['on-device']}</b></li>
                <li><span className="swatch sb-cloud" /> Cloud <b>{split.cloud}</b></li>
                <li><span className="swatch sb-local" /> Offline backup <b>{split.local}</b></li>
              </ul>
            </>
          ) : (
            <p className="muted small">No answers yet.</p>
          )}
        </section>

        <section className="card">
          <div className="card-head"><h3>Privacy</h3></div>
          <p className="policy-now">
            <Icon name={policy === 'private' ? 'shield' : policy === 'accurate' ? 'check' : 'device'} size={15} />
            <span>Privacy mode: <b>{POLICY_LABEL[policy]}</b></span>
            <a className="small" href="#/settings">Change in Settings</a>
          </p>
          <p className="muted small">{POLICY_HELP[policy]}</p>
        </section>
      </div>
      {dialog}
    </div>
  );
}

function RouteChip({ r }: { r: Route }) {
  if (r.run === 'queue') return <span className="rchip rchip-queue"><Icon name="clock" size={13} /> Waits for a connection</span>;
  if (r.run === 'local') return <span className="rchip rchip-local"><Icon name="local" size={13} /> {r.reason.includes('needs') ? 'Not available' : 'Offline backup'}</span>;
  const device = r.mode.includes('device');
  return (
    <span className={`rchip rchip-${device ? 'device' : 'cloud'}`}>
      <Icon name={device ? 'device' : 'cloud'} size={13} /> {device ? 'On this device' : 'Cloud'}
    </span>
  );
}
