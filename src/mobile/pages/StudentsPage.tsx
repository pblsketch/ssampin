import React, { useState, useEffect, useCallback } from 'react';
import { generateUUID } from '@infrastructure/utils/uuid';
import { format, addDays } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { SeatingData } from '@domain/entities/Seating';
import type { TeachingClassStudent, TeachingClass } from '@domain/entities/TeachingClass';
import type { AttendanceStatus } from '@domain/entities/Attendance';
import { studentKey } from '@domain/entities/TeachingClass';
import { useMobileSettingsStore } from '@mobile/stores/useMobileSettingsStore';
import { useMobileViewPrefsStore } from '@mobile/stores/useMobileViewPrefsStore';
import { useMobileStudentStore } from '@mobile/stores/useMobileStudentStore';
import { useMobileTeachingClassStore } from '@mobile/stores/useMobileTeachingClassStore';
import { useMobileAttendanceStore } from '@mobile/stores/useMobileAttendanceStore';
import { seatingRepository } from '@mobile/di/container';
import { useMobileStudentRecordsStore } from '@mobile/stores/useMobileStudentRecordsStore';
import { useMobileProgressStore } from '@mobile/stores/useMobileProgressStore';
import { SwipeUndoToast } from '@mobile/components/SwipeRow/SwipeUndoToast';
import { useSwipeUndoStore } from '@mobile/stores/useMobileSwipeUndoStore';
import { PraiseMemoSheet } from '@mobile/components/Students/PraiseMemoSheet';
import { SwipeHintBanner } from '@mobile/components/Students/SwipeHintBanner';
import { SeatingView } from '@mobile/pages/students/SeatingView';
import { TeachingSeatingView } from '@mobile/pages/students/TeachingSeatingView';
import { HomeroomListView } from '@mobile/pages/students/HomeroomListView';
import { TeachingListView } from '@mobile/pages/students/TeachingListView';
import { StudentQuickActionSheet } from '@mobile/pages/students/StudentQuickActionSheet';
import { HomeroomRecordsOverviewPage } from '@mobile/pages/HomeroomRecordsOverviewPage';
import type { HomeroomStudent, SheetStudentInfo } from '@mobile/pages/students/shared';

type ViewMode = 'seating' | 'list';
type ClassSelection = 'homeroom' | string; // 'homeroom' 또는 teachingClass.id

/** 명단 스와이프 빠른 출결로 기록 가능한 상태와 토스트 라벨 */
type QuickStatus = 'late' | 'absent' | 'earlyLeave';
const QUICK_LABEL: Record<QuickStatus, string> = {
  late: '지각',
  absent: '결석',
  earlyLeave: '조퇴',
};

// ============================================================
// 메인 페이지
// ============================================================

