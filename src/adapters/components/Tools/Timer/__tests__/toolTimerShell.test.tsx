/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { normalizeTimerLocalState } from '@domain/rules/timerLocalState';
import { useTimerLocalStore } from '@adapters/stores/useTimerLocalStore';
import { useLeaveGuardStore } from '@adapters/stores/useLeaveGuardStore';
import { renderInPlacement } from '../../popup/__tests__/toolPopupHarness';

/**
 * 타이머 틀(ADR-139, spec 2-6·5-2·5-3·5-5) — 네 모드가 모두 살아 있고,
 * 단축키는 보이는 탭만 받고, 진행 중이면 화면 이동 안내에 걸린다.
 */

const sounds = { alarm: 0, preWarning: 0, step: 0 };

vi.mock('@adapters/components/Tools/Timer/timerAudio', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@adapters/components/Tools/Timer/timerAudio')>()),
  playAlarmSound: () => void (sounds.alarm += 1),
  playPreWarningSound: () => void (sounds.preWarning += 1),
  playStepTransitionSound: () => void (sounds.step += 1),
  saveCustomAudio: async () => {},
  loadCustomAudio: async () => null,
  deleteCustomAudio: async () => {},
}));

const { ToolTimer } = await import('../ToolTimer');
const { StepsMode } = await import('../StepsMode');

beforeEach(() => {
  sounds.alarm = 0;
  sounds.preWarning = 0;
  sounds.step = 0;
  localStorage.clear();
  useTimerLocalStore.setState({ loaded: false, state: normalizeTimerLocalState(null) });
  useLeaveGuardStore.setState({ guards: [], pending: null, working: false });
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-09-24T09:00:00+09:00'));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

/** 실제 앱처럼 문서 안에서 눌린 키(창 캡처 → 대상 → 창 버블 순서). */
function key(k: string): void {
  act(() => {
    fireEvent.keyDown(document.body, { key: k });
  });
}

function renderShell(options: { onBack?: () => void; variant?: 'desktop' | 'mobile' } = {}) {
  return renderInPlacement(
    <ToolTimer
      onBack={options.onBack ?? (() => {})}
      isFullscreen={false}
      variant={options.variant}
    />,
    { toolId: 'tool-timer', placement: 'main' },
  );
}

function panel(id: string): HTMLElement {
  return document.getElementById(`timer-panel-${id}`)!;
}

function tab(id: string): HTMLElement {
  return document.getElementById(`timer-tab-${id}`)!;
}

describe('타이머 틀 — 탭', () => {
  it('데스크톱은 탭 넷(아이콘이 서로 다름), 모바일은 타이머·스톱워치 둘', () => {
    renderShell();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.getAttribute('id'))).toEqual([
      'timer-tab-timer',
      'timer-tab-stopwatch',
      'timer-tab-presentation',
      'timer-tab-steps',
    ]);
    const icons = tabs.map((t) => t.querySelector('.material-symbols-outlined')?.textContent);
    expect(new Set(icons).size).toBe(4);
    expect(tab('timer').getAttribute('aria-selected')).toBe('true');
    cleanup();

    renderShell({ variant: 'mobile' });
    expect(screen.getAllByRole('tab')).toHaveLength(2);
  });

  it('탭을 바꿔도 타이머는 계속 돌고, 탭에 남은 시간이 보인다', () => {
    renderShell();
    fireEvent.click(within(panel('timer')).getByTitle(/^시작/));
    advance(10_000);
    fireEvent.click(tab('stopwatch'));
    expect(panel('timer').hidden).toBe(true);
    advance(5_000);
    expect(tab('timer').textContent).toContain('04:45');
  });

  it('단축키는 보이는 탭에만 간다 — 스톱워치에서 Space 를 눌러도 타이머는 멈추지 않는다', () => {
    renderShell();
    fireEvent.click(within(panel('timer')).getByTitle(/^시작/));
    fireEvent.click(tab('stopwatch'));
    key(' ');
    // 스톱워치가 시작됐다.
    expect(within(panel('stopwatch')).getByTitle(/^일시정지/)).toBeTruthy();
    // 타이머는 그대로 돈다.
    expect(within(panel('timer')).getByTitle(/^잠시 멈춤/)).toBeTruthy();
    advance(3_000);
    expect(tab('timer').textContent).toContain('04:57');
  });

  it('숨은 탭에서 끝나도 알람이 울리고, 그 탭으로 저절로 넘어가지 않는다', () => {
    renderShell();
    fireEvent.click(within(panel('timer')).getByTitle(/^시작/));
    fireEvent.click(tab('stopwatch'));
    advance(300_000);
    expect(sounds.alarm).toBe(1);
    expect(tab('stopwatch').getAttribute('aria-selected')).toBe('true');
    expect(tab('timer').textContent).toContain('종료');
  });
});

