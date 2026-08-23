/**
 * 쌤핀 AI — **세 층을 이어 붙인** 함정 픽스처 테스트 (계획서 §4.4 그물 ④ · Phase 1 인수 조건)
 *
 * ★이 파일이 존재하는 이유:
 * 집계 함수 · 재구성 · 전송 직전 관문이 **각자 초록불인데 이어 붙이면 빨간불**이던 사고가 있었다.
 * 관문이 생년월일 패턴을 켜 두는 바람에 `date: '2026-08-21'` 같은 **정상 출력이 100% 차단**됐는데,
 * 층별 테스트만 있어서 아무도 못 잡았다. 검토에서 실측으로 드러났다.
 *
 * 그래서 여기서는 **실제 파이프라인 순서 그대로** 돌린다:
 *   집계 함수 → sanitizeToolResult(그물 ②) → checkOutboundValue(그물 ③)
 *
 * 두 가지를 동시에 증명한다.
 *   ① 정상 데이터는 **끝까지 통과한다** (오탐이 기능을 죽이지 않는다)
 *   ② 함정(실명·전화번호)을 심으면 **반드시 걸린다** (미탐이 없다)
 */
import { describe, expect, it } from 'vitest';

import type { AssistToolDef } from '@domain/entities/AssistTool';
import { checkOutboundValue } from '@domain/rules/assertNoPii';
import { ASSIST_TOOLS, findAssistTool } from '@domain/services/assistToolRegistry';
import { findDisallowedFields, sanitizeToolResult } from '@domain/services/sanitizeToolResult';
import type { ToolResultShape } from '@domain/services/sanitizeToolResult';
import {
  countStudents,
  summarizeAttendance,
  summarizeTodos,
  toClassSummaries,
} from '@usecases/assist/summaries';

import type { KeywordGroup } from '@domain/privacy/types';

/** 함정 명단 — 이 이름들이 결과에 남으면 걸려야 한다. */
const FIXTURE_ROSTER: readonly KeywordGroup[] = [{ label: '이름', values: ['김지훈', '박서연'] }];

const tool = (id: string): AssistToolDef => {
  const found = findAssistTool(id);
  if (!found) throw new Error(`도구 없음: ${id}`);
  return found;
};

/** 파이프라인 한 번 — 집계 결과를 재구성하고 관문에 통과시킨다. */
function runPipeline(id: string, raw: ToolResultShape) {
  const def = tool(id);
  const safe = sanitizeToolResult(def, raw);
  const gate = checkOutboundValue(safe, FIXTURE_ROSTER, def);
  return { def, safe, gate };
}

