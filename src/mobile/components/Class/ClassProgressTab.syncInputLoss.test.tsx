// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />
/**
 * 진도 입력 중에 **백그라운드 동기화가 돌아도 입력이 살아남는지** 지킨다.
 *
 * 왜 필요한가 — 신고: "모바일에서 진도 체크가 안 된다"(2026-08-24).
 * 실제로는 상태 배지 탭이 아니라 **입력 소실**이었다. 모바일은 앱을 켤 때,
 * 다른 앱 갔다 돌아올 때(visibilitychange), 네트워크가 붙을 때마다
 * `useSyncTrigger` → `syncFromCloud` → `reloadAllStores` 로 모든 스토어를 다시 읽는다.
 *
 * 그때 두 가지가 입력을 지웠다.
 *   1. 스토어 `reload()`가 `loaded:false`를 떨어뜨림 → 화면의 `if (!loaded) return <Spinner/>`
 *      가드가 진도 탭을 통째로 언마운트 → 열려 있던 모달과 타이핑이 사라짐
 *   2. 입력 모달의 폼 초기화 효과가 `candidates`(학급 목록 파생 배열)에 의존 →
 *      내용이 같아도 배열이 새로 만들어지면 폼이 비워짐
 *
 * 두 경로 모두 여기서 막는다. 도메인 규칙만 따로 검사하면 화면이 그 규칙을 안 써도
 * 초록불이 나므로, **실제 컴포넌트를 렌더해서** 확인한다.
 *
 * ⚠️ 리로드 "도중"의 화면을 봐야 하므로 `reload()` 시작은 `act()` 밖에서 한다.
 * `act()` 안에서 시작하면 React 가 중간 렌더를 미뤄 버려 언마운트가 관측되지 않는다
 * (버그가 있어도 통과하는 그물이 된다).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const CLASS_ID = 'class-uuid-1';
const CLASS_NAME = '3학년 2반';

/** 수업반 픽스처 — 호출할 때마다 새 배열/객체를 만든다(동기화 리로드가 하는 일과 같다). */
function makeClass() {
  return {
    id: CLASS_ID,
    name: CLASS_NAME,
    subject: '국어',
    students: [],
    createdAt: '2026-03-02T00:00:00.000Z',
    updatedAt: '2026-03-02T00:00:00.000Z',
  };
}

const mem = vi.hoisted(() => ({ store: new Map<string, unknown>() }));

vi.mock('@mobile/di/container', () => ({
  teachingClassRepository: {
    /** 실기기 IndexedDB 읽기 지연을 흉내 낸다 — 즉시 resolve 하면 중간 렌더가 안 생긴다. */
    getProgress: async () => {
      await new Promise((r) => setTimeout(r, 5));
      return mem.store.get('curriculum-progress') ?? null;
    },
    saveProgress: async (d: unknown) => {
      mem.store.set('curriculum-progress', d);
    },
    getClasses: async () => null,
    saveClasses: async () => {},
    getAttendance: async () => null,
    saveAttendance: async () => {},
  },
}));

vi.mock('@mobile/stores/useMobileDriveSyncStore', async () => {
  const { create } = await import('zustand');
  return { useMobileDriveSyncStore: create(() => ({ triggerSaveSync: () => {} })) };
});

vi.mock('@mobile/stores/useMobileTeachingClassStore', async () => {
  const { create } = await import('zustand');
  return {
    useMobileTeachingClassStore: create(() => ({
      classes: [makeClass()],
      loaded: true,
      load: async () => {},
    })),
  };
});

vi.mock('@mobile/stores/useMobileScheduleStore', async () => {
  const { create } = await import('zustand');
  return {
    useMobileScheduleStore: create(() => ({
      teacherSchedule: {},
      classSchedule: {},
      overrides: [],
      loaded: true,
      load: async () => {},
    })),
  };
});

vi.mock('@mobile/stores/useMobileSettingsStore', async () => {
  const { create } = await import('zustand');
  return {
    useMobileSettingsStore: create(() => ({
      settings: {
        periodTimes: [],
        enableWeekendDays: [],
        termEndDates: {},
        termStartDates: {},
        currentTerm: '2026-2',
      },
      loaded: true,
      load: async () => {},
    })),
  };
});

