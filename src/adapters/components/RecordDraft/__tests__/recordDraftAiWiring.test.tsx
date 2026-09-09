/**
 * @vitest-environment jsdom
 *
 * 생기부 초안 화면 ↔ 오른쪽 패널 「AI 초안」 배선(ADR-085).
 *
 * 여기서 지키는 것은 **화면이 패널에 무엇을 넘기는가**다. 패널 안쪽 동작은
 * `RecordDraftAiPanel.test.tsx` 가 따로 지킨다. 이 파일이 없으면 다음이 조용히 깨진다:
 *
 * 1. 실험실 스위치를 안 켠 선생님 화면에 [AI ▸] 가 나타난다.
 * 2. **성취기준 원문이 AI 로 나간다** — 화면에는 원문(`standardTexts`)과 키워드가 나란히 있다.
 * 3. **남의 학생 칸에 저장된다** — 필터가 걸리면 화면 순서와 명단 순서가 다르다.
 * 4. 이미 쓴 초안이 "남은 학생 모두"에 섞여 덮어써진다.
 * 5. 고른 학생(`selectedStudentRef`)이 행 클릭·[AI ▸] 로 바뀌지 않아 패널이 엉뚱한 학생을 본다.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { areasForContext } from '@domain/entities/RecordDraft';

const AREA = areasForContext('high', 'teaching')[0]!;
if (AREA !== 'subject') {
  throw new Error(`교과 첫 영역이 'subject' 가 아니다: ${AREA} — 테스트 데이터를 맞춰야 한다.`);
}

const { EVIDENCE, STANDARD, upsertSpy, panelProps, fakeStore, drafts, settingsState } = vi.hoisted(
  () => {
    const evidence = [
      {
        id: 'e-A1',
        studentRef: 'sA',
        areas: ['subject'],
        content: 'A학생 근거',
        sourceType: 'manual' as const,
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 'e-B1',
        studentRef: 'sB',
        areas: ['subject'],
        content: 'B학생 근거',
        sourceType: 'manual' as const,
        createdAt: 2,
        updatedAt: 2,
      },
    ];
    const standard = {
      code: '[9수02-15]',
      text: '일차함수의 그래프와 미지수가 2개인 일차방정식의 관계를 이해한다.',
      keywords: ['일차함수', '그래프', '일차방정식'],
      subject: '수학',
      subjectGroup: '수학',
      domain: '변화와 관계',
      gradeBand: '7-9',
    };
    const store = <T extends object>(state: T) => {
      const hook = (sel?: (s: T) => unknown) => (sel ? sel(state) : state);
      hook.getState = () => state;
      hook.setState = () => {};
      return hook;
    };
    return {
      EVIDENCE: evidence,
      STANDARD: standard,
      upsertSpy: vi.fn(async () => {}),
      /** 화면이 패널에 넘긴 props — 렌더마다 쌓인다. 마지막 것이 지금 화면. */
      panelProps: [] as Record<string, unknown>[],
      fakeStore: store,
      drafts: { byRef: {} as Record<string, Record<string, unknown> | undefined> },
      /** 설정 흉내 — 테스트가 `settings.recordHighlightOn` 을 바꾼다. */
      settingsState: {
        settings: {} as Record<string, unknown>,
        loaded: true,
        update: async () => {},
      },
    };
  },
);

