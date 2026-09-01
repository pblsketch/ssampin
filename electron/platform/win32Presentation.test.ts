/**
 * win32Presentation 단위 테스트.
 *
 * `shouldHideForNotificationState`는 순수 함수라 모든 값을 직접 검증한다.
 * `queryUserNotificationState`의 koffi 경로는 실기 Windows 검증(§9.6)에 의존하므로,
 * 여기서는 실패 정책(throw 금지 · 연속 3회 후 영구 중단 · 로그 1회)만
 * `__setNativeQueryOverrideForTests`로 주입해 결정적으로 검증한다.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  QUNS_NOT_PRESENT,
  QUNS_BUSY,
  QUNS_RUNNING_D3D_FULL_SCREEN,
  QUNS_PRESENTATION_MODE,
  QUNS_ACCEPTS_NOTIFICATIONS,
  QUNS_QUIET_TIME,
  QUNS_APP,
  shouldHideForNotificationState,
  queryUserNotificationState,
  __setNativeQueryOverrideForTests,
  __resetPresentationDetectionForTests,
  stepPresentationWatch,
  INITIAL_PRESENTATION_WATCH_STATE,
  type PresentationWatchState,
  type PresentationWatchAction,
} from './win32Presentation';

describe('shouldHideForNotificationState', () => {
  it('QUNS_BUSY(전체화면 앱/프레젠테이션 설정, PPT 슬라이드쇼가 여기 해당) → true', () => {
    expect(shouldHideForNotificationState(QUNS_BUSY)).toBe(true);
  });

  it('QUNS_RUNNING_D3D_FULL_SCREEN(게임 등) → true', () => {
    expect(shouldHideForNotificationState(QUNS_RUNNING_D3D_FULL_SCREEN)).toBe(true);
  });

  it('QUNS_PRESENTATION_MODE(사용자가 직접 켠 프레젠테이션 설정) → true', () => {
    expect(shouldHideForNotificationState(QUNS_PRESENTATION_MODE)).toBe(true);
  });

  it('QUNS_APP(전체화면 스토어 앱) → true', () => {
    expect(shouldHideForNotificationState(QUNS_APP)).toBe(true);
  });

  it('QUNS_QUIET_TIME → false (핵심: 집중 지원을 켠 선생님이 옆핀을 영영 못 보면 안 된다)', () => {
    expect(shouldHideForNotificationState(QUNS_QUIET_TIME)).toBe(false);
  });

  it('QUNS_NOT_PRESENT(잠금·화면보호기) → false', () => {
    expect(shouldHideForNotificationState(QUNS_NOT_PRESENT)).toBe(false);
  });

  it('QUNS_ACCEPTS_NOTIFICATIONS(평상시) → false', () => {
    expect(shouldHideForNotificationState(QUNS_ACCEPTS_NOTIFICATIONS)).toBe(false);
  });

  it('null(측정 실패/모름) → false — "모르면 숨기지 않는다"', () => {
    expect(shouldHideForNotificationState(null)).toBe(false);
  });

  it('알 수 없는 값(범위 밖 정수) → false', () => {
    expect(shouldHideForNotificationState(0)).toBe(false);
    expect(shouldHideForNotificationState(-1)).toBe(false);
    expect(shouldHideForNotificationState(999)).toBe(false);
  });
});

describe('queryUserNotificationState', () => {
  beforeEach(() => {
    __resetPresentationDetectionForTests();
  });

  it('현재 플랫폼에서 호출해도 throw하지 않는다', () => {
    expect(() => queryUserNotificationState()).not.toThrow();
  });

  it('비Windows 플랫폼이면 koffi를 건드리지 않고 즉시 null', () => {
    if (process.platform === 'win32') {
      // 이 환경은 win32라 실제 분기는 못 타지만, 아래 주입 훅 테스트들이
      // "실패 시 null·연속 3회 영구 중단" 동작을 플랫폼과 무관하게 검증한다.
      return;
    }
    expect(queryUserNotificationState()).toBeNull();
  });

  it('주입 훅이 성공값을 돌려주면 그 값을 그대로 반환한다', () => {
    __setNativeQueryOverrideForTests(() => QUNS_BUSY);
    expect(queryUserNotificationState()).toBe(QUNS_BUSY);
  });

  it('주입 훅이 실패(throw)하면 예외를 삼키고 null을 반환한다', () => {
    __setNativeQueryOverrideForTests(() => {
      throw new Error('가짜 실패');
    });
    expect(() => queryUserNotificationState()).not.toThrow();
    expect(queryUserNotificationState()).toBeNull();
  });

  it('연속 3회 실패 후에는 훅을 더 이상 호출하지 않고 즉시 null (영구 중단)', () => {
    const nativeCall = vi.fn(() => {
      throw new Error('가짜 실패');
    });
    __setNativeQueryOverrideForTests(nativeCall);

    expect(queryUserNotificationState()).toBeNull(); // 실패 1
    expect(queryUserNotificationState()).toBeNull(); // 실패 2
    expect(queryUserNotificationState()).toBeNull(); // 실패 3 — 영구 중단 진입
    expect(nativeCall).toHaveBeenCalledTimes(3);

    expect(queryUserNotificationState()).toBeNull(); // 4회째 — 더 이상 재시도 안 함
    expect(queryUserNotificationState()).toBeNull(); // 5회째도 동일
    expect(nativeCall).toHaveBeenCalledTimes(3);
  });

  it('영구 중단 시 로그를 정확히 한 번만 남긴다(매 호출마다 남기지 않는다)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    __setNativeQueryOverrideForTests(() => {
      throw new Error('가짜 실패');
    });

    queryUserNotificationState();
    queryUserNotificationState();
    queryUserNotificationState(); // 영구 중단 진입 시점
    queryUserNotificationState(); // 영구 중단 이후 추가 호출
    queryUserNotificationState();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it('실패가 3회 미만일 때 성공하면 카운터가 0으로 리셋되어 이후 다시 3회를 허용한다', () => {
    let callCount = 0;
    __setNativeQueryOverrideForTests(() => {
      callCount += 1;
      if (callCount <= 2) throw new Error('일시 실패');
      return QUNS_ACCEPTS_NOTIFICATIONS;
    });

    expect(queryUserNotificationState()).toBeNull(); // 실패 1
    expect(queryUserNotificationState()).toBeNull(); // 실패 2
    expect(queryUserNotificationState()).toBe(QUNS_ACCEPTS_NOTIFICATIONS); // 성공 → 카운터 리셋

    // 리셋되었으므로 이 시점부터 다시 3번 실패해야 영구 중단된다.
    __setNativeQueryOverrideForTests(() => {
      throw new Error('다시 실패');
    });
    expect(queryUserNotificationState()).toBeNull(); // 실패 1
    expect(queryUserNotificationState()).toBeNull(); // 실패 2
    expect(queryUserNotificationState()).toBeNull(); // 실패 3 — 다시 영구 중단

    const afterGiveUp = vi.fn(() => QUNS_BUSY);
    __setNativeQueryOverrideForTests(afterGiveUp);
    expect(queryUserNotificationState()).toBeNull();
    expect(afterGiveUp).not.toHaveBeenCalled(); // 이미 영구 중단 상태라 훅 자체를 안 부른다
  });
});

describe('발표 감시 판정 — stepPresentationWatch', () => {
  /** 같은 판정을 n번 먹인다 */
  function feed(
    start: PresentationWatchState,
    hide: boolean,
    times: number,
  ): { state: PresentationWatchState; actions: PresentationWatchAction[] } {
    let state = start;
    const actions: PresentationWatchAction[] = [];
    for (let i = 0; i < times; i += 1) {
      const r = stepPresentationWatch(state, hide);
      state = r.next;
      actions.push(r.action);
    }
    return { state, actions };
  }

  it('가릴 때는 한 번이면 바로 가린다 — 3초가 곧 노출 시간이다', () => {
    const r = stepPresentationWatch(INITIAL_PRESENTATION_WATCH_STATE, true);
    expect(r.action).toBe('protect');
    expect(r.next.hiding).toBe(true);
  });

  it('되돌릴 때는 두 번 연속 확인한다 — 슬라이드 넘길 때 한 번 튀는 값에 안 속는다', () => {
    const hidden = stepPresentationWatch(INITIAL_PRESENTATION_WATCH_STATE, true).next;

    const first = stepPresentationWatch(hidden, false);
    expect(first.action).toBe('none');
    expect(first.next.hiding).toBe(true);

    const second = stepPresentationWatch(first.next, false);
    expect(second.action).toBe('release');
    expect(second.next.hiding).toBe(false);
  });

  it('★ 발표를 30초 안에 끝내도 두 번째 확인에서 바로 되돌아온다', () => {
    // 2026-09-01 실기기 신고: "손잡이가 돌아오지 않는다".
    // 원인은 "한 번 숨겼으면 최소 30초 유지" 규칙이었다. 발표를 짧게 끝내면
    // 남은 시간 동안 손잡이가 사라진 채로 있어 고장으로 보였다.
    // 이 테스트는 되돌리는 데 **확인 2회 말고는 아무 조건도 없다**는 것을 못박는다.
    const hidden = stepPresentationWatch(INITIAL_PRESENTATION_WATCH_STATE, true).next;

    const { actions } = feed(hidden, false, 2);

    expect(actions).toEqual(['none', 'release']);
  });

  it('값이 한 칸씩 번갈아 튀어도 되돌아가지 않는다 — 비대칭이 흔들림을 막는다', () => {
    // "아니오"가 두 번 연속 나오지 않으므로 release가 한 번도 안 나와야 한다.
    let state = stepPresentationWatch(INITIAL_PRESENTATION_WATCH_STATE, true).next;
    const actions: PresentationWatchAction[] = [];
    for (let i = 0; i < 10; i += 1) {
      const r = stepPresentationWatch(state, i % 2 === 1);
      state = r.next;
      actions.push(r.action);
    }
    expect(actions).not.toContain('release');
    expect(state.hiding).toBe(true);
  });

  it('이미 가린 상태에서 계속 발표 중이면 아무것도 다시 보내지 않는다', () => {
    const hidden = stepPresentationWatch(INITIAL_PRESENTATION_WATCH_STATE, true).next;
    const { actions } = feed(hidden, true, 5);
    expect(actions).toEqual(['none', 'none', 'none', 'none', 'none']);
  });

  it('발표가 아닌 상태로 계속 있으면 아무 일도 없다', () => {
    const { actions, state } = feed(INITIAL_PRESENTATION_WATCH_STATE, false, 5);
    expect(actions.every((a) => a === 'none')).toBe(true);
    expect(state.hiding).toBe(false);
  });
});
