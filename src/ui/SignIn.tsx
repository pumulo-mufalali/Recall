/** The front door: what Recall is, how its hybrid AI works, and Google sign-in. */
import { useState } from 'react';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '../services/firebase';
import { Plain, friendly, type Friendly } from '../core/errors';
import { ErrorNote } from './ErrorNote';
import { Icon } from './Icon';
import { Logo } from './Logo';
import { ThemeSwitch } from './ThemeSwitch';

export function SignIn() {
  const [error, setError] = useState<Friendly | null>(null);
  const [busy, setBusy] = useState(false);
  const signIn = () => {
    setBusy(true);
    setError(null);
    signInWithPopup(auth, new GoogleAuthProvider())
      .catch((e) => setError(friendly(navigator.onLine ? e : new Plain('Signing in needs a connection the first time.', 'Connect to the internet and try again.', true))))
      .finally(() => setBusy(false));
  };

  return (
    <div className="welcome">
      <header className="welcome-top">
        <span className="brand"><Logo /></span>
        <ThemeSwitch compact />
      </header>

      <section className="welcome-hero">
        <div className="welcome-copy">
          <p className="eyebrow">Active recall, marked by AI</p>
          <h1>Know what you <em>actually</em> know.</h1>
          <p className="lede">
            Turn your notes, a photo of a page or a PDF into questions. Answer from memory, say how sure you are, and see the honest gap between feeling ready and being ready.
          </p>
          <button className="btn primary lg" onClick={signIn} disabled={busy}>
            <GoogleMark /> {busy ? 'Signing in…' : 'Continue with Google'}
          </button>
          {error && <ErrorNote error={error} onRetry={signIn} />}
          <p className="small muted">Free. Your cards sync across devices and work offline.</p>
        </div>

        <div className="welcome-demo" aria-hidden>
          <div className="demo-card">
            <p className="demo-q">Why does the Moon show phases?</p>
            <p className="demo-a">“Because we see different amounts of its sunlit half as it orbits Earth.”</p>
            <div className="demo-meter"><span style={{ width: '86%' }} /></div>
            <div className="demo-row">
              <span className="badge badge-on-device"><Icon name="device" size={13} /> Marked on this device</span>
              <strong>86%</strong>
            </div>
          </div>
          <div className="demo-card back">
            <p className="demo-q">Certain · 95%</p>
          </div>
        </div>
      </section>

      <section className="welcome-steps">
        <Step icon="device" title="Private, instant marking">
          Your answers are marked by Gemini Nano inside Chrome. They never leave the device, and it works on a plane.
        </Step>
        <Step icon="cloud" title="The cloud for heavy lifting">
          Long chapters and PDFs go to Gemini in the cloud, and a second, larger model fact-checks every card before you learn it.
        </Step>
        <Step icon="insights" title="Confidence, measured">
          Rate how sure you are before each answer. Recall shows where you are overconfident, which is where re-reading fools you.
        </Step>
      </section>
    </div>
  );
}

function Step({ icon, title, children }: { icon: 'device' | 'cloud' | 'insights'; title: string; children: React.ReactNode }) {
  return (
    <div className="step">
      <span className={`step-icon step-${icon}`}><Icon name={icon} /></span>
      <h3>{title}</h3>
      <p className="muted">{children}</p>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