vi.mock('@adapters/stores/useRecordDraftsStore', () => ({
  RecordDraftLimitError: class extends Error {},
  useRecordDraftsStore: fakeStore({
    records: [],
    loaded: true,
    load: async () => {},
    getDraft: (_area: string, studentRef: string) => drafts.byRef[studentRef],
    upsert: upsertSpy,
    setStatus: async () => {},
  }),
}));
vi.mock('@adapters/stores/useRecordEvidenceStore', () => ({
  useRecordEvidenceStore: fakeStore({ records: EVIDENCE, loaded: true, load: async () => {} }),
}));
vi.mock('@adapters/stores/useInquiryThreadStore', () => ({
  useInquiryThreadStore: fakeStore({ records: [], loaded: true, load: async () => {} }),
}));
vi.mock('@adapters/stores/useObservationStore', () => ({
  useObservationStore: fakeStore({ records: [], load: async () => {} }),
}));
// 거울 카드 후보(useEvidenceCandidates)가 읽는 원본 스토어 — 여기서는 비워 둘 뿐, 세는 로직은 보드 테스트가 지킨다.
vi.mock('@adapters/stores/useStudentRecordsStore', () => ({
  useStudentRecordsStore: fakeStore({ records: [], load: async () => {} }),
}));
vi.mock('@adapters/stores/useGradeAnalysisStore', () => ({
  useGradeAnalysisStore: fakeStore({
    plans: [],
    performanceResults: [],
    semesterResults: [],
    load: async () => {},
  }),
}));
vi.mock('@adapters/stores/useObservationAttachmentStore', () => ({
  useObservationAttachmentStore: fakeStore({ attachments: [], load: async () => {} }),
}));
vi.mock('@adapters/stores/useAssignmentStore', () => ({
  useAssignmentStore: fakeStore({ submissions: [], assignments: [] }),
}));
vi.mock('@adapters/stores/useSettingsStore', () => ({
  useSettingsStore: fakeStore(settingsState),
}));
vi.mock('@adapters/stores/useRubricStore', () => ({
  useRubricStore: fakeStore({
    rubrics: [{ id: 'r1', classId: 'c1', standardCodes: ['[9수02-15]'] }],
    gradings: [],
    load: async () => {},
  }),
}));
vi.mock('@adapters/stores/useTeachingClassStore', () => ({
  useTeachingClassStore: fakeStore({ progressEntries: [], classes: [], load: async () => {} }),
}));
vi.mock('@adapters/hooks/useCurriculumStandards', () => ({
  useCurriculumStandards: () => ({
    data: { bundle: { standards: [STANDARD] }, index: new Map([['9수02-15', STANDARD]]) },
    loading: false,
  }),
}));
// 보드는 별도 테스트가 지킨다 — 여기서는 열리는지만 본다.
vi.mock('@adapters/components/RecordDraft/RecordEvidenceBoard', () => ({
  RecordEvidenceBoard: (p: { selectedStudentRef: string | null; initialArea?: string | null }) => (
    <div
      data-testid="evidence-board"
      data-student={p.selectedStudentRef ?? ''}
      data-area={p.initialArea ?? ''}
    />
  ),
}));

/** 패널 본체는 따로 검증한다 — 여기서는 **무엇을 받았는지**만 본다. */
vi.mock('@adapters/components/RecordDraft/RecordDraftAiPanel', () => ({
  RecordDraftAiPanel: (props: Record<string, unknown>) => {
    panelProps.push(props);
    const t = props['target'] as { displayName: string };
    return <div data-testid="ai-panel">{t.displayName} AI 패널</div>;
  },
}));

import { RecordDraftView, resolveListMode } from '../RecordDraftView';
import { useAssistStore } from '@adapters/stores/useAssistStore';
import { useRecordAiRunStore } from '@adapters/stores/useRecordAiRunStore';

const STUDENTS = [
  { studentRef: 'sA', number: 1, name: '김지훈', studentKey: '1' },
  { studentRef: 'sB', number: 2, name: '박서연', studentKey: '2' },
];

function element() {
  return (
    <RecordDraftView
      context="teaching"
      level="high"
      students={STUDENTS}
      classId="c1"
      classSubject="수학"
      className="2학년 4반"
    />
  );
}

/**
 * 오른쪽 보조 공간은 **눌렀을 때만** 열린다(ADR-093). 패널 props 를 보는 테스트는 첫 학생의 [AI ▸] 를 눌러 연다.
 * `openPanel: false` 면 누르지 않는다(스위치 꺼짐·행만 보는 테스트).
 */
function view(opts: { readonly openPanel?: boolean } = {}) {
  const r = render(element());
  if (opts.openPanel !== false) {
    const first = screen.queryAllByRole('button', { name: /AI 초안$/ })[0];
    if (first) fireEvent.click(first);
  }
  return r;
}

const lastProps = (): Record<string, unknown> => panelProps[panelProps.length - 1] ?? {};

beforeEach(() => {
  panelProps.length = 0;
  upsertSpy.mockClear();
  drafts.byRef = {};
  // 이 파일은 예전 목록(전체 훑어보기)을 검사한다 — 집중 보기는 recordDraftFocusView.test 가 지킨다.
  settingsState.settings = { recordDraftViewMode: 'overview' };
  useAssistStore.setState({ ownAiEnabled: true });
  useRecordAiRunStore.getState().reset();
});

