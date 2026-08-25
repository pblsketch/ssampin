import { useCallback, useState } from 'react';
import { useToastStore } from '@adapters/components/common/Toast';
import {
  ONECLICK_PORTAL_SITE,
  type OneClickPortalModalMode,
} from '@adapters/components/Tools/OneClickPortalLaunchModal';
import { getOneClickPortalTaskLabel } from '@adapters/constants/oneclickPortalTasks';

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
 * 카드를 누르면 상황을 먼저 확인하고 갈래가 나뉜다.
 *  - 설치 안 됨                  → 설치 안내 모달
 *  - 설치됨 · v0.1.15 이상       → **업무 고르기 모달** (나이스·복무·출장·에듀파인·기안·품의)
 *  - 설치됨 · 그보다 낮은 버전   → 업무 목록 없이 예전 흐름 (첫 회 안내 모달 → 실행)
 *
 * 버전이 낮을 때 업무 목록을 감추는 이유 — 그 프로그램은 켜질 때 스스로 업데이트하므로
 * 한 번 열었다 닫으면 다음부터는 목록이 생긴다. 눌렀는데 안 되는 경험을 만들 이유가 없다.
 */
export function useOneClickPortalLauncher() {
  const showToast = useToastStore((s) => s.show);
  const [modalMode, setModalMode] = useState<OneClickPortalModalMode | null>(null);
  /** 업무 고르기 모달 위에 첫 실행 고지를 함께 띄울지 (첫 회만 true) */
  const [showNotice, setShowNotice] = useState(false);

  const openSite = useCallback(() => {
    void window.electronAPI?.openExternal(ONECLICK_PORTAL_SITE);
    setModalMode(null);
  }, []);

  /**
   * 실제 실행. 결과에 따라 안내를 다르게 준다.
   * @param task 바로 열 업무. 생략하면 프로그램만 실행한다.
   */
  const runLaunch = useCallback(
    async (task?: string) => {
      const api = window.electronAPI?.oneclickPortal;
      if (!api) return;

      const result = await api.launch(task);
      const taskLabel = task === undefined ? null : getOneClickPortalTaskLabel(task);

      switch (result.outcome) {
        case 'launched':
          showToast(
            taskLabel === null
              ? '원클릭업무포털을 실행했어요.'
              : `원클릭업무포털에서 ${taskLabel} 화면을 여는 중이에요.`,
            'success',
          );
          break;
        case 'task-sent':
          // 이미 떠 있던 창이 요청을 받아 화면을 바꾼다. 창을 새로 띄우지 않는다.
          showToast(`원클릭업무포털에서 ${taskLabel ?? '요청한'} 화면을 여는 중이에요.`, 'success');
          break;
        case 'already-running':
          showToast(
            '원클릭업무포털이 이미 실행 중이에요. 화면 오른쪽 아래를 확인해 주세요.',
            'info',
          );
          break;
        case 'not-installed':
          setModalMode('not-installed');
          break;
        case 'unsupported':
          showToast('원클릭업무포털은 윈도우에서만 사용할 수 있어요.', 'error');
          break;
        case 'task-unsupported':
          // 목록을 보여줄 때 버전을 확인하므로 보통은 여기 오지 않는다.
          // 고른 뒤 실행 직전에 구버전으로 바뀐 드문 경우의 대비다.
          showToast(
            '원클릭업무포털을 한 번 실행해 업데이트하면 업무 바로가기를 쓸 수 있어요.',
            'info',
          );
          break;
        case 'failed':
          showToast(`원클릭업무포털을 실행하지 못했어요. ${result.message}`, 'error');
          break;
      }
    },
    [showToast],
  );

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

    if (status.supportsTasks) {
      // 이미 떠 있어도 업무 고르기를 띄운다 — 고른 업무는 떠 있는 창이 받아서 연다.
      setShowNotice(!hasSeenGuide());
      setModalMode('task-picker');
      return;
    }

    // 아래는 업무 바로가기를 모르는 구버전이 깔린 경우 — 예전 흐름 그대로다.
    if (status.running) {
      showToast('원클릭업무포털이 이미 실행 중이에요. 화면 오른쪽 아래를 확인해 주세요.', 'info');
      return;
    }
    if (!hasSeenGuide()) {
      setShowNotice(true);
      setModalMode('first-run');
      return;
    }

    await runLaunch();
  }, [runLaunch, showToast]);

  /** 모달의 '실행하기' (구버전 안내 모달) */
  const handleLaunchFromModal = useCallback(
    (skipNextTime: boolean) => {
      if (skipNextTime) rememberGuideDismissed();
      setModalMode(null);
      void runLaunch();
    },
    [runLaunch],
  );

  /**
   * 업무 고르기 모달에서 하나를 고름. `task` 가 없으면 '그냥 실행'.
   *
   * 고지는 이 시점에 본 것으로 친다 — 모달을 띄우면서 이미 보여줬기 때문이다.
   * (구버전 모달과 달리 체크박스를 두지 않는다. 업무를 고르려면 어차피 매번 열어야 하므로
   *  '다음부터 바로 실행'이라는 선택지 자체가 성립하지 않는다.)
   */
  const handleSelectTask = useCallback(
    (task?: string) => {
      rememberGuideDismissed();
      setShowNotice(false);
      setModalMode(null);
      void runLaunch(task);
    },
    [runLaunch],
  );

  return {
    modalMode,
    showNotice,
    closeModal: useCallback(() => setModalMode(null), []),
    handleCardClick,
    handleLaunchFromModal,
    handleSelectTask,
    openSite,
  };
}
