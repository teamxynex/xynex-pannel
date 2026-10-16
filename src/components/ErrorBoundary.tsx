import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches any uncaught error thrown during render/effects anywhere below it
 * and shows a recoverable screen instead of letting React unmount the whole
 * app (which is what causes a totally blank panel on a crash).
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log it so it's visible in devtools instead of vanishing silently
    console.error('XyneX Panel crashed:', error, info.componentStack);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
            background: '#0a0e1a',
            color: '#e2e8f0',
            fontFamily: 'sans-serif',
            textAlign: 'center',
            padding: '2rem',
            zIndex: 999999,
          }}
        >
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Something went wrong</h1>
          <p style={{ color: '#94a3b8', maxWidth: 480 }}>
            The panel hit an unexpected error and stopped rendering. Reloading usually
            fixes it. If it keeps happening, check the browser console for details.
          </p>
          {this.state.error && (
            <pre
              style={{
                background: '#111827',
                padding: '0.75rem 1rem',
                borderRadius: 8,
                maxWidth: 600,
                overflow: 'auto',
                fontSize: '0.75rem',
                color: '#f87171',
                textAlign: 'left',
              }}
            >
              {this.state.error.message}
            </pre>
          )}
          <button
            onClick={this.handleReload}
            style={{
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              padding: '0.6rem 1.5rem',
              borderRadius: 9999,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Reload Panel
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
