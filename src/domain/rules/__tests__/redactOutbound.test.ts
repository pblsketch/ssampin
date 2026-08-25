/**
 * 그물 ③ 배선 — 함정 픽스처
 *
 * ★핵심 주장: **지우지 않고 가린다.**
 * `"김지훈 학부모 면담"` → `"［이름1］ 학부모 면담"`. 통째로 비우면 AI 가 아무 말도 못 하고,
 * 오탐의 대가가 커서 학번 같은 애매한 항목은 검사에 넣지도 못한다(실제로 `"15번 상담"` 이 샜다).
 *
 * ★단 연락처·주민번호·이메일은 예외 — 그 칸을 **통째로 비운다.**
 * 한 칸에 여러 개가 있을 때 못 잡은 값이 같이 남을 수 있는데, 이 셋은 하나만 새도 피해가 크다.
 */
import { describe, expect, it } from 'vitest';

import { redactOutbound, redactQuestion, rosterFrom, rosterFromAll } from '../redactOutbound';
import { restore } from '../../privacy/maskEngine';
import { findAssistTool } from '../../services/assistToolRegistry';
import { sanitizeToolResult } from '../../services/sanitizeToolResult';
import type { ToolResultShape, ToolResultValue } from '../../services/sanitizeToolResult';
import type { AssistToolDef } from '../../entities/AssistTool';

const ROSTER = rosterFrom([
  { name: '김지훈', studentNumber: 15 },
  { name: '박서연', studentNumber: 3 },
  { name: '이도윤' },
]);

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

/** 제목만 뽑는다. 매번 캐스팅을 되풀이하지 않으려고 둔다. */
function titlesOf(data: ToolResultShape): (ToolResultValue | undefined)[] {
  return (data.items as ToolResultShape[]).map((item) => item.title);
}

describe('rosterFrom', () => {
  it('한 글자 이름과 빈 값은 뺀다 — 오탐이 너무 크다', () => {
    expect(rosterFrom([{ name: '김' }, { name: '' }, { name: '  ' }, { name: '김지훈' }])).toEqual([
      { label: '이름', values: ['김지훈'] },
    ]);
  });

  it('명단이 비면 그룹 자체를 만들지 않는다', () => {
    expect(rosterFrom([])).toEqual([]);
  });

  it('★학번은 "15번" 형태로 넣는다 — 숫자만 넣으면 인원수·건수까지 잡힌다', () => {
    expect(rosterFrom([{ name: '김지훈', studentNumber: 15 }])).toContainEqual({
      label: '학번',
      values: ['15번'],
    });
  });

  it('학번이 없는 학생은 건너뛴다', () => {
    expect(rosterFrom([{ name: '김지훈' }]).map((g) => g.label)).toEqual(['이름']);
  });
});

