/**
 * @vitest-environment jsdom
 *
 * 근거 정리 보드 — 카드 선택 → 하단 바 → 저장 관문, 학생 경계, AI 분류 제안(적용 전 저장 0회), 유리 모드 서랍.
 *
 * 스토어는 이웃 테스트(`recordDraftAiWiring.test.tsx`)와 같은 가짜 훅으로 흉내 내고, 구독 AI 는
 * `RecordDraftAiPanel.test.tsx` 와 같은 가짜 `electronAPI.ownAi` 로 흉내 낸다.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const {
  THREADS,
  evidenceState,
  fakeStore,
  moveToThreadSpy,
  moveToNewThreadSpy,
  unclassifySpy,
  addSpy,
  removeSpy,
  updateThreadSpy,
  setExcludedSpy,
  setExcludedManySpy,
  addManySpy,
  setThreadSpy,
  OBSERVATIONS,
} = vi.hoisted(() => {
  const threads = [
    {
      id: 'thr-A',
      studentRef: 'sA',
      title: '할인 문구와 선택',
      keywords: ['기회비용'],
      status: 'open' as const,
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 'thr-B',
      studentRef: 'sB',
      title: '세포 관찰',
      keywords: ['현미경'],
      status: 'open' as const,
      createdAt: 1,
      updatedAt: 1,
    },
    // 닫힌 주제 — 끌어다 놓아도 받지 않는다.
    {
      id: 'thr-C',
      studentRef: 'sA',
      title: '닫힌 주제',
      keywords: [],
      status: 'closed' as const,
      createdAt: 1,
      updatedAt: 1,
    },
  ];
  const evidence = [
    {
      id: 'e-A1',
      studentRef: 'sA',
      areas: ['subject'],
      content: 'A학생 기회비용 근거 (주제에 묶임)',
      threadId: 'thr-A',
      sourceType: 'manual' as const,
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 'e-A2',
      studentRef: 'sA',
      areas: ['subject'],
      content: 'A학생 미분류 근거 하나 — 박서연과 모둠에서 비교했다',
      sourceType: 'manual' as const,
      createdAt: 2,
      updatedAt: 2,
    },
    {
      id: 'e-A3',
      studentRef: 'sA',
      areas: ['subject'],
      content: 'A학생 미분류 근거 둘',
      sourceType: 'manual' as const,
      createdAt: 3,
      updatedAt: 3,
    },
    // 기재 금지 어휘(학원)로 자동 제외된 것 — 이유 줄이 붙는다.
    {
      id: 'e-A4',
      studentRef: 'sA',
      areas: ['subject'],
      content: 'A학생 학원에서 미리 배운 내용을 발표했다',
      excludedFromAi: true,
      sourceType: 'manual' as const,
      createdAt: 5,
      updatedAt: 5,
    },
    // 교사가 직접 켠 것(금지 어휘 없음) — 이유 줄이 없다.
    {
      id: 'e-A5',
      studentRef: 'sA',
      areas: ['subject'],
      content: 'A학생 직접 제외한 근거',
      excludedFromAi: true,
      sourceType: 'manual' as const,
      createdAt: 6,
      updatedAt: 6,
    },
    {
      id: 'e-B1',
      studentRef: 'sB',
      areas: ['subject'],
      content: 'B학생 미분류 근거',
      sourceType: 'manual' as const,
      createdAt: 4,
      updatedAt: 4,
    },
    // 관찰기록에서 이미 근거로 넣은 것 — 같은 원본이 거울로 또 뜨면 안 된다.
    {
      id: 'e-A6',
      studentRef: 'sA',
      areas: ['subject'],
      content: '이미 넣은 관찰',
      sourceType: 'observation' as const,
      sourceId: 'obs-stored',
      date: '2026-05-01',
      createdAt: 7,
      updatedAt: 7,
    },
  ];
  /** 거울 카드의 원본 — 관찰기록(수업반 c1). sA 는 studentKey '1', sB 는 '2'. */
  const observations = [
    {
      id: 'obs-A-1',
      studentId: '1',
      classId: 'c1',
      authorId: 't',
      date: '2026-06-18',
      content: '아직 안 넣은 관찰 하나',
      tags: ['개념 설명'],
      visibility: 'private' as const,
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 'obs-stored',
      studentId: '1',
      classId: 'c1',
      authorId: 't',
      date: '2026-05-01',
      content: '이미 넣은 관찰',
      tags: [],
      visibility: 'private' as const,
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 'obs-B',
      studentId: '2',
      classId: 'c1',
      authorId: 't',
      date: '2026-06-19',
      content: 'B학생의 관찰 원본',
      tags: [],
      visibility: 'private' as const,
      createdAt: 1,
      updatedAt: 1,
    },
  ];
  const store = <T extends object>(state: T) => {
    const hook = (sel?: (s: T) => unknown) => (sel ? sel(state) : state);
    hook.getState = () => state;
    hook.setState = () => {};
    return hook;
  };
  const moveToThread = vi.fn(async (input: { evidenceIds: readonly string[] }) => ({
    movedIds: [...input.evidenceIds],
    skippedIds: [] as string[],
  }));
  const moveToNewThread = vi.fn(async (input: { evidenceIds: readonly string[] }) => ({
    movedIds: [...input.evidenceIds],
    skippedIds: [] as string[],
    threadId: 'thr-new',
  }));
  const unclassify = vi.fn(async (input: { evidenceIds: readonly string[] }) => ({
    movedIds: [...input.evidenceIds],
    skippedIds: [] as string[],
  }));
  const add = vi.fn(async (_input: Record<string, unknown>) => 'x');
  const remove = vi.fn(async () => {});
  const updateThread = vi.fn(async () => {});
  const setExcludedFromAi = vi.fn(async (_id: string, _excluded: boolean) => {});
  const setExcludedFromAiMany = vi.fn(async (_ids: readonly string[], _excluded: boolean) => {});
  const addMany = vi.fn(async (_inputs: readonly Record<string, unknown>[]) => 0);
  const setThread = vi.fn(async (_ids: readonly string[], _threadId: string | null) => {});
  const evState = {
    records: evidence,
    loaded: true,
    load: async () => {},
    add,
    addMany,
    update: async () => {},
    remove,
    setExcludedFromAi,
    setExcludedFromAiMany,
    setThread,
    moveToThread,
    moveToNewThread,
    unclassify,
  };
  return {
    THREADS: threads,
    evidenceState: evState,
    fakeStore: store,
    moveToThreadSpy: moveToThread,
    moveToNewThreadSpy: moveToNewThread,
    unclassifySpy: unclassify,
    addSpy: add,
    removeSpy: remove,
    updateThreadSpy: updateThread,
    setExcludedSpy: setExcludedFromAi,
    setExcludedManySpy: setExcludedFromAiMany,
    addManySpy: addMany,
    setThreadSpy: setThread,
    OBSERVATIONS: observations,
  };
});

