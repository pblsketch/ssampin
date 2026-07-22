import { create } from 'zustand';
import type {
  TeachingClass,
  TeachingClassStudent,
  TeachingClassSeating,
} from '@domain/entities/TeachingClass';
import { studentKey } from '@domain/entities/TeachingClass';
import type { StudentStatus } from '@domain/entities/Student';
import { isStudentActive, normalizeStudentStatus } from '@domain/rules/studentActivity';
import type { OddColumnMode } from '@domain/rules/seatingLayoutRules';
import type { ProgressEntry, ProgressStatus } from '@domain/entities/CurriculumProgress';
import type {
  AttendanceRecord,
  AttendanceStatus,
  StudentAttendance,
} from '@domain/entities/Attendance';
import { teachingClassRepository } from '@adapters/di/container';
import { ManageTeachingClasses } from '@usecases/classManagement/ManageTeachingClasses';
import { ManageCurriculumProgress } from '@usecases/classManagement/ManageCurriculumProgress';
import { ManageAttendance } from '@usecases/classManagement/ManageAttendance';
import { generateUUID } from '@infrastructure/utils/uuid';

/**
 * 로드 시 status ↔ isVacant 양방향 마이그레이션.
 * 이전 단방향(isVacant=true → status='withdrawn') 외에 status 있고 isVacant 누락된 케이스도 동기화.
 */
function migrateStudentStatus(student: TeachingClassStudent): TeachingClassStudent {
  return normalizeStudentStatus(student);
}

/** targetId가 가리키는 클래스를 포함하여 같은 groupId를 가진 모든 클래스 id 목록. groupId 없으면 단일. */
function getGroupClassIds(classes: readonly TeachingClass[], classId: string): string[] {
  const target = classes.find((c) => c.id === classId);
  if (!target) return [];
  if (!target.groupId) return [classId];
  return classes.filter((c) => c.groupId === target.groupId).map((c) => c.id);
}

