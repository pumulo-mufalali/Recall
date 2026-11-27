/**
 * Everything the learner can set, in one place: account, appearance, study preferences,
 * reminders, AI and privacy, their data (export and deletion), and about.
 */
import { useState, type ReactNode } from 'react';
import { GoogleAuthProvider, deleteUser, linkWithPopup, reauthenticateWithPopup, signOut, updateProfile, type User } from 'firebase/auth';
import { accountInitial, accountName } from './account';
import { POLICY_HELP, POLICY_LABEL, type Policy } from '../core/audit';
import type { Session } from '../core/plan';
import { NEW_CARD_OPTIONS, type StudyPrefs } from '../core/prefs';
import { REMIND_OPTIONS, SESSION_LENGTHS } from '../core/plan';
import type { Attempt, Card, Deck } from '../core/types';
import { auth } from '../services/firebase';
import { deleteAllData, removeStarter, savePrefs, seedStarter } from '../services/store';
import { askDownload, ModelState } from './ModelState';
import { Icon, type IconName } from './Icon';
import { useNotifyPermission } from './reminders';
import { ThemeSwitch } from './ThemeSwitch';
import { setTextSize, useTextSize } from './textSize';
import { setAllowMobileData, useAllowMobileData } from './dataPolicy';
import type { LiveConditions } from './useConditions';

type Ask = (a: { title: string; body?: ReactNode; confirm: string; danger?: boolean }) => Promise<boolean>;

interface Props {
  user: User;
  prefs: StudyPrefs;
  /** New cards per session when the learner has not chosen (Remote Config). */
  defaultNew: number;
  conditions: LiveConditions;
  policy: Policy;
  onPolicy: (p: Policy) => void;
  data: { decks: Deck[]; cards: Card[]; attempts: Attempt[]; sessions: Session[] };
  ask: Ask;
}

export function Settings({ user, prefs, defaultNew, conditions, policy, onPolicy, data, ask }: Props) {
  const uid = user.uid;
  const set = (change: Partial<StudyPrefs>) => savePrefs(uid, change);

  return (
    <div className="stack settings">
      <header className="page-head">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>Make Recall yours</h1>
        </div>
      </header>

      <Section icon="user" title="Account">
        {user.isAnonymous ? (
          <GuestAccount user={user} ask={ask} />
        ) : (
          <div className="account">
            {user.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : <span className="avatar">{accountInitial(user)}</span>}
            <span className="account-who">
              <strong>{accountName(user)}</strong>
              <span className="muted small">{user.email}</span>
            </span>
            <button
              className="btn sm"
              onClick={async () => {
                if (await ask({ title: 'Sign out?', body: <p>Your cards are saved to your account and will be here when you sign back in.</p>, confirm: 'Sign out' })) signOut(auth);
              }}
            >
              <Icon name="out" size={15} /> Sign out
            </button>
          </div>
        )}
      </Section>

      <Section icon="sun" title="Appearance" note="On this device">
        <Row label="Theme" help="System follows your device's light or dark setting.">
          <ThemeSwitch />
        </Row>
        <Row label="Text size" help="Larger text across the whole app, for long sessions.">
          <Choice value={useTextSize()} options={[['normal', 'Normal'], ['large', 'Large']]} onChange={setTextSize} label="Text size" />
        </Row>
      </Section>

      <Section icon="library" title="Study" note="Saved to your account">
        <Row label="New cards per session" help={`How many unseen cards to mix in with your reviews.${prefs.newPerSession === null ? ` Default: ${defaultNew}.` : ''}`}>
          <Choice
            value={prefs.newPerSession ?? defaultNew}
            options={NEW_CARD_OPTIONS.map((n) => [n, String(n)])}
            onChange={(n) => set({ newPerSession: n })}
            label="New cards per session"
          />
        </Row>
        <Row label="Session length" help="The default when you plan a session.">
          <Choice value={prefs.sessionMinutes} options={SESSION_LENGTHS.map((n) => [n, `${n} min`])} onChange={(n) => set({ sessionMinutes: n })} label="Session length" />
        </Row>
        <Row label="Reminder" help="How long before a planned session to remind you, by default.">
          <Choice
            value={prefs.remind}
            options={REMIND_OPTIONS.map((n) => [n, n === 0 ? 'None' : n === 60 ? '1 h' : `${n} min`])}
            onChange={(n) => set({ remind: n })}
            label="Default reminder"
          />
        </Row>
      </Section>

      <Section icon="bell" title="Reminders">
        <Notifications />
      </Section>

      <Section icon="shield" title="AI and privacy" note="On this device">
        <Row label="Your answers" help="Your answers are saved only on this device. Your account keeps your scores, so your progress follows you to other devices." />
        <Row label="Privacy mode" help={POLICY_HELP[policy]}>
          <Choice
            value={policy}
            options={(['private', 'balanced', 'accurate'] as Policy[]).map((p) => [p, POLICY_LABEL[p]])}
            onChange={onPolicy}
            label="Privacy mode"
          />
        </Row>
        <Row label="Built-in AI" help="AI built into Chrome marks your answers on this device: instantly, privately, even offline.">
          <ModelState c={conditions} onGet={() => askDownload(ask, conditions)} />
        </Row>
        <Row label="Download on mobile data" help="The built-in AI is a few GB. By default Recall only downloads it on Wi-Fi.">
          <Choice value={useAllowMobileData()} options={[[false, 'Wi-Fi only'], [true, 'Allow']]} onChange={setAllowMobileData} label="Download on mobile data" />
        </Row>
        <p className="small"><a href="#/engine">See where Recall's AI works <Icon name="arrow" size={13} /></a></p>
      </Section>

      <YourData user={user} data={data} prefs={prefs} ask={ask} online={conditions.online} />

      <Section icon="sparkle" title="About">
        <Row label="Recall" help="Active recall and spaced repetition, marked by AI on your device or in the cloud.">
          <span className="muted small">Build {__BUILD_DATE__}</span>
        </Row>
        <Row label="Works offline" help="Recall installs as an app and keeps your cards on this device. Answers made offline sync when you are back online." />
        <div className="shortcuts">
          <p className="label">Keyboard shortcuts while studying</p>
          <dl>
            <dt><kbd>1</kbd>–<kbd>4</kbd></dt><dd>How sure you are</dd>
            <dt><kbd>Ctrl</kbd> + <kbd>Enter</kbd></dt><dd>Check your answer</dd>
            <dt><kbd>Esc</kbd></dt><dd>Leave the session</dd>
          </dl>
        </div>
      </Section>
    </div>
  );
}

