/**
 * @vitest-environment jsdom
 *
 * 근거 지도의 **장면 배선**(ADR-103 의 장면 체계를 ADR-107 이 지도에 합친 것). 옛 흐름 보기 검사를 지도 UI 로 옮겼다.
 *
 * 여기서 지키는 것:
 *  - **기본 보기가 지도**다(ADR-106). 옛 설정 `flow` 가 남아 있어도 지도로 연다 — 흐름 보기는 더 없다.
 *  - 지도와 보드는 **같은 자료의 두 보기**다. 전환은 설정에 남는다.
 *  - 카드를 장면 열에 놓으면 **근거 먼저, 장면 나중**의 한 경로(`placeEvidenceInScene`)로만 간다.
 *  - 「자리 미정」 열에 놓으면 장면에서만 빠지고 **주제 소속은 그대로**다.
 *  - 닫힌 주제에는 놓아도 **저장 0회**다.
 *  - 근거 메모는 카드에서 남기고 근거 파일에, 장면 메모는 오른쪽 장면 상세에서 남기고 주제 파일에 저장된다.
 *  - 가상 평가 자리에 메모를 적으면 **진짜 자리를 먼저 세우고** 그 자리에 적는다.
 *  - AI 장면 배치는 점선(제안)일 뿐 적용 전 저장 0회. 적용 실패면 제안을 지킨다.
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
      content: '아직 어디에도 안 엮인 근거',
      areas: [],
      date: '2026-05-02',
      createdAt: 2,
      updatedAt: 2,
    },
  ];
  const threads: InquiryThread[] = [
    {
      id: 'thr-1',
      studentRef: 'sA',
      title: '할인 문구와 선택',
      keywords: [],
      status: 'open',
      scenes: [
        { id: 'sc-eval', role: 'evaluation', moduleId: 'teacherJudgement', evidenceIds: [] },
        { id: 'sc-motive', role: 'motive', moduleId: 'legacyMotive', evidenceIds: ['e1'] },
      ],
      createdAt: 1,
      updatedAt: 1,
    } as InquiryThread,
  ];
  return {
    fakeStore,
    evidence,
    threads,
    setNote: vi.fn(async () => {}),
    moveToThread: vi.fn(async () => ({ movedIds: ['e2'], skippedIds: [] })),
    detachFromScenes: vi.fn(async () => {}),
    setSceneNote: vi.fn(async () => {}),
    addScene: vi.fn(
      async (_threadId: string, _draft: { role: string }, _at?: number) => 'sc-new-eval',
    ),
    place: vi.fn(async (_input: unknown) => ({ placedIds: ['e2'], skippedIds: [] })),
    settingsUpdate: vi.fn(async () => {}),
    applyNarrative: vi.fn(
      async (
        _input: unknown,
      ): Promise<{
        placedIds: readonly string[];
        skippedIds: readonly string[];
        applied: boolean;
      }> => ({ placedIds: ['e1'], skippedIds: [], applied: true }),
    ),
    answer: '동기 | 동기·질문 | 1 | 쿠폰 물음에서 시작했습니다',
    ask: vi.fn<() => Promise<string>>(),
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
  placeEvidenceInScene: H.place,
  placeEvidenceInScenes: H.place,
  applyNarrativeSuggestion: H.applyNarrative,
}));
vi.mock('@adapters/components/RecordDraft/ownAiRun', () => ({
  runApi: () => ({ run: async () => ({ ok: true }), onEvent: () => () => {} }),
  askOnce: H.ask,
}));
vi.mock('@adapters/stores/useRecordEvidenceStore', () => ({
  useRecordEvidenceStore: H.fakeStore({
    records: H.evidence,
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
    setNote: H.setNote,
  }),
}));
vi.mock('@adapters/stores/useInquiryThreadStore', () => ({
  useInquiryThreadStore: H.fakeStore({
    records: H.threads,
    loaded: true,
    load: async () => {},
    add: async () => 'new',
    update: async () => {},
    remove: async () => {},
    addScene: H.addScene,
    removeScene: async () => {},
    moveScene: async () => {},
    setSceneNote: H.setSceneNote,
    setSceneCategory: async () => {},
    setLink: async () => {},
    applyScaffold: async () => {},
    detachFromScenes: H.detachFromScenes,
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
import { sceneDropId, unplacedDropId } from '../narrativeFlowDrop';
import { threadDropId } from '../EvidenceColumn';
import { EVALUATION_EMPTY_SHORT } from '../evaluationGuide';

const STUDENTS = [{ studentRef: 'sA', number: 1, name: '김지훈', studentKey: '1' }];

function board() {
  return render(
    <RecordEvidenceBoard
      context="teaching"
      level="high"
      students={STUDENTS}
      classId="c1"
      selectedStudentRef="sA"
      onSelectStudent={() => {}}
      initialArea={null}
    />,
  );
}

/** 카드 하나를 놓는다. jsdom 에서는 포인터 끌기가 안 되므로 보드가 넘긴 핸들러를 직접 부른다. */
async function drop(activeId: string, overId: string): Promise<void> {
  await act(async () => {
    dnd.onDragEnd?.({ active: { id: activeId }, over: { id: overId } });
  });
}

