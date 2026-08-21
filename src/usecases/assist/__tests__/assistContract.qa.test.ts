/**
 * 앱 ↔ 서버 **계약** 이음매 검사 (UltraQA Cycle 2)
 *
 * ★이 파일이 지키는 것: "앱은 통과시키는데 서버가 400을 낸다"를 막는다.
 * 그러면 선생님은 **이유를 알 수 없는 실패**만 본다. 반대(서버는 통과인데 앱이 막음)도 같다.
 *
 * 집계 5종의 **진짜 출력 모양**으로 재구성 → 앱 관문 → 서버 검증까지 한 줄로 돌린다.
 * 하나라도 막히면 결함이다.
 */
import { describe, expect, it } from 'vitest';

import { ASSIST_TOOLS, findAssistTool } from '@domain/services/assistToolRegistry';
import { sanitizeToolResult } from '@domain/services/sanitizeToolResult';
import type { ToolResultShape } from '@domain/services/sanitizeToolResult';
import { redactOutbound, rosterFrom } from '@domain/rules/redactOutbound';
import {
  countStudents,
  summarizeAttendance,
  summarizeRecords,
  summarizeTodos,
  toClassSummaries,
} from '@usecases/assist/summaries';
import {
  LIMITS,
  validateAssistRequest,
} from '../../../../supabase/functions/_shared/assistRequest';
import { ASSIST_MAX_QUESTION_CHARS } from '@domain/rules/screenAssistInput';

const ROSTER = rosterFrom([{ name: '김지훈', studentNumber: 15 }, { name: '박서연' }]);
const INSTALL_ID = '3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607';

/** 서버가 실제로 받는 모양 그대로 조립한다. */
function asRequest(cards: readonly { tool: string; data: ToolResultShape }[]): unknown {
  return {
    installId: INSTALL_ID,
    turns: [{ role: 'user', content: '오늘 우리 반 어때요?' }],
    toolResults: cards.map((c) => ({ tool: c.tool, grade: 1, data: c.data })),
  };
}

/** 집계 → 재구성 → 앱 관문 → 서버 검증. 어디서 막히든 실패로 드러난다. */
function roundTrip(toolId: string, raw: ToolResultShape): { ok: boolean; reason?: string } {
  const tool = findAssistTool(toolId);
  if (!tool) return { ok: false, reason: '레지스트리에 없음' };

  const safe = sanitizeToolResult(tool, raw);
  const redacted = redactOutbound(tool, safe, ROSTER);
  if (redacted.blocked) return { ok: false, reason: '앱 관문이 막음' };

  const result = validateAssistRequest(asRequest([{ tool: toolId, data: redacted.data }]));
  return 'ok' in result ? { ok: true } : { ok: false, reason: `서버가 막음: ${result.error}` };
}

describe('★집계 5종의 진짜 출력이 서버까지 간다', () => {
  it('get_attendance_summary', () => {
    const raw = summarizeAttendance(
      [
        {
          classId: 'c1',
          date: '2026-08-21',
          students: [{ status: 'present' }, { status: 'absent' }, { status: 'late' }],
        },
      ],
      { classId: 'c1', className: '3학년 2반', date: '2026-08-21' },
    ) as unknown as ToolResultShape;
    expect(roundTrip('get_attendance_summary', raw)).toEqual({ ok: true });
  });

  it('count_students', () => {
    const raw = countStudents(
      [
        { id: 's1', name: '김지훈', className: '3학년 2반' },
        { id: 's2', name: '박서연', className: '3학년 2반' },
      ],
      '3학년 2반',
    ) as unknown as ToolResultShape;
    expect(roundTrip('count_students', raw)).toEqual({ ok: true });
  });

  it('list_classes — ★UUID 가 전화번호로 오인되지 않는다 (Phase 2 재발 지점)', () => {
    const raw = toClassSummaries([
      { id: '0d1c2b3a-4e5f-4061-8273-849506a7b8c9', name: '3학년 2반' },
      { id: 'aa11bb22-cc33-4d44-8e55-ff6677889900', name: '2학년 5반' },
    ]) as unknown as ToolResultShape;
    expect(roundTrip('list_classes', raw)).toEqual({ ok: true });
  });

  it('get_records_stats', () => {
    const raw = summarizeRecords(
      [
        { category: '관찰', date: '2026-08-01', classId: 'c1' },
        { category: '상담', date: '2026-08-15', classId: 'c1' },
      ],
      {
        classId: 'c1',
        className: '3학년 2반',
        periodFrom: '2026-08-01',
        periodTo: '2026-08-31',
        periodLabel: '2026-08',
      },
    ) as unknown as ToolResultShape;
    expect(roundTrip('get_records_stats', raw)).toEqual({ ok: true });
  });

  it('get_my_todos — ★자유 입력이 든 채로도 서버를 통과한다', () => {
    const raw = summarizeTodos([
      { text: '김지훈 학부모 면담', dueDate: '2026-08-25', completed: false },
      { text: '수행평가 채점', dueDate: '2026-08-22', completed: true },
    ]) as unknown as ToolResultShape;
    expect(roundTrip('get_my_todos', raw)).toEqual({ ok: true });
  });
});