vi.mock('@adapters/di/container', () => ({}));
/**
 * 끌어다 놓기 — jsdom 에서는 포인터 끌기가 안 되므로, 보드가 `DndContext` 에 넘기는 **실제 핸들러**를 붙잡아 직접 부른다.
 * DndContext 자체는 진짜를 그대로 쓴다(useDraggable/useDroppable 이 안에서 돌아야 하므로).
 */
const dnd = vi.hoisted(() => ({
  onDragStart: null as ((e: unknown) => void) | null,
  onDragEnd: null as ((e: unknown) => void) | null,
}));
vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>();
  const Real = actual.DndContext;
  return {
    ...actual,
    DndContext: (props: Parameters<typeof Real>[0]) => {
      dnd.onDragStart = (props.onDragStart as ((e: unknown) => void) | undefined) ?? null;
      dnd.onDragEnd = (props.onDragEnd as ((e: unknown) => void) | undefined) ?? null;
      return <Real {...props} />;
    },
  };
});
vi.mock('@adapters/analytics/trackEventSafely', () => ({ trackEventSafely: () => {} }));
vi.mock('@adapters/stores/useRecordEvidenceStore', () => ({
  useRecordEvidenceStore: fakeStore(evidenceState),
}));
vi.mock('@adapters/stores/useInquiryThreadStore', () => ({
  useInquiryThreadStore: fakeStore({
    records: THREADS,
    loaded: true,
    load: async () => {},
    add: async () => 'new',
    update: updateThreadSpy,
    remove: async () => {},
  }),
}));
vi.mock('@adapters/stores/useRubricStore', () => ({
  useRubricStore: fakeStore({ rubrics: [], gradings: [], load: async () => {} }),
}));
vi.mock('@adapters/stores/useGradeAnalysisStore', () => ({
  useGradeAnalysisStore: fakeStore({
    plans: [],
    performanceResults: [],
    semesterResults: [],
    load: async () => {},
  }),
}));
vi.mock('@adapters/stores/useAssignmentStore', () => ({
  useAssignmentStore: fakeStore({ submissions: [], assignments: [] }),
}));
// 거울 카드의 원본 — 관찰기록만 넣고 나머지 출처는 비운다.
vi.mock('@adapters/stores/useObservationStore', () => ({
  useObservationStore: fakeStore({ records: OBSERVATIONS, load: async () => {} }),
}));
vi.mock('@adapters/stores/useStudentRecordsStore', () => ({
  useStudentRecordsStore: fakeStore({ records: [], load: async () => {} }),
}));
vi.mock('@adapters/stores/useObservationAttachmentStore', () => ({
  useObservationAttachmentStore: fakeStore({ attachments: [], load: async () => {} }),
}));
// 엑셀 서랍은 엑셀 인프라를 끌고 온다 — 여기서는 보드만 본다.
vi.mock('@adapters/components/RecordDraft/RecordEvidenceImportDrawer', () => ({
  RecordEvidenceImportDrawer: () => <div data-testid="import-drawer" />,
}));

import { RecordEvidenceBoard } from '../RecordEvidenceBoard';
import { useAssistStore } from '@adapters/stores/useAssistStore';
import { useOwnAiStatusStore } from '@adapters/stores/useOwnAiStatusStore';
import { THREAD_SUGGEST_FAILURE_LABELS } from '@domain/rules/threadSuggestionParser';
import type { OwnAiConnection } from '@domain/entities/OwnAiProvider';

const STUDENTS = [
  { studentRef: 'sA', number: 1, name: '김지훈', studentKey: '1' },
  { studentRef: 'sB', number: 2, name: '박서연', studentKey: '2' },
];

const runCalls: { prompt: string }[] = [];
let eventHandler: ((e: unknown) => void) | null = null;
let lastRunId = '';

function board(selected: string | null = 'sA') {
  return render(
    <RecordEvidenceBoard
      context="teaching"
      level="high"
      students={STUDENTS}
      classId="c1"
      selectedStudentRef={selected}
      onSelectStudent={() => {}}
      initialArea={null}
    />,
  );
}

function column(name: string) {
  return within(screen.getByRole('region', { name: `${name} 열` }));
}