beforeEach(() => {
  H.place.mockClear();
  H.detachFromScenes.mockClear();
  H.setNote.mockClear();
  H.settingsUpdate.mockClear();
  H.applyNarrative.mockClear();
  H.setSceneNote.mockClear();
  H.addScene.mockClear();
  H.answer = '동기 | 동기·질문 | 1 | 쿠폰 물음에서 시작했습니다';
  H.ask.mockReset().mockImplementation(async () => H.answer);
  useAssistStore.setState({ ownAiEnabled: true, provider: 'claude' });
  useOwnAiStatusStore.setState({
    connections: {
      claude: { provider: 'claude', state: 'connected', version: '2.1.258', model: '' },
      codex: null,
    },
  });
  H.moveToThread.mockClear();
  // ★주제를 통째로 되돌린다 — 장면까지 손대는 검사가 있어 상태만 되돌리면 다음 검사로 샌다.
  H.threads[0] = {
    ...(H.threads[0] as InquiryThread),
    title: '할인 문구와 선택',
    status: 'open',
    scenes: [
      { id: 'sc-eval', role: 'evaluation', moduleId: 'teacherJudgement', evidenceIds: [] },
      { id: 'sc-motive', role: 'motive', moduleId: 'legacyMotive', evidenceIds: ['e1'] },
    ],
  } as InquiryThread;
  H.settings = { recordScaffoldMigratedAt: 1 };
});
afterEach(cleanup);

/** 오른쪽 보조 공간. */
const side = () => screen.getByTestId('evidence-map-side');
/** 장면 열 머리를 눌러 오른쪽에 장면 상세를 연다. */
function openScene(name: RegExp): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name }));
  return side();
}
/** [AI로 정리 제안 ▾] → 이 주제의 장면 배치 제안. */
async function askScenes(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: /AI로 정리 제안/ }));
  await act(async () => {
    fireEvent.click(screen.getByRole('menuitem', { name: /할인 문구와 선택.*장면 배치 제안/ }));
  });
}
async function saveSceneNote(panel: HTMLElement, value: string): Promise<void> {
  fireEvent.change(within(panel).getByLabelText('장면 메모'), { target: { value } });
  await act(async () => {
    fireEvent.click(within(panel).getByRole('button', { name: '메모 저장' }));
  });
}

it('장면 메모 저장 실패 후 입력을 보존하고 다시 저장할 수 있다', async () => {
  H.setSceneNote.mockRejectedValueOnce(new Error('디스크 오류'));
  board();
  const panel = openScene(/^평가: 교사 판단 장면/);
  await saveSceneNote(panel, '남겨야 하는 판단');
  expect(within(panel).getByLabelText('장면 메모')).toHaveProperty('value', '남겨야 하는 판단');
  expect(within(panel).getByRole('alert')).toBeTruthy();
  await act(async () => {
    fireEvent.click(within(panel).getByRole('button', { name: '메모 저장' }));
  });
  expect(within(panel).queryByRole('alert')).toBeNull();
  expect(H.setSceneNote).toHaveBeenCalledTimes(2);
});

it('학생을 바꾼 뒤 늦게 도착한 AI 응답을 버린다', async () => {
  let resolve: (value: string) => void = () => {};
  H.ask.mockImplementationOnce(
    () =>
      new Promise<string>((done) => {
        resolve = done;
      }),
  );
  const rendered = board();
  await askScenes();
  rendered.rerender(
    <RecordEvidenceBoard
      context="teaching"
      level="high"
      students={[...STUDENTS, { studentRef: 'sB', number: 2, name: '검토학생', studentKey: '2' }]}
      classId="c1"
      selectedStudentRef="sB"
      onSelectStudent={() => {}}
      initialArea={null}
    />,
  );
  await act(async () => {
    resolve('파싱 실패 응답');
  });
  expect(screen.queryByText(/읽지 못했습니다/)).toBeNull();
  expect(screen.queryByTestId('narrative-suggest-ghost')).toBeNull();
});

