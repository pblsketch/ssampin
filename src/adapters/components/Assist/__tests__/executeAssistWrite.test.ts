/**
 * 쌤핀 AI 쓰기 — 실행기가 **기존 스토어 함수**를 부르는지 (브릿지 동등화 Phase 3)
 *
 * ★계획서: "모든 실행은 기존 스토어 함수를 그대로 부른다 — 새 저장 경로를 만들지 않는다."
 * 새 경로를 파면 동기화·되돌리기·검증이 그 경로만 비켜 가고, 그 사실은 한참 뒤 데이터가
 * 어긋난 뒤에야 드러난다. 그래서 여기서는 **무엇이 불렸는지**를 도구마다 못 박는다.
 *
 * 제안은 실제 조립기(`buildWriteProposal`)로 만든다 — 손으로 지어낸 제안으로 검사하면
 * 조립기와 실행기가 서로 다른 이름을 쓰기 시작해도 테스트가 초록불로 남는다.
 */
import { describe, expect, it } from 'vitest';

import { isWriteProposal } from '@domain/entities/AssistWrite';
import { buildWriteProposal } from '@usecases/assist/writes/buildWriteProposal';
import type { WriteSources } from '@usecases/assist/writes/writeSources';
import { executeAssistWrite } from '../executeAssistWrite';
import type { WriteDeps } from '../executeAssistWrite';

const SRC: WriteSources = {
  today: '2026-08-23',
  periodTimes: [],
  // 출결 제안이 "누구인지"를 정할 때 보는 명단. **모델에게는 나가지 않는다.**
  roster: {
    homeroomClassId: '3-2',
    regularPeriodCount: 7,
    homeroom: [
      { id: 'stu-1', name: '김지훈', studentNumber: 1 },
      { id: 'stu-15', name: '박서연', studentNumber: 15 },
      { id: 'stu-99', name: '번호없는학생' },
    ],
    teaching: [
      {
        classId: 'c1',
        className: '3학년 2반',
        students: [
          { number: 7, name: '최민호', key: '7' },
          { number: 8, name: '이수현', key: '8' },
        ],
      },
    ],
  },
  todos: [{ id: 't1', text: '장보기', completed: false }],
  events: [{ id: 'e1', title: '학부모 총회', date: '2026-08-25' }],
  memos: [{ id: 'm1', content: '회의 자료' }],
  progress: [
    {
      id: 'pr1',
      classId: 'c1',
      date: '2026-08-24',
      period: 3,
      unit: '2단원',
      lesson: '',
      status: 'completed',
      note: '',
    },
  ],
  classes: [{ id: 'c1', name: '3학년 2반' }],
  bookmarks: [{ id: 'b1', name: '나이스', url: 'https://neis.go.kr', groupId: 'g1' }],
  bookmarkGroups: [{ id: 'g1', name: '업무' }],
  notebooks: [{ id: 'nb1', title: '3학년 수학' }],
  noteSections: [{ id: 's1', notebookId: 'nb1', title: '수업 준비' }],
  notePages: [{ id: 'p1', sectionId: 's1', title: '2단원 지도안' }],
  attendance: [],
  rubrics: [
    {
      id: 'rb1',
      classId: 'c1',
      title: '토론 평가',
      criteria: [
        {
          id: 'cr1',
          name: '주장의 명확성',
          levels: [
            { id: 'lv1', name: '잘함' },
            { id: 'lv2', name: '보통' },
          ],
        },
      ],
    },
  ],
};

