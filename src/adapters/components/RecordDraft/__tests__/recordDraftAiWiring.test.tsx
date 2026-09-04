/**
 * @vitest-environment jsdom
 *
 * T6 통합 — 생기부 초안 화면에 [AI로 초안 쓰기]를 꽂은 배선.
 *
 * 여기서 지키는 것은 **화면이 버튼에 무엇을 넘기는가**다. 버튼 안쪽 동작은
 * `RecordDraftAiButton.test.tsx` 가 따로 지킨다. 이 파일이 없으면 다음이 조용히 깨진다:
 *
 * 1. 실험실 스위치를 안 켠 선생님 화면이 바뀐다(안 쓰는 기능이 자리를 차지한다).
 * 2. **성취기준 원문이 AI 로 나간다** — 화면에는 원문(`standardTexts`)과 키워드가 나란히 있고
 *    이름이 비슷하다. 잘못 넘기면 모델이 성취기준 문장을 그대로 옮겨 적는다(실측 C 사례).
 * 3. **남의 학생 칸에 저장된다** — 필터가 걸리면 화면 순서와 명단 순서가 다르다.
 * 4. 이미 쓴 초안이 "남은 학생 모두"에 섞여 덮어써진다.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { areasForContext } from '@domain/entities/RecordDraft';

const AREA = areasForContext('high', 'teaching')[0]!;
if (AREA !== 'subject') {
  throw new Error(`교과 첫 영역이 'subject' 가 아니다: ${AREA} — 테스트 데이터를 맞춰야 한다.`);
}

const { EVIDENCE, STANDARD, upsertSpy, buttonProps, fakeStore, drafts } = vi.hoisted(() => {
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
    /** 화면이 버튼에 넘긴 props — 학생별로 모은다. */
    buttonProps: [] as Record<string, unknown>[],
    fakeStore: store,
    /** 이미 쓴 초안(테스트마다 갈아 끼운다). */
    drafts: { byRef: {} as Record<string, Record<string, unknown> | undefined> },
  };
});

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

// 성취기준 자료 1.5MB 를 테스트에서 읽지 않는다 — 코드 하나짜리 색인을 대신 준다.
vi.mock('@adapters/hooks/useCurriculumStandards', () => ({
  useCurriculumStandards: () => ({
    // 색인 키는 대괄호·공백을 걷어낸 정규화 코드다(`indexByCode` 와 같은 규칙).
    data: { bundle: { standards: [STANDARD] }, index: new Map([['9수02-15', STANDARD]]) },
    loading: false,
  }),
}));

/** 버튼 본체는 따로 검증한다 — 여기서는 **무엇을 받았는지**만 본다. */
vi.mock('@adapters/components/RecordDraft/RecordDraftAiButton', () => ({
  RecordDraftAiButton: (props: Record<string, unknown>) => {
    buttonProps.push(props);
    const t = props['target'] as { displayName: string };
    return <div data-testid="ai-button">{t.displayName} AI 버튼</div>;
  },
}));

import { RecordDraftView } from '../RecordDraftView';
import { useAssistStore } from '@adapters/stores/useAssistStore';

const STUDENTS = [
  { studentRef: 'sA', number: 1, name: '김지훈', studentKey: '1' },
  { studentRef: 'sB', number: 2, name: '박서연', studentKey: '2' },
];

function view() {
  return render(
    <RecordDraftView
      context="teaching"
      level="high"
      students={STUDENTS}
      classId="c1"
      classSubject="수학"
      className="2학년 4반"
    />,
  );
}

beforeEach(() => {
  buttonProps.length = 0;
  upsertSpy.mockClear();
  drafts.byRef = {};
  useAssistStore.setState({ ownAiEnabled: true });
});

afterEach(() => {
  cleanup();
});

