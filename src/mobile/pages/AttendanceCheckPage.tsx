import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  AttendanceStatus,
  AttendanceReason,
  StudentAttendance,
  AttendanceRecord,
} from '@domain/entities/Attendance';
import { ATTENDANCE_REASONS } from '@domain/entities/Attendance';
import type { TeachingClassStudent } from '@domain/entities/TeachingClass';
import { studentKey } from '@domain/entities/TeachingClass';
import { useMobileAttendanceStore } from '@mobile/stores/useMobileAttendanceStore';
import { useMobileTeachingClassStore } from '@mobile/stores/useMobileTeachingClassStore';
import { useMobileStudentStore } from '@mobile/stores/useMobileStudentStore';
import { useMobileStudentRecordsStore } from '@mobile/stores/useMobileStudentRecordsStore';
import { useMobileSettingsStore } from '@mobile/stores/useMobileSettingsStore';
import { useBottomSheet } from '@mobile/hooks/useBottomSheet';
import { isStudentActive } from '@domain/rules/studentActivity';

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
}: Props) {
  const saveRecord = useMobileAttendanceStore((s) => s.saveRecord);
  const getTodayRecord = useMobileAttendanceStore((s) => s.getTodayRecord);
  const loadAttendance = useMobileAttendanceStore((s) => s.load);
  const loadClasses = useMobileTeachingClassStore((s) => s.load);
  const getClass = useMobileTeachingClassStore((s) => s.getClass);
  const classesLoaded = useMobileTeachingClassStore((s) => s.loaded);
  const settings = useMobileSettingsStore((s) => s.settings);
  const loadSettings = useMobileSettingsStore((s) => s.load);

  // 수업 출결은 화면에서 교시를 바꿀 수 있다 (담임 출결은 period=0 고정). 초기값은 호출처가 넘긴 period.
  const [selectedPeriod, setSelectedPeriod] = useState(period);
  const [periodMenuOpen, setPeriodMenuOpen] = useState(false);

  useBottomSheet(periodMenuOpen);
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
    void loadSettings();
  }, [loadAttendance, loadClasses, loadSettings]);

  // 학생 목록 + 기존 기록 초기화
  useEffect(() => {
    if (!classesLoaded) return;

    const teachingClass = getClass(classId);
    const studentList = teachingClass?.students.filter(isStudentActive) ?? [];
    setStudents(studentList);

    // 기존 기록이 있으면 로드
    const existing = getTodayRecord(classId, selectedPeriod);
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
  }, [classesLoaded, classId, selectedPeriod, getClass, getTodayRecord]);

  // 저장 함수 — 상태는 ref에서 읽어 항상 최신 값을 보장
  // (의존성 배열에서 state를 제외하여 debounce 중 재생성을 방지 → clearTimeout race 제거)
  const doSave = useCallback(async () => {
    const currentStudents = studentsRef.current;
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

  // 언마운트 시 미저장 디바운스 분을 flush (embedded 모드는 "완료" 버튼이 없어 자동저장만 의존)
  useEffect(
    () => () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
        void doSaveRef.current();
      }
    },
    [],
  );

  // 2초 디바운스 자동 저장 예약
  const scheduleSave = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      void doSave();
    }, 2000);
  }, [doSave]);

  // 상태 변경 핸들러
  const setStatus = useCallback(
    (sKey: string, status: AttendanceStatus) => {
      setStudentStatuses((prev) => {
        const next = new Map(prev);
        next.set(sKey, status);
        return next;
      });
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
    await doSave();
    setSaving(false);
    onBack();
  };

  // 교시 변경 — 변경 전 현재 교시의 미저장분을 즉시 flush 후 전환
  const handleSelectPeriod = async (p: number) => {
    setPeriodMenuOpen(false);
    if (p === selectedPeriod) return;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    await doSave();
    setSelectedPeriod(p);
  };

  // 카운터
  const values = Array.from(studentStatuses.values());
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
      {!embedded && (
        <header
          className="glass-header flex items-center gap-3 px-4 shrink-0"
          style={{
            minHeight: 'var(--header-height)',
            paddingTop: 'env(safe-area-inset-top)',
          }}
        >
          <button onClick={onBack} className="touch-target flex items-center justify-center">
            <span className="material-symbols-outlined text-sp-text">arrow_back</span>
          </button>
          <div className="flex-1">
            <h2 className="text-sp-text font-bold">
              {type === 'homeroom' ? '담임 출결' : `${selectedPeriod}교시 출결`}
            </h2>
            <p className="text-sp-muted text-xs">{className}</p>
          </div>
          <button
            onClick={() => void handleComplete()}
            disabled={saving}
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

      {/* 실시간 카운터 */}
      <div className="glass-card flex items-center justify-around mx-4 mt-3 px-4 py-3 rounded-xl shrink-0">
        <div className="text-center">
          <p className="text-green-500 font-bold text-lg">{presentCount}</p>
          <p className="text-sp-muted text-xs">출석</p>
        </div>
        <div className="text-center">
          <p className="text-yellow-500 font-bold text-lg">{lateCount}</p>
          <p className="text-sp-muted text-xs">지각</p>
        </div>
        <div className="text-center">
          <p className="text-red-500 font-bold text-lg">{absentCount}</p>
          <p className="text-sp-muted text-xs">결석</p>
        </div>
        <div className="text-center">
          <p className="text-orange-500 font-bold text-lg">{earlyLeaveCount}</p>
          <p className="text-sp-muted text-xs">조퇴</p>
        </div>
        <div className="text-center">
          <p className="text-purple-500 font-bold text-lg">{classAbsenceCount}</p>
          <p className="text-sp-muted text-xs">결과</p>
        </div>
        <div className="text-center">
          <p className="text-sp-text font-bold text-lg">{students.length}</p>
          <p className="text-sp-muted text-xs">전체</p>
        </div>
      </div>

      {/* 학생 리스트 */}
      <div className="flex-1 overflow-y-auto">
        {students.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sp-muted text-sm">학생 명단이 없습니다.</p>
          </div>
        ) : (
          <ul className="divide-y divide-sp-border">
            {students.map((student) => {
              const sKey = studentKey(student);
              const currentStatus = studentStatuses.get(sKey) ?? 'present';

              return (
                <li key={sKey} className="px-4 py-3">
                  {/* 번호 + 이름 */}
                  <div className="flex items-baseline gap-1 min-w-0">
                    <span className="text-sp-muted text-sm shrink-0">{student.number}</span>
                    <span className="text-sp-text font-medium truncate">{student.name}</span>
                    {student.grade != null && student.classNum != null && (
                      <span className="text-sp-muted text-xs shrink-0">
                        ({student.grade}-{student.classNum})
                      </span>
                    )}
                  </div>

                  {/* 상태 버튼 — 아이콘 위 / 라벨 아래, 5열 균등 (좁은 화면에서도 라벨 노출) */}
                  <div className="flex gap-1 mt-2">
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
                          className={`flex flex-col items-center justify-center flex-1 min-h-[52px] py-1.5 rounded-lg border text-sm font-medium transition-colors ${
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
    </div>
  );
}