function connectClaude(): void {
  const c: OwnAiConnection = {
    provider: 'claude',
    state: 'connected',
    version: '2.1.258',
    model: '',
  };
  useAssistStore.setState({ ownAiEnabled: true, provider: 'claude' });
  useOwnAiStatusStore.setState({ connections: { claude: c, codex: null } });
}

async function finishWith(text: string): Promise<void> {
  await act(async () => {
    eventHandler?.({ type: 'done', runId: lastRunId, text });
  });
}

beforeEach(() => {
  moveToThreadSpy.mockClear();
  moveToNewThreadSpy.mockClear();
  unclassifySpy.mockClear();
  addSpy.mockClear();
  addManySpy.mockClear();
  setThreadSpy.mockClear();
  removeSpy.mockClear();
  updateThreadSpy.mockClear();
  setExcludedSpy.mockClear();
  setExcludedManySpy.mockClear();
  runCalls.length = 0;
  eventHandler = null;
  lastRunId = '';
  (globalThis as { electronAPI?: unknown }).electronAPI = {
    ownAi: {
      run: async (p: { prompt: string; runId: string }) => {
        runCalls.push({ prompt: p.prompt });
        lastRunId = p.runId;
        return { ok: true };
      },
      onEvent: (fn: (e: unknown) => void) => {
        eventHandler = fn;
        return () => {
          eventHandler = null;
        };
      },
    },
  };
  useAssistStore.setState({ ownAiEnabled: false, provider: 'ssampin' });
  useOwnAiStatusStore.setState({ connections: { claude: null, codex: null } });
});

afterEach(() => {
  cleanup();
  delete (globalThis as { electronAPI?: unknown }).electronAPI;
});

describe('열과 카드', () => {
  it('미분류 · 이 학생의 주제 · 새 주제 열이 있고, 남의 학생 주제·근거는 보이지 않는다', () => {
    board();
    expect(column('미분류').getByText(/미분류 근거 하나/)).toBeTruthy();
    expect(column('할인 문구와 선택').getByText(/주제에 묶임/)).toBeTruthy();
    expect(screen.getByRole('region', { name: '새 주제 열' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: '세포 관찰 열' })).toBeNull();
    expect(screen.queryByText('B학생 미분류 근거')).toBeNull();
  });
});

describe('카드 선택 → 하단 바 → 저장 관문', () => {
  it('카드를 고르면 하단 바가 뜨고, 주제 단추를 누르면 그 학생·그 근거 id 로 moveToThread 가 1회 불린다', async () => {
    board();
    expect(screen.queryByRole('toolbar', { name: '선택한 근거 보내기' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /미분류 근거 하나/ }));
    const bar = within(screen.getByRole('toolbar', { name: '선택한 근거 보내기' }));
    expect(bar.getByText('선택 1건 →')).toBeTruthy();
    await act(async () => {
      fireEvent.click(bar.getByRole('button', { name: '할인 문구와 선택' }));
    });
    expect(moveToThreadSpy).toHaveBeenCalledTimes(1);
    expect(moveToThreadSpy).toHaveBeenCalledWith({
      studentRef: 'sA',
      evidenceIds: ['e-A2'],
      threadId: 'thr-A',
    });
    expect(screen.getByRole('status', { name: '알림' }).textContent).toContain(
      '1건을 ‘할인 문구와 선택’로 보냈습니다',
    );
    expect(screen.queryByRole('toolbar', { name: '선택한 근거 보내기' })).toBeNull();
  });

  it('★남의 학생 근거가 skippedIds 로 돌아오면 "이 학생 근거가 아니라 묶지 않았습니다" 를 말한다', async () => {
    moveToThreadSpy.mockImplementationOnce(async () => ({
      movedIds: ['e-A2'],
      skippedIds: ['e-B1'],
    }));
    board();
    fireEvent.click(screen.getByRole('button', { name: /미분류 근거 하나/ }));
    await act(async () => {
      fireEvent.click(
        within(screen.getByRole('toolbar', { name: '선택한 근거 보내기' })).getByRole('button', {
          name: '할인 문구와 선택',
        }),
      );
    });
    expect(screen.getByRole('status', { name: '알림' }).textContent).toContain(
      '1건은 이 학생 근거가 아니라 묶지 않았습니다',
    );
  });

  it('[미분류로] 는 unclassify 를, [+ 새 주제로] 뒤 이름 입력은 moveToNewThread 를 부른다', async () => {
    board();
    fireEvent.click(screen.getByRole('button', { name: /주제에 묶임/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '미분류로' }));
    });
    expect(unclassifySpy).toHaveBeenCalledWith({ studentRef: 'sA', evidenceIds: ['e-A1'] });

    fireEvent.click(screen.getByRole('button', { name: /미분류 근거 둘/ }));
    fireEvent.click(screen.getByRole('button', { name: '+ 새 주제로' }));
    fireEvent.change(screen.getByLabelText('새 주제 이름'), {
      target: { value: '새로 만든 주제' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '만들기' }));
    });
    expect(moveToNewThreadSpy).toHaveBeenCalledTimes(1);
    expect(moveToNewThreadSpy.mock.calls[0]?.[0]).toMatchObject({
      studentRef: 'sA',
      evidenceIds: ['e-A3'],
      title: '새로 만든 주제',
    });
  });
});