function fakeDeps(): { deps: WriteDeps; calls: string[]; renamed: string[] } {
  const calls: string[] = [];
  /** 이름 바꾸기가 **어느 id 에** 갔는지. 새로 생긴 id 만 받아야 한다(2026-08-24 P2) */
  const renamed: string[] = [];
  const track =
    (label: string) =>
    async (...args: unknown[]): Promise<unknown> => {
      calls.push(label);
      void args;
      return undefined;
    };

  // 진짜 스토어처럼 생성 호출이 목록에 id 를 더한다 — 실행기는 전후 차집합으로 찾는다.
  const notebookIds = ['nb1'];
  const sectionIds = ['s1'];
  const pageIds = ['p1'];

  const deps = {
    addTodo: track('addTodo'),
    updateTodo: track('updateTodo'),
    toggleTodo: track('toggleTodo'),
    getTodo: () => ({ completed: false }),
    deleteTodo: track('deleteTodo'),
    addEvent: track('addEvent'),
    getEvent: () => ({ id: 'e1', title: '학부모 총회', date: '2026-08-25', category: 'school' }),
    updateEvent: track('updateEvent'),
    deleteEvent: track('deleteEvent'),
    addMemo: track('addMemo'),
    // 대상 재확인(2026-08-24) — 존재하는 것으로 답해야 삭제·수정 분기가 실행까지 간다
    getMemo: () => ({ id: 'm1' }),
    updateMemo: track('updateMemo'),
    deleteMemo: track('deleteMemo'),
    addProgressEntry: track('addProgressEntry'),
    getProgress: () => SRC.progress[0],
    updateProgressEntry: track('updateProgressEntry'),
    deleteProgressEntry: track('deleteProgressEntry'),
    addBookmark: track('addBookmark'),
    getBookmark: () => ({ id: 'b1' }),
    updateBookmark: track('updateBookmark'),
    deleteBookmark: track('deleteBookmark'),
    addBookmarkGroup: track('addBookmarkGroup'),
    createNotebook: async () => {
      calls.push('createNotebook');
      notebookIds.push('nb-new');
    },
    renameNotebook: async (id: string) => {
      calls.push('renameNotebook');
      renamed.push(id);
    },
    createSection: async () => {
      calls.push('createSection');
      sectionIds.push('s-new');
    },
    renameSection: async (id: string) => {
      calls.push('renameSection');
      renamed.push(id);
    },
    createPage: async () => {
      calls.push('createPage');
      pageIds.push('p-new');
    },
    getNotePage: () => ({ id: 'p1' }),
    renamePage: async (id: string) => {
      calls.push('renamePage');
      renamed.push(id);
    },
    deletePage: track('deletePage'),
    listNoteIds: () => ({
      notebookIds: [...notebookIds],
      sectionIds: [...sectionIds],
      pageIds: [...pageIds],
    }),

    // 출결 — 진짜 스토어처럼 "저장된 전체 목록"을 돌려준다(실행기가 하루치를 다시 모은다)
    upsertStudentAttendance: async (params: {
      classId: string;
      date: string;
      recordsByPeriod: ReadonlyMap<number, readonly { number: number; status: string }[]>;
    }) => {
      calls.push('upsertStudentAttendance');
      return [...params.recordsByPeriod].map(([period, students]) => ({
        classId: params.classId,
        date: params.date,
        period,
        students,
      }));
    },
    bridgeHomeroomAttendance: track('bridgeHomeroomAttendance'),
    homeroomStudents: () => SRC.roster.homeroom,
    addObservation: async () => {
      calls.push('addObservation');
      return 'obs-new';
    },
    toggleRubricMark: track('toggleRubricMark'),
    getRubricMark: () => ({ absent: false }),
  } as unknown as WriteDeps;

  return { deps, calls, renamed };
}

async function run(tool: string, args: object): Promise<{ calls: string[]; message: string }> {
  const outcome = buildWriteProposal(tool, JSON.stringify(args), SRC);
  if (!isWriteProposal(outcome)) throw new Error(`제안이 아니다: ${outcome.reason}`);
  const { deps, calls } = fakeDeps();
  const result = await executeAssistWrite(outcome, deps);
  expect(result.ok, `${tool} 실행이 실패했다: ${result.message}`).toBe(true);
  return { calls, message: result.message };
}