it('서사 적용 중 저장 예외가 나도 제안을 남긴다', async () => {
  H.applyNarrative.mockRejectedValueOnce(new Error('디스크 오류'));
  board();
  await askScenes();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '이 배치 적용' }));
  });
  expect(screen.getByTestId('narrative-suggest-ghost')).toBeTruthy();
});

describe('보기 모드', () => {
  it('같은 장면을 다시 눌러 닫을 때도 미저장 메모를 확인하고 취소하면 유지한다', () => {
    board();
    const panel = openScene(/^동기: 동기·질문 장면/);
    fireEvent.change(within(panel).getByLabelText('장면 메모'), {
      target: { value: '저장 전 메모' },
    });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(screen.getByRole('button', { name: /^동기: 동기·질문 장면/ }));
    expect(confirm).toHaveBeenCalled();
    expect(screen.getByLabelText('장면 메모')).toHaveProperty('value', '저장 전 메모');
    confirm.mockRestore();
  });
  it('제안 후 근거가 바뀌면 이전 AI 제안을 적용하지 않는다', async () => {
    board();
    await askScenes();
    H.threads[0] = { ...(H.threads[0] as InquiryThread), title: '교사가 수정한 주제' };
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '이 배치 적용' }));
    });
    expect(screen.getByText(/제안을 만든 뒤 근거나 장면이 바뀌었습니다/)).toBeTruthy();
  });
  it('★설정이 비어 있으면 근거 지도로 연다(ADR-106) — 흐름 보기 단추는 더 없다', () => {
    board();
    expect(screen.getByTestId('evidence-map-view')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '흐름' })).toBeNull();
    expect(screen.queryByTestId('narrative-flow-view')).toBeNull();
  });

  it("★옛 설정 'flow' 가 남아 있어도 지도로 연다 — 흐름 보기는 지도에 합쳐졌다(ADR-107)", () => {
    H.settings = { recordScaffoldMigratedAt: 1, recordEvidenceViewMode: 'flow' };
    board();
    expect(screen.getByTestId('evidence-map-view')).toBeTruthy();
    expect(screen.getByRole('button', { name: '지도' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByRole('region', { name: '미분류 열' })).toBeNull();
  });

  it('[보드]를 누르면 설정에 남는다 — 다음에 열 때도 그 보기다', () => {
    board();
    fireEvent.click(screen.getByRole('button', { name: '보드' }));
    expect(H.settingsUpdate).toHaveBeenCalledWith({ recordEvidenceViewMode: 'board' });
  });

  it('설정이 보드면 열로 연다 — 같은 자료의 두 보기다', () => {
    H.settings = { recordScaffoldMigratedAt: 1, recordEvidenceViewMode: 'board' };
    board();
    expect(screen.queryByTestId('evidence-map-view')).toBeNull();
    expect(screen.getByRole('region', { name: '미분류 열' })).toBeTruthy();
  });
});

describe('놓기', () => {
  it('다른 근거 앞에 놓으면 해당 장면의 삽입 순서를 저장 경로에 전달한다', async () => {
    board();
    await drop('e2', 'drop:before:e1');
    expect(H.place).toHaveBeenCalledWith(
      expect.objectContaining({ sceneId: 'sc-motive', evidenceIds: ['e2'], index: 0 }),
    );
  });
  it('★장면 열에 놓으면 근거 먼저·장면 나중의 한 경로로만 간다', async () => {
    board();
    await drop('e2', sceneDropId('thr-1', 'sc-motive'));
    expect(H.place).toHaveBeenCalledTimes(1);
    expect(H.place.mock.calls[0]?.[0]).toMatchObject({
      threadId: 'thr-1',
      sceneId: 'sc-motive',
      evidenceIds: ['e2'],
    });
    // 화면이 스토어를 직접 부르지 않는다 — 순서 규율은 한 곳에만 있다.
    expect(H.moveToThread).not.toHaveBeenCalled();
  });

  it('「자리 미정」 열에 놓으면 장면에서만 빠진다 — 주제 소속은 그대로', async () => {
    board();
    await drop('e1', unplacedDropId('thr-1'));
    expect(H.detachFromScenes).toHaveBeenCalledWith('thr-1', ['e1']);
    expect(H.moveToThread).not.toHaveBeenCalled();
    expect(H.place).not.toHaveBeenCalled();
  });

  it('★닫힌 주제의 장면에 놓으면 저장 0회다', async () => {
    H.threads[0] = { ...(H.threads[0] as InquiryThread), status: 'closed' };
    board();
    await drop('e2', sceneDropId('thr-1', 'sc-motive'));
    expect(H.place).not.toHaveBeenCalled();
    expect(H.detachFromScenes).not.toHaveBeenCalled();
  });

  it('묶음 껍데기에 놓으면 보드와 같은 경로(주제로 보내기)로 간다', async () => {
    board();
    await drop('e2', threadDropId('thr-1'));
    expect(H.place).not.toHaveBeenCalled();
    expect(H.moveToThread).toHaveBeenCalled();
  });
});

