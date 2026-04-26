import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { StudentRealtimeWallApp } from './StudentRealtimeWallApp';
import '../index.css';

// 학생 뷰는 다크 테마 고정 (Design §0.1 교사 화면과 픽셀 단위 일치).
document.documentElement.classList.add('theme-dark');
document.documentElement.classList.add('dark');

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root element not found');

createRoot(rootEl).render(
  <StrictMode>
    <StudentRealtimeWallApp />
  </StrictMode>,
);
