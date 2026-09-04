/**
 * @vitest-environment jsdom
 *
 * 근거 창고 주제 축 — **학생을 바꿔도 앞 학생의 주제가 따라붙지 않는다.**
 *
 * 왜 이 테스트가 있나: Phase 2 에서 "고른 관찰 슬롯이 다음 학생에게 그대로 옮겨 붙어" 남의 학생
 * 기록칸에 값이 들어간 사고가 실제로 있었다(ADR-072 회고). 주제는 학생마다 다른 것이라 같은 실수가
 * 나면 **A 학생의 주제로 B 학생 근거를 묶는** 일이 벌어진다. 게이트 4종이 전부 초록인 채로 존재할
 * 수 있는 결함이라 화면 상태 전환을 직접 눌러 본다.
 *
 * 전환 경로를 전수로 본다: ① 학생 단추 클릭 ② 명단이 바뀌어 선택이 밀리는 경우(리셋).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { areasForContext } from '@domain/entities/RecordDraft';

const AREA = areasForContext('high', 'teaching')[0]!;

// vi.mock 팩토리는 파일 맨 위로 끌어올려진다 — 거기서 쓸 값은 vi.hoisted 안에서 만들어야 한다.
const { THREADS, EVIDENCE, setThreadSpy, fakeStore } = vi.hoisted(() => {
  const area = 'subject';
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
  ];
  const evidence = [
    {
      id: 'e-A1',
      studentRef: 'sA',
      areas: [area],
      content: 'A학생 기회비용 근거 (주제에 묶임)',
      threadId: 'thr-A',
      sourceType: 'manual' as const,
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 'e-A2',
      studentRef: 'sA',
      areas: [area],
      content: 'A학생 미분류 근거',
      sourceType: 'manual' as const,
      createdAt: 2,
      updatedAt: 2,
    },
    {
      id: 'e-B1',
      studentRef: 'sB',
      areas: [area],
      content: 'B학생 미분류 근거 하나',
      sourceType: 'manual' as const,
      createdAt: 3,
      updatedAt: 3,
    },
    {
      id: 'e-B2',
      studentRef: 'sB',
      areas: [area],
      content: 'B학생 미분류 근거 둘',
      sourceType: 'manual' as const,
      createdAt: 4,
      updatedAt: 4,
    },
  ];
  const spy = vi.fn(async () => {});
  const store = <T extends object>(state: T) => {
    const hook = (sel?: (s: T) => unknown) => (sel ? sel(state) : state);
    hook.getState = () => state;
    hook.setState = () => {};
    return hook;
  };
  return { THREADS: threads, EVIDENCE: evidence, setThreadSpy: spy, fakeStore: store };
});

// 위 hoisted 블록의 area 상수가 실제 첫 영역과 어긋나면 목록이 통째로 비어 테스트가 헛돈다.
if (AREA !== 'subject') {
  throw new Error(`교과 첫 영역이 'subject' 가 아니다: ${AREA} — 테스트 데이터를 맞춰야 한다.`);
}

vi.mock('@adapters/stores/useRecordEvidenceStore', () => ({
  useRecordEvidenceStore: fakeStore({
    records: EVIDENCE,
    loaded: true,
    load: async () => {},
    add: async () => 'x',
    addMany: async () => 0,
    update: async () => {},
    remove: async () => {},
    setExcludedFromAi: async () => {},
    setThread: setThreadSpy,
  }),
}));
vi.mock('@adapters/stores/useInquiryThreadStore', () => ({
  useInquiryThreadStore: fakeStore({
    records: THREADS,
    loaded: true,
    load: async () => {},
    add: async () => 'new',
    update: async () => {},
    remove: async () => {},
  }),
}));
vi.mock('@adapters/stores/useObservationStore', () => ({
  useObservationStore: fakeStore({ records: [], load: async () => {} }),
}));
vi.mock('@adapters/stores/useStudentRecordsStore', () => ({
  useStudentRecordsStore: fakeStore({ records: [], load: async () => {} }),
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
vi.mock('@adapters/stores/useObservationAttachmentStore', () => ({
  useObservationAttachmentStore: fakeStore({ attachments: [], load: async () => {} }),
}));
vi.mock('@adapters/stores/useAssignmentStore', () => ({
  useAssignmentStore: fakeStore({ submissions: [], assignments: [] }),
}));
vi.mock('@adapters/analytics/trackEventSafely', () => ({ trackEventSafely: () => {} }));
vi.mock('@infrastructure/export/EvidenceExcel', () => ({
  exportEvidenceTemplateToExcel: async () => new Uint8Array(),
  parseEvidenceFromExcel: async () => [],
  ExcelReadError: class extends Error {},
}));

import { RecordEvidenceView } from '../RecordEvidenceView';

const STUDENTS = [
  { studentRef: 'sA', number: 1, name: '가학생', studentKey: '3-1-1' },
  { studentRef: 'sB', number: 2, name: '나학생', studentKey: '3-1-2' },
];

function renderView(students = STUDENTS) {
  return render(
    <RecordEvidenceView
      context="teaching"
      level="high"
      students={students}
      classId="c1"
      headless
    />,
  );
}

/** 주제 칩 줄 안에서만 찾는다 — 근거 카드에도 같은 이름의 주제 배지가 있어 화면 전체로 찾으면 모호하다. */
function chips() {
  return within(screen.getByRole('group', { name: '주제(탐구 흐름)로 나눠 보기' }));
}

