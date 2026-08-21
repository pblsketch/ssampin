import { useCallback, useState } from 'react';
import { useToastStore } from '@adapters/components/common/Toast';
import {
  ONECLICK_PORTAL_SITE,
  type OneClickPortalModalMode,
} from '@adapters/components/Tools/OneClickPortalLaunchModal';

/** 첫 실행 안내를 이미 봤는지. 안내는 첫 회만 띄운다(도구의 목적이 클릭 줄이기이므로). */
const GUIDE_DISMISSED_KEY = 'ssampin:oneclick-portal-guide-dismissed';

/** 쌤도구 카드 id. 클릭을 가로채는 기준이 된다. */
export const ONECLICK_PORTAL_TOOL_ID = 'tool-oneclick-portal';

function hasSeenGuide(): boolean {
  try {
    return localStorage.getItem(GUIDE_DISMISSED_KEY) === 'true';
  } catch {
    // 저장소를 못 읽으면 안내를 한 번 더 보는 쪽이 안전하다.
    return false;
  }
}

function rememberGuideDismissed(): void {
  try {
    localStorage.setItem(GUIDE_DISMISSED_KEY, 'true');
  } catch {
    // 저장에 실패해도 실행 자체는 막지 않는다.
  }
}

/**
 * 원클릭업무포털(외부 프로그램) 실행 흐름.
 *
 * 카드를 누르면 상황을 먼저 확인하고 세 갈래로 나뉜다.
 *  - 설치 안 됨       → 설치 안내 모달
 *  - 이미 실행 중     → 토스트로 안내 (그 프로그램 창은 화면 우측 하단의 작은 막대라 놓치기 쉽다)
 *  - 설치됨·꺼져 있음 → 첫 회는 안내 모달, 이후에는 바로 실행
 */
export function useOneClickPortalLauncher() {
  const showToast = useToastStore((s) => s.show);
  const [modalMode, setModalMode] = useState<OneClickPortalModalMode | null>(null);

  const openSite = useCallback(() => {
    void window.electronAPI?.openExternal(ONECLICK_PORTAL_SITE);
    setModalMode(null);
  }, []);

  /** 실제 실행. 결과에 따라 안내를 다르게 준다. */
  const runLaunch = useCallback(async () => {
    const api = window.electronAPI?.oneclickPortal;
    if (!api) return;

    const result = await api.launch();
    switch (result.outcome) {
      case 'launched':
        showToast('원클릭업무포털을 실행했어요.', 'success');
        break;
      case 'already-running':
        showToast('원클릭업무포털이 이미 실행 중이에요. 화면 오른쪽 아래를 확인해 주세요.', 'info');
        break;
      case 'not-installed':
        setModalMode('not-installed');
        break;
      case 'unsupported':
        showToast('원클릭업무포털은 윈도우에서만 사용할 수 있어요.', 'error');
        break;
      case 'failed':
        showToast(`원클릭업무포털을 실행하지 못했어요. ${result.message}`, 'error');
        break;
    }
  }, [showToast]);

  /** 쌤도구 카드 클릭 진입점 */
  const handleCardClick = useCallback(async () => {
    const api = window.electronAPI?.oneclickPortal;
    if (!api) {
      // 브라우저 모드에서는 프로그램을 실행할 수 없으므로 공식 배포처만 안내한다.
      setModalMode('not-installed');
      return;
    }

    const status = await api.getStatus();

    if (!status.supported) {
      showToast('원클릭업무포털은 윈도우에서만 사용할 수 있어요.', 'error');
      return;
    }
    if (!status.installed) {
      setModalMode('not-installed');
      return;
    }
    if (status.running) {
      showToast('원클릭업무포털이 이미 실행 중이에요. 화면 오른쪽 아래를 확인해 주세요.', 'info');
      return;
    }
    if (!hasSeenGuide()) {
      setModalMode('first-run');
      return;
    }

    await runLaunch();
  }, [runLaunch, showToast]);

  /** 모달의 '실행하기' */
  const handleLaunchFromModal = useCallback(
    (skipNextTime: boolean) => {
      if (skipNextTime) rememberGuideDismissed();
      setModalMode(null);
      void runLaunch();
    },
    [runLaunch],
  );

  return {
    modalMode,
    closeModal: useCallback(() => setModalMode(null), []),
    handleCardClick,
    handleLaunchFromModal,
    openSite,
  };
}
