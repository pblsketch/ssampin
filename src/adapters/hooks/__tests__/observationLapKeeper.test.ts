// @vitest-environment jsdom
/**
 * ADR-135 — 한 바퀴 끝 지점은 메인 창이 **기록이 늘었을 때만**, 끝 지점 기록이 **이 컴퓨터에서
 * 추가한 것일 때만** 저장하고 응원한다. 처음 불러온 때·빼기만 바뀐 때·다른 컴퓨터 기록은 저장하지 않는다.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useStudentRecordsStore } from '@adapters/stores/useStudentRecordsStore';
import { useObservationStore } from '@adapters/stores/useObservationStore';
import { useLapMarkStore } from '@adapters/stores/useLapMarkStore';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import {
  recordLocalObservationAdd,
  resetObservationCheerForTest,
} from '@adapters/stores/observationCheerSignal';
import { DEFAULT_REMINDER_SETTINGS } from '@domain/entities/RecordReminder';
import type { StudentRecord } from '@domain/entities/StudentRecord';
import type { LapMark } from '@domain/entities/ObservationLap';
import { toLocalDateString } from '@shared/utils/localDate';
import { useObservationLapKeeper } from '../useObservationCheer';

const noop = async (): Promise<void> => {};
const recordMark = vi.fn(async (_mark: LapMark) => true);
const today = toLocalDateString(new Date());

function rec(id: string, studentId: string, category = 'life'): StudentRecord {
  return {
    id,
    studentId,
    category,
    subcategory: '일반',
    content: '내용',
    date: today,
    createdAt: new Date().toISOString(),
  } as StudentRecord;
}

beforeEach(() => {
  window.localStorage.clear();
  resetObservationCheerForTest();
  recordMark.mockClear();
  useSettingsStore.setState({
    settings: {
      ...useSettingsStore.getState().settings,
      className: '2학년 3반',
      recordReminder: { ...DEFAULT_REMINDER_SETTINGS },
    },
  });
  useStudentStore.setState({
    students: [
      { id: 'a', name: '김가람', studentNumber: 1 },
      { id: 'b', name: '이나래', studentNumber: 2 },
    ],
    loaded: true,
    load: noop,
  });
  useTeachingClassStore.setState({ classes: [], loaded: true, load: noop });
  useObservationStore.setState({ records: [], loaded: true, load: noop });
  useEventsStore.setState({ events: [], loaded: true, load: noop });
  useLapMarkStore.setState({ marks: [], loaded: true, load: noop, recordMark });
  useStudentRecordsStore.setState({ records: [rec('r1', 'a')], loaded: true, load: noop });
});

// 앞 시험의 훅이 남아 있으면 다음 시험의 기록 변화를 보고 저장해 버린다 — 매번 내린다.
afterEach(cleanup);

describe('한 바퀴 끝 지점 저장', () => {
  it('이 컴퓨터에서 추가한 기록으로 한 바퀴가 끝나면 저장한다', async () => {
    renderHook(() => useObservationLapKeeper());
    recordLocalObservationAdd('r2');
    await act(async () => {
      useStudentRecordsStore.setState({ records: [rec('r1', 'a'), rec('r2', 'b')] });
    });
    expect(recordMark).toHaveBeenCalledTimes(1);
    expect(recordMark.mock.calls[0]?.[0]).toMatchObject({
      card: 'homeroom',
      completed: 1,
      boundary: { recordId: 'r2' },
    });
  });

  it('처음 불러온 기록만으로는 저장하지 않는다', () => {
    useStudentRecordsStore.setState({ records: [rec('r1', 'a'), rec('r2', 'b')] });
    recordLocalObservationAdd('r2');
    renderHook(() => useObservationLapKeeper());
    expect(recordMark).not.toHaveBeenCalled();
  });

  it('다른 컴퓨터에서 온 기록(동기화)으로 끝나면 저장하지 않는다', async () => {
    renderHook(() => useObservationLapKeeper());
    await act(async () => {
      useStudentRecordsStore.setState({ records: [rec('r1', 'a'), rec('r2', 'b')] });
    });
    expect(recordMark).not.toHaveBeenCalled();
  });

  it('출결 기록은 바퀴를 채우지 않는다', async () => {
    renderHook(() => useObservationLapKeeper());
    recordLocalObservationAdd('r2');
    await act(async () => {
      useStudentRecordsStore.setState({
        records: [rec('r1', 'a'), rec('r2', 'b', 'attendance')],
      });
    });
    expect(recordMark).not.toHaveBeenCalled();
  });

  it('빼기만 바뀌어 계산상 끝난 때는 저장하지 않는다(기록이 늘지 않았다)', async () => {
    renderHook(() => useObservationLapKeeper());
    await act(async () => {
      useSettingsStore.setState({
        settings: {
          ...useSettingsStore.getState().settings,
          recordReminder: {
            ...DEFAULT_REMINDER_SETTINGS,
            exclusions: [{ key: 'b', until: '2099-12-31' }],
          },
        },
      });
    });
    expect(recordMark).not.toHaveBeenCalled();
  });

  describe('빼기로 계산상 한 바퀴가 끝나 보일 때', () => {
    // a·b·c 중 c 를 빼면 r1(a)·r2(b) 만으로 계산상 한 바퀴다(이 컴퓨터에서 추가한 기록).
    beforeEach(() => {
      useStudentStore.setState({
        students: [
          { id: 'a', name: '김가람', studentNumber: 1 },
          { id: 'b', name: '이나래', studentNumber: 2 },
          { id: 'c', name: '박다온', studentNumber: 3 },
        ],
      });
      recordLocalObservationAdd('r1');
      recordLocalObservationAdd('r2');
      useStudentRecordsStore.setState({ records: [rec('r1', 'a'), rec('r2', 'b')] });
      useSettingsStore.setState({
        settings: {
          ...useSettingsStore.getState().settings,
          recordReminder: {
            ...DEFAULT_REMINDER_SETTINGS,
            exclusions: [{ key: 'c', until: '2099-12-31' }],
          },
        },
      });
    });

    it('휴대폰에서 동기화된 기록이 들어와도 저장·응원하지 않는다', async () => {
      renderHook(() => useObservationLapKeeper());
      await act(async () => {
        useStudentRecordsStore.setState({
          records: [rec('r1', 'a'), rec('r2', 'b'), rec('phone', 'a')],
        });
      });
      expect(recordMark).not.toHaveBeenCalled();
    });

    it('출결 기록이 들어와도 저장하지 않는다', async () => {
      renderHook(() => useObservationLapKeeper());
      await act(async () => {
        useStudentRecordsStore.setState({
          records: [rec('r1', 'a'), rec('r2', 'b'), rec('att', 'a', 'attendance')],
        });
      });
      expect(recordMark).not.toHaveBeenCalled();
    });

    it('다른 반(수업반)에 이 컴퓨터에서 기록을 더해도 담임반 바퀴는 저장하지 않는다', async () => {
      useTeachingClassStore.setState({
        classes: [
          {
            id: 'c1',
            name: '2-3',
            subject: '국어',
            students: [
              { number: 1, name: '가' },
              { number: 2, name: '나' },
            ],
            createdAt: '2026-03-02T00:00:00.000Z',
            updatedAt: '2026-03-02T00:00:00.000Z',
          },
        ],
      });
      renderHook(() => useObservationLapKeeper());
      recordLocalObservationAdd('o1');
      await act(async () => {
        useObservationStore.setState({
          records: [
            {
              id: 'o1',
              studentId: '1',
              classId: 'c1',
              authorId: 't',
              date: today,
              content: '관찰',
              tags: [],
              visibility: 'private',
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ],
        });
      });
      expect(recordMark).not.toHaveBeenCalled();
    });
  });

  it('끝난 바퀴 파일을 읽기 전에는 판정하지 않는다', async () => {
    useLapMarkStore.setState({ loaded: false });
    renderHook(() => useObservationLapKeeper());
    recordLocalObservationAdd('r2');
    await act(async () => {
      useStudentRecordsStore.setState({ records: [rec('r1', 'a'), rec('r2', 'b')] });
    });
    expect(recordMark).not.toHaveBeenCalled();
  });

  it('응원·잔디를 끄면 판정하지 않는다', async () => {
    useSettingsStore.setState({
      settings: {
        ...useSettingsStore.getState().settings,
        recordReminder: { ...DEFAULT_REMINDER_SETTINGS, cheerEnabled: false },
      },
    });
    renderHook(() => useObservationLapKeeper());
    recordLocalObservationAdd('r2');
    await act(async () => {
      useStudentRecordsStore.setState({ records: [rec('r1', 'a'), rec('r2', 'b')] });
    });
    expect(recordMark).not.toHaveBeenCalled();
  });
});
