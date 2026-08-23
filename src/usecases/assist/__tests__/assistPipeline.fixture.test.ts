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
import {
  ASSIST_READ_TOOLS,
  ASSIST_WRITE_TOOLS,
  findAssistTool,
} from '@domain/services/assistToolRegistry';
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
      // ── 브릿지 동등화 Phase 1 슬라이스 2 (2026-08-23) ──
      get_timetable: {
        period: '2026-08-24 ~ 2026-08-30',
        truncated: false,
        items: [
          { date: '2026-08-24', day: '월', periodNo: 1, subject: '수학', classroom: '3-2' },
          { date: '2026-08-24', day: '월', periodNo: 4, subject: '과학', classroom: '과학실' },
        ],
      },
      get_progress: {
        period: '2026-08-01 ~ 2026-08-23',
        total: 12,
        truncated: false,
        items: [
          {
            date: '2026-08-24',
            className: '3학년 2반',
            periodNo: 3,
            unit: '2단원 함수',
            lesson: '1차시',
            status: 'completed',
            note: '연습문제까지 마침',
          },
        ],
      },
      get_memos: {
        total: 2,
        truncated: false,
        // ★내용까지 담는다(오너 결정 ①). 날짜가 섞인 평범한 메모가 막히지 않아야 한다 —
        //   자유 입력에는 생년월일 패턴이 켜져 있어 여기가 정확히 오탐이 나던 자리다.
        items: [
          { content: '8/25 학년 회의 자료 뽑기', updated: '2026-08-23' },
          { content: '2학기 수행평가 일정 정리', updated: '2026-08-20' },
        ],
      },
      get_note_list: {
        total: 3,
        truncated: false,
        items: [
          {
            notebook: '3학년 수학',
            section: '수업 준비',
            title: '2단원 지도안',
            pinned: true,
            updated: '2026-08-22',
          },
        ],
      },
      get_bookmarks: {
        total: 2,
        truncated: false,
        items: [
          { name: '나이스', domain: 'neis.go.kr', group: '업무' },
          { name: '에듀파인', domain: 'klef.go.kr', group: '업무' },
        ],
      },
      get_week_overview: {
        period: '2026-08-24 ~ 2026-08-30',
        todoUndone: 5,
        truncated: false,
        days: [
          {
            date: '2026-08-24',
            day: '월',
            lessons: 4,
            meal: '중식 차조밥, 콩나물국, 배추김치',
            events: '학부모 총회',
            ddays: '',
          },
        ],
      },
      // ── 브릿지 동등화 Phase 2 (집계로 커버하는 읽기) ──
      get_homeroom_attendance_stats: {
        className: '우리 반',
        period: '2026-08-01 ~ 2026-08-31',
        rosterSize: 30,
        absent: 3,
        late: 5,
        early: 1,
        classAbsence: 0,
        daysWithIssue: 6,
        truncated: false,
        days: [{ date: '2026-08-03', absent: 1, late: 2, early: 0, classAbsence: 0 }],
      },
      get_class_attendance_stats: {
        period: '2026-08-01 ~ 2026-08-31',
        className: '전체 수업반',
        present: 112,
        absent: 4,
        late: 3,
        early: 1,
        classAbsence: 0,
        lessons: 8,
        truncated: false,
        days: [
          {
            date: '2026-08-03',
            className: '3학년 2반',
            lessons: 2,
            present: 56,
            absent: 2,
            late: 1,
            early: 0,
            classAbsence: 0,
          },
        ],
      },
      get_grade_stats: {
        total: 2,
        truncated: false,
        items: [
          {
            className: '3학년 2반',
            subject: '수학',
            title: '2학기 1차 지필',
            kind: '지필',
            fullScore: 100,
            count: 28,
            absent: 2,
            average: 78.4,
            highest: 98,
            lowest: 41,
            distribution: 'A 5 · B 9 · C 8 · D 4 · E 2',
          },
        ],
      },
      get_seating_stats: {
        className: '우리 반',
        layout: '격자',
        rows: 5,
        cols: 6,
        seatCount: 30,
        assigned: 28,
        empty: 2,
        groupCount: 0,
        pairMode: true,
      },
      get_assessment_stats: {
        total: 1,
        truncated: false,
        sheets: [
          {
            className: '3학년 2반',
            title: '토론 평가',
            students: 28,
            graded: 25,
            partial: 2,
            absent: 1,
            maxScore: 8,
            average: 6.4,
          },
        ],
        criteria: [
          {
            rubric: '토론 평가',
            criterion: '주장의 명확성',
            marked: 27,
            distribution: '탁월함 12 · 잘함 10 · 보통 5',
          },
        ],
      },
    };

    // ★쓰기 도구는 결과를 돌려주지 않으므로 이 루프의 대상이 아니다(아래에서 따로 본다).
    for (const def of ASSIST_READ_TOOLS) {
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
      // ── 슬라이스 2 — 자유 입력 자리마다 이름을 심는다 ──
      get_timetable: {
        period: '2026-08-24 ~ 2026-08-30',
        truncated: false,
        items: [
          {
            date: '2026-08-24',
            day: '월',
            periodNo: 1,
            // 과목·교실은 손으로 고칠 수 있는 자리다("김지훈 보강" 처럼 적는 선생님이 있다)
            subject: `${PLANTED} 보강`,
            classroom: `${PLANTED} 교실`,
          },
        ],
      },
      get_progress: {
        period: '2026-08-01 ~ 2026-08-23',
        total: 1,
        truncated: false,
        items: [
          {
            date: '2026-08-24',
            className: '3학년 2반',
            periodNo: 3,
            unit: `${PLANTED} 발표 단원`,
            lesson: '1차시',
            status: 'completed',
            note: `${PLANTED} 개별 지도`,
          },
        ],
      },
      get_memos: {
        total: 1,
        truncated: false,
        items: [{ content: `${PLANTED} 어머니께 전화드리기`, updated: '2026-08-23' }],
      },
      get_note_list: {
        total: 1,
        truncated: false,
        items: [
          {
            notebook: `${PLANTED} 상담 기록`,
            section: '2학기',
            title: `${PLANTED} 면담`,
            pinned: false,
            updated: '2026-08-22',
          },
        ],
      },
      get_bookmarks: {
        total: 1,
        truncated: false,
        items: [{ name: `${PLANTED} 생기부`, domain: 'neis.go.kr', group: `${PLANTED} 자료` }],
      },
      get_week_overview: {
        period: '2026-08-24 ~ 2026-08-30',
        todoUndone: 1,
        truncated: false,
        days: [
          {
            date: '2026-08-24',
            day: '월',
            lessons: 4,
            meal: `${PLANTED} 특식`,
            events: `${PLANTED} 상담`,
            ddays: `${PLANTED} 생일`,
          },
        ],
      },
      // ── Phase 2 — 집계 도구에는 자유 입력 자리가 거의 없다.
      //    그래서 함정은 **화이트리스트 밖 필드로 심는다**: 원본 엔티티에 붙어 있는
      //    학생 이름·식별자가 실수로 결과에 실렸을 때 구조적으로 사라지는지 본다.
      get_homeroom_attendance_stats: {
        className: '우리 반',
        period: '2026-08-01 ~ 2026-08-31',
        rosterSize: 30,
        absent: 1,
        late: 0,
        early: 0,
        classAbsence: 0,
        daysWithIssue: 1,
        truncated: false,
        days: [
          {
            date: '2026-08-03',
            absent: 1,
            late: 0,
            early: 0,
            classAbsence: 0,
            studentName: PLANTED,
            reason: `${PLANTED} 병결`,
          },
        ],
      },
      get_class_attendance_stats: {
        period: '2026-08-01 ~ 2026-08-31',
        className: '3학년 2반',
        present: 27,
        absent: 1,
        late: 0,
        early: 0,
        classAbsence: 0,
        lessons: 1,
        truncated: false,
        absentStudents: [PLANTED],
        days: [
          {
            date: '2026-08-03',
            className: '3학년 2반',
            lessons: 1,
            present: 27,
            absent: 1,
            late: 0,
            early: 0,
            classAbsence: 0,
            students: [{ number: 15, name: PLANTED }],
          },
        ],
      },
      get_grade_stats: {
        total: 1,
        truncated: false,
        items: [
          {
            className: '3학년 2반',
            subject: '수학',
            // 평가 제목은 선생님이 적는다 — 여기는 자유 입력이라 관문이 잡아야 한다.
            title: `${PLANTED} 재시험`,
            kind: '지필',
            fullScore: 100,
            count: 1,
            absent: 0,
            average: 95,
            highest: 95,
            lowest: 95,
            distribution: 'A 1 · B 0 · C 0 · D 0 · E 0',
            topStudent: PLANTED,
          },
        ],
      },
      get_seating_stats: {
        className: '우리 반',
        layout: '격자',
        rows: 1,
        cols: 2,
        seatCount: 2,
        assigned: 1,
        empty: 1,
        groupCount: 0,
        pairMode: false,
        seats: [[PLANTED, null]],
      },
      get_assessment_stats: {
        total: 1,
        truncated: false,
        sheets: [
          {
            className: '3학년 2반',
            title: `${PLANTED} 토론 평가`,
            students: 1,
            graded: 1,
            partial: 0,
            absent: 0,
            maxScore: 4,
            average: 4,
            overallFeedback: `${PLANTED} 총평`,
          },
        ],
        criteria: [
          {
            rubric: '토론 평가',
            criterion: `${PLANTED} 발표 태도`,
            marked: 1,
            distribution: '탁월함 1',
            note: `${PLANTED} 메모`,
          },
        ],
      },
    };

    for (const def of ASSIST_READ_TOOLS) {
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

/**
 * 쓰기 도구(Phase 3)는 그물 ②·③을 **지나지 않는다.** 지날 결과가 없기 때문이다.
 * 그 대신 지켜야 할 것이 하나 있다: **결과로 내보낼 수 있는 필드가 0개**여야 한다.
 * 하나라도 열리면 그 도구만 조용히 모델에게 무언가를 돌려주게 된다.
 */
describe('쌤핀 AI 쓰기 도구 — 모델에게 돌려줄 것이 없다', () => {
  it('★쓰기 도구는 resultFields 가 비어 있다', () => {
    expect(ASSIST_WRITE_TOOLS.length).toBeGreaterThan(0);
    for (const def of ASSIST_WRITE_TOOLS) {
      expect(def.resultFields, `${def.id} 가 결과 필드를 열었다`).toEqual([]);
      expect(def.nestedFields, `${def.id} 가 중첩 결과 필드를 열었다`).toBeUndefined();
      expect(def.outbound).toBe('args');
    }
  });

  it('★쓰기 도구도 1등급뿐이다 (ADR-061 결정 7)', () => {
    for (const def of ASSIST_WRITE_TOOLS) expect(def.grade).toBe(1);
  });

  it('★읽기와 쓰기가 이름을 겹쳐 쓰지 않는다', () => {
    const readIds = new Set(ASSIST_READ_TOOLS.map((t) => t.id));
    for (const def of ASSIST_WRITE_TOOLS) {
      expect(readIds.has(def.id), `${def.id} 가 읽기와 이름이 겹친다`).toBe(false);
    }
  });
});
