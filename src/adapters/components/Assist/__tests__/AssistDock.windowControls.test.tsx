/**
 * @vitest-environment jsdom
 *
 * 쌤핀 AI 패널 — 창 조작 버튼과 겹치지 않는가
 *
 * 배경(2026-08-23 사용자 신고): 패널의 닫기(✕)와 창의 닫기(✕)가 겹쳐 보였다.
 * 이 패널은 본문 칸의 오른쪽 형제라, 본문 칸이 위에 둔 띠(`WindowDragStrip`)의 혜택을
 * 못 받는다. 그런데 창 버튼은 창 오른쪽 위에 떠 있어 정확히 이 패널 머리 위에 내려앉는다.
 *
 * 그래서 패널 안에도 같은 띠를 둔다. 이 테스트는 **띠가 헤더보다 먼저 온다**는 것만 본다 —
 * 높이는 OS 가 알려 주는 값(`env(titlebar-area-height)`)이라 jsdom 에서 잴 수 없다.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { AssistDock } from '../AssistDock';
import { useAssistStore } from '@adapters/stores/useAssistStore';

/** 창 조작 버튼이 화면 위에 떠 있는 모드를 흉내 낸다(윈도우 11 + 제목표시줄 제거). */
function setWindowControlsOverlay(visible: boolean): void {
  Object.defineProperty(navigator, 'windowControlsOverlay', {
    value: { visible, addEventListener: () => {}, removeEventListener: () => {} },
    configurable: true,
  });
}

beforeEach(() => {
  useAssistStore.setState({ enabled: true, open: true, turns: [], draft: '' });
});

afterEach(() => {
  // 이 저장소는 testing-library 자동 정리를 켜 두지 않았다(setupFiles 없음).
  // 직접 지우지 않으면 앞 테스트가 그린 패널이 남아 "같은 것이 둘"로 잡힌다.
  cleanup();
  Reflect.deleteProperty(navigator, 'windowControlsOverlay');
});

describe('AssistDock — 창 조작 버튼 자리', () => {
  it('창 버튼이 떠 있으면 헤더 앞에 자리를 비워 둔다', () => {
    setWindowControlsOverlay(true);

    render(<AssistDock onAsk={() => {}} />);

    const panel = screen.getByLabelText('쌤핀 AI');
    const header = screen.getByLabelText('쌤핀 AI 닫기').closest('header');

    // 헤더가 패널의 첫 요소면 창 버튼 바로 밑에 깔린다 — 그것이 겹침의 원인이었다.
    expect(panel.firstElementChild).not.toBe(header);
    expect(panel.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
  });

  it('창 버튼이 없는 환경(브라우저·macOS)에서는 빈 줄을 만들지 않는다', () => {
    setWindowControlsOverlay(false);

    render(<AssistDock onAsk={() => {}} />);

    const panel = screen.getByLabelText('쌤핀 AI');
    const header = screen.getByLabelText('쌤핀 AI 닫기').closest('header');

    expect(panel.firstElementChild).toBe(header);
  });
});
