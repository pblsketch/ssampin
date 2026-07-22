// @vitest-environment jsdom
/**
 * 코치마크(아이콘 모드 첫 진입 안내 말풍선) 수명주기 회귀 테스트.
 *
 * 출처: 사용자 피드백 #147 B-2("멘트가 계속 살아 있어 화면을 가립니다") + B-1(핀 드래그 실패).
 *
 * 회귀 대상 결함 2종:
 *  (1) 고착 — 마운트 시점에는 스토어가 아직 DEFAULT_SETTINGS(showCoachMark=true)라
 *      effect가 성급히 말풍선을 켜고 5초 타이머를 무장한다. 곧이어 설정 로드가 끝나
 *      저장값 false로 dep이 뒤집히면 cleanup이 "타이머만" 죽이고 표시 상태는 true로
 *      남는다 → 영구 고착 → 창이 상시 확장 → 마우스 통과 기본이라 핀 조작 실패.
 *  (2) 설정 유실 — 그 타임아웃 콜백이 effect 생성 시점의 settings.widget을 통째로
 *      스프레드한다. 로드 전 값(DEFAULT)이 캡처된 채 발사되면 사용자의 위젯 설정이
 *      기본값으로 덮어써진다. (1)을 고치면 이 경로가 비로소 살아나므로 함께 잠근다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import type { Settings } from '@domain/entities/Settings';
import { useCoachMark, COACH_MARK_VISIBLE_MS } from './useCoachMark';

/** 스토어의 손대지 않은 초기 상태 = 설정 로드 전 렌더러가 보는 값(DEFAULT_SETTINGS) */
const PRISTINE = useSettingsStore.getState();
const DEFAULT_WIDGET = PRISTINE.settings.widget;

type UpdateSpy = ReturnType<typeof vi.fn>;
let updateSpy: UpdateSpy;

function Harness() {
  const { visible, dismiss } = useCoachMark();
  if (!visible) return null;
  return (
    <div data-testid="coach">
      <button onClick={dismiss}>닫기</button>
    </div>
  );
}

const coach = () => screen.queryByTestId('coach');

/** 사용자가 직접 손댄 티가 나는 위젯 설정 — 기본값과 전 필드가 다르다 */
function userWidget(showCoachMark: boolean): Settings['widget'] {
  return {
    ...DEFAULT_WIDGET,
    width: 999,
    opacity: 0.42,
    desktopMode: 'native-desktop',
    icon: { showCoachMark },
  } as Settings['widget'];
}

function setStore(loaded: boolean, widget: Settings['widget']) {
  useSettingsStore.setState({
    loaded,
    settings: { ...PRISTINE.settings, widget },
  });
}

/** 저장 페이로드의 widget 부분 (타입 단언은 테스트 편의용) */
function payloadWidget(call: unknown): Settings['widget'] {
  return (call as Partial<Settings>).widget as Settings['widget'];
}

describe('useCoachMark — 코치마크 수명주기 (#147 B-2/B-1)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    updateSpy = vi.fn().mockResolvedValue(undefined);
    // 실제 파일 저장은 하지 않고 payload만 관찰한다
    useSettingsStore.setState({
      update: updateSpy as unknown as (patch: Partial<Settings>) => Promise<void>,
    });
    setStore(false, DEFAULT_WIDGET);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    useSettingsStore.setState({ ...PRISTINE, settings: PRISTINE.settings, loaded: false });
  });

  it('기존 사용자(저장값 false): 로드 전에도 로드 후에도 말풍선이 뜨지 않는다', () => {
    render(<Harness />);

    // 근본 원인 지점 — 로드 전 DEFAULT(true)를 보고 성급히 켜면 안 된다
    expect(coach()).toBeNull();

    act(() => setStore(true, userWidget(false)));
    expect(coach()).toBeNull();

    // 고착 회귀: 5초를 한참 넘겨도 뜨지 않고, 저장도 일어나지 않는다
    act(() => void vi.advanceTimersByTime(60_000));
    expect(coach()).toBeNull();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('신규 사용자(저장값 true): 뜬 뒤 5초에 사라지고 "봤음"을 1회 저장한다', () => {
    render(<Harness />);
    expect(coach()).toBeNull(); // 로드 전에는 판정 보류

    act(() => setStore(true, userWidget(true)));
    expect(coach()).not.toBeNull();

    act(() => void vi.advanceTimersByTime(COACH_MARK_VISIBLE_MS));
    expect(coach()).toBeNull();
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(payloadWidget(updateSpy.mock.calls[0]?.[0]).icon?.showCoachMark).toBe(false);
  });

  it('저장 페이로드가 로드된 위젯 설정을 보존한다 (기본값 덮어쓰기 금지)', () => {
    render(<Harness />);
    act(() => setStore(true, userWidget(true)));
    act(() => void vi.advanceTimersByTime(COACH_MARK_VISIBLE_MS));

    const w = payloadWidget(updateSpy.mock.calls[0]?.[0]);
    expect(w.width).toBe(999);
    expect(w.opacity).toBe(0.42);
    expect(w.desktopMode).toBe('native-desktop');
    // 기본값으로 되돌아가지 않았는지 명시 확인
    expect(w.width).not.toBe(DEFAULT_WIDGET.width);
    expect(w.desktopMode).not.toBe(DEFAULT_WIDGET.desktopMode);
  });

  it('타이머 무장 후 위젯 설정이 바뀌어도 저장 시점의 최신값을 쓴다 (stale closure 금지)', () => {
    render(<Harness />);
    act(() => setStore(true, userWidget(true)));
    expect(coach()).not.toBeNull();

    // 말풍선이 떠 있는 동안 사용자가 설정 창에서 위젯 크기를 바꾼 상황
    act(() => setStore(true, { ...userWidget(true), width: 1234 } as Settings['widget']));
    act(() => void vi.advanceTimersByTime(COACH_MARK_VISIBLE_MS));

    expect(payloadWidget(updateSpy.mock.calls[0]?.[0]).width).toBe(1234);
  });

  it('수동 닫기(×): 즉시 사라지고 저장되며, 이후 타이머가 재저장하지 않는다', () => {
    render(<Harness />);
    act(() => setStore(true, userWidget(true)));
    expect(coach()).not.toBeNull();

    act(() => void fireEvent.click(screen.getByText('닫기')));
    expect(coach()).toBeNull();
    expect(updateSpy).toHaveBeenCalledTimes(1);

    act(() => void vi.advanceTimersByTime(60_000));
    expect(coach()).toBeNull();
    expect(updateSpy).toHaveBeenCalledTimes(1);
  });
});
