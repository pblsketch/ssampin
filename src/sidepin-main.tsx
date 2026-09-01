import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SidePinApp } from '@adapters/components/SidePin/SidePinApp';
import { ErrorBoundary } from '@adapters/components/common/ErrorBoundary';
import { initAnalyticsIdentity } from '@adapters/hooks/useAnalytics';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import './index.css';

/**
 * ★화면이 그려지기 전에 기기 번호를 붙인다 — 옆핀은 별도 창이라 수집기도 따로다.
 * 이걸 빠뜨리면 옆핀에서 남긴 기록이 "누구 것인지 모르는" 채로 쌓인다.
 */
initAnalyticsIdentity();

/**
 * 설정을 **여기서 명시적으로** 불러온다.
 *
 * 이미 `useSidePinAppearance` 가 부르고 있어서 중복처럼 보이지만 아니다. 그쪽은
 * **주제 색과 투명도** 때문에 부르는 것이고, 그 훅을 나중에 누가 정리하거나 순서를
 * 바꾸면 **PIN 잠금이 조용히 열린 채로 남는다** — 잠글 기능인지(`settings.pin`)를
 * 그 파일에서 읽기 때문이다.
 *
 * 잠금이 남의 사정에 얹혀 있으면 안 된다. 그래서 이 창이 뜰 때 스스로 한 번 부른다.
 * (`load()` 는 이미 불렀으면 그냥 돌아온다 — 두 번 불러도 손해가 없다.)
 */
void useSettingsStore.getState().load();

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
