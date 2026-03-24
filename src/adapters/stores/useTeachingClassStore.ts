import { create } from 'zustand';
import type { TeachingClass, TeachingClassStudent, TeachingClassSeating } from '@domain/entities/TeachingClass';
import { studentKey } from '@domain/entities/TeachingClass';
import type { OddColumnMode } from '@domain/rules/seatingLayoutRules';
import type { ProgressEntry } from '@domain/entities/CurriculumProgress';
import type { AttendanceRecord, AttendanceStatus } from '@domain/entities/Attendance';
import { teachingClassRepository } from '@adapters/di/container';
import { ManageTeachingClasses } from '@usecases/classManagement/ManageTeachingClasses';
import { ManageCurriculumProgress } from '@usecases/classManagement/ManageCurriculumProgress';
import { ManageAttendance } from '@usecases/classManagement/ManageAttendance';

interface TeachingClassState {
  classes: readonly TeachingClass[];
  progressEntries: readonly ProgressEntry[];
  attendanceRecords: readonly AttendanceRecord[];
  selectedClassId: string | null;
  loaded: boolean;
  loadFailed: boolean;
  load: () => Promise<void>;
  selectClass: (id: string | null) => void;
  addClass: (name: string, subject: string, students: readonly TeachingClassStudent[]) => Promise<void>;
  updateClass: (cls: TeachingClass) => Promise<void>;
  deleteClass: (id: string) => Promise<void>;
  reorderClasses: (orderedIds: string[]) => Promise<void>;
  addProgressEntry: (
    classId: string,
    date: string,
    period: number,
    unit: string,
    lesson: string,
    note?: string,
  ) => Promise<void>;
  updateProgressEntry: (entry: ProgressEntry) => Promise<void>;
  deleteProgressEntry: (id: string) => Promise<void>;
  getAttendanceRecord: (classId: string, date: string, period: number) => AttendanceRecord | undefined;
  saveAttendanceRecord: (record: AttendanceRecord) => Promise<void>;
  // 좌석배치 액션
  initClassSeating: (classId: string, mode: 'sequential' | 'random') => Promise<void>;
  randomizeClassSeating: (classId: string) => Promise<void>;
  swapClassSeats: (classId: string, r1: number, c1: number, r2: number, c2: number) => Promise<void>;
  clearClassSeating: (classId: string) => Promise<void>;
  resizeClassGrid: (classId: string, rows: number, cols: number) => Promise<void>;
  toggleClassPairMode: (classId: string) => Promise<void>;
  toggleClassOddColumnMode: (classId: string) => Promise<void>;
}

