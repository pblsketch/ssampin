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

import { RecordDraftView } from '../RecordDraftView';
import { useAssistStore } from '@adapters/stores/useAssistStore';

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

function view() {
  return render(element());
}

const lastProps = (): Record<string, unknown> => panelProps[panelProps.length - 1] ?? {};

beforeEach(() => {
  panelProps.length = 0;
  upsertSpy.mockClear();
  drafts.byRef = {};
  settingsState.settings = {};
  useAssistStore.setState({ ownAiEnabled: true });
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

  it('켜면 학생마다 [AI ▸] 가 붙고, 패널은 첫 학생으로 열린다', () => {
    view();
    expect(screen.getAllByRole('button', { name: /AI 초안$/ })).toHaveLength(2);
    expect(screen.getByText('김지훈 AI 패널')).toBeTruthy();
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

    // 패널이 "김지훈·박서연 실행 중"을 알린다(남은 학생 모두를 누른 상황)
    const onActiveChange = lastProps()['onActiveChange'] as (refs: readonly string[]) => void;
    await act(async () => onActiveChange(['sA', 'sB']));

    // 첫 [반영] — 김지훈에게 초안이 생긴다 → 미작성 필터에서는 원래 빠질 학생
    drafts.byRef = { sA: DRAFT_A };
    r.rerender(element());
    expect(screen.getByRole('button', { name: '김지훈 AI 초안' })).toBeTruthy(); // ★붙들려 있다

    // 실행이 끝났다 → 이제 필터대로 빠진다
    await act(async () => onActiveChange([]));
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

    // 켜면 표식 있는 행에만 레이어가 깔리고, 범례가 정보 바에 뜬다.
    cleanup();
    settingsState.settings = { recordHighlightOn: true };
    view();
    expect(screen.getAllByTestId('role-highlight-layer')).toHaveLength(1);
    expect(screen.getByLabelText('형광펜 범례')).toBeTruthy();
  });
});
