// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />
/**
 * 돌아보기 숫자 한 줄(spec 2·3) — 한 주 정리·학기 돌아보기 창에 수업·끝낸 할 일·상담이 붙는가.
 * 상담은 서버에서 오므로 가져오기를 흉내 낸다.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useStudentRecordsStore } from '@adapters/stores/useStudentRecordsStore';
import { useObservationStore } from '@adapters/stores/useObservationStore';
import { useLapMarkStore } from '@adapters/stores/useLapMarkStore';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { useTodoStore } from '@adapters/stores/useTodoStore';
import { useObservationPanelStore } from '@adapters/stores/useObservationPanelStore';
import { TODO_COMPLETION_SINCE_KEY } from '@adapters/utils/todoCompletionSince';
import { DEFAULT_REMINDER_SETTINGS } from '@domain/entities/RecordReminder';
import type { ProgressEntry } from '@domain/entities/CurriculumProgress';
import type { TeachingClass } from '@domain/entities/TeachingClass';
import type { Todo } from '@domain/entities/Todo';
import type { StudentRecord } from '@domain/entities/StudentRecord';
import { fetchConsultationCount } from '@adapters/hooks/consultationRecapFetch';
import { ObservationRecapModals } from './ObservationRecapModals';
import { saveTermRecapPng } from './termRecapPng';

vi.mock('@adapters/hooks/consultationRecapFetch', () => ({
  fetchConsultationCount: vi.fn(async () => 0),
}));

vi.mock('./termRecapPng', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./termRecapPng')>()),
  saveTermRecapPng: vi.fn(async () => true),
}));

const noop = async (): Promise<void> => {};

function doneTodo(id: string, day: string): Todo {
  return {
    id,
    text: '김가람 어머님께 전화', // 제목은 화면 어디에도 나오면 안 된다
    completed: true,
    createdAt: '2026-08-20T00:00:00.000Z',
    completedAt: new Date(`${day}T15:00:00`).toISOString(),
  };
}

function lesson(id: string, classId: string, date: string): ProgressEntry {
  return {
    id,
    classId,
    date,
    period: 1,
    unit: '',
    lesson: '',
    status: 'completed',
    note: '',
  } as ProgressEntry;
}

const CLASSES = [
  { id: 'c1', name: '2-3', subject: '국어', students: [] },
  { id: 'c2', name: '2-4', subject: '국어', students: [] },
] as unknown as TeachingClass[];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 25, 10, 0)); // 2026-09-25(금)
  window.localStorage.setItem(TODO_COMPLETION_SINCE_KEY, '2026-09-24');
  vi.mocked(fetchConsultationCount).mockResolvedValue(0);
  useSettingsStore.setState({
    loaded: true,
    settings: {
      ...useSettingsStore.getState().settings,
      className: '2학년 3반',
      termStartDates: { '2026-2': '2026-08-18' },
      recordReminder: { ...DEFAULT_REMINDER_SETTINGS },
    },
  });
  // 명렬이 하나라도 있어야 창이 뜬다(틀의 보이는 조건)
  useStudentStore.setState({
    students: [{ id: 'a', name: '김가람', studentNumber: 1 }],
    loaded: true,
    load: noop,
  });
  useTeachingClassStore.setState({
    classes: CLASSES,
    progressEntries: [],
    loaded: true,
    load: noop,
  });
  useStudentRecordsStore.setState({ records: [], loaded: true, load: noop });
  useObservationStore.setState({ records: [], loaded: true, load: noop });
  useLapMarkStore.setState({ marks: [], loaded: true, load: noop });
  useEventsStore.setState({ events: [], loaded: true, load: noop });
  useTodoStore.setState({ todos: [], loaded: true, load: noop });
});

afterEach(() => {
  useObservationPanelStore.setState({ panel: null });
  window.localStorage.removeItem(TODO_COMPLETION_SINCE_KEY);
  cleanup();
  vi.useRealTimers();
});

describe('한 주 정리 — 숫자 한 줄', () => {
  function openWeek(): void {
    useObservationPanelStore.setState({ panel: { kind: 'weekly', week: '2026-09-21' } });
    render(<ObservationRecapModals />);
  }

  it('관찰 기록이 없는 주도 수업·끝낸 할 일이 있으면 그 줄만 보인다 — 할 일 제목은 없다', () => {
    useTeachingClassStore.setState({ progressEntries: [lesson('l1', 'c1', '2026-09-22')] });
    useTodoStore.setState({ todos: [doneTodo('t1', '2026-09-24')] });
    openWeek();
    expect(screen.getByText('수업 1차시 · 끝낸 할 일 1개')).toBeInTheDocument();
    expect(screen.queryByText('이번 주는 조용했어요')).not.toBeInTheDocument();
    expect(screen.queryByText(/김가람/)).not.toBeInTheDocument();
  });

  it('상담 답이 오면 같은 줄 끝에 붙는다', async () => {
    vi.mocked(fetchConsultationCount).mockResolvedValue(3);
    useTodoStore.setState({ todos: [doneTodo('t1', '2026-09-24')] });
    openWeek();
    expect(await screen.findByText('끝낸 할 일 1개 · 상담 3건')).toBeInTheDocument();
    // 오늘 뒤는 묻지 않는다 — 9월 21일부터 오늘(25일)까지
    expect(fetchConsultationCount).toHaveBeenCalledWith({ start: '2026-09-21', end: '2026-09-25' });
  });

  it('상담을 가져오지 못하면(null) 상담 없이', async () => {
    vi.mocked(fetchConsultationCount).mockResolvedValue(null);
    useTodoStore.setState({ todos: [doneTodo('t1', '2026-09-24')] });
    openWeek();
    await Promise.resolve();
    expect(screen.getByText('끝낸 할 일 1개')).toBeInTheDocument();
    expect(screen.queryByText(/상담/)).not.toBeInTheDocument();
  });

  it('0인 항목은 적지 않는다 — 기록 시작일 앞에 끝낸 할 일은 세지 않는다', () => {
    useTodoStore.setState({ todos: [doneTodo('old', '2026-09-22')] });
    openWeek();
    expect(screen.getByText('이번 주는 조용했어요')).toBeInTheDocument();
  });
});

describe('학기 돌아보기 — 숫자 한 줄·반별 줄·할 일 안내', () => {
  function openTerm(includeWeek: string | null = null): void {
    useObservationPanelStore.setState({
      panel: { kind: 'retrospect', term: '2026-2', includeWeek },
    });
    render(<ObservationRecapModals />);
  }

  it('반별 수업 줄은 수업반 목록 순서, 학기 중간부터 센 할 일에는 안내가 붙는다', () => {
    useTeachingClassStore.setState({
      progressEntries: [
        lesson('a', 'c2', '2026-09-01'),
        lesson('b', 'c1', '2026-09-02'),
        lesson('c', 'c1', '2026-09-03'),
      ],
    });
    useTodoStore.setState({ todos: [doneTodo('t1', '2026-09-24')] });
    openTerm();
    expect(screen.getByText('수업 3차시 · 끝낸 할 일 1개')).toBeInTheDocument();
    expect(screen.getByText('2-3 2')).toBeInTheDocument();
    expect(screen.getByText('2-4 1')).toBeInTheDocument();
    const order = screen.getAllByText(/^2-[34] \d$/).map((n) => n.textContent);
    expect(order).toEqual(['2-3 2', '2-4 1']);
    expect(screen.getByText('끝낸 할 일은 9월 24일부터 센 수예요')).toBeInTheDocument();
  });

  it('기록 시작일을 읽을 수 없으면 날짜 없이 안내한다', () => {
    window.localStorage.removeItem(TODO_COMPLETION_SINCE_KEY);
    useTodoStore.setState({ todos: [doneTodo('t1', '2026-09-24')] });
    openTerm();
    expect(screen.getByText('끝낸 할 일은 이 기능이 생긴 뒤부터 센 수예요')).toBeInTheDocument();
  });

  it("접힌 '이번 주'에도 그 주 숫자 줄이 들어간다 — 관찰이 없어도", () => {
    useTodoStore.setState({ todos: [doneTodo('t1', '2026-09-24')] });
    openTerm('2026-09-21');
    const week = screen.getByRole('region', { name: '이번 주' });
    expect(week).toHaveTextContent('끝낸 할 일 1개');
  });
});

describe('학기 돌아보기 그림 — 숫자만 넘긴다', () => {
  it('그림 저장에는 숫자와 학기 중간 여부만 간다 — 반별 줄·할 일 안내는 넘기지 않는다', async () => {
    vi.mocked(fetchConsultationCount).mockResolvedValue(2);
    useStudentRecordsStore.setState({
      records: [
        {
          id: 'r1',
          studentId: 'a',
          category: 'life',
          subcategory: '일반',
          content: '내용',
          date: '2026-09-22',
          createdAt: '2026-09-22T01:00:00.000Z',
        } as StudentRecord,
      ],
    });
    useTeachingClassStore.setState({ progressEntries: [lesson('a', 'c1', '2026-09-02')] });
    useTodoStore.setState({ todos: [doneTodo('t1', '2026-09-24')] });
    useObservationPanelStore.setState({
      panel: { kind: 'retrospect', term: '2026-2', includeWeek: null },
    });
    render(<ObservationRecapModals />);
    await screen.findByText('수업 1차시 · 끝낸 할 일 1개 · 상담 2건');
    fireEvent.click(screen.getByRole('button', { name: '그림으로 저장' }));
    const arg = vi.mocked(saveTermRecapPng).mock.calls[0]?.[0];
    expect(arg?.work).toEqual({
      counts: { lessons: 1, todos: 1, consultations: 2 },
      partialTodoTerm: true,
    });
  });
});
