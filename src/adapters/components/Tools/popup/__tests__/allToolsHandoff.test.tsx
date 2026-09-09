/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { POPUP_TOOL_IDS } from '@domain/entities/ToolPopup';
import type { PopupToolId } from '@domain/entities/ToolPopup';
import { renderInPlacement } from './toolPopupHarness';

vi.mock('@adapters/hooks/useToolSound', () => ({
  useToolSound: () => ({ playProgress: () => {}, playResult: () => {}, stopAll: () => {} }),
}));

vi.mock('@adapters/components/Tools/Timer/timerAudio', () => ({
  ALARM_PRESETS: [{ id: 'beep', label: '기본 알림' }],
  PRE_WARNING_PRESETS: [{ id: 'soft', label: '부드럽게', icon: 'notifications' }],
  PRE_WARNING_TIMES: [30, 60],
  playAlarmSound: () => {},
  playPreWarningSound: () => {},
  saveCustomAudio: async () => {},
  loadCustomAudio: async () => null,
  deleteCustomAudio: async () => {},
}));

vi.mock('qrcode', () => ({
  default: {
    toCanvas: (_c: unknown, _v: unknown, _o: unknown, cb: (e: unknown) => void) => cb(null),
  },
}));

const { TOOL_REGISTRY } = await import('@adapters/components/Tools/toolRegistry');

afterEach(cleanup);

/** 도구별로 "이 칸이 스냅샷에 담겨야 한다"는 약속. */
const EXPECTED_SLOTS: Readonly<Record<PopupToolId, readonly string[]>> = {
  'tool-timer': ['timer-shell', 'timer-countdown'],
  'tool-random': ['random'],
  'tool-traffic-light': ['traffic-light'],
  'tool-scoreboard': ['scoreboard'],
  'tool-roulette': ['roulette'],
  'tool-dice': ['dice'],
  'tool-coin': ['coin'],
  'tool-qrcode': ['qrcode'],
  'tool-work-symbols': ['work-symbols'],
};

function renderTool(
  toolId: PopupToolId,
  placement: 'main' | 'popup',
  initialSnapshot: Parameters<typeof renderInPlacement>[1]['initialSnapshot'] = null,
) {
  const Tool = TOOL_REGISTRY[toolId].component;
  return renderInPlacement(<Tool onBack={() => {}} isFullscreen={false} />, {
    toolId,
    placement,
    initialSnapshot,
  });
}

describe('쌤도구 팝업 — 9종 전부가 이관에 참여한다', () => {
  it('9종 모두 팝업 지원 목록에 있다', () => {
    expect(POPUP_TOOL_IDS).toHaveLength(9);
  });

  it.each(POPUP_TOOL_IDS)('%s — 자기 칸을 등록하고 왕복해도 값이 그대로다', (toolId) => {
    const main = renderTool(toolId, 'main');
    const envelope = main.capture(1_700_000_000_000);

    for (const slot of EXPECTED_SLOTS[toolId]) {
      expect(Object.prototype.hasOwnProperty.call(envelope.slots, slot)).toBe(true);
    }
    main.unmount();

    // 팝업에서 그대로 받고 다시 담아도 값이 바뀌지 않는다.
    const popup = renderTool(toolId, 'popup', envelope);
    const again = popup.capture(1_700_000_100_000);
    for (const slot of EXPECTED_SLOTS[toolId]) {
      expect(again.slots[slot]).toEqual(envelope.slots[slot]);
    }
  });
});

describe('점수판 — 팀 이름·점수 보존', () => {
  it('팀 이름을 고치고 점수를 올린 뒤 옮겨도 그대로다', () => {
    const main = renderTool('tool-scoreboard', 'main');
    const nameInputs = screen.getAllByRole('textbox');
    fireEvent.change(nameInputs[0]!, { target: { value: '무지개조' } });
    fireEvent.click(screen.getByText(/게임 시작/));
    // 점수판 화면에서 첫 팀 점수를 올린다.
    fireEvent.click(screen.getAllByText('+1')[0]!);

    const envelope = main.capture(1_700_000_000_000);
    const captured = envelope.slots['scoreboard'] as {
      viewMode: string;
      teams: { name: string; score: number }[];
    };
    expect(captured.viewMode).toBe('scoreboard');
    expect(captured.teams[0]!.name).toBe('무지개조');
    expect(captured.teams[0]!.score).toBe(1);

    main.unmount();
    renderTool('tool-scoreboard', 'popup', envelope);
    expect(screen.getByText('무지개조')).toBeTruthy();
  });
});

