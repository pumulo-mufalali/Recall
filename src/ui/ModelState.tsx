/** The built-in model (Gemini Nano): its state, and asking before its download. Used by the AI engine page and Settings. */
import { useEffect, useState, type ReactNode } from 'react';
import { deviceReport, type DeviceReport } from '../services/engine';
import { downloadBlocked, useDownloadBlocked } from './dataPolicy';
import { Icon } from './Icon';
import type { LiveConditions } from './useConditions';

/** Asks before downloading the built-in model (a few gigabytes), then starts it. */
export async function askDownload(ask: (a: { title: string; body?: ReactNode; confirm: string }) => Promise<boolean>, c: LiveConditions) {
  // On mobile data, only if the learner allowed it in Settings.
  if (downloadBlocked()) return;
  const yes = await ask({
    title: 'Download the built-in AI?',
    body: (
      <>
        <p>Chrome will download its built-in AI: a one-time download of a few gigabytes, so it needs plenty of free disk space.</p>
        <p><b>Use Wi-Fi, not mobile data or a limited bundle.</b> Recall holds the download back on mobile data unless you allow it in Settings.</p>
        <p>Once it is in, your answers are marked on this device: instantly, privately and offline. Until then, your answers are marked in the cloud, which uses very little data.</p>
      </>
    ),
    confirm: 'Download',
  });
  if (yes) c.download();
}

export function ModelState({ c, onGet }: { c: LiveConditions; onGet: () => void }) {
  const blocked = useDownloadBlocked();
  if (c.device === 'available') return <p className="state ok"><Icon name="check" size={15} /> Ready</p>;
  // Progress is only known for a download started here; otherwise Chrome started it itself
  // (or another site did), and only Chrome can stop it.
  if (c.device === 'downloading' && c.progress !== null)
    return (
      <div className="dl">
        <p className="state"><Icon name="download" size={15} /> Downloading · {Math.round(c.progress * 100)}%</p>
        <div className="dl-bar"><span style={{ width: `${c.progress * 100}%` }} /></div>
      </div>
    );
  if (c.device === 'downloading')
    return (
      <div className="dl">
        <p className="state"><Icon name="download" size={15} /> Chrome is downloading it (a few GB, once)</p>
      </div>
    );
  if (c.device === 'downloadable')
    return (
      <div className="dl">
        <button className="btn sm primary" onClick={onGet} disabled={!c.online || blocked}>
          <Icon name="download" size={15} /> Get the built-in AI
        </button>
        <p className="small muted dl-note">
          {blocked ? <>You are on mobile data. Connect to Wi-Fi, or <a href="#/settings">allow mobile data in Settings</a>.</> : 'A few GB, once. Wi-Fi only, unless you allow mobile data in Settings.'}
        </p>
      </div>
    );
  return <Unavailable />;
}

/**
 * Why the built-in AI is not here, in plain words, with the facts Chrome reports (to pass on
 * when asking for help). Answers are marked in the cloud meanwhile.
 */
function Unavailable() {
  const [r, setR] = useState<DeviceReport | null>(null);
  useEffect(() => void deviceReport().then(setR), []);
  const why = !r
    ? 'Not available in this browser.'
    : r.mobile
      ? 'Phones do not have Chrome’s built-in AI yet.'
      : r.browser !== 'chrome'
        ? 'Only Google Chrome on a computer has this built-in AI.'
        : !r.api
          ? 'Chrome has not switched its built-in AI on for this site.'
          : 'Chrome says this computer cannot run its built-in AI.';
  const help =
    r && !r.mobile && r.browser === 'chrome'
      ? !r.api
        ? 'Update Chrome (menu › Help › About Google Chrome). If it still shows this, open chrome://flags, enable “Prompt API for Gemini Nano” and “Enables optimization guide on device”, then relaunch Chrome.'
        : 'It needs about 22 GB of free disk space, and either 16 GB of memory or a graphics card with more than 4 GB. chrome://on-device-internals shows what Chrome found.'
      : null;
  return (
    <div className="dl">
      <p className="state off">{why} Your answers are marked in the cloud instead.</p>
      {help && <p className="small muted dl-note">{help}</p>}
      {r && (
        <p className="small muted dl-note">
          Details: {r.browser === 'chrome' ? `Chrome ${r.version ?? '?'}` : r.browser === 'edge' ? 'Microsoft Edge' : 'another browser'}
          {r.mobile ? ' on a phone' : ''} · built-in AI for websites: {r.api ? 'on' : 'off'}
          {r.api ? ` · Chrome says: ${r.availability}` : ''}
        </p>
      )}
    </div>
  );
}
