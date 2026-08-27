import { create } from 'zustand';
import type { StudentRecord, AttendancePeriodEntry } from '@domain/entities/StudentRecord';
import type { RecordCategoryItem } from '@domain/valueObjects/RecordCategory';
import { DEFAULT_RECORD_CATEGORIES } from '@domain/valueObjects/RecordCategory';
import type {
  AttendanceStatus,
  AttendanceReason,
  StudentAttendance,
} from '@domain/entities/Attendance';
import { pickRepresentativeAttendance } from '@domain/rules/attendanceRules';
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
  /**
   * 담임 학급 id(=학급명). 주면 그날 **전 교시 원장**을 모아 대표·교시 상세를 만든다.
   * 없으면 넘겨받은 단일 상태만 쓰는 종전 동작(하위호환).
   */
  classId?: string;
}

interface DayAttendanceSummary {
  readonly rep: StudentAttendance | undefined;
  readonly periods: readonly AttendancePeriodEntry[];
}

/**
 * 그날 그 학급 **전 교시** 원장에서 이 학생의 이상 출결을 모은다.
 *
 * 왜 필요한가 — 모바일 담임 출결은 한 교시(중·고는 0교시=조회)만 화면에 띄운다.
 * 화면 값만으로 사본을 다시 쓰면 다른 교시 기록이 사본에서 사라지고,
 * 그 학생이 그 교시에 출석이면 사본이 통째로 삭제되기까지 한다.
 * 원장(AttendanceRecord)은 교시별로 온전하므로(`upsertRecord`의 교체 키에 period 포함)
 * 여기서 다시 모아 데스크톱과 같은 결과를 만든다.
 * 규칙은 데스크톱 `bridgeHomeroomDayAttendance`와 동일 — 대표는 `pickRepresentativeAttendance`,
 * 교시 상세는 present 제외 후 period 오름차순.
 *
 * 그날 레코드를 한 건도 못 찾으면 **null** 을 돌려준다. 원장을 아직 못 읽은 상태를
 * "전부 출석"으로 오판하면 다른 교시 기록까지 지우게 되므로, 그때는 집계를 쓰지 않는다.
 */
function collectDayFromLedger(args: {
  classId: string;
  date: string;
  studentNumber: number;
}): DayAttendanceSummary | null {
  const { classId, date, studentNumber } = args;
  const periodMap = new Map<number, StudentAttendance | undefined>();
  for (const r of useMobileAttendanceStore.getState().records) {
    // 그룹 출결(수업반)은 담임 하루 집계 대상이 아니다 — 데스크톱 isDayRecord 와 같은 술어.
    // 담임 레코드가 groupId 를 달고 여기서 누락될 일은 없다: upsertRecord 의 groupId 폴백 주입은
    // `TeachingClass.id === record.classId` 일 때만 걸리는데, 수업반 id 는 generateUUID() 이고
    // 담임 classId 는 학급명(settings.className)이라 둘이 같아질 수 없다.
    if (r.date !== date || r.classId !== classId || r.groupId) continue;
    periodMap.set(
      r.period,
      r.students.find((sa) => sa.number === studentNumber),
    );
  }

  if (periodMap.size === 0) return null;

  const periods: AttendancePeriodEntry[] = [];
  for (const period of [...periodMap.keys()].sort((a, b) => a - b)) {
    const entry = periodMap.get(period);
    if (!entry || entry.status === 'present') continue;
    periods.push({
      period,
      status: entry.status,
      ...(entry.reason ? { reason: entry.reason } : {}),
      ...(entry.memo ? { memo: entry.memo } : {}),
    });
  }

  return { rep: pickRepresentativeAttendance(periodMap), periods };
}