afterEach(() => {
  cleanup();
  setThreadSpy.mockClear();
});

describe('근거 창고 주제 축 — 학생 경계', () => {
  it('선택한 학생의 주제만 칩으로 보인다', () => {
    renderView();
    expect(chips().getByRole('button', { name: /할인 문구와 선택/ })).toBeTruthy();
    expect(chips().queryByRole('button', { name: /세포 관찰/ })).toBeNull();
  });

  it('★학생을 바꾸면 앞 학생의 주제 선택이 풀린다 — 주제 칩도 그 학생 것으로 바뀐다', () => {
    renderView();

    // A 학생의 주제를 고른다 → 흐름 화면이 펼쳐진다.
    fireEvent.click(chips().getByRole('button', { name: /할인 문구와 선택/ }));
    expect(screen.getByLabelText('할인 문구와 선택 탐구 흐름')).toBeTruthy();

    // B 학생으로 전환.
    fireEvent.click(screen.getByRole('button', { name: /나학생/ }));

    // 앞 학생의 흐름 화면이 남아 있으면 안 된다.
    expect(screen.queryByLabelText('할인 문구와 선택 탐구 흐름')).toBeNull();
    // 앞 학생의 주제 칩도 사라져야 한다.
    expect(chips().queryByRole('button', { name: /할인 문구와 선택/ })).toBeNull();
    expect(chips().getByRole('button', { name: /세포 관찰/ })).toBeTruthy();
    // B 학생 근거가 걸러지지 않고 그대로 보인다(앞 학생 주제로 필터가 남으면 0건이 된다).
    expect(screen.getByText('B학생 미분류 근거 하나')).toBeTruthy();
    expect(screen.getByText('B학생 미분류 근거 둘')).toBeTruthy();
  });

  it('★학생을 바꾸면 체크해 둔 근거도 비워진다 — 남의 학생 근거가 딸려 묶이지 않는다', () => {
    renderView();

    // A 학생 근거를 체크한다.
    const box = screen.getByLabelText(/A학생 미분류 근거 근거 선택/);
    fireEvent.click(box);
    expect(screen.getByText('1건 선택됨')).toBeTruthy();

    // B 학생으로 전환하면 선택 막대가 사라진다.
    fireEvent.click(screen.getByRole('button', { name: /나학생/ }));
    expect(screen.queryByText(/건 선택됨/)).toBeNull();
    // 묶기 저장은 한 번도 불리지 않았다.
    expect(setThreadSpy).not.toHaveBeenCalled();
  });

  it('★명단이 바뀌어 선택 학생이 밀려도 주제 선택이 초기화된다(리셋 경로)', () => {
    const { rerender } = renderView();
    fireEvent.click(chips().getByRole('button', { name: /할인 문구와 선택/ }));
    expect(screen.getByLabelText('할인 문구와 선택 탐구 흐름')).toBeTruthy();

    // 가학생이 명단에서 빠진다(전학·자퇴) → 선택이 나학생으로 밀린다.
    rerender(
      <RecordEvidenceView
        context="teaching"
        level="high"
        students={[STUDENTS[1]!]}
        classId="c1"
        headless
      />,
    );
    expect(screen.queryByLabelText('할인 문구와 선택 탐구 흐름')).toBeNull();
    expect(chips().queryByRole('button', { name: /할인 문구와 선택/ })).toBeNull();
  });

  it('주제를 안 쓰면 창고는 지금까지와 똑같다 — 기본은 전체이고 근거가 다 보인다', () => {
    renderView();
    expect(screen.getByText('A학생 기회비용 근거 (주제에 묶임)')).toBeTruthy();
    expect(screen.getByText('A학생 미분류 근거')).toBeTruthy();
  });

  it('"이것도 이 주제?" 는 키워드가 겹칠 때만 뜬다', () => {
    renderView();
    // A 학생의 미분류 근거에는 '기회비용' 이 없다 → 제안 없음.
    expect(screen.queryByText('이것도 이 주제?')).toBeNull();
  });
});
