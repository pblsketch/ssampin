import { create } from 'zustand';
import type {
  ClassScheduleData,
  TeacherScheduleData,
  ClassPeriod,
  TimetableOverride,
} from '@domain/entities/Timetable';
import {
  createEmptyClassSchedule,
  createEmptyTeacherSchedule,
  migrateClassScheduleData,
  upsertOverride,
  mergeOverridesIntoTeacherSchedule,
  mergeOverridesIntoClassSchedule,
  filterOverridesInRange,
  dedupeOverridesKeepLatest,
} from '@domain/rules/timetableRules';
import {
  reconcileComciganWeeklyOverrides,
  removeComciganWeeklyOverrides,
} from '@domain/rules/comciganWeeklyOverrides';
import type { WeeklyOverrideDraft } from '@domain/rules/comciganWeeklyOverrides';
import { scheduleRepository } from '@adapters/di/container';
import { getDayOfWeek } from '@domain/rules/periodRules';
import type { WeekendDay } from '@domain/valueObjects/DayOfWeek';

/** 초기 빈 시간표 (저장된 데이터가 없을 때 사용) */
const EMPTY_CLASS_SCHEDULE: ClassScheduleData = createEmptyClassSchedule(7);
const EMPTY_TEACHER_SCHEDULE: TeacherScheduleData = createEmptyTeacherSchedule(7);

/** Undo/Redo를 위한 스냅샷 타입 */
interface ScheduleSnapshot {
  classSchedule: ClassScheduleData;
  teacherSchedule: TeacherScheduleData;
}

/**
 * 컴시간 변경 감지 후 사용자 검토를 대기 중인 새 교사 시간표(비파괴 — 확인 전엔 미적용).
 * 앱 시작 훅(useComciganAutoSync)이 채우고 시간표 화면이 배너로 노출한다. 영속·동기화 안 함.
 */
export interface PendingComciganReview {
  readonly schedule: TeacherScheduleData;
  /** 바뀐 칸 수(배너 표시용) */
  readonly changeCount: number;
}

/**
 * 컴시간 이번 주 변동(보강·교체) 자동 반영 결과. 시간표 화면 배너가 이 값을 읽는다.
 * 변동 자체는 변동 시간표(overrides)로 이미 저장됐으므로 이 값은 **안내용**이며 영속·동기화하지 않는다.
 */
export interface ComciganWeeklyApplyState {
  /** 대상 주의 월요일 'YYYY-MM-DD' */
  readonly weekMonday: string;
  /** 컴시간이 알려준 이번 주 변동 칸 수 */
  readonly changeCount: number;
  /** 실제로 시간표에 반영한 칸 수 */
  readonly applied: number;
  /** 사용자가 직접 만든 변동이 있어 건너뛴 칸 수 */
  readonly skipped: number;
  /**
   * - 'applied': 반영했다
   * - 'reverted': 사용자가 되돌렸다(다시 반영하기 가능)
   * - 'not-applied': 반영하지 않았다(주말·되돌린 주)
   */
  readonly state: 'applied' | 'reverted' | 'not-applied';
  /** 'not-applied' 이유 */
  readonly reason?: 'weekend' | 'suppressed';
  /** 되돌린 뒤 '다시 반영하기'로 복원할 초안 */
  readonly drafts: readonly WeeklyOverrideDraft[];
}

/**
 * 압핀 변경 감지 후 사용자 검토를 대기 중인 새 시간표(비파괴 — 확인 전엔 미적용).
 * 교사/학급 둘 다 대상이 될 수 있어 target으로 구분한다. 영속·동기화 안 함.
 */
export interface PendingAppinReview {
  readonly schedule: TeacherScheduleData | ClassScheduleData;
  readonly changeCount: number;
  readonly target: 'teacher' | 'class';
}

interface ScheduleState {
  classSchedule: ClassScheduleData;
  teacherSchedule: TeacherScheduleData;
  loaded: boolean;

  past: ScheduleSnapshot[];
  future: ScheduleSnapshot[];

  /** 임시 시간표 변경 */
  overrides: readonly TimetableOverride[];

  /** 컴시간 변경 감지 후 검토 대기 중인 교사 시간표(없으면 null) */
  pendingComciganReview: PendingComciganReview | null;
  setPendingComciganReview: (review: PendingComciganReview | null) => void;

