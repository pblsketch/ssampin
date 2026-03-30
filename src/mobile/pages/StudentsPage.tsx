import React, { useState, useEffect, useCallback } from 'react';
import { generateUUID } from '@infrastructure/utils/uuid';
import { format, addDays } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { SeatingData } from '@domain/entities/Seating';
import type { TeachingClassStudent, TeachingClass } from '@domain/entities/TeachingClass';
import type { AttendanceStatus, AttendanceReason } from '@domain/entities/Attendance';
import { ATTENDANCE_REASONS } from '@domain/entities/Attendance';
import { studentKey } from '@domain/entities/TeachingClass';
import { useMobileSettingsStore } from '@mobile/stores/useMobileSettingsStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useMobileStudentStore } from '@mobile/stores/useMobileStudentStore';
import { useMobileTeachingClassStore } from '@mobile/stores/useMobileTeachingClassStore';
import { useMobileAttendanceStore } from '@mobile/stores/useMobileAttendanceStore';
import { seatingRepository } from '@mobile/di/container';
import { useMobileStudentRecordsStore } from '@mobile/stores/useMobileStudentRecordsStore';
import { useMobileProgressStore } from '@mobile/stores/useMobileProgressStore';
import type { StudentRecord } from '@domain/entities/StudentRecord';

type ViewMode = 'seating' | 'list';
type ClassSelection = 'homeroom' | string; // 'homeroom' 또는 teachingClass.id

// ============================================================
// 출석 상태 설정
// ============================================================