export function StudentsPage() {
  // 좌석/명단 보기: 반별 저장 선호를 초기값으로 (기기별 localStorage 영속)
  const [viewMode, setViewMode] = useState<ViewMode>(
    () => useMobileViewPrefsStore.getState().getStudentsViewMode('homeroom') ?? 'seating',
  );
  const [selectedClass, setSelectedClass] = useState<ClassSelection>('homeroom');
  const setStudentsViewMode = useMobileViewPrefsStore((s) => s.setStudentsViewMode);
  const [seatingData, setSeatingData] = useState<SeatingData | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  // 반 전체 기록 모아보기(Feature B) — 담임반 선택 시 헤더 아이콘으로 진입하는 풀스크린 전환
  const [showRecordsOverview, setShowRecordsOverview] = useState(false);

  // 바텀시트 상태
  const [sheetStudent, setSheetStudent] = useState<SheetStudentInfo | null>(null);
  // 스와이프 → 칭찬 메모 입력 시트 (담임/수업 공용 — 이름·번호·저장 콜백만 받는다)
  const [praiseTarget, setPraiseTarget] = useState<{
    name: string;
    number?: number;
    onSave: (memo: string) => Promise<void>;
  } | null>(null);

  const settings = useMobileSettingsStore((s) => s.settings);
  const loadSettings = useMobileSettingsStore((s) => s.load);

  const saveAttendanceRecord = useMobileAttendanceStore((s) => s.saveRecord);
  const addStudentRecord = useMobileStudentRecordsStore((s) => s.addRecord);
  const deleteStudentRecord = useMobileStudentRecordsStore((s) => s.deleteRecord);

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

  const getRecordForDate = useCallback(
    (classId: string, period: number, dateStr: string) => {
      return (
        records.find((r) => r.date === dateStr && r.classId === classId && r.period === period) ??
        null
      );
    },
    [records],
  );

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

  // 반 전환 시 해당 반의 저장된 보기 선호를 복원한다 (없으면 담임=좌석, 수업반=명단).
  // 수업반은 좌석 데이터가 없으면 저장 선호가 'seating'이어도 명단으로 폴백.
  useEffect(() => {
    const saved = useMobileViewPrefsStore.getState().getStudentsViewMode(selectedClass);
    if (selectedClass === 'homeroom') {
      setViewMode(saved ?? 'seating');
    } else {
      const hasSeating = teachingClasses.find((c) => c.id === selectedClass)?.seating != null;
      setViewMode(saved === 'seating' && hasSeating ? 'seating' : 'list');
    }
  }, [selectedClass, teachingClasses]);

  // 보기 토글: 화면 상태 변경 + 반별 선호 영속 저장
  const changeViewMode = useCallback(
    (mode: ViewMode) => {
      setViewMode(mode);
      setStudentsViewMode(selectedClass, mode);
    },
    [selectedClass, setStudentsViewMode],
  );

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
  const openHomeroomStudentSheet = useCallback(
    (studentId: string) => {
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
    },
    [students, settings.className, selectedDateStr],
  );

  // 수업반 학생을 바텀시트 형식으로 변환
  const openTeachingStudentSheet = useCallback(
    (student: TeachingClassStudent, classId: string) => {
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
    },
    [selectedDateStr],
  );

  // 스와이프 빠른 출결: 담임반 출석부(period 0) + 학생기록 브리지 둘 다 갱신.
  // status==='present' 는 "되돌리기"용 — 브리지 기록을 지운다(bridgeAttendanceRecord 가 처리).
  const writeHomeroomStatus = useCallback(
    async (student: HomeroomStudent, status: AttendanceStatus) => {
      const classId = settings.className || 'homeroom';
      const num = student.studentNumber ?? 0;
      // 데이터 유실 방지: 로드 미완료 시 빈 스냅샷으로 others 를 만들면 나머지 학생이 지워진다.
      // 로드를 보장하고 최신 스냅샷에서 기존 기록을 직접 읽는다.
      const attStore = useMobileAttendanceStore.getState();
      if (!attStore.loaded) await attStore.load();
      const existing =
        useMobileAttendanceStore
          .getState()
          .records.find(
            (r) => r.date === selectedDateStr && r.classId === classId && r.period === 0,
          ) ?? null;
      const others = (existing?.students ?? []).filter((sa) => sa.number !== num);
      await saveAttendanceRecord({
        classId,
        date: selectedDateStr,
        period: 0,
        students: [...others, { number: num, status }],
      });
      const { bridgeAttendanceRecord } = useMobileStudentRecordsStore.getState();
      await bridgeAttendanceRecord({ studentId: student.id, date: selectedDateStr, status });
    },
    [settings.className, selectedDateStr, saveAttendanceRecord],
  );

  const handleQuickRecord = useCallback(
    async (student: HomeroomStudent, status: QuickStatus) => {
      // 번호 없는 학생은 출결이 번호로 저장돼 서로 뭉개지므로 기록을 막고 안내한다.
      if (student.studentNumber == null || student.studentNumber <= 0) {
        useSwipeUndoStore
          .getState()
          .show('번호가 없어 출결을 기록할 수 없어요. 명렬표에서 번호를 지정해주세요.');
        return;
      }
      await writeHomeroomStatus(student, status);
      useSwipeUndoStore
        .getState()
        .show(`${student.name} · ${QUICK_LABEL[status]}`, () =>
          writeHomeroomStatus(student, 'present'),
        );
    },
    [writeHomeroomStatus],
  );

  // 수업반 스와이프 빠른 출결: 수업반 출석부(period 0)만 갱신 (담임 브리지는 수업반에 없음).
  const writeClassStatus = useCallback(
    async (tc: TeachingClass, student: TeachingClassStudent, status: AttendanceStatus) => {
      const sKey = studentKey(student);
      // 데이터 유실 방지: 로드를 보장하고 최신 스냅샷에서 기존 기록을 직접 읽는다.
      const attStore = useMobileAttendanceStore.getState();
      if (!attStore.loaded) await attStore.load();
      const existing =
        useMobileAttendanceStore
          .getState()
          .records.find(
            (r) => r.date === selectedDateStr && r.classId === tc.id && r.period === 0,
          ) ?? null;
      const others = (existing?.students ?? []).filter((sa) => {
        const saKey =
          sa.grade != null && sa.classNum != null
            ? `${sa.grade}-${sa.classNum}-${sa.number}`
            : String(sa.number);
        return saKey !== sKey;
      });
      const entry = {
        number: student.number,
        status,
        ...(student.grade != null ? { grade: student.grade } : {}),
        ...(student.classNum != null ? { classNum: student.classNum } : {}),
      };
      await saveAttendanceRecord({
        classId: tc.id,
        date: selectedDateStr,
        period: 0,
        students: [...others, entry],
      });
    },
    [selectedDateStr, saveAttendanceRecord],
  );

  const handleClassQuickRecord = useCallback(
    async (tc: TeachingClass, student: TeachingClassStudent, status: QuickStatus) => {
      // 번호 없는 학생은 출결이 번호로 저장돼 서로 뭉개지므로 기록을 막고 안내한다.
      if (student.number == null || student.number <= 0) {
        useSwipeUndoStore
          .getState()
          .show('번호가 없어 출결을 기록할 수 없어요. 명렬표에서 번호를 지정해주세요.');
        return;
      }
      await writeClassStatus(tc, student, status);
      useSwipeUndoStore
        .getState()
        .show(`${student.name} · ${QUICK_LABEL[status]}`, () =>
          writeClassStatus(tc, student, 'present'),
        );
    },
    [writeClassStatus],
  );

  // 칭찬 메모 한 줄 → 담임 기록(life/칭찬). 담임은 Student.id, 수업반은 studentKey 로 키잉(기존 기록 탭과 동일).
  const addPraiseRecord = useCallback(
    async (studentId: string, name: string, memo: string) => {
      const id = generateUUID();
      await addStudentRecord({
        id,
        studentId,
        category: 'life',
        subcategory: '칭찬',
        content: memo,
        date: selectedDateStr,
        createdAt: new Date().toISOString(),
        // Q2: 칭찬을 태그로도 기록(통계 영구 이중기준 + 표시 tags 정합). subcategory='칭찬'은 호환 유지.
        tags: ['칭찬'],
      });
      useSwipeUndoStore
        .getState()
        .show(`${name} · 칭찬 메모 저장됨`, () => deleteStudentRecord(id));
    },
    [addStudentRecord, deleteStudentRecord, selectedDateStr],
  );

  // 반 전체 기록 모아보기 — 담임반 헤더 아이콘 진입, 하단 탭바는 유지된 채 이 슬롯만 전체화면 전환
  if (showRecordsOverview) {
    return <HomeroomRecordsOverviewPage onClose={() => setShowRecordsOverview(false)} />;
  }

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <header className="flex flex-col gap-0 glass-header shrink-0">
        {/* 상단 행: 제목 + 뷰 토글 */}
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="text-sp-text font-bold text-base">
            {selectedClass === 'homeroom'
              ? homeroomName
              : (selectedTeachingClass?.name ?? '수업반')}
          </h2>

          <div className="flex items-center gap-2">
            {/* 반 전체 기록 보기 (담임반 선택 시만) */}
            {selectedClass === 'homeroom' && (
              <button
                onClick={() => setShowRecordsOverview(true)}
                className="flex items-center justify-center rounded-lg text-sp-muted hover:text-sp-text active:bg-black/5 dark:active:bg-white/10"
                style={{ minWidth: 44, minHeight: 44 }}
                aria-label="반 전체 기록 보기"
              >
                <span className="material-symbols-outlined text-xl">history_edu</span>
              </button>
            )}

            {/* 담임반일 때만 뷰 토글 표시 */}
            {selectedClass === 'homeroom' && (
              <div className="flex items-center gap-1 bg-black/5 dark:bg-white/5 rounded-lg p-1">
                <button
                  onClick={() => changeViewMode('seating')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'seating'
                      ? 'bg-sp-accent text-sp-accent-fg'
                      : 'text-sp-muted hover:text-sp-text'
                  }`}
                >
                  좌석
                </button>
                <button
                  onClick={() => changeViewMode('list')}
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
                  onClick={() => changeViewMode('list')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'list'
                      ? 'bg-sp-accent text-sp-accent-fg'
                      : 'text-sp-muted hover:text-sp-text'
                  }`}
                >
                  명단
                </button>
                <button
                  onClick={() => changeViewMode('seating')}
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
        </div>

        {/* 학급 선택 탭 (담임반 + 수업반들)
            data-no-tab-swipe: 가로 스크롤 영역이므로 글로벌 탭 스와이프 무력화 */}
        {teachingClasses.length > 0 && (
          <div data-no-tab-swipe className="flex overflow-x-auto gap-2 px-4 pb-3 no-scrollbar">
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
            <>
              <SwipeHintBanner />
              <HomeroomListView
                students={sortedStudents}
                onStudentTap={openHomeroomStudentSheet}
                onPraise={(student) =>
                  setPraiseTarget({
                    name: student.name,
                    number: student.studentNumber,
                    onSave: (memo) => addPraiseRecord(student.id, student.name, memo),
                  })
                }
                onQuickRecord={handleQuickRecord}
                dateStr={selectedDateStr}
                getRecordForDate={getRecordForDate}
              />
            </>
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
            <>
              <SwipeHintBanner />
              <TeachingListView
                teachingClass={selectedTeachingClass}
                onStudentTap={(s) => openTeachingStudentSheet(s, selectedTeachingClass.id)}
                onPraise={(s) =>
                  setPraiseTarget({
                    name: s.name,
                    number: s.number,
                    onSave: (memo) => addPraiseRecord(studentKey(s), s.name, memo),
                  })
                }
                onQuickRecord={(s, st) => handleClassQuickRecord(selectedTeachingClass, s, st)}
                dateStr={selectedDateStr}
                getRecordForDate={getRecordForDate}
              />
            </>
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

      {/* 스와이프 → 칭찬 메모 입력 시트 (담임/수업 공용) */}
      {praiseTarget && (
        <PraiseMemoSheet
          studentName={praiseTarget.name}
          studentNumber={praiseTarget.number}
          onSave={praiseTarget.onSave}
          onClose={() => setPraiseTarget(null)}
        />
      )}

      {/* 스와이프 빠른 기록 "되돌리기" 토스트 */}
      <SwipeUndoToast />
    </div>
  );
}
