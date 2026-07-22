/**
 * 코치마크(아이콘 모드 첫 진입 안내 말풍선) 수명주기 훅.
 *
 * IconWindow 안에 인라인으로 있던 로직을 분리했다 — 피드백 #147 B-2 고착 수정 + 테스트 가능화.
 *
 * 핵심 규칙 2가지:
 *
 * 1) 설정이 로드되기 전에는 판정하지 않는다.
 *    스토어 초기값은 DEFAULT_SETTINGS(showCoachMark=true)다. 로드 완료를 기다리지 않으면
 *    "이미 본 사용자"에게도 말풍선을 켜고 5초 타이머를 무장한 뒤, 로드가 끝나 저장값
 *    false로 dep이 뒤집히는 순간 cleanup이 타이머만 죽인다. 표시 상태는 true로 남아
 *    영구 고착 → 창이 상시 확장 → 확장 창은 마우스 통과가 기본이라 핀 드래그·클릭이
 *    간헐 실패(#147 B-1). 그래서 loaded를 게이트이자 dep으로 쓴다.
 *
 * 2) 저장 페이로드는 "저장하는 순간"의 최신 위젯 설정을 읽는다.
 *    effect 생성 시점의 settings.widget을 캡처해 스프레드하면, 로드 전 기본값이 5초 뒤
 *    발사되어 사용자의 위젯 설정(크기·투명도·데스크톱 모드·표시 섹션)을 통째로
 *    덮어쓴다. useSettingsStore.update()는 widget을 얕은 병합하므로 stale 스프레드가
 *    전 필드를 그대로 밀어버린다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';

/** 말풍선 자동 소멸까지의 시간 */
export const COACH_MARK_VISIBLE_MS = 5000;

/**
 * "코치마크를 봤음"을 영구 저장한다.
 *
 * 반드시 호출 시점에 getState()로 최신 설정을 읽는다(위 규칙 2). 이미 false면 아무 것도
 * 하지 않아 중복 쓰기를 막는다.
 */
async function persistCoachMarkSeen(): Promise<void> {
  const { settings, update } = useSettingsStore.getState();
  const widget = settings.widget;
  if (widget.icon?.showCoachMark === false) return;
  await update({
    widget: { ...widget, icon: { ...(widget.icon ?? {}), showCoachMark: false } },
  });
}

export interface CoachMarkState {
  /** 말풍선을 그릴지 여부 */
  readonly visible: boolean;
  /** 사용자가 ×를 눌러 즉시 닫기 (자동 소멸이 실패해도 탈출할 수 있게) */
  readonly dismiss: () => void;
}

export function useCoachMark(): CoachMarkState {
  const loaded = useSettingsStore((s) => s.loaded);
  const enabled = useSettingsStore((s) => s.settings.widget.icon?.showCoachMark ?? false);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    // 로드 완료 전에는 아무 판정도 하지 않는다 — 성급히 켜는 것이 고착의 근본 원인
    if (!loaded || !enabled) return undefined;

    setVisible(true);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setVisible(false);
      void persistCoachMarkSeen();
    }, COACH_MARK_VISIBLE_MS);

    return () => {
      // 방어: 어떤 경로로 타이머가 죽든 말풍선도 반드시 함께 내린다.
      // (타이머만 정리하고 표시 상태를 남겨두는 것이 기존 고착 버그였다)
      clearTimer();
      setVisible(false);
    };
  }, [loaded, enabled, clearTimer]);

  const dismiss = useCallback(() => {
    clearTimer();
    setVisible(false);
    void persistCoachMarkSeen();
  }, [clearTimer]);

  return { visible, dismiss };
}
