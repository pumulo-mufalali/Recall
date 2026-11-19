/**
 * Where Recall's AI runs, live: the connection, Chrome's built-in model (with the one-time
 * download), and for every kind of work the route the router would pick right now and why.
 * Go offline or install the model and the table changes in front of you.
 */
import { POLICY_HELP, POLICY_LABEL, thresholds, type Audit, type Policy, type Trust } from '../core/audit';
import { route, type Route, type Task } from '../core/route';
import { Ring } from './charts';
import { engineSplit } from '../core/stats';
import type { Attempt } from '../core/types';
import type { Settings } from '../services/firebase';
import { useConfirm } from './Dialog';
import { Icon } from './Icon';
import type { LiveConditions } from './useConditions';

const TASKS: { label: string; detail: string; task: Task }[] = [
  { label: 'Mark an answer', detail: 'Every card you answer', task: { kind: 'grade', chars: 200 } },
  { label: 'Questions from short notes', detail: 'Up to a few pages of text', task: { kind: 'generate', source: 'text', chars: 4000 } },
  { label: 'Questions from a long chapter', detail: '40,000 characters', task: { kind: 'generate', source: 'text', chars: 40000 } },
  { label: 'Questions from a photo', detail: 'A JPEG of a page', task: { kind: 'generate', source: 'image', mime: 'image/jpeg', bytes: 1_500_000 } },
  { label: 'Questions from a PDF', detail: 'Slides, a paper', task: { kind: 'generate', source: 'pdf', bytes: 2_000_000 } },
  { label: 'Fact-check new cards', detail: 'Against your notes', task: { kind: 'verify', source: 'text', chars: 4000 } },
  { label: 'Explain a missed card', detail: 'When you ask why', task: { kind: 'explain' } },
];

