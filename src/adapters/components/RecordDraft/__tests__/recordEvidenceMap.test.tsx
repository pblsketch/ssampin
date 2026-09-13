/**
 * @vitest-environment jsdom
 *
 * 근거 정리의 **지도 보기** 배선(ADR-106) — 보드가 지도에 자료·동작을 넘기는 자리.
 *
 * 여기서 지키는 것:
 *  - 설정이 비어 있으면 지도로 열리고, 상단 작업 단추는 [+ 근거 ▾] · [AI로 정리 제안 ▾] · [… 초안 쓰기] 셋뿐이다(강조 하나).
 *  - 카드 둘을 고르면 하단 바에 [연결하기]가 뜨고, 누르면 **저장 관문 하나**(`linkEvidence`)를 부른다. 이을 수 없으면 사유를 말한다.
 *  - 이은 뒤 오른쪽 보조 공간에 연결(이음말 칸)이 열린다. 카드를 누르면 같은 공간에 상세가 든다(교대).
 *  - [고른 근거 N건으로 초안 쓰기]는 고른 id 를 그대로 넘긴다. 고른 것이 없으면 전체(`all`).
 *  - 같은 묶음 안에 놓으면 저장 0회(자리 밀기)이고, 다른 주제에 놓으면 예전처럼 옮긴다.
 *  - 학생이 바뀌면 상세·연결 선택이 비워진다.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import type { RecordEvidence } from '@domain/entities/RecordEvidence';
import type { InquiryThread } from '@domain/entities/InquiryThread';

const H = vi.hoisted(() => {
  function fakeStore<T extends object>(state: T) {
    const use = (sel?: (s: T) => unknown) => (sel ? sel(state) : state);
    (use as unknown as { getState: () => T }).getState = () => state;
    (use as unknown as { setState: (p: unknown) => void }).setState = () => {};
    return use;
  }
  const evidence: RecordEvidence[] = [
    {
      id: 'e1',
      studentRef: 'sA',
      content: '쿠폰 질문을 했다',
      areas: [],
      threadId: 'thr-1',
      date: '2026-05-01',
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 'e2',
      studentRef: 'sA',
      content: '할인 표를 만들었다',
      areas: [],
      threadId: 'thr-1',
      date: '2026-05-02',
      createdAt: 2,
      updatedAt: 2,
      links: [{ toId: 'e3', note: '뒷받침' }],
    },
    {
      id: 'e3',
      studentRef: 'sA',
      content: '보고서를 썼다',
      areas: [],
      threadId: 'thr-1',
      date: '2026-05-03',
      createdAt: 3,
      updatedAt: 3,
    },
    {
      id: 'e4',
      studentRef: 'sA',
      content: '아직 어디에도 안 엮인 근거',
      areas: [],
      date: '2026-05-04',
      createdAt: 4,
      updatedAt: 4,
    },
    {
      id: 'eB',
      studentRef: 'sB',
      content: '다른 학생 근거',
      areas: [],
      createdAt: 5,
      updatedAt: 5,
    },
  ];
  const threads: InquiryThread[] = [
    {
      id: 'thr-1',
      studentRef: 'sA',
      title: '할인 문구와 선택',
      keywords: [],
      status: 'open',
      createdAt: 1,
      updatedAt: 1,
    },
  ];
  return {
    fakeStore,
    evidence,
    threads,
    /** 실제 스토어처럼 저장이 끝나면 목록에 연결이 보이게 한다(패널은 살아 있는 연결만 연다). */
    linkEvidence: vi.fn(async (from: string, to: string): Promise<string | null> => {
      H.evidence = H.evidence.map((r) =>
        r.id === from ? { ...r, links: [...(r.links ?? []), { toId: to }] } : r,
      );
      return null;
    }),
    unlinkEvidence: vi.fn(async () => {}),
    setEvidenceLinkNote: vi.fn(async () => {}),
    reverseEvidenceLink: vi.fn(async (from: string, to: string): Promise<string | null> => {
      const link = H.evidence.find((r) => r.id === from)?.links?.find((l) => l.toId === to);
      H.evidence = H.evidence.map((r) => {
        if (r.id === from) return { ...r, links: (r.links ?? []).filter((l) => l.toId !== to) };
        if (r.id === to && link !== undefined)
          return { ...r, links: [...(r.links ?? []), { ...link, toId: from }] };
        return r;
      });
      return null;
    }),
    moveToThread: vi.fn(async () => ({ movedIds: ['e4'], skippedIds: [] })),
    placeEvidenceInScene: vi.fn(async (input: { evidenceIds: readonly string[] }) => ({
      placedIds: [...input.evidenceIds],
      skippedIds: [] as string[],
    })),
    detachFromScenes: vi.fn(async () => {}),
    detachEvidenceFromScene: vi.fn(async () => {}),
    setLink: vi.fn(async () => {}),
    setSceneNote: vi.fn(async () => {}),
    setSceneLeadIn: vi.fn(async () => {}),
    addScene: vi.fn(async () => 'sc-new'),
    moveScene: vi.fn(async () => {}),
    removeScene: vi.fn(async () => {}),
    settingsUpdate: vi.fn(async () => {}),
    settings: { recordScaffoldMigratedAt: 1 } as Record<string, unknown>,
  };
});

