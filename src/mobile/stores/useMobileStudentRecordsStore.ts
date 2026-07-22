import { create } from 'zustand';
import type { StudentRecord } from '@domain/entities/StudentRecord';
import type { RecordCategoryItem } from '@domain/valueObjects/RecordCategory';
import { DEFAULT_RECORD_CATEGORIES } from '@domain/valueObjects/RecordCategory';
import type { AttendanceStatus, AttendanceReason } from '@domain/entities/Attendance';
import { ManageStudentRecords } from '@usecases/studentRecords/ManageStudentRecords';
import { migrateStudentRecordsOnLoad } from '@usecases/studentRecords/MigrateStudentRecordsSubcatToTags';
import { studentRecordsRepository } from '@mobile/di/container';
import { useMobileDriveSyncStore } from '@mobile/stores/useMobileDriveSyncStore';
import { useMobileAttendanceStore } from '@mobile/stores/useMobileAttendanceStore';
import { useMobileStudentStore } from '@mobile/stores/useMobileStudentStore';

const manageRecords = new ManageStudentRecords(studentRecordsRepository);

const ATTENDANCE_STATUS_LABEL: Record<Exclude<AttendanceStatus, 'present'>, string> = {
  absent: '결석',
  late: '지각',
  earlyLeave: '조퇴',
  classAbsence: '결과',
};

interface BridgeAttendanceParams {
  studentId: string;
  date: string;
  status: AttendanceStatus;
  reason?: AttendanceReason;
  memo?: string;
}

interface MobileStudentRecordsState {
  records: readonly StudentRecord[];
  categories: readonly RecordCategoryItem[];
  loaded: boolean;
  load: () => Promise<void>;
  reload: () => Promise<void>;
  getRecordsByStudentId: (studentId: string, limit?: number) => readonly StudentRecord[];
  addRecord: (record: StudentRecord) => Promise<void>;
  deleteRecord: (id: string) => Promise<void>;
  bridgeAttendanceRecord: (params: BridgeAttendanceParams) => Promise<void>;
  migrateExistingAttendance: () => Promise<number>;
}

export const useMobileStudentRecordsStore = create<MobileStudentRecordsState>((set, get) => ({
  records: [],
  categories: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    try {
      // Q2: 모바일 단독 사용자도 로드 시 멱등 정규화(비출결 subcategory→tags). 데스크톱과 동일 경로.
      const outcome = await migrateStudentRecordsOnLoad(studentRecordsRepository);
      set({
        records: outcome.records,
        categories: outcome.categories ?? [...DEFAULT_RECORD_CATEGORIES],
        loaded: true,
      });
    } catch {
      set({ loaded: true });
    }
  },

  reload: async () => {
    set({ loaded: false });
    await get().load();
  },

  getRecordsByStudentId: (studentId, limit = 3) => {
    return get()
      .records.filter((r) => r.studentId === studentId)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, limit);
  },

  addRecord: async (record) => {
    await manageRecords.add(record);
    set((s) => ({ records: [...s.records, record] }));
    useMobileDriveSyncStore.getState().triggerSaveSync();
  },

  deleteRecord: async (id) => {
    await manageRecords.delete(id);
    set((s) => ({ records: s.records.filter((r) => r.id !== id) }));
    useMobileDriveSyncStore.getState().triggerSaveSync();
  },

  bridgeAttendanceRecord: async ({ studentId, date, status, reason, memo }) => {
    // 사본 목록 로드 보장 — 미로드 상태면 records가 []라 existing을 못 찾아
    //  ① present 되돌리기가 삭제를 조용히 건너뛰고(PC에 사본이 그대로 남는다)
    //  ② 비-present는 같은 id를 중복 추가한다(ManageStudentRecords.add는 무조건 append).
    // 앱을 켜고 동기화 완료 전에 바로 출결로 들어가면 재현된다. 호출처가 4곳으로 흩어져 있어
    // 호출처 누락에 강하도록 스토어 안에서 보장한다(StudentsPage의 출결 스토어 방어와 같은 패턴).
    if (!get().loaded) await get().load();
    const bridgeId = `att-${studentId}-${date}`;
    const existing = get().records.find((r) => r.id === bridgeId);

    if (status === 'present') {
      if (existing) {
        await manageRecords.delete(bridgeId);
        set((s) => ({ records: s.records.filter((r) => r.id !== bridgeId) }));
        useMobileDriveSyncStore.getState().triggerSaveSync();
      }
      return;
    }

    const typeLabel = ATTENDANCE_STATUS_LABEL[status];
    const subcategory = reason ? `${typeLabel} (${reason})` : typeLabel;
    // existing 기반 부분 갱신 — 승계 목록을 손으로 고르면 followUp/tags 같은 필드가
    // after에서 빠져 before→after diff가 "삭제 의도"로 오인한다(데스크톱 브릿지와 동일 계약).
    // 교시 상세(attendancePeriods)는 모바일이 하루 단위 상태로 재기록하므로 의도적으로
    // 제외한다(낡은 교시 상세가 새 하루 상태와 불일치하게 남지 않게).
    const { attendancePeriods: _stale, ...existingBase } = existing ?? ({} as StudentRecord);
    const record: StudentRecord = {
      ...existingBase,
      id: bridgeId,
      studentId,
      category: 'attendance',
      subcategory,
      content: memo ?? '',
      date,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };

    if (existing) {
      const saved = await manageRecords.update({ before: existing, after: record });
      set({ records: [...saved] });
    } else {
      await manageRecords.add(record);
      set((s) => ({ records: [...s.records, record] }));
    }
    useMobileDriveSyncStore.getState().triggerSaveSync();
  },

  migrateExistingAttendance: async () => {
    const MIGRATION_FLAG = 'ssampin-att-bridge-migrated';
    if (localStorage.getItem(MIGRATION_FLAG)) return 0;

    try {
      const attendanceRecords = useMobileAttendanceStore.getState().records;
      const students = useMobileStudentStore.getState().students;
      let count = 0;

      const homeroomRecords = attendanceRecords.filter((r) => r.period === 0);

      for (const record of homeroomRecords) {
        for (const sa of record.students) {
          const student = students.find((s) => s.studentNumber === sa.number);
          if (!student) continue;

          await get().bridgeAttendanceRecord({
            studentId: student.id,
            date: record.date,
            status: sa.status,
            reason: sa.reason,
            memo: sa.memo,
          });

          if (sa.status !== 'present') {
            count++;
          }
        }
      }

      localStorage.setItem(MIGRATION_FLAG, '1');
      return count;
    } catch {
      return 0;
    }
  },
}));