describe('타이머 틀 — 화면 이동 안내 등록', () => {
  it('도는 동안만 이동을 막고, 끝났는데 확인 전이면 창이 숨을 때만 옮긴다', () => {
    renderShell();
    expect(useLeaveGuardStore.getState().guards).toHaveLength(0);

    fireEvent.click(within(panel('timer')).getByTitle(/^시작/));
    let guards = useLeaveGuardStore.getState().guards;
    expect(guards).toHaveLength(1);
    expect(guards[0]!.blocksNavigation).toBe(true);
    // 본문 창·병렬 모드 아님 → 팝업으로 옮길 수 있다.
    expect(guards[0]!.canMoveToPopup()).toBe(true);

    advance(300_000);
    guards = useLeaveGuardStore.getState().guards;
    expect(guards).toHaveLength(1);
    expect(guards[0]!.blocksNavigation).toBe(false);

    // [확인]하면 등록이 풀린다.
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(useLeaveGuardStore.getState().guards).toHaveLength(0);
  });

  it('진행 중에 이동을 청하면 안내가 뜨고, 대기 중이면 바로 이동한다', () => {
    renderShell();
    const proceed = vi.fn();
    useLeaveGuardStore.getState().requestLeave('navigate', proceed);
    expect(proceed).toHaveBeenCalledTimes(1);

    fireEvent.click(within(panel('timer')).getByTitle(/^시작/));
    useLeaveGuardStore.getState().requestLeave('navigate', proceed);
    expect(proceed).toHaveBeenCalledTimes(1);
    expect(useLeaveGuardStore.getState().pending?.allowPopup).toBe(true);
  });
});

describe('타이머 틀 — 교실 화면', () => {
  it('F 로 켜고, Esc 는 교실 화면만 나간다(도구는 그대로)', () => {
    const onBack = vi.fn();
    renderShell({ onBack });
    fireEvent.click(within(panel('timer')).getByTitle(/^시작/));
    key('f');
    expect(screen.getByTestId('classroom-overlay')).toBeTruthy();
    key('Escape');
    expect(screen.queryByTestId('classroom-overlay')).toBeNull();
    expect(onBack).not.toHaveBeenCalled();
    // 타이머는 계속 돈다.
    expect(within(panel('timer')).getByTitle(/^잠시 멈춤/)).toBeTruthy();
  });

  it('입력칸에서 Esc 는 칸에서 빠져나오기만 한다 — 도구를 떠나지 않는다', () => {
    const onBack = vi.fn();
    renderShell({ onBack });
    const input = within(panel('timer')).getByPlaceholderText('활동 이름(선택)');
    input.focus();
    expect(document.activeElement).toBe(input);
    act(() => {
      fireEvent.keyDown(input, { key: 'Escape' });
    });
    expect(onBack).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(input);
    // 입력칸 밖에서는 Esc 가 그대로 뒤로 간다.
    key('Escape');
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('발표 준비 화면에서는 교실 화면 단추가 없다', () => {
    renderShell();
    expect(screen.getByRole('button', { name: '교실 화면으로 보기' })).toBeTruthy();
    fireEvent.click(tab('presentation'));
    expect(screen.queryByRole('button', { name: '교실 화면으로 보기' })).toBeNull();
    key('f');
    expect(screen.queryByTestId('classroom-overlay')).toBeNull();
  });
});

describe('단계 타이머', () => {
  function openExample(name: string): void {
    fireEvent.click(screen.getByRole('button', { name: new RegExp(name) }));
    fireEvent.click(screen.getByRole('button', { name: /이 순서로 시작/ }));
  }

  it('단계가 끝나면 전환음과 함께 다음 단계가 저절로 시작되고, 마지막에 알람이 울린다', () => {
    renderInPlacement(<StepsMode />, { toolId: 'tool-timer', placement: 'main' });
    openExample('생각-짝-나누기');
    expect(screen.getByText('생각하기')).toBeTruthy();
    expect(screen.getByRole('button', { name: '이전 단계' })).toHaveProperty('disabled', true);

    fireEvent.click(screen.getByTitle(/^시작/));
    advance(120_000);
    expect(screen.getByText('짝과 나누기')).toBeTruthy();
    expect(sounds.step).toBe(1);
    expect(sounds.alarm).toBe(0);

    // [다음 단계] — 누른 단계의 처음부터.
    fireEvent.click(screen.getByRole('button', { name: '다음 단계' }));
    expect(screen.getByText('전체 나누기')).toBeTruthy();
    // 마지막 단계에서는 [다음 단계]가 꺼진다.
    expect(screen.getByRole('button', { name: '다음 단계' })).toHaveProperty('disabled', true);

    advance(120_000);
    expect(screen.getByText('시간 종료')).toBeTruthy();
    expect(sounds.alarm).toBe(1);
  });

  it('모둠 순환 — 마지막 바퀴의 자리 이동은 건너뛴다', () => {
    renderInPlacement(<StepsMode />, { toolId: 'tool-timer', placement: 'main' });
    openExample('모둠 순환');
    fireEvent.click(screen.getByTitle(/^시작/));
    // 3바퀴 × (5분 + 1분) + 마지막 모둠 활동 5분 = 23분.
    advance((3 * 360 + 299) * 1000);
    expect(screen.queryByText('시간 종료')).toBeNull();
    expect(screen.getByText(/4\/4바퀴/)).toBeTruthy();
    advance(1_000);
    expect(screen.getByText('시간 종료')).toBeTruthy();
  });

  it('팝업으로 옮기는 사이 단계 경계를 지나면 그만큼 넘기고 전환음은 울리지 않는다', () => {
    const main = renderInPlacement(<StepsMode />, { toolId: 'tool-timer', placement: 'main' });
    openExample('생각-짝-나누기');
    fireEvent.click(screen.getByTitle(/^시작/));
    advance(115_000);
    const envelope = main.capture(Date.now());
    main.unmount();
    advance(10_000);

    renderInPlacement(<StepsMode />, {
      toolId: 'tool-timer',
      placement: 'popup',
      initialSnapshot: envelope,
    });
    expect(screen.getByText('짝과 나누기')).toBeTruthy();
    // 둘째 단계 3분 중 5초가 흘렀다.
    expect(screen.getByRole('timer', { name: '2분 55초' })).toBeTruthy();
    expect(sounds.step).toBe(0);
  });
});