export function EnginePage({ conditions: c, settings, attempts, audits, trust, policy, onPolicy }: {
  conditions: LiveConditions;
  settings: Settings;
  attempts: Attempt[];
  audits: Audit[];
  trust: Trust;
  policy: Policy;
  onPolicy: (p: Policy) => void;
}) {
  const [ask, dialog] = useConfirm();
  const split = engineSplit(attempts);
  const total = attempts.length;

  const getModel = async () => {
    const yes = await ask({
      title: 'Download the built-in AI?',
      body: (
        <>
          <p>Chrome will download Gemini Nano, a one-time download of a few gigabytes that every site shares. Chrome needs plenty of free disk space.</p>
          <p>Once it is in, your answers are marked on this device: instantly, privately and offline. Until then, Recall marks answers in the cloud.</p>
        </>
      ),
      confirm: 'Download',
    });
    if (yes) c.download();
  };

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">AI engine</p>
          <h1>Hybrid AI, out in the open</h1>
          <p className="muted">Recall uses two Gemini models as a team through Firebase AI Logic. Small, frequent and private work stays on your device; rare, heavy work goes to the cloud. Here is what it would do right now.</p>
        </div>
      </header>

      <section className="engine-cards">
        <div className={`engine-card ${c.device === 'available' ? 'live' : ''}`}>
          <span className="engine-icon device"><Icon name="device" size={22} /></span>
          <div>
            <h3>Gemini Nano <span className="muted small">on this device</span></h3>
            <p className="muted small">Built into Chrome. Free, instant, private, works offline. Text and JPEG/PNG, about 9,000 tokens.</p>
            <ModelState c={c} onGet={getModel} />
          </div>
        </div>
        <div className={`engine-card ${c.online ? 'live' : ''}`}>
          <span className="engine-icon cloud"><Icon name="cloud" size={22} /></span>
          <div>
            <h3>Gemini <span className="muted small">in the cloud</span></h3>
            <p className="muted small">Larger and multimodal: PDFs, long chapters, fact-checking. Protected by Firebase App Check.</p>
            <p className={`state ${c.online ? 'ok' : 'off'}`}><Icon name={c.online ? 'wifi' : 'wifiOff'} size={15} /> {c.online ? 'Reachable' : 'Offline'}</p>
          </div>
        </div>
        <div className="engine-card">
          <span className="engine-icon local"><Icon name="local" size={22} /></span>
          <div>
            <h3>Offline marker <span className="muted small">no model</span></h3>
            <p className="muted small">When neither model can run, Recall matches your answer against the card’s key points, so studying never stops.</p>
            <p className="state ok"><Icon name="check" size={15} /> Always available</p>
          </div>
        </div>
      </section>

      <TrustPanel trust={trust} audits={audits} attempts={attempts} policy={policy} onPolicy={onPolicy} />

      <section className="card">
        <div className="card-head">
          <h3>Routing, right now</h3>
          <span className="muted small">{c.online ? 'online' : 'offline'} · built-in model {c.device}</span>
        </div>
        <ul className="routes">
          {TASKS.map((t) => {
            const r = route(t.task, c, settings);
            return (
              <li key={t.label}>
                <span className="route-task"><strong>{t.label}</strong><span className="muted small">{t.detail}</span></span>
                <RouteChip r={r} />
                <span className="route-why small muted">{r.reason}</span>
              </li>
            );
          })}
        </ul>
        <p className="muted small">Try it: switch to airplane mode and watch these change. Long text offline is split into pieces the device can read one by one.</p>
      </section>

      <div className="split">
        <section className="card">
          <div className="card-head"><h3>Who marked your answers</h3><span className="muted small">{total} in all</span></div>
          {total ? (
            <>
              <div className="stack-bar" role="img" aria-label={`${split['on-device']} on device, ${split.cloud} in the cloud, ${split.local} by the offline marker`}>
                {(['on-device', 'cloud', 'local'] as const).map((e) => split[e] > 0 && <span key={e} className={`sb-${e}`} style={{ width: `${(split[e] / total) * 100}%` }} />)}
              </div>
              <ul className="legend-list">
                <li><span className="swatch sb-on-device" /> On this device <b>{split['on-device']}</b></li>
                <li><span className="swatch sb-cloud" /> Cloud <b>{split.cloud}</b></li>
                <li><span className="swatch sb-local" /> Offline marker <b>{split.local}</b></li>
              </ul>
            </>
          ) : (
            <p className="muted small">No answers yet.</p>
          )}
        </section>

        <section className="card">
          <div className="card-head"><h3>Configuration</h3><span className="muted small">from Firebase Remote Config</span></div>
          <dl className="config">
            <dt>Writes & marks</dt><dd className="mono">{settings.cloudModel}</dd>
            <dt>Fact-checks & explains</dt><dd className="mono">{settings.checkModel}</dd>
            <dt>Backups when busy</dt><dd className="mono">{settings.fallbackModels.join(', ') || '–'}</dd>
            <dt>Device text limit</dt><dd>{settings.deviceMaxChars.toLocaleString()} characters</dd>
            <dt>Device image limit</dt><dd>{(settings.deviceMaxImageBytes / 1_000_000).toFixed(1)} MB</dd>
            <dt>Cloud marking</dt><dd>{settings.cloudGrading ? 'Allowed when the device cannot mark' : 'Off: answers never leave the device'}</dd>
          </dl>
        </section>
      </div>
      {dialog}
    </div>
  );
}

/**
 * Recall calibrates its own AI: how often the cloud model agrees with Nano's marks, how that
 * trust sets the escalation and spot-check thresholds, and how much writing stayed private.
 */
