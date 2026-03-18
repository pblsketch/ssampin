import React, { useState, useEffect, useCallback } from 'react';
import type { SeatingData } from '@domain/entities/Seating';
import type { TeachingClassStudent, TeachingClass } from '@domain/entities/TeachingClass';
import type { AttendanceStatus, AttendanceReason } from '@domain/entities/Attendance';
import { ATTENDANCE_REASONS } from '@domain/entities/Attendance';
import { studentKey } from '@domain/entities/TeachingClass';
import { useMobileSettingsStore } from '@mobile/stores/useMobileSettingsStore';
import { useMobileStudentStore } from '@mobile/stores/useMobileStudentStore';
import { useMobileTeachingClassStore } from '@mobile/stores/useMobileTeachingClassStore';
import { useMobileAttendanceStore } from '@mobile/stores/useMobileAttendanceStore';
import { seatingRepository } from '@mobile/di/container';

type ViewMode = 'seating' | 'list';
type ClassSelection = 'homeroom' | string; // 'homeroom' 또는 teachingClass.id

// ============================================================
// 출석 상태 설정
// ============================================================

const STATUS_CONFIG: Record<AttendanceStatus, { label: string; icon: string; activeColor: string }> = {
  present: { label: '출석', icon: 'check_circle', activeColor: 'text-green-400 bg-green-400/10 border-green-400/40' },
  late: { label: '지각', icon: 'schedule', activeColor: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/40' },
  absent: { label: '결석', icon: 'cancel', activeColor: 'text-red-400 bg-red-400/10 border-red-400/40' },
  earlyLeave: { label: '조퇴', icon: 'exit_to_app', activeColor: 'text-orange-400 bg-orange-400/10 border-orange-400/40' },
  classAbsence: { label: '결과', icon: 'event_busy', activeColor: 'text-purple-400 bg-purple-400/10 border-purple-400/40' },
};

// ============================================================
// 메인 페이지
// ============================================================

export function StudentsPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('seating');
  const [selectedClass, setSelectedClass] = useState<ClassSelection>('homeroom');
  const [seatingData, setSeatingData] = useState<SeatingData | null>(null);

  // 바텀시트 상태
  const [sheetStudent, setSheetStudent] = useState<SheetStudentInfo | null>(null);

  const settings = useMobileSettingsStore((s) => s.settings);
  const loadSettings = useMobileSettingsStore((s) => s.load);

  const students = useMobileStudentStore((s) => s.students);
  const studentsLoaded = useMobileStudentStore((s) => s.loaded);
  const loadStudents = useMobileStudentStore((s) => s.load);

  const teachingClasses = useMobileTeachingClassStore((s) => s.classes);
  const teachingClassesLoaded = useMobileTeachingClassStore((s) => s.loaded);
  const loadTeachingClasses = useMobileTeachingClassStore((s) => s.load);

  const loadAttendance = useMobileAttendanceStore((s) => s.load);

  useEffect(() => {
    void loadSettings();
    void loadStudents();
    void loadTeachingClasses();
    void loadAttendance();
    void seatingRepository.getSeating().then((data) => {
      setSeatingData(data);
    });
  }, [loadSettings, loadStudents, loadTeachingClasses, loadAttendance]);

  // 담임반이 선택되었는데 수업반 뷰로 전환되면 좌석 뷰 기본값 유지
  // 수업반 선택 시 명단 뷰로 자동 전환 (좌석은 별도 지원)
  useEffect(() => {
    if (selectedClass !== 'homeroom') {
      setViewMode('list');
    }
  }, [selectedClass]);

  // 학생 ID → 학생 정보 맵 (담임반용)
  const studentMap = React.useMemo(() => {
    const map = new Map<string, { name: string; number?: number; isVacant?: boolean }>();
    for (const s of students) {
      map.set(s.id, { name: s.name, number: s.studentNumber, isVacant: s.isVacant });
    }
    return map;
  }, [students]);

  // 번호순 정렬된 담임반 학생 목록
  const sortedStudents = React.useMemo(() => {
    return [...students].sort((a, b) => {
      const na = a.studentNumber ?? 0;
      const nb = b.studentNumber ?? 0;
      return na - nb;
    });
  }, [students]);

  // 현재 선택된 수업반 객체
  const selectedTeachingClass = React.useMemo(() => {
    if (selectedClass === 'homeroom') return null;
    return teachingClasses.find((c) => c.id === selectedClass) ?? null;
  }, [selectedClass, teachingClasses]);

  const homeroomName = settings.className || '담임반';

  const isLoading = !studentsLoaded || !teachingClassesLoaded;

  // 담임반 학생을 바텀시트 형식으로 변환
  const openHomeroomStudentSheet = useCallback((studentId: string) => {
    const s = students.find((st) => st.id === studentId);
    if (!s || s.isVacant) return;
    setSheetStudent({
      number: s.studentNumber ?? 0,
      name: s.name,
      sKey: String(s.studentNumber ?? s.id),
      classId: settings.className || 'homeroom',
      period: 0,
      type: 'homeroom',
    });
  }, [students, settings.className]);

  // 수업반 학생을 바텀시트 형식으로 변환
  const openTeachingStudentSheet = useCallback((student: TeachingClassStudent, classId: string) => {
    if (student.isVacant) return;
    setSheetStudent({
      number: student.number,
      name: student.name,
      grade: student.grade,
      classNum: student.classNum,
      sKey: studentKey(student),
      classId,
      period: 0, // 수업반은 period 별도 관리 — 여기서는 즉석 출결 기록용으로 0 사용
      type: 'class',
    });
  }, []);

  return (
    <div className="flex flex-col h-full bg-sp-bg">
      {/* 헤더 */}
      <header className="flex flex-col gap-0 bg-sp-surface border-b border-sp-border shrink-0">
        {/* 상단 행: 제목 + 뷰 토글 */}
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="text-sp-text font-bold text-base">
            {selectedClass === 'homeroom'
              ? homeroomName
              : selectedTeachingClass?.name ?? '수업반'}
          </h2>

          {/* 담임반일 때만 뷰 토글 표시 */}
          {selectedClass === 'homeroom' && (
            <div className="flex items-center gap-1 bg-sp-card rounded-lg p-1">
              <button
                onClick={() => setViewMode('seating')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'seating'
                    ? 'bg-sp-accent text-white'
                    : 'text-sp-muted hover:text-sp-text'
                }`}
              >
                좌석
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'list'
                    ? 'bg-sp-accent text-white'
                    : 'text-sp-muted hover:text-sp-text'
                }`}
              >
                명단
              </button>
            </div>
          )}

          {/* 수업반일 때 뷰 토글 (명단/좌석, 좌석이 있을 때) */}
          {selectedClass !== 'homeroom' && selectedTeachingClass?.seating && (
            <div className="flex items-center gap-1 bg-sp-card rounded-lg p-1">
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'list'
                    ? 'bg-sp-accent text-white'
                    : 'text-sp-muted hover:text-sp-text'
                }`}
              >
                명단
              </button>
              <button
                onClick={() => setViewMode('seating')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'seating'
                    ? 'bg-sp-accent text-white'
                    : 'text-sp-muted hover:text-sp-text'
                }`}
              >
                좌석
              </button>
            </div>
          )}
        </div>

        {/* 학급 선택 탭 (담임반 + 수업반들) */}
        {teachingClasses.length > 0 && (
          <div className="flex overflow-x-auto gap-2 px-4 pb-3 no-scrollbar">
            {/* 담임반 탭 */}
            <button
              onClick={() => setSelectedClass('homeroom')}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                selectedClass === 'homeroom'
                  ? 'bg-sp-accent/15 border-sp-accent/40 text-sp-accent'
                  : 'bg-sp-card border-sp-border text-sp-muted hover:text-sp-text'
              }`}
            >
              담임반
            </button>

            {/* 수업반 탭들 */}
            {teachingClasses.map((tc) => (
              <button
                key={tc.id}
                onClick={() => setSelectedClass(tc.id)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  selectedClass === tc.id
                    ? 'bg-sp-accent/15 border-sp-accent/40 text-sp-accent'
                    : 'bg-sp-card border-sp-border text-sp-muted hover:text-sp-text'
                }`}
              >
                {tc.name}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* 컨텐츠 */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sp-muted text-sm">불러오는 중...</p>
          </div>
        ) : selectedClass === 'homeroom' ? (
          viewMode === 'seating' ? (
            <SeatingView
              seatingData={seatingData}
              studentMap={studentMap}
              onStudentTap={openHomeroomStudentSheet}
            />
          ) : (
            <HomeroomListView
              students={sortedStudents}
              onStudentTap={openHomeroomStudentSheet}
            />
          )
        ) : selectedTeachingClass ? (
          viewMode === 'seating' && selectedTeachingClass.seating ? (
            <TeachingSeatingView
              teachingClass={selectedTeachingClass}
              onStudentTap={(s) => openTeachingStudentSheet(s, selectedTeachingClass.id)}
            />
          ) : (
            <TeachingListView
              teachingClass={selectedTeachingClass}
              onStudentTap={(s) => openTeachingStudentSheet(s, selectedTeachingClass.id)}
            />
          )
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-sp-muted text-sm">수업반 정보가 없습니다.</p>
          </div>
        )}
      </div>

      {/* 학생 퀵액션 바텀시트 */}
      {sheetStudent && (
        <StudentQuickActionSheet
          info={sheetStudent}
          onClose={() => setSheetStudent(null)}
        />
      )}
    </div>
  );
}