afterEach(() => {
  cleanup();
});

describe('실험실 스위치가 화면을 가른다', () => {
  it('★꺼져 있으면 행에 [AI ▸] 가 없다 — 안 쓰는 선생님 화면은 그대로다', () => {
    useAssistStore.setState({ ownAiEnabled: false });
    view();
    expect(screen.queryAllByRole('button', { name: /AI 초안$/ })).toHaveLength(0);
  });

  it('켜면 학생마다 [AI ▸] 가 붙고, 패널은 **눌러야** 그 학생으로 열린다(ADR-093: 닫힌 패널은 폭이 없다)', () => {
    view({ openPanel: false });
    expect(screen.getAllByRole('button', { name: /AI 초안$/ })).toHaveLength(2);
    expect(screen.queryByTestId('ai-panel')).toBeNull();
    expect(screen.queryByRole('complementary', { name: '고른 학생 패널' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '김지훈 AI 초안' }));
    expect(screen.getByText('김지훈 AI 패널')).toBeTruthy();
    // ✕ 로 닫으면 패널 자체가 사라진다 — 빈 폭을 남기지 않는다.
    fireEvent.click(screen.getByRole('button', { name: '패널 닫기' }));
    expect(screen.queryByRole('complementary', { name: '고른 학생 패널' })).toBeNull();
  });

  it('★쌤핀 AI 도크와 초안 패널은 둘 중 하나만 열린다 — 도크를 열면 패널이 닫히고, [AI ▸]는 도크를 닫는다', async () => {
    useAssistStore.setState({ enabled: true, open: false });
    view();
    expect(screen.getByRole('complementary', { name: '고른 학생 패널' })).toBeTruthy();
    await act(async () => useAssistStore.getState().setOpen(true));
    expect(screen.queryByRole('complementary', { name: '고른 학생 패널' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '박서연 AI 초안' }));
    expect(useAssistStore.getState().open).toBe(false);
    expect(screen.getByRole('complementary', { name: '고른 학생 패널' })).toBeTruthy();
    // 패널 안에 쌤핀 AI 탭은 없다.
    expect(screen.queryByRole('tab', { name: '쌤핀 AI' })).toBeNull();
    useAssistStore.setState({ enabled: false });
  });

  it('[근거 N건] 을 누르면 패널이 [근거] 탭으로 그 학생에게 열린다', () => {
    view({ openPanel: false });
    fireEvent.click(screen.getByRole('button', { name: /박서연 근거 1건 보기/ }));
    const panel = screen.getByRole('complementary', { name: '고른 학생 패널' });
    expect(panel.textContent).toContain('박서연');
    expect(screen.getByRole('tab', { name: '근거' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByTestId('ai-panel')).toBeNull();
  });
});

describe('★고른 학생이 패널을 정한다 (P1)', () => {
  it('[AI ▸] 를 누르면 그 학생으로 바뀐다', () => {
    view();
    fireEvent.click(screen.getByRole('button', { name: '박서연 AI 초안' }));
    expect(screen.getByText('박서연 AI 패널')).toBeTruthy();
    expect(screen.queryByText('김지훈 AI 패널')).toBeNull();
  });

  it('편집 칸에 포커스하면 그 학생으로 바뀐다', () => {
    view();
    fireEvent.focus(screen.getByRole('textbox', { name: /박서연/ }));
    expect(screen.getByText('박서연 AI 패널')).toBeTruthy();
  });

  it('[미분류 N건] 을 누르면 근거 정리 보드가 **그 학생·현재 영역**으로 열린다', () => {
    view();
    fireEvent.click(screen.getAllByRole('button', { name: /미분류 1건/ })[0]!);
    const board = screen.getByTestId('evidence-board');
    expect(board.getAttribute('data-student')).toBe('sA');
    expect(board.getAttribute('data-area')).toBe('subject');
  });
});

describe('★성취기준은 키워드만 나간다 — 원문은 앱 안에 머문다', () => {
  it('패널에는 키워드가 실리고 원문 문장은 없다', () => {
    view();
    const target = lastProps()['target'] as { standardKeywords?: readonly string[] };
    expect(target.standardKeywords).toEqual(['일차함수', '그래프', '일차방정식']);
    const dumped = JSON.stringify(panelProps);
    expect(dumped).not.toContain('이해한다');
    expect(dumped).not.toContain(STANDARD.text);
  });
});

describe('학생별 재료가 섞이지 않는다', () => {
  it('패널은 고른 학생의 근거만 받는다', () => {
    view();
    const a = lastProps()['target'] as { evidences: readonly { studentRef: string }[] };
    expect(a.evidences.every((e) => e.studentRef === 'sA')).toBe(true);
    const all = lastProps()['studentEvidences'] as readonly { studentRef: string }[];
    expect(all.every((e) => e.studentRef === 'sA')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: '박서연 AI 초안' }));
    const b = lastProps()['target'] as {
      displayName: string;
      evidences: readonly { studentRef: string }[];
    };
    expect(b.displayName).toBe('박서연');
    expect(b.evidences.every((e) => e.studentRef === 'sB')).toBe(true);
  });

  it('★가릴 명단(roster)을 넘긴다 — 이 반 학생 전원의 이름이 들어 있다', () => {
    view();
    const roster = lastProps()['roster'] as readonly { label: string; values: readonly string[] }[];
    const names = roster.find((g) => g.label === '이름')?.values ?? [];
    expect(names).toEqual(expect.arrayContaining(['김지훈', '박서연']));
  });

  it('판 저장 키는 고른 학생·영역·과목이다', () => {
    view();
    expect(lastProps()['draftKey']).toEqual({
      area: 'subject',
      studentRef: 'sA',
      subject: '수학',
      classId: 'c1',
    });
  });
});

