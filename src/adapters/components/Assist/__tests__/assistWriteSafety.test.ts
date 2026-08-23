/**
 * 쌤핀 AI 쓰기 — **안전 구조** 검사 (계획서 §2 C그룹 · Phase 3 인수 조건)
 *
 * 계획서가 이 Phase 에 건 조건은 기능이 아니라 구조다:
 *   "미리보기 없이 실행되는 경로가 없다"를 테스트로 고정한다.
 *
 * 그래서 여기서는 "저장이 되는가"를 보지 않는다. **저장이 안 되는가**를 본다.
 * 모델이 무슨 말을 하든, 선생님이 [실행]을 누르기 전까지 스토어 함수는 한 번도
 * 불리지 않아야 한다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAssistStore } from '@adapters/stores/useAssistStore';
import type { AssistPort, AssistAnswer } from '@domain/ports/AssistPort';
import { isWriteProposal } from '@domain/entities/AssistWrite';
import { buildWriteProposal, writeToolNames } from '@usecases/assist/writes/buildWriteProposal';
import type { WriteSources } from '@usecases/assist/writes/writeSources';
import { ASSIST_WRITE_TOOLS } from '@domain/services/assistToolRegistry';
import { executeAssistWrite } from '../executeAssistWrite';
import type { WriteDeps } from '../executeAssistWrite';

const SOURCES: WriteSources = {
  today: '2026-08-23',
  periodTimes: [],
  todos: [{ id: 't1', text: '장보기', completed: false }],
  events: [{ id: 'e1', title: '학부모 총회', date: '2026-08-25' }],
  memos: [{ id: 'm1', content: '회의 자료 준비' }],
  progress: [],
  classes: [{ id: 'c1', name: '3학년 2반' }],
  bookmarks: [{ id: 'b1', name: '나이스', url: 'https://neis.go.kr', groupId: 'g1' }],
  bookmarkGroups: [{ id: 'g1', name: '업무' }],
  notebooks: [{ id: 'nb1', title: '3학년 수학' }],
  noteSections: [{ id: 's1', notebookId: 'nb1', title: '수업 준비' }],
  notePages: [{ id: 'p1', sectionId: 's1', title: '2단원 지도안' }],
};

/** 모델이 쓰기 도구를 고른 척하는 포트 */
function portProposing(name: string, args: string): AssistPort {
  return {
    ask: (): Promise<AssistAnswer> =>
      Promise.resolve({
        text: '',
        degraded: null,
        toolCalls: [{ name, rawArguments: args }],
      }),
  };
}

