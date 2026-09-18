/**
 * @vitest-environment jsdom
 *
 * 빠른 학생 기록 — 실제로 그려서 확인하는 검사.
 *
 * ★여기서 막으려는 사고: (1) 저장 위치를 고르지 않았는데 저장되는 것, (2) 저장에 실패했는데
 * 화면이 비워져 선생님이 쓴 글이 사라지는 것, (3) 여러 명 기록에서 일부만 저장됐는데 성공으로
 * 보이는 것, (4) 다른 반 기록이 "최근 기록"으로 섞여 나오는 것.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Student } from '@domain/entities/Student';
import type { TeachingClass } from '@domain/entities/TeachingClass';

const addHomeroomRecord = vi.fn();
const addObservation = vi.fn();
const showToast = vi.fn();

const state = {
  students: [] as Student[],
  classes: [] as TeachingClass[],
  homeroomRecords: [] as {
    id: string;
    studentId: string;
    category: string;
    date: string;
    content: string;
  }[],
  observationRecords: [] as {
    id: string;
    studentId: string;
    classId: string;
    date: string;
    content: string;
  }[],
};

function selectorHook<T>(get: () => T) {
  const hook = (selector?: (s: T) => unknown) => (selector ? selector(get()) : get());
  return Object.assign(hook, { getState: get });
}

vi.mock('@adapters/stores/useStudentStore', () => ({
  useStudentStore: selectorHook(() => ({ students: state.students, load: vi.fn(), loaded: true })),
}));

vi.mock('@adapters/stores/useTeachingClassStore', () => ({
  useTeachingClassStore: selectorHook(() => ({
    classes: state.classes,
    load: vi.fn(),
    loaded: true,
  })),
}));

vi.mock('@adapters/stores/useStudentRecordsStore', () => ({
  useStudentRecordsStore: selectorHook(() => ({
    records: state.homeroomRecords,
    categories: [
      { id: 'counseling', name: '상담 / 관계 (COUNSELING)', color: 'blue', subcategories: [] },
      { id: 'life', name: '생활 / 학습 (LIFE & LEARNING)', color: 'green', subcategories: [] },
      { id: 'etc', name: '기타 (OTHER)', color: 'gray', subcategories: [] },
    ],
    load: vi.fn(),
    addRecordWithTags: addHomeroomRecord,
  })),
}));

vi.mock('@adapters/stores/useObservationStore', () => ({
  useObservationStore: selectorHook(() => ({
    records: state.observationRecords,
    customSlots: [],
    load: vi.fn(),
    addRecord: addObservation,
  })),
}));

vi.mock('@adapters/stores/useSettingsStore', () => ({
  useSettingsStore: selectorHook(() => ({ settings: { className: '3', grade: '2' } })),
}));

vi.mock('@adapters/components/common/Toast', () => ({
  useToastStore: selectorHook(() => ({ show: showToast })),
}));

vi.mock('@adapters/components/common/VoiceTypingButton', () => ({
  VoiceTypingButton: () => null,
}));

import { QuickAddStudentRecordForm } from './QuickAddStudentRecordForm';
import { useQuickAddStore } from '@adapters/stores/useQuickAddStore';

function student(id: string, name: string, number: number): Student {
  return { id, name, studentNumber: number };
}

function teachingClass(
  id: string,
  name: string,
  subject: string,
  students: readonly { number: number; name: string }[],
): TeachingClass {
  return {
    id,
    name,
    subject,
    students,
    createdAt: '2026-03-02T00:00:00.000Z',
    updatedAt: '2026-03-02T00:00:00.000Z',
  };
}

beforeEach(() => {
  addHomeroomRecord.mockReset().mockResolvedValue('rec-1');
  addObservation.mockReset().mockResolvedValue('obs-1');
  showToast.mockReset();
  useQuickAddStore.setState({ studentRecordFocus: null });
  state.students = [student('s1', '김한결', 1), student('s2', '이서준', 2)];
  state.classes = [
    teachingClass('c1', '2-3', '국어', [
      { number: 1, name: '김한결' },
      { number: 2, name: '이서준' },
    ]),
    teachingClass('c2', '2-5', '국어', [{ number: 9, name: '박도윤' }]),
  ];
  state.homeroomRecords = [];
  state.observationRecords = [];
});

afterEach(cleanup);

function pickStudent(name: string): void {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(name) }));
}

describe('빠른 학생 기록 — 한 명', () => {
  it('학생을 고르면 저장 위치를 직접 고르게 하고, 고르기 전에는 본문 화면이 없다', () => {
    render(<QuickAddStudentRecordForm onClose={vi.fn()} />);
    pickStudent('김한결');
    expect(screen.getByText(/기록이 저장될 곳을 직접 골라/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /담임 · 2-3/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /국어 · 2-3/ })).toBeTruthy();
    expect(screen.queryByPlaceholderText(/본 대로 적어/)).toBeNull();
  });

  it('담임 맥락은 담임 누가기록 저장 경로로 들어간다', async () => {
    render(<QuickAddStudentRecordForm onClose={vi.fn()} />);
    pickStudent('김한결');
    fireEvent.click(screen.getByRole('button', { name: /담임 · 2-3/ }));
    fireEvent.change(screen.getByPlaceholderText(/본 대로 적어/), {
      target: { value: '청소를 끝까지 도왔다' },
    });
    fireEvent.click(screen.getByRole('button', { name: '기록하기' }));

    await waitFor(() => expect(addHomeroomRecord).toHaveBeenCalledTimes(1));
    expect(addObservation).not.toHaveBeenCalled();
    expect(addHomeroomRecord.mock.calls[0]![0]).toMatchObject({
      studentId: 's1',
      content: '청소를 끝까지 도왔다',
      category: 'life',
    });
  });

  it('교과 맥락은 관찰기록 저장 경로로 들어간다', async () => {
    render(<QuickAddStudentRecordForm onClose={vi.fn()} />);
    pickStudent('김한결');
    fireEvent.click(screen.getByRole('button', { name: /국어 · 2-3/ }));
    fireEvent.change(screen.getByPlaceholderText(/본 대로 적어/), {
      target: { value: '근거를 들어 반박했다' },
    });
    fireEvent.click(screen.getByRole('button', { name: '기록하기' }));

    await waitFor(() => expect(addObservation).toHaveBeenCalledTimes(1));
    expect(addHomeroomRecord).not.toHaveBeenCalled();
    expect(addObservation.mock.calls[0]![0]).toMatchObject({
      studentId: '1',
      classId: 'c1',
      content: '근거를 들어 반박했다',
    });
  });

  it('본문이 비면 저장 단추가 눌리지 않는다', () => {
    render(<QuickAddStudentRecordForm onClose={vi.fn()} />);
    pickStudent('김한결');
    fireEvent.click(screen.getByRole('button', { name: /담임 · 2-3/ }));
    const save = screen.getByRole('button', { name: '기록하기' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
  });

  it('Ctrl+Enter 로 저장한다', async () => {
    render(<QuickAddStudentRecordForm onClose={vi.fn()} />);
    pickStudent('김한결');
    fireEvent.click(screen.getByRole('button', { name: /담임 · 2-3/ }));
    const textarea = screen.getByPlaceholderText(/본 대로 적어/);
    fireEvent.change(textarea, { target: { value: '오늘의 모습' } });
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(addHomeroomRecord).toHaveBeenCalledTimes(1));
  });

  it('저장에 실패하면 본문과 선택을 그대로 둔다', async () => {
    addHomeroomRecord.mockRejectedValue(new Error('디스크 오류'));
    render(<QuickAddStudentRecordForm onClose={vi.fn()} />);
    pickStudent('김한결');
    fireEvent.click(screen.getByRole('button', { name: /담임 · 2-3/ }));
    fireEvent.change(screen.getByPlaceholderText(/본 대로 적어/), {
      target: { value: '지워지면 안 되는 글' },
    });
    fireEvent.click(screen.getByRole('button', { name: '기록하기' }));

    await waitFor(() => expect(showToast).toHaveBeenCalled());
    expect(showToast.mock.calls[0]![1]).toBe('error');
    const textarea = screen.getByPlaceholderText(/본 대로 적어/) as HTMLTextAreaElement;
    expect(textarea.value).toBe('지워지면 안 되는 글');
  });

  it('저장에 성공하면 시작 목록으로 돌아가고 본문을 비운다', async () => {
    const onClose = vi.fn();
    render(<QuickAddStudentRecordForm onClose={onClose} />);
    pickStudent('김한결');
    fireEvent.click(screen.getByRole('button', { name: /담임 · 2-3/ }));
    fireEvent.change(screen.getByPlaceholderText(/본 대로 적어/), { target: { value: '한 줄' } });
    fireEvent.click(screen.getByRole('button', { name: '기록하기' }));

    await waitFor(() => expect(screen.getByPlaceholderText(/이름 또는 번호/)).toBeTruthy());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('저장하고 닫기는 모달을 닫는다', async () => {
    const onClose = vi.fn();
    render(<QuickAddStudentRecordForm onClose={onClose} />);
    pickStudent('김한결');
    fireEvent.click(screen.getByRole('button', { name: /담임 · 2-3/ }));
    fireEvent.change(screen.getByPlaceholderText(/본 대로 적어/), { target: { value: '한 줄' } });
    fireEvent.click(screen.getByRole('button', { name: '저장하고 닫기' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});

describe('빠른 학생 기록 — 최근 기록', () => {
  it('고른 맥락의 기록만 최근 기록으로 보인다', () => {
    state.observationRecords = [
      { id: 'o1', studentId: '1', classId: 'c1', date: '2026-09-10', content: '국어 2-3 관찰' },
      { id: 'o2', studentId: '1', classId: 'c2', date: '2026-09-11', content: '다른 반 관찰' },
    ];
    render(<QuickAddStudentRecordForm onClose={vi.fn()} />);
    pickStudent('김한결');
    fireEvent.click(screen.getByRole('button', { name: /국어 · 2-3/ }));
    fireEvent.click(screen.getByRole('button', { name: /최근 기록 1건 보기/ }));
    expect(screen.getByText('국어 2-3 관찰')).toBeTruthy();
    expect(screen.queryByText('다른 반 관찰')).toBeNull();
  });

  it('담임 최근 기록에 출결은 섞지 않는다', () => {
    state.homeroomRecords = [
      { id: 'r1', studentId: 's1', category: 'attendance', date: '2026-09-12', content: '지각' },
      { id: 'r2', studentId: 's1', category: 'life', date: '2026-09-11', content: '생활 기록' },
    ];
    render(<QuickAddStudentRecordForm onClose={vi.fn()} />);
    pickStudent('김한결');
    fireEvent.click(screen.getByRole('button', { name: /담임 · 2-3/ }));
    fireEvent.click(screen.getByRole('button', { name: /최근 기록 1건 보기/ }));
    expect(screen.getByText('생활 기록')).toBeTruthy();
    expect(screen.queryByText('지각')).toBeNull();
  });
});

describe('빠른 학생 기록 — 여러 명', () => {
  function enterMulti(): void {
    fireEvent.click(screen.getByRole('button', { name: '여러 명 기록' }));
  }

  it('공통 맥락만 고를 수 있다', () => {
    render(<QuickAddStudentRecordForm onClose={vi.fn()} />);
    enterMulti();
    pickStudent('김한결');
    pickStudent('이서준');
    fireEvent.click(screen.getByRole('button', { name: '기록 위치 고르기' }));
    expect(screen.getByRole('button', { name: /담임 · 2-3/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /국어 · 2-3/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /국어 · 2-5/ })).toBeNull();
  });

  it('공통 맥락이 없으면 이유를 말하고 저장 화면으로 가지 않는다', () => {
    render(<QuickAddStudentRecordForm onClose={vi.fn()} />);
    enterMulti();
    pickStudent('김한결');
    pickStudent('박도윤');
    fireEvent.click(screen.getByRole('button', { name: '기록 위치 고르기' }));
    expect(screen.getByText(/공통으로 있는 기록 위치가 없습니다/)).toBeTruthy();
    expect(screen.queryByPlaceholderText(/본 대로 적어/)).toBeNull();
  });

  it('저장 전에 몇 명에게 저장하는지 보여준다', () => {
    render(<QuickAddStudentRecordForm onClose={vi.fn()} />);
    enterMulti();
    pickStudent('김한결');
    pickStudent('이서준');
    fireEvent.click(screen.getByRole('button', { name: '기록 위치 고르기' }));
    fireEvent.click(screen.getByRole('button', { name: /국어 · 2-3/ }));
    expect(screen.getByText(/2명에게 같은 내용으로 저장합니다/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '2명에게 기록하기' })).toBeTruthy();
  });

  it('학생마다 각자의 저장 경로로 개별 기록한다', async () => {
    render(<QuickAddStudentRecordForm onClose={vi.fn()} />);
    enterMulti();
    pickStudent('김한결');
    pickStudent('이서준');
    fireEvent.click(screen.getByRole('button', { name: '기록 위치 고르기' }));
    fireEvent.click(screen.getByRole('button', { name: /국어 · 2-3/ }));
    fireEvent.change(screen.getByPlaceholderText(/본 대로 적어/), {
      target: { value: '모둠 발표를 준비했다' },
    });
    fireEvent.click(screen.getByRole('button', { name: '2명에게 기록하기' }));

    await waitFor(() => expect(addObservation).toHaveBeenCalledTimes(2));
    expect(addObservation.mock.calls.map((c) => c[0].studentId)).toEqual(['1', '2']);
  });

  it('일부만 실패하면 성공으로 덮지 않고 실패한 학생만 남긴다', async () => {
    addObservation.mockImplementation((params: { studentId: string }) =>
      params.studentId === '2' ? Promise.reject(new Error('실패')) : Promise.resolve('obs-1'),
    );
    render(<QuickAddStudentRecordForm onClose={vi.fn()} />);
    enterMulti();
    pickStudent('김한결');
    pickStudent('이서준');
    fireEvent.click(screen.getByRole('button', { name: '기록 위치 고르기' }));
    fireEvent.click(screen.getByRole('button', { name: /국어 · 2-3/ }));
    fireEvent.change(screen.getByPlaceholderText(/본 대로 적어/), { target: { value: '한 줄' } });
    fireEvent.click(screen.getByRole('button', { name: '2명에게 기록하기' }));

    await waitFor(() => expect(showToast).toHaveBeenCalled());
    expect(showToast.mock.calls[0]![1]).toBe('error');
    expect(String(showToast.mock.calls[0]![0])).toContain('이서준');
    // 실패한 학생만 남아 바로 다시 저장할 수 있다.
    await waitFor(() => expect(screen.getByRole('button', { name: '기록하기' })).toBeTruthy());
    const textarea = screen.getByPlaceholderText(/본 대로 적어/) as HTMLTextAreaElement;
    expect(textarea.value).toBe('한 줄');
  });
});

describe('빠른 학생 기록 — 시작 목록', () => {
  it('수업반에서 열면 그 명단으로 좁히고, 전체로 넓힐 수 있다', () => {
    useQuickAddStore.setState({ studentRecordFocus: { classId: 'c2' } });
    render(<QuickAddStudentRecordForm onClose={vi.fn()} />);
    expect(screen.getByText(/국어 · 2-5 명단에서 찾는 중/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /김한결/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '전체 학생에서 찾기' }));
    expect(screen.getByRole('button', { name: /김한결/ })).toBeTruthy();
  });

  it('칩으로 학생을 지정해 열면 맥락 고르기부터 시작한다', async () => {
    const candidateIdentity = '2-3|1|김한결';
    useQuickAddStore.setState({
      studentRecordFocus: { classId: 'c1', studentIdentity: candidateIdentity },
    });
    render(<QuickAddStudentRecordForm onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/기록이 저장될 곳을 직접 골라/)).toBeTruthy());
  });
});