describe('"남은 학생 모두"는 아직 안 쓴 학생만 고른다', () => {
  it('이미 초안이 있는 학생은 빠진다 — 손으로 쓴 글을 덮지 않는다', () => {
    drafts.byRef = {
      sB: {
        id: 'd-B',
        area: 'subject',
        studentRef: 'sB',
        content: '선생님이 직접 쓴 초안',
        status: 'draft',
        basisObservationIds: [],
        groundingFlags: [],
        createdAt: 1,
        updatedAt: 1,
      },
    };
    view();
    const remaining = (lastProps()['remaining'] ?? []) as readonly { displayName: string }[];
    expect(remaining.map((r) => r.displayName)).toEqual([]);
  });

  it('아무도 안 썼으면 자기 자신만 뺀 나머지가 대상이다', () => {
    view();
    const remaining = (lastProps()['remaining'] ?? []) as readonly { displayName: string }[];
    expect(remaining.map((r) => r.displayName)).toEqual(['박서연']);
  });
});

describe('★저장은 학생 키로 찾는다 — 목록 위치로 찾지 않는다', () => {
  it('두 번째 학생분을 저장하면 그 학생 칸에 들어간다', async () => {
    view();
    const onApply = lastProps()['onApply'] as (
      ref: string,
      text: string,
      marks: unknown,
    ) => Promise<void>;
    await onApply('sB', '박서연 학생 초안', [{ role: 'motive', text: '박서연 학생 초안' }]);

    expect(upsertSpy).toHaveBeenCalledTimes(1);
    const input = (upsertSpy.mock.calls as unknown[][])[0]?.[0] as {
      studentRef: string;
      studentKey?: string;
      content: string;
      area: string;
      roleMarks?: unknown;
    };
    expect(input.studentRef).toBe('sB');
    expect(input.studentKey).toBe('2');
    expect(input.content).toBe('박서연 학생 초안');
    expect(input.area).toBe('subject');
    expect(input.roleMarks).toEqual([{ role: 'motive', text: '박서연 학생 초안' }]);
  });

  it('명단에 없는 학생이면 아무 데도 저장하지 않는다', async () => {
    view();
    const onApply = lastProps()['onApply'] as (ref: string, text: string) => Promise<void>;
    await onApply('없는학생', '아무 글');
    expect(upsertSpy).not.toHaveBeenCalled();
  });
});