const STATUS_CONFIG: Record<AttendanceStatus, { label: string; icon: string; activeColor: string }> = {
  present: { label: '출석', icon: 'check_circle', activeColor: 'text-green-500 bg-green-500/10 border-green-500/40' },
  late: { label: '지각', icon: 'schedule', activeColor: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/40' },
  absent: { label: '결석', icon: 'cancel', activeColor: 'text-red-500 bg-red-500/10 border-red-500/40' },
  earlyLeave: { label: '조퇴', icon: 'exit_to_app', activeColor: 'text-orange-500 bg-orange-500/10 border-orange-500/40' },
  classAbsence: { label: '결과', icon: 'event_busy', activeColor: 'text-purple-500 bg-purple-500/10 border-purple-500/40' },
};

// ============================================================
// 메인 페이지
// ============================================================

export function StudentsPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('seating');
  const [selectedClass, setSelectedClass] = useState<ClassSelection>('homeroom');
  const [seatingData, setSeatingData] = useState<SeatingData | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

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
  const records = useMobileAttendanceStore((s) => s.records);

  const loadRecords = useMobileStudentRecordsStore((s) => s.load);
  const loadProgress = useMobileProgressStore((s) => s.load);

  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const isToday = selectedDateStr === todayStr;

  const getRecordForDate = useCallback((classId: string, period: number, dateStr: string) => {
    return records.find(
      (r) => r.date === dateStr && r.classId === classId && r.period === period,
    ) ?? null;
  }, [records]);

  useEffect(() => {
    void loadSettings();
    void loadStudents();
    void loadTeachingClasses();
    void loadAttendance();
    void loadRecords();
    void loadProgress();
    void seatingRepository.getSeating().then((data) => {
      setSeatingData(data);
    });
  }, [loadSettings, loadStudents, loadTeachingClasses, loadAttendance, loadRecords, loadProgress]);

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
      studentId: s.id,
      classId: settings.className || 'homeroom',
      period: 0,
      type: 'homeroom',
      date: selectedDateStr,
    });
  }, [students, settings.className, selectedDateStr]);

  // 수업반 학생을 바텀시트 형식으로 변환
  const openTeachingStudentSheet = useCallback((student: TeachingClassStudent, classId: string) => {
    if (student.isVacant) return;
    setSheetStudent({
      number: student.number,
      name: student.name,
      grade: student.grade,
      classNum: student.classNum,
      sKey: studentKey(student),
      studentId: studentKey(student),
      classId,
      period: 0,
      type: 'class',
      date: selectedDateStr,
    });
  }, [selectedDateStr]);

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <header className="flex flex-col gap-0 glass-header shrink-0">
        {/* 상단 행: 제목 + 뷰 토글 */}
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="text-sp-text font-bold text-base">
            {selectedClass === 'homeroom'
              ? homeroomName
              : selectedTeachingClass?.name ?? '수업반'}
          </h2>

          {/* 담임반일 때만 뷰 토글 표시 */}
          {selectedClass === 'homeroom' && (
            <div className="flex items-center gap-1 bg-black/5 dark:bg-white/5 rounded-lg p-1">
              <button
                onClick={() => setViewMode('seating')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'seating'
                    ? 'bg-sp-accent text-sp-accent-fg'
                    : 'text-sp-muted hover:text-sp-text'
                }`}
              >
                좌석
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'list'
                    ? 'bg-sp-accent text-sp-accent-fg'
                    : 'text-sp-muted hover:text-sp-text'
                }`}
              >
                명단
              </button>
            </div>
          )}

          {/* 수업반일 때 뷰 토글 (명단/좌석, 좌석이 있을 때) */}
          {selectedClass !== 'homeroom' && selectedTeachingClass?.seating && (
            <div className="flex items-center gap-1 bg-black/5 dark:bg-white/5 rounded-lg p-1">
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'list'
                    ? 'bg-sp-accent text-sp-accent-fg'
                    : 'text-sp-muted hover:text-sp-text'
                }`}
              >
                명단
              </button>
              <button
                onClick={() => setViewMode('seating')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'seating'
                    ? 'bg-sp-accent text-sp-accent-fg'
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
                  : 'glass-card border-transparent text-sp-muted hover:text-sp-text'
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
                    : 'glass-card border-transparent text-sp-muted hover:text-sp-text'
                }`}
              >
                {tc.name}
              </button>
            ))}
          </div>
        )}

        {/* 날짜 선택기 */}
        <div className="flex items-center justify-between px-4 pb-3 gap-2">
          <button
            onClick={() => setSelectedDate((d) => addDays(d, -1))}
            className="p-1 rounded-lg text-sp-muted hover:text-sp-text transition-colors active:bg-sp-surface"
          >
            <span className="material-symbols-outlined text-xl">chevron_left</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="text-sp-text text-sm font-medium">
              {format(selectedDate, 'M월 d일 (EEEE)', { locale: ko })}
            </span>
            {!isToday && (
              <button
                onClick={() => setSelectedDate(new Date())}
                className="px-2 py-0.5 rounded-full bg-sp-accent text-sp-accent-fg text-xs font-medium"
              >
                오늘로 가기
              </button>
            )}
          </div>

          <button
            onClick={() => setSelectedDate((d) => addDays(d, 1))}
            className="p-1 rounded-lg text-sp-muted hover:text-sp-text transition-colors active:bg-sp-surface"
          >
            <span className="material-symbols-outlined text-xl">chevron_right</span>
          </button>
        </div>
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
              dateStr={selectedDateStr}
              getRecordForDate={getRecordForDate}
            />
          ) : (
            <HomeroomListView
              students={sortedStudents}
              onStudentTap={openHomeroomStudentSheet}
              dateStr={selectedDateStr}
              getRecordForDate={getRecordForDate}
            />
          )
        ) : selectedTeachingClass ? (
          viewMode === 'seating' && selectedTeachingClass.seating ? (
            <TeachingSeatingView
              teachingClass={selectedTeachingClass}
              onStudentTap={(s) => openTeachingStudentSheet(s, selectedTeachingClass.id)}
              dateStr={selectedDateStr}
              getRecordForDate={getRecordForDate}
            />
          ) : (
            <TeachingListView
              teachingClass={selectedTeachingClass}
              onStudentTap={(s) => openTeachingStudentSheet(s, selectedTeachingClass.id)}
              dateStr={selectedDateStr}
              getRecordForDate={getRecordForDate}
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
          getRecordForDate={getRecordForDate}
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
  dateStr: string;
  getRecordForDate: (classId: string, period: number, dateStr: string) => import('@domain/entities/Attendance').AttendanceRecord | null;
}

function SeatingView({ seatingData, studentMap, onStudentTap, dateStr, getRecordForDate }: SeatingViewProps) {
  const seatingDefaultView = useSettingsStore((s) => s.settings.seatingDefaultView);
  const [isTeacherView, setIsTeacherView] = useState(seatingDefaultView === 'teacher');
  const settings = useMobileSettingsStore((s) => s.settings);
  const record = getRecordForDate(settings.className || 'homeroom', 0, dateStr);

  const getStudentStatus = (studentNumber: number | undefined): AttendanceStatus | null => {
    if (!record || studentNumber === undefined) return null;
    const found = record.students.find((sa) => sa.number === studentNumber);
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
                      <span className="text-sp-muted text-tiny leading-none">{student.number}</span>
                    )}
                    <span className="font-medium">{student?.name.charAt(0) ?? '?'}</span>
                  </>
                ) : hasStudent && isVacant ? (
                  <span className="text-caption">결번</span>
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
  dateStr: string;
  getRecordForDate: (classId: string, period: number, dateStr: string) => import('@domain/entities/Attendance').AttendanceRecord | null;
}