// ============================================================
// 담임반 좌석 뷰
// ============================================================

interface SeatingViewProps {
  seatingData: SeatingData | null;
  studentMap: Map<string, { name: string; number?: number; isVacant?: boolean }>;
  onStudentTap: (studentId: string) => void;
}

function SeatingView({ seatingData, studentMap, onStudentTap }: SeatingViewProps) {
  const [isTeacherView, setIsTeacherView] = useState(true);
  const settings = useMobileSettingsStore((s) => s.settings);
  const getTodayRecord = useMobileAttendanceStore((s) => s.getTodayRecord);
  const records = useMobileAttendanceStore((s) => s.records); // for reactivity
  const todayRecord = getTodayRecord(settings.className || 'homeroom', 0);

  // Suppress unused-var lint — `records` is read only for Zustand reactivity
  void records;

  const getStudentStatus = (studentNumber: number | undefined): AttendanceStatus | null => {
    if (!todayRecord || studentNumber === undefined) return null;
    const found = todayRecord.students.find((sa) => sa.number === studentNumber);
    return found?.status ?? null;
  };

  const seatColorByStatus = (status: AttendanceStatus | null): string => {
    switch (status) {
      case 'present': return 'bg-green-400/15 border-green-400/40 text-sp-text active:bg-green-400/25';
      case 'late': return 'bg-yellow-400/15 border-yellow-400/40 text-sp-text active:bg-yellow-400/25';
      case 'absent': return 'bg-red-400/15 border-red-400/40 text-sp-text active:bg-red-400/25';
      case 'earlyLeave': return 'bg-orange-400/15 border-orange-400/40 text-sp-text active:bg-orange-400/25';
      case 'classAbsence': return 'bg-purple-400/15 border-purple-400/40 text-sp-text active:bg-purple-400/25';
      default: return 'bg-sp-accent/10 border-sp-accent/30 text-sp-text active:bg-sp-accent/25';
    }
  };

  if (!seatingData) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sp-muted text-sm">좌석 배치 정보가 없습니다.</p>
      </div>
    );
  }

  const { rows, cols, seats } = seatingData;

  return (
    <div className="flex flex-col items-center px-4 py-4 gap-3">
      {/* 교탁 (학생 시점: 위) */}
      {!isTeacherView && (
        <div className="w-full max-w-sm flex justify-center">
          <div className="px-6 py-2 bg-sp-surface border border-sp-border rounded-lg text-sp-muted text-sm font-medium">
            교탁
          </div>
        </div>
      )}

      {/* 좌석 그리드 */}
      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: rows }, (_, rowIdx) =>
          Array.from({ length: cols }, (_, colIdx) => {
            // 교사 시점: 180° 회전
            const ri = isTeacherView ? rows - 1 - rowIdx : rowIdx;
            const ci = isTeacherView ? cols - 1 - colIdx : colIdx;
            const studentId = seats[ri]?.[ci] ?? null;
            const student = studentId ? studentMap.get(studentId) : null;
            const isVacant = student?.isVacant ?? false;
            const hasStudent = studentId !== null && student !== undefined;
            const tappable = hasStudent && !isVacant;
            const status = tappable ? getStudentStatus(student?.number) : null;

            return (
              <button
                key={`${rowIdx}-${colIdx}`}
                disabled={!tappable}
                onClick={() => tappable && studentId && onStudentTap(studentId)}
                className={`w-12 h-12 flex flex-col items-center justify-center rounded-lg border text-xs leading-tight transition-colors ${
                  tappable
                    ? seatColorByStatus(status)
                    : hasStudent && isVacant
                      ? 'bg-sp-surface/50 border-sp-border text-sp-muted opacity-40'
                      : 'bg-sp-surface/30 border-sp-border/50 text-sp-muted/30'
                }`}
              >
                {hasStudent && !isVacant ? (
                  <>
                    {student?.number !== undefined && (
                      <span className="text-sp-muted text-[9px] leading-none">{student.number}</span>
                    )}
                    <span className="font-medium">{student?.name.charAt(0) ?? '?'}</span>
                  </>
                ) : hasStudent && isVacant ? (
                  <span className="text-[10px]">결번</span>
                ) : null}
              </button>
            );
          }),
        )}
      </div>

      {/* 교탁 (교사 시점: 아래) */}
      {isTeacherView && (
        <div className="w-full max-w-sm flex justify-center">
          <div className="px-6 py-2 bg-sp-surface border border-sp-border rounded-lg text-sp-muted text-sm font-medium">
            교탁
          </div>
        </div>
      )}

      {/* 범례 + 시점 토글 */}
      <div className="flex flex-wrap items-center justify-between gap-3 mt-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-sp-accent/10 border border-sp-accent/30" />
            <span className="text-sp-muted text-xs">미기록</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-green-400/15 border border-green-400/40" />
            <span className="text-sp-muted text-xs">출석</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-yellow-400/15 border border-yellow-400/40" />
            <span className="text-sp-muted text-xs">지각</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-red-400/15 border border-red-400/40" />
            <span className="text-sp-muted text-xs">결석</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-orange-400/15 border border-orange-400/40" />
            <span className="text-sp-muted text-xs">조퇴</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-purple-400/15 border border-purple-400/40" />
            <span className="text-sp-muted text-xs">결과</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-sp-surface/30 border border-sp-border/50" />
            <span className="text-sp-muted text-xs">빈 자리</span>
          </div>
        </div>
        <button
          onClick={() => setIsTeacherView(!isTeacherView)}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs border border-sp-border text-sp-muted hover:text-sp-text transition-colors"
        >
          <span className="material-symbols-outlined text-sm">
            {isTeacherView ? 'visibility' : 'swap_vert'}
          </span>
          {isTeacherView ? '교사 시점' : '학생 시점'}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// 수업반 좌석 뷰
