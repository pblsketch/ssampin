/**
 * @vitest-environment jsdom
 *
 * 쌤핀 AI(Solar)에는 동의하지 않고 **"내 AI로 실행"만 켠** 선생님 — 패널이 열려야 한다.
 *
 * 배경(UltraQA P0): 스토어의 `setOpen` 은 둘 중 하나만 켜져 있으면 열어 주는데, 패널 본체는
 * Solar 동의만 보고 `null` 을 그렸다. 사이드바 진입점도 Solar 만 봤다. 그래서 구독만 연결한
 * 선생님은 버튼을 눌러도 아무 일도 안 일어나는 것처럼 보였다 — 기능이 통째로 잠겼다.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { AssistDock } from '../AssistDock';
import { useAssistStore } from '@adapters/stores/useAssistStore';

beforeEach(() => {
  useAssistStore.setState({ open: true, turns: [], draft: '' });
});

afterEach(() => {
  cleanup();
});

describe('패널을 쓸 수 있는 조건 = Solar 동의 **또는** 내 AI 켬', () => {
  it('★Solar 는 끄고 내 AI 만 켜도 패널이 그려진다', () => {
    useAssistStore.setState({ enabled: false, ownAiEnabled: true });
    render(<AssistDock onAsk={() => {}} roster={[]} />);
    expect(screen.getByRole('complementary', { name: '쌤핀 AI' })).toBeTruthy();
  });

  it('Solar 만 켜도 그려진다(예전과 같다)', () => {
    useAssistStore.setState({ enabled: true, ownAiEnabled: false });
    render(<AssistDock onAsk={() => {}} roster={[]} />);
    expect(screen.getByRole('complementary', { name: '쌤핀 AI' })).toBeTruthy();
  });

  it('둘 다 꺼져 있으면 아무것도 그리지 않는다', () => {
    useAssistStore.setState({ enabled: false, ownAiEnabled: false });
    const { container } = render(<AssistDock onAsk={() => {}} roster={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('스토어의 열기 조건과 같다 — 내 AI 만 켠 채 setOpen(true) 가 통한다', () => {
    useAssistStore.setState({ enabled: false, ownAiEnabled: true, open: false });
    useAssistStore.getState().setOpen(true);
    expect(useAssistStore.getState().open).toBe(true);
  });
});
