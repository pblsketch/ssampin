/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { renderInPlacement } from './toolPopupHarness';

const alarmCalls = { alarm: 0, preWarning: 0 };

vi.mock('@adapters/components/Tools/Timer/timerAudio', () => ({
  ALARM_PRESETS: [{ id: 'beep', label: '기본 알림' }],
  PRE_WARNING_PRESETS: [{ id: 'soft', label: '부드럽게', icon: 'notifications' }],
  PRE_WARNING_TIMES: [30, 60],
  playAlarmSound: () => void (alarmCalls.alarm += 1),
  playPreWarningSound: () => void (alarmCalls.preWarning += 1),
  saveCustomAudio: async () => {},
  loadCustomAudio: async () => null,
  deleteCustomAudio: async () => {},
}));

const { TimerMode } = await import('@adapters/components/Tools/Timer/TimerMode');
const { StopwatchMode } = await import('@adapters/components/Tools/Timer/StopwatchMode');
const { PresentationMode } = await import('@adapters/components/Tools/Timer/PresentationMode');

beforeEach(() => {
  alarmCalls.alarm = 0;
  alarmCalls.preWarning = 0;
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-09-08T09:00:00+09:00'));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function pressStart(): void {
  fireEvent.click(screen.getByTitle('시작'));
}

describe('타이머(일반) — 팝업 왕복', () => {
  it('돌던 타이머를 옮기면 시간이 이어지고 알람은 한 번만 울린다', () => {
    const main = renderInPlacement(<TimerMode />, { toolId: 'tool-timer', placement: 'main' });
    // 5분 프리셋이 기본. 시작하고 10초 흘린다.
    pressStart();
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByText('04:50')).toBeTruthy();

    // 본문에서 정지 + 캡처 → 이 순간부터 본문은 소유자가 아니다.
    const envelope = main.capture(Date.now());
    const captured = envelope.slots['timer-countdown'] as { remaining: number; state: string };
    expect(captured.state).toBe('running');
    expect(captured.remaining).toBe(290);

    // 옮기는 데 3초가 걸렸다고 하자. 본문 화면은 사라진다.
    main.unmount();
    act(() => {
      vi.advanceTimersByTime(3_000);
    });

    const popup = renderInPlacement(<TimerMode />, {
      toolId: 'tool-timer',
      placement: 'popup',
      initialSnapshot: envelope,
    });
    // 흐른 3초가 반영돼 287초(04:47)부터 이어진다.
    expect(screen.getByText('04:47')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(screen.getByText('04:45')).toBeTruthy();
    expect(alarmCalls.alarm).toBe(0);
    popup.unmount();
  });

  it('멈춰 둔 타이머는 옮기는 동안 시간이 흐르지 않는다', () => {
    const main = renderInPlacement(<TimerMode />, { toolId: 'tool-timer', placement: 'main' });
    pressStart();
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    fireEvent.click(screen.getByTitle('일시정지'));
    expect(screen.getByText('04:40')).toBeTruthy();

    const envelope = main.capture(Date.now());
    main.unmount();
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    renderInPlacement(<TimerMode />, {
      toolId: 'tool-timer',
      placement: 'popup',
      initialSnapshot: envelope,
    });
    expect(screen.getByText('04:40')).toBeTruthy();
  });

  it('옮기는 사이에 시간이 다 되면 새 창에서 알람이 딱 한 번 울린다', () => {
    const main = renderInPlacement(<TimerMode />, { toolId: 'tool-timer', placement: 'main' });
    pressStart();
    // 5분 중 4분 58초를 흘려 2초만 남긴다.
    act(() => {
      vi.advanceTimersByTime(298_000);
    });
    expect(screen.getByText('00:02')).toBeTruthy();
    expect(alarmCalls.alarm).toBe(0);

    const envelope = main.capture(Date.now());
    main.unmount();
    // 옮기는 데 5초가 걸렸다 — 그사이 종료 시각을 지났다.
    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    renderInPlacement(<TimerMode />, {
      toolId: 'tool-timer',
      placement: 'popup',
      initialSnapshot: envelope,
    });
    expect(screen.getByText('시간 종료!')).toBeTruthy();
    expect(alarmCalls.alarm).toBe(1);
    // 그 뒤로 더 울리지 않는다.
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(alarmCalls.alarm).toBe(1);
  });

  it('★capture 는 원래 창의 타이머를 먼저 멈춘다 — 두 창이 동시에 세지 않는다', () => {
    const main = renderInPlacement(<TimerMode />, { toolId: 'tool-timer', placement: 'main' });
    pressStart();
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.getByText('04:55')).toBeTruthy();

    main.capture(Date.now());
    // 캡처 뒤에는 원래 화면의 숫자가 더 이상 줄지 않는다.
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByText('04:55')).toBeTruthy();
  });

  it('팝업 열기에 실패하면 원래 창에서 흐른 시간을 반영해 되살아난다', () => {
    const main = renderInPlacement(<TimerMode />, { toolId: 'tool-timer', placement: 'main' });
    pressStart();
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    const envelope = main.capture(Date.now());

    // 창이 안 떠서 4초 뒤 실패로 돌아왔다.
    act(() => {
      vi.advanceTimersByTime(4_000);
      main.registry.resume(envelope);
    });
    expect(screen.getByText('04:46')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(screen.getByText('04:44')).toBeTruthy();
  });
});