  /** 컴시간 이번 주 변동 자동 반영 결과 — 안내 전용, 없으면 null */
  comciganWeeklyApply: ComciganWeeklyApplyState | null;
  setComciganWeeklyApply: (state: ComciganWeeklyApplyState | null) => void;

  /** 압핀 변경 감지 후 검토 대기 중인 시간표(교사/학급, 없으면 null) */
  pendingAppinReview: PendingAppinReview | null;
  setPendingAppinReview: (review: PendingAppinReview | null) => void;

  load: () => Promise<void>;
  forceReload: () => Promise<void>;
  updateClassSchedule: (data: ClassScheduleData) => Promise<void>;
  updateTeacherSchedule: (data: TeacherScheduleData) => Promise<void>;
  clearAll: (maxPeriods: number) => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  canUndo: () => boolean;
  canRedo: () => boolean;

  addOverride: (
    override: Omit<TimetableOverride, 'id' | 'createdAt' | 'updatedAt'>,
  ) => Promise<{ replacedId: string | null }>;
  /** 수업 교체: 두 개의 변동을 같은 pairId로 묶어 원자적으로 저장 */
  addSwapPair: (
    slotA: Omit<TimetableOverride, 'id' | 'createdAt' | 'updatedAt' | 'kind' | 'pairId'>,
    slotB: Omit<TimetableOverride, 'id' | 'createdAt' | 'updatedAt' | 'kind' | 'pairId'>,
  ) => Promise<{ pairId: string }>;
  updateOverride: (
    id: string,
    patch: Partial<Omit<TimetableOverride, 'id' | 'date' | 'period' | 'createdAt'>>,
  ) => Promise<void>;
  deleteOverride: (id: string) => Promise<void>;
  /**
   * 컴시간 이번 주 변동 자동 등록. 그 주의 컴시간발 항목 전체를 새 결과로 교체하고,
   * 지난 주 이전 컴시간발 항목을 정리한다. 사용자가 직접 만든 변동이 있는 칸은 건너뛴다.
   */
  applyComciganWeeklyOverrides: (
    weekMonday: string,
    drafts: readonly WeeklyOverrideDraft[],
  ) => Promise<{ applied: number; skipped: number }>;
  /** 되돌리기 — 그 주의 컴시간발 항목만 지운다 */
  revertComciganWeeklyOverrides: (weekMonday: string) => Promise<{ removed: number }>;
  /** 특정 날짜의 오버라이드가 적용된 교사 시간표 반환 */
  getEffectiveTeacherSchedule: (
    date: string,
    weekendDays?: readonly WeekendDay[],
  ) => readonly (import('@domain/entities/Timetable').TeacherPeriod | null)[];
  /** 특정 날짜의 오버라이드가 적용된 학급 시간표 반환 */
  getEffectiveClassSchedule: (
    date: string,
    weekendDays?: readonly WeekendDay[],
  ) => readonly ClassPeriod[];
  /** 특정 날짜의 오버라이드 목록 반환 */
  getOverridesForDate: (date: string) => readonly TimetableOverride[];
  /** 날짜 범위의 오버라이드 목록 반환 (inclusive) */
  getOverridesInRange: (from: string, to: string) => readonly TimetableOverride[];
}