/**
 * A guest's account (anonymous sign-in): kept in this browser only. Signing in with Google links
 * it, so the same account (and all its data) carries on with a Google sign-in. Signing out would
 * leave the data unreachable, so it is deleted instead.
 */
function GuestAccount({ user, ask }: { user: User; ask: Ask }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const keep = async () => {
    setBusy(true);
    setError('');
    try {
      const { user: linked } = await linkWithPopup(user, new GoogleAuthProvider());
      const google = linked.providerData.find((p) => p.providerId === 'google.com');
      if (google) await updateProfile(linked, { displayName: google.displayName, photoURL: google.photoURL });
      location.reload(); // Shows the Google name and photo everywhere.
    } catch (e) {
      const code = (e as { code?: string }).code ?? '';
      if (code.includes('credential-already-in-use') || code.includes('email-already-in-use')) setError('That Google account already uses Recall. To use it, sign out of this guest session, then continue with Google.');
      else if (!code.includes('popup-closed') && !code.includes('cancelled')) setError(`Could not sign in: ${(e as Error).message}`);
      setBusy(false);
    }
  };

  const leave = async () => {
    const yes = await ask({
      title: 'End the guest session?',
      body: <p>A guest's cards and history live in this browser only, so they are deleted when you sign out.</p>,
      confirm: 'Delete and sign out',
      danger: true,
    });
    if (!yes) return;
    setBusy(true);
    try {
      await deleteAllData(user.uid);
      await deleteUser(user);
    } catch {
      await signOut(auth);
    }
  };

  return (
    <>
      <div className="account">
        <span className="avatar">G</span>
        <span className="account-who">
          <strong>Guest</strong>
          <span className="muted small">Not signed in: your cards are kept in this browser only.</span>
        </span>
        <button className="btn sm" onClick={leave} disabled={busy}>
          <Icon name="out" size={15} /> Sign out
        </button>
      </div>
      <Row label="Keep your cards" help="Sign in with Google to keep everything you have done here, on every device.">
        <button className="btn sm primary" onClick={keep} disabled={busy}>{busy ? 'Signing in…' : 'Sign in with Google'}</button>
      </Row>
      {error && <p className="small settings-error">{error}</p>}
    </>
  );
}

function Section({ icon, title, note, children }: { icon: IconName; title: string; note?: string; children: ReactNode }) {
  return (
    <section className="card settings-section">
      <div className="card-head">
        <h3><Icon name={icon} size={18} /> {title}</h3>
        {note && <span className="muted small">{note}</span>}
      </div>
      {children}
    </section>
  );
}

function Row({ label, help, children }: { label: string; help?: ReactNode; children?: ReactNode }) {
  return (
    <div className="settings-row">
      <div className="settings-label">
        <strong>{label}</strong>
        {help && <span className="muted small">{help}</span>}
      </div>
      {children && <div className="settings-control">{children}</div>}
    </div>
  );
}

/** A small engraved segmented control for a setting. */
function Choice<T extends string | number | boolean>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={String(v)} role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