describe('★학생이 바뀌면 선택·제안이 비고 하단 바가 사라진다', () => {
  it('sA 에서 고른 카드와 AI 제안이 sB 로 넘어가지 않는다', async () => {
    connectClaude();
    const { rerender } = board('sA');
    fireEvent.click(screen.getByRole('button', { name: /미분류 근거 하나/ }));
    expect(screen.getByRole('toolbar', { name: '선택한 근거 보내기' })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /AI 분류 제안/ }));
    });
    await finishWith('할인 문구와 선택 | 1');
    expect(screen.getByLabelText('AI 제안 1건')).toBeTruthy();

    rerender(
      <RecordEvidenceBoard
        context="teaching"
        level="high"
        students={STUDENTS}
        classId="c1"
        selectedStudentRef="sB"
        onSelectStudent={() => {}}
        initialArea={null}
      />,
    );
    expect(screen.queryByRole('toolbar', { name: '선택한 근거 보내기' })).toBeNull();
    expect(screen.queryByLabelText(/AI 제안 \d+건/)).toBeNull();
    expect(screen.getByText('B학생 미분류 근거')).toBeTruthy();
    expect(moveToThreadSpy).not.toHaveBeenCalled();
  });
});

describe('AI 분류 제안', () => {
  it('구독 AI 가 연결돼 있지 않으면 단추가 없다', () => {
    board();
    expect(screen.queryByRole('button', { name: /AI 분류 제안/ })).toBeNull();
  });

  it('★고스트 카드는 적용 전 저장 0회, [이 열 적용] 뒤 moveToThread 1회', async () => {
    connectClaude();
    board();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /AI 분류 제안/ }));
    });
    expect(runCalls).toHaveLength(1);
    expect(screen.getByRole('status', { name: 'AI 분류 제안 안내' }).textContent).toContain(
      '읽고 있습니다',
    );
    await finishWith('할인 문구와 선택 | 1\n새 탐구 | 2');

    const ghostA = within(column('할인 문구와 선택').getByLabelText('AI 제안 1건'));
    expect(ghostA.getByText(/미분류 근거 하나/)).toBeTruthy();
    expect(screen.getByRole('region', { name: '새 탐구 제안 열' })).toBeTruthy();
    expect(moveToThreadSpy).not.toHaveBeenCalled();
    expect(moveToNewThreadSpy).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(ghostA.getByRole('button', { name: '이 열 적용' }));
    });
    expect(moveToThreadSpy).toHaveBeenCalledTimes(1);
    expect(moveToThreadSpy).toHaveBeenCalledWith({
      studentRef: 'sA',
      evidenceIds: ['e-A2'],
      threadId: 'thr-A',
    });
    expect(moveToNewThreadSpy).not.toHaveBeenCalled();
  });

  it('파서가 못 읽으면 안내 문구만 보이고 고스트 카드는 0개', async () => {
    connectClaude();
    board();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /AI 분류 제안/ }));
    });
    await finishWith('할인 문구와 선택: 1, 2 로 묶으면 좋겠습니다.');
    expect(screen.getByRole('status', { name: 'AI 분류 제안 안내' }).textContent).toContain(
      THREAD_SUGGEST_FAILURE_LABELS['no-format'],
    );
    expect(screen.queryByLabelText(/AI 제안 \d+건/)).toBeNull();
    expect(moveToThreadSpy).not.toHaveBeenCalled();
  });

  it('★`없음 | 이유` 이면 이유와 다음 행동, [다시 제안 받기]가 보이고 저장은 0회다', async () => {
    connectClaude();
    board();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /AI 분류 제안/ }));
    });
    await finishWith('없음 | ［이름1］의 기록이 서로 다른 활동이라 한 주제로 묶이지 않습니다');
    const notice = screen.getByRole('status', { name: 'AI 분류 제안 안내' }).textContent ?? '';
    expect(notice).toContain(
      'AI 판단: 김지훈의 기록이 서로 다른 활동이라 한 주제로 묶이지 않습니다',
    );
    expect(notice).toContain('카드를 끌어 주제로 옮기거나');
    expect(screen.queryByLabelText(/AI 제안 \d+건/)).toBeNull();
    expect(moveToThreadSpy).not.toHaveBeenCalled();
    expect(addSpy).not.toHaveBeenCalled();
    // [다시 제안 받기] — 한 번 더 묻는다.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '다시 제안 받기' }));
    });
    expect(runCalls).toHaveLength(2);
  });

  it('못 읽은 답은 [답 원문 보기]로 별칭 상태 그대로 볼 수 있다 — 실명은 없다', async () => {
    connectClaude();
    board();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /AI 분류 제안/ }));
    });
    await finishWith('［이름1］ 학생은 1, 2 를 묶으면 좋겠습니다.');
    expect(screen.queryByLabelText('AI 답 원문')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '답 원문 보기' }));
    const raw = screen.getByLabelText('AI 답 원문').textContent ?? '';
    expect(raw).toContain('［이름1］ 학생은 1, 2');
    expect(raw).not.toContain('김지훈');
  });

  it('★거울도 제안 입력에 들어가고(출처·태그 포함) — 제안을 받아도 적용 전 저장 0회, 적용하면 add(threadId) 1회', async () => {
    connectClaude();
    board();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /AI 분류 제안/ }));
    });
    const prompt = runCalls[0]?.prompt ?? '';
    expect(prompt).toContain('아직 안 넣은 관찰 하나');
    expect(prompt).toContain('(6/18, 관찰기록, 태그: 개념 설명)');
    expect(prompt).toContain('기록이 하나뿐이어도');
    // 저장 미분류(e-A2, e-A3, e-A6)이 1·2·3번, 거울이 4번. AI 제외 카드(e-A4·e-A5)는 번호를 받지 않는다.
    expect(prompt).not.toContain('학원에서 미리 배운');
    expect(prompt).not.toContain('직접 제외한 근거');
    expect(prompt).toContain('4. (6/18, 관찰기록, 태그: 개념 설명) 아직 안 넣은 관찰 하나');
    await finishWith('할인 문구와 선택 | 4');
    const ghost = within(column('할인 문구와 선택').getByLabelText('AI 제안 1건'));
    expect(ghost.getByText(/아직 안 넣은 관찰 하나/)).toBeTruthy();
    expect(addSpy).not.toHaveBeenCalled();
    expect(addManySpy).not.toHaveBeenCalled();
    expect(moveToThreadSpy).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(ghost.getByRole('button', { name: '이 열 적용' }));
    });
    expect(addSpy).toHaveBeenCalledTimes(1);
    expect(addSpy.mock.calls[0]?.[0]).toMatchObject({ sourceId: 'obs-A-1', threadId: 'thr-A' });
    expect(moveToThreadSpy).not.toHaveBeenCalled();
  });

  it('★제안 요청문에 학생 실명이 0건이다 — 이 학생도, 근거 안의 다른 학생도', async () => {
    connectClaude();
    board();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /AI 분류 제안/ }));
    });
    const prompt = runCalls[0]?.prompt ?? '';
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).not.toContain('김지훈');
    expect(prompt).not.toContain('박서연');
    expect(prompt).toContain('［이름');
    // 미분류만 보낸다 — 이미 주제에 묶인 근거는 싣지 않는다.
    expect(prompt).not.toContain('주제에 묶임');
  });
});

