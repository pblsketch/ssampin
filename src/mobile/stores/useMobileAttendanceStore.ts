import { create } from 'zustand';
import type { AttendanceRecord } from '@domain/entities/Attendance';
import { ManageAttendance } from '@usecases/classManagement/ManageAttendance';
import { teachingClassRepository } from '@mobile/di/container';
import { useMobileDriveSyncStore } from '@mobile/stores/useMobileDriveSyncStore';

const manageAttendance = new ManageAttendance(teachingClassRepository);

interface MobileAttendanceState {
  records: readonly AttendanceRecord[];
  loaded: boolean;
  load: () => Promise<void>;
  reload: () => Promise<void>;
  getTodayRecord: (classId: string, period?: number) => AttendanceRecord | null;
  saveRecord: (record: AttendanceRecord) => Promise<void>;
}

function todayString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const useMobileAttendanceStore = create<MobileAttendanceState>((set, get) => ({
  records: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    try {
      const records = await manageAttendance.getAll();
      set({ records, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  reload: async () => {
    set({ loaded: false });
    await get().load();
  },

  getTodayRecord: (classId, period) => {
    const today = todayString();
    return get().records.find(
      (r) => r.date === today && r.classId === classId && (period === undefined || r.period === period),
    ) ?? null;
  },

  saveRecord: async (record) => {
    await manageAttendance.saveRecord(record);
    // 로컬 상태도 업데이트
    const records = [...get().records];
    const idx = records.findIndex(
      (r) => r.classId === record.classId && r.date === record.date && r.period === record.period,
    );
    if (idx >= 0) {
      records[idx] = record;
    } else {
      records.push(record);
    }
    set({ records });
    useMobileDriveSyncStore.getState().triggerSaveSync();
  },
}));
