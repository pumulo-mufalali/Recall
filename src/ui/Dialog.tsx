/**
 * Confirmations in the app's own style, instead of the browser's confirm(): `useConfirm()`
 * gives an async ask(), and renders the dialog where the hook is used.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

interface Ask {
  title: string;
  body?: ReactNode;
  confirm: string;
  danger?: boolean;
}

export function useConfirm(): [(ask: Ask) => Promise<boolean>, ReactNode] {
  const [pending, setPending] = useState<(Ask & { resolve: (yes: boolean) => void }) | null>(null);
  const ask = useCallback((a: Ask) => new Promise<boolean>((resolve) => setPending({ ...a, resolve })), []);
  const close = (yes: boolean) => {
    pending?.resolve(yes);
    setPending(null);
  };
  return [ask, pending ? <Dialog {...pending} onClose={close} /> : null];
}

function Dialog({ title, body, confirm, danger, onClose }: Ask & { onClose: (yes: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog"
      onCancel={(e) => {
        e.preventDefault();
        onClose(false);
      }}
      onClick={(e) => e.target === ref.current && onClose(false)}
    >
      <h2>{title}</h2>
      {body && <div className="dialog-body">{body}</div>}
      <div className="dialog-actions">
        <button className="btn ghost" onClick={() => onClose(false)}>Cancel</button>
        <button className={`btn ${danger ? 'danger' : 'primary'}`} onClick={() => onClose(true)} autoFocus>
          {confirm}
        </button>
      </div>
    </dialog>
  );
}
