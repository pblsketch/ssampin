/**
 * 그물 ③ 배선 — 함정 픽스처
 *
 * ★"통째로 버리지 않고 걸린 칸만 비운다"가 이 파일의 핵심 주장이다.
 * 카드를 버리면 숫자가 사라져 P5("모델이 죽어도 숫자는 남는다")가 깨진다.
 */
import { describe, expect, it } from 'vitest';

import { redactOutbound, rosterFrom } from '../redactOutbound';
import { findAssistTool } from '../../services/assistToolRegistry';
import { sanitizeToolResult } from '../../services/sanitizeToolResult';
import type { ToolResultShape } from '../../services/sanitizeToolResult';
import type { AssistToolDef } from '../../entities/AssistTool';

const ROSTER = rosterFrom(['김지훈', '박서연', '이도윤']);

function tool(id: string): AssistToolDef {
  const found = findAssistTool(id);
  if (!found) throw new Error(`도구 없음: ${id}`);
  return found;
}

function todos(titles: readonly string[]): ToolResultShape {
  // `total` 은 레지스트리 화이트리스트에 없어 재구성 단계에서 지워진다 — 일부러 넣어 확인한다.
  return {
    total: titles.length,
    items: titles.map((title) => ({ title, due: '2026-08-25', done: false })),
  };
}

describe('rosterFrom', () => {
  it('한 글자 이름과 빈 값은 뺀다 — 오탐이 너무 크다', () => {
    expect(rosterFrom(['김', '', '  ', '김지훈'])).toEqual([{ label: '이름', values: ['김지훈'] }]);
  });

  it('명단이 비면 그룹 자체를 만들지 않는다', () => {
    expect(rosterFrom([])).toEqual([]);
  });
});

describe('걸린 칸만 비운다', () => {
  it('학생 이름이 든 제목만 비우고 나머지는 살린다', () => {
    const t = tool('get_my_todos');
    const result = redactOutbound(
      t,
      sanitizeToolResult(t, todos(['김지훈 학부모 면담', '수행평가 채점'])),
      ROSTER,
    );

    const items = result.data.items as ToolResultShape[];
    expect(items[0]?.title).toBeNull();
    expect(items[1]?.title).toBe('수행평가 채점');
    expect(result.redactedCount).toBe(1);
    expect(result.blocked).toBe(false);
  });

  it('★나머지는 남는다 — 제목을 비워도 건수·마감·완료 여부는 그대로다 (P5)', () => {
    const t = tool('get_my_todos');
    const result = redactOutbound(t, sanitizeToolResult(t, todos(['박서연 상담'])), ROSTER);

    const items = result.data.items as ToolResultShape[];
    expect(items).toHaveLength(1);
    expect(items[0]?.done).toBe(false);
    expect(items[0]?.due).toBe('2026-08-25');
  });

  it('전화번호·주민번호가 든 제목도 비운다', () => {
    const t = tool('get_my_todos');
    const result = redactOutbound(
      t,
      sanitizeToolResult(t, todos(['010-1234-5678 로 연락', '990101-1234567 확인'])),
      ROSTER,
    );

    const items = result.data.items as ToolResultShape[];
    expect(items[0]?.title).toBeNull();
    expect(items[1]?.title).toBeNull();
    expect(result.redactedCount).toBe(2);
  });

  it('★생년월일·주소는 자유 입력에서만 잡는다 — due 의 날짜는 살아남는다', () => {
    const t = tool('get_my_todos');
    const result = redactOutbound(t, sanitizeToolResult(t, todos(['교무회의 자료'])), ROSTER);

    // `due: '2026-08-25'` 는 구조화 필드라 생년월일 패턴을 적용하지 않는다.
    // 이걸 켜면 정상 도구가 100% 막힌다 — Phase 1 에서 실제로 겪은 결함이다.
    expect(result.redactedCount).toBe(0);
    expect(result.blocked).toBe(false);
  });
});

describe('자유 입력이 없는 도구는 그대로 통과한다', () => {
  it.each(['count_students', 'list_classes', 'get_attendance_summary', 'get_records_stats'])(
    '%s — 지울 것도 막을 것도 없다',
    (id) => {
      const t = tool(id);
      const raw: Record<string, ToolResultShape> = {
        count_students: { className: '3학년 2반', count: 30 },
        list_classes: { classes: [{ id: 'c1', name: '3학년 2반' }] },
        get_attendance_summary: {
          date: '2026-08-21',
          className: '3학년 2반',
          present: 28,
          absent: 1,
          late: 1,
          early: 0,
          classAbsence: 0,
        },
        get_records_stats: { period: '2026-08', total: 12 },
      };
      const result = redactOutbound(t, sanitizeToolResult(t, raw[id] ?? {}), ROSTER);

      expect(result.redactedCount).toBe(0);
      expect(result.blocked).toBe(false);
    },
  );
});

describe('명단이 없으면 이름은 못 잡는다 (한계를 명시해 둔다)', () => {
  it('빈 명단이면 이름은 통과한다 — 패턴이 아니라 대조로 잡기 때문이다', () => {
    const t = tool('get_my_todos');
    const result = redactOutbound(t, sanitizeToolResult(t, todos(['김지훈 상담'])), []);

    expect(result.redactedCount).toBe(0);
    // 그래도 연락처·주민번호는 패턴이라 명단 없이도 잡힌다.
    const withPhone = redactOutbound(t, sanitizeToolResult(t, todos(['010-1234-5678'])), []);
    expect(withPhone.redactedCount).toBe(1);
  });
});