describe('실험실 스위치가 화면을 가른다', () => {
  it('★꺼져 있으면 버튼이 아예 없다 — 안 쓰는 선생님 화면은 그대로다', () => {
    useAssistStore.setState({ ownAiEnabled: false });

    view();

    expect(screen.queryAllByTestId('ai-button')).toHaveLength(0);
  });

  it('켜면 학생마다 하나씩 붙는다', () => {
    view();

    expect(screen.getAllByTestId('ai-button')).toHaveLength(2);
  });
});

describe('★성취기준은 키워드만 나간다 — 원문은 앱 안에 머문다', () => {
  it('버튼에는 키워드가 실리고 원문 문장은 없다', () => {
    view();

    const target = buttonProps[0]?.['target'] as { standardKeywords?: readonly string[] };
    expect(target.standardKeywords).toEqual(['일차함수', '그래프', '일차방정식']);
  });

  it('원문 문장이 버튼으로 넘어간 흔적이 없다', () => {
    view();

    const dumped = JSON.stringify(buttonProps);
    expect(dumped).not.toContain('이해한다');
    expect(dumped).not.toContain(STANDARD.text);
  });
});

describe('학생별 재료가 섞이지 않는다', () => {
  it('각 버튼은 자기 학생의 근거만 받는다', () => {
    view();

    const a = buttonProps[0]?.['target'] as {
      displayName: string;
      evidences: readonly { studentRef: string }[];
    };
    const b = buttonProps[1]?.['target'] as {
      displayName: string;
      evidences: readonly { studentRef: string }[];
    };

    expect(a.displayName).toBe('김지훈');
    expect(a.evidences.every((e) => e.studentRef === 'sA')).toBe(true);
    expect(b.displayName).toBe('박서연');
    expect(b.evidences.every((e) => e.studentRef === 'sB')).toBe(true);
  });

  it('★모델에게는 실명 대신 별칭이 간다', () => {
    view();

    for (const p of buttonProps) {
      const t = p['target'] as { studentAlias: string };
      expect(t.studentAlias).not.toContain('김지훈');
      expect(t.studentAlias).not.toContain('박서연');
      expect(t.studentAlias).toContain('［이름');
    }
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

    const a = buttonProps.find(
      (p) => (p['target'] as { displayName: string }).displayName === '김지훈',
    );
    const remaining = (a?.['remaining'] ?? []) as readonly { displayName: string }[];
    expect(remaining.map((r) => r.displayName)).toEqual([]);
  });

  it('아무도 안 썼으면 자기 자신만 뺀 나머지가 대상이다', () => {
    view();

    const a = buttonProps.find(
      (p) => (p['target'] as { displayName: string }).displayName === '김지훈',
    );
    const remaining = (a?.['remaining'] ?? []) as readonly { displayName: string }[];
    expect(remaining.map((r) => r.displayName)).toEqual(['박서연']);
  });
});

describe('★저장은 학생 키로 찾는다 — 목록 위치로 찾지 않는다', () => {
  it('두 번째 학생분을 저장하면 그 학생 칸에 들어간다', async () => {
    view();

    const onApply = buttonProps[0]?.['onApply'] as (ref: string, text: string) => Promise<void>;
    await onApply('sB', '박서연 학생 초안');

    expect(upsertSpy).toHaveBeenCalledTimes(1);
    const input = (upsertSpy.mock.calls as unknown[][])[0]?.[0] as {
      studentRef: string;
      studentKey?: string;
      content: string;
      area: string;
    };
    expect(input.studentRef).toBe('sB');
    expect(input.studentKey).toBe('2');
    expect(input.content).toBe('박서연 학생 초안');
    expect(input.area).toBe('subject');
  });

  it('명단에 없는 학생이면 아무 데도 저장하지 않는다', async () => {
    view();

    const onApply = buttonProps[0]?.['onApply'] as (ref: string, text: string) => Promise<void>;
    await onApply('없는학생', '아무 글');

    expect(upsertSpy).not.toHaveBeenCalled();
  });
});