function Notifications() {
  const [permission, askPermission] = useNotifyPermission();
  return (
    <>
      <Row
        label="Notifications"
        help="While Recall is open, it notifies you before each planned session. When it is closed, your calendar does: add sessions from the Plan page."
      >
        {permission === 'default' && <button className="btn sm" onClick={askPermission}><Icon name="bell" size={14} /> Turn on</button>}
        {permission === 'granted' && <span className="state-on"><Icon name="check" size={14} /> On</span>}
        {permission === 'denied' && <span className="muted small">Blocked in this browser's site settings</span>}
        {permission === 'unsupported' && <span className="muted small">Not available in this browser</span>}
      </Row>
    </>
  );
}

function YourData({ user, data, prefs, ask, online }: { user: User; data: Props['data']; prefs: StudyPrefs; ask: Ask; online: boolean }) {
  const [busy, setBusy] = useState<'' | 'data' | 'account' | 'example'>('');
  const [error, setError] = useState('');
  const hasExample = data.decks.some((d) => d.starter || d.example);

  const removeExamples = async () => {
    const yes = await ask({
      title: 'Remove the starter decks?',
      body: <p>This removes the starter decks and the answers you gave on them. Your own decks and answers stay.</p>,
      confirm: 'Remove starter decks',
    });
    if (!yes) return;
    setBusy('example');
    setError('');
    try {
      await removeStarter(user.uid);
    } catch (e) {
      setError(`Could not remove the starter decks: ${(e as Error).message}`);
    } finally {
      setBusy('');
    }
  };

  const exportAll = () => {
    const json = JSON.stringify({ app: 'Recall', exportedAt: new Date().toISOString(), account: user.email, ...data, prefs }, null, 2);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = `recall-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const counts = `${data.decks.length} decks, ${data.cards.length} cards, ${data.attempts.length} answers and ${data.sessions.length} planned sessions`;

  const deleteData = async () => {
    const yes = await ask({
      title: 'Delete all your study data?',
      body: <><p>This removes {counts}, along with your study preferences. It cannot be undone.</p><p>Consider exporting your data first.</p></>,
      confirm: 'Delete everything',
      danger: true,
    });
    if (!yes) return;
    setBusy('data');
    setError('');
    try {
      await deleteAllData(user.uid);
    } catch (e) {
      setError(`Could not delete everything: ${(e as Error).message}`);
    } finally {
      setBusy('');
    }
  };

  const deleteAccount = async () => {
    const yes = await ask({
      title: 'Delete your account?',
      body: <><p>This removes your Recall account and all of your data ({counts}). It cannot be undone.</p>{!user.isAnonymous && <p>Google will ask you to confirm it is you.</p>}</>,
      confirm: 'Delete my account',
      danger: true,
    });
    if (!yes) return;
    setBusy('account');
    setError('');
    try {
      // Confirm it is them first, so the data is never deleted without the account going too.
      // (A guest has no Google account to confirm with.)
      if (!user.isAnonymous) await reauthenticateWithPopup(user, new GoogleAuthProvider());
      await deleteAllData(user.uid);
      await deleteUser(user);
    } catch (e) {
      const code = (e as { code?: string }).code ?? '';
      setError(code.includes('popup-closed') || code.includes('cancelled') ? 'Account deletion was cancelled.' : `Could not delete your account: ${(e as Error).message}`);
      setBusy('');
    }
  };

  return (
    <Section icon="download" title="Your data">
      <Row
        label="Starter decks"
        help={hasExample ? 'Three decks made by Recall from real public documents are in your library. Removing them keeps your own work.' : 'Add three decks made by Recall from real public documents (NASA, the National Park Service, the U.S. National Library of Medicine), to start studying at once.'}
      >
        {hasExample ? (
          <button className="btn sm" onClick={removeExamples} disabled={!!busy || !online}>
            {busy === 'example' ? <><span className="spinner sm" /> Removing…</> : <><Icon name="trash" size={14} /> Remove</>}
          </button>
        ) : (
          <button className="btn sm" onClick={() => seedStarter(user.uid)} disabled={!!busy}>
            <Icon name="sparkle" size={14} /> Load
          </button>
        )}
      </Row>
      <Row label="Export" help={`Download ${counts} as a JSON file.`}>
        <button className="btn sm" onClick={exportAll}><Icon name="download" size={14} /> Export</button>
      </Row>
      <Row label="Delete study data" help="Remove every deck, card, answer and planned session, and keep your account.">
        <button className="btn sm danger-text" onClick={deleteData} disabled={!!busy || !online}>
          {busy === 'data' ? <><span className="spinner sm" /> Deleting…</> : <><Icon name="trash" size={14} /> Delete data</>}
        </button>
      </Row>
      <Row label="Delete account" help="Remove your account and all of its data.">
        <button className="btn sm danger-text" onClick={deleteAccount} disabled={!!busy || !online}>
          {busy === 'account' ? <><span className="spinner sm" /> Deleting…</> : <><Icon name="x" size={14} /> Delete account</>}
        </button>
      </Row>
      {!online && <p className="small muted">Deleting needs a connection.</p>}
      {error && <p className="small settings-error">{error}</p>}
    </Section>
  );
}
