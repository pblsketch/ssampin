/**
 * @vitest-environment jsdom
 *
 * 쌤핀 AI — 구글에서 가져온 항목은 **화면에만** 남는다 (ADR-136)
 *
 * AI 에게는 보내지 않았으므로 AI 답은 이 줄들을 모른다. 그래서 카드 안의 다른 목록과 섞지 않고
 * 따로 묶어, "AI에게는 보내지 않았어요"를 글자로 보여 준다. 여기서는 그 칸이 실제로 그려지는지 본다.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { AssistThread } from '../AssistThread';
import type { AssistTurn } from '@adapters/stores/useAssistStore';
import { findAssistTool } from '@domain/services/assistToolRegistry';
import { sanitizeToolResult } from '@domain/services/sanitizeToolResult';
import type { ToolResultShape } from '@domain/services/sanitizeToolResult';

afterEach(cleanup);

function eventTurn(withGoogle: boolean): AssistTurn {
  const tool = findAssistTool('get_events');
  if (!tool) throw new Error('도구 없음');
  return {
    id: 't1',
    question: '이번 주 일정',
    cards: [
      {
        tool: tool.id,
        data: sanitizeToolResult(tool, {
          period: '2026-09-21 ~ 2026-09-27',
          truncated: false,
          items: [{ date: '2026-09-24', title: '학년 협의회', time: '', location: '' }],
          googleItemsNotIncluded: true,
        } as ToolResultShape),
        ...(withGoogle
          ? {
              localOnly: {
                kind: 'google' as const,
                items: [{ date: '2026-09-24', title: '치과 예약', tail: '15:00 - 16:00' }],
              },
            }
          : {}),
      },
    ],
    answer: '',
    outboundAnswer: '',
    outboundCards: [],
    degraded: null,
    status: 'done',
    maskedCount: 0,
    blankedCount: 0,
  };
}

describe('AssistThread — 구글에서 가져온 항목 칸', () => {
  it('구글 항목은 따로 묶이고, AI에게 보내지 않았다는 말이 함께 보인다', () => {
    render(<AssistThread turns={[eventTurn(true)]} />);

    expect(screen.getByText('학년 협의회')).toBeTruthy();
    expect(screen.getByText('구글에서 가져온 항목')).toBeTruthy();
    expect(screen.getByText('· AI에게는 보내지 않았어요')).toBeTruthy();
    expect(screen.getByText('치과 예약')).toBeTruthy();
    expect(screen.getByText('15:00 - 16:00')).toBeTruthy();
  });

  it('구글 항목이 없으면 칸도 없다', () => {
    render(<AssistThread turns={[eventTurn(false)]} />);

    expect(screen.queryByText('구글에서 가져온 항목')).toBeNull();
  });

  it('모델용 안내 칸(googleItemsNotIncluded)은 카드 숫자로 그려지지 않는다', () => {
    render(<AssistThread turns={[eventTurn(false)]} />);

    expect(screen.queryByText('googleItemsNotIncluded')).toBeNull();
  });
});
