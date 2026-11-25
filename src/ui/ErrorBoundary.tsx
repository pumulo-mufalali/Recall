/**
 * Catches a crash while drawing a screen, so one broken screen shows a way out instead of a
 * blank page. Around each screen (keyed by the route, so navigating away recovers) and around
 * the whole app (full: only a reload is offered).
 *
 * A screen is loaded on demand; after a new version is deployed, an old screen's file may be
 * gone, which surfaces here as a failed import: that case asks for a reload.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Icon } from './Icon';

interface Props {
  children: ReactNode;
  /** The whole app: there is no screen to go back to, so only reloading is offered. */
  full?: boolean;
}

/** A screen's code could not be fetched: usually a new version was deployed meanwhile. */
const isStaleChunk = (e: Error) => /dynamically imported module|Importing a module script failed|Failed to fetch dynamically|error loading dynamically/i.test(e.message);

export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[recall] a screen crashed', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const stale = isStaleChunk(error);
    return (
      <div className={`crash${this.props.full ? ' full' : ''}`} role="alert">
        <span className="crash-icon"><Icon name="warn" size={26} /></span>
        <h2>{stale ? 'Recall has been updated.' : 'This screen hit a problem.'}</h2>
        <p className="muted">
          {stale ? 'Reload to get the new version.' : 'Your cards and answers are safe: they are saved as you go.'}
        </p>
        <div className="actions center">
          {!stale && !this.props.full && <button className="btn primary" onClick={() => this.setState({ error: null })}>Try again</button>}
          {!stale && !this.props.full && <a className="btn" href="#/" onClick={() => this.setState({ error: null })}>Back to Today</a>}
          <button className={`btn${stale || this.props.full ? ' primary' : ' ghost'}`} onClick={() => location.reload()}>Reload</button>
        </div>
        {!stale && (
          <details className="crash-details">
            <summary className="small">Details</summary>
            <p className="mono small">{error.message}</p>
          </details>
        )}
      </div>
    );
  }
}
