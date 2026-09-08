/**
 * @vitest-environment jsdom
 *
 * "쌤핀 AI(Solar)는 끄고 내 AI만 켠" 선생님 — 답할 AI 의 기본 선택(2026-09-08 실기기 대행 QA R-1).
 *
 * 스토어의 `provider` 기본값은 `ssampin` 이고, `ask` 는 Solar 동의가 없으면 그 선택을 **조용히
 * 돌려보낸다**. 그래서 패널은 열리는데 [보내기]가 무반응이었다. 이제 패널이 (1) 꺼진 통로를 보기에서
 * 빼고 (2) 선택을 연결된 구독으로 옮기며 (3) 그래도 막히면 한 줄로 말한다.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { AssistDock } from '../AssistDock';
import { useAssistStore } from '@adapters/stores/useAssistStore';
import { useOwnAiStatusStore } from '@adapters/stores/useOwnAiStatusStore';

beforeEach(() => {
  useAssistStore.setState({
    enabled: false,
    ownAiEnabled: true,
    open: true,
    turns: [],
    draft: '',
    attachments: [],
    provider: 'ssampin',
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

describe('Solar 꺼짐 + 내 AI 켜짐', () => {
  it('★선택이 쌤핀 AI 에 남아 있으면 연결된 구독으로 옮긴다', () => {
    render(<AssistDock onAsk={() => {}} roster={[]} />);
    expect(useAssistStore.getState().provider).toBe('claude');
  });

  it('꺼진 쌤핀 AI 는 고르기 목록에 없다', () => {
    render(<AssistDock onAsk={() => {}} roster={[]} />);
    const select = screen.getByRole('combobox', { name: '답하는 AI 고르기' });
    const labels = [...select.querySelectorAll('option')].map((o) => o.textContent);
    expect(labels).not.toContain('쌤핀 AI');
    expect(labels).toContain('Claude Code');
  });

  it('★연결된 구독이 없으면 [보내기]가 조용히 무시되지 않고 이유를 말한다', () => {
    useOwnAiStatusStore.setState({
      connections: {
        claude: { provider: 'claude', state: 'not-installed' },
        codex: { provider: 'codex', state: 'not-installed' },
      },
    });
    useAssistStore.setState({ draft: '이번 주 할 일 몇 개야?' });
    let asked = 0;
    render(<AssistDock onAsk={() => (asked += 1)} roster={[]} />);
    fireEvent.click(screen.getByRole('button', { name: '보내기' }));
    expect(asked).toBe(0);
    expect(screen.getByRole('alert').textContent).toContain('쌤핀 AI가 꺼져 있고');
  });
});

describe('Solar 켜짐', () => {
  it('쌤핀 AI 옵션이 그대로 있고 선택도 바뀌지 않는다(예전과 같다)', () => {
    useAssistStore.setState({ enabled: true, provider: 'ssampin' });
    render(<AssistDock onAsk={() => {}} roster={[]} />);
    expect(useAssistStore.getState().provider).toBe('ssampin');
    const select = screen.getByRole('combobox', { name: '답하는 AI 고르기' });
    expect([...select.querySelectorAll('option')].map((o) => o.textContent)).toContain('쌤핀 AI');
  });
});

describe('[중단]', () => {
  it('구독 AI 가 답하는 중에만 [중단]이 보인다', () => {
    useAssistStore.setState({
      enabled: true,
      provider: 'claude',
      turns: [
        {
          id: 't1',
          question: '질문',
          cards: [],
          answer: '',
          outboundAnswer: '',
          outboundQuestion: '질문',
          outboundCards: [],
          degraded: null,
          status: 'thinking',
          maskedCount: 0,
          blankedCount: 0,
          answeredBy: { provider: 'claude', model: '' },
        },
      ],
    });
    render(<AssistDock onAsk={() => {}} roster={[]} />);
    expect(screen.getByRole('button', { name: '중단' })).toBeTruthy();
  });

  it('쌤핀 AI 가 답하는 중에는 [중단]이 없다(멈출 수 없는 통로)', () => {
    useAssistStore.setState({
      enabled: true,
      provider: 'ssampin',
      turns: [
        {
          id: 't1',
          question: '질문',
          cards: [],
          answer: '',
          outboundAnswer: '',
          outboundQuestion: '질문',
          outboundCards: [],
          degraded: null,
          status: 'thinking',
          maskedCount: 0,
          blankedCount: 0,
          answeredBy: { provider: 'ssampin', model: '' },
        },
      ],
    });
    render(<AssistDock onAsk={() => {}} roster={[]} />);
    expect(screen.queryByRole('button', { name: '중단' })).toBeNull();
  });
});