describe('★도구 25종이 각자 제 스토어 함수를 부른다', () => {
  const CASES: readonly (readonly [string, object, readonly string[]])[] = [
    ['create_todo', { text: '결재' }, ['addTodo']],
    ['update_todo', { match: '장보기', text: '장보기2' }, ['updateTodo']],
    ['complete_todo', { match: '장보기' }, ['toggleTodo']],
    ['delete_todo', { match: '장보기' }, ['deleteTodo']],

    ['create_event', { title: '회식', date: '2026-09-01' }, ['addEvent']],
    ['update_event', { match: '총회', time: '15:00' }, ['updateEvent']],
    ['delete_event', { match: '총회' }, ['deleteEvent']],

    ['create_memo', { content: '메모' }, ['addMemo']],
    ['update_memo', { match: '회의', content: '새 메모' }, ['updateMemo']],
    ['delete_memo', { match: '회의' }, ['deleteMemo']],

    [
      'create_progress',
      { className: '3학년 2반', date: '2026-08-25', period: 1, unit: '3단원' },
      ['addProgressEntry'],
    ],
    [
      'update_progress',
      { className: '3학년 2반', date: '2026-08-24', period: 3, unit: '4단원' },
      ['updateProgressEntry'],
    ],
    [
      'delete_progress',
      { className: '3학년 2반', date: '2026-08-24', period: 3 },
      ['deleteProgressEntry'],
    ],

    ['create_bookmark', { name: '알리미', url: 'https://a.kr' }, ['addBookmark']],
    ['update_bookmark', { match: '나이스', name: '나이스2' }, ['updateBookmark']],
    ['delete_bookmark', { match: '나이스' }, ['deleteBookmark']],
    ['create_bookmark_group', { name: '새 묶음' }, ['addBookmarkGroup']],

    // ★노트는 "만들고 이름을 고치는" 두 걸음이다 — 스토어가 원래 그런 구조다.
    ['create_notebook', { title: '새 노트책' }, ['createNotebook', 'renameNotebook']],
    [
      'create_note_section',
      { notebook: '3학년 수학', title: '2학기' },
      ['createSection', 'renameSection'],
    ],
    ['create_note_page', { section: '수업 준비', title: '3월' }, ['createPage', 'renamePage']],
    ['rename_note_page', { match: '2단원', title: '새 제목' }, ['renamePage']],
    ['delete_note_page', { match: '2단원' }, ['deletePage']],

    // 출결은 담임 학급이면 **두 걸음**이다 — 출결부에 적고, 학생 기록에도 같은 사실을 남긴다.
    // 화면에서 저장할 때도 늘 이 둘을 함께 밟는다(AttendanceMode.tsx).
    [
      'set_attendance',
      { student: '15번', status: '결석', period: 3 },
      ['upsertStudentAttendance', 'bridgeHomeroomAttendance'],
    ],
    [
      'add_observation',
      { student: '7번', content: '모둠 토의를 이끌었다', className: '3학년 2반' },
      ['addObservation'],
    ],
    [
      'set_rubric_mark',
      { student: '7번', rubric: '토론 평가', criterion: '주장의 명확성', level: '잘함' },
      ['toggleRubricMark'],
    ],
  ];

  it('25종을 빠짐없이 검사한다', () => {
    expect(CASES).toHaveLength(25);
  });

  it.each([...CASES])('%s', async (tool, args, expected) => {
    const { calls, message } = await run(tool, args);
    expect(calls).toEqual([...expected]);
    // 결과 문구가 비어 있으면 선생님은 됐는지 안 됐는지 모른다.
    expect(message.length).toBeGreaterThan(0);
  });
});