interface TeachingClassState {
  classes: readonly TeachingClass[];
  progressEntries: readonly ProgressEntry[];
  attendanceRecords: readonly AttendanceRecord[];
  selectedClassId: string | null;
  loaded: boolean;
  loadFailed: boolean;
  load: (force?: boolean) => Promise<void>;
  selectClass: (id: string | null) => void;
  addClass: (
    name: string,
    subject: string,
    students: readonly TeachingClassStudent[],
    groupId?: string,
  ) => Promise<void>;
  /** 여러 과목을 하나의 groupId로 묶어 일괄 생성 (초등 위자드 완료 시 호출) */
  addClassGroup: (
    name: string,
    subjects: readonly string[],
    students: readonly TeachingClassStudent[],
  ) => Promise<{ groupId: string; firstClassId: string }>;
  /** 그룹 내 모든 클래스의 students를 동일하게 덮어씀 */
  syncGroupStudents: (groupId: string, students: readonly TeachingClassStudent[]) => Promise<void>;
  /** 그룹 내 모든 클래스의 seating을 동일하게 덮어씀 */
  syncGroupSeating: (groupId: string, seating: TeachingClassSeating | undefined) => Promise<void>;
  /** 기존 그룹에 과목만 추가 (학생 명렬은 그룹의 기존 클래스에서 복사) */
  addSubjectsToGroup: (groupId: string, subjects: readonly string[]) => Promise<void>;
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
    status?: ProgressStatus,
  ) => Promise<void>;
  updateProgressEntry: (entry: ProgressEntry) => Promise<void>;
  deleteProgressEntry: (id: string) => Promise<void>;
  getAttendanceRecord: (
    classId: string,
    date: string,
    period: number,
  ) => AttendanceRecord | undefined;
  saveAttendanceRecord: (record: AttendanceRecord) => Promise<void>;
  getDayAttendance: (classId: string, date: string) => readonly AttendanceRecord[];
  saveDayAttendance: (
    classId: string,
    date: string,
    recordsByPeriod: ReadonlyMap<number, readonly StudentAttendance[]>,
  ) => Promise<void>;
  /**
   * 대상 학생들의 하루 출결만 부분 갱신 — 다른 학생은 락 안 fresh 상태 그대로 보존(QA F3).
   *
   * 반환 = 저장된 전체 출결 레코드. 로드 실패 등으로 **저장이 차단되면 `null`**.
   * 호출자가 "정말 반영됐는지" 확인해야 하는 경로(예: 삭제 fail-closed)는 반드시
   * null을 실패로 취급할 것 — 예외 없이 조용히 no-op 하던 경로였다.
   */
  upsertStudentAttendanceEntries: (params: {
    classId: string;
    date: string;
    studentNumbers: ReadonlySet<number>;
    recordsByPeriod: ReadonlyMap<number, readonly StudentAttendance[]>;
  }) => Promise<readonly AttendanceRecord[] | null>;
  // 좌석배치 액션
  initClassSeating: (classId: string, mode: 'sequential' | 'random') => Promise<void>;
  randomizeClassSeating: (classId: string) => Promise<void>;
  swapClassSeats: (
    classId: string,
    r1: number,
    c1: number,
    r2: number,
    c2: number,
  ) => Promise<void>;
  clearClassSeating: (classId: string) => Promise<void>;
  resizeClassGrid: (classId: string, rows: number, cols: number) => Promise<void>;
  toggleClassPairMode: (classId: string) => Promise<void>;
  toggleClassOddColumnMode: (classId: string) => Promise<void>;
  updateStudentStatus: (
    classId: string,
    sKey: string,
    status: StudentStatus,
    statusNote?: string,
  ) => Promise<void>;

  /**
   * roster-sample-data-removal Phase 2 — 외부 참조 검사 (가드 D).
   *
   * 담임/수업반 classes의 students에 SAMPLE 명단과 동일한 이름이 박혀 있는지
   * **보수적**으로 카운트한다. studentNumber 1~35만 매칭하면 일반 사용자 반과
   * 충돌할 가능성이 크기 때문에, "이름"이 SAMPLE_ROSTER_SIGNATURE의 이름과
   * 정확히 일치할 때만 카운트한다. 한 학생이 여러 반에 동일 이름으로 박혀 있으면
   * 그만큼 카운트(unique by class+number).
   *
   * attendanceRecords는 학생 이름 정보를 보유하지 않으므로 본 검사에서 제외한다.
   * → false-positive 없는 보수적 양성 거부 정책.
   */
  hasStudentReferencesByName: (names: readonly string[]) => number;
}

