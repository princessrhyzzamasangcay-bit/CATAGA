import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Montenegro Lines application error:', error, info);
  }

  handleReset = () => {
    try {
      localStorage.removeItem('mt_session');
    } catch {}
    window.location.href = '/';
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: 24,
          background: '#f5f7fb',
          color: '#17243b',
          fontFamily: 'DM Sans, sans-serif',
        }}
      >
        <div
          style={{
            width: 'min(720px, 100%)',
            background: '#fff',
            border: '1px solid #e6ebf3',
            borderRadius: 18,
            padding: 28,
            boxShadow: '0 15px 40px rgba(0,0,0,.08)',
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 800, color: '#b52f3c', marginBottom: 8 }}>
            APPLICATION ERROR
          </div>
          <h1 style={{ margin: '0 0 10px', fontSize: 24 }}>
            The app could not render this page.
          </h1>
          <p style={{ margin: '0 0 18px', color: '#66748a', lineHeight: 1.6 }}>
            The blank-screen problem is now surfaced here instead of leaving the page white.
            Open the browser console if you need the technical stack trace.
          </p>
          <pre
            style={{
              overflow: 'auto',
              padding: 14,
              borderRadius: 10,
              background: '#f6f8fc',
              fontSize: 12,
              whiteSpace: 'pre-wrap',
            }}
          >
            {this.state.error?.stack || this.state.error?.message || String(this.state.error)}
          </pre>
          <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                border: 0,
                borderRadius: 10,
                padding: '11px 15px',
                background: '#087f5b',
                color: '#fff',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Reload
            </button>
            <button
              onClick={this.handleReset}
              style={{
                border: 0,
                borderRadius: 10,
                padding: '11px 15px',
                background: '#eef1f6',
                color: '#334156',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Reset local session
            </button>
          </div>
        </div>
      </div>
    );
  }
}
