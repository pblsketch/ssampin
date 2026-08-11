// @vitest-environment jsdom
/**
 * useTimetableChangeCheck — 새로고침 버튼의 시간표 변동 확인 회귀 테스트.
 *
 * 배경(2026-08-11 피드백): 새로고침은 저장된 데이터를 다시 읽기만 해서
 * 컴시간·압핀 변동을 알 수 없었다. 새로고침 버튼은 **두 곳**에 있다 —
 * 위젯 창 헤더(Widget.tsx)와 메인 창 대시보드 헤더(DashboardHeader.tsx). 둘 다 이 훅을 쓴다.
 * 버튼에 확인을 얹으면서 지켜야 할 선:
 *
 *  1) 자동 새로고침(5분 타이머·창 활성화) 경로에서는 절대 서버를 조회하지 않는다.
 *     — comci.net / sgpap.com 폴링 금지 원칙. 이 파일의 최우선 가드.
 *  2) 연동을 쓰지 않는 사용자에게는 조회도 안내도 하지 않는다(침묵).
 *  3) 연타로 외부 서버를 두드리지 않는다(쿨다운).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { TimetableCheckResult } from '@adapters/hooks/timetableCheckTypes';

const comciganCheck =
  vi.fn<(opts: { manual: boolean; silent?: boolean }) => Promise<TimetableCheckResult>>();
const appinCheck =
  vi.fn<(opts: { manual: boolean; silent?: boolean }) => Promise<TimetableCheckResult>>();

interface FakeSettings {
  comcigan?: { autoSync?: { enabled?: boolean }; fingerprint?: unknown };
  appin?: { autoSync?: { enabled?: boolean } };
}
let settings: FakeSettings = {};
const settingsLoad = vi.fn<() => Promise<void>>();
const scheduleLoad = vi.fn<() => Promise<void>>();

vi.mock('@adapters/hooks/useComciganAutoSync', () => ({
  checkComciganTimetableChange: (opts: { manual: boolean; silent?: boolean }) =>
    comciganCheck(opts),
}));
vi.mock('@adapters/hooks/useAppinAutoSync', () => ({
  checkAppinTimetableChange: (opts: { manual: boolean; silent?: boolean }) => appinCheck(opts),
}));
vi.mock('@adapters/stores/useSettingsStore', () => ({
  useSettingsStore: { getState: () => ({ settings, load: settingsLoad }) },
}));
vi.mock('@adapters/stores/useScheduleStore', () => ({
  useScheduleStore: { getState: () => ({ load: scheduleLoad }) },
}));
const toastShow = vi.fn();
vi.mock('@adapters/components/common/Toast', () => ({
  useToastStore: { getState: () => ({ show: toastShow }) },
}));

const { useTimetableChangeCheck, triggerTimetableCheck } =
  await import('./useTimetableChangeCheck');

const bothConfigured: FakeSettings = {
  comcigan: { autoSync: { enabled: true }, fingerprint: { teacherName: '홍길동' } },
  appin: { autoSync: { enabled: true } },
};

function ok(
  status: TimetableCheckResult['status'],
  changeCount = 0,
): Promise<TimetableCheckResult> {
  return Promise.resolve({ status, changeCount });
}

beforeEach(() => {
  vi.useFakeTimers();
  comciganCheck.mockReset();
  appinCheck.mockReset();
  settingsLoad.mockReset();
  scheduleLoad.mockReset();
  comciganCheck.mockImplementation(() => ok('unchanged'));
  appinCheck.mockImplementation(() => ok('unchanged'));
  settingsLoad.mockImplementation(() => Promise.resolve());
  scheduleLoad.mockImplementation(() => Promise.resolve());
  toastShow.mockReset();
  settings = {};
});

afterEach(() => {
  // vitest globals:false 라 RTL 자동 정리가 등록되지 않는다.
  // 직접 정리하지 않으면 이전 테스트의 훅이 계속 window 이벤트를 듣고 있어
  // 다음 테스트의 클릭 한 번이 여러 번 조회한 것처럼 보인다.
  cleanup();
  vi.useRealTimers();
});

describe('useWidgetTimetableCheck', () => {
  it('자동 새로고침 이벤트(ssampin:refresh-all-widgets)로는 서버를 조회하지 않는다', async () => {
    settings = bothConfigured;
    renderHook(() => useTimetableChangeCheck());

    await act(async () => {
      // useWidgetRefresh 의 주기 새로고침·창 활성화가 쏘는 이벤트
      window.dispatchEvent(new CustomEvent('ssampin:refresh-all-widgets'));
    });

    expect(comciganCheck).not.toHaveBeenCalled();
    expect(appinCheck).not.toHaveBeenCalled();
  });

  it('버튼이 쏘는 확인 이벤트로는 두 원천을 모두 silent 로 조회한다', async () => {
    settings = bothConfigured;
    renderHook(() => useTimetableChangeCheck());

    await act(async () => {
      triggerTimetableCheck();
    });

    expect(comciganCheck).toHaveBeenCalledWith({ manual: true, silent: true });
    expect(appinCheck).toHaveBeenCalledWith({ manual: true, silent: true });
  });

  it('조회 전에 저장된 설정·시간표를 먼저 읽는다 (거짓 감지 방지)', async () => {
    // 위젯 창의 스토어는 시간표 위젯 카드가 있을 때만 채워진다. 비교 기준이 빈 시간표면
    // 실제로는 그대로인데 "전부 바뀌었다"고 알리게 된다.
    settings = bothConfigured;
    const order: string[] = [];
    settingsLoad.mockImplementation(() => {
      order.push('settings-load');
      return Promise.resolve();
    });
    scheduleLoad.mockImplementation(() => {
      order.push('schedule-load');
      return Promise.resolve();
    });
    comciganCheck.mockImplementation(() => {
      order.push('check');
      return ok('unchanged');
    });
    renderHook(() => useTimetableChangeCheck());

    await act(async () => {
      triggerTimetableCheck();
    });

    expect(order).toEqual(['settings-load', 'schedule-load', 'check']);
  });

  it('대시보드 헤더처럼 check() 를 직접 불러도 조회한다', async () => {
    settings = bothConfigured;
    const { result } = renderHook(() => useTimetableChangeCheck());

    await act(async () => {
      result.current.check();
    });

    expect(comciganCheck).toHaveBeenCalledTimes(1);
  });

  it('silent:false 면 확인 함수가 스스로 토스트를 띄우게 넘긴다 (메인 창)', async () => {
    settings = bothConfigured;
    const { result } = renderHook(() => useTimetableChangeCheck({ silent: false }));

    await act(async () => {
      result.current.check();
    });

    expect(comciganCheck).toHaveBeenCalledWith({ manual: true, silent: false });
    expect(appinCheck).toHaveBeenCalledWith({ manual: true, silent: false });
  });

  it('메인 창(silent:false)에서 쿨다운에 걸리면 토스트로 알린다', async () => {
    // 배너가 없는 화면에서는 이 분기가 그대로 "눌러도 아무 반응 없음"이 된다.
    settings = bothConfigured;
    const { result } = renderHook(() => useTimetableChangeCheck({ silent: false }));

    await act(async () => {
      result.current.check();
    });
    toastShow.mockReset();
    await act(async () => {
      result.current.check();
    });

    expect(toastShow).toHaveBeenCalledWith(expect.stringContaining('방금 확인했어요'), 'info');
  });

  it('위젯(silent)에서는 쿨다운을 토스트가 아니라 배너로만 알린다', async () => {
    settings = bothConfigured;
    const { result } = renderHook(() => useTimetableChangeCheck());

    await act(async () => {
      result.current.check();
    });
    await act(async () => {
      result.current.check();
    });

    expect(result.current.state.kind).toBe('cooldown');
    expect(toastShow).not.toHaveBeenCalled();
  });

  it('예외로 확인이 끊겨도 메인 창에서는 토스트로 표면화한다', async () => {
    settings = bothConfigured;
    comciganCheck.mockImplementation(() => Promise.reject(new Error('boom')));
    const { result } = renderHook(() => useTimetableChangeCheck({ silent: false }));

    await act(async () => {
      result.current.check();
    });

    expect(toastShow).toHaveBeenCalledWith(expect.stringContaining('확인하지 못했어요'), 'error');
  });

  it('연동을 쓰지 않으면 조회도 안내도 하지 않는다', async () => {
    settings = {};
    const { result } = renderHook(() => useTimetableChangeCheck());

    await act(async () => {
      triggerTimetableCheck();
    });

    expect(comciganCheck).not.toHaveBeenCalled();
    expect(appinCheck).not.toHaveBeenCalled();
    expect(result.current.state.kind).toBe('hidden');
  });

  it('컴시간만 연동돼 있으면 압핀은 조회하지 않는다', async () => {
    settings = { comcigan: { autoSync: { enabled: true }, fingerprint: {} } };
    renderHook(() => useTimetableChangeCheck());

    await act(async () => {
      triggerTimetableCheck();
    });

    expect(comciganCheck).toHaveBeenCalledTimes(1);
    expect(appinCheck).not.toHaveBeenCalled();
  });

  it('지문이 없으면(연동 미완료) 컴시간을 조회하지 않는다', async () => {
    settings = { comcigan: { autoSync: { enabled: true } } };
    renderHook(() => useTimetableChangeCheck());

    await act(async () => {
      triggerTimetableCheck();
    });

    expect(comciganCheck).not.toHaveBeenCalled();
  });

  it('변경이 감지되면 검토 대기(pending) 상태와 변경 칸 수를 알린다', async () => {
    settings = bothConfigured;
    comciganCheck.mockImplementation(() => ok('pending', 3));
    appinCheck.mockImplementation(() => ok('unchanged'));
    const { result } = renderHook(() => useTimetableChangeCheck());

    await act(async () => {
      triggerTimetableCheck();
    });

    expect(result.current.state).toEqual({
      kind: 'pending',
      sources: ['comcigan'],
      changeCount: 3,
    });
  });

  it('두 원천이 모두 바뀌면 변경 칸 수를 합쳐 함께 알린다', async () => {
    settings = bothConfigured;
    comciganCheck.mockImplementation(() => ok('pending', 3));
    appinCheck.mockImplementation(() => ok('pending', 2));
    const { result } = renderHook(() => useTimetableChangeCheck());

    await act(async () => {
      triggerTimetableCheck();
    });

    expect(result.current.state).toEqual({
      kind: 'pending',
      sources: ['comcigan', 'appin'],
      changeCount: 5,
    });
  });

  it('연결 실패는 재시도할 수 있는 실패 상태로 표면화한다', async () => {
    settings = { comcigan: { autoSync: { enabled: true }, fingerprint: {} } };
    comciganCheck.mockImplementation(() => ok('fetch-failed'));
    const { result } = renderHook(() => useTimetableChangeCheck());

    await act(async () => {
      triggerTimetableCheck();
    });

    expect(result.current.state).toEqual({ kind: 'failed', sources: ['comcigan'] });
  });

  it('변경이 없으면 안내 후 스스로 사라진다', async () => {
    settings = { comcigan: { autoSync: { enabled: true }, fingerprint: {} } };
    const { result } = renderHook(() => useTimetableChangeCheck());

    await act(async () => {
      triggerTimetableCheck();
    });
    expect(result.current.state.kind).toBe('unchanged');

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.state.kind).toBe('hidden');
  });

  it('확인이 끝나기 전에 다시 눌러도 한 번만 조회한다', async () => {
    // 저장 데이터를 읽는 await 사이에 두 번째 클릭이 가드를 통과하면 서버를 두 번 두드린다.
    settings = bothConfigured;
    renderHook(() => useTimetableChangeCheck());

    await act(async () => {
      triggerTimetableCheck();
      triggerTimetableCheck();
    });

    expect(comciganCheck).toHaveBeenCalledTimes(1);
    expect(appinCheck).toHaveBeenCalledTimes(1);
  });

  it('60초 안에 다시 누르면 서버를 다시 조회하지 않는다', async () => {
    settings = { comcigan: { autoSync: { enabled: true }, fingerprint: {} } };
    const { result } = renderHook(() => useTimetableChangeCheck());

    await act(async () => {
      triggerTimetableCheck();
    });
    expect(comciganCheck).toHaveBeenCalledTimes(1);

    await act(async () => {
      triggerTimetableCheck();
    });
    expect(comciganCheck).toHaveBeenCalledTimes(1);
    expect(result.current.state.kind).toBe('cooldown');

    // 쿨다운이 지나면 다시 확인할 수 있다
    await act(async () => {
      vi.advanceTimersByTime(61_000);
    });
    await act(async () => {
      triggerTimetableCheck();
    });
    expect(comciganCheck).toHaveBeenCalledTimes(2);
  });

  it('실패 후 재시도는 쿨다운을 무시한다(사용자가 직접 누른 재시도)', async () => {
    settings = { comcigan: { autoSync: { enabled: true }, fingerprint: {} } };
    comciganCheck.mockImplementation(() => ok('fetch-failed'));
    const { result } = renderHook(() => useTimetableChangeCheck());

    await act(async () => {
      triggerTimetableCheck();
    });
    await act(async () => {
      result.current.retry();
    });

    expect(comciganCheck).toHaveBeenCalledTimes(2);
  });
});

describe('소스 계약', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoSrc = path.resolve(here, '..', '..');

  it('useWidgetRefresh 는 시간표 변동 확인을 알지 못한다 (폴링 금지)', () => {
    // 자동 새로고침 경로(5분 타이머·창 활성화)에 확인이 얹히는 순간
    // 위젯 사용자 전원이 외부 서버를 주기적으로 조회하게 된다.
    // 이벤트가 분리돼 있다는 사실 자체를 소스 수준에서 고정한다.
    const source = readFileSync(path.join(here, 'useWidgetRefresh.ts'), 'utf-8');

    expect(source).not.toMatch(/TimetableCheck|comcigan|appin/i);
  });

  it('새로고침 버튼이 있는 두 화면 모두 변동 확인을 부른다', () => {
    // 2026-08-12 실사용 확인에서 드러난 누락: triggerRefreshAll 을 부르는 곳이
    // 위젯 창 헤더(Widget.tsx)와 메인 창 대시보드 헤더(DashboardHeader.tsx) 두 곳인데
    // 위젯만 고쳐서, 대시보드에서 눌렀을 때는 아무 반응이 없었다.
    const widget = readFileSync(
      path.join(repoSrc, 'adapters', 'components', 'Widget', 'Widget.tsx'),
      'utf-8',
    );
    const dashboard = readFileSync(
      path.join(repoSrc, 'widgets', 'components', 'DashboardHeader.tsx'),
      'utf-8',
    );

    for (const source of [widget, dashboard]) {
      expect(source).toMatch(/triggerRefreshAll/);
      expect(source).toMatch(/triggerTimetableCheck|useTimetableChangeCheck/);
    }
  });
});