describe('메모', () => {
  it('★근거 메모는 근거 파일에 저장된다 — 카드를 따라간다', async () => {
    board();
    fireEvent.click(screen.getByRole('button', { name: /^쿠폰 질문을 했다 근거/ }));
    const panel = side();
    fireEvent.click(within(panel).getByRole('button', { name: '메모' }));
    fireEvent.change(within(panel).getByLabelText('근거 메모'), {
      target: { value: '여기서 시작했다' },
    });
    await act(async () => {
      fireEvent.click(within(panel).getByRole('button', { name: '저장' }));
    });
    expect(H.setNote).toHaveBeenCalledWith('e1', '여기서 시작했다');
  });

  it('장면 메모는 주제 파일에 저장된다', async () => {
    board();
    const panel = openScene(/^평가: 교사 판단 장면/);
    await saveSceneNote(panel, '꾸준한 학생');
    expect(H.setSceneNote).toHaveBeenCalledWith('thr-1', 'sc-eval', '꾸준한 학생');
  });
});

describe('AI 장면 배치', () => {
  it('★제안이 떠 있는 동안 저장은 0회다 — 점선은 화면 상태일 뿐이다', async () => {
    board();
    await askScenes();
    expect(screen.getByTestId('narrative-suggest-ghost')).toBeTruthy();
    expect(H.applyNarrative).not.toHaveBeenCalled();
    expect(H.place).not.toHaveBeenCalled();
    expect(H.setSceneNote).not.toHaveBeenCalled();
  });

  it('AI 가 쓴 이유를 저장 전에 보여 준다', async () => {
    board();
    await askScenes();
    expect(screen.getByText(/쿠폰 물음에서 시작했습니다/)).toBeTruthy();
  });

  it('[이 배치 적용]을 누르면 한 경로로 한 번 저장한다', async () => {
    board();
    await askScenes();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '이 배치 적용' }));
    });
    expect(H.applyNarrative).toHaveBeenCalledTimes(1);
    const arg = H.applyNarrative.mock.calls[0]?.[0] as {
      threadId: string;
      scenes: { role: string; note?: string }[];
    };
    expect(arg.threadId).toBe('thr-1');
    expect(arg.scenes[0]).toMatchObject({
      role: 'motive',
      note: '쿠폰 물음에서 시작했습니다',
    });
  });

  it('[무시]하면 아무것도 저장하지 않고 점선이 사라진다', async () => {
    board();
    await askScenes();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '무시' }));
    });
    expect(screen.queryByTestId('narrative-suggest-ghost')).toBeNull();
    expect(H.applyNarrative).not.toHaveBeenCalled();
  });

  it('★못 읽은 답은 이유를 말하고 점선을 띄우지 않는다', async () => {
    H.answer = '네, 알겠습니다. 아래와 같이 정리했습니다.';
    board();
    await askScenes();
    expect(screen.queryByTestId('narrative-suggest-ghost')).toBeNull();
    expect(screen.getByText(/읽지 못했습니다/)).toBeTruthy();
  });

  it('주제 상세의 [AI 장면 배치 제안]은 추가 요청을 함께 보낸다', async () => {
    board();
    fireEvent.click(screen.getByRole('button', { name: /^할인 문구와 선택$/ }));
    const panel = side();
    fireEvent.change(within(panel).getByLabelText('AI 에게 추가로 요청할 것'), {
      target: { value: '과정을 앞세워 줘' },
    });
    await act(async () => {
      fireEvent.click(within(panel).getByRole('button', { name: /AI 장면 배치 제안/ }));
    });
    expect(screen.getByTestId('narrative-suggest-ghost')).toBeTruthy();
    const prompt = String(
      (H.ask.mock.calls[0] as unknown as readonly string[] | undefined)?.[2] ?? '',
    );
    expect(prompt).toContain('과정을 앞세워 줘');
  });
});