describe('유리 모드 대비 — 서랍은 body 에 붙고 불투명 표시를 단다', () => {
  it('[줄기 보기] 로 주제 서랍이 열리면 document.body 직속 포털 안에 [data-sp-floating] 대화상자가 있다', () => {
    const { container } = board();
    fireEvent.click(column('할인 문구와 선택').getByRole('button', { name: '줄기 보기' }));
    // 제목(h3)이 aria-labelledby 로 연결된다 — 이름에 학생 이름 보조 문구가 따라붙는다.
    const dialog = screen.getByRole('dialog', { name: /^할인 문구와 선택/ });
    expect(dialog.getAttribute('data-sp-floating')).not.toBeNull();
    expect(dialog.className).toContain('bg-sp-card');
    // 보드 안이 아니라 body 직속 포털 안에 있다.
    expect(container.contains(dialog)).toBe(false);
    const portalRoot = Array.from(document.body.children).find((el) => el.contains(dialog));
    expect(portalRoot).toBeTruthy();
    expect(portalRoot?.querySelector('[data-sp-floating]')).toBe(dialog);
  });

  it('열 머리에는 [주제 삭제]가 없다 — 파괴 동작은 서랍 안에만 있다', () => {
    board();
    expect(column('할인 문구와 선택').queryByRole('button', { name: '주제 삭제' })).toBeNull();
    fireEvent.click(column('할인 문구와 선택').getByRole('button', { name: '줄기 보기' }));
    expect(
      within(screen.getByRole('dialog', { name: /^할인 문구와 선택/ })).getByRole('button', {
        name: '주제 삭제',
      }),
    ).toBeTruthy();
  });
});

