import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from '@adapters/components/common/ErrorBoundary';
import { App } from './App';
import './index.css';

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
