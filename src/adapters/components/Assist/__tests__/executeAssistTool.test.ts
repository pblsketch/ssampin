/**
 * 쌤핀 AI — 도구 실행기 (옵션 A, 브릿지 동등화 Phase 1)
 *
 * ★모델 인자는 항상 불신한다 — 여기의 방어가 뚫리면 모델이 실행기의 입력을
 * 마음대로 정하는 셈이 된다. 깨진 JSON·이상한 날짜·모르는 도구를 전부 다룬다.
 */
import { describe, expect, it } from 'vitest';

import { executeAssistTool, type ExecutorSources } from '../AssistDockContainer';

const SCHEDULE: Readonly<Record<string, readonly { subject: string; classroom: string }[]>> = {
  '2026-08-24': [{ subject: '수학', classroom: '3-2' }],
};

const SRC: ExecutorSources = {
  students: [],
  classes: [{ id: 'c1', name: '3학년 2반', grade: 3, students: [{}, {}] }],
  todos: [
    { text: '결재 올리기', dueDate: '2026-08-25', completed: false },
    { text: '채점', dueDate: '2026-08-20', completed: true },
  ],
  records: [],
  meals: [
    { date: '20260824', mealType: '중식', dishes: [{ name: '차조밥' }], calorie: '690 Kcal' },
  ],
  events: [],
  ddays: [{ title: '수능', targetDate: '2026-11-19', pinned: true }],
  getDaySchedule: (date) => SCHEDULE[date] ?? [],
  progress: [
    {
      classId: 'c1',
      date: '2026-08-24',
      period: 3,
      unit: '2단원 함수',
      lesson: '1차시',
      status: 'completed',
      note: '',
    },
  ],
  memos: [
    { content: '학년 회의 자료', updatedAt: '2026-08-23T00:00:00Z', archived: false },
    { content: '지난 학기 메모', updatedAt: '2026-06-01T00:00:00Z', archived: true },
  ],
  notes: {
    notebooks: [{ id: 'nb1', title: '3학년 수학', archived: false }],
    sections: [{ id: 's1', notebookId: 'nb1', title: '수업 준비' }],
    pages: [
      { sectionId: 's1', title: '2단원 지도안', pinned: false, updatedAt: '2026-08-20T00:00:00Z' },
    ],
  },
  bookmarks: [{ name: '나이스', url: 'https://neis.go.kr/detail?sid=20260315', groupId: 'g1' }],
  bookmarkGroups: [{ id: 'g1', name: '업무', archived: false }],
};