describe('★"미작성" 필터에서 실행 중인 행은 사라지지 않는다 (UltraQA P1)', () => {
  const DRAFT_A = {
    id: 'd-A',
    area: 'subject',
    studentRef: 'sA',
    content: 'AI 가 쓴 초안',
    status: 'draft',
    basisObservationIds: [],
    groundingFlags: [],
    createdAt: 1,
    updatedAt: 1,
  };

  it('실행 중이라고 알린 행은 초안이 생겨도 남고, 끝났다고 알리면 그제야 빠진다', async () => {
    const r = view();
    fireEvent.click(screen.getByRole('button', { name: '미작성' }));
    expect(screen.getAllByRole('button', { name: /AI 초안$/ })).toHaveLength(2);

    // 실행 스토어에 "김지훈·박서연 실행 중"이 든다(남은 학생 모두를 누른 상황). 패널 콜백이 아니라 스토어다(ADR-093).
    await act(async () =>
      useRecordAiRunStore.getState().setDraftPhase('c1:subject:수학', {
        kind: 'running',
        done: 0,
        total: 2,
        name: '김지훈',
        studentRef: 'sA',
        // 실제 큐는 지금 쓰는 학생부터 시작한다(queue.slice(i)).
        queue: [
          { studentRef: 'sA', displayName: '김지훈', evidences: [] },
          { studentRef: 'sB', displayName: '박서연', evidences: [] },
        ],
      }),
    );

    // 첫 [반영] — 김지훈에게 초안이 생긴다 → 미작성 필터에서는 원래 빠질 학생
    drafts.byRef = { sA: DRAFT_A };
    r.rerender(element());
    expect(screen.getByRole('button', { name: '김지훈 AI 초안' })).toBeTruthy(); // ★붙들려 있다

    // 실행이 끝났다 → 이제 필터대로 빠진다
    await act(async () =>
      useRecordAiRunStore.getState().setDraftPhase('c1:subject:수학', { kind: 'idle' }),
    );
    expect(screen.queryByRole('button', { name: '김지훈 AI 초안' })).toBeNull();
    expect(screen.getByRole('button', { name: '박서연 AI 초안' })).toBeTruthy();
  });
});

describe('★형광펜 스위치가 꺼져 있으면 편집 칸 뒤에 거울 레이어가 없다', () => {
  it('표식이 있는 초안이라도 스위치 off 면 레이어 0개', () => {
    drafts.byRef = {
      sA: {
        id: 'd-A',
        area: 'subject',
        studentRef: 'sA',
        content: '동기 문단.\n\n과정 문단.',
        roleMarks: [
          { role: 'motive', text: '동기 문단.' },
          { role: 'process', text: '과정 문단.' },
        ],
        status: 'draft',
        basisObservationIds: [],
        groundingFlags: [],
        createdAt: 1,
        updatedAt: 1,
      },
    };
    view();
    expect(screen.queryAllByTestId('role-highlight-layer')).toHaveLength(0);
    // 배지 자체는 스위치와 무관하게 뜬다(작성 방식은 형광펜을 꺼도 그대로 적용된다). 색점만 없다.
    expect(screen.getByTestId('record-style-legend')).toBeTruthy();
    expect(screen.queryAllByTestId('legend-role-dot')).toHaveLength(0);

    // 켜면 표식 있는 행에만 레이어가 깔리고, 배지에 형광펜 색점이 붙는다.
    cleanup();
    settingsState.settings = { recordHighlightOn: true };
    view();
    expect(screen.getAllByTestId('role-highlight-layer')).toHaveLength(1);
    expect(screen.queryAllByTestId('legend-role-dot').length).toBeGreaterThan(0);
  });
});

