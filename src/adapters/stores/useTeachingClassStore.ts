import { create } from 'zustand';
import type { TeachingClass, TeachingClassStudent } from '@domain/entities/TeachingClass';
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
  load: () => Promise<void>;
  selectClass: (id: string | null) => void;
  addClass: (name: string, subject: string, students: readonly TeachingClassStudent[]) => Promise<void>;
  updateClass: (cls: TeachingClass) => Promise<void>;
  deleteClass: (id: string) => Promise<void>;
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

    load: async () => {
      if (get().loaded) return;
      try {
        const [classes, progressEntries, attendanceRecords] = await Promise.all([
          manageClasses.getAll(),
          manageProgress.getAll(),
          manageAttendance.getAll(),
        ]);
        set({ classes, progressEntries, attendanceRecords, loaded: true });
      } catch {
        set({ loaded: true });
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

    saveAttendanceRecord: async (record) => {
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