const dnd = vi.hoisted(() => ({ onDragEnd: null as ((e: unknown) => void) | null }));
vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>();
  const Real = actual.DndContext;
  return {
    ...actual,
    DndContext: (props: Parameters<typeof Real>[0]) => {
      dnd.onDragEnd = (props.onDragEnd as ((e: unknown) => void) | undefined) ?? null;
      return <Real {...props} />;
    },
  };
});

vi.mock('@adapters/di/container', () => ({}));
vi.mock('@adapters/analytics/trackEventSafely', () => ({ trackEventSafely: () => {} }));
vi.mock('@adapters/stores/placeEvidenceInScenes', () => ({
  placeEvidenceInScene: H.placeEvidenceInScene,
  placeEvidenceInScenes: vi.fn(),
  applyNarrativeSuggestion: vi.fn(),
}));
vi.mock('@adapters/components/RecordDraft/ownAiRun', () => ({
  runApi: () => ({ run: async () => ({ ok: true }), onEvent: () => () => {} }),
  askOnce: vi.fn(),
}));
vi.mock('@adapters/stores/useRecordEvidenceStore', () => ({
  useRecordEvidenceStore: H.fakeStore({
    get records() {
      return H.evidence;
    },
    loaded: true,
    load: async () => {},
    add: async () => 'x',
    addMany: async () => [],
    update: async () => {},
    remove: async () => {},
    restoreRemoved: async () => {},
    applySourceFields: async () => {},
    setExcludedFromAi: async () => {},
    setExcludedFromAiMany: async () => {},
    setThread: async () => ({ movedIds: [], skippedIds: [] }),
    moveToThread: H.moveToThread,
    moveToNewThread: async () => 'x',
    unclassify: async () => {},
    setNote: async () => {},
    linkEvidence: H.linkEvidence,
    unlinkEvidence: H.unlinkEvidence,
    setEvidenceLinkNote: H.setEvidenceLinkNote,
    reverseEvidenceLink: H.reverseEvidenceLink,
  }),
}));
vi.mock('@adapters/stores/useInquiryThreadStore', () => ({
  useInquiryThreadStore: H.fakeStore({
    get records() {
      return H.threads;
    },
    loaded: true,
    load: async () => {},
    add: async () => 'new',
    update: async () => {},
    remove: async () => {},
    addScene: H.addScene,
    removeScene: H.removeScene,
    moveScene: H.moveScene,
    setSceneNote: H.setSceneNote,
    setSceneLeadIn: H.setSceneLeadIn,
    setSceneCategory: async () => {},
    setLink: H.setLink,
    reorderThreads: async () => {},
    applyScaffold: async () => {},
    restoreScenes: async () => {},
    detachFromScenes: H.detachFromScenes,
    detachEvidenceFromScene: H.detachEvidenceFromScene,
  }),
}));
vi.mock('@adapters/stores/useSettingsStore', () => ({
  useSettingsStore: Object.assign(
    (sel?: (s: unknown) => unknown) => {
      const st = { settings: H.settings, update: H.settingsUpdate };
      return sel ? sel(st) : st;
    },
    {
      getState: () => ({ settings: H.settings, update: H.settingsUpdate }),
      setState: () => {},
    },
  ),
}));
vi.mock('@adapters/stores/useRubricStore', () => ({
  useRubricStore: H.fakeStore({ rubrics: [], gradings: [], load: async () => {} }),
}));
vi.mock('@adapters/stores/useGradeAnalysisStore', () => ({
  useGradeAnalysisStore: H.fakeStore({
    plans: [],
    performanceResults: [],
    semesterResults: [],
    load: async () => {},
  }),
}));
vi.mock('@adapters/stores/useAssignmentStore', () => ({
  useAssignmentStore: H.fakeStore({ assignments: [], submissions: [], load: async () => {} }),
}));
vi.mock('@adapters/stores/useObservationStore', () => ({
  useObservationStore: H.fakeStore({ records: [], load: async () => {} }),
}));
vi.mock('@adapters/stores/useStudentRecordsStore', () => ({
  useStudentRecordsStore: H.fakeStore({ records: [], load: async () => {} }),
}));
vi.mock('@adapters/stores/useObservationAttachmentStore', () => ({
  useObservationAttachmentStore: H.fakeStore({ attachments: [], load: async () => {} }),
}));
vi.mock('@adapters/components/RecordDraft/RecordEvidenceImportDrawer', () => ({
  RecordEvidenceImportDrawer: () => <div data-testid="import-drawer" />,
}));

