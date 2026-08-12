import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type {
  AttendanceStatus,
  AttendanceReason,
  StudentAttendance,
  AttendanceRecord,
} from '@domain/entities/Attendance';
import { ATTENDANCE_REASONS } from '@domain/entities/Attendance';
import { parseAttendanceQuickText } from '@domain/rules/attendanceQuickText';
import type { QuickTextParsedResult } from '@domain/rules/attendanceQuickText';
import type { TeachingClassStudent } from '@domain/entities/TeachingClass';
import { studentKey } from '@domain/entities/TeachingClass';
import { useMobileAttendanceStore } from '@mobile/stores/useMobileAttendanceStore';
import { useMobileTeachingClassStore } from '@mobile/stores/useMobileTeachingClassStore';
import { useMobileStudentStore } from '@mobile/stores/useMobileStudentStore';
import { useMobileStudentRecordsStore } from '@mobile/stores/useMobileStudentRecordsStore';
import { useMobileSettingsStore } from '@mobile/stores/useMobileSettingsStore';
import { useBottomSheet } from '@mobile/hooks/useBottomSheet';
import { EmptyState } from '@mobile/components/common/EmptyState';
import { isStudentActive } from '@domain/rules/studentActivity';
import { MultiDatePicker } from '@adapters/components/common/MultiDatePicker';
import { beginPendingWrite } from '@mobile/stores/pendingWrites';

interface Props {
  classId: string;
  className: string;
  period: number; // 0 = 담임출결, 1~7 = 교시출결의 "초기" 선택 교시 (수업 출결은 화면에서 변경 가능)
  type: 'homeroom' | 'class';
  onBack: () => void;
  /**
   * 현재 시각이 속한 교시 (있으면 드롭다운에서 "현재" 로 강조). 없으면 강조 생략.
   */
  currentPeriod?: number;
  /**
   * true면 자체 헤더(뒤로가기 + 학급명 + 완료 버튼)와 카운터 카드의 외부 마진을 생략한다.
   * ClassDetailPage가 헤더를 이미 그리고 있을 때 사용.
   * 완료(저장)는 자동 디바운스 저장에 의존한다.
   * default: false — 기존 호출처(App.tsx 담임출결, AttendanceListPage)는 회귀 0.
   */
  embedded?: boolean;
  /**
   * false면 비embedded 헤더가 safe-area-inset-top 여백을 스스로 적용하지 않는다
   * (고정 높이 3.5rem만 사용). `HomeroomAttendanceView`처럼 이 페이지 위에 이미 노치
   * 안전영역을 흡수하는 세그먼트 바가 있을 때 이중 여백을 막기 위해 쓴다.
   * default: true — 기존 호출처(화면 최상단에 바로 렌더되는 경우)는 회귀 0.
   */
  headerTopInset?: boolean;
}

const STATUS_CONFIG: Record<
  AttendanceStatus,
  { label: string; icon: string; activeColor: string }
> = {
  present: {
    label: '출석',
    icon: 'check_circle',
    activeColor: 'text-green-500 bg-green-500/10 border-green-500/40',
  },
  late: {
    label: '지각',
    icon: 'schedule',
    activeColor: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/40',
  },
  absent: {
    label: '결석',
    icon: 'cancel',
    activeColor: 'text-red-500 bg-red-500/10 border-red-500/40',
  },
  earlyLeave: {
    label: '조퇴',
    icon: 'exit_to_app',
    activeColor: 'text-orange-500 bg-orange-500/10 border-orange-500/40',
  },
  classAbsence: {
    label: '결과',
    icon: 'event_busy',
    activeColor: 'text-purple-500 bg-purple-500/10 border-purple-500/40',
  },
};

