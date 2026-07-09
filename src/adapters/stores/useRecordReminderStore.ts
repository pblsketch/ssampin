import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * 학생 관찰 기록 알림 — 런타임 상태 스토어.
 *
 * 사용자 *설정*(요일·시각·프리셋 등)은 `Settings.recordReminder`로 `settings` 동기화에 편승해
 * 기기 간 공유되지만, 여기의 **런타임 상태(순회 커서·스누즈·일시정지)는 기기 로컬에만 persist**한다.
 * 커서를 동기화하면 여러 기기가 서로 덮어써 전원 순회 공정성이 깨지기 때문(계획서 Fork A1).
 * 피로 상한/발화 집계는 별도 동기화 ledger(useReminderFireStore, P2/P3)가 담당한다.
 *
 * 선례: `useUpdatePreferencesStore` (zustand persist + 순수 gate 헬퍼 + now 주입).
 */

export interface RecordReminderRuntimeState {
  /** 전원 순회 커서 — 발화/건너뛰기마다 전진해 같은 학생만 반복되지 않게 한다. */
  rotationCursor: number;
  /** 스누즈("나중에") 만료 시각 (Unix ms). null=스누즈 없음. */
  snoozeUntil: number | null;
  /** 전체 일시정지 만료 시각 (Unix ms). null=정지 안 함. */
  pausedUntil: number | null;
  /** 마지막 스케줄 재계산 시각 (Unix ms). */
  lastComputeAt: number | null;
  /** 오늘 '이 학생 건너뛰기'한 dedup 키(`studentId:YYYY-MM-DD`) 목록 — 순회에서 제외. */
  skippedKeys: string[];
  /** 학생별 '나중에' 만료 시각. key(항목 key) → Unix ms. 만료 전까지 그 학생만 제외. */
  studentSnoozes: Record<string, number>;
}

export interface RecordReminderActions {
  /** 스누즈 — 기본 1시간 뒤로 미룸. */
  snooze: (hours?: number) => void;
  /** 스누즈 — 만료 시각(Unix ms)을 직접 지정(1시간/오후/내일 선택용). */
  snoozeUntilMs: (untilMs: number) => void;
  /** 특정 학생만 만료 시각까지 미룸(만료된 다른 학생 키는 정리). */
  snoozeStudentUntil: (key: string, untilMs: number) => void;
  /** 전체 일시정지 만료 시각 직접 지정(null=해제). */
  pauseUntil: (untilMs: number | null) => void;
  /** 오늘 하루(다음 자정까지) 일시정지. */
  pauseForToday: () => void;
  /** 이번 주(7일) 일시정지. */
  pauseForWeek: () => void;
  /** 일시정지 해제. */
  clearPause: () => void;
  /** 특정 학생을 그 날짜의 순회에서 건너뛴다(멱등). */
  skipStudent: (studentId: string, dateStr: string) => void;
  /** 순회 커서 전진. */
  advanceCursor: (by?: number) => void;
  /** 재계산 시각 기록. */
  markComputed: () => void;
  /** 상태 초기화(디버그/테스트용). */
  reset: () => void;
}

export type RecordReminderStore = RecordReminderRuntimeState & RecordReminderActions;

const INITIAL: RecordReminderRuntimeState = {
  rotationCursor: 0,
  snoozeUntil: null,
  pausedUntil: null,
  lastComputeAt: null,
  skippedKeys: [],
  studentSnoozes: {},
};

/** 주어진 시각의 다음 로컬 자정(Unix ms). */
function nextMidnight(now: number): number {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
}

export const useRecordReminderStore = create<RecordReminderStore>()(
  persist(
    (set) => ({
      ...INITIAL,

      snooze: (hours = 1) => set({ snoozeUntil: Date.now() + hours * 3_600_000 }),

      snoozeUntilMs: (untilMs) => set({ snoozeUntil: untilMs }),

      snoozeStudentUntil: (key, untilMs) =>
        set((s) => {
          const now = Date.now();
          const next: Record<string, number> = {};
          // 만료 안 된 기존 학생 스누즈만 보존(무한 누적 방지).
          for (const [k, v] of Object.entries(s.studentSnoozes)) {
            if (v > now) next[k] = v;
          }
          next[key] = untilMs;
          return { studentSnoozes: next };
        }),

      pauseUntil: (untilMs) => set({ pausedUntil: untilMs }),

      pauseForToday: () => set({ pausedUntil: nextMidnight(Date.now()) }),

      pauseForWeek: () => set({ pausedUntil: Date.now() + 7 * 86_400_000 }),

      clearPause: () => set({ pausedUntil: null }),

      skipStudent: (studentId, dateStr) =>
        set((s) => {
          const key = `${studentId}:${dateStr}`;
          return s.skippedKeys.includes(key) ? s : { skippedKeys: [...s.skippedKeys, key] };
        }),

      advanceCursor: (by = 1) => set((s) => ({ rotationCursor: s.rotationCursor + by })),

      markComputed: () => set({ lastComputeAt: Date.now() }),

      reset: () => set(INITIAL),
    }),
    {
      name: 'ssampin-record-reminder-v1',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (s) => ({
        rotationCursor: s.rotationCursor,
        snoozeUntil: s.snoozeUntil,
        pausedUntil: s.pausedUntil,
        lastComputeAt: s.lastComputeAt,
        skippedKeys: s.skippedKeys,
        studentSnoozes: s.studentSnoozes,
      }),
    },
  ),
);

/** 전체 일시정지 중인가. (now 주입으로 테스트 결정론) */
export function isReminderPaused(pausedUntil: number | null, now: number): boolean {
  return pausedUntil !== null && now < pausedUntil;
}

/** 스누즈 중인가. (now 주입으로 테스트 결정론) */
export function isReminderSnoozed(snoozeUntil: number | null, now: number): boolean {
  return snoozeUntil !== null && now < snoozeUntil;
}

/** 특정 학생이 '나중에'로 미뤄져 있는가. (now 주입으로 테스트 결정론) */
export function isStudentSnoozed(
  studentSnoozes: Record<string, number>,
  key: string,
  now: number,
): boolean {
  const until = studentSnoozes[key];
  return until !== undefined && now < until;
}