import { RecordEvidenceBoard } from '../RecordEvidenceBoard';
import { useAssistStore } from '@adapters/stores/useAssistStore';
import { useOwnAiStatusStore } from '@adapters/stores/useOwnAiStatusStore';
import { threadDropId, UNCLASSIFIED_DROP_ID } from '../EvidenceColumn';

const STUDENTS = [
  { studentRef: 'sA', number: 1, name: '김지훈', studentKey: '1' },
  { studentRef: 'sB', number: 2, name: '박서연', studentKey: '2' },
];

function board(over: Partial<Parameters<typeof RecordEvidenceBoard>[0]> = {}) {
  return render(
    <RecordEvidenceBoard
      context="teaching"
      level="high"
      students={STUDENTS}
      classId="c1"
      selectedStudentRef="sA"
      onSelectStudent={() => {}}
      initialArea={null}
      {...over}
    />,
  );
}

const card = (text: string) => screen.getByRole('button', { name: new RegExp(`^${text} 근거`) });

async function drop(
  activeId: string,
  overId: string | null,
  delta = { x: 30, y: 10 },
): Promise<void> {
  await act(async () => {
    dnd.onDragEnd?.({
      active: { id: activeId },
      over: overId === null ? null : { id: overId },
      delta,
    });
  });
}

const BASE_EVIDENCE = [...H.evidence];
const BASE_THREADS = [...H.threads];
/** 장면이 깔린 주제 + 그 주제에서 이어진 둘째 주제(이음말 있음). e1·e2 는 과정 장면, e3 은 자리 미정. */
const SCENE_THREADS: InquiryThread[] = [
  {
    ...BASE_THREADS[0]!,
    scenes: [
      { id: 'sc-eval', role: 'evaluation', evidenceIds: [] },
      {
        id: 'sc-proc',
        role: 'process',
        moduleId: 'conceptUsed',
        note: '질문을 붙들었다',
        evidenceIds: ['e1', 'e2'],
      },
    ],
  },
  {
    id: 'thr-2',
    studentRef: 'sA',
    title: '보고서로 정리',
    keywords: [],
    status: 'open',
    createdAt: 2,
    updatedAt: 2,
    link: { fromThreadId: 'thr-1', note: '질문이 글쓰기로' },
  },
];
beforeEach(() => {
  H.evidence = [...BASE_EVIDENCE];
  H.threads = [...BASE_THREADS];
  H.placeEvidenceInScene.mockClear();
  H.detachFromScenes.mockClear();
  H.detachEvidenceFromScene.mockClear();
  H.setLink.mockClear();
  H.setSceneNote.mockClear();
  H.setSceneLeadIn.mockClear();
  H.addScene.mockClear();
  H.moveScene.mockClear();
  H.removeScene.mockClear();
  H.linkEvidence.mockClear();
  H.unlinkEvidence.mockClear();
  H.setEvidenceLinkNote.mockClear();
  H.reverseEvidenceLink.mockClear();
  H.moveToThread.mockClear();
  H.settingsUpdate.mockClear();
  H.settings = { recordScaffoldMigratedAt: 1 };
  window.localStorage.clear();
  useAssistStore.setState({ ownAiEnabled: true, provider: 'claude' });
  useOwnAiStatusStore.setState({
    connections: {
      claude: { provider: 'claude', state: 'connected', version: '2.1.258', model: '' },
      codex: null,
    },
  });
});
afterEach(cleanup);