describe('★가상 평가 자리 (적대 검토 2026-09-10, 치명)', () => {
  /** 평가 장면이 없는 주제 — 화면이 가상 평가 열을 끼워 보여 준다. */
  function withoutEvaluation(): void {
    H.threads[0] = {
      ...(H.threads[0] as InquiryThread),
      scenes: [{ id: 'sc-motive', role: 'motive', moduleId: 'legacyMotive', evidenceIds: ['e1'] }],
    } as InquiryThread;
  }

  it('평가 장면이 없으면 아직 저장되지 않은 자리라고 말한다', () => {
    withoutEvaluation();
    board();
    const panel = openScene(/아직 저장되지 않은 자리/);
    expect(within(panel).getByText(/아직 저장되지 않은 평가 자리/)).toBeTruthy();
  });

  it('★그 열에 메모를 적으면 진짜 자리를 먼저 세우고 그 자리에 적는다', async () => {
    withoutEvaluation();
    board();
    const panel = openScene(/아직 저장되지 않은 자리/);
    await saveSceneNote(panel, '꾸준한 학생');
    expect(H.addScene).toHaveBeenCalledTimes(1);
    expect(H.addScene.mock.calls[0]?.[1]).toMatchObject({ role: 'evaluation' });
    // ★가상 id 가 아니라 **새로 만든 자리**에 적는다.
    expect(H.setSceneNote).toHaveBeenCalledWith('thr-1', 'sc-new-eval', '꾸준한 학생');
  });

  it('평가 장면이 이미 있으면 자리를 새로 만들지 않는다', async () => {
    board();
    const panel = openScene(/^평가: 교사 판단 장면/);
    await saveSceneNote(panel, '메모');
    expect(H.addScene).not.toHaveBeenCalled();
    expect(H.setSceneNote).toHaveBeenCalledWith('thr-1', 'sc-eval', '메모');
  });
});

describe('★적용이 실패하면 제안을 지키고 그 사실을 말한다 (재검증 2026-09-10)', () => {
  it('아무것도 저장되지 않았으면 "적용했습니다"라고 하지 않고 점선도 남는다', async () => {
    H.applyNarrative.mockResolvedValueOnce({
      placedIds: [],
      skippedIds: ['e1'],
      applied: false,
    });
    board();
    await askScenes();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '이 배치 적용' }));
    });
    // ★제안을 지우지 않는다 — 지우면 CLI 를 한 번 더 돌려야 한다.
    expect(screen.getByTestId('narrative-suggest-ghost')).toBeTruthy();
    expect(screen.getByText(/배치를 적용하지 않았습니다/)).toBeTruthy();
  });
});

describe('학생 넘기기와 쓰다 만 장면 메모', () => {
  const TWO = [...STUDENTS, { studentRef: 'sB', number: 2, name: '박서연', studentKey: '2' }];
  function boardWith(onSelectStudent: (ref: string) => void) {
    return render(
      <RecordEvidenceBoard
        context="teaching"
        level="high"
        students={TWO}
        classId="c1"
        selectedStudentRef="sA"
        onSelectStudent={onSelectStudent}
        initialArea={null}
      />,
    );
  }

  it('★메모를 쓰는 중이면 먼저 묻고, 아니오면 학생을 바꾸지 않는다', () => {
    const onSelectStudent = vi.fn();
    boardWith(onSelectStudent);
    const panel = openScene(/^평가: 교사 판단 장면/);
    fireEvent.change(within(panel).getByLabelText('장면 메모'), {
      target: { value: '쓰다 만 글' },
    });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(screen.getByRole('button', { name: '다음 학생' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(onSelectStudent).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: '다음 학생' }));
    expect(onSelectStudent).toHaveBeenCalledWith('sB');
    confirm.mockRestore();
  });

  it('메모를 안 쓰고 있으면 묻지 않고 바로 바꾼다 — Alt+→ 도 같은 길이다', () => {
    const onSelectStudent = vi.fn();
    boardWith(onSelectStudent);
    openScene(/^평가: 교사 판단 장면/);
    const confirm = vi.spyOn(window, 'confirm');
    fireEvent.keyDown(window, { key: 'ArrowRight', altKey: true });
    expect(confirm).not.toHaveBeenCalled();
    expect(onSelectStudent).toHaveBeenCalledWith('sB');
    confirm.mockRestore();
  });

  it('입력칸 안에서 누른 Alt+→ 는 글자 이동이라 학생을 바꾸지 않는다', () => {
    const onSelectStudent = vi.fn();
    boardWith(onSelectStudent);
    const panel = openScene(/^평가: 교사 판단 장면/);
    fireEvent.keyDown(within(panel).getByLabelText('장면 메모'), {
      key: 'ArrowRight',
      altKey: true,
    });
    expect(onSelectStudent).not.toHaveBeenCalled();
  });
});

