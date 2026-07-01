import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { GoogleAuthProvider } from './contexts/GoogleAuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { isSignatureRoute } from '../signature/signatureRoute';
import '../index.css';
import './styles/mobile.css';

// 서명받기 공개 페이지(`/sign/{shortLinkCode}`)는 익명 참석자용 — mobile 교사 앱 본체(App)를
// 절대 마운트하지 않는다. App 내부의 useGoogleAuth/동기화/온보딩 hook이 돌면 안 되므로
// 컴포넌트 렌더 자체를 진입점에서 분기한다. 익명 + anon key Edge Function만 사용.
// lazy 청크로 분리해 mobile 메인 번들 크기 회귀를 막고, CSP `script-src 'self'` 하위 호환.
const StudentSignatureApp = React.lazy(() =>
  import('../student/StudentSignatureApp').then((module) => ({
    default: module.StudentSignatureApp,
  })),
);

function SignatureRouteLoading() {
  return (
    <div className="flex items-center justify-center h-dvh mobile-bg">
      <div className="text-center">
        <span className="material-symbols-outlined text-sp-accent text-4xl animate-spin">
          progress_activity
        </span>
        <p className="text-sp-muted mt-3 text-sm">연결을 준비 중입니다…</p>
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root')!);

if (isSignatureRoute()) {
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <Suspense fallback={<SignatureRouteLoading />}>
          <StudentSignatureApp />
        </Suspense>
      </ErrorBoundary>
    </React.StrictMode>,
  );
} else {
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <GoogleAuthProvider>
          <App />
        </GoogleAuthProvider>
      </ErrorBoundary>
    </React.StrictMode>,
  );
}