describe('실행이 어긋났을 때', () => {
  it('수정 대상이 사라졌으면 아무것도 바꾸지 않는다', async () => {
    const outcome = buildWriteProposal(
      'update_event',
      JSON.stringify({ match: '총회', time: '15:00' }),
      SRC,
    );
    if (!isWriteProposal(outcome)) throw new Error('제안이어야 한다');

    const { deps, calls } = fakeDeps();
    const gone = { ...deps, getEvent: () => undefined } as unknown as WriteDeps;
    const result = await executeAssistWrite(outcome, gone);

    expect(result.ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it('실행 분기가 없는 도구는 조용히 넘기지 않고 알린다', async () => {
    const { deps, calls } = fakeDeps();
    const result = await executeAssistWrite(
      { tool: 'not_wired_yet', action: 'create', title: '', fields: [], values: {} },
      deps,
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain('실행할 수 없어요');
    expect(calls).toEqual([]);
  });
});

/**
 * ★UltraQA(2026-08-23)에서 잡은 두 가지. 둘 다 같은 부류다 —
 * **하지 않은 일을 했다고 말하는 것.** 저장이 안 된 것보다 나쁘다. 안 된 줄 모르니까.
 */
describe('★한 일과 다른 말을 하지 않는다', () => {
  it('노트 페이지 이름을 못 붙였으면 "만들었어요"라고 하지 않는다', async () => {
    const outcome = buildWriteProposal(
      'create_note_page',
      JSON.stringify({ section: '수업 준비', title: '3월' }),
      SRC,
    );
    if (!isWriteProposal(outcome)) throw new Error('제안이어야 한다');

    const { deps, calls } = fakeDeps();
    // 스토어가 생성 후에도 id 목록을 못 갱신한 상황 — 새로 생긴 id 를 찾을 수 없다.
    const blind = {
      ...deps,
      createPage: async () => {
        calls.push('createPage');
      },
    } as unknown as WriteDeps;

    const result = await executeAssistWrite(outcome, blind);

    expect(result.ok).toBe(false);
    expect(result.message).toContain('이름을 붙이지 못했어요');
    // 페이지는 만들어졌다 — 그 사실을 감추지도 않는다(문구가 그렇게 말한다).
    expect(calls).toEqual(['createPage']);
  });

  it.each([
    ['create_notebook', { title: 'x' }, '노트책', 'createNotebook'],
    ['create_note_section', { notebook: '3학년 수학', title: 'x' }, '구역', 'createSection'],
  ])('%s 도 같은 규칙을 따른다', async (tool, args, what, createFn) => {
    const outcome = buildWriteProposal(tool, JSON.stringify(args), SRC);
    if (!isWriteProposal(outcome)) throw new Error('제안이어야 한다');

    const { deps, calls } = fakeDeps();
    const blind = {
      ...deps,
      [createFn]: async () => {
        calls.push(createFn);
      },
    } as unknown as WriteDeps;

    const result = await executeAssistWrite(outcome, blind);
    expect(result.ok).toBe(false);
    expect(result.message).toContain(what);
  });

  it.each([
    ['create_notebook', { title: '새 노트책' }, 'nb-new'],
    ['create_note_section', { notebook: '3학년 수학', title: '2학기' }, 's-new'],
    ['create_note_page', { section: '수업 준비', title: '3월' }, 'p-new'],
  ])(
    '★%s — 이름은 **새로 생긴 id** 에만 붙는다. 활성 선택은 보지 않는다 (2026-08-24 P2)',
    async (tool, args, newId) => {
      // 예전에는 활성 선택을 "방금 만든 것"으로 추정했다 — 선택이 다른 기존 항목을
      // 가리키고 있으면 **그 기존 노트의 이름을 덮어썼다.** 지금은 전후 차집합이라
      // 기존 id(nb1·s1·p1)에는 절대 이름이 가지 않는다.
      const outcome = buildWriteProposal(tool, JSON.stringify(args), SRC);
      if (!isWriteProposal(outcome)) throw new Error('제안이어야 한다');

      const { deps, renamed } = fakeDeps();
      const result = await executeAssistWrite(outcome, deps);

      expect(result.ok).toBe(true);
      expect(renamed).toEqual([newId]);
    },
  );

  it('★새 id 를 확정할 수 없으면(한 번에 둘 생김) 기존 항목을 건드리지 않는다', async () => {
    const outcome = buildWriteProposal(
      'create_notebook',
      JSON.stringify({ title: '새 노트책' }),
      SRC,
    );
    if (!isWriteProposal(outcome)) throw new Error('제안이어야 한다');

    const { deps, renamed } = fakeDeps();
    const listed = [['nb1'], ['nb1', 'nb-a', 'nb-b']];
    const ambiguous = {
      ...deps,
      listNoteIds: () => ({
        notebookIds: listed.length > 1 ? listed.shift()! : listed[0]!,
        sectionIds: [],
        pageIds: [],
      }),
    } as unknown as WriteDeps;

    const result = await executeAssistWrite(outcome, ambiguous);

    expect(result.ok).toBe(false);
    expect(result.message).toContain('이름을 붙이지 못했어요');
    expect(renamed).toEqual([]);
  });

  it('★제안 뒤에 선생님이 직접 체크했으면 되뒤집지 않는다', async () => {
    // 시나리오: "장보기 완료해줘" → 미리보기 → 선생님이 할 일 화면에서 직접 체크
    //           → 돌아와서 [실행] → 그대로 toggle 하면 **완료가 풀린다.**
    const outcome = buildWriteProposal('complete_todo', JSON.stringify({ match: '장보기' }), SRC);
    if (!isWriteProposal(outcome)) throw new Error('제안이어야 한다');

    const { deps, calls } = fakeDeps();
    const alreadyDone = { ...deps, getTodo: () => ({ completed: true }) } as unknown as WriteDeps;

    const result = await executeAssistWrite(outcome, alreadyDone);

    expect(result.ok).toBe(false);
    expect(result.message).toContain('이미 끝낸');
    expect(calls).toEqual([]);
  });

  it('상태가 그대로면 정상적으로 완료한다', async () => {
    const outcome = buildWriteProposal('complete_todo', JSON.stringify({ match: '장보기' }), SRC);
    if (!isWriteProposal(outcome)) throw new Error('제안이어야 한다');

    const { deps, calls } = fakeDeps();
    const result = await executeAssistWrite(outcome, deps);

    expect(result.ok).toBe(true);
    expect(calls).toEqual(['toggleTodo']);
  });
});

/**
 * ★삭제·수정 전 대상 재확인 (2026-08-24 UltraQA).
 *
 * 제안을 만든 뒤 선생님이 화면에서 직접 지웠을 수 있다. 스토어는 없는 id 에 조용히
 * no-op 이라, 확인 없이 "지웠어요"라고 말하면 **거짓 성공**이 된다 — 그 경로를 잠근다.
 */
describe('★없는 대상에 성공을 말하지 않는다', () => {
  const GONE_CASES: readonly (readonly [string, object, string, string])[] = [
    ['delete_todo', { match: '장보기' }, 'getTodo', 'deleteTodo'],
    ['update_todo', { match: '장보기', text: 'x' }, 'getTodo', 'updateTodo'],
    ['delete_event', { match: '총회' }, 'getEvent', 'deleteEvent'],
    ['delete_memo', { match: '회의' }, 'getMemo', 'deleteMemo'],
    ['delete_bookmark', { match: '나이스' }, 'getBookmark', 'deleteBookmark'],
    ['delete_note_page', { match: '2단원' }, 'getNotePage', 'deletePage'],
  ] as const;

  it.each(GONE_CASES)(
    '%s — 대상이 사라졌으면 실패로 답하고 스토어를 부르지 않는다',
    async (tool, args, getter, storeCall) => {
      const outcome = buildWriteProposal(tool, JSON.stringify(args), SRC);
      if (!isWriteProposal(outcome)) throw new Error(`제안이 아니다: ${outcome.reason}`);

      const { deps, calls } = fakeDeps();
      const gone = { ...deps, [getter]: () => undefined } as unknown as WriteDeps;
      const result = await executeAssistWrite(outcome, gone);

      expect(result.ok).toBe(false);
      expect(result.message).toContain('이미 없어요');
      expect(calls).not.toContain(storeCall);
    },
  );
});