describe('지우지 않고 가린다', () => {
  it('★이름이 별칭으로 바뀌고 나머지 문장은 살아남는다', () => {
    const t = tool('get_my_todos');
    const result = redactOutbound(
      t,
      sanitizeToolResult(t, todos(['김지훈 학부모 면담', '수행평가 채점'])),
      ROSTER,
    );

    // 예전에는 제목이 통째로 null 이 됐다 — AI 가 "면담이 있다"는 말조차 못 했다.
    expect(titlesOf(result.data)).toEqual(['［이름1］ 학부모 면담', '수행평가 채점']);
    expect(result.maskedCount).toBe(1);
    expect(result.blankedCount).toBe(0);
    expect(result.blocked).toBe(false);
  });

  it('★학번만 적어도 가려진다 — 가리기로 바꾼 이유가 이것이다', () => {
    const t = tool('get_my_todos');
    const result = redactOutbound(t, sanitizeToolResult(t, todos(['15번 상담'])), ROSTER);

    expect(titlesOf(result.data)).toEqual(['［학번1］ 상담']);
  });

  it('같은 이름이 두 번 나오면 같은 별칭을 쓴다 — AI 가 동일인임을 안다', () => {
    const t = tool('get_my_todos');
    const result = redactOutbound(
      t,
      sanitizeToolResult(t, todos(['김지훈 상담', '김지훈 학부모 연락'])),
      ROSTER,
    );

    expect(titlesOf(result.data)).toEqual(['［이름1］ 상담', '［이름1］ 학부모 연락']);
  });

  it('서로 다른 학생은 다른 별칭을 받는다', () => {
    const t = tool('get_my_todos');
    const result = redactOutbound(t, sanitizeToolResult(t, todos(['김지훈 이도윤 상담'])), ROSTER);

    const title = String(titlesOf(result.data)[0]);
    expect(title).toContain('［이름1］');
    expect(title).toContain('［이름2］');
  });

  it('★되돌리면 원문 그대로다 — 선생님 화면에는 실제 이름이 보인다', () => {
    const t = tool('get_my_todos');
    const result = redactOutbound(t, sanitizeToolResult(t, todos(['김지훈 학부모 면담'])), ROSTER);

    expect(restore(String(titlesOf(result.data)[0]), result.mappings)).toBe('김지훈 학부모 면담');
  });

  it('★나머지는 남는다 — 마감·완료 여부는 그대로다 (P5)', () => {
    const t = tool('get_my_todos');
    const result = redactOutbound(t, sanitizeToolResult(t, todos(['박서연 상담'])), ROSTER);

    const items = result.data.items as ToolResultShape[];
    expect(items).toHaveLength(1);
    expect(items[0]?.done).toBe(false);
    expect(items[0]?.due).toBe('2026-08-25');
  });
});

describe('연락처·주민번호·이메일은 가리지 않고 칸을 통째로 비운다', () => {
  it.each([
    ['전화번호', '010-1234-5678 로 연락'],
    ['주민번호', '990101-1234567 확인'],
    ['이메일', 'parent@example.com 회신'],
  ])('%s 가 있으면 제목이 사라진다', (_label, title) => {
    const t = tool('get_my_todos');
    const result = redactOutbound(t, sanitizeToolResult(t, todos([title])), ROSTER);

    expect(titlesOf(result.data)).toEqual([null]);
    expect(result.blankedCount).toBe(1);
  });

  it('★한 칸에 이름과 전화번호가 같이 있으면 통째로 비운다', () => {
    // 가리기만 하면 못 잡은 값이 같이 남을 수 있다 — 그래서 이 셋은 비우는 쪽을 택했다.
    const t = tool('get_my_todos');
    const result = redactOutbound(
      t,
      sanitizeToolResult(t, todos(['김지훈 (010-1234-5678) 면담'])),
      ROSTER,
    );

    expect(titlesOf(result.data)).toEqual([null]);
    expect(result.maskedCount).toBe(0);
    expect(result.blankedCount).toBe(1);
  });
});

describe('정상 제목은 건드리지 않는다 — 그물이 과하면 기능이 죽는다', () => {
  it('이름·학번이 없으면 그대로 나간다', () => {
    const t = tool('get_my_todos');
    const result = redactOutbound(
      t,
      sanitizeToolResult(t, todos(['교무회의 자료 준비', '성적 입력'])),
      ROSTER,
    );

    expect(titlesOf(result.data)).toEqual(['교무회의 자료 준비', '성적 입력']);
    expect(result.maskedCount).toBe(0);
    expect(result.blankedCount).toBe(0);
  });

  it('★due 의 날짜는 살아남는다 — 구조화 필드엔 생년월일 패턴을 안 쓴다', () => {
    const t = tool('get_my_todos');
    const result = redactOutbound(t, sanitizeToolResult(t, todos(['교무회의 자료'])), ROSTER);

    // 이걸 켜면 정상 도구가 100% 막힌다 — Phase 1 에서 실제로 겪은 결함이다.
    expect((result.data.items as ToolResultShape[])[0]?.due).toBe('2026-08-25');
    expect(result.blocked).toBe(false);
  });
});

describe('자유 입력이 없는 도구는 그대로 통과한다', () => {
  it.each(['count_students', 'list_classes', 'get_attendance_summary', 'get_records_stats'])(
    '%s — 가릴 것도 뺄 것도 없다',
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

      expect(result.maskedCount).toBe(0);
      expect(result.blankedCount).toBe(0);
      expect(result.blocked).toBe(false);
    },
  );
});