describe('쌤핀 AI 파이프라인 — 정상 데이터는 끝까지 통과한다', () => {
  it('출결 요약 (날짜 포함)', () => {
    const raw = summarizeAttendance(
      [
        {
          classId: 'c1',
          date: '2026-08-21',
          students: [
            { status: 'present' },
            { status: 'present' },
            { status: 'absent' },
            { status: 'late' },
          ],
        },
      ],
      { classId: 'c1', date: '2026-08-21', className: '3학년 2반' },
    ) as unknown as ToolResultShape;

    const { safe, gate } = runPipeline('get_attendance_summary', raw);

    expect(gate.blocked).toBe(false);
    expect(safe.date).toBe('2026-08-21');
    expect(safe.present).toBe(2);
  });

  it('할 일 (마감일 포함)', () => {
    const raw = summarizeTodos([
      { text: '수행평가 채점', dueDate: '2026-08-25', completed: false },
    ]) as unknown as ToolResultShape;

    const { gate } = runPipeline('get_my_todos', raw);
    expect(gate.blocked).toBe(false);
  });

  it('기록 통계 (기간 문자열 포함)', () => {
    const raw = {
      className: '3학년 2반',
      period: '2026-08-01 ~ 2026-08-21',
      total: 34,
      byCategory: [{ category: '학습', count: 12 }],
    };

    const { gate } = runPipeline('get_records_stats', raw);
    expect(gate.blocked).toBe(false);
  });

  it('학급 목록 · 인원 수', () => {
    const classes = toClassSummaries([
      { id: 'c1', name: '3학년 2반', grade: 3, classNum: 2 },
    ]) as unknown as ToolResultShape;
    expect(runPipeline('list_classes', classes).gate.blocked).toBe(false);

    const count = countStudents(
      [{ id: 's1' }, { id: 's2' }],
      '3학년 2반',
    ) as unknown as ToolResultShape;
    expect(runPipeline('count_students', count).gate.blocked).toBe(false);
  });

  it('★모든 도구가 "실제 데이터 모양" 대표 픽스처에서 통과한다', () => {
    // 빈 객체(`{}`)로 돌리면 원리적으로 실패할 수 없어 아무것도 증명하지 못한다.
    // 실제 모양이어야 오탐을 잡는다 - 학급 id 가 UUID 라는 사실이 여기서 드러났다.
    const REAL: Readonly<Record<string, ToolResultShape>> = {
      get_attendance_summary: {
        date: '2026-08-21',
        className: '3학년 2반',
        present: 27,
        absent: 1,
        late: 2,
        early: 0,
        classAbsence: 0,
      },
      count_students: { className: '3학년 2반', count: 30 },
      list_classes: {
        // ★실제 학급 id 는 UUID 다. 그중 0.24% 가 전화번호 정규식에 걸린다.
        classes: [
          { id: 'a4755b0f-69b8-4b05-9129-3171a4a53e17', name: '3학년 2반', grade: 3, classNum: 2 },
          { id: '4ab33394-53d7-4b46-b055-98416693eab5', name: '1학년 4반', grade: 1, classNum: 4 },
        ],
      },
      get_records_stats: {
        className: '3학년 2반',
        period: '2026-08-01 ~ 2026-08-21',
        total: 34,
        byCategory: [
          { category: '학습', count: 12 },
          { category: '생활', count: 22 },
        ],
      },
      get_my_todos: {
        items: [{ title: '수행평가 채점', due: '2026-08-25', done: false }],
      },
      // ── 브릿지 동등화 Phase 1 (2026-08-23) ──
      get_meals: {
        period: '2026-08-24 ~ 2026-08-28',
        items: [
          {
            date: '2026-08-24',
            mealType: '중식',
            dishes: '차조밥, 콩나물국, 배추김치',
            calorie: '690.9 Kcal',
          },
        ],
      },
      get_ddays: {
        items: [{ title: '수능', date: '2026-11-19', daysLeft: 88, pinned: true }],
      },
      get_events: {
        period: '2026-08-24 ~ 2026-08-30',
        truncated: false,
        items: [{ date: '2026-08-25', title: '학부모 총회', time: '14:00', location: '시청각실' }],
      },
    };

    for (const def of ASSIST_TOOLS) {
      const raw = REAL[def.id];
      expect(raw, `${def.id} 대표 픽스처가 없다 - 도구를 추가하면 여기도 추가할 것`).toBeDefined();
      const gate = checkOutboundValue(sanitizeToolResult(def, raw ?? {}), FIXTURE_ROSTER, def);
      expect(
        gate.blocked,
        `${def.id} 가 정상 데이터에서 막혔다: ${JSON.stringify(gate.hits.map((h) => [h.kind, h.path]))}`,
      ).toBe(false);
    }
  });
});