describe('★C0 (ㄴ) 저장이 거부된 글은 초점을 잃어도 화면에 남는다', () => {
  /**
   * 되돌리기 효과가 `focused` 를 의존 목록에 두고 있어 **초점이 빠지는 것만으로** 다시 돈다.
   * 한도 초과로 저장이 거부되면 `draft.content` 는 옛 글이라, 막지 않으면 방금 쓴 글이 사라진다.
   * 붉은 오류만 남고 글이 없어지므로 선생님은 무엇을 잃었는지도 모른다.
   * ★이 결함은 검증 게이트 4종이 전부 초록인 채 존재했다.
   */
  const OLD = '저장되어 있던 옛 글.';
  const TYPED = '한도를 넘겨 새로 쓴 긴 글.';

  function withSavedDraft(): void {
    drafts.byRef = {
      sA: {
        id: 'd-A',
        area: 'subject',
        studentRef: 'sA',
        content: OLD,
        status: 'draft',
        basisObservationIds: [],
        groundingFlags: [],
        createdAt: 1,
        updatedAt: 1,
      },
    };
  }

  it('저장이 거부되어도 방금 쓴 글이 그대로 있다', async () => {
    withSavedDraft();
    upsertSpy.mockRejectedValueOnce(new Error('1,782바이트로 한도 1,500바이트를 넘었습니다.'));
    vi.useFakeTimers();
    view();

    const box = screen.getByRole('textbox', { name: /김지훈/ }) as HTMLTextAreaElement;
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: TYPED } });
    // 자동저장(700밀리초)이 돌아 거부당한다.
    await act(async () => {
      vi.advanceTimersByTime(800);
    });
    vi.useRealTimers();

    // 여기서 초점이 빠진다 — 되돌리기 효과가 다시 도는 순간이다.
    await act(async () => {
      fireEvent.blur(box);
    });

    expect(box.value).toBe(TYPED); // ★옛 글로 되돌아가면 안 된다
    expect(box.value).not.toBe(OLD);
  });

  it('저장이 성공하면 자동 입력 경로는 그대로 산다 (AI 반영·동기화)', async () => {
    withSavedDraft();
    const r = view();
    const box = screen.getByRole('textbox', { name: /김지훈/ }) as HTMLTextAreaElement;
    expect(box.value).toBe(OLD);

    // 저장 시각이 나중인 새 내용이 밖에서 들어오면(AI 반영·동기화) 화면이 따라가야 한다.
    drafts.byRef['sA'] = {
      ...(drafts.byRef['sA'] as Record<string, unknown>),
      content: 'AI 가 반영한 글.',
      updatedAt: Date.now() + 60_000,
    };
    await act(async () => {
      r.rerender(element());
    });

    expect((screen.getByRole('textbox', { name: /김지훈/ }) as HTMLTextAreaElement).value).toBe(
      'AI 가 반영한 글.',
    );
  });
});

// ───────────────────────── 학생별 집중 보기 (ADR-093) ─────────────────────────

