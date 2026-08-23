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
};

function fakeDeps(): { deps: WriteDeps; calls: string[] } {
  const calls: string[] = [];
  const track =
    (label: string) =>
    async (...args: unknown[]): Promise<unknown> => {
      calls.push(label);
      void args;
      return undefined;
    };

  const deps = {
    addTodo: track('addTodo'),
    updateTodo: track('updateTodo'),
    toggleTodo: track('toggleTodo'),
    deleteTodo: track('deleteTodo'),
    addEvent: track('addEvent'),
    getEvent: () => ({ id: 'e1', title: '학부모 총회', date: '2026-08-25', category: 'school' }),
    updateEvent: track('updateEvent'),
    deleteEvent: track('deleteEvent'),
    addMemo: track('addMemo'),
    updateMemo: track('updateMemo'),
    deleteMemo: track('deleteMemo'),
    addProgressEntry: track('addProgressEntry'),
    getProgress: () => SRC.progress[0],
    updateProgressEntry: track('updateProgressEntry'),
    deleteProgressEntry: track('deleteProgressEntry'),
    addBookmark: track('addBookmark'),
    updateBookmark: track('updateBookmark'),
    deleteBookmark: track('deleteBookmark'),
    addBookmarkGroup: track('addBookmarkGroup'),
    createNotebook: track('createNotebook'),
    renameNotebook: track('renameNotebook'),
    createSection: track('createSection'),
    renameSection: track('renameSection'),
    createPage: track('createPage'),
    renamePage: track('renamePage'),
    deletePage: track('deletePage'),
    noteSelection: () => ({ notebookId: 'nb-new', sectionId: 's-new', pageId: 'p-new' }),
  } as unknown as WriteDeps;

  return { deps, calls };
}

async function run(tool: string, args: object): Promise<{ calls: string[]; message: string }> {
  const outcome = buildWriteProposal(tool, JSON.stringify(args), SRC);
  if (!isWriteProposal(outcome)) throw new Error(`제안이 아니다: ${outcome.reason}`);
  const { deps, calls } = fakeDeps();
  const result = await executeAssistWrite(outcome, deps);
  expect(result.ok, `${tool} 실행이 실패했다: ${result.message}`).toBe(true);
  return { calls, message: result.message };
}

describe('★도구 22종이 각자 제 스토어 함수를 부른다', () => {
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
  ];

  it('22종을 빠짐없이 검사한다', () => {
    expect(CASES).toHaveLength(22);
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