describe('쌤핀 AI 파이프라인 — 함정을 심으면 반드시 걸린다', () => {
  it('할 일 제목에 실명', () => {
    const { gate } = runPipeline('get_my_todos', {
      items: [{ title: '김지훈 학부모 면담', due: '2026-08-26', done: false }],
    });

    expect(gate.blocked).toBe(true);
    expect(gate.hits.some((h) => h.kind === 'keyword')).toBe(true);
  });

  it('할 일 제목에 전화번호', () => {
    const { gate } = runPipeline('get_my_todos', {
      items: [{ title: '010-9999-8888 로 연락', due: null, done: false }],
    });

    expect(gate.blocked).toBe(true);
    expect(gate.hits.some((h) => h.kind === 'phone')).toBe(true);
  });

  it('★자유 입력 필드에 숨긴 생년월일은 잡는다 (구조화된 날짜와 구분)', () => {
    const hidden = runPipeline('get_my_todos', {
      items: [{ title: '김민수 2010-05-03 생일 챙기기', due: '2026-08-26', done: false }],
    });
    expect(hidden.gate.blocked).toBe(true);
    expect(hidden.gate.hits.some((h) => h.kind === 'birth')).toBe(true);

    // 같은 도구에서 due(구조화된 날짜)만 있는 경우는 통과해야 한다.
    const normal = runPipeline('get_my_todos', {
      items: [{ title: '수행평가 채점', due: '2026-08-26', done: false }],
    });
    expect(normal.gate.blocked).toBe(false);
  });

  it('★모든 등록 도구에 이름을 심어도 결과에 이름이 0건이다', () => {
    // 계획서 Phase 1 인수 조건: "모든 1등급 도구를 함정 픽스처로 실행해 결과에 이름이 0건".
    // 두 가지 방식 중 하나로 반드시 막혀야 한다:
    //   (a) 구조적으로 사라진다 - 화이트리스트에 그 필드가 없어서 재구성에서 빠진다
    //   (b) 관문이 잡는다 - 자유 입력이라 살아남지만 blocked 된다
    const PLANTED = '김지훈';
    const TRAPS: Readonly<Record<string, ToolResultShape>> = {
      get_attendance_summary: {
        date: '2026-08-21',
        className: '3학년 2반',
        present: 27,
        absent: 1,
        late: 0,
        early: 0,
        classAbsence: 0,
        studentName: PLANTED,
        absentReason: `${PLANTED} 병결`,
      },
      count_students: { className: '3학년 2반', count: 30, students: [PLANTED] },
      list_classes: {
        classes: [{ id: 'c1', name: '3학년 2반', grade: 3, classNum: 2, homeroomStudent: PLANTED }],
      },
      get_records_stats: {
        className: '3학년 2반',
        period: '2026-08-01 ~ 2026-08-21',
        total: 3,
        byCategory: [{ category: '학습', count: 3, lastStudent: PLANTED }],
      },
      get_my_todos: {
        items: [{ title: `${PLANTED} 학부모 면담`, due: '2026-08-26', done: false }],
      },
      // ── 브릿지 동등화 Phase 1 — 자유 입력 자리마다 이름을 심는다 ──
      get_meals: {
        period: '2026-08-24 ~ 2026-08-28',
        // 수동 입력(CSV) 경로가 있어 메뉴 문자열은 자유 입력이다
        items: [{ date: '2026-08-24', mealType: '중식', dishes: `${PLANTED} 특식`, calorie: '' }],
      },
      get_ddays: {
        items: [{ title: `${PLANTED} 생일`, date: '2026-09-01', daysLeft: 9, pinned: false }],
      },
      get_events: {
        period: '2026-08-24 ~ 2026-08-30',
        truncated: false,
        items: [
          {
            date: '2026-08-25',
            title: `${PLANTED} 상담`,
            time: '15:00',
            location: `${PLANTED} 교실`,
          },
        ],
      },
    };

    for (const def of ASSIST_TOOLS) {
      const raw = TRAPS[def.id];
      expect(raw, `${def.id} 함정 픽스처가 없다 - 도구를 추가하면 여기도 추가할 것`).toBeDefined();

      const safe = sanitizeToolResult(def, raw ?? {});
      const survived = JSON.stringify(safe).includes(PLANTED);
      const gate = checkOutboundValue(safe, FIXTURE_ROSTER, def);

      if (survived) {
        // (b) 살아남았다면 관문이 반드시 잡아야 한다.
        expect(gate.blocked, `${def.id}: 이름이 남았는데 관문이 통과시켰다`).toBe(true);
      } else {
        // (a) 구조적으로 사라졌다면 관문은 조용해야 한다(오탐 없음).
        expect(gate.blocked, `${def.id}: 이름이 없는데 관문이 막았다`).toBe(false);
      }
    }
  });

  it('★맵 형태 집계의 키에 든 이름도 잡는다', () => {
    // byCategory 가 배열이라 지금은 안전하지만, 맵 형태가 하나 추가되면 뚫린다.
    expect(checkOutboundValue({ 김지훈: 3 }, FIXTURE_ROSTER).blocked).toBe(true);
  });

  it('★재구성이 중첩까지 막는다 — 스토어 객체를 통째로 넘겨도', () => {
    const { safe } = runPipeline('get_my_todos', {
      items: [
        {
          title: '수행평가 채점',
          due: '2026-08-25',
          done: false,
          subTasks: ['비공개 메모'],
          googleTaskId: 'abc123',
          assigneeName: '박서연',
        },
      ],
    });

    const first = (safe.items as ToolResultShape[])[0];
    expect(Object.keys(first ?? {}).sort()).toEqual(['done', 'due', 'title']);
    expect(findDisallowedFields(tool('get_my_todos'), safe)).toEqual([]);
  });
});
