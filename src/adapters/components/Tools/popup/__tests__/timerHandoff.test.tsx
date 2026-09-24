/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { normalizeTimerLocalState } from '@domain/rules/timerLocalState';
import { useTimerLocalStore } from '@adapters/stores/useTimerLocalStore';
import { renderInPlacement } from './toolPopupHarness';

const alarmCalls = { alarm: 0, preWarning: 0 };

vi.mock('@adapters/components/Tools/Timer/timerAudio', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@adapters/components/Tools/Timer/timerAudio')>()),
  playAlarmSound: () => void (alarmCalls.alarm += 1),
  playPreWarningSound: () => void (alarmCalls.preWarning += 1),
  playStepTransitionSound: () => {},
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
  localStorage.clear();
  useTimerLocalStore.setState({ loaded: false, state: normalizeTimerLocalState(null) });
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-09-08T09:00:00+09:00'));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** 남은 시간 숫자(화면 읽기 이름 "4분 50초"). */
function remainingTimer(mmss: string): HTMLElement {
  const [m, s] = mmss.split(':').map(Number);
  return screen.getByRole('timer', { name: `${m}분 ${s}초` });
}

function pressStart(): void {
  fireEvent.click(screen.getByTitle(/^시작/));
}

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function key(k: string): void {
  act(() => {
    fireEvent.keyDown(window, { key: k });
  });
}

describe('타이머(일반) — 팝업 왕복', () => {
  it('돌던 타이머를 옮기면 시간이 이어지고 알람은 한 번만 울린다', () => {
    const main = renderInPlacement(<TimerMode />, { toolId: 'tool-timer', placement: 'main' });
    // 5분이 기본. 시작하고 10초 흘린다.
    pressStart();
    advance(10_000);
    expect(remainingTimer('04:50')).toBeTruthy();

    // 본문에서 정지 + 캡처 → 이 순간부터 본문은 소유자가 아니다.
    const envelope = main.capture(Date.now());
    const captured = envelope.slots['timer-countdown'] as { remaining: number; state: string };
    expect(captured.state).toBe('running');
    expect(captured.remaining).toBe(290);

    // 옮기는 데 3초가 걸렸다고 하자. 본문 화면은 사라진다.
    main.unmount();
    advance(3_000);

    const popup = renderInPlacement(<TimerMode />, {
      toolId: 'tool-timer',
      placement: 'popup',
      initialSnapshot: envelope,
    });
    // 흐른 3초가 반영돼 287초(04:47)부터 이어진다.
    expect(remainingTimer('04:47')).toBeTruthy();
    advance(2_000);
    expect(remainingTimer('04:45')).toBeTruthy();
    expect(alarmCalls.alarm).toBe(0);
    popup.unmount();
  });

  it('멈춰 둔 타이머는 옮기는 동안 시간이 흐르지 않는다', () => {
    const main = renderInPlacement(<TimerMode />, { toolId: 'tool-timer', placement: 'main' });
    pressStart();
    advance(20_000);
    fireEvent.click(screen.getByTitle(/^잠시 멈춤/));
    expect(remainingTimer('04:40')).toBeTruthy();

    const envelope = main.capture(Date.now());
    main.unmount();
    advance(60_000);

    renderInPlacement(<TimerMode />, {
      toolId: 'tool-timer',
      placement: 'popup',
      initialSnapshot: envelope,
    });
    expect(remainingTimer('04:40')).toBeTruthy();
  });

  it('옮기는 사이에 시간이 다 되면 새 창에서 알람이 딱 한 번 울린다', () => {
    const main = renderInPlacement(<TimerMode />, { toolId: 'tool-timer', placement: 'main' });
    pressStart();
    // 5분 중 4분 58초를 흘려 2초만 남긴다.
    advance(298_000);
    expect(remainingTimer('00:02')).toBeTruthy();
    expect(alarmCalls.alarm).toBe(0);

    const envelope = main.capture(Date.now());
    main.unmount();
    // 옮기는 데 5초가 걸렸다 — 그사이 종료 시각을 지났다.
    advance(5_000);

    renderInPlacement(<TimerMode />, {
      toolId: 'tool-timer',
      placement: 'popup',
      initialSnapshot: envelope,
    });
    expect(screen.getByText('시간 종료')).toBeTruthy();
    expect(alarmCalls.alarm).toBe(1);
    // 그 뒤로 더 울리지 않는다(반복 기본값 '한 번').
    advance(10_000);
    expect(alarmCalls.alarm).toBe(1);
  });

  it('이미 끝나 있던 타이머는 새 창에서 알람을 다시 울리지 않고 초과 시간을 이어 센다', () => {
    const main = renderInPlacement(<TimerMode />, { toolId: 'tool-timer', placement: 'main' });
    pressStart();
    advance(300_000);
    expect(alarmCalls.alarm).toBe(1);
    advance(20_000);

    const envelope = main.capture(Date.now());
    main.unmount();
    advance(5_000);

    renderInPlacement(<TimerMode />, {
      toolId: 'tool-timer',
      placement: 'popup',
      initialSnapshot: envelope,
    });
    expect(screen.getByText('시간 종료')).toBeTruthy();
    expect(screen.getByRole('timer', { name: '넘긴 시간 0분 25초' })).toBeTruthy();
    expect(alarmCalls.alarm).toBe(1);
  });

  it('★capture 는 원래 창의 타이머를 먼저 멈춘다 — 두 창이 동시에 세지 않는다', () => {
    const main = renderInPlacement(<TimerMode />, { toolId: 'tool-timer', placement: 'main' });
    pressStart();
    advance(5_000);
    expect(remainingTimer('04:55')).toBeTruthy();

    main.capture(Date.now());
    // 캡처 뒤에는 원래 화면의 숫자가 더 이상 줄지 않는다.
    advance(10_000);
    expect(remainingTimer('04:55')).toBeTruthy();
  });

  it('팝업 열기에 실패하면 원래 창에서 흐른 시간을 반영해 되살아난다', () => {
    const main = renderInPlacement(<TimerMode />, { toolId: 'tool-timer', placement: 'main' });
    pressStart();
    advance(10_000);
    const envelope = main.capture(Date.now());

    // 창이 안 떠서 4초 뒤 실패로 돌아왔다.
    act(() => {
      vi.advanceTimersByTime(4_000);
      main.registry.resume(envelope);
    });
    expect(remainingTimer('04:46')).toBeTruthy();
    advance(2_000);
    expect(remainingTimer('04:44')).toBeTruthy();
  });
});

describe('스톱워치 — 팝업 왕복', () => {
  it('경과 시간과 랩 기록이 그대로 따라간다', () => {
    const main = renderInPlacement(<StopwatchMode />, { toolId: 'tool-timer', placement: 'main' });
    pressStart();
    advance(3_000);
    fireEvent.click(screen.getByTitle(/^랩/));
    advance(2_000);
    fireEvent.click(screen.getByTitle(/^랩/));

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
    advance(1_000);

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
    advance(2_000);
    const before = screen.getByText(/^00:0\d/).textContent;
    main.capture(Date.now());
    advance(5_000);
    expect(screen.getByText(/^00:0\d/).textContent).toBe(before);
  });
});

describe('발표 타이머', () => {
  function addPresenter(name: string): void {
    const input = screen.getByPlaceholderText(/이름/);
    fireEvent.change(input, { target: { value: name } });
    fireEvent.keyDown(input, { key: 'Enter' });
  }

  function start(): void {
    fireEvent.click(screen.getByRole('button', { name: /발표 시작/ }));
  }

  function click(name: RegExp): void {
    fireEvent.click(screen.getByRole('button', { name }));
  }

  it('준비 화면의 명단·순서가 팝업으로 그대로 따라간다', () => {
    const main = renderInPlacement(<PresentationMode />, {
      toolId: 'tool-timer',
      placement: 'main',
    });
    addPresenter('김하늘');
    addPresenter('이바다');

    const envelope = main.capture(Date.now());
    const captured = envelope.slots['timer-presentation'] as {
      setup: { presenters: { name: string }[]; order: [string, number][] };
      phase: string;
    };
    expect(captured.setup.presenters.map((p) => p.name)).toEqual(['김하늘', '이바다']);
    expect(captured.setup.order).toHaveLength(2);
    expect(captured.phase).toBe('setup');

    main.unmount();
    renderInPlacement(<PresentationMode />, {
      toolId: 'tool-timer',
      placement: 'popup',
      initialSnapshot: envelope,
    });
    expect(screen.getByText('김하늘')).toBeTruthy();
    expect(screen.getByText('이바다')).toBeTruthy();
  });

  it('발표 중에 옮기면 남은 시간이 이어진다', () => {
    const main = renderInPlacement(<PresentationMode />, {
      toolId: 'tool-timer',
      placement: 'main',
    });
    addPresenter('김하늘');
    addPresenter('이바다');
    start();
    advance(10_000);
    expect(remainingTimer('02:50')).toBeTruthy();

    const envelope = main.capture(Date.now());
    const captured = envelope.slots['timer-presentation'] as { phase: string; remaining: number };
    expect(captured.phase).toBe('talk');
    expect(captured.remaining).toBe(170);
    main.unmount();
    advance(3_000);

    renderInPlacement(<PresentationMode />, {
      toolId: 'tool-timer',
      placement: 'popup',
      initialSnapshot: envelope,
    });
    expect(screen.getByText('김하늘')).toBeTruthy();
    expect(remainingTimer('02:47')).toBeTruthy();
  });

  it('[발표 마침]·시간 다 됨 — 알람은 한 번, 시간 기록은 쓴 시간과 넘긴 시간만', () => {
    renderInPlacement(<PresentationMode />, { toolId: 'tool-timer', placement: 'main' });
    addPresenter('김하늘');
    addPresenter('이바다');
    start();

    // 첫 학생은 30초 만에 일찍 끝냈다.
    advance(30_000);
    click(/발표 마침/);
    expect(screen.getByText('발표 마침', { selector: 'p' })).toBeTruthy();
    expect(alarmCalls.alarm).toBe(0);
    click(/다음 발표자/);

    // 둘째 학생은 3분을 다 쓰고 35초를 넘겼다.
    expect(screen.getByText('이바다')).toBeTruthy();
    advance(180_000);
    expect(screen.getByText('시간 종료')).toBeTruthy();
    expect(alarmCalls.alarm).toBe(1);
    advance(35_000);
    // 발표 중인 학생을 끊지 않도록 반복하지 않는다.
    expect(alarmCalls.alarm).toBe(1);
    click(/다음 발표자/);

    expect(screen.getByText('발표 완료!')).toBeTruthy();
    // 기록은 눌러야 보인다.
    expect(screen.queryByRole('list', { name: '발표 시간 기록' })).toBeNull();
    click(/시간 기록 보기/);
    const rows = screen.getByRole('list', { name: '발표 시간 기록' }).querySelectorAll('li');
    expect(rows).toHaveLength(2);
    // 실제 발표한 차례 그대로.
    expect(rows[0]!.textContent).toBe('김하늘0:30');
    expect(rows[1]!.textContent).toBe('이바다3:35 +0:35');
  });

  it('질문 시간 — 선생님이 눌러야 시작하고, 끝나면 다음 발표자를 기다린다', () => {
    renderInPlacement(<PresentationMode />, { toolId: 'tool-timer', placement: 'main' });
    addPresenter('김하늘');
    addPresenter('이바다');
    fireEvent.click(screen.getByRole('switch', { name: '발표 뒤 질문 시간' }));
    // 입력칸에 초점이 없어야 단축키가 먹는다.
    (document.activeElement as HTMLElement | null)?.blur();

    key(' '); // 발표 시작
    expect(remainingTimer('03:00')).toBeTruthy();
    advance(180_000);
    expect(alarmCalls.alarm).toBe(1);
    // 질문 시간이 켜져 있으면 저절로 넘어가지 않는다.
    advance(5_000);
    expect(screen.getByText('시간 종료')).toBeTruthy();

    key(' '); // [질문 시간]
    expect(screen.getByText('질문 시간')).toBeTruthy();
    expect(remainingTimer('01:00')).toBeTruthy();
    advance(60_000);
    expect(screen.getByText('질문 시간 끝')).toBeTruthy();
    expect(alarmCalls.alarm).toBe(2);

    key('ArrowRight'); // [다음 발표자]
    expect(screen.getByText('이바다')).toBeTruthy();
    expect(remainingTimer('03:00')).toBeTruthy();
  });

  it('[나중에] — 맨 뒤로 보내고 다음 학생을 곧바로 시작, 한 학생은 한 번만', () => {
    renderInPlacement(<PresentationMode />, { toolId: 'tool-timer', placement: 'main' });
    addPresenter('가');
    addPresenter('나');
    start();
    advance(20_000);
    click(/나중에/);
    // 다음 학생이 3분부터 시작한다.
    expect(screen.getByText('나', { selector: 'p' })).toBeTruthy();
    expect(remainingTimer('03:00')).toBeTruthy();
    // 남은 학생이 '가' 하나뿐이 아니므로 아직 보인다… '나'는 미루지 않았다.
    click(/발표 마침/);
    click(/다음 발표자/);
    // 미뤘던 학생 차례 — 다시 미룰 수 없다.
    expect(screen.getByText('가', { selector: 'p' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /나중에/ })).toBeNull();
  });

  it('자동 진행을 기다리던 중에 옮겨도 새 창에서 다음 발표자로 넘어간다', () => {
    const main = renderInPlacement(<PresentationMode />, {
      toolId: 'tool-timer',
      placement: 'main',
    });
    addPresenter('김하늘');
    addPresenter('이바다');
    fireEvent.click(screen.getByRole('switch', { name: '다음 발표자 자동 진행' }));
    start();
    advance(30_000);
    click(/발표 마침/);
    // 2초를 다 기다리기 전에 옮긴다.
    advance(1_000);
    const envelope = main.capture(Date.now());
    main.unmount();
    renderInPlacement(<PresentationMode />, {
      toolId: 'tool-timer',
      placement: 'popup',
      initialSnapshot: envelope,
    });
    expect(screen.getByText('발표 마침', { selector: 'p' })).toBeTruthy();
    advance(2_100);
    expect(screen.getByText('이바다', { selector: 'p' })).toBeTruthy();
    expect(remainingTimer('03:00')).toBeTruthy();
  });

  it('명단은 이 기기에 기억돼 다시 열면 준비 화면에 그대로 있다', async () => {
    const first = renderInPlacement(<PresentationMode />, {
      toolId: 'tool-timer',
      placement: 'main',
    });
    addPresenter('김하늘');
    await act(async () => {
      await Promise.resolve();
    });
    first.unmount();

    useTimerLocalStore.setState({ loaded: false, state: normalizeTimerLocalState(null) });
    renderInPlacement(<PresentationMode />, { toolId: 'tool-timer', placement: 'main' });
    expect(await screen.findByText('김하늘')).toBeTruthy();
  });
});
