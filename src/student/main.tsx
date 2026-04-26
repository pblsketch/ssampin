import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { StudentRealtimeWallApp } from './StudentRealtimeWallApp';
import { applyDefaultBoardTheme } from './useStudentBoardTheme';
import '../index.css';

/**
 * v1.16.x (Phase 1, Design §4.1) — 학생 SPA 첫 페인트 default theme 즉시 주입.
 *
 * 회귀 위험 #8 mitigation:
 *   - 기존: `<html>`에 `theme-dark` + `dark` 강제 추가 (교사 보드 light 시 픽셀 단위 불일치).
 *   - 수정: 강제 두 줄 제거. 대신 `applyDefaultBoardTheme()`를 mount 이전 모듈 top-level에서 즉시 호출.
 *     첫 페인트가 default(light + solid-neutral-paper)로 보장되어 빈 화면/깜빡임 0.
 *   - wall-state 도착 시 `useStudentBoardTheme(theme)`가 보드 실제 colorScheme/accent로 동기화.
 *
 * 호출 순서가 중요: applyDefaultBoardTheme → createRoot.render. mount 이전 호출.
 */
applyDefaultBoardTheme();

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root element not found');

createRoot(rootEl).render(
  <StrictMode>
    <StudentRealtimeWallApp />
  </StrictMode>,
);
