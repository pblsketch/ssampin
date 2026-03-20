import { Component, type ReactNode, type ErrorInfo } from 'react';

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

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#0a0e17',
        color: '#e2e8f0',
        fontFamily: "'Noto Sans KR', sans-serif",
        gap: '16px',
        padding: '24px',
        textAlign: 'center',
      }}>
        <span style={{ fontSize: '48px' }}>&#x26A0;&#xFE0F;</span>
        <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>
          앱에 오류가 발생했습니다
        </h2>
        <p style={{ fontSize: '14px', color: '#94a3b8', margin: 0, maxWidth: '400px', lineHeight: 1.6 }}>
          {this.state.error?.message ?? '알 수 없는 오류'}
        </p>
        <button
          onClick={this.handleReload}
          style={{
            marginTop: '8px',
            padding: '10px 24px',
            borderRadius: '8px',
            border: 'none',
            background: '#3b82f6',
            color: '#fff',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          새로고침
        </button>
      </div>
    );
  }
}
