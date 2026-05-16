import { Component, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import '../styles/popup.css';

/**
 * Without this, any throw during render leaves the popup a blank white
 * rectangle with no clue why. Show the error text instead so it's
 * diagnosable from the popup itself (no need to open devtools).
 */
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div style={{ padding: 16, font: '13px -apple-system, sans-serif', color: '#7f1d1d' }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Polyscribe popup crashed</div>
          <div style={{ fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap' }}>
            {this.state.error.message}
          </div>
          <div style={{ marginTop: 10, color: '#6b7280' }}>
            Try reloading the extension (chrome://extensions → Reload). If it
            persists, remove and re-add the unpacked <code>dist</code> folder.
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}