describe('룰렛 — 항목·이력 보존과 재추첨 금지', () => {
  it('항목과 당첨 이력이 그대로 따라가고 다시 뽑지 않는다', () => {
    const envelope = {
      version: 1 as const,
      capturedAt: 1_700_000_000_000,
      slots: {
        roulette: {
          items: ['가', '나', '다', '라'],
          inputMode: 'custom',
          rotation: 3_240,
          winner: '다',
          winnerIndex: 2,
          history: ['다', '가'],
          historyIdx: [2, 0],
        },
      },
    };

    const popup = renderTool('tool-roulette', 'popup', envelope);
    const again = popup.capture(1_700_000_100_000);
    const captured = again.slots['roulette'] as {
      winner: string | null;
      winnerIndex: number | null;
      history: string[];
      rotation: number;
      items: string[];
    };
    // 결과가 새로 뽑히지 않았다.
    expect(captured.winner).toBe('다');
    expect(captured.winnerIndex).toBe(2);
    expect(captured.history).toEqual(['다', '가']);
    expect(captured.rotation).toBe(3_240);
    expect(captured.items).toEqual(['가', '나', '다', '라']);
  });
});

describe('QR코드 — 입력 내용 보존', () => {
  it('주소를 입력한 뒤 옮겨도 그대로 남는다', () => {
    const main = renderTool('tool-qrcode', 'main');
    const input = screen.getAllByRole('textbox')[0]!;
    fireEvent.change(input, { target: { value: 'https://www.ssampin.com/docs' } });

    const envelope = main.capture(1_700_000_000_000);
    const captured = envelope.slots['qrcode'] as { urlInput: string; tab: string };
    expect(captured.urlInput).toBe('https://www.ssampin.com/docs');
    expect(captured.tab).toBe('url');

    main.unmount();
    renderTool('tool-qrcode', 'popup', envelope);
    expect((screen.getAllByRole('textbox')[0] as HTMLInputElement).value).toBe(
      'https://www.ssampin.com/docs',
    );
  });
});

describe('주사위·동전 — 결과와 누적 보존', () => {
  it('주사위 눈과 이력이 그대로 따라간다', () => {
    const envelope = {
      version: 1 as const,
      capturedAt: 1_700_000_000_000,
      slots: {
        dice: {
          diceCount: 2,
          results: [4, 6],
          history: [
            [4, 6],
            [1, 2],
          ],
        },
      },
    };
    const popup = renderTool('tool-dice', 'popup', envelope);
    const captured = popup.capture(1_700_000_100_000).slots['dice'] as {
      diceCount: number;
      results: number[];
      history: number[][];
    };
    expect(captured.diceCount).toBe(2);
    expect(captured.results).toEqual([4, 6]);
    expect(captured.history).toEqual([
      [4, 6],
      [1, 2],
    ]);
  });

  it('동전 결과와 앞·뒤 누적이 그대로 따라간다', () => {
    const envelope = {
      version: 1 as const,
      capturedAt: 1_700_000_000_000,
      slots: {
        coin: { rotation: 1_080, result: 'tails', showResult: true, stats: { heads: 3, tails: 5 } },
      },
    };
    const popup = renderTool('tool-coin', 'popup', envelope);
    const captured = popup.capture(1_700_000_100_000).slots['coin'] as {
      result: string;
      stats: { heads: number; tails: number };
      rotation: number;
    };
    expect(captured.result).toBe('tails');
    expect(captured.stats).toEqual({ heads: 3, tails: 5 });
    expect(captured.rotation).toBe(1_080);
  });
});

describe('신호등·활동 기호 — 선택 상태 보존', () => {
  it('신호등 불빛과 남은 시간이 따라간다', () => {
    const envelope = {
      version: 1 as const,
      capturedAt: 1_700_000_000_000,
      slots: {
        'traffic-light': {
          mode: 'manual',
          activeLight: 'green',
          selectedDuration: 300,
          customDuration: '',
          isCustom: false,
          isRunning: false,
          timeLeft: 0,
        },
      },
    };
    const popup = renderTool('tool-traffic-light', 'popup', envelope);
    const captured = popup.capture(1_700_000_100_000).slots['traffic-light'] as {
      activeLight: string;
      selectedDuration: number;
    };
    expect(captured.activeLight).toBe('green');
    expect(captured.selectedDuration).toBe(300);
  });

  it('활동 기호에서 고른 항목이 따라간다', () => {
    const envelope = {
      version: 1 as const,
      capturedAt: 1_700_000_000_000,
      slots: { 'work-symbols': { selectedIndex: 2 } },
    };
    const popup = renderTool('tool-work-symbols', 'popup', envelope);
    const captured = popup.capture(1_700_000_100_000).slots['work-symbols'] as {
      selectedIndex: number;
    };
    expect(captured.selectedIndex).toBe(2);
  });
});
