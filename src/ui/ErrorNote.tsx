/** A readable error: what happened and what to do, with the technical text behind "Details". */
import type { Friendly } from '../core/errors';
import { Icon } from './Icon';

export function ErrorNote({ error, onRetry }: { error: Friendly; onRetry?: () => void }) {
  return (
    <div className="error-note" role="alert">
      <span className="error-icon"><Icon name="warn" size={18} /></span>
      <div className="error-body">
        <p><strong>{error.message}</strong> {error.hint}</p>
        <div className="actions">
          {error.retry && onRetry && <button className="btn sm" onClick={onRetry}>Try again</button>}
          <details>
            <summary className="small">Details</summary>
            <p className="small muted mono">{error.detail}</p>
          </details>
        </div>
      </div>
    </div>
  );
}
