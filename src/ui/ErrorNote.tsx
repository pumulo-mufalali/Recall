/** A readable error: what happened and what to do, with the technical text behind "Details". */
import type { Friendly } from '../core/errors';

export function ErrorNote({ error, onRetry }: { error: Friendly; onRetry?: () => void }) {
  return (
    <div className="error-note" role="alert">
      <p><strong>{error.message}</strong> {error.hint}</p>
      <div className="row tight">
        {error.retry && onRetry && <button onClick={onRetry}>Try again</button>}
        <details>
          <summary className="small">Details</summary>
          <p className="small muted mono">{error.detail}</p>
        </details>
      </div>
    </div>
  );
}