export const useTeachingClassStore = create<TeachingClassState>((set, get) => {
  const manageClasses = new ManageTeachingClasses(teachingClassRepository);
  const manageProgress = new ManageCurriculumProgress(teachingClassRepository);
  const manageAttendance = new ManageAttendance(teachingClassRepository);

  return {
    classes: [],
    progressEntries: [],
    attendanceRecords: [],
    selectedClassId: null,
    loaded: false,
    loadFailed: false,

    load: async () => {
      if (get().loaded) return;
      try {
        const [classes, progressEntries, attendanceRecords] = await Promise.all([
          manageClasses.getAll(),
          manageProgress.getAll(),
          manageAttendance.getAll(),
        ]);
        // order 기준 정렬 (order 없으면 생성순)
        const sorted = [...classes].sort((a, b) => {
          const orderA = a.order ?? Infinity;
          const orderB = b.order ?? Infinity;
          if (orderA !== orderB) return orderA - orderB;
          return a.createdAt.localeCompare(b.createdAt);
        });
        set({ classes: sorted, progressEntries, attendanceRecords, loaded: true, loadFailed: false });
      } catch (err) {
        console.error('[TeachingClassStore] load failed:', err);
        set({ loaded: true, loadFailed: true });
      }
    },

    selectClass: (id) => {
      set({ selectedClassId: id });
    },

    addClass: async (name, subject, students) => {
      const now = new Date().toISOString();
      const newClass: TeachingClass = {
        id: crypto.randomUUID(),
        name,
        subject,
        students,
        createdAt: now,
        updatedAt: now,
      };
      await manageClasses.add(newClass);
      set((state) => ({ classes: [...state.classes, newClass] }));
    },

    updateClass: async (cls) => {
      const updated: TeachingClass = { ...cls, updatedAt: new Date().toISOString() };
      set((state) => ({
        classes: state.classes.map((c) => (c.id === updated.id ? updated : c)),
      }));
      await manageClasses.update(updated);
    },

    deleteClass: async (id) => {
      if (get().loadFailed) {
        console.warn('[TeachingClassStore] 데이터 로드 실패 상태에서 삭제 차단');
        return;
      }
      await manageClasses.delete(id);
      // 해당 학급의 진도 기록과 출석 기록도 함께 삭제
      const progressToKeep = get().progressEntries.filter((e) => e.classId !== id);
      const attendanceToKeep = get().attendanceRecords.filter((r) => r.classId !== id);
      await manageProgress.saveAll(progressToKeep);
      await manageAttendance.saveAll(attendanceToKeep);
      set((state) => ({
        classes: state.classes.filter((c) => c.id !== id),
        progressEntries: progressToKeep,
        attendanceRecords: attendanceToKeep,
        selectedClassId: state.selectedClassId === id ? null : state.selectedClassId,
      }));
    },

    reorderClasses: async (orderedIds) => {
      const classes = get().classes;
      const reordered: TeachingClass[] = orderedIds
        .map((id, index) => {
          const cls = classes.find((c) => c.id === id);
          if (!cls) return null;
          const updated: TeachingClass = { ...cls, order: index, updatedAt: new Date().toISOString() };
          return updated;
        })
        .filter((c): c is TeachingClass => c !== null);

      set({ classes: reordered });
      await teachingClassRepository.saveClasses({ classes: reordered });
    },

    addProgressEntry: async (classId, date, period, unit, lesson, note = '') => {
      const entry: ProgressEntry = {
        id: crypto.randomUUID(),
        classId,
        date,
        period,
        unit,
        lesson,
        status: 'planned',
        note,
      };
      await manageProgress.add(entry);
      set((state) => ({ progressEntries: [...state.progressEntries, entry] }));
    },

    updateProgressEntry: async (entry) => {
      set((state) => ({
        progressEntries: state.progressEntries.map((e) => (e.id === entry.id ? entry : e)),
      }));
      await manageProgress.update(entry);
    },

    deleteProgressEntry: async (id) => {
      await manageProgress.delete(id);
      set((state) => ({
        progressEntries: state.progressEntries.filter((e) => e.id !== id),
      }));
    },

    getAttendanceRecord: (classId, date, period) => {
      return get().attendanceRecords.find(
        (r) => r.classId === classId && r.date === date && r.period === period,
      );
    },

    /* ────── 좌석배치 액션 ────── */

    initClassSeating: async (classId, mode) => {
      const cls = get().classes.find((c) => c.id === classId);
      if (!cls) return;

      const activeStudents = cls.students.filter((s) => !s.isVacant);
      const keys = activeStudents.map((s) => studentKey(s));

      if (mode === 'random') {
        for (let i = keys.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [keys[i], keys[j]] = [keys[j]!, keys[i]!];
        }
      }

      const cols = Math.max(1, Math.ceil(Math.sqrt(keys.length)));
      const rows = Math.max(1, Math.ceil(keys.length / cols));
      const seats: (string | null)[][] = [];
      let idx = 0;
      for (let r = 0; r < rows; r++) {
        const row: (string | null)[] = [];
        for (let c = 0; c < cols; c++) {
          row.push(idx < keys.length ? keys[idx]! : null);
          idx++;
        }
        seats.push(row);
      }

      const seating: TeachingClassSeating = { rows, cols, seats };
      const updated: TeachingClass = { ...cls, seating, updatedAt: new Date().toISOString() };
      set((state) => ({ classes: state.classes.map((c) => (c.id === classId ? updated : c)) }));
      await manageClasses.update(updated);
    },

    randomizeClassSeating: async (classId) => {
      const cls = get().classes.find((c) => c.id === classId);
      if (!cls?.seating) return;

      const flat: (string | null)[] = cls.seating.seats.flatMap((row) => [...row]);
      const studentIds = flat.filter((id): id is string => id !== null);

      for (let i = studentIds.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [studentIds[i], studentIds[j]] = [studentIds[j]!, studentIds[i]!];
      }

      const emptyCount = flat.length - studentIds.length;
      const arranged: (string | null)[] = [
        ...studentIds,
        ...Array.from<null>({ length: emptyCount }).fill(null),
      ];

      const colCount = cls.seating.cols;
      const newSeats: (string | null)[][] = [];
      for (let i = 0; i < arranged.length; i += colCount) {
        newSeats.push(arranged.slice(i, i + colCount));
      }

      const seating: TeachingClassSeating = { ...cls.seating, seats: newSeats };
      const updated: TeachingClass = { ...cls, seating, updatedAt: new Date().toISOString() };
      set((state) => ({ classes: state.classes.map((c) => (c.id === classId ? updated : c)) }));
      await manageClasses.update(updated);
    },

    swapClassSeats: async (classId, r1, c1, r2, c2) => {
      const cls = get().classes.find((c) => c.id === classId);
      if (!cls?.seating) return;

      const newSeats = cls.seating.seats.map((row) => [...row]);
      const temp = newSeats[r1]![c1]!;
      newSeats[r1]![c1] = newSeats[r2]![c2]!;
      newSeats[r2]![c2] = temp;

      const seating: TeachingClassSeating = { ...cls.seating, seats: newSeats };
      const updated: TeachingClass = { ...cls, seating, updatedAt: new Date().toISOString() };
      set((state) => ({ classes: state.classes.map((c) => (c.id === classId ? updated : c)) }));
      await manageClasses.update(updated);
    },

    clearClassSeating: async (classId) => {
      const cls = get().classes.find((c) => c.id === classId);
      if (!cls) return;

      const updated: TeachingClass = { ...cls, seating: undefined, updatedAt: new Date().toISOString() };
      set((state) => ({ classes: state.classes.map((c) => (c.id === classId ? updated : c)) }));
      await manageClasses.update(updated);
    },

    resizeClassGrid: async (classId, newRows, newCols) => {
      const cls = get().classes.find((c) => c.id === classId);
      if (!cls?.seating) return;
      if (newRows < 1 || newCols < 1) return;

      const oldSeats = cls.seating.seats;
      const newSeats: (string | null)[][] = [];
      for (let r = 0; r < newRows; r++) {
        const row: (string | null)[] = [];
        for (let c = 0; c < newCols; c++) {
          row.push(oldSeats[r]?.[c] ?? null);
        }
        newSeats.push(row);
      }

      // 잘린 학생들을 빈 자리에 재배치
      const keptKeys = new Set(newSeats.flat().filter((v): v is string => v !== null));
      const allKeys = new Set(oldSeats.flat().filter((v): v is string => v !== null));
      const lostKeys = [...allKeys].filter((k) => !keptKeys.has(k));

      if (lostKeys.length > 0) {
        let lostIdx = 0;
        for (let r = 0; r < newRows && lostIdx < lostKeys.length; r++) {
          for (let c = 0; c < newCols && lostIdx < lostKeys.length; c++) {
            if (newSeats[r]![c] === null) {
              newSeats[r]![c] = lostKeys[lostIdx]!;
              lostIdx++;
            }
          }
        }
      }

      const seating: TeachingClassSeating = { ...cls.seating, rows: newRows, cols: newCols, seats: newSeats };
      const updated: TeachingClass = { ...cls, seating, updatedAt: new Date().toISOString() };
      set((state) => ({ classes: state.classes.map((c) => (c.id === classId ? updated : c)) }));
      await manageClasses.update(updated);
    },

    toggleClassPairMode: async (classId) => {
      const cls = get().classes.find((c) => c.id === classId);
      if (!cls?.seating) return;

      const seating: TeachingClassSeating = { ...cls.seating, pairMode: !cls.seating.pairMode };
      const updated: TeachingClass = { ...cls, seating, updatedAt: new Date().toISOString() };
      set((state) => ({ classes: state.classes.map((c) => (c.id === classId ? updated : c)) }));
      await manageClasses.update(updated);
    },

    toggleClassOddColumnMode: async (classId) => {
      const cls = get().classes.find((c) => c.id === classId);
      if (!cls?.seating) return;

      const current = cls.seating.oddColumnMode ?? 'single';
      const next: OddColumnMode = current === 'single' ? 'triple' : 'single';
      const seating: TeachingClassSeating = { ...cls.seating, oddColumnMode: next };
      const updated: TeachingClass = { ...cls, seating, updatedAt: new Date().toISOString() };
      set((state) => ({ classes: state.classes.map((c) => (c.id === classId ? updated : c)) }));
      await manageClasses.update(updated);
    },

    saveAttendanceRecord: async (record) => {
      if (get().loadFailed) {
        console.warn('[TeachingClassStore] 데이터 로드 실패 상태에서 저장 차단');
        return;
      }
      const existing = get().attendanceRecords.find(
        (r) => r.classId === record.classId && r.date === record.date && r.period === record.period,
      );
      if (existing !== undefined) {
        // 기존 기록 업데이트
        const updated = get().attendanceRecords.map((r) =>
          r.classId === record.classId && r.date === record.date && r.period === record.period
            ? record
            : r,
        );
        await manageAttendance.saveAll(updated);
        set({ attendanceRecords: updated });
      } else {
        // 새 기록 추가
        await manageAttendance.add(record);
        set((state) => ({ attendanceRecords: [...state.attendanceRecords, record] }));
      }
    },
  };
});

export type { AttendanceStatus };
