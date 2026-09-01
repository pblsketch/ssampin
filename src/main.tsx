import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from '@adapters/components/common/ErrorBoundary';
import { initAnalyticsIdentity } from '@adapters/hooks/useAnalytics';
import { App } from './App';
import './index.css';

/**
 * ★화면이 그려지기 전에 기기 번호를 붙인다.
 *
 * 이 파일은 메인 창뿐 아니라 위젯·아이콘·빠른 추가 창도 함께 띄운다(`?mode=` 로 갈린다).
 * 예전에는 메인 창에서만 번호를 붙여, 위젯·아이콘 창의 기록이 전부 익명으로 쌓였다.
 */
initAnalyticsIdentity();

const rendererMode = new URLSearchParams(window.location.search).get('mode');

if (rendererMode === 'sidePin') {
  // React effect보다 먼저 투명 창의 첫 합성 프레임을 준비한다.
  document.documentElement.classList.add('ssampin-sidepin-root');
  document.body.classList.add('ssampin-sidepin');
  document.documentElement.style.background = 'transparent';
  document.body.style.background = 'transparent';
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
