import { create } from 'zustand';
import type {
  TeachingClass,
  TeachingClassStudent,
  TeachingClassSeating,
} from '@domain/entities/TeachingClass';
import { studentKey } from '@domain/entities/TeachingClass';
import type { StudentStatus } from '@domain/entities/Student';
import { isStudentActive, normalizeStudentStatus } from '@domain/rules/studentActivity';
import {
  archiveTeachingClass,
  filterActiveClasses,
  isTeachingClassArchived,
  shouldPropagateToSibling,
  unarchiveTeachingClass,
} from '@domain/rules/teachingClassArchive';
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
import type { LessonDayAdjustment } from '@domain/entities/CurriculumProgress';
import { ManageAttendance } from '@usecases/classManagement/ManageAttendance';
import { generateUUID } from '@infrastructure/utils/uuid';

/**
 * 로드 시 status ↔ isVacant 양방향 마이그레이션.
 * 이전 단방향(isVacant=true → status='withdrawn') 외에 status 있고 isVacant 누락된 케이스도 동기화.
 */
function migrateStudentStatus(student: TeachingClassStudent): TeachingClassStudent {
  return normalizeStudentStatus(student);
}

/** order → createdAt 순 정렬 (load와 재정렬·복원이 같은 규칙을 쓴다). */
function sortClasses(list: readonly TeachingClass[]): TeachingClass[] {
  return [...list].sort((a, b) => {
    const orderA = a.order ?? Infinity;
    const orderB = b.order ?? Infinity;
    if (orderA !== orderB) return orderA - orderB;
    return a.createdAt.localeCompare(b.createdAt);
  });
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
  /**
   * 수업일 추정에 대한 사용자 정정("이 날은 수업했어요 / 안 했어요").
   * 진도 파일의 형제 필드라 반과 수명을 같이한다 — 반을 지우면 함께 지운다.
   */
  lessonDayAdjustments: readonly LessonDayAdjustment[];
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
  /** 수업반 보관 — 개별 보관이 기본(형제 전파 없음). 데이터는 그대로, 플래그만 전이. */
  archiveClass: (id: string) => Promise<void>;
  /** 체크박스 일괄 보관 — 저장 1회·상태 갱신 1회(업로드 트리거 1회). */
  archiveClasses: (ids: readonly string[]) => Promise<void>;
  /** 보관 해제 — 활성 목록 맨 아래(order = max+1)로 복원. 보관 이력은 남긴다. */
  unarchiveClass: (id: string) => Promise<void>;
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
  /**
   * 그날 수업 여부를 사용자가 직접 정한다. `kind`가 null이면 정정을 지우고 앱 판정으로 되돌린다.
   */
  setLessonDayAdjustment: (
    classId: string,
    date: string,
    kind: LessonDayAdjustment['kind'] | null,
  ) => Promise<void>;
  getAttendanceRecord: (
    classId: string,
    date: string,
    period: number,
  ) => AttendanceRecord | undefined;
  /** 저장 성공 시 true, 쓰기 차단(읽기 오류 등)으로 아무것도 하지 않았으면 false. */
  saveAttendanceRecord: (record: AttendanceRecord) => Promise<boolean>;
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
      // 형제 반은 전파 술어 통과 시에만 갱신 (보관·independent 형제 보호). 대상 반 자신은 항상 갱신.
      if (c.id !== classId && !shouldPropagateToSibling(c)) return c;
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
    lessonDayAdjustments: [],
    attendanceRecords: [],
    selectedClassId: null,
    loaded: false,
    loadFailed: false,

    load: async (force = false) => {
      // force=true: 동기화 리로드용 — loaded를 유지한 채 데이터만 조용히 갱신
      if (get().loaded && !force) return;
      try {
        const [classes, progressEntries, lessonDayAdjustments, attendanceRecords] =
          await Promise.all([
            manageClasses.getAll(),
            manageProgress.getAll(),
            manageProgress.getAdjustments(),
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
        const sorted = sortClasses(migrated);
        set({
          classes: sorted,
          progressEntries,
          lessonDayAdjustments,
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
        // 전파 술어 — independent(자체 명단 유지)·보관된 형제(과거 명렬 보호)는 그룹 동기화 제외
        if (!shouldPropagateToSibling(c)) return c;
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
        // 전파 술어 — 보관·independent 형제의 좌석을 활성 반 편집이 바꾸지 않게 한다
        if (!shouldPropagateToSibling(c)) return c;
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
      // 정정 목록도 함께 지운다. 안 지우면 삭제된 반의 정정이 파일에 영구히 남아,
      // 이 필드를 진도 파일에 둔 이유(반과 수명을 같이한다)가 무너진다.
      const adjustmentsToKeep = get().lessonDayAdjustments.filter((a) => a.classId !== id);

      await manageProgress.saveAll(progressToKeep, true, adjustmentsToKeep);
      // 출결은 변경 의도만 넘긴다 — 삭제 대상 계산과 "그룹 마지막 학급" 판정 모두
      // usecase가 락 안 fresh 데이터로 수행한다(in-memory 스냅샷 판정은 동기화로
      // 방금 추가된 그룹 학급을 못 보고 그룹 출결을 오삭제할 수 있다).
      const savedAttendance = await manageAttendance.deleteByClass(id, groupId);
      set((state) => ({
        classes: state.classes.filter((c) => c.id !== id),
        progressEntries: progressToKeep,
        lessonDayAdjustments: adjustmentsToKeep,
        attendanceRecords: [...savedAttendance],
        selectedClassId: state.selectedClassId === id ? null : state.selectedClassId,
      }));
    },

    reorderClasses: async (orderedIds) => {
      if (!(await ensureWritable())) return;
      // 유즈케이스 경유(레이어 준수) + 저장 파일 기준 fresh 갱신.
      // orderedIds에 없는 반(보관된 반 등)은 원본 유지 — 과거의 통째 재구성은
      // 미매칭 항목을 조용히 파일에서 유실시켰다(school-year-archive plan 함정 ⑩).
      const updated = await manageClasses.reorder(orderedIds);
      set({ classes: sortClasses(updated) });
    },

    archiveClass: async (id) => {
      await get().archiveClasses([id]);
    },

    archiveClasses: async (ids) => {
      if (!(await ensureWritable())) return;
      const now = new Date();
      const stamp = now.toISOString();
      const idSet = new Set(ids);
      const updatedList: TeachingClass[] = [];
      const nextClasses = get().classes.map((c) => {
        if (!idSet.has(c.id) || isTeachingClassArchived(c)) return c;
        const updated: TeachingClass = { ...archiveTeachingClass(c, now), updatedAt: stamp };
        updatedList.push(updated);
        return updated;
      });
      if (updatedList.length === 0) return;
      // 상태 갱신 1회 → 동기화 구독(App.tsx STORE_SUBSCRIBE_MAP)이 디바운스 업로드를
      // 1회 트리거한다(ADR-033 요구사항 — 동기화 비활성이면 구독 자체가 없어 자연 스킵).
      set({ classes: nextClasses });
      await manageClasses.updateMany(updatedList); // 저장 1회 (N회 쓰기 금지 — 함정 ⑧)
    },

    unarchiveClass: async (id) => {
      if (!(await ensureWritable())) return;
      const classes = get().classes;
      const target = classes.find((c) => c.id === id);
      if (!target || !isTeachingClassArchived(target)) return;
      const maxActiveOrder = filterActiveClasses(classes).reduce(
        (max, c) => Math.max(max, c.order ?? -1),
        -1,
      );
      const updated: TeachingClass = {
        ...unarchiveTeachingClass(target, maxActiveOrder),
        updatedAt: new Date().toISOString(),
      };
      set({ classes: sortClasses(classes.map((c) => (c.id === id ? updated : c))) });
      await manageClasses.update(updated);
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

    setLessonDayAdjustment: async (classId, date, kind) => {
      const next = await manageProgress.saveAdjustment(
        classId,
        date,
        kind,
        new Date().toISOString(),
      );
      set({ lessonDayAdjustments: next });
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
          // 전파 술어 — 형제 정책 통일: independent(기존 syncGroupStudents만 지키던 규칙)·보관 형제 제외.
          // 대상 반 자신은 항상 갱신.
          if (c.id !== classId && !shouldPropagateToSibling(c)) return c;
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
      // 쓰기가 차단되면 false — 호출자가 "저장됨"으로 오해하지 않도록 표면화한다(ADR-027).
      // 기존 호출자는 반환값을 무시해도 그대로 동작한다(void → boolean 확대).
      if (!(await ensureWritable())) return false;
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
      return true;
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
