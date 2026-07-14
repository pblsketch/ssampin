import { create } from 'zustand';
import type { AttendanceRecord } from '@domain/entities/Attendance';
import { ManageAttendance } from '@usecases/classManagement/ManageAttendance';
import { teachingClassRepository } from '@mobile/di/container';
import { useMobileDriveSyncStore } from '@mobile/stores/useMobileDriveSyncStore';
import { todayISO } from '@mobile/utils/date';

const manageAttendance = new ManageAttendance(teachingClassRepository);

interface MobileAttendanceState {
  records: readonly AttendanceRecord[];
  loaded: boolean;
  load: () => Promise<void>;
  reload: () => Promise<void>;
  getTodayRecord: (classId: string, period?: number) => AttendanceRecord | null;
  saveRecord: (record: AttendanceRecord) => Promise<void>;
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
    const today = todayISO();
    return (
      get().records.find(
        (r) =>
          r.date === today &&
          r.classId === classId &&
          (period === undefined || r.period === period),
      ) ?? null
    );
  },

  saveRecord: async (record) => {
    // 그룹 키 인지 upsert 경유 — 구 saveRecord는 (classId,date,period)만 매치해
    // 같은 classId의 그룹 레코드를 그룹 키 없는 레코드로 통째 교체(그룹 출결 소실
    // +툼스톤 전파)했다. 화면 상태는 저장 결과(반환값)로 갱신한다(P6).
    const saved = await manageAttendance.upsertRecord(record);
    set({ records: [...saved] });
    useMobileDriveSyncStore.getState().triggerSaveSync();
  },
}));