function TeachingSeatingView({ teachingClass, onStudentTap, dateStr, getRecordForDate }: TeachingSeatingViewProps) {
  const seatingDefaultView = useSettingsStore((s) => s.settings.seatingDefaultView);
  const [isTeacherView, setIsTeacherView] = useState(seatingDefaultView === 'teacher');
  const record = getRecordForDate(teachingClass.id, 0, dateStr);

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
    if (!record || !student) return null;
    const sKey = studentKey(student);
    const found = record.students.find((sa) => {
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
                      <span className="text-sp-muted text-micro leading-none">
                        {student.grade}-{student.classNum}
                      </span>
                    ) : (
                      <span className="text-sp-muted text-tiny leading-none">{student?.number}</span>
                    )}
                    <span className="font-medium">{student?.name.charAt(0) ?? '?'}</span>
                  </>
                ) : hasStudent && isVacant ? (
                  <span className="text-caption">결번</span>
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
  dateStr: string;
  getRecordForDate: (classId: string, period: number, dateStr: string) => import('@domain/entities/Attendance').AttendanceRecord | null;
}

function HomeroomListView({ students, onStudentTap, dateStr, getRecordForDate }: HomeroomListViewProps) {
  const settings = useMobileSettingsStore((s) => s.settings);
  const record = getRecordForDate(settings.className || 'homeroom', 0, dateStr);

  const getStudentStatus = (studentNumber: number | undefined): AttendanceStatus | null => {
    if (!record || studentNumber === undefined) return null;
    const found = record.students.find((sa) => sa.number === studentNumber);
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
                <span className="material-symbols-outlined text-sp-muted text-icon-md">
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
  dateStr: string;
  getRecordForDate: (classId: string, period: number, dateStr: string) => import('@domain/entities/Attendance').AttendanceRecord | null;
}

function TeachingListView({ teachingClass, onStudentTap, dateStr, getRecordForDate }: TeachingListViewProps) {
  const record = getRecordForDate(teachingClass.id, 0, dateStr);

  const getStudentStatus = (student: TeachingClassStudent): AttendanceStatus | null => {
    if (!record) return null;
    const sKey = studentKey(student);
    const found = record.students.find((sa) => {
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
                <span className="material-symbols-outlined text-sp-muted text-icon-md">
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
  sKey: string;
  studentId: string;
  classId: string;
  period: number;
  type: 'homeroom' | 'class';
  date: string;
}

interface StudentQuickActionSheetProps {
  info: SheetStudentInfo;
  onClose: () => void;
  getRecordForDate: (classId: string, period: number, dateStr: string) => import('@domain/entities/Attendance').AttendanceRecord | null;
}

type SheetSubTab = 'attendance' | 'records';

function StudentQuickActionSheet({ info, onClose, getRecordForDate }: StudentQuickActionSheetProps) {
  const [subTab, setSubTab] = useState<SheetSubTab>('attendance');

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
      <div className="relative w-full glass-card rounded-t-2xl pb-safe pt-1">
        {/* 핸들 바 */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-sp-border" />
        </div>

        {/* 학생 정보 */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-sp-border">
          <div className="w-12 h-12 rounded-full bg-sp-accent/15 flex items-center justify-center shrink-0">
            <span className="text-blue-500 font-bold text-lg">{info.name.charAt(0)}</span>
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
              {info.date} · {info.type === 'homeroom' ? '담임 출결' : '수업 출결'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-sp-card transition-colors"
          >
            <span className="material-symbols-outlined text-sp-muted">close</span>
          </button>
        </div>

        {/* 서브탭 pill */}
        <div className="flex gap-1 mx-5 my-3 p-1 bg-white/5 backdrop-blur-sm rounded-xl border border-white/10">
          <button
            onClick={() => setSubTab('attendance')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
              subTab === 'attendance'
                ? 'bg-sp-accent text-sp-accent-fg shadow-sm'
                : 'text-sp-muted'
            }`}
          >
            출결
          </button>
          <button
            onClick={() => setSubTab('records')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
              subTab === 'records'
                ? 'bg-sp-accent text-sp-accent-fg shadow-sm'
                : 'text-sp-muted'
            }`}
          >
            기록
          </button>
        </div>

        {/* 서브탭 내용 */}
        {subTab === 'attendance' ? (
          <AttendanceSubTab info={info} getRecordForDate={getRecordForDate} onClose={onClose} />
        ) : (
          <RecordsSubTab studentId={info.studentId} studentName={info.name} />
        )}
      </div>
    </div>
  );
}

// ============================================================
// 출결 서브탭 (기존 출결 UI 추출)
// ============================================================

function AttendanceSubTab({
  info,
  getRecordForDate,
  onClose,
}: {
  info: SheetStudentInfo;
  getRecordForDate: (classId: string, period: number, dateStr: string) => import('@domain/entities/Attendance').AttendanceRecord | null;
  onClose: () => void;
}) {
  const saveRecord = useMobileAttendanceStore((s) => s.saveRecord);
  const records = useMobileAttendanceStore((s) => s.records);

  const { currentStatus, currentReason, currentMemo } = React.useMemo((): {
    currentStatus: AttendanceStatus;
    currentReason: AttendanceReason | undefined;
    currentMemo: string;
  } => {
    const record = getRecordForDate(info.classId, info.period, info.date);
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
  }, [getRecordForDate, info.classId, info.period, info.date, info.sKey, records]);

  const [reason, setReason] = useState<AttendanceReason | undefined>(currentReason);
  const [memo, setMemo] = useState(currentMemo);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setReason(currentReason);
  }, [currentReason]);

  useEffect(() => {
    setMemo(currentMemo);
  }, [currentMemo]);

  const handleStatusChange = useCallback(async (newStatus: AttendanceStatus) => {
    setSaving(true);
    const existing = getRecordForDate(info.classId, info.period, info.date);
    const otherStudents = (existing?.students ?? []).filter((sa) => {
      const saKey = sa.grade != null && sa.classNum != null
        ? `${sa.grade}-${sa.classNum}-${sa.number}`
        : String(sa.number);
      return saKey !== info.sKey;
    });
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
      date: info.date,
      period: info.period,
      students: [...otherStudents, thisEntry],
    });
    if (info.type === 'homeroom') {
      const { bridgeAttendanceRecord } = useMobileStudentRecordsStore.getState();
      await bridgeAttendanceRecord({
        studentId: info.studentId,
        date: info.date,
        status: newStatus,
        reason: newStatus !== 'present' ? (reason || undefined) : undefined,
        memo: newStatus !== 'present' ? (memo || undefined) : undefined,
      });
    }
    setSaving(false);
  }, [getRecordForDate, info, saveRecord, reason, memo]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    const existing = getRecordForDate(info.classId, info.period, info.date);
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
      date: info.date,
      period: info.period,
      students: [...otherStudents, thisEntry],
    });
    if (info.type === 'homeroom') {
      const { bridgeAttendanceRecord } = useMobileStudentRecordsStore.getState();
      await bridgeAttendanceRecord({
        studentId: info.studentId,
        date: info.date,
        status: currentStatus,
        reason: currentStatus !== 'present' ? (reason || undefined) : undefined,
        memo: currentStatus !== 'present' ? (memo || undefined) : undefined,
      });
    }
    setSaving(false);
    onClose();
  }, [getRecordForDate, info, saveRecord, onClose, currentStatus, reason, memo]);

  return (
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
            className="w-full px-3 py-1.5 glass-input text-xs"
          />
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="w-full mt-4 py-3 bg-sp-accent text-sp-accent-fg text-sm font-bold rounded-xl disabled:opacity-50 transition-all active:scale-[0.98]"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 기록 서브탭 (Phase A 신규)
// ============================================================

const CATEGORY_COLORS: Record<string, string> = {
  red: 'bg-red-400',
  blue: 'bg-blue-400',
  green: 'bg-green-400',
  yellow: 'bg-yellow-400',
  purple: 'bg-purple-400',
  gray: 'bg-gray-400',
};

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function RecordsSubTab({ studentId }: { studentId: string; studentName: string }) {
  const loadRecords = useMobileStudentRecordsStore((s) => s.load);
  const getRecords = useMobileStudentRecordsStore((s) => s.getRecordsByStudentId);
  const addRecord = useMobileStudentRecordsStore((s) => s.addRecord);
  const categories = useMobileStudentRecordsStore((s) => s.categories);

  const [showForm, setShowForm] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { void loadRecords(); }, [loadRecords]);

  // 출결(attendance) 카테고리 제외
  const mobileCategories = categories.filter((c) => c.id !== 'attendance');
  const selectedCategory = mobileCategories.find((c) => c.id === selectedCategoryId);
  const recentRecords = getRecords(studentId, 3);

  const handleSubmit = async () => {
    if (!selectedCategoryId || !content.trim()) return;
    setSaving(true);
    const now = new Date();
    const record: StudentRecord = {
      id: generateUUID(),
      studentId,
      category: selectedCategoryId,
      subcategory: selectedSubcategory,
      content: content.trim(),
      date: todayString(),
      createdAt: now.toISOString(),
    };
    await addRecord(record);
    setContent('');
    setSelectedCategoryId('');
    setSelectedSubcategory('');
    setShowForm(false);
    setSaving(false);
  };

  return (
    <div className="px-5 py-4 space-y-4 max-h-[50vh] overflow-y-auto">
      {/* 최근 기록 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sp-muted text-xs font-medium">최근 기록</p>
          <button
            onClick={() => setShowForm(!showForm)}
            className="text-sp-accent text-xs font-medium"
          >
            {showForm ? '취소' : '+ 새 기록'}
          </button>
        </div>

        {recentRecords.length === 0 ? (
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4 text-center">
            <p className="text-sp-muted text-sm">기록이 없습니다</p>
          </div>
        ) : (
          recentRecords.map((rec) => {
            const cat = categories.find((c) => c.id === rec.category);
            const colorClass = CATEGORY_COLORS[cat?.color ?? 'gray'] ?? 'bg-gray-400';
            return (
              <div key={rec.id} className="bg-white/5 backdrop-blur-sm border border-white/10 flex rounded-xl overflow-hidden mb-2">
                <div className={`w-1 shrink-0 ${colorClass}`} />
                <div className="flex-1 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-sp-muted">{rec.date}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-white/5 text-sp-muted">
                      {cat?.name.split('(')[0]?.trim() ?? rec.category}
                    </span>
                    {rec.subcategory && (
                      <span className="text-xs text-sp-muted/70">{rec.subcategory}</span>
                    )}
                  </div>
                  <p className="text-sp-text text-sm">{rec.content}</p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 기록 추가 폼 */}
      {showForm && (
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4 space-y-3">
          {/* 카테고리 선택 */}
          <div>
            <p className="text-sp-muted text-xs mb-2">카테고리</p>
            <div className="flex flex-wrap gap-1.5">
              {mobileCategories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => { setSelectedCategoryId(cat.id); setSelectedSubcategory(''); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors min-h-[36px] ${
                    selectedCategoryId === cat.id
                      ? 'bg-sp-accent/15 border-sp-accent/40 text-sp-accent'
                      : 'border-sp-border text-sp-muted'
                  }`}
                >
                  {cat.name.split('(')[0]?.trim()}
                </button>
              ))}
            </div>
          </div>

          {/* 서브카테고리 */}
          {selectedCategory && selectedCategory.subcategories.length > 0 && (
            <div>
              <p className="text-sp-muted text-xs mb-2">세부</p>
              <div className="flex flex-wrap gap-1.5">
                {selectedCategory.subcategories.map((sub) => (
                  <button
                    key={sub}
                    onClick={() => setSelectedSubcategory(sub === selectedSubcategory ? '' : sub)}
                    className={`px-2.5 py-1 rounded-md text-xs border transition-colors min-h-[32px] ${
                      selectedSubcategory === sub
                        ? 'bg-sp-accent/15 border-sp-accent/40 text-sp-accent'
                        : 'border-sp-border text-sp-muted'
                    }`}
                  >
                    {sub}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 기록 내용 */}
          <textarea
            placeholder="기록 내용을 입력하세요"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 bg-sp-surface border border-sp-border rounded-xl text-sp-text text-sm placeholder:text-sp-muted/50 resize-none"
          />

          {/* 저장 버튼 */}
          <button
            onClick={() => void handleSubmit()}
            disabled={!selectedCategoryId || !content.trim() || saving}
            className="w-full py-3 bg-sp-accent text-sp-accent-fg text-sm font-bold rounded-xl disabled:opacity-50 transition-colors active:bg-sp-accent/80"
          >
            {saving ? '저장 중...' : '기록 저장'}
          </button>
        </div>
      )}
    </div>
  );
}
