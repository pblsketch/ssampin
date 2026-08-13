// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />
/**
 * 홈 "오늘 남은 일" / 현재 수업 카드가 **어떤 키로 출결을 조회하는지** 검증한다.
 *
 * 왜 필요한가 — 시간표의 `classroom`("3학년 2반")은 화면에 보여주는 이름이고, 수업반 `id`는
 * `generateUUID()` 산출물이다. 둘은 절대 같아질 수 없다. 이름을 id 자리에 넣으면 조회가
 * 항상 빗나가서, 출결을 이미 넣은 교사에게도 "아직 비어 있어요"가 하루 종일 뜨고
 * 그 줄을 누르면 빈 명단이 열린다.
 *
 * 이 테스트는 **TodayHub 를 실제로 렌더**해서 `getTodayRecord` 에 넘어간 인자를 본다.
 * 도메인 규칙(findMatchingClass)만 따로 검사하면 화면이 그 규칙을 안 써도 초록불이 나온다 —
 * 이전에 같은 방식으로 만든 그물이 버그를 통과시킨 적이 있다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

/**
 * vi.mock 팩토리는 파일 최상단으로 끌어올려져 실행되므로, 팩토리 안에서 쓰는 값은
 * 반드시 vi.hoisted 로 함께 끌어올려야 한다(안 그러면 "Cannot access before initialization").
 */
const fixtures = vi.hoisted(() => {
  /** 시간표에 적히는 표시 이름 */
  const CLASSROOM_LABEL = '3학년 2반';
  /** 실제 수업반 id — generateUUID() 산출물이라 표시 이름과 절대 같을 수 없다 */
  const TEACHING_CLASS_ID = 'e3b0c442-98fc-1c14-9afb-f4c8996fb924';
  const GROUP_ID = 'group-science-2';
  return { CLASSROOM_LABEL, TEACHING_CLASS_ID, GROUP_ID };
});

const { CLASSROOM_LABEL, TEACHING_CLASS_ID, GROUP_ID } = fixtures;

/** getTodayRecord 로 넘어온 인자를 전부 기록한다. */
const getTodayRecordSpy = vi.hoisted(() =>
  vi.fn<(classId: string, period?: number, groupId?: string) => null>(),
);

vi.mock('@mobile/hooks/useCurrentPeriod', () => ({
  useCurrentPeriod: () => ({
    currentPeriod: 1,
    dayOfWeek: '월',
    isBeforeSchool: false,
    isAfterSchool: false,
    isBreak: false,
    minutesLeft: 10,
    periodEndsAt: null,
    nextPeriodStartsAt: null,
  }),
}));

vi.mock('@mobile/stores/useMobileAttendanceStore', async () => {
  const { create } = await import('zustand');
  return {
    useMobileAttendanceStore: create(() => ({
      loaded: true,
      load: async () => {},
      getTodayRecord: (classId: string, period?: number, groupId?: string) =>
        getTodayRecordSpy(classId, period, groupId),
    })),
  };
});

vi.mock('@mobile/stores/useMobileTeachingClassStore', async () => {
  const { create } = await import('zustand');
  return {
    useMobileTeachingClassStore: create(() => ({
      classes: [
        {
          id: fixtures.TEACHING_CLASS_ID,
          name: fixtures.CLASSROOM_LABEL,
          subject: '국어',
          groupId: fixtures.GROUP_ID,
          students: [],
          createdAt: '2026-03-02T00:00:00.000Z',
          updatedAt: '2026-03-02T00:00:00.000Z',
        },
      ],
      loaded: true,
      load: async () => {},
    })),
  };
});

vi.mock('@mobile/stores/useMobileScheduleStore', async () => {
  const { create } = await import('zustand');
  return {
    useMobileScheduleStore: create(() => ({
      // 월요일 1교시에 "3학년 2반" 국어 수업이 있다.
      teacherSchedule: {
        월: [{ classroom: fixtures.CLASSROOM_LABEL, subject: '국어' }],
      },
      classSchedule: {},
      load: async () => {},
    })),
  };
});