describe('기본 보기와 상단 단추', () => {
  it('★설정이 비어 있으면 지도로 열리고, 작업 단추는 셋뿐이며 강조는 [… 초안 쓰기] 하나다', () => {
    board({ onWriteDraft: vi.fn() });
    expect(screen.getByTestId('evidence-map-view')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^근거$|근거 ▾|^근거/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /AI로 정리 제안/ })).toBeTruthy();
    const primary = screen.getByRole('button', { name: /근거 4건으로 초안 쓰기/ });
    expect(primary.className).toContain('bg-sp-accent');
    // 흐름 보기 전용 단추(주제·뼈대·넓게 보기)는 지도의 상단에 없다.
    expect(screen.queryByRole('button', { name: '뼈대 고르기' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'AI로 주제 묶기' })).toBeNull();
    expect(screen.getByRole('button', { name: '지도' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('[AI로 정리 제안 ▾]은 묶기·배치를 한 입구에서 고른다', () => {
    board();
    fireEvent.click(screen.getByRole('button', { name: /AI로 정리 제안/ }));
    const menu = screen.getByRole('menu', { name: 'AI로 정리 제안' });
    expect(
      within(menu).getByRole('menuitem', { name: /주제 미정 근거 1건을 주제로 묶기/ }),
    ).toBeTruthy();
    expect(within(menu).getByRole('menuitem', { name: /여러 학생의 지도 제안/ })).toBeTruthy();
    // 장면 배치는 흐름 보기로 보내지 않고 **주제마다** 지도 안에서 제안한다(ADR-107).
    fireEvent.click(
      within(menu).getByRole('menuitem', { name: /할인 문구와 선택.*장면 배치 제안/ }),
    );
    expect(H.settingsUpdate).not.toHaveBeenCalledWith({ recordEvidenceViewMode: 'flow' });
    expect(screen.queryByRole('menu', { name: 'AI로 정리 제안' })).toBeNull();
  });
});

describe('선택과 상세', () => {
  it('초안 화면에서 돌아올 때 넘겨받은 선택을 되살리고, 선택이 바뀔 때마다 부모에게 알린다', () => {
    const onSelectionChange = vi.fn();
    board({ initialSelectedIds: ['e1', 'e3'], onSelectionChange, onWriteDraft: vi.fn() });
    expect(card('쿠폰 질문을 했다').getAttribute('aria-pressed')).toBe('true');
    expect(card('보고서를 썼다').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /고른 2건으로 초안 쓰기/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: '할인 표를 만들었다 초안 근거 선택' }));
    expect(onSelectionChange).toHaveBeenLastCalledWith(['e1', 'e3', 'e2']);
  });

  it('묶음 머리 [접기]는 카드를 숨기고 건수를 남긴다 — 화면 상태일 뿐 저장 0회', () => {
    board();
    fireEvent.click(screen.getByRole('button', { name: '할인 문구와 선택 접기' }));
    expect(screen.queryByRole('button', { name: /^쿠폰 질문을 했다 근거/ })).toBeNull();
    expect(screen.getByRole('region', { name: '할인 문구와 선택 · 근거 3건' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '할인 문구와 선택 펼치기' }));
    expect(card('쿠폰 질문을 했다')).toBeTruthy();
    expect(H.moveToThread).not.toHaveBeenCalled();
  });

  it('★근거 사이 화살표·손잡이·[연결하기]는 없다(ADR-108) — 카드를 누르면 오른쪽에 기존 근거 카드만 열린다', () => {
    board();
    expect(document.querySelector('[data-map-handle]')).toBeNull();
    expect(screen.queryByRole('button', { name: /이음말 뒷받침/ })).toBeNull();
    fireEvent.click(card('쿠폰 질문을 했다'));
    fireEvent.click(card('할인 표를 만들었다'));
    expect(screen.queryByRole('button', { name: /^연결하기/ })).toBeNull();
    const side = screen.getByTestId('evidence-map-side');
    expect(within(side).getByRole('button', { name: /할인 표를 만들었다 근거 카드/ })).toBeTruthy();
    expect(within(side).queryByRole('list', { name: '앞에서 오는 연결' })).toBeNull();
  });
});

describe('초안 쓰기', () => {
  it('★고른 근거가 있으면 그 id 를 그대로 넘기고, 없으면 전체로 연다', () => {
    const onWriteDraft = vi.fn();
    board({ onWriteDraft });
    fireEvent.click(screen.getByRole('button', { name: /근거 4건으로 초안 쓰기/ }));
    expect(onWriteDraft).toHaveBeenLastCalledWith({ kind: 'all' });
    fireEvent.click(screen.getByRole('checkbox', { name: '쿠폰 질문을 했다 초안 근거 선택' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '보고서를 썼다 초안 근거 선택' }));
    fireEvent.click(screen.getByRole('button', { name: /고른 2건으로 초안 쓰기/ }));
    expect(onWriteDraft).toHaveBeenLastCalledWith({ kind: 'selection', evidenceIds: ['e1', 'e3'] });
  });
});

describe('끌어 놓기', () => {
  it('장면 없는 주제의 카드 위에 놓아도 그 주제로 옮긴다', async () => {
    board();
    await drop('e4', 'drop:before:e1');
    expect(H.moveToThread).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: 'thr-1', evidenceIds: ['e4'] }),
    );
  });
  it('★같은 묶음 안(또는 빈 자리)에 놓으면 저장 0회 — 자리만 이 기기에 남는다', async () => {
    board();
    await drop('e1', threadDropId('thr-1'));
    await drop('e1', null);
    expect(H.moveToThread).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('ssampin.evidence-map.v1:sA')).toContain('"e1"');
  });

  it('다른 주제에 놓으면 예전처럼 옮긴다(같은 저장 관문)', async () => {
    board();
    await drop('e4', threadDropId('thr-1'));
    expect(H.moveToThread).toHaveBeenCalledWith(
      expect.objectContaining({ studentRef: 'sA', evidenceIds: ['e4'], threadId: 'thr-1' }),
    );
    expect(UNCLASSIFIED_DROP_ID).toBe('drop:unclassified');
  });
});