export const useTeachingClassStore = create<TeachingClassState>((set, get) => {
  const manageClasses = new ManageTeachingClasses(teachingClassRepository);
  const manageProgress = new ManageCurriculumProgress(teachingClassRepository);
  const manageAttendance = new ManageAttendance(teachingClassRepository);

  // 저장 계열 공통 가드 — 로드 보장 + 로드 실패 시 쓰기 차단(빈 스냅샷 기반 유실 방지).
  const ensureWritable = async (): Promise<boolean> => {
    if (!get().loaded) await get().load();
    if (get().loadFailed) {
      console.warn('[TeachingClassStore] 데이터 로드 실패 상태에서 저장 차단');
      return false;
    }
    return true;
  };

  /** 좌석을 그룹 내 모든 클래스에 전파하여 저장. 대상 클래스가 단일이면 단일 업데이트. */
  const applySeatingToGroup = async (
    classId: string,
    seatingOrUndef: TeachingClassSeating | undefined,
  ): Promise<void> => {
    const classes = get().classes;
    const target = classes.find((c) => c.id === classId);
    if (!target) return;
    const ids = getGroupClassIds(classes, classId);
    const now = new Date().toISOString();
    const updatedList: TeachingClass[] = [];
    const nextClasses = classes.map((c) => {
      if (!ids.includes(c.id)) return c;
      const updated: TeachingClass = { ...c, seating: seatingOrUndef, updatedAt: now };
      updatedList.push(updated);
      return updated;
    });
    set({ classes: nextClasses });
    for (const u of updatedList) {
      await manageClasses.update(u);
    }
  };

  return {
    classes: [],
    progressEntries: [],
    attendanceRecords: [],
    selectedClassId: null,
    loaded: false,
    loadFailed: false,

    load: async (force = false) => {
      // force=true: 동기화 리로드용 — loaded를 유지한 채 데이터만 조용히 갱신
      if (get().loaded && !force) return;
      try {
        const [classes, progressEntries, attendanceRecords] = await Promise.all([
          manageClasses.getAll(),
          manageProgress.getAll(),
          manageAttendance.getAll(),
        ]);

        // status ↔ isVacant 양방향 마이그레이션. 변경된 클래스만 저장소에 반영.
        const migratedDirtyClasses: TeachingClass[] = [];
        const migrated = classes.map((cls) => {
          let dirty = false;
          const migratedStudents = cls.students.map((s) => {
            const norm = migrateStudentStatus(s);
            if (norm !== s) dirty = true;
            return norm;
          });
          if (!dirty) return cls;
          const next: TeachingClass = { ...cls, students: migratedStudents };
          migratedDirtyClasses.push(next);
          return next;
        });

        // 마이그레이션 결과를 저장소에 영속화 (이전에는 누락되어 매 로드마다 동일 작업 반복)
        for (const cls of migratedDirtyClasses) {
          await manageClasses.update(cls);
        }

        // order 기준 정렬 (order 없으면 생성순)
        const sorted = [...migrated].sort((a, b) => {
          const orderA = a.order ?? Infinity;
          const orderB = b.order ?? Infinity;
          if (orderA !== orderB) return orderA - orderB;
          return a.createdAt.localeCompare(b.createdAt);
        });
        set({
          classes: sorted,
          progressEntries,
          attendanceRecords,
          loaded: true,
          loadFailed: false,
        });
      } catch (err) {
        console.error('[TeachingClassStore] load failed:', err);
        set({ loaded: true, loadFailed: true });
      }
    },

    selectClass: (id) => {
      set({ selectedClassId: id });
    },

    addClass: async (name, subject, students, groupId) => {
      const now = new Date().toISOString();
      const newClass: TeachingClass = {
        id: generateUUID(),
        name,
        subject,
        ...(groupId ? { groupId } : {}),
        students,
        createdAt: now,
        updatedAt: now,
      };
      await manageClasses.add(newClass);
      set((state) => ({ classes: [...state.classes, newClass] }));
    },

    addClassGroup: async (name, subjects, students) => {
      const groupId = generateUUID();
      const now = new Date().toISOString();
      const created: TeachingClass[] = subjects.map((subject) => ({
        id: generateUUID(),
        name,
        subject,
        groupId,
        students,
        createdAt: now,
        updatedAt: now,
      }));
      // 반복 저장 (각각 add 호출)
      for (const cls of created) {
        await manageClasses.add(cls);
      }
      set((state) => ({ classes: [...state.classes, ...created] }));
      const firstClassId = created[0]?.id ?? '';
      return { groupId, firstClassId };
    },

    syncGroupStudents: async (groupId, students) => {
      const classes = get().classes;
      const now = new Date().toISOString();
      const updatedList: TeachingClass[] = [];
      const nextClasses = classes.map((c) => {
        if (c.groupId !== groupId) return c;
        // Phase 6 — independent 모드 클래스는 그룹 동기화 제외 (자체 명단 유지)
        if (c.studentSyncMode === 'independent') return c;
        // 비활성 학생 좌석 제거 (각 클래스 seating 고려)
        const activeKeys = new Set(
          students.filter((s) => !s.status || s.status === 'active').map((s) => studentKey(s)),
        );
        let seating = c.seating;
        if (seating) {
          const newSeats = seating.seats.map((row) =>
            row.map((cell) => (cell && !activeKeys.has(cell) ? null : cell)),
          );
          seating = { ...seating, seats: newSeats };
        }
        const updated: TeachingClass = { ...c, students, seating, updatedAt: now };
        updatedList.push(updated);
        return updated;
      });
      set({ classes: nextClasses });
      for (const u of updatedList) {
        await manageClasses.update(u);
      }
    },

    syncGroupSeating: async (groupId, seating) => {
      const classes = get().classes;
      const now = new Date().toISOString();
      const updatedList: TeachingClass[] = [];
      const nextClasses = classes.map((c) => {
        if (c.groupId !== groupId) return c;
        const updated: TeachingClass = { ...c, seating, updatedAt: now };
        updatedList.push(updated);
        return updated;
      });
      set({ classes: nextClasses });
      for (const u of updatedList) {
        await manageClasses.update(u);
      }
    },

    addSubjectsToGroup: async (groupId, subjects) => {
      const classes = get().classes;
      const firstInGroup = classes.find((c) => c.groupId === groupId);
      if (!firstInGroup) return;

      // 학생 명렬은 그룹의 첫 클래스에서 복사, seating은 복사하되 좌석 비우기
      const copiedStudents = [...firstInGroup.students];
      const now = new Date().toISOString();
      const emptySeating: TeachingClassSeating | undefined = firstInGroup.seating
        ? {
            ...firstInGroup.seating,
            seats: firstInGroup.seating.seats.map((row) => row.map(() => null)),
          }
        : undefined;

      const created: TeachingClass[] = subjects.map((subject) => ({
        id: generateUUID(),
        name: firstInGroup.name,
        subject,
        groupId,
        students: copiedStudents,
        ...(emptySeating ? { seating: emptySeating } : {}),
        createdAt: now,
        updatedAt: now,
      }));
      for (const cls of created) {
        await manageClasses.add(cls);
      }
      set((state) => ({ classes: [...state.classes, ...created] }));
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
      const target = get().classes.find((c) => c.id === id);
      const groupId = target?.groupId;

      await manageClasses.delete(id);
      // 해당 학급의 진도 기록과 출석 기록도 함께 삭제.
      // 진도(curriculum-progress)는 의도적으로 스냅샷 저장 유지 — 본 트랙(sync-hardening-2)의
      // 락·intent 전환 범위는 record-merge 도메인(attendance 등)이다(R5 잔여, 후속 PDCA).
      const progressToKeep = get().progressEntries.filter((e) => e.classId !== id);

      await manageProgress.saveAll(progressToKeep, true);
      // 출결은 변경 의도만 넘긴다 — 삭제 대상 계산과 "그룹 마지막 학급" 판정 모두
      // usecase가 락 안 fresh 데이터로 수행한다(in-memory 스냅샷 판정은 동기화로
      // 방금 추가된 그룹 학급을 못 보고 그룹 출결을 오삭제할 수 있다).
      const savedAttendance = await manageAttendance.deleteByClass(id, groupId);
      set((state) => ({
        classes: state.classes.filter((c) => c.id !== id),
        progressEntries: progressToKeep,
        attendanceRecords: [...savedAttendance],
        selectedClassId: state.selectedClassId === id ? null : state.selectedClassId,
      }));
    },

    reorderClasses: async (orderedIds) => {
      const classes = get().classes;
      const reordered: TeachingClass[] = orderedIds
        .map((id, index) => {
          const cls = classes.find((c) => c.id === id);
          if (!cls) return null;
          const updated: TeachingClass = {
            ...cls,
            order: index,
            updatedAt: new Date().toISOString(),
          };
          return updated;
        })
        .filter((c): c is TeachingClass => c !== null);

      set({ classes: reordered });
      await teachingClassRepository.saveClasses({ classes: reordered });
    },

    addProgressEntry: async (
      classId,
      date,
      period,
      unit,
      lesson,
      note = '',
      status = 'planned',
    ) => {
      const entry: ProgressEntry = {
        id: generateUUID(),
        classId,
        date,
        period,
        unit,
        lesson,
        status,
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
      const cls = get().classes.find((c) => c.id === classId);
      if (cls?.groupId) {
        const groupRecord = get().attendanceRecords.find(
          (r) => r.groupId === cls.groupId && r.date === date && r.period === period,
        );
        if (groupRecord) return groupRecord;
      }
      return get().attendanceRecords.find(
        (r) => r.classId === classId && r.date === date && r.period === period,
      );
    },

    /* ────── 좌석배치 액션 ────── */

    initClassSeating: async (classId, mode) => {
      const cls = get().classes.find((c) => c.id === classId);
      if (!cls) return;

      const activeStudents = cls.students.filter(isStudentActive);
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
      await applySeatingToGroup(classId, seating);
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
      await applySeatingToGroup(classId, seating);
    },

    swapClassSeats: async (classId, r1, c1, r2, c2) => {
      const cls = get().classes.find((c) => c.id === classId);
      if (!cls?.seating) return;

      const newSeats = cls.seating.seats.map((row) => [...row]);
      const temp = newSeats[r1]![c1]!;
      newSeats[r1]![c1] = newSeats[r2]![c2]!;
      newSeats[r2]![c2] = temp;

      const seating: TeachingClassSeating = { ...cls.seating, seats: newSeats };
      await applySeatingToGroup(classId, seating);
    },

    clearClassSeating: async (classId) => {
      const cls = get().classes.find((c) => c.id === classId);
      if (!cls) return;
      await applySeatingToGroup(classId, undefined);
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

      const seating: TeachingClassSeating = {
        ...cls.seating,
        rows: newRows,
        cols: newCols,
        seats: newSeats,
      };
      await applySeatingToGroup(classId, seating);
    },

    toggleClassPairMode: async (classId) => {
      const cls = get().classes.find((c) => c.id === classId);
      if (!cls?.seating) return;

      const seating: TeachingClassSeating = { ...cls.seating, pairMode: !cls.seating.pairMode };
      await applySeatingToGroup(classId, seating);
    },

    toggleClassOddColumnMode: async (classId) => {
      const cls = get().classes.find((c) => c.id === classId);
      if (!cls?.seating) return;

      const current = cls.seating.oddColumnMode ?? 'single';
      const next: OddColumnMode = current === 'single' ? 'triple' : 'single';
      const seating: TeachingClassSeating = { ...cls.seating, oddColumnMode: next };
      await applySeatingToGroup(classId, seating);
    },

    updateStudentStatus: async (classId, sKey, status, statusNote) => {
      const cls = get().classes.find((c) => c.id === classId);
      if (!cls) return;

      const isInactive = status !== 'active';
      const updatedStudents = cls.students.map((s) => {
        if (studentKey(s) !== sKey) return s;
        return {
          ...s,
          status,
          statusNote: statusNote ?? s.statusNote,
          statusChangedAt: new Date().toISOString().slice(0, 10),
          isVacant: isInactive, // 하위호환
        };
      });

      const classes = get().classes;
      const now = new Date().toISOString();

      if (cls.groupId) {
        // 그룹 전체에 동일 students + seating에서 비활성 학생 좌석 제거
        const updatedList: TeachingClass[] = [];
        const nextClasses = classes.map((c) => {
          if (c.groupId !== cls.groupId) return c;
          let seating = c.seating;
          if (isInactive && seating) {
            const newSeats = seating.seats.map((row) =>
              row.map((cell) => (cell === sKey ? null : cell)),
            );
            seating = { ...seating, seats: newSeats };
          }
          const updated: TeachingClass = {
            ...c,
            students: updatedStudents,
            seating,
            updatedAt: now,
          };
          updatedList.push(updated);
          return updated;
        });
        set({ classes: nextClasses });
        for (const u of updatedList) {
          await manageClasses.update(u);
        }
        return;
      }

      // 단일 클래스: 기존 로직
      let seating = cls.seating;
      if (isInactive && seating) {
        const newSeats = seating.seats.map((row) =>
          row.map((cell) => (cell === sKey ? null : cell)),
        );
        seating = { ...seating, seats: newSeats };
      }

      const updated: TeachingClass = {
        ...cls,
        students: updatedStudents,
        seating,
        updatedAt: now,
      };
      set((state) => ({ classes: state.classes.map((c) => (c.id === classId ? updated : c)) }));
      await manageClasses.update(updated);
    },

    saveAttendanceRecord: async (record) => {
      if (!(await ensureWritable())) return;
      // cls의 groupId 주입
      const cls = get().classes.find((c) => c.id === record.classId);
      const finalRecord: AttendanceRecord = cls?.groupId
        ? { ...record, groupId: cls.groupId }
        : record;

      // 변경 의도(단건 upsert)만 넘긴다 — 그룹/단일 키 매칭과 배열 교체는 락 안
      // fresh 스냅샷에서 수행된다(P6). in-memory 배열을 실어 보내면 동기화가 방금
      // 병합한 다른 기록을 낡은 스냅샷이 통째로 덮는다(2026-07 QA BLOCKER).
      const saved = await manageAttendance.upsertRecord(finalRecord);
      set({ attendanceRecords: [...saved] });
    },

    getDayAttendance: (classId, date) => {
      const cls = get().classes.find((c) => c.id === classId);
      if (cls?.groupId) {
        // groupId 매치 + 같은 classId도 포함 (과목별 수업 중 출결)
        return get().attendanceRecords.filter(
          (r) => r.date === date && (r.groupId === cls.groupId || r.classId === classId),
        );
      }
      return get().attendanceRecords.filter((r) => r.classId === classId && r.date === date);
    },

    saveDayAttendance: async (classId, date, recordsByPeriod) => {
      if (!(await ensureWritable())) return;
      const cls = get().classes.find((c) => c.id === classId);
      const groupId = cls?.groupId;

      // 하루 통째 교체 의도만 넘긴다 — 제거 대상 계산·재구성은 락 안 fresh 스냅샷에서(P6).
      // (그리드는 그 학급 하루의 단일 기록자라 recordsByPeriod 페이로드 자체가 사용자 의도다)
      const saved = await manageAttendance.replaceDayForClass({
        classId,
        ...(groupId ? { groupId } : {}),
        date,
        recordsByPeriod,
      });
      set({ attendanceRecords: [...saved] });
    },

    upsertStudentAttendanceEntries: async ({ classId, date, studentNumbers, recordsByPeriod }) => {
      if (!(await ensureWritable())) return null;
      const cls = get().classes.find((c) => c.id === classId);
      const saved = await manageAttendance.upsertStudentEntries({
        classId,
        ...(cls?.groupId ? { groupId: cls.groupId } : {}),
        date,
        studentNumbers,
        recordsByPeriod,
      });
      set({ attendanceRecords: [...saved] });
      return saved;
    },

    /**
     * roster-sample-data-removal Phase 2 — 외부 참조 검사 (가드 D).
     *
     * 모든 수업반/담임반 classes를 순회하면서 students[i].name이 입력 names 집합에
     * 정확히 일치하는 학생의 수를 카운트한다. classId+studentNumber 조합으로
     * unique 카운트하여 한 학생이 여러 컨테이너에 중복 박혀 있어도 1로 센다.
     *
     * 보수적 정책: 이름 정확 일치만 인정. studentNumber 1~35 매칭은 일반 사용자
     * 반과 충돌할 위험이 크므로 사용하지 않는다.
     */
    hasStudentReferencesByName: (names) => {
      if (names.length === 0) return 0;
      const targetNames = new Set(names);
      const matched = new Set<string>();
      for (const cls of get().classes) {
        for (const s of cls.students) {
          if (targetNames.has(s.name)) {
            matched.add(`${cls.id}#${s.number}`);
          }
        }
      }
      return matched.size;
    },
  };
});

export type { AttendanceStatus };