describe('2차 — 긴 주제 이름 · 영역 1개 · 삭제 되돌리기 (설계서 §4-2, §5-a·b)', () => {
  const LONG = '소비 선택과 준거점 편향을 다룬 사회문제 탐구 프로젝트'; // 30자

  it('30자 주제 이름이 열 머리에 잘리지 않고 두 줄로 다 렌더된다(truncate 아님)', () => {
    expect(LONG).toHaveLength(30);
    THREADS[0]!.title = LONG;
    try {
      board();
      const h = column(LONG).getByRole('heading', { level: 4 });
      expect(h.textContent).toBe(LONG);
      expect(h.className).toContain('line-clamp-2');
      expect(h.className).not.toContain('truncate');
      // 하단 바 단추는 한 줄로 자르되 전체 이름은 title 로 남는다.
      fireEvent.click(screen.getByRole('button', { name: /미분류 근거 하나/ }));
      const barBtn = within(screen.getByRole('toolbar', { name: '선택한 근거 보내기' })).getByRole(
        'button',
        {
          name: LONG,
        },
      );
      expect(barBtn.getAttribute('title')).toBe(LONG);
    } finally {
      THREADS[0]!.title = '할인 문구와 선택';
    }
  });

  it('열 머리 제목을 두 번 클릭하면 그 자리에서 고치고 Enter 로 확정한다 — 빈 값은 바꾸지 않는다', () => {
    board();
    const h = column('할인 문구와 선택').getByRole('heading', { level: 4 });
    fireEvent.doubleClick(h);
    const input = screen.getByLabelText('주제 이름');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(updateThreadSpy).not.toHaveBeenCalled();
    fireEvent.doubleClick(column('할인 문구와 선택').getByRole('heading', { level: 4 }));
    const again = screen.getByLabelText('주제 이름');
    fireEvent.change(again, { target: { value: '새 이름' } });
    fireEvent.keyDown(again, { key: 'Enter' });
    expect(updateThreadSpy).toHaveBeenCalledWith('thr-A', { title: '새 이름' });
  });

  it('영역이 1개인 컨텍스트(초등 교과)에서는 영역 필터 줄과 카드의 영역 칩이 0개다', () => {
    render(
      <RecordEvidenceBoard
        context="teaching"
        level="elementary"
        students={STUDENTS}
        classId="c1"
        selectedStudentRef="sA"
        onSelectStudent={() => {}}
        initialArea={null}
      />,
    );
    expect(screen.queryByRole('group', { name: '영역 필터' })).toBeNull();
    // 초등 교과의 유일한 영역 이름은 칩으로 어디에도 안 뜨고, 직접 입력 폼에도 유형 줄이 없다.
    expect(
      screen.queryAllByRole('button', { name: '교과학습발달상황', pressed: true }),
    ).toHaveLength(0);
    expect(
      screen.queryAllByRole('button', { name: '교과학습발달상황', pressed: false }),
    ).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: /근거 직접 입력/ }));
    expect(screen.queryByText('유형')).toBeNull();
  });

  it('★영역이 1개면 다른 영역으로 분류된 근거도 숨기지 않는다(끌 수 없는 필터가 걸리면 주제 열이 0건이 된다)', () => {
    // 실사고: 초등 교과(영역 1개)에서 초안 화면이 `initialArea` 를 넘기면 필터가 걸린 채 줄이 안 그려져
    // 'subject' 로 분류된 근거 전부가 사라졌다(주제 열 0건). 영역이 1개면 필터를 걸지 않는다.
    render(
      <RecordEvidenceBoard
        context="teaching"
        level="elementary"
        students={STUDENTS}
        classId="c1"
        selectedStudentRef="sA"
        onSelectStudent={() => {}}
        initialArea="subjectDev"
      />,
    );
    expect(screen.queryByRole('group', { name: '영역 필터' })).toBeNull();
    // 주제에 묶인 'subject' 근거가 그대로 보인다.
    expect(column('할인 문구와 선택').getByText(/기회비용 근거/)).toBeTruthy();
    // 미분류의 'subject' 근거도 그대로 보인다.
    expect(column('미분류').getByText(/미분류 근거 둘/)).toBeTruthy();
  });

  it('카드 [삭제] 뒤 토스트의 [되돌리기]를 누르면 같은 내용으로 add 가 1회 불린다', async () => {
    board();
    const card = screen.getByRole('button', { name: /미분류 근거 하나/ });
    await act(async () => {
      fireEvent.click(within(card).getByRole('button', { name: '삭제' }));
    });
    expect(removeSpy).toHaveBeenCalledWith('e-A2');
    expect(addSpy).not.toHaveBeenCalled();
    const toast = screen.getByRole('status', { name: '알림' });
    expect(toast.textContent).toContain('지웠습니다');
    await act(async () => {
      fireEvent.click(within(toast).getByRole('button', { name: '되돌리기' }));
    });
    expect(addSpy).toHaveBeenCalledTimes(1);
    expect(addSpy.mock.calls[0]?.[0]).toMatchObject({
      studentRef: 'sA',
      areas: ['subject'],
      content: 'A학생 미분류 근거 하나 — 박서연과 모둠에서 비교했다',
      sourceType: 'manual',
    });
  });
});