function todayString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function AttendanceCheckPage({
  classId,
  className,
  period,
  type,
  onBack,
  currentPeriod,
  embedded = false,
  headerTopInset = true,
}: Props) {
  const saveRecord = useMobileAttendanceStore((s) => s.saveRecord);
  const getTodayRecord = useMobileAttendanceStore((s) => s.getTodayRecord);
  const loadAttendance = useMobileAttendanceStore((s) => s.load);
  const attendanceLoaded = useMobileAttendanceStore((s) => s.loaded);
  const loadClasses = useMobileTeachingClassStore((s) => s.load);
  const getClass = useMobileTeachingClassStore((s) => s.getClass);
  const classesLoaded = useMobileTeachingClassStore((s) => s.loaded);
  const homeroomStudents = useMobileStudentStore((s) => s.students);
  const homeroomStudentsLoaded = useMobileStudentStore((s) => s.loaded);
  const loadStudents = useMobileStudentStore((s) => s.load);
  const settings = useMobileSettingsStore((s) => s.settings);
  const loadSettings = useMobileSettingsStore((s) => s.load);

  // 수업 출결은 화면에서 교시를 바꿀 수 있다 (담임 출결은 period=0 고정). 초기값은 호출처가 넘긴 period.
  const [selectedPeriod, setSelectedPeriod] = useState(period);
  const [periodMenuOpen, setPeriodMenuOpen] = useState(false);

  // 여러 날 적용 Bottom Sheet (Phase 3 FR-09)
  const [multiDateSheetOpen, setMultiDateSheetOpen] = useState(false);
  const [multiDateSet, setMultiDateSet] = useState<ReadonlySet<string>>(new Set());
  const [multiSaveProgress, setMultiSaveProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  // 여러 날 저장·텍스트 적용 공용 결과 토스트
  const [actionToast, setActionToast] = useState<string | null>(null);

  // 텍스트 빠른 입력 Bottom Sheet (담임 출결 전용 — 데스크톱 출결 그리드의 텍스트 입력 이식)
  const [textSheetOpen, setTextSheetOpen] = useState(false);
  const [textInput, setTextInput] = useState('');

  useBottomSheet(periodMenuOpen || multiDateSheetOpen || textSheetOpen);
  const periodCount = settings.periodTimes.length > 0 ? settings.periodTimes.length : 7;

  const [studentStatuses, setStudentStatuses] = useState<Map<string, AttendanceStatus>>(new Map());
  const [studentReasons, setStudentReasons] = useState<Map<string, AttendanceReason>>(new Map());
  const [studentMemos, setStudentMemos] = useState<Map<string, string>>(new Map());
  const [students, setStudents] = useState<readonly TeachingClassStudent[]>([]);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // debounce된 setTimeout 안에서 최신 상태를 읽기 위한 ref 미러
  // (useCallback 의존성 업데이트 전에 setTimeout이 발사되면 stale closure로 이전 값을 덮어씀)
  const statusesRef = useRef(studentStatuses);
  const reasonsRef = useRef(studentReasons);
  const memosRef = useRef(studentMemos);
  const studentsRef = useRef(students);
  useEffect(() => {
    statusesRef.current = studentStatuses;
  }, [studentStatuses]);
  useEffect(() => {
    reasonsRef.current = studentReasons;
  }, [studentReasons]);
  useEffect(() => {
    memosRef.current = studentMemos;
  }, [studentMemos]);
  useEffect(() => {
    studentsRef.current = students;
  }, [students]);

  // 데이터 로드
  useEffect(() => {
    void loadAttendance();
    void loadClasses();
    void loadStudents();
    void loadSettings();
  }, [loadAttendance, loadClasses, loadStudents, loadSettings]);

  /**
   * 담임 출결의 학생 원천 — 담임 명렬표(`useMobileStudentStore`).
   *
   * 담임 화면이 넘겨받는 `classId`는 `settings.className`("3-5" 같은 사람이 읽는 문자열)이고
   * `TeachingClass.id`는 UUID라 `getClass(classId)`가 항상 undefined → 명단이 비어 보였다.
   * PC 담임 출결(AttendanceMode)·모바일 담임 학생 탭·출결 통계 탭과 동일하게 명렬표를 쓴다.
   *
   * 매핑 규칙(기존 저장 데이터 호환):
   *  - `number`는 반드시 `studentNumber` — 저장된 담임 출결 `students[].number`와 브리지
   *    역매핑(`allStudents.find(st => st.studentNumber === sa.number)`)이 이 값을 쓴다.
   *  - `grade`/`classNum`은 넣지 않는다 — 담임은 단일 반이라 `studentKey()`가 `String(number)`를
   *    반환해야 기존 기록 로딩 키와 일치한다(넣으면 "3-5-1"이 되어 저장된 출결이 화면에 안 붙는다).
   *  - 번호 없는 학생은 제외 — 출결은 번호로 식별돼 번호 없는 학생끼리 서로 뭉개진다
   *    (StudentsPage 빠른 출결과 동일 정책). 제외된 인원은 화면에 안내한다.
   */
  const homeroomRoster = useMemo(() => {
    if (type !== 'homeroom') {
      return { students: [] as readonly TeachingClassStudent[], excludedNoNumber: 0 };
    }
    const active = homeroomStudents.filter(isStudentActive);
    const numbered = active.filter((s) => s.studentNumber != null && s.studentNumber > 0);
    const mapped: TeachingClassStudent[] = numbered
      .map((s) => ({
        number: s.studentNumber!,
        name: s.name,
        ...(s.status !== undefined ? { status: s.status } : {}),
      }))
      .sort((a, b) => a.number - b.number);
    return { students: mapped, excludedNoNumber: active.length - numbered.length };
  }, [type, homeroomStudents]);

  // 원천 로드 완료 여부 — 담임은 명렬표, 수업은 수업 학급 명부.
  // 출결 로드까지 기다린다: 로드 전 `getTodayRecord`는 null이라 "전원 출석" 기본값이 시드되고,
  // 그 상태로 저장되면 그날 기존 출결을 덮어쓴다.
  const rosterLoaded = type === 'homeroom' ? homeroomStudentsLoaded : classesLoaded;
  const isLoading = !rosterLoaded || !attendanceLoaded;

  // 학생 목록 + 기존 기록 초기화
  useEffect(() => {
    if (isLoading) return;

    const teachingClass = getClass(classId);
    const studentList =
      type === 'homeroom'
        ? homeroomRoster.students
        : (teachingClass?.students.filter(isStudentActive) ?? []);
    setStudents(studentList);

    // 기존 기록이 있으면 로드 — 그룹 학급은 다른 과목 명의의 공유 레코드도 찾아야
    // 빈 기본값(전원 출석)이 실제 기록을 덮지 않는다(QA2 B2).
    const existing = getTodayRecord(classId, selectedPeriod, teachingClass?.groupId);
    if (existing) {
      const statusMap = new Map<string, AttendanceStatus>();
      const reasonMap = new Map<string, AttendanceReason>();
      const memoMap = new Map<string, string>();
      for (const sa of existing.students) {
        const key =
          sa.grade != null && sa.classNum != null
            ? `${sa.grade}-${sa.classNum}-${sa.number}`
            : String(sa.number);
        statusMap.set(key, sa.status);
        if (sa.reason) {
          reasonMap.set(key, sa.reason as AttendanceReason);
        }
        if (sa.memo) {
          memoMap.set(key, sa.memo);
        }
      }
      setStudentStatuses(statusMap);
      setStudentReasons(reasonMap);
      setStudentMemos(memoMap);
    } else {
      // 기본값: 전원 출석
      const map = new Map<string, AttendanceStatus>();
      for (const s of studentList) {
        map.set(studentKey(s), 'present');
      }
      setStudentStatuses(map);
      setStudentReasons(new Map());
      setStudentMemos(new Map());
    }
  }, [isLoading, type, homeroomRoster, classId, selectedPeriod, getClass, getTodayRecord]);

  // 저장 함수 — 상태는 ref에서 읽어 항상 최신 값을 보장
  // (의존성 배열에서 state를 제외하여 debounce 중 재생성을 방지 → clearTimeout race 제거)
  const doSave = useCallback(async () => {
    const currentStudents = studentsRef.current;
    // 데이터 유실 차단: 명단이 비어 있으면 저장하지 않는다.
    // 빈 명단으로 저장하면 upsert가 그날 기존 레코드를 students:[] 로 교체하고 updatedAt이
    // 갱신돼, 동기화 LWW로 PC의 그날 담임 출결까지 지워진다.
    // (완료 버튼 · 2초 디바운스 자동저장 · 언마운트 flush · 교시 전환 flush 전부 이 경로를 탄다)
    if (currentStudents.length === 0) return;
    const currentStatuses = statusesRef.current;
    const currentReasons = reasonsRef.current;
    const currentMemos = memosRef.current;

    const studentAttendances: StudentAttendance[] = currentStudents.map((s) => ({
      number: s.number,
      status: currentStatuses.get(studentKey(s)) ?? 'present',
      reason: currentReasons.get(studentKey(s)) || undefined,
      memo: currentMemos.get(studentKey(s)) || undefined,
      ...(s.grade != null ? { grade: s.grade } : {}),
      ...(s.classNum != null ? { classNum: s.classNum } : {}),
    }));

    const record: AttendanceRecord = {
      classId,
      date: todayString(),
      period: selectedPeriod,
      students: studentAttendances,
    };

    await saveRecord(record);

    // 담임반 출결 → student-records에 bridge 레코드 생성 (PC 담임 업무 통계 연동)
    if (type === 'homeroom') {
      const allStudents = useMobileStudentStore.getState().students;
      const { bridgeAttendanceRecord } = useMobileStudentRecordsStore.getState();
      const date = todayString();

      for (const sa of studentAttendances) {
        // TeachingClassStudent.number → Student.studentNumber 매핑
        const student = allStudents.find((st) => st.studentNumber === sa.number);
        if (!student) continue;
        await bridgeAttendanceRecord({
          studentId: student.id,
          date,
          status: sa.status,
          reason: sa.reason,
          memo: sa.memo,
        });
      }
    }
  }, [classId, selectedPeriod, saveRecord, type]);

  // 항상 최신 doSave를 가리키는 ref — 언마운트 cleanup에서 사용
  const doSaveRef = useRef(doSave);
  useEffect(() => {
    doSaveRef.current = doSave;
  }, [doSave]);

  // 미저장 편집 배리어 — 백그라운드 전환 업로드(flushSync)가 이 편집을 기다리게 한다.
  // 열어두지 않으면 편집 직전 상태가 클라우드 정본이 되어 PC 의 그날 출결까지 덮는다.
  const releasePendingRef = useRef<(() => void) | null>(null);
  const openPending = useCallback(() => {
    if (!releasePendingRef.current) releasePendingRef.current = beginPendingWrite();
  }, []);
  const closePending = useCallback(() => {
    releasePendingRef.current?.();
    releasePendingRef.current = null;
  }, []);

  // 예약된 디바운스를 즉시 저장으로 승격 (백그라운드 전환·언마운트·교시 전환 공용).
  const flushNow = useCallback(async () => {
    if (!debounceRef.current) {
      closePending();
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = null;
    try {
      await doSaveRef.current();
    } finally {
      closePending();
    }
  }, [closePending]);

  // 언마운트 시 미저장 디바운스 분을 flush (embedded 모드는 "완료" 버튼이 없어 자동저장만 의존)
  useEffect(() => () => void flushNow(), [flushNow]);

  // 백그라운드 전환 시 즉시 flush — iOS PWA 는 백그라운드에서 타이머를 죽이므로
  // 디바운스가 나중에 발사된다는 보장이 없다. 여기서 저장해야 편집이 살아남는다.
  useEffect(() => {
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') void flushNow();
    };
    const onPageHide = (): void => void flushNow();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [flushNow]);

  // 2초 디바운스 자동 저장 예약
  const scheduleSave = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    openPending();
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      void doSave().finally(closePending);
    }, 2000);
  }, [doSave, openPending, closePending]);

  /**
   * 사용자가 직접 펼쳐 둔 학생.
   *
   * 출석이 아닌 학생은 이 집합과 무관하게 항상 펼쳐진다(사유·메모를 봐야 하므로).
   * 이 집합은 "출석인데도 열어둔" 경우만 담는다 — 예를 들어 눌렀다가 다시 출석으로
   * 되돌린 직후, 손이 닿는 자리에 버튼이 남아 있어야 다시 고칠 수 있다.
   */
  const [expandedKeys, setExpandedKeys] = useState<ReadonlySet<string>>(new Set());

  const toggleExpanded = useCallback((sKey: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(sKey)) next.delete(sKey);
      else next.add(sKey);
      return next;
    });
  }, []);

  // 상태 변경 핸들러
  const setStatus = useCallback(
    (sKey: string, status: AttendanceStatus) => {
      setStudentStatuses((prev) => {
        const next = new Map(prev);
        next.set(sKey, status);
        return next;
      });
      // 출석으로 되돌리면 펼쳐둔 것도 함께 접는다. 그래야 목록이 다시 짧아진다.
      // (출석이 아닌 상태는 어차피 항상 펼쳐지므로 여기서 add 할 필요가 없다)
      if (status === 'present') {
        setExpandedKeys((prev) => {
          if (!prev.has(sKey)) return prev;
          const next = new Set(prev);
          next.delete(sKey);
          return next;
        });
      }
      scheduleSave();
    },
    [scheduleSave],
  );

  // 완료 버튼
  const handleComplete = async () => {
    setSaving(true);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    try {
      await doSave();
    } finally {
      closePending();
    }
    setSaving(false);
    onBack();
  };

  // 여러 날 일괄 저장 (Phase 3 FR-09)
  const handleMultiDateSave = useCallback(async () => {
    // 데이터 유실 차단(doSave와 동일 사유) — 여러 날은 최대 30일을 한 번에 비울 수 있어 더 위험하다.
    if (studentsRef.current.length === 0) {
      setActionToast('학생 명단이 없어 저장하지 않았어요');
      setTimeout(() => setActionToast(null), 3000);
      return;
    }
    const dates = Array.from(multiDateSet).sort();
    if (dates.length === 0) return;
    if (dates.length > 30) {
      setActionToast('최대 30일까지 한 번에 저장할 수 있어요');
      return;
    }
    setMultiSaveProgress({ current: 0, total: dates.length });
    const studentsPayload: StudentAttendance[] = studentsRef.current.map((s) => ({
      number: s.number,
      status: statusesRef.current.get(studentKey(s)) ?? 'present',
      reason: reasonsRef.current.get(studentKey(s)) || undefined,
      memo: memosRef.current.get(studentKey(s)) || undefined,
      ...(s.grade != null ? { grade: s.grade } : {}),
      ...(s.classNum != null ? { classNum: s.classNum } : {}),
    }));

    let successCount = 0;
    for (let i = 0; i < dates.length; i++) {
      const d = dates[i]!;
      try {
        await saveRecord({
          classId,
          date: d,
          period: selectedPeriod,
          students: studentsPayload,
        });
        successCount += 1;
      } catch {
        // 실패 날짜 건너뜀
      }
      setMultiSaveProgress({ current: i + 1, total: dates.length });
    }
    setMultiSaveProgress(null);
    setMultiDateSheetOpen(false);
    setActionToast(
      successCount === dates.length
        ? `${dates.length}일에 동일 출결을 저장했어요`
        : `${dates.length}일 중 ${successCount}일만 저장됐어요`,
    );
    // 토스트 자동 해제
    setTimeout(() => setActionToast(null), 3000);
  }, [classId, selectedPeriod, saveRecord, multiDateSet]);

  /* ── 텍스트 빠른 입력 (담임 출결 전용) ──
     파서는 데스크톱 출결 그리드와 공유. 모바일 담임 출결은 하루 단위 상태 1개만
     저장하므로 교시 생략을 허용(requirePeriod:false)하고, 파싱 결과의 교시 정보
     (periods/referencePeriod)는 쓰지 않는다 — status/reason/memo만 반영. */
  const parsedLines = useMemo(() => {
    if (!textSheetOpen || textInput.trim() === '') return [];
    return parseAttendanceQuickText(
      textInput,
      students.map((s) => ({ number: s.number, name: s.name })),
      periodCount,
      { requirePeriod: false },
    );
  }, [textSheetOpen, textInput, students, periodCount]);

  const okLineCount = useMemo(() => parsedLines.filter((l) => l.ok).length, [parsedLines]);

  // 모바일 미리보기 — 교시 없이 "이름 — 종류(사유) · 비고"로 재조립
  // (파서의 preview는 교시 범위를 포함해 모바일에선 오해를 줌)
  const previewLabel = (res: QuickTextParsedResult) =>
    `${res.studentName} — ${STATUS_CONFIG[res.status].label}(${res.reason})${
      res.memo ? ` · ${res.memo}` : ''
    }`;

  const applyText = () => {
    const applies = parsedLines.filter((l) => l.ok && l.result);
    if (applies.length === 0) return;
    const nextStatuses = new Map(studentStatuses);
    const nextReasons = new Map(studentReasons);
    const nextMemos = new Map(studentMemos);
    let appliedCount = 0;
    for (const line of applies) {
      const res = line.result!;
      const student = students.find((s) => s.number === res.studentNumber);
      if (!student) continue;
      const sKey = studentKey(student);
      nextStatuses.set(sKey, res.status);
      nextReasons.set(sKey, res.reason);
      // 한 줄이 그 학생의 새 예외 상태 전체를 서술한다 — 비고 생략 시 기존 메모도 비움(데스크톱 행 재작성과 동일 의미)
      if (res.memo) nextMemos.set(sKey, res.memo);
      else nextMemos.delete(sKey);
      appliedCount += 1;
    }
    if (appliedCount === 0) return;
    setStudentStatuses(nextStatuses);
    setStudentReasons(nextReasons);
    setStudentMemos(nextMemos);
    scheduleSave();
    setTextSheetOpen(false);
    setTextInput('');
    setActionToast(`${appliedCount}명의 출결을 적용했어요`);
    setTimeout(() => setActionToast(null), 3000);
  };

  // 교시 변경 — 변경 전 현재 교시의 미저장분을 즉시 flush 후 전환
  const handleSelectPeriod = async (p: number) => {
    setPeriodMenuOpen(false);
    if (p === selectedPeriod) return;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    try {
      await doSave();
    } finally {
      closePending();
    }
    setSelectedPeriod(p);
  };

  // 명단이 없으면 저장 동선을 아예 막는다 (빈 명단 저장 = 그날 출결 삭제)
  const hasNoStudents = !isLoading && students.length === 0;

  // 빈 화면 안내 — 원인별로 다음 행동이 달라 문구를 구분한다
  const emptyStateText =
    type !== 'homeroom'
      ? '학생 명단이 없습니다.'
      : homeroomRoster.excludedNoNumber > 0
        ? '번호가 있는 학생이 없어요'
        : '담임 명렬표에 학생이 없어요';
  const emptyStateHint =
    type !== 'homeroom'
      ? '수업 학급 명단을 먼저 등록해주세요.'
      : homeroomRoster.excludedNoNumber > 0
        ? '출결은 번호로 저장돼요. 명렬표에서 번호를 지정해주세요.'
        : "아래 '학생' 탭 → 담임에서 학생을 추가하면 여기에 나타나요.";

  // 카운터 — 화면에 있는 학생 기준.
  // (상태맵에는 기록에만 남아 있고 지금 명단엔 없는 학생도 들어올 수 있다. 명단이 비었는데
  //  "출석 3 · 전체 0"처럼 보이면 저장된 것으로 오해할 수 있어 명단을 기준으로 센다)
  const values = students.map((s) => studentStatuses.get(studentKey(s)) ?? 'present');
  const presentCount = values.filter((s) => s === 'present').length;
  const lateCount = values.filter((s) => s === 'late').length;
  const absentCount = values.filter((s) => s === 'absent').length;
  const earlyLeaveCount = values.filter((s) => s === 'earlyLeave').length;
  const classAbsenceCount = values.filter((s) => s === 'classAbsence').length;

  return (
    <div className={`flex flex-col h-full ${embedded ? '' : 'bg-sp-bg'}`}>
      {/* 헤더 — embedded 모드에서는 생략 (ClassDetailPage가 이미 학급 헤더를 그림)
          minHeight + paddingTop으로 App.tsx 헤더 패턴 일치: --header-height 토큰이
          이미 env(safe-area-inset-top)을 포함하므로 iPhone 노치/다이나믹 아일랜드 자동 회피 */}
      {/* gap-2 인 이유: 390px 에서 헤더가 정확히 꽉 찬다(뒤로 44 + 제목 + 텍스트 71 +
          여러 날 74 + 완료 56 + 여백). gap-3 이면 제목에 8px 이 모자라 반 이름이 잘린다.
          반 이름은 잘못된 반에 기록되는 사고를 막는 정보라 잘리면 안 된다. */}
      {!embedded && (
        <header
          className="glass-header flex items-center gap-2 px-4 shrink-0"
          style={{
            minHeight: headerTopInset ? 'var(--header-height)' : '3.5rem',
            paddingTop: headerTopInset ? 'env(safe-area-inset-top)' : 0,
          }}
        >
          <button onClick={onBack} className="touch-target flex items-center justify-center">
            <span className="material-symbols-outlined text-sp-text">arrow_back</span>
          </button>
          {/* min-w-0 + truncate 가 없으면 390px 에서 오른쪽 버튼 3개(텍스트·여러 날·완료)에
              밀려 "담임 출결" 이 "담임 출 / 결" 로 쪼개진다. flex 자식의 기본 min-width 는
              auto 라서 콘텐츠보다 작아지지 않고, 대신 줄바꿈이 일어난다. */}
          {/* 반 이름을 제목 자리에 둔다.
              ① 390px 에서 오른쪽 버튼 3개(텍스트·여러 날·완료)에 밀려 "담임 출결" 이
                 "담임 출 / 결" 로 쪼개졌다. min-w-0+truncate 로 줄바꿈은 막히지만
                 정작 중요한 반 이름이 작은 글씨로 아래에 남는다.
              ② 이 앱은 반을 잘못 고르면 다른 반 출결에 기록이 들어간다. 화면에서
                 가장 크고 굵은 자리는 "무엇을 하는 화면인가"(담임 출결)가 아니라
                 "어느 반인가"(3학년 2반)가 차지해야 한다. */}
          <div className="flex-1 min-w-0">
            <h2 className="text-sp-text font-bold truncate">{className}</h2>
            <p className="text-sp-muted text-xs truncate">
              {type === 'homeroom' ? '담임 출결' : `${selectedPeriod}교시 출결`}
            </p>
          </div>
          {type === 'homeroom' && (
            <button
              onClick={() => setTextSheetOpen(true)}
              disabled={hasNoStudents}
              className="px-2.5 py-1.5 text-xs font-medium text-sp-accent rounded-lg hover:bg-sp-accent/10 disabled:opacity-40 touch-target active:scale-[0.98] transition-all flex items-center gap-1"
              aria-label="텍스트로 출결 입력"
            >
              <span className="material-symbols-outlined text-base">edit_note</span>
              텍스트
            </button>
          )}
          <button
            onClick={() => setMultiDateSheetOpen(true)}
            disabled={hasNoStudents}
            className="px-2.5 py-1.5 text-xs font-medium text-sp-accent rounded-lg hover:bg-sp-accent/10 disabled:opacity-40 touch-target active:scale-[0.98] transition-all flex items-center gap-1"
            aria-label="여러 날에 동일 출결 적용"
          >
            <span className="material-symbols-outlined text-base">date_range</span>
            여러 날
          </button>
          {/* 명단이 비면 저장 자체를 막는다 — 빈 명단 저장은 그날 기존 출결을 지운다 */}
          <button
            onClick={() => void handleComplete()}
            disabled={saving || hasNoStudents}
            title={hasNoStudents ? '학생 명단이 없어 저장할 수 없어요' : undefined}
            className="px-4 py-2 bg-sp-accent text-sp-accent-fg text-sm font-medium rounded-xl disabled:opacity-50 touch-target active:scale-[0.98] transition-all"
          >
            {saving ? '저장 중...' : '완료'}
          </button>
        </header>
      )}

      {/* 교시 선택 — 수업 출결에서만 (담임 출결은 교시 개념 없음) */}
      {type === 'class' && (
        <div className="px-4 pt-3 shrink-0">
          <button
            type="button"
            onClick={() => setPeriodMenuOpen(true)}
            aria-haspopup="listbox"
            aria-expanded={periodMenuOpen}
            className="inline-flex items-center gap-1 glass-card rounded-lg border border-sp-border px-3 py-1.5 min-h-[44px] active:scale-[0.98] transition-transform"
          >
            <span className="material-symbols-outlined text-sp-muted text-icon-md">schedule</span>
            <span className="text-sp-text text-sm font-bold">{selectedPeriod}교시</span>
            <span className="material-symbols-outlined text-sp-muted text-icon-md">
              expand_more
            </span>
          </button>
        </div>
      )}

      {/* 교시 선택 드롭다운 */}
      {periodMenuOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-start justify-center pt-24 px-6"
          onClick={() => setPeriodMenuOpen(false)}
        >
          <div
            className="w-full max-w-xs glass-card rounded-xl p-2 max-h-[60vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            role="listbox"
            aria-label="교시 선택"
          >
            <p className="text-sp-muted text-xs px-3 py-2">교시 선택</p>
            {Array.from({ length: periodCount }, (_, i) => i + 1).map((p) => {
              const isCurrent = currentPeriod === p;
              const isSelected = selectedPeriod === p;
              const start = settings.periodTimes[p - 1]?.start;
              return (
                <button
                  key={p}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => void handleSelectPeriod(p)}
                  className={`w-full flex items-center justify-between gap-2 rounded-lg px-3 min-h-[48px] text-sm transition-colors ${
                    isSelected
                      ? 'bg-sp-accent/15 text-sp-accent font-bold border-l-2 border-sp-accent'
                      : 'text-sp-text hover:bg-sp-surface/60'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span>{p}교시</span>
                    {start && <span className="text-sp-muted text-xs">{start}</span>}
                  </span>
                  {isCurrent && (
                    <span className="text-xs bg-sp-accent/15 text-sp-accent rounded-full px-2 py-0.5 shrink-0">
                      현재
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 실시간 카운터 — 한 줄 요약.
          예전에는 6칸 카드가 세로로 두 줄(약 70px)을 차지하며 스크롤 영역 밖에 고정돼
          있었다. 대부분 0인 항목까지 자리를 잡아먹어, 명단이 보이는 높이를 깎았다.
          0인 항목은 숨기고 한 줄로 줄인다. 색은 상태 버튼과 같은 것을 쓴다. */}
      <div className="flex items-center justify-center flex-wrap gap-x-3 gap-y-1 px-4 py-2 text-sm shrink-0 border-b border-sp-divider">
        <span className="text-sp-muted">
          출석 <b className="text-green-500 font-bold">{presentCount}</b>
        </span>
        {lateCount > 0 && (
          <span className="text-sp-muted">
            지각 <b className="text-yellow-500 font-bold">{lateCount}</b>
          </span>
        )}
        {absentCount > 0 && (
          <span className="text-sp-muted">
            결석 <b className="text-red-500 font-bold">{absentCount}</b>
          </span>
        )}
        {earlyLeaveCount > 0 && (
          <span className="text-sp-muted">
            조퇴 <b className="text-orange-500 font-bold">{earlyLeaveCount}</b>
          </span>
        )}
        {classAbsenceCount > 0 && (
          <span className="text-sp-muted">
            결과 <b className="text-purple-500 font-bold">{classAbsenceCount}</b>
          </span>
        )}
        <span className="text-sp-muted">전체 {students.length}</span>
      </div>

      {/* 번호 없는 학생 안내 — 출결은 번호로 식별돼 번호 없는 학생은 목록에서 제외된다 */}
      {!isLoading && homeroomRoster.excludedNoNumber > 0 && (
        <p className="px-4 pt-2 text-xs text-sp-muted shrink-0">
          번호가 없는 학생 {homeroomRoster.excludedNoNumber}명은 출결에 표시되지 않아요. 명렬표에서
          번호를 지정해주세요.
        </p>
      )}

      {/* 학생 리스트 */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 space-y-2" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((row) => (
              <div key={row} className="h-20 rounded-xl bg-sp-surface border border-sp-border" />
            ))}
          </div>
        ) : students.length === 0 ? (
          <EmptyState icon="group_off" text={emptyStateText} hint={emptyStateHint} />
        ) : (
          <ul className="divide-y divide-sp-border">
            {students.map((student) => {
              const sKey = studentKey(student);
              const currentStatus = studentStatuses.get(sKey) ?? 'present';

              // 출석인 학생은 한 줄로 접어둔다. 기록이 없으면 이미 '출석'으로 간주되므로
              // (위 `?? 'present'`) 아무것도 누르지 않고 나가도 전원 출석이 그대로 유지된다.
              // 펼치는 경우: ①출석이 아닌 학생 ②사용자가 직접 펼친 학생
              const isExpanded = currentStatus !== 'present' || expandedKeys.has(sKey);
              const statusConfig = STATUS_CONFIG[currentStatus];

              if (!isExpanded) {
                return (
                  <li key={sKey}>
                    <button
                      type="button"
                      onClick={() => toggleExpanded(sKey)}
                      aria-expanded={false}
                      className="w-full flex items-center gap-2 px-4 text-left active:bg-sp-subtle"
                      style={{ minHeight: 44 }}
                    >
                      <span className="text-sp-muted text-sm shrink-0 w-6">{student.number}</span>
                      <span className="text-sp-text font-medium truncate flex-1">
                        {student.name}
                      </span>
                      {student.grade != null && student.classNum != null && (
                        <span className="text-sp-muted text-xs shrink-0">
                          ({student.grade}-{student.classNum})
                        </span>
                      )}
                      <span className="text-sp-muted text-xs shrink-0 px-2 py-0.5 rounded-lg bg-sp-subtle">
                        {statusConfig.label}
                      </span>
                    </button>
                  </li>
                );
              }

              return (
                <li key={sKey} className="px-4 py-3 bg-sp-subtle">
                  {/* 번호 + 이름 */}
                  <div className="flex items-baseline gap-1 min-w-0">
                    <span className="text-sp-muted text-sm shrink-0">{student.number}</span>
                    <span className="text-sp-text font-medium truncate">{student.name}</span>
                    {student.grade != null && student.classNum != null && (
                      <span className="text-sp-muted text-xs shrink-0">
                        ({student.grade}-{student.classNum})
                      </span>
                    )}
                    {/* 출석인데 열어둔 경우에만 접기를 제공한다. 출석이 아닌 학생은
                        사유·메모를 봐야 하므로 접히면 안 된다. */}
                    {currentStatus === 'present' && (
                      <button
                        type="button"
                        onClick={() => toggleExpanded(sKey)}
                        aria-label={`${student.name} 접기`}
                        className="ml-auto shrink-0 self-center grid place-items-center rounded-lg text-sp-muted active:bg-black/5 dark:active:bg-white/10"
                        style={{ minWidth: 44, minHeight: 44 }}
                      >
                        <span className="material-symbols-outlined text-lg">expand_less</span>
                      </button>
                    )}
                  </div>

                  {/* 상태 버튼 — 아이콘 위 / 라벨 아래, 5열 고정 grid (아이콘 폰트 로딩·글자 배율과
                      무관하게 항상 한 줄. flex+flex-1은 콘텐츠 min-width로 줄바꿈될 수 있어 grid로 고정) */}
                  <div className="grid grid-cols-5 gap-1 mt-2">
                    {(
                      Object.entries(STATUS_CONFIG) as [
                        AttendanceStatus,
                        (typeof STATUS_CONFIG)['present'],
                      ][]
                    ).map(([status, config]) => {
                      const isActive = currentStatus === status;
                      return (
                        <button
                          key={status}
                          onClick={() => setStatus(sKey, status)}
                          aria-pressed={isActive}
                          aria-label={config.label}
                          className={`flex flex-col items-center justify-center min-w-0 overflow-hidden min-h-[52px] py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                            isActive
                              ? config.activeColor
                              : 'border-sp-border text-sp-muted hover:border-sp-text/30'
                          }`}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                            {config.icon}
                          </span>
                          <span className="text-[10px] leading-tight mt-0.5">{config.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* 사유 선택 + 메모 (출석이 아닐 때만 표시) */}
                  {currentStatus !== 'present' && (
                    <div className="mt-2 space-y-2">
                      {/* 사유 선택 버튼 */}
                      <div className="flex flex-wrap gap-1.5">
                        {ATTENDANCE_REASONS.map((r) => {
                          const isSelected = studentReasons.get(sKey) === r;
                          return (
                            <button
                              key={r}
                              onClick={() => {
                                setStudentReasons((prev) => {
                                  const next = new Map(prev);
                                  if (isSelected) next.delete(sKey);
                                  else next.set(sKey, r);
                                  return next;
                                });
                                scheduleSave();
                              }}
                              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                                isSelected
                                  ? 'bg-sp-accent/15 border-sp-accent/40 text-sp-accent'
                                  : 'border-sp-border text-sp-muted hover:text-sp-text'
                              }`}
                            >
                              {isSelected && <span className="mr-0.5">&#10003;</span>}
                              {r}
                            </button>
                          );
                        })}
                      </div>
                      {/* 메모 입력 */}
                      <input
                        type="text"
                        placeholder="메모 (선택)"
                        value={studentMemos.get(sKey) ?? ''}
                        onChange={(e) => {
                          setStudentMemos((prev) => {
                            const next = new Map(prev);
                            next.set(sKey, e.target.value);
                            return next;
                          });
                          scheduleSave();
                        }}
                        className="w-full px-3 py-1.5 glass-input text-xs"
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* 여러 날 적용 Bottom Sheet (Phase 3 FR-09) */}
      {multiDateSheetOpen && (
        <div
          className="fixed inset-0 z-[80] flex flex-col justify-end bg-black/50"
          onClick={() => setMultiDateSheetOpen(false)}
        >
          <div
            className="bg-sp-bg rounded-t-2xl max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="여러 날에 동일 출결 적용"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <div className="flex items-center justify-between p-3 border-b border-sp-border sticky top-0 bg-sp-bg rounded-t-2xl">
              <div>
                <h3 className="text-sm font-bold text-sp-text">여러 날 적용</h3>
                <p className="text-xs text-sp-muted">선택된 날짜 전체에 동일한 출결이 저장됩니다</p>
              </div>
              <button
                onClick={() => void handleMultiDateSave()}
                disabled={multiDateSet.size === 0 || multiSaveProgress !== null || hasNoStudents}
                className="px-3 py-1.5 bg-sp-accent text-sp-accent-fg text-xs font-medium rounded-lg disabled:opacity-50 touch-target"
              >
                {multiSaveProgress
                  ? `${multiSaveProgress.current}/${multiSaveProgress.total}일...`
                  : multiDateSet.size > 0
                    ? `${multiDateSet.size}일 저장`
                    : '저장'}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <MultiDatePicker
                mode="multi"
                multiValues={multiDateSet}
                onMultiChange={setMultiDateSet}
                maxCount={30}
                mobileSheet
                inline
                onToast={(msg) => setActionToast(msg)}
              />
            </div>
          </div>
        </div>
      )}

      {/* 텍스트 빠른 입력 Bottom Sheet (담임 출결 전용) */}
      {textSheetOpen && (
        <div
          className="fixed inset-0 z-[80] flex flex-col justify-end bg-black/50"
          onClick={() => setTextSheetOpen(false)}
        >
          <div
            className="bg-sp-bg rounded-t-2xl max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="텍스트로 출결 입력"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <div className="flex items-center justify-between gap-2 p-3 border-b border-sp-border sticky top-0 bg-sp-bg rounded-t-2xl">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-sp-text flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-base">edit_note</span>
                  텍스트로 출결 입력
                </h3>
                <p className="text-xs text-sp-muted">한 줄에 한 명씩 · 미리보기 확인 후 적용</p>
              </div>
              <button
                onClick={applyText}
                disabled={okLineCount === 0}
                className="px-3 py-1.5 bg-sp-accent text-sp-accent-fg text-xs font-medium rounded-lg disabled:opacity-50 touch-target shrink-0"
              >
                {okLineCount > 0 ? `${okLineCount}명 적용` : '적용'}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              <div className="text-xs text-sp-muted glass-card rounded-lg px-3 py-2 leading-relaxed">
                <span className="text-sp-text font-medium">학생 [사유] 종류 [비고]</span> — 종류는
                결석·지각·조퇴·결과
                <br />
                예: <span className="text-sp-text">김정민 질병 지각 감기</span> ·{' '}
                <span className="text-sp-text">4 미인정 결과</span> ·{' '}
                <span className="text-sp-text">이서연 결석</span>
                <br />
                사유(질병·인정·미인정·기타)를 생략하면 &lsquo;기타&rsquo;로 적혀요.
              </div>
              <textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={'김정민 질병 지각 감기\n4 미인정 결과\n이서연 결석'}
                rows={4}
                className="w-full px-3 py-2 glass-input text-sm resize-none"
              />
              {/* 스크린리더용 파싱 요약 — 미리보기 행 전체를 읽어주면 수다스러워 카운트만 알린다 */}
              <p className="sr-only" role="status">
                {parsedLines.length > 0
                  ? `적용 가능 ${okLineCount}명, 오류 ${parsedLines.length - okLineCount}건`
                  : ''}
              </p>
              {parsedLines.length > 0 && (
                <div className="border border-sp-border rounded-lg p-2 space-y-1">
                  {parsedLines.map((line) => (
                    <div
                      key={line.lineNo}
                      className={`flex items-start gap-1.5 text-xs ${
                        line.ok ? 'text-sp-text' : 'text-red-400'
                      }`}
                    >
                      <span className="material-symbols-outlined text-sm leading-none mt-0.5">
                        {line.ok ? 'check' : 'close'}
                      </span>
                      <span className="min-w-0">
                        {line.ok
                          ? previewLabel(line.result!)
                          : `${line.lineNo}행: ${line.error} (${line.raw})`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 작업 결과 토스트 (여러 날 저장 · 텍스트 적용 공용) */}
      {actionToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[90] px-4 py-2 bg-sp-card border border-sp-border rounded-lg shadow-xl text-sm text-sp-text"
        >
          {actionToast}
        </div>
      )}
    </div>
  );
}