function TrustPanel({ trust, audits, attempts, policy, onPolicy }: { trust: Trust; audits: Audit[]; attempts: Attempt[]; policy: Policy; onPolicy: (p: Policy) => void }) {
  const th = thresholds(trust, policy);
  const escalated = audits.filter((a) => a.kind === 'escalated').length;
  const spot = audits.filter((a) => a.kind === 'spot-check').length;
  const left = attempts.filter((a) => a.grade.engine === 'cloud').length + spot;
  const stayed = attempts.length ? Math.max(0, attempts.length - left) / attempts.length : null;
  const recent = audits.slice(0, 40).reverse();
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <section className="card trust">
      <div className="card-head">
        <h3>Self-audit: how far can Nano be trusted?</h3>
        <span className="muted small">the cloud model checks a sample of Nano’s marks</span>
      </div>
      <div className="trust-grid">
        <div className="trust-gauge">
          <Ring value={trust.mean} size={128} stroke={11}>
            <span className="ring-num">{pct(trust.mean)}</span>
            <span className="ring-label">trust</span>
          </Ring>
          <p className="small muted center">
            {trust.total ? `${trust.agreed} of ${trust.total} checks agreed` : 'No checks yet: starts cautious'}
            <br />cautious bound {pct(trust.low)}
          </p>
        </div>

        <div className="trust-body">
          <div className="seg" role="radiogroup" aria-label="Privacy mode">
            {(['private', 'balanced', 'accurate'] as Policy[]).map((p) => (
              <button key={p} role="radio" aria-checked={policy === p} className={policy === p ? 'on' : ''} onClick={() => onPolicy(p)}>
                <Icon name={p === 'private' ? 'shield' : p === 'accurate' ? 'check' : 'device'} size={15} /> {POLICY_LABEL[p]}
              </button>
            ))}
          </div>
          <p className="muted small">{POLICY_HELP[policy]}</p>

          <dl className="trust-stats">
            <div><dt>Escalate when doubt is above</dt><dd>{Number.isFinite(th.escalateAbove) ? pct(th.escalateAbove) : 'never'}</dd></div>
            <div><dt>Spot-check confident marks</dt><dd>{pct(th.auditRate)}</dd></div>
            <div><dt>Escalated so far</dt><dd>{escalated}</dd></div>
            <div><dt>Answers that never left this device</dt><dd className="tone-good">{stayed === null ? '–' : pct(stayed)}</dd></div>
          </dl>

          {recent.length > 0 && (
            <div className="audit-strip" role="img" aria-label={`Last ${recent.length} checks, oldest first`}>
              {recent.map((a) => (
                <span key={a.id} className={`audit-dot ${a.agree ? 'ok' : 'bad'} ${a.kind}`} title={`${a.kind}: Nano ${pct(a.nano)} · cloud ${pct(a.cloud)}${a.agree ? ' · agreed' : ' · disagreed'}`} />
              ))}
              <span className="muted small">last {recent.length} checks · ● spot-check ◆ escalated</span>
            </div>
          )}
        </div>
      </div>
      <p className="muted small">
        Each mark is weighed for doubt using free signals: Nano’s own confidence, a plain word-matching check, and how close the mark is to the line between right and wrong.
        Doubtful marks go to the larger model before you see them. The more often the cloud agrees, the less is sent, so privacy is earned, and measured.
      </p>
    </section>
  );
}

function ModelState({ c, onGet }: { c: LiveConditions; onGet: () => void }) {
  if (c.device === 'available') return <p className="state ok"><Icon name="check" size={15} /> Ready</p>;
  if (c.device === 'downloading')
    return (
      <div className="dl">
        <p className="state"><Icon name="download" size={15} /> Downloading{c.progress !== null ? ` · ${Math.round(c.progress * 100)}%` : '…'}</p>
        <div className="dl-bar"><span style={{ width: `${(c.progress ?? 0) * 100}%` }} /></div>
      </div>
    );
  if (c.device === 'downloadable')
    return (
      <button className="btn sm primary" onClick={onGet} disabled={!c.online}>
        <Icon name="download" size={15} /> Get the built-in AI
      </button>
    );
  return <p className="state off">Not available in this browser. Recall uses the cloud, or the offline marker.</p>;
}

function RouteChip({ r }: { r: Route }) {
  if (r.run === 'queue') return <span className="rchip rchip-queue"><Icon name="clock" size={13} /> Waits</span>;
  if (r.run === 'local') return <span className="rchip rchip-local"><Icon name="local" size={13} /> Offline marker</span>;
  const device = r.mode.includes('device');
  return (
    <span className={`rchip rchip-${device ? 'device' : 'cloud'}`}>
      <Icon name={device ? 'device' : 'cloud'} size={13} /> {device ? 'Device' : 'Cloud'}
      {r.chunks > 1 && ` ×${r.chunks}`}
    </span>
  );
}