describe('[이 주제로 초안 쓰기]는 초안 화면으로 간다 (오너 제보 2026-09-11)', () => {
  it('★관찰 입력 탭으로 가는 이동 신호를 보내지 않고, 이 주제로 초안을 쓰라고 알린다', async () => {
    const onWriteDraft = vi.fn();
    const onRequestFlow = vi.fn();
    render(
      <RecordEvidenceBoard
        context="teaching"
        level="high"
        students={STUDENTS}
        classId="c1"
        selectedStudentRef="sA"
        onSelectStudent={() => {}}
        initialArea={null}
        onRequestFlow={onRequestFlow}
        onWriteDraft={onWriteDraft}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^할인 문구와 선택$/ }));
    await act(async () => {
      fireEvent.click(within(side()).getByRole('button', { name: '이 주제로 초안 쓰기' }));
    });
    expect(onWriteDraft).toHaveBeenCalledWith({ kind: 'thread', threadId: 'thr-1', chain: false });
    expect(onRequestFlow).not.toHaveBeenCalled();
  });
});

describe('빈 평가 자리 안내 (ADR-109, 오너 요청 2026-09-11)', () => {
  it('지도의 빈 평가 열은 비워 두어도 된다고 말한다', () => {
    board();
    expect(screen.getByText(EVALUATION_EMPTY_SHORT)).toBeTruthy();
  });

  it('평가 장면 상세는 초안이 근거 전체를 종합한다고 말하고, 메모 예시가 평가용이다', () => {
    board();
    const panel = openScene(/^평가: 교사 판단 장면/);
    const guide = panel.querySelector('[data-scene-eval-empty]');
    expect(guide?.textContent).toContain('근거 전체를 종합해 평가 문장을 씁니다');
    expect(guide?.textContent).toContain('장면 메모에 적어 두세요');
    expect(within(panel).getByLabelText('장면 메모').getAttribute('placeholder')).toBe(
      '예: 근거를 끝까지 따져 묻는 학생',
    );
  });

  it('평가에 근거가 놓여 있으면 안내하지 않고, 빈 다른 장면은 예전 안내 그대로다', () => {
    H.threads[0] = {
      ...(H.threads[0] as InquiryThread),
      scenes: [
        { id: 'sc-eval', role: 'evaluation', moduleId: 'teacherJudgement', evidenceIds: ['e1'] },
        { id: 'sc-motive', role: 'motive', moduleId: 'legacyMotive', evidenceIds: [] },
      ],
    } as InquiryThread;
    board();
    expect(screen.queryByText(EVALUATION_EMPTY_SHORT)).toBeNull();
    expect(screen.getByText('카드를 여기에 끌어 놓으세요')).toBeTruthy();
    const panel = openScene(/^평가: 교사 판단 장면/);
    expect(panel.querySelector('[data-scene-eval-empty]')).toBeNull();
  });

  it('AI 제안에 평가 줄이 없으면 맨 앞에 빈 채로 세운다고 미리 말한다', async () => {
    board();
    await askScenes();
    const ghost = screen.getByTestId('narrative-suggest-ghost');
    expect(ghost.querySelector('[data-suggest-eval-empty]')?.textContent).toContain(
      '맨 앞에 빈 채로',
    );
  });

  it('★AI 가 평가 번호 칸을 비워 두면 그 줄에 안내가 붙고, 이유 앞에 빈 칸이 끼지 않는다', async () => {
    H.answer = [
      '평가 | 교사 판단 |  | 종합 판단을 적은 기록이 없습니다',
      '동기 | 동기·질문 | 1 | 쿠폰 물음에서 시작했습니다',
    ].join('\n');
    board();
    await askScenes();
    const ghost = screen.getByTestId('narrative-suggest-ghost');
    const guides = ghost.querySelectorAll('[data-suggest-eval-empty]');
    expect(guides).toHaveLength(1);
    expect(guides[0]?.textContent).toContain('평가 자리는 비워 두어도 됩니다');
    expect(ghost.textContent).toContain('AI 가 읽은 것: 종합 판단을 적은 기록이 없습니다');
  });
});
