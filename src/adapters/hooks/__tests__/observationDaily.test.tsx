// @vitest-environment jsdom
/**
 * ADR-137 — 그날 흐름 엔진: 오늘 챙길 학생을 기록·학사일정을 다 불러온 뒤에만 고르고, 먼저 거는 말은
 * 하루 한 번(메인 창 토스트 한 번, 다른 안내 창이 닫힌 뒤, 쉬는 날·새벽엔 하지 않음).
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useStudentRecordsStore } from '@adapters/stores/useStudentRecordsStore';
import { useObservationStore } from '@adapters/stores/useObservationStore';
import { useTodoStore } from '@adapters/stores/useTodoStore';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { useRecordReminderStore } from '@adapters/stores/useRecordReminderStore';
import { useModalCoordinatorStore } from '@adapters/stores/useModalCoordinatorStore';
import { useObservationDayStore } from '@adapters/stores/useObservationDayStore';
import {
  useObservationTalkEngine,
  useTodayStudentsEngine,
  useTodayStudentsVisible,
  TALK_SETTLE_MS,
  type WeeklyHasContent,
} from '../useObservationDaily';
import { weeklyPanelWeek } from '@adapters/components/Dashboard/ObservationCheer/observationPanelNavigation';
import { weeklyRecapHasContent } from '@adapters/components/Dashboard/ObservationCheer/recapPieces';
import { DEFAULT_REMINDER_SETTINGS } from '@domain/entities/RecordReminder';
import type { StudentRecord } from '@domain/entities/StudentRecord';
import type { TeachingClass } from '@domain/entities/TeachingClass';
import type { TalkOfDay } from '@domain/rules/proactiveTalk';
import { fetchConsultationCount } from '../consultationRecapFetch';

// 상담 예약이 서버에 잔뜩 있어도 알릴지 판단은 서버에 묻지 않는다(돌아보기 spec 2-4)
vi.mock('../consultationRecapFetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../consultationRecapFetch')>()),
  fetchConsultationCount: vi.fn(async () => 5),
}));

const noop = async (): Promise<void> => {};

function hr(studentId: string, date: string): StudentRecord {
  return {
    id: `${studentId}-${date}`,
    studentId,
    category: 'life',
    subcategory: '일반',
    content: '내용',
    date,
    createdAt: `${date}T01:00:00.000Z`,
  } as StudentRecord;
}

const cls = {
  id: 'c1',
  name: '2-3',
  subject: '국어',
  students: [
    { number: 1, name: '가' },
    { number: 2, name: '나' },
  ],
  createdAt: '2026-03-02T00:00:00.000Z',
  updatedAt: '2026-03-02T00:00:00.000Z',
} as TeachingClass;

function setup(now: Date): void {
  vi.setSystemTime(now);
  window.localStorage.clear();
  useObservationDayStore.getState().refresh();
  useSettingsStore.setState({
    loaded: true,
    settings: {
      ...useSettingsStore.getState().settings,
      periodTimes: [
        { period: 1, start: '09:00', end: '09:50' },
        { period: 2, start: '10:00', end: '10:50' },
      ],
      recordReminder: {
        ...DEFAULT_REMINDER_SETTINGS,
        enabled: true,
        preset: 'normal',
        weekdays: [],
        targets: ['homeroom', 'subject'],
        staleDays: 14,
      },
    },
  });
  useStudentStore.setState({
    students: [
      { id: 'a', name: '가람', studentNumber: 1 },
      { id: 'b', name: '나래', studentNumber: 2 },
      { id: 'c', name: '다온', studentNumber: 3 },
    ],
    loaded: true,
    load: noop,
  });
  useTeachingClassStore.setState({ classes: [cls], loaded: true, load: noop });
  useStudentRecordsStore.setState({ records: [], loaded: true, load: noop });
  useObservationStore.setState({ records: [], loaded: true, load: noop });
  useTodoStore.setState({ todos: [], loaded: true, load: noop });
  useScheduleStore.setState({
    loaded: true,
    load: noop,
    getEffectiveTeacherSchedule: () => [{ classroom: '2-3', subject: '국어' }, null],
  });
  useEventsStore.setState({ events: [], loaded: true, load: noop });
  useRecordReminderStore.setState({ pausedUntil: null });
  useModalCoordinatorStore.setState({ entries: [] });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function TodayEngine(): null {
  useTodayStudentsEngine();
  return null;
}

describe('오늘 챙길 학생 엔진', () => {
  it('담임은 알림 강도 인원까지, 수업반은 끝난 수업에서 1명', () => {
    setup(new Date(2026, 8, 23, 9, 55)); // 수요일, 1교시 끝남
    render(<TodayEngine />);
    const s = useObservationDayStore.getState().todayStudents;
    expect(s?.date).toBe('2026-09-23');
    expect(s?.homeroom).toEqual(['a', 'b']);
    expect(s?.subject).toEqual([{ classId: 'c1', ref: '1' }]);
  });

  it('기록을 다 불러오기 전에는 고르지 않는다', () => {
    setup(new Date(2026, 8, 23, 9, 55));
    useStudentRecordsStore.setState({ loaded: false });
    render(<TodayEngine />);
    expect(useObservationDayStore.getState().todayStudents).toBeNull();
  });

  it('수업이 끝나기 전에는 수업반을 판단하지 않는다', () => {
    setup(new Date(2026, 8, 23, 9, 30));
    render(<TodayEngine />);
    const s = useObservationDayStore.getState().todayStudents;
    expect(s?.homeroom).toEqual(['a', 'b']);
    expect(s?.judgedClassIds).toEqual([]);
  });

  it('일시정지가 낮에 풀리면 그날 바로 다시 보인다', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    setup(new Date(2026, 8, 23, 10, 0));
    useRecordReminderStore.setState({ pausedUntil: new Date(2026, 8, 23, 10, 0, 30).getTime() });
    function Visible(): JSX.Element {
      return <span>{String(useTodayStudentsVisible())}</span>;
    }
    const { container } = render(<Visible />);
    expect(container.textContent).toBe('false');
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(container.textContent).toBe('true');
  });

  it('알림 요일이 아니거나 쉬는 날이면 고르지 않는다', () => {
    setup(new Date(2026, 8, 23, 9, 55));
    useSettingsStore.setState({
      settings: {
        ...useSettingsStore.getState().settings,
        recordReminder: {
          ...useSettingsStore.getState().settings.recordReminder!,
          weekdays: [1],
        },
      },
    });
    render(<TodayEngine />);
    expect(useObservationDayStore.getState().todayStudents).toBeNull();
  });
});

function TalkEngine({
  mode,
  onToast,
  hasContent,
}: {
  mode: 'main' | 'widget';
  onToast: (t: TalkOfDay) => void;
  hasContent?: WeeklyHasContent;
}): null {
  useObservationTalkEngine(mode, onToast, hasContent);
  return null;
}

describe('먼저 거는 말 엔진', () => {
  const FRIDAY = new Date(2026, 8, 25, 8, 30);

  /** 메인 창은 조건이 이어진 뒤에 정하고(TALK_SETTLE_MS) 또 그만큼 뒤에 토스트를 띄운다. */
  function settle(): void {
    act(() => {
      vi.advanceTimersByTime(TALK_SETTLE_MS);
    });
    act(() => {
      vi.advanceTimersByTime(TALK_SETTLE_MS);
    });
  }

  it('그 주 마지막 등교일 처음 화면에 한 주 정리를 정하고 토스트는 한 번', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    setup(FRIDAY);
    useStudentRecordsStore.setState({ records: [hr('a', '2026-09-22')] });
    const onToast = vi.fn();
    const { rerender } = render(<TalkEngine mode="main" onToast={onToast} />);
    expect(onToast).not.toHaveBeenCalled();
    settle();
    expect(onToast).toHaveBeenCalledTimes(1);
    expect(onToast.mock.calls[0]?.[0]).toEqual({
      main: { kind: 'weekly', key: '2026-09-21' },
      folded: [],
    });
    rerender(<TalkEngine mode="main" onToast={onToast} />);
    settle();
    expect(onToast).toHaveBeenCalledTimes(1);
  });

  it('관찰 기록이 없어도 그 주에 끝낸 할 일이 있으면 알린다(돌아보기 spec 2-4)', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    setup(FRIDAY);
    useTodoStore.setState({
      todos: [
        {
          id: 't1',
          text: '공문 회신',
          completed: true,
          createdAt: '2026-09-01T00:00:00.000Z',
          completedAt: new Date(2026, 8, 23, 15, 0).toISOString(),
        },
      ],
    });
    const onToast = vi.fn();
    render(<TalkEngine mode="main" onToast={onToast} hasContent={weeklyRecapHasContent} />);
    settle();
    expect(onToast).toHaveBeenCalledTimes(1);
    expect(onToast.mock.calls[0]?.[0]).toMatchObject({
      main: { kind: 'weekly', key: '2026-09-21' },
    });
  });

  it('할 일·진도를 다 불러오기 전에는 정하지 않는다(할 일만 있는 주가 넘긴 주로 굳지 않게)', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    setup(FRIDAY);
    useTodoStore.setState({ loaded: false });
    const onToast = vi.fn();
    render(<TalkEngine mode="main" onToast={onToast} hasContent={weeklyRecapHasContent} />);
    settle();
    expect(onToast).not.toHaveBeenCalled();
    expect(useObservationDayStore.getState().talk.decidedDate).toBeNull();
  });

  it('상담만 있는 주는 먼저 알리지 않는다 — 알릴지 판단은 서버에 묻지 않는다(돌아보기 spec 2-4)', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.mocked(fetchConsultationCount).mockClear();
    setup(FRIDAY);
    const onToast = vi.fn();
    render(<TalkEngine mode="main" onToast={onToast} hasContent={weeklyRecapHasContent} />);
    settle();
    expect(onToast).not.toHaveBeenCalled();
    expect(useObservationDayStore.getState().talk.talk).toBeNull();
    expect(fetchConsultationCount).not.toHaveBeenCalled();
  });

  it('앱을 켜자마자 기록 알림 창이 떠도 겹치지 않는다 — 창이 닫힌 뒤에 알린다', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    setup(FRIDAY);
    useStudentRecordsStore.setState({ records: [hr('a', '2026-09-22')] });
    const onToast = vi.fn();
    render(<TalkEngine mode="main" onToast={onToast} />);
    // 자료를 다 읽은 직후 알림 창이 뜬다(기다리는 사이)
    act(() => {
      useModalCoordinatorStore.setState({
        entries: [{ id: 'r', priority: 'RECORD_REMINDER', isOpen: true, registeredAt: 1 }],
      });
    });
    settle();
    expect(onToast).not.toHaveBeenCalled();
    expect(useObservationDayStore.getState().talk.decidedDate).toBeNull();
    act(() => {
      useModalCoordinatorStore.setState({ entries: [] });
    });
    settle();
    expect(onToast).toHaveBeenCalledTimes(1);
  });

  it('다른 안내 창이 떠 있으면 닫힌 뒤에 알린다', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    setup(FRIDAY);
    useStudentRecordsStore.setState({ records: [hr('a', '2026-09-22')] });
    useModalCoordinatorStore.setState({
      entries: [{ id: 'x', priority: 'RECORD_REMINDER', isOpen: true, registeredAt: 1 }],
    });
    const onToast = vi.fn();
    render(<TalkEngine mode="main" onToast={onToast} />);
    expect(onToast).not.toHaveBeenCalled();
    expect(useObservationDayStore.getState().talk.decidedDate).toBeNull();
    act(() => {
      useModalCoordinatorStore.setState({ entries: [] });
    });
    settle();
    expect(onToast).toHaveBeenCalledTimes(1);
  });

  it('위젯 창은 정하기만 하고 토스트를 띄우지 않는다', () => {
    setup(FRIDAY);
    useStudentRecordsStore.setState({ records: [hr('a', '2026-09-22')] });
    const onToast = vi.fn();
    render(<TalkEngine mode="widget" onToast={onToast} />);
    expect(onToast).not.toHaveBeenCalled();
    expect(useObservationDayStore.getState().talk.talk?.main.kind).toBe('weekly');
  });

  it('새벽(5시 전)·쉬는 날에는 정하지 않는다', () => {
    setup(new Date(2026, 8, 25, 4, 30));
    useStudentRecordsStore.setState({ records: [hr('a', '2026-09-22')] });
    render(<TalkEngine mode="widget" onToast={vi.fn()} />);
    expect(useObservationDayStore.getState().talk.decidedDate).toBeNull();
    cleanup();

    setup(FRIDAY);
    useStudentRecordsStore.setState({ records: [hr('a', '2026-09-22')] });
    useObservationDayStore.getState().restToday('2026-09-25');
    render(<TalkEngine mode="widget" onToast={vi.fn()} />);
    expect(useObservationDayStore.getState().talk.decidedDate).toBeNull();
  });

  it('그 주 기록이 0건이면 알리지 않고, 월요일에 다시 알리지도 않는다', () => {
    setup(FRIDAY);
    render(<TalkEngine mode="widget" onToast={vi.fn()} />);
    expect(useObservationDayStore.getState().talk.talk).toBeNull();
    cleanup();

    // 금요일 오후에 기록을 더했어도 월요일에 지난주 정리를 다시 알리지 않는다
    vi.setSystemTime(new Date(2026, 8, 28, 8, 30));
    useStudentRecordsStore.setState({ records: [hr('a', '2026-09-25')] });
    render(<TalkEngine mode="widget" onToast={vi.fn()} />);
    expect(useObservationDayStore.getState().talk.decidedDate).toBe('2026-09-28');
    expect(useObservationDayStore.getState().talk.talk).toBeNull();
  });

  it('넘긴 주는 [이번 주 정리]가 여는 "알린 주"가 아니다', () => {
    setup(FRIDAY);
    // 지난주(9/14 주)는 알렸다
    window.localStorage.setItem(
      'ssampin:observation-talk',
      JSON.stringify({
        decidedDate: '2026-09-18',
        talk: null,
        opened: true,
        toastShown: true,
        notified: ['weekly:2026-09-14'],
      }),
    );
    useObservationDayStore.getState().refresh();
    render(<TalkEngine mode="widget" onToast={vi.fn()} />);
    const notified = useObservationDayStore.getState().talk.notified;
    expect(notified).toContain('weekly-skipped:2026-09-21');
    expect(weeklyPanelWeek(notified, '2026-09-25')).toBe('2026-09-14');
  });

  it('알릴지는 틀(조각 목록)이 정한다 — 관찰 기록이 없어도 다른 조각이 있으면 알린다', () => {
    setup(FRIDAY);
    render(<TalkEngine mode="widget" onToast={vi.fn()} hasContent={() => true} />);
    expect(useObservationDayStore.getState().talk.talk?.main).toEqual({
      kind: 'weekly',
      key: '2026-09-21',
    });
  });
});