export const useScheduleStore = create<ScheduleState>((set, get) => {
  const pushToHistory = () => {
    const { classSchedule, teacherSchedule, past } = get();
    const snapshot: ScheduleSnapshot = { classSchedule, teacherSchedule };
    const newPast = [...past, snapshot].slice(-20);
    set({ past: newPast, future: [] });
  };

  return {
    classSchedule: EMPTY_CLASS_SCHEDULE,
    teacherSchedule: EMPTY_TEACHER_SCHEDULE,
    loaded: false,
    past: [],
    future: [],
    overrides: [],
    pendingComciganReview: null,
    pendingAppinReview: null,
    comciganWeeklyApply: null,

    setPendingComciganReview: (review) => set({ pendingComciganReview: review }),

    setComciganWeeklyApply: (state) => set({ comciganWeeklyApply: state }),

    setPendingAppinReview: (review) => set({ pendingAppinReview: review }),

    load: async () => {
      if (get().loaded) return;
      try {
        const [classRaw, teacherSch, overridesData] = await Promise.all([
          scheduleRepository.getClassSchedule(),
          scheduleRepository.getTeacherSchedule(),
          scheduleRepository.getTimetableOverrides(),
        ]);
        // 기존 string[] 포맷 → ClassPeriod[] 포맷 마이그레이션
        const classSch = classRaw
          ? migrateClassScheduleData(classRaw as Record<string, readonly (string | ClassPeriod)[]>)
          : null;

        // 중복 override 정리 마이그레이션 (append-only 버그 잔재)
        const loadedOverrides = overridesData?.overrides ?? [];
        const deduped = dedupeOverridesKeepLatest(loadedOverrides);
        if (deduped.length !== loadedOverrides.length) {
          try {
            await scheduleRepository.saveTimetableOverrides({ overrides: deduped });
          } catch {
            // 저장 실패 시에도 메모리 상태는 dedup된 값 사용
          }
        }

        set({
          classSchedule: classSch ?? EMPTY_CLASS_SCHEDULE,
          teacherSchedule: teacherSch ?? EMPTY_TEACHER_SCHEDULE,
          overrides: deduped,
          loaded: true,
        });
      } catch {
        set({ loaded: true });
      }
    },

    forceReload: async () => {
      set({ loaded: false });
      await get().load();
    },

    updateClassSchedule: async (data) => {
      pushToHistory();
      set({ classSchedule: data });
      await scheduleRepository.saveClassSchedule(data);
    },

    updateTeacherSchedule: async (data) => {
      pushToHistory();
      set({ teacherSchedule: data });
      await scheduleRepository.saveTeacherSchedule(data);
    },

    clearAll: async (maxPeriods) => {
      pushToHistory();
      const emptyClass = createEmptyClassSchedule(maxPeriods);
      const emptyTeacher = createEmptyTeacherSchedule(maxPeriods);
      set({ classSchedule: emptyClass, teacherSchedule: emptyTeacher });
      await Promise.all([
        scheduleRepository.saveClassSchedule(emptyClass),
        scheduleRepository.saveTeacherSchedule(emptyTeacher),
      ]);
    },

    undo: async () => {
      const { past, future, classSchedule, teacherSchedule } = get();
      if (past.length === 0) return;
      const prev = past[past.length - 1]!;
      const currentSnapshot: ScheduleSnapshot = { classSchedule, teacherSchedule };
      const newPast = past.slice(0, -1);
      const newFuture = [currentSnapshot, ...future].slice(0, 20);

      try {
        await Promise.all([
          scheduleRepository.saveClassSchedule(prev.classSchedule),
          scheduleRepository.saveTeacherSchedule(prev.teacherSchedule),
        ]);
        set({
          classSchedule: prev.classSchedule,
          teacherSchedule: prev.teacherSchedule,
          past: newPast,
          future: newFuture,
        });
      } catch {
        // 무시
      }
    },

    redo: async () => {
      const { past, future, classSchedule, teacherSchedule } = get();
      if (future.length === 0) return;
      const next = future[0]!;
      const currentSnapshot: ScheduleSnapshot = { classSchedule, teacherSchedule };
      const newFuture = future.slice(1);
      const newPast = [...past, currentSnapshot].slice(-20);

      try {
        await Promise.all([
          scheduleRepository.saveClassSchedule(next.classSchedule),
          scheduleRepository.saveTeacherSchedule(next.teacherSchedule),
        ]);
        set({
          classSchedule: next.classSchedule,
          teacherSchedule: next.teacherSchedule,
          past: newPast,
          future: newFuture,
        });
      } catch {
        // 무시
      }
    },

    canUndo: () => get().past.length > 0,
    canRedo: () => get().future.length > 0,

    addOverride: async (input) => {
      const { overrides: current } = get();
      const now = new Date().toISOString();
      const idFactory = () => `ovr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const { overrides: next, replacedId } = upsertOverride(current, input, now, idFactory);
      set({ overrides: next });
      await scheduleRepository.saveTimetableOverrides({ overrides: next });
      return { replacedId };
    },

    addSwapPair: async (slotA, slotB) => {
      const current = get().overrides;
      const now = new Date().toISOString();
      const pairId = `pair-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const idFactory = () => `ovr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const r1 = upsertOverride(
        current,
        { ...slotA, kind: 'swap', pairId } as Omit<
          TimetableOverride,
          'id' | 'createdAt' | 'updatedAt'
        >,
        now,
        idFactory,
      );
      const r2 = upsertOverride(
        r1.overrides,
        { ...slotB, kind: 'swap', pairId } as Omit<
          TimetableOverride,
          'id' | 'createdAt' | 'updatedAt'
        >,
        now,
        idFactory,
      );
      set({ overrides: r2.overrides });
      await scheduleRepository.saveTimetableOverrides({ overrides: r2.overrides });
      return { pairId };
    },

    updateOverride: async (id, patch) => {
      const current = get().overrides;
      const idx = current.findIndex((o) => o.id === id);
      if (idx < 0) return;
      const prev = current[idx]!;
      // 핵심 키(id/date/period/createdAt)는 patch로 바꿀 수 없다 — 경계 방어
      const {
        id: _dropId,
        date: _dropDate,
        period: _dropPeriod,
        createdAt: _dropCreated,
        ...safePatch
      } = patch as Record<string, unknown>;
      void _dropId;
      void _dropDate;
      void _dropPeriod;
      void _dropCreated;
      const updated: TimetableOverride = {
        ...prev,
        ...(safePatch as Partial<TimetableOverride>),
        id: prev.id,
        date: prev.date,
        period: prev.period,
        createdAt: prev.createdAt,
        updatedAt: new Date().toISOString(),
      };
      const next = current.map((o, i) => (i === idx ? updated : o));
      set({ overrides: next });
      await scheduleRepository.saveTimetableOverrides({ overrides: next });
    },

    deleteOverride: async (id) => {
      const newOverrides = get().overrides.filter((o) => o.id !== id);
      set({ overrides: newOverrides });
      await scheduleRepository.saveTimetableOverrides({ overrides: newOverrides });
    },

    applyComciganWeeklyOverrides: async (weekMonday, drafts) => {
      const now = new Date().toISOString();
      let seq = 0;
      const idFactory = () =>
        `ovr-cmc-${Date.now()}-${(seq++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const result = reconcileComciganWeeklyOverrides({
        existing: get().overrides,
        weekMonday,
        drafts,
        now,
        idFactory,
      });
      // 변화가 없으면 저장하지 않는다 — 불필요한 클라우드 동기화 쓰기를 만들지 않는다.
      if (result.changed) {
        set({ overrides: result.overrides });
        await scheduleRepository.saveTimetableOverrides({ overrides: result.overrides });
      }
      return { applied: result.applied, skipped: result.skipped };
    },

    revertComciganWeeklyOverrides: async (weekMonday) => {
      const { overrides, removed } = removeComciganWeeklyOverrides(get().overrides, weekMonday);
      if (removed === 0) return { removed: 0 };
      set({ overrides });
      await scheduleRepository.saveTimetableOverrides({ overrides });
      return { removed };
    },

    getEffectiveTeacherSchedule: (date, weekendDays) => {
      const d = new Date(date + 'T00:00:00');
      const dayOfWeekVal = getDayOfWeek(d, weekendDays);
      if (!dayOfWeekVal) return [];
      const baseSchedule = get().teacherSchedule[dayOfWeekVal] ?? [];
      const dayOverrides = get().overrides.filter((o) => o.date === date);
      return mergeOverridesIntoTeacherSchedule(baseSchedule, dayOverrides);
    },

    getEffectiveClassSchedule: (date, weekendDays) => {
      const d = new Date(date + 'T00:00:00');
      const dayOfWeekVal = getDayOfWeek(d, weekendDays);
      if (!dayOfWeekVal) return [];
      const baseSchedule = get().classSchedule[dayOfWeekVal] ?? [];
      const dayOverrides = get().overrides.filter((o) => o.date === date);
      return mergeOverridesIntoClassSchedule(baseSchedule, dayOverrides);
    },

    getOverridesForDate: (date) => {
      return get().overrides.filter((o) => o.date === date);
    },

    getOverridesInRange: (from, to) => {
      return filterOverridesInRange(get().overrides, from, to);
    },
  };
});