// ============================================================

interface TeachingSeatingViewProps {
  teachingClass: TeachingClass;
  onStudentTap: (student: TeachingClassStudent) => void;
}

function TeachingSeatingView({ teachingClass, onStudentTap }: TeachingSeatingViewProps) {
  const [isTeacherView, setIsTeacherView] = useState(true);
  const getTodayRecord = useMobileAttendanceStore((s) => s.getTodayRecord);
  const records = useMobileAttendanceStore((s) => s.records); // for reactivity
  const todayRecord = getTodayRecord(teachingClass.id, 0);

  // Suppress unused-var lint — `records` is read only for Zustand reactivity
  void records;

  const seating = teachingClass.seating;

  // studentKey → 학생 정보 맵
  const studentMap = React.useMemo(() => {
    const map = new Map<string, TeachingClassStudent>();
    for (const s of teachingClass.students) {
      map.set(studentKey(s), s);
    }
    return map;
  }, [teachingClass.students]);

  const getStudentStatus = (student: TeachingClassStudent | null | undefined): AttendanceStatus | null => {
    if (!todayRecord || !student) return null;
    const sKey = studentKey(student);
    const found = todayRecord.students.find((sa) => {
      const saKey = sa.grade != null && sa.classNum != null
        ? `${sa.grade}-${sa.classNum}-${sa.number}`
        : String(sa.number);
      return saKey === sKey;
    });
    return found?.status ?? null;
  };

  const seatColorByStatus = (status: AttendanceStatus | null): string => {
    switch (status) {
      case 'present': return 'bg-green-400/15 border-green-400/40 text-sp-text active:bg-green-400/25';
      case 'late': return 'bg-yellow-400/15 border-yellow-400/40 text-sp-text active:bg-yellow-400/25';
      case 'absent': return 'bg-red-400/15 border-red-400/40 text-sp-text active:bg-red-400/25';
      case 'earlyLeave': return 'bg-orange-400/15 border-orange-400/40 text-sp-text active:bg-orange-400/25';
      case 'classAbsence': return 'bg-purple-400/15 border-purple-400/40 text-sp-text active:bg-purple-400/25';
      default: return 'bg-sp-accent/10 border-sp-accent/30 text-sp-text active:bg-sp-accent/25';
    }
  };

  if (!seating) return null;

  const { rows, cols, seats } = seating;

  return (
    <div className="flex flex-col items-center px-4 py-4 gap-3">
      {/* 교탁 (학생 시점: 위) */}
      {!isTeacherView && (
        <div className="w-full max-w-sm flex justify-center">
          <div className="px-6 py-2 bg-sp-surface border border-sp-border rounded-lg text-sp-muted text-sm font-medium">
            교탁
          </div>
        </div>
      )}

      {/* 좌석 그리드 */}
      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: rows }, (_, rowIdx) =>
          Array.from({ length: cols }, (_, colIdx) => {
            // 교사 시점: 180° 회전
            const ri = isTeacherView ? rows - 1 - rowIdx : rowIdx;
            const ci = isTeacherView ? cols - 1 - colIdx : colIdx;
            const sKey = seats[ri]?.[ci] ?? null;
            const student = sKey ? studentMap.get(sKey) : null;
            const isVacant = student?.isVacant ?? false;
            const hasStudent = sKey !== null && student !== undefined;
            const tappable = hasStudent && !isVacant;
            const status = tappable ? getStudentStatus(student) : null;

            return (
              <button
                key={`${rowIdx}-${colIdx}`}
                disabled={!tappable}
                onClick={() => tappable && student && onStudentTap(student)}
                className={`w-12 h-12 flex flex-col items-center justify-center rounded-lg border text-xs leading-tight transition-colors ${
                  tappable
                    ? seatColorByStatus(status)
                    : hasStudent && isVacant
                      ? 'bg-sp-surface/50 border-sp-border text-sp-muted opacity-40'
                      : 'bg-sp-surface/30 border-sp-border/50 text-sp-muted/30'
                }`}
              >
                {hasStudent && !isVacant ? (
                  <>
                    {student?.grade != null && student?.classNum != null ? (
                      <span className="text-sp-muted text-[8px] leading-none">
                        {student.grade}-{student.classNum}
                      </span>
                    ) : (
                      <span className="text-sp-muted text-[9px] leading-none">{student?.number}</span>
                    )}
                    <span className="font-medium">{student?.name.charAt(0) ?? '?'}</span>
                  </>
                ) : hasStudent && isVacant ? (
                  <span className="text-[10px]">결번</span>
                ) : null}
              </button>
            );
          }),
        )}
      </div>

      {/* 교탁 (교사 시점: 아래) */}
      {isTeacherView && (
        <div className="w-full max-w-sm flex justify-center">
          <div className="px-6 py-2 bg-sp-surface border border-sp-border rounded-lg text-sp-muted text-sm font-medium">
            교탁
          </div>
        </div>
      )}

      {/* 범례 + 시점 토글 */}
      <div className="flex flex-wrap items-center justify-between gap-3 mt-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-sp-accent/10 border border-sp-accent/30" />
            <span className="text-sp-muted text-xs">미기록</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-green-400/15 border border-green-400/40" />
            <span className="text-sp-muted text-xs">출석</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-yellow-400/15 border border-yellow-400/40" />
            <span className="text-sp-muted text-xs">지각</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-red-400/15 border border-red-400/40" />
            <span className="text-sp-muted text-xs">결석</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-orange-400/15 border border-orange-400/40" />
            <span className="text-sp-muted text-xs">조퇴</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-purple-400/15 border border-purple-400/40" />
            <span className="text-sp-muted text-xs">결과</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-sp-surface/30 border border-sp-border/50" />
            <span className="text-sp-muted text-xs">빈 자리</span>
          </div>
        </div>
        <button
          onClick={() => setIsTeacherView(!isTeacherView)}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs border border-sp-border text-sp-muted hover:text-sp-text transition-colors"
        >
          <span className="material-symbols-outlined text-sm">
            {isTeacherView ? 'visibility' : 'swap_vert'}
          </span>
          {isTeacherView ? '교사 시점' : '학생 시점'}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// 담임반 명단 뷰