describe('executeAssistTool', () => {
  it('레지스트리에 없는 도구는 무시한다 — 모델이 지어낸 이름', () => {
    expect(executeAssistTool('made_up_tool', '{}', SRC)).toBeNull();
  });

  it('깨진 JSON 인자는 기본값으로 방어한다', () => {
    const card = executeAssistTool('get_ddays', '{{{not json', SRC);

    expect(card?.tool).toBe('get_ddays');
    const items = (card?.data as { items?: readonly { title?: string }[] }).items;
    expect(items?.[0]?.title).toBe('수능');
  });

  it('이상한 날짜 인자는 버리고 기본 기간을 쓴다', () => {
    const card = executeAssistTool('get_meals', '{"from":"내일부터","to":123}', SRC);

    expect(card?.tool).toBe('get_meals');
    // 기본값 = 오늘~+6일. 픽스처 날짜가 기간 밖일 수 있으므로 형태만 확인한다.
    expect(card?.data).toHaveProperty('period');
    expect(card?.data).toHaveProperty('items');
  });

  it('정상 인자는 그대로 쓴다 — 급식 기간 조회', () => {
    const card = executeAssistTool('get_meals', '{"from":"2026-08-24","to":"2026-08-28"}', SRC);

    const data = card?.data as { period?: string; items?: readonly { dishes?: string }[] };
    expect(data.period).toBe('2026-08-24 ~ 2026-08-28');
    expect(data.items?.[0]?.dishes).toBe('차조밥');
  });

  it('기존 도구(할 일 등)도 실행기에서 부를 수 있다 — 조립기 한 벌을 공유한다', () => {
    const card = executeAssistTool('get_my_todos', '{}', SRC);

    expect(card?.tool).toBe('get_my_todos');
    expect(card?.data).toHaveProperty('undone');
  });

  // ── 슬라이스 2: 잔여 6종 + 기존 도구 인자 보강 ──

  it('시간표 — 빈 교시는 빼고 교시 번호를 붙여 준다', () => {
    const card = executeAssistTool('get_timetable', '{"from":"2026-08-24","to":"2026-08-24"}', SRC);

    const items = (card?.data as { items?: readonly { subject?: string; periodNo?: number }[] })
      .items;
    expect(items?.[0]?.subject).toBe('수학');
    expect(items?.[0]?.periodNo).toBe(1);
  });

  it('진도 — 학급을 UUID 가 아니라 이름으로 돌려준다', () => {
    const card = executeAssistTool('get_progress', '{"from":"2026-08-01","to":"2026-08-31"}', SRC);

    const items = (card?.data as { items?: readonly { className?: string }[] }).items;
    expect(items?.[0]?.className).toBe('3학년 2반');
  });

  it('진도 — 모델이 지어낸 학급 이름은 버린다(결과가 조용히 0건이 되면 안 된다)', () => {
    const card = executeAssistTool(
      'get_progress',
      '{"from":"2026-08-01","to":"2026-08-31","className":"없는 반"}',
      SRC,
    );

    expect((card?.data as { total?: number }).total).toBe(1);
  });

  it('★메모 — 내용까지 나간다 (오너 결정 ①)', () => {
    const card = executeAssistTool('get_memos', '{}', SRC);

    const items = (card?.data as { items?: readonly { content?: string }[] }).items;
    expect(items?.[0]?.content).toBe('학년 회의 자료');
    // 보관함은 기본 제외
    expect((card?.data as { total?: number }).total).toBe(1);
  });

  it('메모 — 문자열 "true" 도 참으로 받는다 (모델이 자주 그렇게 보낸다)', () => {
    const card = executeAssistTool('get_memos', '{"includeArchived":"true"}', SRC);
    expect((card?.data as { total?: number }).total).toBe(2);
  });

  it('노트 — 제목만 나가고 본문 필드는 아예 없다', () => {
    const card = executeAssistTool('get_note_list', '{}', SRC);

    const items = (card?.data as { items?: readonly Record<string, unknown>[] }).items;
    expect(items?.[0]?.title).toBe('2단원 지도안');
    expect(Object.keys(items?.[0] ?? {})).not.toContain('body');
  });

  it('★즐겨찾기 — 주소는 도메인만 나간다 (오너 결정 ②)', () => {
    const card = executeAssistTool('get_bookmarks', '{}', SRC);

    const items = (card?.data as { items?: readonly { domain?: string }[] }).items;
    expect(items?.[0]?.domain).toBe('neis.go.kr');
    expect(JSON.stringify(card?.data)).not.toContain('sid=');
  });

  it('주간 요약 — 날짜별 한 줄과 미완료 할 일 수를 함께 준다', () => {
    const card = executeAssistTool(
      'get_week_overview',
      '{"from":"2026-08-24","to":"2026-08-25"}',
      SRC,
    );

    const data = card?.data as {
      days?: readonly { date?: string; lessons?: number }[];
      todoUndone?: number;
    };
    expect(data.days).toHaveLength(2);
    expect(data.days?.[0]?.lessons).toBe(1);
    expect(data.todoUndone).toBe(1);
  });

  it('출결 — 조회일 인자를 받는다(예전에는 오늘로 고정이었다)', () => {
    const card = executeAssistTool('get_attendance_summary', '{"date":"2026-08-24"}', SRC);
    expect((card?.data as { date?: string }).date).toBe('2026-08-24');
  });

  it('기록 통계 — 기간 인자를 받고 라벨에 실제 범위를 적는다', () => {
    const card = executeAssistTool(
      'get_records_stats',
      '{"from":"2026-03-01","to":"2026-08-31"}',
      SRC,
    );
    expect((card?.data as { period?: string }).period).toBe('2026-03-01 ~ 2026-08-31');
  });

  it('할 일 — 완료분 포함 인자를 받는다', () => {
    const only = executeAssistTool('get_my_todos', '{}', SRC);
    const all = executeAssistTool('get_my_todos', '{"includeCompleted":true}', SRC);

    expect((only?.data as { items?: readonly unknown[] }).items).toHaveLength(1);
    expect((all?.data as { items?: readonly unknown[] }).items).toHaveLength(2);
  });

  it('인원 수 — 학급 이름을 주면 그 학급을 센다', () => {
    const card = executeAssistTool('count_students', '{"className":"3학년 2반"}', SRC);
    expect((card?.data as { count?: number; className?: string }).count).toBe(2);
    expect((card?.data as { className?: string }).className).toBe('3학년 2반');
  });
});
