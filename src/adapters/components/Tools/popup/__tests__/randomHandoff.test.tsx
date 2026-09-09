/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderInPlacement } from './toolPopupHarness';

vi.mock('@adapters/hooks/useToolSound', () => ({
  useToolSound: () => ({ playProgress: () => {}, playResult: () => {}, stopAll: () => {} }),
}));

const { ToolRandom } = await import('@adapters/components/Tools/ToolRandom');

afterEach(cleanup);

function renderRandom(
  placement: 'main' | 'popup',
  initialSnapshot: Parameters<typeof renderInPlacement>[1]['initialSnapshot'] = null,
) {
  return renderInPlacement(<ToolRandom onBack={() => {}} isFullscreen={false} />, {
    toolId: 'tool-random',
    placement,
    initialSnapshot,
  });
}

describe('랜덤 뽑기 — 팝업 왕복', () => {
  it('직접 입력 명단·제외 설정·뽑기 이력이 그대로 따라간다', () => {
    const main = renderRandom('main');

    // 직접 입력으로 바꾸고 이름을 넣는다.
    fireEvent.click(screen.getByText(/직접 입력/));
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '가나\n다라\n마바' } });

    const envelope = main.capture(1_700_000_000_000);
    const captured = envelope.slots['random'] as {
      dataSource: string;
      customText: string;
      excludePicked: boolean;
    };
    expect(captured.dataSource).toBe('custom');
    expect(captured.customText).toBe('가나\n다라\n마바');

    main.unmount();
    renderRandom('popup', envelope);
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('가나\n다라\n마바');
  });

  it('넘겨받은 결과·이력을 마운트하자마자 지우지 않는다', () => {
    const envelope = {
      version: 1 as const,
      capturedAt: 1_700_000_000_000,
      slots: {
        random: {
          mode: 'single',
          dataSource: 'custom',
          excludedIds: [],
          rangeConfig: { start: 1, end: 35 },
          customText: '가나\n다라',
          selectedRosterId: null,
          rosterExcludedNames: [],
          pickedItems: ['가나'],
          excludePicked: true,
          multipleCount: 3,
          result: ['가나'],
          showResult: true,
          revealedCount: 1,
        },
      },
    };

    renderRandom('popup', envelope);
    // 결과 화면이 그대로 보인다 — 초기화 효과가 지우지 않는다.
    expect(screen.getAllByText('가나').length).toBeGreaterThan(0);
  });

  it('★capture 는 돌아가던 뽑기를 먼저 멈추고 결과를 다시 뽑지 않는다', () => {
    const main = renderRandom('main');
    fireEvent.click(screen.getByText(/직접 입력/));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '가나\n다라\n마바' } });

    const envelope = main.capture(1_700_000_000_000);
    const captured = envelope.slots['random'] as { result: string[]; pickedItems: string[] };
    // 뽑지 않았으니 결과도 이력도 비어 있어야 한다(임의로 만들어 내지 않는다).
    expect(captured.result).toEqual([]);
    expect(captured.pickedItems).toEqual([]);
  });

  it('제외 목록은 집합이라도 배열로 담겨 그대로 돌아온다', () => {
    // 자료원을 '직접 입력'으로 둔다 — 학급 명단 선택기는 없는 학급 id 를 스스로 지우는데,
    // 그건 올바른 동작이라 이 시험의 대상이 아니다(제외 목록 보존만 본다).
    const envelope = {
      version: 1 as const,
      capturedAt: 1_700_000_000_000,
      slots: {
        random: {
          mode: 'single',
          dataSource: 'custom',
          excludedIds: ['s1', 's2'],
          rangeConfig: { start: 1, end: 35 },
          customText: '',
          selectedRosterId: 'roster-1',
          rosterExcludedNames: ['홍길동'],
          pickedItems: [],
          excludePicked: false,
          multipleCount: 5,
          result: [],
          showResult: false,
          revealedCount: 0,
        },
      },
    };

    const popup = renderRandom('popup', envelope);
    const again = popup.capture(1_700_000_100_000);
    const captured = again.slots['random'] as {
      excludedIds: string[];
      rosterExcludedNames: string[];
      selectedRosterId: string | null;
      multipleCount: number;
      excludePicked: boolean;
    };
    expect(captured.excludedIds.sort()).toEqual(['s1', 's2']);
    expect(captured.rosterExcludedNames).toEqual(['홍길동']);
    expect(captured.selectedRosterId).toBe('roster-1');
    expect(captured.multipleCount).toBe(5);
    expect(captured.excludePicked).toBe(false);
  });
});