describe('★경계값 — 비어 있어도 죽지 않는다', () => {
  it('학생 0명 · 학급 0개 · 할 일 0건', () => {
    expect(
      roundTrip('count_students', countStudents([], '3학년 2반') as unknown as ToolResultShape),
    ).toEqual({ ok: true });
    expect(roundTrip('list_classes', toClassSummaries([]) as unknown as ToolResultShape)).toEqual({
      ok: true,
    });
    expect(roundTrip('get_my_todos', summarizeTodos([]) as unknown as ToolResultShape)).toEqual({
      ok: true,
    });
  });

  it('출결 기록이 하나도 없는 날', () => {
    const raw = summarizeAttendance([], {
      classId: 'c1',
      className: '3학년 2반',
      date: '2026-08-21',
    }) as unknown as ToolResultShape;
    expect(roundTrip('get_attendance_summary', raw)).toEqual({ ok: true });
  });

  it('같은 도구를 두 번 담아도 서버가 받는다', () => {
    const tool = findAssistTool('count_students');
    if (!tool) throw new Error('도구 없음');
    const card = {
      tool: tool.id,
      data: sanitizeToolResult(tool, { className: '3학년 2반', count: 30 }) as ToolResultShape,
    };
    expect(validateAssistRequest(asRequest([card, card]))).toHaveProperty('ok');
  });
});

describe('★질문 쪽 경계값', () => {
  function askWith(content: string): boolean {
    return (
      'ok' in
      validateAssistRequest({
        installId: INSTALL_ID,
        turns: [{ role: 'user', content }],
        toolResults: [],
      })
    );
  }

  it('이모지·줄바꿈이 섞여도 통과한다', () => {
    expect(askWith('오늘 출결 어때요? 🙂\n\n특히 3학년 2반이요')).toBe(true);
  });

  it('빈 질문은 서버가 막는다', () => {
    expect(askWith('')).toBe(false);
  });

  it('상한을 넘는 긴 질문은 서버가 막는다 — 앱도 같은 상한을 알아야 한다', () => {
    expect(askWith('가'.repeat(100_000))).toBe(false);
  });
});

describe('★2·3등급은 애초에 존재하지 않는다 (ADR-061 결정 7 — 영구 경계)', () => {
  it('레지스트리 전체가 1등급이다', () => {
    expect(ASSIST_TOOLS.every((t) => t.grade === 1)).toBe(true);
  });

  it('서버는 1등급이 아닌 결과를 거부한다', () => {
    const rejected = validateAssistRequest({
      installId: INSTALL_ID,
      turns: [{ role: 'user', content: '질문' }],
      toolResults: [{ tool: 'count_students', grade: 2, data: { className: 'A', count: 1 } }],
    });
    expect(rejected).not.toHaveProperty('ok');
  });
});

describe('★앱과 서버의 상한이 어긋나지 않는다', () => {
  it('입력창 상한 = 서버 한 턴 상한', () => {
    // 어긋나면 선생님은 **보내고 나서야** 거절당한다. 왕복 한 번을 그냥 버리는 셈이다.
    expect(ASSIST_MAX_QUESTION_CHARS).toBe(LIMITS.maxTurnChars);
  });

  it('상한 딱 맞는 질문은 서버가 받는다', () => {
    const result = validateAssistRequest({
      installId: INSTALL_ID,
      turns: [{ role: 'user', content: '가'.repeat(ASSIST_MAX_QUESTION_CHARS) }],
      toolResults: [],
    });
    expect(result).toHaveProperty('ok');
  });

  it('앱이 한 번에 담는 카드 수가 서버 상한을 넘지 않는다', () => {
    // 컨테이너의 의도 판정은 최대 3종을 담는다(`AssistDockContainer.tsx`).
    expect(3).toBeLessThanOrEqual(LIMITS.maxToolResults);
  });
});
