/** The built-in model (Gemini Nano): its state, and asking before its download. Used by the AI engine page and Settings. */
import type { ReactNode } from 'react';
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
  return <p className="state off">Not available in this browser. Your answers are marked in the cloud instead.</p>;
}
