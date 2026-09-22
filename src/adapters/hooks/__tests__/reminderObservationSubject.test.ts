// @vitest-environment jsdom
/**
 * ADR-135 — 수업반 기록 알림도 잔디와 같은 기준으로 학생을 부르는가.
 *
 * - '당분간 빼기'는 **그 반에서만** 뺀다(다른 반의 같은 학생 번호는 그대로 부른다).
 * - 수업 직후 알림(앱 안)·수업 끝 윈도우 알림 예약의 '뜸한 학생 수' 모두 뺀 학생을 세지 않는다.
 * - 학사일정의 방학 날은 수업반 공백 날수에도 넣지 않는다.
 *
 * 수업 직후 판정은 시계에 달려 있어 날짜만 고정한다(2026-09-23 수요일 09:55, 1교시 09:50 종료).
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
import { useReminderScheduler } from '../useReminderScheduler';
import { useReminderOsPush } from '../useReminderOsPush';
import { DEFAULT_REMINDER_SETTINGS, type ReminderSettings } from '@domain/entities/RecordReminder';
import type { ObservationRecord } from '@domain/entities/Observation';
import type { TeachingClass } from '@domain/entities/TeachingClass';
import type { SchoolEvent } from '@domain/entities/SchoolEvent';

const NOW = new Date(2026, 8, 23, 9, 55);

const classA: TeachingClass = {
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
const classB: TeachingClass = {
  id: 'cB',
  name: '2-4',
  subject: '국어',
  students: [
    { number: 1, name: '다' },
    { number: 2, name: '라' },
  ],
  createdAt: '2026-03-02T00:00:00.000Z',
  updatedAt: '2026-03-02T00:00:00.000Z',
} as TeachingClass;

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

function setup(patch: Partial<ReminderSettings>, slots: { classroom: string; subject: string }[]) {
  useSettingsStore.setState({
    settings: {
      ...useSettingsStore.getState().settings,
      periodTimes: [
        { period: 1, start: '09:00', end: '09:50' },
        { period: 2, start: '10:00', end: '10:50' },
        { period: 3, start: '11:00', end: '11:50' },
      ],
      recordReminder: {
        ...DEFAULT_REMINDER_SETTINGS,
        enabled: true,
        targets: ['subject'],
        staleDays: 5,
        perNudge: 5,
        weekdays: [],
        subtleEnabled: true,
        osToastEnabled: true,
        ...patch,
      },
    },
  });
  useScheduleStore.setState({
    getEffectiveTeacherSchedule: () => slots,
    load: async () => {},
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  useStudentStore.setState({ students: [], loaded: true });
  useStudentRecordsStore.setState({ records: [] });
  useEventsStore.setState({ events: [], loaded: true });
  useTeachingClassStore.setState({ classes: [classA, classB], load: async () => {} });
  useObservationStore.setState({ records: [], load: async () => {} });
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
});

describe('수업 직후 알림(앱 안)', () => {
  it('그 반에서 뺀 학생은 부르지 않는다 — 빼기는 그 반만', () => {
    // 1교시(2-3반)가 방금 끝났다. 2-3반 1번을 뺐다.
    setup({ exclusions: [{ key: 'subject:cA:1', until: '2026-10-31' }] }, [
      { classroom: '2-3', subject: '국어' },
    ]);
    const { result } = renderHook(() => useReminderScheduler());
    expect(result.current.dueNow.map((d) => d.key)).toEqual(['subject:cA:2']);
  });

  it('다른 반에서 같은 번호를 뺀 것은 이 반에 영향이 없다', () => {
    setup({ exclusions: [{ key: 'subject:cB:1', until: '2026-10-31' }] }, [
      { classroom: '2-3', subject: '국어' },
    ]);
    const { result } = renderHook(() => useReminderScheduler());
    expect(result.current.dueNow.map((d) => d.key).sort()).toEqual([
      'subject:cA:1',
      'subject:cA:2',
    ]);
  });

  it('학사일정의 방학 날은 수업반 공백 날수에도 넣지 않는다', () => {
    setup({}, [{ classroom: '2-3', subject: '국어' }]);
    // 9/1 기록, 9/2~9/20 방학 → 실제 공백은 3일(< 5일)
    const vacation = {
      id: 'v',
      title: '재량휴업',
      date: '2026-09-02',
      endDate: '2026-09-20',
      category: 'school',
      source: 'neis',
      neis: { eventName: '여름방학', subtractDayType: '휴업일' },
    } as unknown as SchoolEvent;
    useEventsStore.setState({ events: [vacation], loaded: true });
    useObservationStore.setState({
      records: [obs('cA', '1', '2026-09-01'), obs('cA', '2', '2026-09-01')],
    });
    const { result } = renderHook(() => useReminderScheduler());
    expect(result.current.dueNow).toHaveLength(0);
  });
});

describe('수업 끝 윈도우 알림 예약', () => {
  it("'뜸한 학생 수'에 그 반에서 뺀 학생을 세지 않고, 모두 빠지면 예약하지 않는다", () => {
    const scheduleReminders = vi.fn();
    const clearReminderSchedule = vi.fn();
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { scheduleReminders, clearReminderSchedule },
    });
    // 2교시 2-3반, 3교시 2-4반(둘 다 아직 안 끝남). 2-3반 1번만 빼고, 2-4반은 둘 다 뺐다.
    setup(
      {
        exclusions: [
          { key: 'subject:cA:1', until: '2026-10-31' },
          { key: 'subject:cB:1', until: '2026-10-31' },
          { key: 'subject:cB:2', until: '2026-10-31' },
        ],
      },
      [
        { classroom: '', subject: '' },
        { classroom: '2-3', subject: '국어' },
        { classroom: '2-4', subject: '국어' },
      ],
    );
    renderHook(() => useReminderOsPush());
    const lastCall = scheduleReminders.mock.calls.at(-1) as [
      string,
      { reminderId: string; body: string }[],
    ];
    expect(lastCall[0]).toBe('record');
    expect(lastCall[1].map((i) => i.reminderId)).toEqual(['subject:cA:2026-09-23']);
    expect(lastCall[1][0]?.body).toContain('1명');
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: undefined });
  });
});