vi.mock('@mobile/stores/useMobileSettingsStore', async () => {
  const { create } = await import('zustand');
  return {
    useMobileSettingsStore: create(() => ({
      // 담임이 아닌 교사 — 담임 조회 줄이 섞이지 않게 해서 수업 조회만 본다.
      settings: {
        className: '',
        periodTimes: [],
        teacherRoles: [],
        neis: { atptCode: '', schoolCode: '' },
      },
      loaded: true,
      load: async () => {},
    })),
  };
});

vi.mock('@mobile/stores/useMobileMealStore', async () => {
  const { create } = await import('zustand');
  return {
    useMobileMealStore: create(() => ({
      todayMeals: [],
      loading: false,
      loadTodayMeals: async () => {},
    })),
  };
});

vi.mock('@mobile/stores/useMobileDriveSyncStore', async () => {
  const { create } = await import('zustand');
  return {
    useMobileDriveSyncStore: create(() => ({
      state: 'idle',
      lastSyncedAt: null,
      syncFromCloud: async () => {},
      isAuthenticated: false,
    })),
  };
});

vi.mock('@mobile/stores/useMobileProgressStore', async () => {
  const { create } = await import('zustand');
  return { useMobileProgressStore: create(() => ({ load: async () => {} })) };
});

vi.mock('@mobile/stores/useMobileStudentStore', async () => {
  const { create } = await import('zustand');
  return {
    useMobileStudentStore: create(() => ({ students: [], loaded: true, load: async () => {} })),
  };
});

vi.mock('@mobile/stores/useMobileHomeLayoutStore', async () => {
  const { create } = await import('zustand');
  return {
    useMobileHomeLayoutStore: create(() => ({
      hiddenCards: [],
      collapsedCards: {},
      toggleCollapsed: () => {},
    })),
  };
});

vi.mock('@mobile/stores/useMobileTodoStore', async () => {
  const { create } = await import('zustand');
  return { useMobileTodoStore: create(() => ({ todos: [], load: async () => {} })) };
});

// 동기화 배너는 GoogleAuthProvider 를 요구한다 — 이 테스트의 관심사가 아니라 비운다.
vi.mock('./SyncStatusBanner', () => ({ SyncStatusBanner: () => null }));
vi.mock('./SyncFreshnessIndicator', () => ({ SyncFreshnessIndicator: () => null }));

import { TodayHub } from './TodayHub';

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

beforeEach(() => {
  getTodayRecordSpy.mockReset();
  getTodayRecordSpy.mockReturnValue(null);
});

afterEach(() => {
  cleanup();
});

describe('홈의 출결 조회 키', () => {
  it('시간표 교실명이 아니라 수업반 id(UUID)로 조회한다', async () => {
    render(<TodayHub onNavigateAttendance={() => {}} onNavigateTodo={() => {}} />);
    await flush();

    const classIds = getTodayRecordSpy.mock.calls.map((c) => c[0]);

    // 이 두 줄이 버그를 되살리면(매칭을 빼고 slot.classroom 을 그대로 넘기면) 빨간불이 난다.
    expect(classIds).toContain(TEACHING_CLASS_ID);
    expect(classIds).not.toContain(CLASSROOM_LABEL);
  });

  it('그룹 학급이면 groupId 를 함께 넘긴다 — 다른 과목 명의의 공유 기록을 찾아야 한다', async () => {
    render(<TodayHub onNavigateAttendance={() => {}} onNavigateTodo={() => {}} />);
    await flush();

    const call = getTodayRecordSpy.mock.calls.find((c) => c[0] === TEACHING_CLASS_ID);

    expect(call).toBeDefined();
    expect(call![2]).toBe(GROUP_ID);
  });
});
