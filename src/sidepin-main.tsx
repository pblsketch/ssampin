import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SidePinApp } from '@adapters/components/SidePin/SidePinApp';
import { ErrorBoundary } from '@adapters/components/common/ErrorBoundary';
import './index.css';

document.documentElement.classList.add('ssampin-sidepin-root');
document.body.classList.add('ssampin-sidepin');
document.documentElement.style.background = 'transparent';
document.body.style.background = 'transparent';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <SidePinApp />
    </ErrorBoundary>
  </StrictMode>,
);
