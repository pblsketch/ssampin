/**
 * 관찰 기록 응원 2·3차(ADR-137) — **이 컴퓨터에만** 두는 그날 상태.
 *
 * - 오늘은 쉴게요(날짜)
 * - 오늘 챙길 학생 명단
 * - 먼저 거는 말(그날 말·열어 봤는지·알린 대상)
 *
 * 메인 창·바탕화면 위젯 창이 localStorage 로 함께 읽고(동기화하지 않는다), 다른 창이 바꾸면
 * `storage` 이벤트로 따라온다(`useObservationDaySync`). 쓸 때는 **지금 저장된 값**을 다시 읽어 그
 * 위에 얹는다 — 두 창이 같은 날 따로 진행해도 이미 고른 학생·알린 표시를 지우지 않게.
 * 읽을 수 없거나 깨진 값이어도 기록 저장·화면은 멈추지 않는다(모두 try/catch).
 *
 * ★쉬기는 기록 알림의 일시정지 값(`pausedUntil`)과 **따로** 둔다. `pauseForToday` 는 값을 덮어써
 *   선생님이 건 7일 일시정지를 하루로 줄이고, `clearPause` 는 그걸 지워 버린다(spec §1-2).
 */
import { useEffect } from 'react';
import { create } from 'zustand';
import {
  mergeTodayStudents,
  parseTodayStudents,
  type TodayStudentsState,
} from '@domain/rules/todayStudents';
import {
  EMPTY_TALK_STATE,
  parseTalkState,
  revokeTalkForRest,
  type TalkState,
} from '@domain/rules/proactiveTalk';
import { useRecordReminderStore } from '@adapters/stores/useRecordReminderStore';

/** 기록 알림 런타임 상태(일시정지·미루기)의 저장 키 — `useRecordReminderStore` 의 persist 이름. */
const RECORD_REMINDER_RUNTIME_KEY = 'ssampin-record-reminder-v1';

export const REST_KEY = 'ssampin:observation-rest';
export const TODAY_STUDENTS_KEY = 'ssampin:observation-today-students';
export const TALK_KEY = 'ssampin:observation-talk';
/** 같은 창 안에서 바뀐 것을 알리는 이벤트(storage 이벤트는 다른 창에만 간다). */
export const DAY_STATE_EVENT = 'ssampin:observation-day-state';

function readRaw(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: unknown): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장 공간이 막혀도 이 창 화면은 계속 동작한다.
  }
}

function readRestDay(): string | null {
  const v = readRaw(REST_KEY);
  if (typeof v !== 'object' || v === null) return null;
  const day = (v as Record<string, unknown>)['day'];
  return typeof day === 'string' ? day : null;
}

function readTodayStudents(): TodayStudentsState | null {
  return parseTodayStudents(readRaw(TODAY_STUDENTS_KEY));
}

function readTalk(): TalkState {
  return parseTalkState(readRaw(TALK_KEY));
}

export interface ObservationDayState {
  readonly restDay: string | null;
  readonly todayStudents: TodayStudentsState | null;
  readonly talk: TalkState;
}

export interface ObservationDayActions {
  /** 저장소에서 다시 읽는다(다른 창이 바꿨을 때). */
  refresh: () => void;
  /** 오늘은 쉴게요 — 아직 열어 보지 않은 그날 말도 거둔다. */
  restToday: (today: string) => void;
  /** 다시 켜기 — 쉬기만 푼다(선생님이 건 알림 일시정지는 그대로). */
  clearRest: () => void;
  /** 명단을 진행한다 — 지금 저장된 값과 합쳐 쓴다. */
  updateTodayStudents: (fn: (prev: TodayStudentsState | null) => TodayStudentsState) => void;
  /** 먼저 거는 말 상태를 바꾼다 — 지금 저장된 값 위에서. */
  updateTalk: (fn: (prev: TalkState) => TalkState) => void;
}