describe('스톱워치 — 팝업 왕복', () => {
  it('경과 시간과 랩 기록이 그대로 따라간다', () => {
    const main = renderInPlacement(<StopwatchMode />, { toolId: 'tool-timer', placement: 'main' });
    pressStart();
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    fireEvent.click(screen.getByTitle('랩'));
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    fireEvent.click(screen.getByTitle('랩'));

    const envelope = main.capture(Date.now());
    const captured = envelope.slots['timer-stopwatch'] as {
      elapsedMs: number;
      laps: unknown[];
      state: string;
    };
    expect(captured.state).toBe('running');
    expect(captured.laps).toHaveLength(2);
    expect(captured.elapsedMs).toBeGreaterThanOrEqual(5_000);

    main.unmount();
    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    renderInPlacement(<StopwatchMode />, {
      toolId: 'tool-timer',
      placement: 'popup',
      initialSnapshot: envelope,
    });
    // 랩 2개가 그대로 보인다.
    expect(screen.getByText('#1')).toBeTruthy();
    expect(screen.getByText('#2')).toBeTruthy();
    // 옮기는 사이 1초가 더 흘러 6초를 넘겼다.
    expect(screen.getByText(/^00:0[6-9]/)).toBeTruthy();
  });

  it('★capture 는 스톱워치를 먼저 멈춘다', () => {
    const main = renderInPlacement(<StopwatchMode />, { toolId: 'tool-timer', placement: 'main' });
    pressStart();
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    const before = screen.getByText(/^00:0\d/).textContent;
    main.capture(Date.now());
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.getByText(/^00:0\d/).textContent).toBe(before);
  });
});

describe('발표 타이머 — 팝업 왕복', () => {
  function addPresenter(name: string): void {
    const input = screen.getByPlaceholderText(/이름/);
    fireEvent.change(input, { target: { value: name } });
    fireEvent.keyDown(input, { key: 'Enter' });
  }

  it('발표자 목록·순서·진행 상태가 그대로 따라간다', () => {
    const main = renderInPlacement(<PresentationMode />, {
      toolId: 'tool-timer',
      placement: 'main',
    });
    addPresenter('김하늘');
    addPresenter('이바다');

    const envelope = main.capture(Date.now());
    const captured = envelope.slots['timer-presentation'] as {
      presenters: { name: string }[];
      order: [string, number][];
      state: string;
    };
    expect(captured.presenters.map((p) => p.name)).toEqual(['김하늘', '이바다']);
    expect(captured.order).toHaveLength(2);
    expect(captured.state).toBe('setup');

    main.unmount();
    renderInPlacement(<PresentationMode />, {
      toolId: 'tool-timer',
      placement: 'popup',
      initialSnapshot: envelope,
    });
    expect(screen.getByText('김하늘')).toBeTruthy();
    expect(screen.getByText('이바다')).toBeTruthy();
  });
});
