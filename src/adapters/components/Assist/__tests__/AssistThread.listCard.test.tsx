/**
 * @vitest-environment jsdom
 *
 * 쌤핀 AI — 목록형 숫자 카드
 *
 * 배경(2026-08-23 오너 신고): "오늘 할 일 있나"의 카드가 **텅 비어** 있었다.
 * 카드가 숫자·글자만 그렸기 때문에, 목록(`items`)으로 오는 할 일 결과는 그릴 게
 * 없었던 것이다. AI 는 "8개"라고 말하는데 카드는 백지 — "앱이 조회한 사실이 먼저"
 * 라는 이 기능의 약속이 목록형에서만 깨져 있었다.
 *
 * 여기서는 실제 경로 그대로(레지스트리 → 재구성) 만든 카드가
 * 제목·마감·기한 지남 표시까지 화면에 남는지 본다.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { AssistThread } from '../AssistThread';
import type { AssistTurn } from '@adapters/stores/useAssistStore';
import { findAssistTool } from '@domain/services/assistToolRegistry';
import { sanitizeToolResult } from '@domain/services/sanitizeToolResult';
import type { ToolResultShape } from '@domain/services/sanitizeToolResult';
import {
  summarizeBookmarks,
  summarizeHomeroomAttendance,
  summarizeTodos,
} from '@usecases/assist/summaries';

afterEach(cleanup);

function todoTurn(): AssistTurn {
  const tool = findAssistTool('get_my_todos');
  if (!tool) throw new Error('도구 없음');
  const summary = summarizeTodos(
    [
      { text: '밀린 결재 처리', dueDate: '2026-08-19', completed: false },
      { text: '수행평가 채점', dueDate: '2026-08-23', completed: false },
    ],
    { today: '2026-08-23' },
  );
  return {
    id: 't1',
    question: '오늘 할 일 있나',
    cards: [
      {
        tool: tool.id,
        // readonly 요약을 재구성 입력(가변 인덱스 시그니처)에 맞춘다 — 실제 경로
        // (AssistDockContainer)와 같은 형태의 통과 지점이다.
        data: sanitizeToolResult(tool, JSON.parse(JSON.stringify(summary)) as ToolResultShape),
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

describe('AssistThread — 할 일 카드', () => {
  it('★목록 항목이 화면에 남는다 — 카드가 백지면 AI 말을 검증할 수 없다', () => {
    render(<AssistThread turns={[todoTurn()]} />);

    expect(screen.getByText('밀린 결재 처리')).toBeTruthy();
    expect(screen.getByText('수행평가 채점')).toBeTruthy();
    // 미완료 건수 — AI 가 말하는 "N개"를 카드로 대조할 수 있다
    expect(screen.getByText('미완료')).toBeTruthy();
    expect(screen.getByText('2개')).toBeTruthy();
  });

  it('기한이 지난 항목에는 "지남" 표시가 붙는다 (색 단독 금지 — 글자로 전한다)', () => {
    render(<AssistThread turns={[todoTurn()]} />);

    // 8/19 만 지났고 8/23(오늘)은 아직이다
    expect(screen.getAllByText('⚠ 지남')).toHaveLength(1);
  });
});

/**
 * ★도구를 늘릴 때마다 조용히 깨지던 자리.
 *
 * 카드가 `title` 필드 하나만 그리던 시절에는 할 일 말고는 **전부 백지**였다.
 * 급식은 `dishes`, 시간표는 `subject`, 즐겨찾기는 `name` 에 본문이 들어 있는데
 * 그 사실을 카드가 몰랐기 때문이다. 여기서 대표로 즐겨찾기를 잠근다.
 */
describe('AssistThread — 새 도구 카드도 백지가 아니다', () => {
  it('즐겨찾기 — 이름과 도메인이 화면에 남는다', () => {
    const tool = findAssistTool('get_bookmarks');
    if (!tool) throw new Error('도구 없음');
    const summary = summarizeBookmarks(
      [{ name: '나이스', url: 'https://neis.go.kr/detail?sid=1', groupId: 'g1' }],
      [{ id: 'g1', name: '업무' }],
    );

    render(
      <AssistThread
        turns={[
          {
            id: 't2',
            question: '즐겨찾기 뭐 있어',
            cards: [
              {
                tool: tool.id,
                data: sanitizeToolResult(
                  tool,
                  JSON.parse(JSON.stringify(summary)) as ToolResultShape,
                ),
              },
            ],
            answer: '',
            outboundAnswer: '',
            outboundCards: [],
            degraded: null,
            status: 'done',
            maskedCount: 0,
            blankedCount: 0,
          },
        ]}
      />,
    );

    expect(screen.getByText('나이스')).toBeTruthy();
    expect(screen.getByText('neis.go.kr')).toBeTruthy();
    // 주소 전체는 애초에 카드까지 오지 않는다(오너 결정 ② — 도메인만).
    expect(screen.queryByText(/sid=/)).toBeNull();
  });
});

/**
 * ★집계 도구에는 **글자 본문이 아예 없다.**
 *
 * 출결 기간 집계의 한 줄은 `{ date, absent, late, ... }` 뿐이라, 카드가 글자만 그리면
 * "• 08-03" 만 남고 **정작 몇 명이 결석했는지가 사라진다.** AI 는 "3명 결석"이라고
 * 말하는데 카드에는 그 숫자가 없으면, 선생님은 AI 말을 검증할 방법이 없다.
 */
describe('AssistThread — 집계 카드는 숫자를 본문으로 쓴다', () => {
  it('출결 기간 — 날짜와 함께 결석·지각 인원이 화면에 남는다', () => {
    const tool = findAssistTool('get_homeroom_attendance_stats');
    if (!tool) throw new Error('도구 없음');
    const summary = summarizeHomeroomAttendance(
      [
        { studentId: 's1', category: 'attendance', subcategory: '결석 (질병)', date: '2026-08-03' },
        { studentId: 's2', category: 'attendance', subcategory: '지각 (인정)', date: '2026-08-03' },
      ],
      { className: '우리 반', from: '2026-08-01', to: '2026-08-31', rosterSize: 30 },
    );

    render(
      <AssistThread
        turns={[
          {
            id: 't3',
            question: '이번 달 결석 몇 번이야',
            cards: [
              {
                tool: tool.id,
                data: sanitizeToolResult(
                  tool,
                  JSON.parse(JSON.stringify(summary)) as ToolResultShape,
                ),
              },
            ],
            answer: '',
            outboundAnswer: '',
            outboundCards: [],
            degraded: null,
            status: 'done',
            maskedCount: 0,
            blankedCount: 0,
          },
        ]}
      />,
    );

    expect(screen.getByText('결석 1 · 지각 1')).toBeTruthy();
    expect(screen.getByText('08-03')).toBeTruthy();
  });
});