vi.mock('@mobile/stores/useMobileEventsStore', async () => {
  const { create } = await import('zustand');
  return {
    useMobileEventsStore: create(() => ({ events: [], loaded: true, load: async () => {} })),
  };
});

const { ClassProgressTab } = await import('./ClassProgressTab');
const { useMobileProgressStore } = await import('@mobile/stores/useMobileProgressStore');
const { useMobileTeachingClassStore } = await import('@mobile/stores/useMobileTeachingClassStore');

/** 진도 입력 모달의 '단원' 입력칸 */
const UNIT_PLACEHOLDER = /1단원 - 문학의 이해|예: 1단원/;

function findUnitInput(): HTMLInputElement | null {
  return screen.queryByPlaceholderText(UNIT_PLACEHOLDER) as HTMLInputElement | null;
}

/** 진도 추가 모달을 열고 '단원'에 글자를 넣은 상태까지 만든다. */
async function openModalAndType(text: string): Promise<void> {
  const addBtn = await screen.findByLabelText(`${CLASS_NAME} 진도 항목 추가`);
  await act(async () => {
    fireEvent.click(addBtn);
  });
  const unitInput = await screen.findByPlaceholderText(UNIT_PLACEHOLDER);
  await act(async () => {
    fireEvent.change(unitInput, { target: { value: text } });
  });
  expect((unitInput as HTMLInputElement).value).toBe(text);
}

beforeEach(() => {
  mem.store.clear();
  mem.store.set('curriculum-progress', {
    entries: [
      {
        id: 'e1',
        classId: CLASS_ID,
        date: '2026-08-24',
        period: 3,
        unit: '1단원',
        lesson: '1차시',
        status: 'planned',
        note: '',
      },
    ],
  });
  useMobileProgressStore.setState({ entries: [], lessonDayAdjustments: [], loaded: false });
});

afterEach(() => cleanup());

describe('모바일 진도 탭 — 동기화 중 입력 보존', () => {
  it('상태 배지를 탭하면 예정 → 완료로 바뀌고 저장된다', async () => {
    render(<ClassProgressTab classId={CLASS_ID} className={CLASS_NAME} />);

    const badge = await screen.findByRole('button', { name: /상태: 예정/ });
    await act(async () => {
      fireEvent.click(badge);
    });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /상태: 완료/ })).toBeInTheDocument(),
    );
    const saved = mem.store.get('curriculum-progress') as { entries: { status: string }[] };
    expect(saved.entries[0]!.status).toBe('completed');
  });

  it('진도 스토어 reload 중에도 입력 모달이 언마운트되지 않는다', async () => {
    render(<ClassProgressTab classId={CLASS_ID} className={CLASS_NAME} />);
    await openModalAndType('3단원 시의 표현');

    // act() 밖에서 시작해야 리로드 "도중" 화면을 볼 수 있다 (파일 머리말 참조).
    const reloading = useMobileProgressStore.getState().reload();
    await new Promise((r) => setTimeout(r, 2));

    expect(screen.queryByText('오늘 진도 기록')).not.toBeNull();
    expect(findUnitInput()?.value).toBe('3단원 시의 표현');

    await act(async () => {
      await reloading;
    });
    expect(findUnitInput()?.value).toBe('3단원 시의 표현');
  });

  it('학급 목록이 새 배열로 갱신돼도 입력한 단원이 남는다', async () => {
    render(<ClassProgressTab classId={CLASS_ID} className={CLASS_NAME} />);
    await openModalAndType('3단원 시의 표현');

    // 동기화가 teaching-classes 를 다시 읽으면 내용이 같아도 배열 identity 가 바뀐다.
    await act(async () => {
      useMobileTeachingClassStore.setState({
        classes: [makeClass()],
      });
    });

    expect(findUnitInput()?.value).toBe('3단원 시의 표현');
  });

  it('reload()는 loaded를 false로 되돌리지 않는다 (화면 언마운트 방지 계약)', async () => {
    await act(async () => {
      await useMobileProgressStore.getState().load();
    });
    expect(useMobileProgressStore.getState().loaded).toBe(true);

    const seen: boolean[] = [];
    const unsub = useMobileProgressStore.subscribe((s) => seen.push(s.loaded));
    await act(async () => {
      await useMobileProgressStore.getState().reload();
    });
    unsub();

    expect(seen).not.toContain(false);
  });
});
