// @vitest-environment jsdom
/**
 * ADR-135 — 기록 알림이 잔디와 같은 기준으로 학생을 부르는가(출시된 동작이 바뀌는 부분).
 *
 * - 출결 기록만 있는 학생도 이제 부른다(출결은 관찰로 세지 않는다).
 * - '당분간 빼기'한 학생은 팝업·미기록 수·윈도우 알림 예약 어디서도 부르지 않는다.
 * - 학사일정의 방학 날은 공백 날수에 넣지 않는다.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useStudentRecordsStore } from '@adapters/stores/useStudentRecordsStore';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { useRecordReminderStore } from '@adapters/stores/useRecordReminderStore';
import { useReminderFireStore } from '@adapters/stores/useReminderFireStore';
import { useReminderScheduler } from '../useReminderScheduler';
import { useReminderOsPush } from '../useReminderOsPush';
import { DEFAULT_REMINDER_SETTINGS, type ReminderSettings } from '@domain/entities/RecordReminder';
import type { Student } from '@domain/entities/Student';
import type { StudentRecord } from '@domain/entities/StudentRecord';
import type { SchoolEvent } from '@domain/entities/SchoolEvent';

const students: Student[] = [
  { id: 'a', name: '가', studentNumber: 1 },
  { id: 'b', name: '나', studentNumber: 2 },
];

function record(studentId: string, category: string, date: string): StudentRecord {
  return {
    id: `${studentId}-${category}-${date}`,
    studentId,
    category,
    subcategory: '일반',
    content: '내용',
    date,
    createdAt: `${date}T01:00:00.000Z`,
  } as StudentRecord;
}

function setReminder(patch: Partial<ReminderSettings>) {
  useSettingsStore.setState({
    settings: {
      ...useSettingsStore.getState().settings,
      recordReminder: {
        ...DEFAULT_REMINDER_SETTINGS,
        enabled: true,
        targets: ['homeroom'],
        staleDays: 14,
        perNudge: 3,
        weekdays: [],
        subtleEnabled: true,
        osToastEnabled: true,
        ...patch,
      },
    },
  });
}

const today = new Date();
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = (n: number) =>
  iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - n));

beforeEach(() => {
  useStudentStore.setState({ students, loaded: true });
  useEventsStore.setState({ events: [], loaded: true });
  useRecordReminderStore.setState({
    rotationCursor: 0,
    snoozeUntil: null,
    pausedUntil: null,
    skippedKeys: [],
    studentSnoozes: {},
  });
  useReminderFireStore.setState({ firedKeys: [], loaded: true });
});

describe('앱 안 기록 알림', () => {
  it('출결 기록만 있는 학생도 부른다 — 출결은 관찰로 세지 않는다', () => {
    setReminder({});
    useStudentRecordsStore.setState({
      records: [record('a', 'attendance', daysAgo(1)), record('b', 'life', daysAgo(1))],
    });
    const { result } = renderHook(() => useReminderScheduler());
    expect(result.current.dueNow.map((d) => d.studentId)).toEqual(['a']);
    expect(result.current.missingCount).toBe(1);
  });

  it("'당분간 빼기'한 학생은 팝업에도 미기록 수에도 없다", () => {
    setReminder({ exclusions: [{ key: 'a', until: daysAgo(-10) }] });
    useStudentRecordsStore.setState({ records: [] });
    const { result } = renderHook(() => useReminderScheduler());
    expect(result.current.dueNow.map((d) => d.studentId)).toEqual(['b']);
    expect(result.current.missingCount).toBe(1);
  });

  it('빼기 기간이 지나면 다시 부른다', () => {
    setReminder({ exclusions: [{ key: 'a', until: daysAgo(1) }] });
    useStudentRecordsStore.setState({ records: [] });
    const { result } = renderHook(() => useReminderScheduler());
    expect(result.current.dueNow.map((d) => d.studentId).sort()).toEqual(['a', 'b']);
  });

  it('학사일정의 방학 날은 공백 날수에 넣지 않는다', () => {
    setReminder({ staleDays: 5 });
    // 20일 전 기록, 그 사이 18일이 방학 → 실제 공백은 2일
    const vacation: SchoolEvent = {
      id: 'v',
      title: '여름방학',
      date: daysAgo(19),
      endDate: daysAgo(2),
      category: 'school',
      source: 'neis',
    } as SchoolEvent;
    useEventsStore.setState({ events: [vacation], loaded: true });
    useStudentRecordsStore.setState({
      records: [record('a', 'life', daysAgo(20)), record('b', 'life', daysAgo(20))],
    });
    const { result } = renderHook(() => useReminderScheduler());
    expect(result.current.dueNow).toHaveLength(0);
    expect(result.current.missingCount).toBe(0);
  });

  it('선생님이 만든 일정은 제목에 방학이 있어도 쓰지 않는다', () => {
    setReminder({ staleDays: 5 });
    const mine: SchoolEvent = {
      id: 'm',
      title: '가족 여름방학 여행',
      date: daysAgo(19),
      endDate: daysAgo(2),
      category: 'personal',
    } as SchoolEvent;
    useEventsStore.setState({ events: [mine], loaded: true });
    useStudentRecordsStore.setState({ records: [record('a', 'life', daysAgo(20))] });
    const { result } = renderHook(() => useReminderScheduler());
    expect(result.current.dueNow.map((d) => d.studentId)).toContain('a');
  });
});

describe('윈도우 알림 예약', () => {
  it('뺀 학생은 예약하지 않고, 출결만 있는 학생은 예약한다', () => {
    const scheduleReminders = vi.fn();
    const clearReminderSchedule = vi.fn();
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { scheduleReminders, clearReminderSchedule },
    });
    setReminder({ exclusions: [{ key: 'b', until: daysAgo(-10) }], horizonDays: 7 });
    useStudentRecordsStore.setState({ records: [record('a', 'attendance', daysAgo(1))] });
    renderHook(() => useReminderOsPush());
    const lastCall = scheduleReminders.mock.calls.at(-1) as [string, { studentDedupKey: string }[]];
    expect(lastCall[0]).toBe('record');
    const keys = lastCall[1].map((i) => i.studentDedupKey.split(':')[0]);
    expect(keys).toContain('a');
    expect(keys).not.toContain('b');
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: undefined });
  });
});