describe('학생 전환', () => {
  it('★학생이 바뀌면 상세·장면 선택이 비워진다', () => {
    const view = board();
    fireEvent.click(card('쿠폰 질문을 했다'));
    expect(screen.getByTestId('evidence-map-side')).toBeTruthy();
    view.rerender(
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
    expect(screen.queryByTestId('evidence-map-side')).toBeNull();
  });
});

describe('장면 열(ADR-107)', () => {
  const sceneBoard = () => {
    H.threads = SCENE_THREADS;
    return board({ onWriteDraft: vi.fn() });
  };

  it('장면이 있는 주제는 장면 열로 그려지고, 열 머리를 누르면 오른쪽에 장면이 열린다 — 자리 미정 근거를 [여기에 놓기]로 넣는다', async () => {
    sceneBoard();
    // 열 머리(평가·과정)와 자리 미정 열. 카드 e1·e2 는 과정 열, e3 은 자리 미정.
    const proc = screen.getByRole('button', {
      name: /^과정: 사용한 개념 장면, 근거 2건, 메모 있음/,
    });
    expect(screen.getByRole('button', { name: /^평가 장면, 근거 0건/ })).toBeTruthy();
    expect(screen.getByLabelText('자리 미정, 근거 1건')).toBeTruthy();
    fireEvent.click(proc);
    const side = screen.getByTestId('evidence-map-side');
    expect(within(side).getByRole('heading', { name: '장면' })).toBeTruthy();
    expect(within(side).getByLabelText('장면 메모')).toHaveProperty('value', '질문을 붙들었다');
    const unplaced = within(side).getByRole('region', { name: '자리 미정 근거' });
    await act(async () => {
      fireEvent.click(within(unplaced).getByRole('button', { name: '여기에 놓기' }));
    });
    expect(H.placeEvidenceInScene).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: 'thr-1', sceneId: 'sc-proc', evidenceIds: ['e3'] }),
    );
    // 놓인 근거 [빼기] — 장면에서만 뺀다(주제는 그대로).
    const placed = within(side).getByRole('region', { name: '이 장면에 놓인 근거' });
    await act(async () => {
      fireEvent.click(within(placed).getAllByRole('button', { name: '이 장면 연결 해제' })[0]!);
    });
    expect(H.detachEvidenceFromScene).toHaveBeenCalledWith('thr-1', 'sc-proc', ['e1']);
    expect(H.detachFromScenes).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '미분류 근거 목록 닫기' }));
    const reopenedSide = screen.getByTestId('evidence-map-side');
    // 메모 저장은 같은 관문(setSceneNote).
    fireEvent.change(within(reopenedSide).getByLabelText('장면 메모'), {
      target: { value: '끝까지 붙들었다' },
    });
    await act(async () => {
      fireEvent.click(within(reopenedSide).getByRole('button', { name: '메모 저장' }));
    });
    expect(H.setSceneNote).toHaveBeenCalledWith('thr-1', 'sc-proc', '끝까지 붙들었다');
  });

  it('카드를 다른 장면 열에 끌어 놓으면 그 장면에 놓이고, 자리 미정 열에 놓으면 장면에서 빠진다 — 열 안 빈 자리는 밀지 않는다', async () => {
    sceneBoard();
    await drop('e3', 'drop:scene:thr-1:sc-proc');
    expect(H.placeEvidenceInScene).toHaveBeenCalledWith(
      expect.objectContaining({ sceneId: 'sc-proc', evidenceIds: ['e3'] }),
    );
    await drop('e1', 'drop:unplaced:thr-1');
    expect(H.detachFromScenes).toHaveBeenCalledWith('thr-1', ['e1']);
    // 같은 묶음 빈 자리에 놓기 — 열이 자리를 정하므로 위치를 저장하지 않는다.
    await drop('e2', threadDropId('thr-1'), { x: 80, y: 0 });
    expect(window.localStorage.getItem('ssampin.evidence-map.v1:sA')).toBeNull();
  });

  it('주제 제목을 누르면 오른쪽에 주제가 열린다 — 앞 주제 고르기·초안 쓰기·뼈대 고르기가 한 곳에', async () => {
    const onWriteDraft = vi.fn();
    H.threads = SCENE_THREADS;
    board({ onWriteDraft });
    fireEvent.click(screen.getByRole('button', { name: '보고서로 정리' }));
    const side = screen.getByTestId('evidence-map-side');
    expect(within(side).getByRole('heading', { name: '주제' })).toBeTruthy();
    expect(within(side).getByLabelText('앞 주제')).toHaveProperty('value', 'thr-1');
    fireEvent.click(within(side).getByRole('button', { name: '이어진 흐름 전체로' }));
    expect(onWriteDraft).toHaveBeenCalledWith({ kind: 'thread', threadId: 'thr-2', chain: true });
    // 앞 주제를 풀면 setLink(null).
    await act(async () => {
      fireEvent.change(within(side).getByLabelText('앞 주제'), { target: { value: '' } });
    });
    expect(H.setLink).toHaveBeenCalledWith('thr-2', null);
    // 장면이 없는 주제의 [뼈대 깔기] → 인라인 뼈대 칸이 그 주제로 열린다.
    fireEvent.click(within(side).getByRole('button', { name: /뼈대 깔기/ }));
    expect(screen.getByLabelText('뼈대를 적용할 주제')).toHaveProperty('value', 'thr-2');
  });

  it('뼈대 선택창을 닫고 같은 주제로 다시 열 수 있고 Escape로도 닫힌다', () => {
    sceneBoard();
    fireEvent.click(screen.getByRole('button', { name: '뼈대 깔기' }));
    fireEvent.click(screen.getByRole('button', { name: '뼈대 고르기 닫기' }));
    expect(screen.queryByTestId('scaffold-picker')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '뼈대 깔기' }));
    expect(screen.getByLabelText('뼈대를 적용할 주제')).toHaveProperty('value', 'thr-2');
    fireEvent.keyDown(screen.getByRole('region', { name: '뼈대 고르기' }), { key: 'Escape' });
    expect(screen.queryByTestId('scaffold-picker')).toBeNull();
  });

  it('★주제 사이 화살표의 이음말 라벨을 누르면 오른쪽에 주제 이음이 열리고, 저장은 setLink 로 간다', async () => {
    sceneBoard();
    const label = screen.getByRole('button', {
      name: /할인 문구와 선택에서 보고서로 정리로 이어진 주제, 이음말 질문이 글쓰기로/,
    });
    fireEvent.click(label);
    const side = screen.getByTestId('evidence-map-side');
    expect(within(side).getByRole('heading', { name: '주제 이음' })).toBeTruthy();
    fireEvent.change(within(side).getByLabelText('이음말'), {
      target: { value: '질문이 보고서로' },
    });
    await act(async () => {
      fireEvent.click(within(side).getByRole('button', { name: '이음말 저장' }));
    });
    expect(H.setLink).toHaveBeenCalledWith('thr-2', {
      fromThreadId: 'thr-1',
      note: '질문이 보고서로',
    });
    await act(async () => {
      fireEvent.click(within(side).getByRole('button', { name: '연결 끊기' }));
    });
    expect(H.setLink).toHaveBeenCalledWith('thr-2', null);
  });

  it('★장면 사이 화살표의 이음말 라벨을 누르면 오른쪽에 장면 이음이 열리고, 저장은 setSceneLeadIn 으로 간다', async () => {
    H.setSceneLeadIn.mockImplementationOnce(async () => {
      H.threads = H.threads.map((t) =>
        t.id === 'thr-1'
          ? {
              ...t,
              scenes: t.scenes?.map((s) =>
                s.id === 'sc-proc' ? { ...s, leadIn: '판단의 근거를 찾아' } : s,
              ),
            }
          : t,
      );
    });
    sceneBoard();
    // 평가 → 과정 (평가는 저장된 장면이라 화살표가 있다). 자리 미정으로 가는 화살표는 없다.
    const label = screen.getByRole('button', { name: '평가에서 과정로 이어짐, 이음말 없음' });
    expect(screen.getAllByRole('button', { name: /에서 .*로 이어짐, 이음말/ })).toHaveLength(1);
    fireEvent.click(label);
    const side = screen.getByTestId('evidence-map-side');
    expect(within(side).getByRole('heading', { name: '장면 이음' })).toBeTruthy();
    fireEvent.change(within(side).getByLabelText('이음말'), {
      target: { value: '판단의 근거를 찾아' },
    });
    await act(async () => {
      fireEvent.click(within(side).getByRole('button', { name: '이음말 저장' }));
    });
    expect(H.setSceneLeadIn).toHaveBeenCalledWith('thr-1', 'sc-proc', '판단의 근거를 찾아');
    // 같은 라벨을 다시 누르면 닫힌다.
    fireEvent.click(label);
    expect(screen.queryByTestId('evidence-map-side')).toBeNull();
  });

  it('묶음 머리의 [뼈대 깔기]는 장면이 없는 주제에만 있고, 누르면 뼈대 칸이 열린다', () => {
    sceneBoard();
    const groups = screen.getAllByRole('button', { name: '뼈대 깔기' });
    expect(groups).toHaveLength(1);
    fireEvent.click(groups[0]!);
    expect(screen.getByLabelText('뼈대를 적용할 주제')).toHaveProperty('value', 'thr-2');
  });
});