describe('3차 — AI 제외를 카드에서 바로, 여러 장 한 번에 (설계서 §4-5)', () => {
  it('카드의 [AI 제외] 토글은 겉에 있고, 누르면 setExcludedFromAi 1회 — ★카드 선택 상태는 바뀌지 않는다', async () => {
    board();
    const card = screen.getByRole('button', { name: /미분류 근거 하나/ });
    expect(within(card).queryByRole('button', { name: '더 보기' })).toBeNull();
    const toggle = within(card).getByRole('button', { name: 'AI 제외' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    await act(async () => {
      fireEvent.click(toggle);
    });
    expect(setExcludedSpy).toHaveBeenCalledTimes(1);
    expect(setExcludedSpy).toHaveBeenCalledWith('e-A2', true);
    expect(card.getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByRole('toolbar', { name: '선택한 근거 보내기' })).toBeNull();
  });

  it('2건 선택 후 하단 바 [AI 제외] → setExcludedFromAiMany 1회(저장 1회), [AI 제외 해제]도 같다', async () => {
    board();
    fireEvent.click(screen.getByRole('button', { name: /미분류 근거 하나/ }));
    fireEvent.click(screen.getByRole('button', { name: /미분류 근거 둘/ }));
    const bar = within(screen.getByRole('toolbar', { name: '선택한 근거 보내기' }));
    await act(async () => {
      fireEvent.click(bar.getByRole('button', { name: 'AI 제외' }));
    });
    expect(setExcludedManySpy).toHaveBeenCalledTimes(1);
    expect(setExcludedManySpy).toHaveBeenCalledWith(['e-A2', 'e-A3'], true);
    expect(setExcludedSpy).not.toHaveBeenCalled();
    expect(screen.getByRole('status', { name: '알림' }).textContent).toContain(
      '2건을 AI 제외로 바꿨습니다',
    );
    await act(async () => {
      fireEvent.click(bar.getByRole('button', { name: 'AI 제외 해제' }));
    });
    expect(setExcludedManySpy).toHaveBeenCalledWith(['e-A2', 'e-A3'], false);
  });

  it('이유 줄은 금지 어휘로 자동 제외된 카드에만 보이고, 메타 줄의 "AI 제외" 배지는 없다', () => {
    board();
    const auto = screen.getByRole('button', { name: /학원에서 미리 배운/ });
    expect(within(auto).getByText(/언급이 있어 자동으로 제외했습니다/).textContent).toContain(
      '학원',
    );
    expect(within(auto).getByRole('button', { name: 'AI 제외' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    // 토글 하나뿐 — 같은 말을 하는 배지(span)는 없다.
    expect(within(auto).queryByText('AI 제외', { selector: 'span' })).toBeNull();
    expect(within(auto).getAllByRole('button', { name: 'AI 제외' })).toHaveLength(1);

    const manual = screen.getByRole('button', { name: /직접 제외한 근거/ });
    expect(
      within(manual).getByRole('button', { name: 'AI 제외' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(within(manual).queryByText(/자동으로 제외했습니다/)).toBeNull();

    const clean = screen.getByRole('button', { name: /미분류 근거 하나/ });
    expect(within(clean).queryByText(/자동으로 제외했습니다/)).toBeNull();
  });
});

describe('★거울 카드 — 보기만 해서는 저장 0회, 첫 손댄에 저장 (설계서 §4-1, ADR-085 보강 2 R1)', () => {
  it('보드를 열고 아무것도 누르지 않으면 add·addMany·setThread 호출이 0회다', () => {
    board();
    // 거울은 화면에는 있다 — 가져오기를 누르지 않았는데도 미분류에 보인다.
    const mirror = column('미분류').getByRole('button', { name: /아직 안 넣은 관찰 하나/ });
    expect(mirror.getAttribute('data-mirror')).not.toBeNull();
    expect(mirror.className).toContain('bg-sp-surface');
    expect(within(mirror).getByText('관찰기록')).toBeTruthy();
    expect(within(mirror).queryByRole('button', { name: '삭제' })).toBeNull();
    // 저장 카드는 그대로 bg-sp-card.
    const saved = column('미분류').getByRole('button', { name: /미분류 근거 하나/ });
    expect(saved.getAttribute('data-mirror')).toBeNull();
    expect(saved.className).toContain('bg-sp-card');

    expect(addSpy).not.toHaveBeenCalled();
    expect(addManySpy).not.toHaveBeenCalled();
    expect(setThreadSpy).not.toHaveBeenCalled();
    expect(moveToThreadSpy).not.toHaveBeenCalled();
  });

  it('★거울을 주제로 보내면 add 1회이고 그 인자에 threadId 가 있다 — 관문(moveToThread)은 거울에 부르지 않는다', async () => {
    board();
    fireEvent.click(column('미분류').getByRole('button', { name: /아직 안 넣은 관찰 하나/ }));
    const bar = within(screen.getByRole('toolbar', { name: '선택한 근거 보내기' }));
    await act(async () => {
      fireEvent.click(bar.getByRole('button', { name: '할인 문구와 선택' }));
    });
    expect(addSpy).toHaveBeenCalledTimes(1);
    expect(addSpy.mock.calls[0]?.[0]).toMatchObject({
      studentRef: 'sA',
      threadId: 'thr-A',
      sourceType: 'observation',
      sourceId: 'obs-A-1',
      content: '아직 안 넣은 관찰 하나',
      date: '2026-06-18',
      classId: 'c1',
    });
    expect(addManySpy).not.toHaveBeenCalled();
    expect(moveToThreadSpy).not.toHaveBeenCalled();
    expect(screen.getByRole('status', { name: '알림' }).textContent).toContain(
      '1건을 ‘할인 문구와 선택’로 보냈습니다',
    );
  });

  it('거울과 저장 카드를 같이 고르면 거울은 add(threadId), 저장 카드는 moveToThread 로 간다', async () => {
    board();
    fireEvent.click(column('미분류').getByRole('button', { name: /아직 안 넣은 관찰 하나/ }));
    fireEvent.click(column('미분류').getByRole('button', { name: /미분류 근거 하나/ }));
    const bar = within(screen.getByRole('toolbar', { name: '선택한 근거 보내기' }));
    await act(async () => {
      fireEvent.click(bar.getByRole('button', { name: '할인 문구와 선택' }));
    });
    expect(addSpy).toHaveBeenCalledTimes(1);
    expect(addSpy.mock.calls[0]?.[0]).toMatchObject({ threadId: 'thr-A', sourceId: 'obs-A-1' });
    expect(moveToThreadSpy).toHaveBeenCalledWith({
      studentRef: 'sA',
      evidenceIds: ['e-A2'],
      threadId: 'thr-A',
    });
    expect(screen.getByRole('status', { name: '알림' }).textContent).toContain('2건을');
  });

  it('★남의 학생 원본은 거울로 뜨지 않는다', () => {
    board('sA');
    expect(screen.queryByText('B학생의 관찰 원본')).toBeNull();
  });

  it('★이미 근거로 넣은 원본은 거울로 중복되지 않는다 — 저장 카드 한 장만 있다', () => {
    board();
    const cards = screen.getAllByRole('button', { name: /이미 넣은 관찰/ });
    expect(cards).toHaveLength(1);
    expect(cards[0]?.getAttribute('data-mirror')).toBeNull();
  });

  it('거울의 [AI 제외]를 켜면 add 1회에 excludedFromAi 가 실린다', async () => {
    board();
    const mirror = column('미분류').getByRole('button', { name: /아직 안 넣은 관찰 하나/ });
    await act(async () => {
      fireEvent.click(within(mirror).getByRole('button', { name: 'AI 제외' }));
    });
    expect(addSpy).toHaveBeenCalledTimes(1);
    expect(addSpy.mock.calls[0]?.[0]).toMatchObject({ sourceId: 'obs-A-1', excludedFromAi: true });
    expect(setExcludedSpy).not.toHaveBeenCalled();
  });

  it('가져오기 메뉴는 [엑셀 ▾] 둘(양식 받기·업로드)뿐이다 — 출처 5종 메뉴는 없다', () => {
    board();
    fireEvent.click(screen.getByRole('button', { name: /엑셀/ }));
    const menu = within(screen.getByRole('menu', { name: '엑셀' }));
    expect(menu.getAllByRole('menuitem').map((m) => m.textContent)).toEqual([
      expect.stringContaining('엑셀 양식 받기'),
      expect.stringContaining('엑셀 업로드'),
    ]);
    expect(screen.queryByRole('menuitem', { name: /관찰 기록/ })).toBeNull();
  });
});

describe('★끌어다 놓기 — 하단 바와 같은 관문, 입구만 둘 (설계서 §4-4, ADR-085 보강 2 R3)', () => {
  /** 보드가 DndContext 에 넘긴 실제 onDragStart/onDragEnd 를 부른다. */
  async function drop(activeId: string, overId: string | null): Promise<void> {
    await act(async () => {
      dnd.onDragStart?.({ active: { id: activeId } });
    });
    await act(async () => {
      dnd.onDragEnd?.({ active: { id: activeId }, over: overId === null ? null : { id: overId } });
    });
  }

  it('열린 주제 열에 놓으면 저장 카드는 moveToThread 1회, 거울은 add 1회(threadId 포함)', async () => {
    board();
    await drop('e-A2', 'drop:thread:thr-A');
    expect(moveToThreadSpy).toHaveBeenCalledTimes(1);
    expect(moveToThreadSpy).toHaveBeenCalledWith({
      studentRef: 'sA',
      evidenceIds: ['e-A2'],
      threadId: 'thr-A',
    });
    expect(screen.getByRole('status', { name: '알림' }).textContent).toContain(
      '1건을 ‘할인 문구와 선택’로 보냈습니다',
    );

    await drop('mirror:obs-A-1', 'drop:thread:thr-A');
    expect(addSpy).toHaveBeenCalledTimes(1);
    expect(addSpy.mock.calls[0]?.[0]).toMatchObject({ sourceId: 'obs-A-1', threadId: 'thr-A' });
    expect(moveToThreadSpy).toHaveBeenCalledTimes(1); // 거울에는 관문을 부르지 않는다
  });

  it('★닫힌 주제 열에 놓으면 저장 0회 — 저장 카드도 거울도', async () => {
    board();
    expect(screen.getByRole('region', { name: '닫힌 주제 열' })).toBeTruthy();
    await drop('e-A2', 'drop:thread:thr-C');
    await drop('mirror:obs-A-1', 'drop:thread:thr-C');
    await drop('e-A2', null); // 허공에 놓음
    expect(moveToThreadSpy).not.toHaveBeenCalled();
    expect(moveToNewThreadSpy).not.toHaveBeenCalled();
    expect(unclassifySpy).not.toHaveBeenCalled();
    expect(addSpy).not.toHaveBeenCalled();
    expect(addManySpy).not.toHaveBeenCalled();
  });

  it('선택된 카드를 끌면 선택 전체가 간다 · 선택 안 된 카드를 끌면 그 1장만 가고 선택은 그대로다', async () => {
    board();
    fireEvent.click(screen.getByRole('button', { name: /미분류 근거 하나/ }));
    fireEvent.click(screen.getByRole('button', { name: /미분류 근거 둘/ }));
    // 선택 안 된 주제 안 카드(e-A1)를 미분류로 끌면 그 1장만.
    await drop('e-A1', 'drop:unclassified');
    expect(unclassifySpy).toHaveBeenCalledTimes(1);
    expect(unclassifySpy).toHaveBeenCalledWith({ studentRef: 'sA', evidenceIds: ['e-A1'] });
    expect(
      within(screen.getByRole('toolbar', { name: '선택한 근거 보내기' })).getByText('선택 2건 →'),
    ).toBeTruthy();
    // 선택된 카드(e-A2)를 끌면 선택 전체(e-A2·e-A3)가 간다.
    await drop('e-A2', 'drop:thread:thr-A');
    expect(moveToThreadSpy).toHaveBeenCalledTimes(1);
    expect(moveToThreadSpy).toHaveBeenCalledWith({
      studentRef: 'sA',
      evidenceIds: ['e-A2', 'e-A3'],
      threadId: 'thr-A',
    });
    expect(screen.queryByRole('toolbar', { name: '선택한 근거 보내기' })).toBeNull();
  });

  it('[+ 새 주제] 칸에 놓으면 이름 팽오버가 열리고, 확정하면 끌린 카드로 moveToNewThread', async () => {
    board();
    await drop('e-A3', 'drop:new');
    fireEvent.change(screen.getByLabelText('새 주제 이름'), {
      target: { value: '끌어서 만든 주제' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '만들기' }));
    });
    expect(moveToNewThreadSpy).toHaveBeenCalledTimes(1);
    expect(moveToNewThreadSpy.mock.calls[0]?.[0]).toMatchObject({
      studentRef: 'sA',
      evidenceIds: ['e-A3'],
      title: '끌어서 만든 주제',
    });
  });

  it('기존 클릭 선택과 Enter/Space 선택이 그대로 동작한다 — 끌 수 있게 됐어도 키보드 경로는 변함없다', () => {
    board();
    const card = screen.getByRole('button', { name: /미분류 근거 하나/ });
    expect(card.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(card);
    expect(card.getAttribute('aria-pressed')).toBe('true');
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(card.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(card, { key: ' ' });
    expect(card.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('toolbar', { name: '선택한 근거 보내기' })).toBeTruthy();
    expect(moveToThreadSpy).not.toHaveBeenCalled();
  });
});