describe('★학생별 집중 보기 — 기본 보기, 학생 목록 + 한 명의 넓은 본문', () => {
  beforeEach(() => {
    settingsState.settings = {};
  });

  it('설정이 없으면 집중 보기다: 학생 목록이 있고 편집 칸은 고른 학생 하나뿐이다', () => {
    view({ openPanel: false });
    expect(screen.getByTestId('focus-layout')).toBeTruthy();
    expect(screen.getByTestId('student-list')).toBeTruthy();
    expect(screen.getAllByRole('textbox', { name: /초안$/ })).toHaveLength(1);
    expect(screen.getByRole('textbox', { name: /김지훈/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: '집중 보기' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('목록에서 학생을 누르면 본문이 그 학생으로 바뀌고 오른쪽 패널 재료도 따라간다', () => {
    view({ openPanel: false });
    fireEvent.click(screen.getByRole('button', { name: '2번 박서연 보기' }));
    expect(screen.getByRole('textbox', { name: /박서연/ })).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: /김지훈/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '박서연 AI 초안' }));
    expect(screen.getByText('박서연 AI 패널')).toBeTruthy();
  });

  it('Ctrl+Enter 는 저장을 밀어 넣은 뒤 다음 학생으로 넘어간다(연속 작성 유지)', async () => {
    view({ openPanel: false });
    await act(async () => {
      fireEvent.keyDown(screen.getByRole('textbox', { name: /김지훈/ }), {
        key: 'Enter',
        ctrlKey: true,
      });
    });
    expect(screen.getByRole('textbox', { name: /박서연/ })).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: /김지훈/ })).toBeNull();
  });

  it('★Ctrl+Enter 에서 저장이 거부되면(한도 초과) 넘어가지 않고 오류를 보여 준다', async () => {
    upsertSpy.mockRejectedValueOnce(new Error('한도 1,500바이트를 넘었습니다.'));
    view({ openPanel: false });
    const ta = screen.getByRole('textbox', { name: /김지훈/ });
    fireEvent.change(ta, { target: { value: '아주 긴 글' } });
    await act(async () => {
      fireEvent.keyDown(ta, { key: 'Enter', ctrlKey: true });
    });
    expect(screen.getByRole('textbox', { name: /김지훈/ })).toBeTruthy();
    expect(screen.getByText('저장하지 못했습니다.')).toBeTruthy();
  });

  it('★타이핑한 뒤 저장본이 더 새로워지면(AI 반영·동기화) 옛 글로 되돌리지 않는다(리뷰 지적 1)', async () => {
    const r = view({ openPanel: false });
    fireEvent.change(screen.getByRole('textbox', { name: /김지훈/ }), {
      target: { value: '가나다' },
    });
    // AI [반영]으로 저장본이 갱신됐다 — 등록부의 "가나다"보다 새롭다.
    drafts.byRef = {
      sA: {
        id: 'd-A',
        area: 'subject',
        studentRef: 'sA',
        content: 'AI 가 쓴 초안',
        status: 'draft',
        basisObservationIds: [],
        groundingFlags: [],
        createdAt: 1,
        updatedAt: Date.now() + 60_000,
      },
    };
    r.rerender(element());
    fireEvent.click(screen.getByRole('button', { name: '2번 박서연 보기' }));
    fireEvent.click(screen.getByRole('button', { name: '1번 김지훈 보기' }));
    expect((screen.getByRole('textbox', { name: /김지훈/ }) as HTMLTextAreaElement).value).toBe(
      'AI 가 쓴 초안',
    );
  });

  it('[이전]/[다음] 단추로도 옮긴다 — 첫 학생에서는 [이전]이 잠긴다', () => {
    view({ openPanel: false });
    expect((screen.getByRole('button', { name: '이전 학생' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.click(screen.getByRole('button', { name: '다음 학생' }));
    expect(screen.getByRole('textbox', { name: /박서연/ })).toBeTruthy();
    expect((screen.getByRole('button', { name: '다음 학생' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('★미저장 글은 학생을 바꿨다 돌아와도 편집 칸에 남는다(P8: 등록부에서 되살린다)', () => {
    view({ openPanel: false });
    const ta = screen.getByRole('textbox', { name: /김지훈/ }) as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: '아직 저장 안 된 글' } });
    fireEvent.click(screen.getByRole('button', { name: '2번 박서연 보기' }));
    fireEvent.click(screen.getByRole('button', { name: '1번 김지훈 보기' }));
    expect((screen.getByRole('textbox', { name: /김지훈/ }) as HTMLTextAreaElement).value).toBe(
      '아직 저장 안 된 글',
    );
  });

  it('★보기를 바꿔도(집중 → 전체) 미저장 글과 고른 학생이 남는다', async () => {
    const r = view({ openPanel: false });
    fireEvent.click(screen.getByRole('button', { name: '2번 박서연 보기' }));
    fireEvent.change(screen.getByRole('textbox', { name: /박서연/ }), {
      target: { value: '박서연 미저장' },
    });
    fireEvent.click(screen.getByRole('button', { name: '전체 훑어보기' }));
    // 설정 갱신은 흉내 스토어를 거친다 — 값을 직접 넣고 다시 그린다.
    settingsState.settings = { recordDraftViewMode: 'overview' };
    r.rerender(element());
    expect(screen.queryByTestId('focus-layout')).toBeNull();
    expect(screen.getAllByRole('textbox', { name: /초안$/ })).toHaveLength(2);
    expect((screen.getByRole('textbox', { name: /박서연/ }) as HTMLTextAreaElement).value).toBe(
      '박서연 미저장',
    );
    // 전체 → 집중으로 돌아와도 같다.
    settingsState.settings = {};
    r.rerender(element());
    expect((screen.getByRole('textbox', { name: /박서연/ }) as HTMLTextAreaElement).value).toBe(
      '박서연 미저장',
    );
  });

  it('보기 단추는 설정에 기록한다', () => {
    const update = vi.fn(async () => {});
    settingsState.update = update;
    view({ openPanel: false });
    fireEvent.click(screen.getByRole('button', { name: '전체 훑어보기' }));
    expect(update).toHaveBeenCalledWith({ recordDraftViewMode: 'overview' });
    settingsState.update = async () => {};
  });

  it('★체크한 학생들이 패널에 "고른 N명"으로 넘어간다(초안 있는 학생은 existingText 포함)', () => {
    drafts.byRef = {
      sB: {
        id: 'd-B',
        area: 'subject',
        studentRef: 'sB',
        content: '박서연 기존 글',
        status: 'draft',
        basisObservationIds: [],
        groundingFlags: [],
        createdAt: 1,
        updatedAt: 1,
      },
    };
    view({ openPanel: false });
    fireEvent.click(screen.getByRole('checkbox', { name: '박서연 초안 생성 대상으로 고르기' }));
    expect(screen.getByText('고른 1명')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '김지훈 AI 초안' }));
    const picked = lastProps()['picked'] as readonly {
      studentRef: string;
      existingText?: string;
    }[];
    expect(picked.map((p) => p.studentRef)).toEqual(['sB']);
    expect(picked[0]?.existingText).toBe('박서연 기존 글');
    // [선택 해제] 로 비운다.
    fireEvent.click(screen.getByRole('button', { name: '선택 해제' }));
    expect((lastProps()['picked'] as readonly unknown[]).length).toBe(0);
  });

  it('[미작성 전체 고르기]는 보이는 학생 중 초안이 없는 학생만 고른다', () => {
    drafts.byRef = {
      sA: {
        id: 'd-A',
        area: 'subject',
        studentRef: 'sA',
        content: '김지훈 글',
        status: 'draft',
        basisObservationIds: [],
        groundingFlags: [],
        createdAt: 1,
        updatedAt: 1,
      },
    };
    view({ openPanel: false });
    fireEvent.click(screen.getByRole('button', { name: '미작성 전체 고르기' }));
    expect(screen.getByText('고른 1명')).toBeTruthy();
    expect(
      (
        screen.getByRole('checkbox', {
          name: '박서연 초안 생성 대상으로 고르기',
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
  });

  it('[미작성 전체 고르기]는 검색으로 걸러진 학생만 고른다(리뷰 지적 4)', () => {
    view({ openPanel: false });
    fireEvent.change(screen.getByRole('searchbox', { name: '학생 찾기' }), {
      target: { value: '김' },
    });
    fireEvent.click(screen.getByRole('button', { name: '미작성 전체 고르기' }));
    expect(screen.getByText('고른 1명')).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox', { name: '학생 찾기' }), {
      target: { value: '' },
    });
    expect(
      (
        screen.getByRole('checkbox', {
          name: '박서연 초안 생성 대상으로 고르기',
        }) as HTMLInputElement
      ).checked,
    ).toBe(false);
  });

  it('실험실 스위치가 꺼져 있으면 체크 상자가 없다(AI 초안 대상 고르기라서)', () => {
    useAssistStore.setState({ ownAiEnabled: false });
    view({ openPanel: false });
    expect(screen.queryAllByRole('checkbox', { name: /초안 생성 대상/ })).toHaveLength(0);
  });

  it('실행 중이면 [AI 도움] 단추에 진행 표시가 붙는다(패널이 닫혀 있어도 결과로 돌아갈 수 있다)', async () => {
    view({ openPanel: false });
    await act(async () =>
      useRecordAiRunStore.getState().setDraftPhase('c1:subject:수학', {
        kind: 'running',
        done: 0,
        total: 1,
        name: '김지훈',
        studentRef: 'sA',
        queue: [],
      }),
    );
    expect(screen.getByLabelText('AI 실행 중')).toBeTruthy();
    await act(async () =>
      useRecordAiRunStore.getState().setDraftPhase('c1:subject:수학', {
        kind: 'preview',
        studentRef: 'sA',
        name: '김지훈',
        queue: [],
      }),
    );
    expect(screen.getByLabelText('AI 결과 있음')).toBeTruthy();
  });
});

describe('★배치 규칙 resolveListMode — 본문 560px 을 못 확보하면 목록을 선택기로 접는다', () => {
  it('폭을 모르면 목록', () => {
    expect(resolveListMode(null, true, 380)).toBe('list');
  });
  it('패널 열림: 224 + 380 + 32(안쪽 여백) + 560 = 1196 이상이면 목록, 아래면 선택기', () => {
    expect(resolveListMode(1196, true, 380)).toBe('list');
    expect(resolveListMode(1195, true, 380)).toBe('selector');
  });
  it('패널 닫힘: 224 + 32 + 560 = 816 이상이면 목록', () => {
    expect(resolveListMode(816, false, 380)).toBe('list');
    expect(resolveListMode(815, false, 380)).toBe('selector');
  });
});