describe('명단이 없으면 이름은 못 잡는다 (한계를 명시해 둔다)', () => {
  it('빈 명단이면 이름은 통과한다 — 패턴이 아니라 대조로 잡기 때문이다', () => {
    const t = tool('get_my_todos');
    const result = redactOutbound(t, sanitizeToolResult(t, todos(['김지훈 상담'])), []);

    expect(result.maskedCount).toBe(0);
  });

  it('그래도 연락처는 패턴이라 명단 없이도 칸을 비운다', () => {
    const t = tool('get_my_todos');
    const result = redactOutbound(t, sanitizeToolResult(t, todos(['010-1234-5678'])), []);

    expect(result.blankedCount).toBe(1);
  });
});

/**
 * ★2026-08-25 — 담임 학급만 명단으로 쓰다가 실제로 새고 있던 구멍.
 *
 * `students.json` 은 담임 학급 한 반뿐이라, 교과 수업으로 들어가는 반의 학생 이름은
 * 대조할 것이 없어 **한 글자도 안 가려진 채** 나갔다. 관찰·채점은 교과 수업반에서도
 * 쓰는 기능이므로, 쓰기를 여는 이번 변경에서 이 구멍이 정확히 그 자리에서 벌어진다.
 */
describe('교과 수업반 학생도 가려진다 (rosterFromAll)', () => {
  const HOMEROOM = [{ name: '김지훈', studentNumber: 15 }];
  const TEACHING = [
    { students: [{ name: '최민호', number: 7 }] },
    { students: [{ name: '정수아', number: 12 }] },
  ];

  it('담임 명단에만 있으면 수업반 학생은 그대로 샌다 (고치기 전 동작)', () => {
    const { masked } = redactQuestion('옆반 최민호 학생도 결석이야', rosterFrom(HOMEROOM));

    expect(masked).toContain('최민호');
  });

  it('수업반까지 합치면 가려진다', () => {
    const { masked } = redactQuestion(
      '옆반 최민호 학생도 결석이야',
      rosterFromAll(HOMEROOM, TEACHING),
    );

    expect(masked).not.toContain('최민호');
    expect(masked).toMatch(/［이름\d+］/);
  });

  it('담임 학생도 계속 가려진다 (기존 동작 유지)', () => {
    const { masked } = redactQuestion('김지훈 학생 결석', rosterFromAll(HOMEROOM, TEACHING));

    expect(masked).not.toContain('김지훈');
  });

  it('여러 수업반의 학생이 모두 들어간다', () => {
    const { masked } = redactQuestion(
      '최민호랑 정수아 결석 처리해줘',
      rosterFromAll(HOMEROOM, TEACHING),
    );

    expect(masked).not.toContain('최민호');
    expect(masked).not.toContain('정수아');
  });

  it('같은 학생이 두 명단에 있어도 별칭은 하나다 — 중복이 번호를 늘리지 않는다', () => {
    const both = rosterFromAll(HOMEROOM, [{ students: [{ name: '김지훈', number: 15 }] }]);
    const { masked, mappings } = redactQuestion('김지훈 학생 결석', both);

    expect(masked).not.toContain('김지훈');
    // 한 사람이므로 되돌릴 매핑도 하나여야 한다.
    expect(mappings).toHaveLength(1);
  });

  it('동명이인이 있어도 죽지 않고 둘 다 가려진다', () => {
    const dup = rosterFromAll(
      [{ name: '김지훈', studentNumber: 15 }],
      [{ students: [{ name: '김지훈', number: 3 }] }],
    );
    const { masked } = redactQuestion('김지훈 학생 둘 다 결석', dup);

    expect(masked).not.toContain('김지훈');
  });

  it('수업반이 하나도 없어도 담임 명단만으로 동작한다', () => {
    const { masked } = redactQuestion('김지훈 학생 결석', rosterFromAll(HOMEROOM, []));

    expect(masked).not.toContain('김지훈');
  });
});
