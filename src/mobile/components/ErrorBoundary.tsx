import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100dvh', padding: '24px',
          fontFamily: 'system-ui', color: '#94a3b8', background: '#0a0e17',
        }}>
          <p style={{ fontSize: '48px', marginBottom: '16px' }}>😢</p>
          <h1 style={{ fontSize: '18px', fontWeight: 'bold', color: '#e2e8f0', marginBottom: '8px' }}>
            앱 로딩에 실패했어요
          </h1>
          <p style={{ fontSize: '14px', textAlign: 'center', marginBottom: '16px' }}>
            Safari를 최신 버전으로 업데이트하거나,<br />
            앱을 새로고침해 주세요.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 24px', borderRadius: '12px',
              background: '#3b82f6', color: 'white', border: 'none',
              fontSize: '14px', fontWeight: '600', cursor: 'pointer',
            }}
          >
            새로고침
          </button>
          {this.state.error && (
            <pre style={{
              marginTop: '24px', fontSize: '11px', color: '#64748b',
              maxWidth: '100%', overflow: 'auto', whiteSpace: 'pre-wrap',
            }}>
              {this.state.error.message}
            </pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