function notifySameWindow(): void {
  try {
    window.dispatchEvent(new Event(DAY_STATE_EVENT));
  } catch {
    // 이벤트를 못 보내도 저장소 값은 남는다.
  }
}

function readAll(): ObservationDayState {
  return { restDay: readRestDay(), todayStudents: readTodayStudents(), talk: readTalk() };
}

/** 저장소에서 새로 읽은 값이 지금 값과 같으면 지금 값을 그대로 둔다 — 같은 내용으로 매분 다시 그리지 않게. */
function keepIfSame<T>(current: T, fresh: T): T {
  return JSON.stringify(current) === JSON.stringify(fresh) ? current : fresh;
}

export const useObservationDayStore = create<ObservationDayState & ObservationDayActions>(
  (set, get) => ({
    ...(typeof window === 'undefined'
      ? { restDay: null, todayStudents: null, talk: EMPTY_TALK_STATE }
      : readAll()),

    refresh: () => {
      const fresh = readAll();
      const cur = get();
      const next = {
        restDay: fresh.restDay,
        todayStudents: keepIfSame(cur.todayStudents, fresh.todayStudents),
        talk: keepIfSame(cur.talk, fresh.talk),
      };
      if (
        next.restDay === cur.restDay &&
        next.todayStudents === cur.todayStudents &&
        next.talk === cur.talk
      ) {
        return;
      }
      set(next);
    },

    restToday: (today) => {
      writeRaw(REST_KEY, { day: today });
      const talk = revokeTalkForRest(readTalk(), today);
      writeRaw(TALK_KEY, talk);
      set({ restDay: today, talk });
      notifySameWindow();
    },

    clearRest: () => {
      writeRaw(REST_KEY, null);
      set({ restDay: null });
      notifySameWindow();
    },

    updateTodayStudents: (fn) => {
      const latest = readTodayStudents();
      const next = fn(latest);
      if (next === latest) {
        const kept = keepIfSame(get().todayStudents, latest);
        if (kept !== get().todayStudents) set({ todayStudents: kept });
        return;
      }
      const merged = mergeTodayStudents(latest, next);
      writeRaw(TODAY_STUDENTS_KEY, merged);
      set({ todayStudents: merged });
      notifySameWindow();
    },

    updateTalk: (fn) => {
      const latest = readTalk();
      const next = fn(latest);
      if (next === latest) {
        const kept = keepIfSame(get().talk, latest);
        if (kept !== get().talk) set({ talk: kept });
        return;
      }
      writeRaw(TALK_KEY, next);
      set({ talk: next });
      notifySameWindow();
    },
  }),
);

/** 오늘 쉬는 중인가. */
export function isRestingToday(restDay: string | null, today: string): boolean {
  return restDay !== null && restDay === today;
}

/**
 * 다른 창(또는 같은 창의 다른 자리)이 바꾼 그날 상태를 따라간다. 창마다 한 번 단다.
 *
 * 기록 알림의 일시정지 상태도 함께 따라간다 — 그 스토어는 창마다 처음에만 읽어, 위젯 창에서 건
 * 일시정지를 메인 창이 모르고(또는 그 반대) 오늘 챙길 학생이 창마다 달라졌다.
 */
export function useObservationDaySync(): void {
  useEffect(() => {
    const refresh = (): void => useObservationDayStore.getState().refresh();
    const onStorage = (e: StorageEvent): void => {
      if (
        e.key === null ||
        e.key === REST_KEY ||
        e.key === TODAY_STUDENTS_KEY ||
        e.key === TALK_KEY
      ) {
        refresh();
      }
      if (e.key === RECORD_REMINDER_RUNTIME_KEY) {
        try {
          void useRecordReminderStore.persist.rehydrate();
        } catch {
          // 다시 읽지 못해도 이 창의 값으로 계속 동작한다.
        }
      }
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(DAY_STATE_EVENT, refresh);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(DAY_STATE_EVENT, refresh);
    };
  }, []);
}