// ============================================================

interface HomeroomStudent {
  id: string;
  name: string;
  studentNumber?: number;
  isVacant?: boolean;
}

interface HomeroomListViewProps {
  students: readonly HomeroomStudent[];
  onStudentTap: (studentId: string) => void;
}

function HomeroomListView({ students, onStudentTap }: HomeroomListViewProps) {
  const settings = useMobileSettingsStore((s) => s.settings);
  const getTodayRecord = useMobileAttendanceStore((s) => s.getTodayRecord);
  const records = useMobileAttendanceStore((s) => s.records); // for reactivity
  const todayRecord = getTodayRecord(settings.className || 'homeroom', 0);

  void records;

  const getStudentStatus = (studentNumber: number | undefined): AttendanceStatus | null => {
    if (!todayRecord || studentNumber === undefined) return null;
    const found = todayRecord.students.find((sa) => sa.number === studentNumber);
    return found?.status ?? null;
  };

  const statusDot = (status: AttendanceStatus | null) => {
    switch (status) {
      case 'present': return <span className="w-2.5 h-2.5 rounded-full bg-green-400 shrink-0" />;
      case 'late': return <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 shrink-0" />;
      case 'absent': return <span className="w-2.5 h-2.5 rounded-full bg-red-400 shrink-0" />;
      case 'earlyLeave': return <span className="w-2.5 h-2.5 rounded-full bg-orange-400 shrink-0" />;
      case 'classAbsence': return <span className="w-2.5 h-2.5 rounded-full bg-purple-400 shrink-0" />;
      default: return null;
    }
  };

  if (students.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sp-muted text-sm">학생 명단이 없습니다.</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-sp-border">
      {students.map((student) => {
        const status = student.isVacant ? null : getStudentStatus(student.studentNumber);
        return (
          <li key={student.id}>
            <button
              onClick={() => !student.isVacant && onStudentTap(student.id)}
              disabled={student.isVacant}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                student.isVacant ? 'opacity-40' : 'active:bg-sp-surface/60'
              }`}
            >
              {/* 번호 뱃지 */}
              <span
                className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold shrink-0 ${
                  student.isVacant
                    ? 'bg-sp-surface text-sp-muted'
                    : 'bg-sp-accent/15 text-sp-accent'
                }`}
              >
                {student.studentNumber ?? '-'}
              </span>

              {/* 이름 + 출석 dot */}
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span
                  className={`text-sm font-medium ${
                    student.isVacant ? 'text-sp-muted line-through' : 'text-sp-text'
                  }`}
                >
                  {student.name}
                </span>
                {statusDot(status)}
              </div>

              {/* 결번 표시 or 탭 힌트 */}
              {student.isVacant ? (
                <span className="text-xs text-sp-muted bg-sp-surface px-2 py-0.5 rounded-full">
                  결번
                </span>
              ) : (
                <span className="material-symbols-outlined text-sp-muted text-[18px]">
                  chevron_right
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ============================================================
// 수업반 명단 뷰
// ============================================================

interface TeachingListViewProps {
  teachingClass: TeachingClass;
  onStudentTap: (student: TeachingClassStudent) => void;
}

function TeachingListView({ teachingClass, onStudentTap }: TeachingListViewProps) {
  const getTodayRecord = useMobileAttendanceStore((s) => s.getTodayRecord);
  const records = useMobileAttendanceStore((s) => s.records); // for reactivity
  const todayRecord = getTodayRecord(teachingClass.id, 0);

  void records;

  const getStudentStatus = (student: TeachingClassStudent): AttendanceStatus | null => {
    if (!todayRecord) return null;
    const sKey = studentKey(student);
    const found = todayRecord.students.find((sa) => {
      const saKey = sa.grade != null && sa.classNum != null
        ? `${sa.grade}-${sa.classNum}-${sa.number}`
        : String(sa.number);
      return saKey === sKey;
    });
    return found?.status ?? null;
  };

  const statusDot = (status: AttendanceStatus | null) => {
    switch (status) {
      case 'present': return <span className="w-2.5 h-2.5 rounded-full bg-green-400 shrink-0" />;
      case 'late': return <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 shrink-0" />;
      case 'absent': return <span className="w-2.5 h-2.5 rounded-full bg-red-400 shrink-0" />;
      case 'earlyLeave': return <span className="w-2.5 h-2.5 rounded-full bg-orange-400 shrink-0" />;
      case 'classAbsence': return <span className="w-2.5 h-2.5 rounded-full bg-purple-400 shrink-0" />;
      default: return null;
    }
  };

  const students = React.useMemo(
    () => [...teachingClass.students].sort((a, b) => a.number - b.number),
    [teachingClass.students],
  );

  if (students.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sp-muted text-sm">학생 명단이 없습니다.</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-sp-border">
      {students.map((student) => {
        const sKey = studentKey(student);
        const status = student.isVacant ? null : getStudentStatus(student);
        return (
          <li key={sKey}>
            <button
              onClick={() => !student.isVacant && onStudentTap(student)}
              disabled={student.isVacant}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                student.isVacant ? 'opacity-40' : 'active:bg-sp-surface/60'
              }`}
            >
              {/* 번호 뱃지 */}
              <span
                className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold shrink-0 ${
                  student.isVacant
                    ? 'bg-sp-surface text-sp-muted'
                    : 'bg-sp-accent/15 text-sp-accent'
                }`}
              >
                {student.number}
              </span>

              {/* 이름 + 반 정보 + 출석 dot */}
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="min-w-0">
                  <span
                    className={`text-sm font-medium ${
                      student.isVacant ? 'text-sp-muted line-through' : 'text-sp-text'
                    }`}
                  >
                    {student.name}
                  </span>
                  {student.grade != null && student.classNum != null && (
                    <span className="text-sp-muted text-xs ml-1.5">
                      {student.grade}학년 {student.classNum}반
                    </span>
                  )}
                </div>
                {statusDot(status)}
              </div>

              {/* 결번 표시 or 탭 힌트 */}
              {student.isVacant ? (
                <span className="text-xs text-sp-muted bg-sp-surface px-2 py-0.5 rounded-full">
                  결번
                </span>
              ) : (
                <span className="material-symbols-outlined text-sp-muted text-[18px]">
                  chevron_right
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ============================================================
// 학생 퀵액션 바텀시트
// ============================================================

interface SheetStudentInfo {
  number: number;
  name: string;
  grade?: number;
  classNum?: number;
  sKey: string; // studentKey 결과
  classId: string;
  period: number;
  type: 'homeroom' | 'class';
}

interface StudentQuickActionSheetProps {
  info: SheetStudentInfo;
  onClose: () => void;
}

function todayString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function StudentQuickActionSheet({ info, onClose }: StudentQuickActionSheetProps) {
  const getTodayRecord = useMobileAttendanceStore((s) => s.getTodayRecord);
  const saveRecord = useMobileAttendanceStore((s) => s.saveRecord);
  const records = useMobileAttendanceStore((s) => s.records);

  // 현재 상태 및 사유/메모 계산
  const { currentStatus, currentReason, currentMemo } = React.useMemo((): {
    currentStatus: AttendanceStatus;
    currentReason: AttendanceReason | undefined;
    currentMemo: string;
  } => {
    const record = getTodayRecord(info.classId, info.period);
    if (!record) return { currentStatus: 'present', currentReason: undefined, currentMemo: '' };
    const found = record.students.find((sa) => {
      const saKey = sa.grade != null && sa.classNum != null
        ? `${sa.grade}-${sa.classNum}-${sa.number}`
        : String(sa.number);
      return saKey === info.sKey;
    });
    return {
      currentStatus: found?.status ?? 'present',
      currentReason: found?.reason as AttendanceReason | undefined,
      currentMemo: found?.memo ?? '',
    };
  }, [getTodayRecord, info.classId, info.period, info.sKey, records]); // records 의존성으로 리렌더 유발

  const [reason, setReason] = useState<AttendanceReason | undefined>(currentReason);
  const [memo, setMemo] = useState(currentMemo);
  const [saving, setSaving] = useState(false);

  // currentReason/currentMemo가 변경되면 로컬 state도 동기화
  useEffect(() => {
    setReason(currentReason);
  }, [currentReason]);

  useEffect(() => {
    setMemo(currentMemo);
  }, [currentMemo]);

  // 상태 변경 핸들러
  const handleStatusChange = useCallback(async (newStatus: AttendanceStatus) => {
    setSaving(true);

    // 기존 출결 기록 가져오기
    const existing = getTodayRecord(info.classId, info.period);

    // 이 학생 제외한 기존 학생들
    const otherStudents = (existing?.students ?? []).filter((sa) => {
      const saKey = sa.grade != null && sa.classNum != null
        ? `${sa.grade}-${sa.classNum}-${sa.number}`
        : String(sa.number);
      return saKey !== info.sKey;
    });

    // 이 학생의 새 출결 항목 (출석이면 사유/메모 제거)
    const thisEntry = {
      number: info.number,
      status: newStatus,
      reason: newStatus !== 'present' ? (reason || undefined) : undefined,
      memo: newStatus !== 'present' ? (memo || undefined) : undefined,
      ...(info.grade != null ? { grade: info.grade } : {}),
      ...(info.classNum != null ? { classNum: info.classNum } : {}),
    };

    await saveRecord({
      classId: info.classId,
      date: todayString(),
      period: info.period,
      students: [...otherStudents, thisEntry],
    });

    setSaving(false);
  }, [getTodayRecord, info, saveRecord, reason, memo]);

  // 저장 핸들러 (상태 변경 없이 현재 상태 + 사유 + 메모 저장)
  const handleSave = useCallback(async () => {
    setSaving(true);
    const existing = getTodayRecord(info.classId, info.period);
    const otherStudents = (existing?.students ?? []).filter((sa) => {
      const saKey = sa.grade != null && sa.classNum != null
        ? `${sa.grade}-${sa.classNum}-${sa.number}`
        : String(sa.number);
      return saKey !== info.sKey;
    });
    const thisEntry = {
      number: info.number,
      status: currentStatus,
      reason: currentStatus !== 'present' ? (reason || undefined) : undefined,
      memo: currentStatus !== 'present' ? (memo || undefined) : undefined,
      ...(info.grade != null ? { grade: info.grade } : {}),
      ...(info.classNum != null ? { classNum: info.classNum } : {}),
    };
    await saveRecord({
      classId: info.classId,
      date: todayString(),
      period: info.period,
      students: [...otherStudents, thisEntry],
    });
    setSaving(false);
    onClose();
  }, [getTodayRecord, info, saveRecord, onClose, currentStatus, reason, memo]);

  // 배경 터치로 닫기
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end"
      onClick={handleBackdropClick}
    >
      {/* 반투명 배경 */}
      <div className="absolute inset-0 bg-black/50" />

      {/* 시트 */}
      <div className="relative w-full bg-sp-surface rounded-t-2xl border-t border-sp-border pb-safe pt-1">
        {/* 핸들 바 */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-sp-border" />
        </div>

        {/* 학생 정보 */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-sp-border">
          {/* 아바타 */}
          <div className="w-12 h-12 rounded-full bg-sp-accent/15 flex items-center justify-center shrink-0">
            <span className="text-sp-accent font-bold text-lg">{info.name.charAt(0)}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sp-muted text-sm">{info.number}번</span>
              <span className="text-sp-text font-bold text-base">{info.name}</span>
            </div>
            {info.grade != null && info.classNum != null && (
              <p className="text-sp-muted text-xs mt-0.5">
                {info.grade}학년 {info.classNum}반
              </p>
            )}
            <p className="text-sp-muted text-xs mt-0.5">
              {todayString()} · {info.type === 'homeroom' ? '담임 출결' : '수업 출결'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-sp-card transition-colors"
          >
            <span className="material-symbols-outlined text-sp-muted">close</span>
          </button>
        </div>

        {/* 출결 상태 버튼 */}
        <div className="px-5 py-5">
          <p className="text-sp-muted text-xs font-medium mb-3">출결 상태</p>
          <div className="flex flex-wrap gap-2">
            {(Object.entries(STATUS_CONFIG) as [AttendanceStatus, typeof STATUS_CONFIG['present']][]).map(
              ([status, config]) => {
                const isActive = currentStatus === status;
                return (
                  <button
                    key={status}
                    onClick={() => void handleStatusChange(status)}
                    disabled={saving}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                      isActive
                        ? config.activeColor + ' border-2'
                        : 'border-sp-border text-sp-muted hover:border-sp-text/30'
                    } ${saving ? 'opacity-50' : ''}`}
                  >
                    <span className={`material-symbols-outlined text-lg ${isActive ? '' : 'text-sp-muted'}`}>
                      {config.icon}
                    </span>
                    {config.label}
                  </button>
                );
              },
            )}
          </div>

          {/* 사유 선택 (출석이 아닐 때만 표시) */}
          {currentStatus !== 'present' && (
            <div className="mt-4 space-y-3">
              <div>
                <p className="text-sp-muted text-xs font-medium mb-2">사유</p>
                <div className="flex flex-wrap gap-1.5">
                  {ATTENDANCE_REASONS.map((r) => {
                    const isSelected = reason === r;
                    return (
                      <button
                        key={r}
                        onClick={() => setReason(isSelected ? undefined : r)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                          isSelected
                            ? 'bg-sp-accent/15 border-sp-accent/40 text-sp-accent'
                            : 'border-sp-border text-sp-muted hover:text-sp-text'
                        }`}
                      >
                        {isSelected && <span className="mr-0.5">&#10003;</span>}{r}
                      </button>
                    );
                  })}
                </div>
              </div>
              <input
                type="text"
                placeholder="메모 (선택)"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                className="w-full px-3 py-1.5 bg-sp-surface border border-sp-border rounded-lg text-sp-text text-xs placeholder:text-sp-muted/50"
              />
              <button
                onClick={() => void handleSave()}
                disabled={saving}
                className="w-full mt-4 py-3 bg-sp-accent text-white text-sm font-bold rounded-xl disabled:opacity-50 transition-colors active:bg-sp-accent/80"
              >
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
