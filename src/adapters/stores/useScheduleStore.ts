import { create } from 'zustand';
import type { ClassScheduleData, TeacherScheduleData, ClassPeriod, TimetableOverride } from '@domain/entities/Timetable';
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

interface ScheduleState {
  classSchedule: ClassScheduleData;
  teacherSchedule: TeacherScheduleData;
  loaded: boolean;

  past: ScheduleSnapshot[];
  future: ScheduleSnapshot[];

  /** 임시 시간표 변경 */
  overrides: readonly TimetableOverride[];

  load: () => Promise<void>;
  forceReload: () => Promise<void>;
  updateClassSchedule: (data: ClassScheduleData) => Promise<void>;
  updateTeacherSchedule: (data: TeacherScheduleData) => Promise<void>;
  clearAll: (maxPeriods: number) => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  canUndo: () => boolean;
  canRedo: () => boolean;

  addOverride: (override: Omit<TimetableOverride, 'id' | 'createdAt' | 'updatedAt'>) => Promise<{ replacedId: string | null }>;
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
  /** 특정 날짜의 오버라이드가 적용된 교사 시간표 반환 */
  getEffectiveTeacherSchedule: (date: string, weekendDays?: readonly WeekendDay[]) => readonly (import('@domain/entities/Timetable').TeacherPeriod | null)[];
  /** 특정 날짜의 오버라이드가 적용된 학급 시간표 반환 */
  getEffectiveClassSchedule: (date: string, weekendDays?: readonly WeekendDay[]) => readonly ClassPeriod[];
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
        { ...slotA, kind: 'swap', pairId } as Omit<TimetableOverride, 'id' | 'createdAt' | 'updatedAt'>,
        now,
        idFactory,
      );
      const r2 = upsertOverride(
        r1.overrides,
        { ...slotB, kind: 'swap', pairId } as Omit<TimetableOverride, 'id' | 'createdAt' | 'updatedAt'>,
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
      const { id: _dropId, date: _dropDate, period: _dropPeriod, createdAt: _dropCreated, ...safePatch } =
        patch as Record<string, unknown>;
      void _dropId; void _dropDate; void _dropPeriod; void _dropCreated;
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