/** 하나라도 불리면 안 되는 스토어 함수 뭉치 */
function spyDeps(): { deps: WriteDeps; calls: string[] } {
  const calls: string[] = [];
  const track =
    (label: string) =>
    async (...args: unknown[]): Promise<never | void> => {
      calls.push(`${label}(${JSON.stringify(args)})`);
    };
  const deps = {
    addTodo: track('addTodo'),
    updateTodo: track('updateTodo'),
    toggleTodo: track('toggleTodo'),
    deleteTodo: track('deleteTodo'),
    addEvent: track('addEvent'),
    getEvent: (id: string) => ({
      id,
      title: '학부모 총회',
      date: '2026-08-25',
      category: 'school',
    }),
    updateEvent: track('updateEvent'),
    deleteEvent: track('deleteEvent'),
    addMemo: track('addMemo'),
    updateMemo: track('updateMemo'),
    deleteMemo: track('deleteMemo'),
    addProgressEntry: track('addProgressEntry'),
    getProgress: (id: string) => ({
      id,
      classId: 'c1',
      date: '2026-08-24',
      period: 3,
      unit: '2단원',
      lesson: '',
      status: 'completed' as const,
      note: '',
    }),
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

beforeEach(() => {
  useAssistStore.setState({ enabled: true, turns: [], draft: '' });
});

describe('★미리보기 없이 실행되는 경로가 없다 (Phase 3 인수 조건)', () => {
  it('모델이 삭제를 골라도 스토어는 한 번도 불리지 않는다', async () => {
    const { deps, calls } = spyDeps();

    await useAssistStore.getState().ask(
      portProposing('delete_todo', '{"match":"장보기"}'),
      '장보기 할 일 지워줘',
      [],
      [],
      // 읽기 실행기 — 쓰기 이름이 여기로 새면 즉시 드러난다
      () => {
        calls.push('executeTool');
        return null;
      },
      (name, args) => buildWriteProposal(name, args, SOURCES),
    );

    const turn = useAssistStore.getState().turns[0];
    expect(turn?.proposal?.tool).toBe('delete_todo');
    expect(turn?.proposalState).toBe('pending');
    // ★아직 아무 일도 일어나지 않았다.
    expect(calls).toEqual([]);
    // 참고: deps 는 이 시점에 쓰이지도 않는다 — 스토어는 deps 를 받은 적이 없다.
    expect(deps).toBeDefined();
  });

  it('★스토어는 저장할 방법 자체를 갖고 있지 않다 — 넘겨받는 것이 제안 조립기뿐이다', async () => {
    // `ask` 의 인자에 "실행 함수"가 없다는 사실을 실행 가능한 형태로 못 박는다.
    // 쓰기 분기가 부르는 것은 proposeWrite 하나이고, 그것은 값을 만들 뿐이다.
    const proposals: string[] = [];
    await useAssistStore
      .getState()
      .ask(
        portProposing('create_todo', '{"text":"결재 올리기"}'),
        '결재 올리기 할 일 넣어줘',
        [],
        [],
        undefined,
        (name, args) => {
          proposals.push(name);
          return buildWriteProposal(name, args, SOURCES);
        },
      );

    expect(proposals).toEqual(['create_todo']);
    const turn = useAssistStore.getState().turns[0];
    expect(isWriteProposal(turn?.proposal ?? { reason: '' })).toBe(true);
    expect(turn?.answer).toContain('[실행]');
  });

  it('쓰기 제안에는 **두 번째 왕복이 없다** — 모델이 "저장했다"고 앞질러 말하지 못한다', async () => {
    let asked = 0;
    const port: AssistPort = {
      ask: (): Promise<AssistAnswer> => {
        asked += 1;
        return Promise.resolve({
          text: '',
          degraded: null,
          toolCalls: [{ name: 'create_memo', rawArguments: '{"content":"메모"}' }],
        });
      },
    };

    await useAssistStore
      .getState()
      .ask(port, '메모 붙여줘', [], [], undefined, (n, a) => buildWriteProposal(n, a, SOURCES));

    expect(asked).toBe(1);
  });

  it('★실행 없이 다음 질문을 하면 제안은 소멸한다', async () => {
    const propose = (n: string, a: string) => buildWriteProposal(n, a, SOURCES);

    await useAssistStore
      .getState()
      .ask(
        portProposing('delete_todo', '{"match":"장보기"}'),
        '지워줘',
        [],
        [],
        undefined,
        propose,
      );
    expect(useAssistStore.getState().turns[0]?.proposalState).toBe('pending');

    await useAssistStore
      .getState()
      .ask(
        portProposing('create_memo', '{"content":"딴 얘기"}'),
        '딴 얘기',
        [],
        [],
        undefined,
        propose,
      );

    expect(useAssistStore.getState().turns[0]?.proposalState).toBe('expired');
    expect(useAssistStore.getState().turns[1]?.proposalState).toBe('pending');
  });

  it('★한 번에 한 건 — 모델이 여러 쓰기를 불러도 제안은 하나다', async () => {
    const port: AssistPort = {
      ask: (): Promise<AssistAnswer> =>
        Promise.resolve({
          text: '',
          degraded: null,
          toolCalls: [
            { name: 'delete_todo', rawArguments: '{"match":"장보기"}' },
            { name: 'delete_memo', rawArguments: '{"match":"회의"}' },
            { name: 'delete_event', rawArguments: '{"match":"총회"}' },
          ],
        }),
    };

    await useAssistStore
      .getState()
      .ask(port, '다 지워줘', [], [], undefined, (n, a) => buildWriteProposal(n, a, SOURCES));

    const turn = useAssistStore.getState().turns[0];
    expect(turn?.proposal?.tool).toBe('delete_todo');
    // 제안은 턴당 하나뿐인 필드다 — 두 건이 들어갈 자리가 없다.
    expect(Object.keys(turn ?? {}).filter((k) => k === 'proposal')).toHaveLength(1);
  });

  it('제안을 못 만들면 이유를 그대로 보여준다 — 조용히 아무 일도 없지 않다', async () => {
    await useAssistStore
      .getState()
      .ask(
        portProposing('delete_todo', '{"match":"없는할일"}'),
        '없는 거 지워줘',
        [],
        [],
        undefined,
        (n, a) => buildWriteProposal(n, a, SOURCES),
      );

    const turn = useAssistStore.getState().turns[0];
    expect(turn?.proposal).toBeUndefined();
    expect(turn?.answer).toContain('찾지 못했어요');
  });

  it('꺼져 있으면 제안조차 만들어지지 않는다 (차단선)', async () => {
    useAssistStore.setState({ enabled: false });
    const propose = vi.fn();

    await useAssistStore
      .getState()
      .ask(portProposing('create_todo', '{"text":"x"}'), 'x', [], [], undefined, propose);

    expect(propose).not.toHaveBeenCalled();
    expect(useAssistStore.getState().turns).toHaveLength(0);
  });
});

describe('★[실행]을 눌러야 비로소 저장된다', () => {
  it('제안을 실행기에 넘기면 그때 스토어 함수가 불린다', async () => {
    const { deps, calls } = spyDeps();
    const outcome = buildWriteProposal('delete_todo', '{"match":"장보기"}', SOURCES);
    if (!isWriteProposal(outcome)) throw new Error('제안이 만들어져야 한다');

    const result = await executeAssistWrite(outcome, deps);

    expect(result.ok).toBe(true);
    expect(calls).toEqual(['deleteTodo(["t1"])']);
  });

  it('★대상 식별자가 없으면 실행하지 않는다', async () => {
    const { deps, calls } = spyDeps();
    const result = await executeAssistWrite(
      { tool: 'delete_todo', action: 'delete', title: '', fields: [], values: {} },
      deps,
    );

    expect(result.ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it('레지스트리의 쓰기 도구와 조립기 표가 정확히 같다', () => {
    // 한쪽에만 있으면 "고를 수는 있는데 제안이 안 만들어지는" 도구가 생긴다.
    expect([...writeToolNames()].sort()).toEqual(ASSIST_WRITE_TOOLS.map((t) => t.id).sort());
    expect(writeToolNames()).toHaveLength(22);
  });
});

/**
 * ★모델은 고치기·지우기 요청에 **먼저 목록을 본다.** 사람도 그렇게 한다.
 *
 * 실측(2026-08-23): "장보기 할 일 지워줘" → 모델이 `get_my_todos` 를 고른다.
 * 예전에는 2왕복째에 도구 목록을 안 보내서, 목록을 보고 온 모델이 **지우자고 말할
 * 방법이 없었다** — 고치기·지우기 요청 7건이 전부 조회로 끝났다(0/7). 설명 문구를
 * 두 번 고쳐도 소용없었다. 낱말이 아니라 구조였다.
 */
describe('★조회를 한 번 하고 온 뒤에도 쓰기를 제안할 수 있다', () => {
  /** 1왕복: 조회 도구 / 2왕복: 쓰기 도구 — 실서버가 실제로 하는 순서 */
  function portReadThenWrite(calls: string[]): AssistPort {
    let hop = 0;
    return {
      ask: (payload): Promise<AssistAnswer> => {
        hop += 1;
        calls.push(`hop${hop}:tools=${payload.tools ? payload.tools.length > 0 : false}`);
        if (hop === 1) {
          return Promise.resolve({
            text: '',
            degraded: null,
            toolCalls: [{ name: 'get_my_todos', rawArguments: '{}' }],
          });
        }
        return Promise.resolve({
          text: '',
          degraded: null,
          toolCalls: [{ name: 'delete_todo', rawArguments: '{"match":"장보기"}' }],
        });
      },
    };
  }

  it('조회 → 제안으로 이어진다 (조회 카드도 함께 남는다)', async () => {
    const calls: string[] = [];
    const card = { tool: 'get_my_todos', data: { undone: 1 } as never };

    await useAssistStore.getState().ask(
      portReadThenWrite(calls),
      '장보기 할 일 지워줘',
      [],
      [],
      () => card,
      (n, a) => buildWriteProposal(n, a, SOURCES),
    );

    const turn = useAssistStore.getState().turns[0];
    expect(turn?.proposal?.tool).toBe('delete_todo');
    expect(turn?.proposalState).toBe('pending');
    expect(turn?.cards.map((c) => c.tool)).toContain('get_my_todos');
    // ★2왕복째에도 도구 목록이 실려야 모델이 쓰기를 고를 수 있다.
    expect(calls).toEqual(['hop1:tools=true', 'hop2:tools=true']);
  });

  it('★조회로 끝나는 질문은 문장이 비지 않는다 — 도구 없이 한 번 더 묻는다', async () => {
    // 도구 목록을 붙였더니 모델이 문장 대신 또 도구를 불러 text 가 비었다(실측).
    const calls: string[] = [];
    const port: AssistPort = {
      ask: (payload): Promise<AssistAnswer> => {
        calls.push(payload.tools && payload.tools.length > 0 ? 'with-tools' : 'no-tools');
        if (calls.length === 1) {
          return Promise.resolve({
            text: '',
            degraded: null,
            toolCalls: [{ name: 'get_my_todos', rawArguments: '{}' }],
          });
        }
        if (calls.length === 2) {
          // 문장 없이 또 조회를 부른다 — 쓰기가 아니므로 제안이 되지 않는다.
          return Promise.resolve({
            text: '',
            degraded: null,
            toolCalls: [{ name: 'get_week_overview', rawArguments: '{}' }],
          });
        }
        return Promise.resolve({ text: '할 일은 1건 남아 있어요.', degraded: null });
      },
    };

    await useAssistStore.getState().ask(
      port,
      '할 일 뭐 있어?',
      [],
      [],
      () => ({ tool: 'get_my_todos', data: { undone: 1 } as never }),
      (n, a) => buildWriteProposal(n, a, SOURCES),
    );

    const turn = useAssistStore.getState().turns[0];
    expect(turn?.answer).toBe('할 일은 1건 남아 있어요.');
    expect(turn?.proposal).toBeUndefined();
    // ★왕복은 세 번을 넘지 않는다. 마지막은 도구 없이 문장만 받는다.
    expect(calls).toEqual(['with-tools', 'with-tools', 'no-tools']);
  });
});
