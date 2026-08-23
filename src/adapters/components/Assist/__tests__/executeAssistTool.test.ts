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
  // ── Phase 2 ──
  classAttendance: [
    {
      classId: 'c1',
      date: '2026-08-03',
      period: 1,
      students: [{ status: 'present' }, { status: 'absent' }],
    },
  ],
  gradePlans: [
    {
      id: 'a1',
      teachingClassId: 'c1',
      semester: '2',
      subject: '수학',
      title: '2학기 1차 지필',
      kind: 'written-exam',
      fullScore: 100,
    },
  ],
  gradeScores: [
    { assessmentId: 'a1', score: 95 },
    { assessmentId: 'a1', score: 75 },
  ],
  seating: {
    rows: 1,
    cols: 3,
    seats: [['stu-1', 'stu-2', null]],
    layout: 'grid',
  },
  rubrics: [
    {
      id: 'r1',
      classId: 'c1',
      title: '토론 평가',
      criteria: [
        {
          id: 'k1',
          name: '주장의 명확성',
          order: 0,
          levels: [
            { id: 'l1', name: '탁월함', score: 4 },
            { id: 'l2', name: '잘함', score: 3 },
          ],
        },
      ],
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-01T00:00:00Z',
    },
  ],
  rubricGradings: [
    {
      id: 'g1',
      rubricId: 'r1',
      classId: 'c1',
      studentId: 'stu-1',
      status: 'graded',
      marks: { k1: 'l1' },
      criterionNotes: { k1: '김지훈 메모' },
      overallFeedback: '김지훈 총평',
      gradedAt: '2026-08-20T00:00:00Z',
    },
  ],
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

  // ── Phase 2: 집계로 커버하는 읽기 ──

  it('담임 출결 기간 — 출석은 세지 않는다(수업일 수를 모른다)', () => {
    const card = executeAssistTool(
      'get_homeroom_attendance_stats',
      '{"from":"2026-08-01","to":"2026-08-31"}',
      SRC,
    );

    expect(card?.tool).toBe('get_homeroom_attendance_stats');
    expect(Object.keys(card?.data ?? {})).not.toContain('present');
    expect((card?.data as { rosterSize?: number }).rosterSize).toBe(0);
  });

  it('수업반 출결 — 날짜별로 묶고 출석도 센다', () => {
    const card = executeAssistTool(
      'get_class_attendance_stats',
      '{"from":"2026-08-01","to":"2026-08-31"}',
      SRC,
    );

    const data = card?.data as { present?: number; days?: readonly { className?: string }[] };
    expect(data.present).toBe(1);
    expect(data.days?.[0]?.className).toBe('3학년 2반');
  });

  it('성적 — 평균과 성취도 분포를 준다. 학생 점수는 없다', () => {
    const card = executeAssistTool('get_grade_stats', '{}', SRC);

    const items = (card?.data as { items?: readonly { average?: number; distribution?: string }[] })
      .items;
    // 95점 → A, 75점 → C. 평균 85.
    expect(items?.[0]?.average).toBe(85);
    expect(items?.[0]?.distribution).toBe('A 1 · B 0 · C 1 · D 0 · E 0');
    expect(JSON.stringify(card?.data)).not.toContain('studentKey');
  });

  it('성적 — 모델이 지어낸 학기 값은 버린다', () => {
    const card = executeAssistTool('get_grade_stats', '{"semester":"2026-2"}', SRC);
    expect((card?.data as { total?: number }).total).toBe(1);
  });

  it('★자리 배치 — 숫자만 나가고 좌석표는 안 나간다', () => {
    const card = executeAssistTool('get_seating_stats', '{}', SRC);

    const data = card?.data as { seatCount?: number; assigned?: number; empty?: number };
    expect(data.seatCount).toBe(3);
    expect(data.assigned).toBe(2);
    expect(data.empty).toBe(1);
    expect(JSON.stringify(card?.data)).not.toContain('stu-1');
  });

  it('★루브릭 — 분포만 나가고 학생별 총평·메모는 안 나간다', () => {
    const card = executeAssistTool('get_assessment_stats', '{}', SRC);

    const data = card?.data as {
      sheets?: readonly { title?: string; graded?: number }[];
      criteria?: readonly { distribution?: string }[];
    };
    expect(data.sheets?.[0]?.title).toBe('토론 평가');
    expect(data.sheets?.[0]?.graded).toBe(1);
    expect(data.criteria?.[0]?.distribution).toBe('탁월함 1 · 잘함 0');
    expect(JSON.stringify(card?.data)).not.toContain('김지훈');
  });

  it('★반 이름이 딱 안 맞아도 한 반으로 좁혀진다 — 모델은 질문의 말을 그대로 옮긴다', () => {
    // 실서버에서 "3학년 2반 수업 출결"을 물으면 className:"3학년 2반 수업" 이 온다.
    const card = executeAssistTool(
      'get_class_attendance_stats',
      '{"from":"2026-08-01","to":"2026-08-31","className":"3학년 2반 수업"}',
      SRC,
    );

    expect((card?.data as { className?: string }).className).toBe('3학년 2반');
  });

  it('★후보가 둘 이상이면 좁히지 않는다 — 엉뚱한 반 숫자를 맞다고 말하는 게 더 나쁘다', () => {
    const twoClasses = {
      ...SRC,
      classes: [
        { id: 'c1', name: '3학년 2반', grade: 3, students: [{}, {}] },
        { id: 'c2', name: '3학년', grade: 3, students: [{}] },
      ],
    };
    const card = executeAssistTool(
      'get_class_attendance_stats',
      '{"className":"3학년 2반 수업"}',
      twoClasses,
    );

    expect((card?.data as { className?: string }).className).toBe('전체 수업반');
  });

  it('기록 통계 — 기간이 두 달 이상이면 달별로 묶어 준다', () => {
    const withRecords = {
      ...SRC,
      records: [
        { studentId: 's1', category: 'observation', subcategory: '학습', date: '2026-07-10' },
        { studentId: 's2', category: 'observation', subcategory: '학습', date: '2026-08-10' },
      ],
    };
    const wide = executeAssistTool(
      'get_records_stats',
      '{"from":"2026-07-01","to":"2026-08-31"}',
      withRecords,
    );
    const narrow = executeAssistTool(
      'get_records_stats',
      '{"from":"2026-08-01","to":"2026-08-31"}',
      withRecords,
    );

    expect((wide?.data as { byMonth?: readonly { month?: string }[] }).byMonth).toHaveLength(2);
    // 한 달짜리에는 붙이지 않는다 — 같은 숫자를 두 번 보내면 토큰만 쓴다.
    expect(Object.keys(narrow?.data ?? {})).not.toContain('byMonth');
  });
});