interface MobileStudentRecordsState {
  records: readonly StudentRecord[];
  categories: readonly RecordCategoryItem[];
  loaded: boolean;
  /**
   * @param force true면 이미 읽었어도 다시 읽는다. **`loaded`를 false로 되돌리지 않는다.**
   */
  load: (force?: boolean) => Promise<void>;
  /**
   * 백그라운드 동기화(앱 복귀·네트워크 복구)가 부르는 조용한 갱신.
   *
   * ⚠️ 여기서 `loaded:false`를 떨어뜨리면 안 된다 — 화면들이 `!loaded`일 때 스피너로
   * 갈아끼우므로, 동기화가 도는 순간 **열려 있던 입력창·시트가 통째로 언마운트**되고
   * 타이핑이 사라진다. 스크롤 위치와 서브탭 선택도 함께 날아간다.
   * 잠금 장치: `scripts/regression-grep-check.mjs` REGRESSION #63
   */
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

  load: async (force = false) => {
    if (!force && get().loaded) return;
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
    await get().load(true);
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

  bridgeAttendanceRecord: async ({ studentId, date, status, reason, memo, classId }) => {
    // 사본 목록 로드 보장 — 미로드 상태면 records가 []라 existing을 못 찾아
    //  ① present 되돌리기가 삭제를 조용히 건너뛰고(PC에 사본이 그대로 남는다)
    //  ② 비-present는 같은 id를 중복 추가한다(ManageStudentRecords.add는 무조건 append).
    // 앱을 켜고 동기화 완료 전에 바로 출결로 들어가면 재현된다. 호출처가 4곳으로 흩어져 있어
    // 호출처 누락에 강하도록 스토어 안에서 보장한다(StudentsPage의 출결 스토어 방어와 같은 패턴).
    if (!get().loaded) await get().load();
    const bridgeId = `att-${studentId}-${date}`;
    const existing = get().records.find((r) => r.id === bridgeId);

    // 하루 전체 집계 — 화면에 뜬 한 교시가 아니라 그날 원장 전체를 근거로 삼는다.
    // 학생 번호를 못 찾거나(명렬표 미로드) 원장을 못 읽었으면 집계는 null 이고 종전 동작으로 떨어진다.
    const studentNumber = useMobileStudentStore
      .getState()
      .students.find((s) => s.id === studentId)?.studentNumber;
    const day =
      classId != null && studentNumber != null
        ? collectDayFromLedger({ classId, date, studentNumber })
        : null;

    // 삭제 판정도 하루 기준 — 0교시가 출석이어도 3교시에 기록이 남아 있으면 지우지 않는다.
    const dayHasException = day != null ? day.rep != null : status !== 'present';

    if (!dayHasException) {
      if (existing) {
        await manageRecords.delete(bridgeId);
        set((s) => ({ records: s.records.filter((r) => r.id !== bridgeId) }));
        useMobileDriveSyncStore.getState().triggerSaveSync();
      }
      return;
    }

    // 대표는 하루 집계가 있으면 그것을, 없으면 넘겨받은 단일 상태를 쓴다.
    // dayHasException 을 통과했으므로 rep 이 있으면 present 가 아니다(라벨 표에 present 키가 없다).
    const rep = day?.rep;
    const repStatus = (rep?.status ?? status) as Exclude<AttendanceStatus, 'present'>;
    const repReason = rep ? rep.reason : reason;
    const repMemo = rep ? rep.memo : memo;

    const typeLabel = ATTENDANCE_STATUS_LABEL[repStatus];
    const subcategory = repReason ? `${typeLabel} (${repReason})` : typeLabel;
    // existing 기반 부분 갱신 — 승계 목록을 손으로 고르면 followUp/tags 같은 필드가
    // after에서 빠져 before→after diff가 "삭제 의도"로 오인한다(데스크톱 브릿지와 동일 계약).
    // 교시 상세는 낡은 값이 남지 않게 일단 걷어내고, 하루 집계가 있을 때만 새로 채운다
    // (집계 불가 시에는 종전처럼 비운다 — 잘못된 상세를 남기는 것보다 없는 편이 안전).
    const { attendancePeriods: _stale, ...existingBase } = existing ?? ({} as StudentRecord);
    const record: StudentRecord = {
      ...existingBase,
      id: bridgeId,
      studentId,
      category: 'attendance',
      subcategory,
      content: repMemo ?? '',
      date,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      ...(day != null && day.periods.length > 0 ? { attendancePeriods: day.periods } : {}),
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
