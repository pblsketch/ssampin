// @vitest-environment jsdom
/**
 * ADR-137 — 관심 학생의 반 범위 절반 문턱이 기록 알림 네 자리(알림 창·윈도우 알림 예약 담임/수업반·
 * 미기록 수)에 같게 적용되는가, '오늘은 쉴게요'가 그날 알림 창·윈도우 알림을 조용히 하는가.
 *
 * 시계는 2026-09-23(수) 09:55 — 1교시(09:50) 2-3반 수업이 방금 끝났다.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useStudentRecordsStore } from '@adapters/stores/useStudentRecordsStore';
import { useObservationStore } from '@adapters/stores/useObservationStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { useRecordReminderStore } from '@adapters/stores/useRecordReminderStore';
import { useReminderFireStore } from '@adapters/stores/useReminderFireStore';
import { useObservationDayStore } from '@adapters/stores/useObservationDayStore';
import { useReminderScheduler } from '../useReminderScheduler';
import { useReminderOsPush } from '../useReminderOsPush';
import { DEFAULT_REMINDER_SETTINGS, type ReminderSettings } from '@domain/entities/RecordReminder';
import type { ObservationRecord } from '@domain/entities/Observation';
import type { Student } from '@domain/entities/Student';
import type { StudentRecord } from '@domain/entities/StudentRecord';
import type { TeachingClass } from '@domain/entities/TeachingClass';

const NOW = new Date(2026, 8, 23, 9, 55);
const TODAY = '2026-09-23';

const classA = {
  id: 'cA',
  name: '2-3',
  subject: '국어',
  students: [
    { number: 1, name: '가' },
    { number: 2, name: '나' },
  ],
  createdAt: '2026-03-02T00:00:00.000Z',
  updatedAt: '2026-03-02T00:00:00.000Z',
} as TeachingClass;
const classB = { ...classA, id: 'cB', name: '2-4' } as TeachingClass;

const homeroom: Student[] = [
  { id: 'h1', name: '하나', studentNumber: 1 },
  { id: 'h2', name: '두리', studentNumber: 2 },
];

function obs(classId: string, studentId: string, date: string): ObservationRecord {
  return {
    id: `${classId}-${studentId}-${date}`,
    studentId,
    classId,
    authorId: 't',
    date,
    content: '내용',
    tags: [],
    visibility: 'private',
    createdAt: 1,
    updatedAt: 1,
  };
}

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

function setup(patch: Partial<ReminderSettings>) {
  useSettingsStore.setState({
    settings: {
      ...useSettingsStore.getState().settings,
      periodTimes: [
        { period: 1, start: '09:00', end: '09:50' },
        { period: 2, start: '10:00', end: '10:50' },
      ],
      recordReminder: {
        ...DEFAULT_REMINDER_SETTINGS,
        enabled: true,
        targets: ['homeroom', 'subject'],
        staleDays: 6,
        perNudge: 5,
        weekdays: [],
        time: '16:00',
        subtleEnabled: true,
        osToastEnabled: true,
        ...patch,
      },
    },
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  window.localStorage.clear();
  useObservationDayStore.getState().refresh();
  useStudentStore.setState({ students: homeroom, loaded: true });
  // 담임 두 학생 모두 4일 전 기록 — 보통 문턱(6일)에는 안 닿고 관심 문턱(3일)에는 닿는다.
  useStudentRecordsStore.setState({ records: [hr('h1', '2026-09-19'), hr('h2', '2026-09-19')] });
  useEventsStore.setState({ events: [], loaded: true });
  useTeachingClassStore.setState({ classes: [classA, classB], load: async () => {} });
  useObservationStore.setState({
    records: [
      obs('cA', '1', '2026-09-19'),
      obs('cA', '2', '2026-09-19'),
      obs('cB', '1', '2026-09-19'),
      obs('cB', '2', '2026-09-19'),
    ],
    load: async () => {},
  });
  useScheduleStore.setState({
    getEffectiveTeacherSchedule: () => [
      { classroom: '2-3', subject: '국어' },
      { classroom: '2-4', subject: '국어' },
    ],
    load: async () => {},
  });
  useRecordReminderStore.setState({
    rotationCursor: 0,
    snoozeUntil: null,
    pausedUntil: null,
    skippedKeys: [],
    studentSnoozes: {},
  });
  useReminderFireStore.setState({ firedKeys: [], loaded: true });
});

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: undefined });
});

describe('관심 학생 — 반 범위 절반 문턱', () => {
  it('알림 창: 그 반 관심 학생만 절반 문턱에서 부른다(다른 반 관심은 번지지 않는다)', () => {
    setup({ focusedStudentIds: ['subject:cA:1', 'subject:cB:2', 'h2'] });
    const { result } = renderHook(() => useReminderScheduler());
    expect(result.current.dueNow.map((d) => d.key)).toEqual(['subject:cA:1', 'h2']);
  });

  it('미기록 수도 같은 문턱', () => {
    setup({ focusedStudentIds: ['h2'] });
    const { result } = renderHook(() => useReminderScheduler());
    expect(result.current.missingCount).toBe(1);
  });

  it('윈도우 알림 예약: 수업반 뜸한 학생 수·담임 예약 모두 같은 문턱', () => {
    const scheduleReminders = vi.fn();
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { scheduleReminders, clearReminderSchedule: vi.fn() },
    });
    setup({ focusedStudentIds: ['subject:cB:1', 'h1'] });
    renderHook(() => useReminderOsPush());
    const items = (
      scheduleReminders.mock.calls.at(-1) as [string, { reminderId: string; body: string }[]]
    )[1];
    const subject = items.find((i) => i.reminderId === `subject:cB:${TODAY}`);
    expect(subject?.body).toContain('1명');
    expect(items.some((i) => i.reminderId === `subject:cA:${TODAY}`)).toBe(false);
    // 담임: 관심 학생 h1 은 오늘 16시에 예약된다(보통 학생 h2 는 문턱 전)
    expect(items.some((i) => i.reminderId === `h1:${TODAY}`)).toBe(true);
    expect(items.some((i) => i.reminderId === `h2:${TODAY}`)).toBe(false);
  });
});

describe('오늘은 쉴게요', () => {
  it('알림 창을 그날 조용히 한다', () => {
    setup({ focusedStudentIds: ['h2'] });
    useObservationDayStore.getState().restToday(TODAY);
    const { result } = renderHook(() => useReminderScheduler());
    expect(result.current.dueNow).toHaveLength(0);
  });

  it('응원·잔디를 끄면 쉬기도 풀린다 — [다시 켜기]가 사라진 채 알림만 조용해지지 않게', () => {
    setup({ focusedStudentIds: ['h2'], cheerEnabled: false });
    useObservationDayStore.getState().restToday(TODAY);
    const { result } = renderHook(() => useReminderScheduler());
    expect(result.current.dueNow.length).toBeGreaterThan(0);
  });

  it('그날 윈도우 알림 예약을 빼고 내일 것은 남긴다 — 기존 일시정지 값은 건드리지 않는다', () => {
    const scheduleReminders = vi.fn();
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { scheduleReminders, clearReminderSchedule: vi.fn() },
    });
    // h1 은 오늘 16시, h2 는 내일 16시, 2-4반은 오늘 2교시 끝(10:50)에 예약될 차례다.
    useStudentRecordsStore.setState({ records: [hr('h1', '2026-09-19'), hr('h2', '2026-09-20')] });
    setup({ staleDays: 4 });
    renderHook(() => useReminderOsPush());
    const before = (scheduleReminders.mock.calls.at(-1) as [string, { reminderId: string }[]])[1];
    expect(before.map((i) => i.reminderId).sort()).toEqual(
      [`h1:${TODAY}`, 'h2:2026-09-24', `subject:cB:${TODAY}`].sort(),
    );

    useObservationDayStore.getState().restToday(TODAY);
    renderHook(() => useReminderOsPush());
    const items = (
      scheduleReminders.mock.calls.at(-1) as [string, { reminderId: string; fireAt: number }[]]
    )[1];
    expect(items.map((i) => i.reminderId)).toEqual(['h2:2026-09-24']);
    expect(useRecordReminderStore.getState().pausedUntil).toBeNull();
  });
});
