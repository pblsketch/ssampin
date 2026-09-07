/**
 * @vitest-environment jsdom
 *
 * 이미지 첨부(ADR-090) — **"내 AI"(구독 CLI)를 골랐을 때만** 붙일 수 있다.
 *
 * 쌤핀 AI(Solar) 는 이미지를 못 받는다. 그래서 Solar 를 고른 동안에는 버튼이 아예 없고,
 * 구독을 고르면 버튼과 함께 "사진 속 이름·얼굴은 가려지지 않는다"는 줄이 뜬다.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { AssistDock } from '../AssistDock';
import { useAssistStore } from '@adapters/stores/useAssistStore';
import { useOwnAiStatusStore } from '@adapters/stores/useOwnAiStatusStore';
import { ATTACHMENT_ONLY_QUESTION } from '@domain/rules/assistAttachmentRules';

const PNG = {
  id: 'a1',
  name: '출결표.png',
  mediaType: 'image/png' as const,
  bytes: 120,
  dataBase64: 'iVBORw0KGgo=',
};

beforeEach(() => {
  useAssistStore.setState({
    enabled: true,
    ownAiEnabled: true,
    open: true,
    turns: [],
    draft: '',
    attachments: [],
    provider: 'claude',
  });
  useOwnAiStatusStore.setState({
    connections: {
      claude: { provider: 'claude', state: 'connected', version: '2.1.258', model: '' },
      codex: { provider: 'codex', state: 'not-installed' },
    },
  });
});

afterEach(() => {
  cleanup();
});

describe('버튼이 보이는 조건', () => {
  it('내 AI(연결됨)를 고르면 [이미지 붙이기]가 있다', () => {
    render(<AssistDock onAsk={() => {}} roster={[]} />);
    expect(screen.getByRole('button', { name: '이미지 붙이기' })).toBeTruthy();
  });

  it('★쌤핀 AI 를 고르면 버튼이 없다 — 이미지를 못 받는 통로', () => {
    useAssistStore.setState({ provider: 'ssampin' });
    render(<AssistDock onAsk={() => {}} roster={[]} />);
    expect(screen.queryByRole('button', { name: '이미지 붙이기' })).toBeNull();
  });

  it('고른 구독이 연결돼 있지 않으면 버튼이 없다(그 질문은 쌤핀 AI 가 답한다)', () => {
    useAssistStore.setState({ provider: 'codex' });
    render(<AssistDock onAsk={() => {}} roster={[]} />);
    expect(screen.queryByRole('button', { name: '이미지 붙이기' })).toBeNull();
  });
});

describe('붙인 뒤 화면', () => {
  it('미리보기와 "가려지지 않는다" 줄이 뜨고, ✕ 로 뺄 수 있다', () => {
    useAssistStore.setState({ attachments: [PNG] });
    render(<AssistDock onAsk={() => {}} roster={[]} />);

    expect(screen.getByRole('img', { name: '출결표.png' })).toBeTruthy();
    expect(screen.getByText(/사진 속 이름·얼굴은 가려지지 않아요/)).toBeTruthy();
    expect(screen.getByText(/Claude Code에 그대로 보냅니다/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '출결표.png 빼기' }));
    expect(useAssistStore.getState().attachments).toEqual([]);
  });

  it('★글 없이 이미지만 있어도 보낼 수 있고, 그때는 기본 질문이 실린다', () => {
    useAssistStore.setState({ attachments: [PNG] });
    const asked: string[] = [];
    render(<AssistDock onAsk={(q) => asked.push(q)} roster={[]} />);

    const send = screen.getByRole('button', { name: '보내기' });
    expect((send as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(send);
    expect(asked).toEqual([ATTACHMENT_ONLY_QUESTION]);
  });

  it('글도 이미지도 없으면 보낼 수 없다(예전과 같다)', () => {
    render(<AssistDock onAsk={() => {}} roster={[]} />);
    expect((screen.getByRole('button', { name: '보내기' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
