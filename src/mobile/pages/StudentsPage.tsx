import React, { useState, useEffect, useCallback } from 'react';
import { generateUUID } from '@infrastructure/utils/uuid';
import { format, addDays } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { SeatingData } from '@domain/entities/Seating';
import type { TeachingClassStudent, TeachingClass } from '@domain/entities/TeachingClass';
import type { AttendanceStatus } from '@domain/entities/Attendance';
import { findAttendanceRecordForClass } from '@domain/entities/Attendance';
import { studentKey } from '@domain/entities/TeachingClass';
import { useMobileSettingsStore } from '@mobile/stores/useMobileSettingsStore';
import { useMobileViewPrefsStore } from '@mobile/stores/useMobileViewPrefsStore';
import { useMobileStudentStore } from '@mobile/stores/useMobileStudentStore';
import { useMobileTeachingClassStore } from '@mobile/stores/useMobileTeachingClassStore';
import { useMobileAttendanceStore } from '@mobile/stores/useMobileAttendanceStore';
import { seatingRepository } from '@mobile/di/container';
import { useMobileStudentRecordsStore } from '@mobile/stores/useMobileStudentRecordsStore';
import { useMobileProgressStore } from '@mobile/stores/useMobileProgressStore';
import { useSnackbarStore } from '@mobile/stores/useMobileSnackbarStore';
import { PraiseMemoSheet } from '@mobile/components/Students/PraiseMemoSheet';
import { BottomSheet } from '@mobile/components/common/BottomSheet';
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
      // 그룹 학급(같은 교실의 여러 과목)은 다른 과목 명의로 저장된 공유 레코드를
      // 그룹 키로 찾아야 한다 — classId 단독 조회는 부분 저장 시 학생 유실(QA2 B2).
      const cls = teachingClasses.find((c) => c.id === classId);
      return findAttendanceRecordForClass(records, cls ?? { id: classId }, dateStr, period);
    },
    [records, teachingClasses],
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

  /** 헤더 제목에 쓰는 현재 반 이름 */
  const currentClassName =
    selectedClass === 'homeroom' ? homeroomName : (selectedTeachingClass?.name ?? '수업반');

  /** 좌석 보기가 가능한 경우에만 전환 아이콘을 낸다(수업반은 좌석표가 없을 수 있다) */
  const canToggleView = selectedClass === 'homeroom' || selectedTeachingClass?.seating != null;

  /** 반 고르기 바텀시트 */
  const [classPickerOpen, setClassPickerOpen] = useState(false);

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
      // 담임 반이 그룹 소속(초등)이면 그룹 키의 공유 레코드를 찾아야 한다(QA2 B2).
      const homeroomCls = useMobileTeachingClassStore
        .getState()
        .classes.find((c) => c.id === classId);
      const existing = findAttendanceRecordForClass(
        useMobileAttendanceStore.getState().records,
        homeroomCls ?? { id: classId },
        selectedDateStr,
        0,
      );
      const others = (existing?.students ?? []).filter((sa) => sa.number !== num);
      await saveAttendanceRecord({
        classId,
        date: selectedDateStr,
        period: 0,
        students: [...others, { number: num, status }],
      });
      const { bridgeAttendanceRecord } = useMobileStudentRecordsStore.getState();
      await bridgeAttendanceRecord({
        studentId: student.id,
        date: selectedDateStr,
        status,
        classId,
      });
    },
    [settings.className, selectedDateStr, saveAttendanceRecord],
  );

  const handleQuickRecord = useCallback(
    async (student: HomeroomStudent, status: QuickStatus) => {
      // 번호 없는 학생은 출결이 번호로 저장돼 서로 뭉개지므로 기록을 막고 안내한다.
      if (student.studentNumber == null || student.studentNumber <= 0) {
        useSnackbarStore
          .getState()
          .show('번호가 없어 출결을 기록할 수 없어요. 명렬표에서 번호를 지정해주세요.');
        return;
      }
      await writeHomeroomStatus(student, status);
      useSnackbarStore
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
      // 같은 그룹의 다른 과목 반 명의로 저장된 공유 레코드를 놓치면 아래 저장이
      // 그 레코드를 학생 한 명짜리로 교체해 기존 출결이 유실된다(QA2 B2).
      const existing = findAttendanceRecordForClass(
        useMobileAttendanceStore.getState().records,
        tc,
        selectedDateStr,
        0,
      );
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
        useSnackbarStore
          .getState()
          .show('번호가 없어 출결을 기록할 수 없어요. 명렬표에서 번호를 지정해주세요.');
        return;
      }
      await writeClassStatus(tc, student, status);
      useSnackbarStore
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
      useSnackbarStore.getState().show(`${name} · 칭찬 메모 저장됨`, () => deleteStudentRecord(id));
    },
    [addStudentRecord, deleteStudentRecord, selectedDateStr],
  );

  // 반 전체 기록 모아보기 — 담임반 헤더 아이콘 진입, 하단 탭바는 유지된 채 이 슬롯만 전체화면 전환
  if (showRecordsOverview) {
    return <HomeroomRecordsOverviewPage onClose={() => setShowRecordsOverview(false)} />;
  }

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 — 한 줄.
          예전에는 세 줄이었다(제목+토글 / 반 선택 가로탭 / 날짜 이동바). 첫 학생이
          보이기까지 콘텐츠 위로 약 140px 을 지나야 했다.
          판단 기준은 "스크롤하는 내내 진짜로 계속 보여야 하는가" 였다.
            · 반 이름 — 예. 모르면 다른 반에 기록이 들어간다
            · 날짜 — 예. 어느 날 기록인지가 데이터 정합성의 핵심
            · 보기 전환(좌석/명단) — 한 번 정하면 그 화면 내내 유지. 아이콘 하나로 축약
            · 기록 보기 — 다른 화면으로 나가는 입구. 아이콘으로 축약
          반이 여러 개면 가로 스크롤 탭 대신 눌러서 고른다. 6개를 넘으면 가로 스크롤은
          뒤쪽 반이 화면 밖으로 숨는데, 담임반 1개 + 수업반 N개라 대부분 6개를 넘는다. */}
      <header className="flex items-center gap-1.5 px-3 py-2 glass-header shrink-0">
        {/* 반 선택 — 수업반이 있을 때만 고를 수 있다 */}
        {teachingClasses.length > 0 ? (
          <button
            onClick={() => setClassPickerOpen(true)}
            aria-haspopup="dialog"
            className="flex items-center gap-0.5 min-w-0 shrink rounded-lg px-2 py-1 -ml-1 active:bg-black/5 dark:active:bg-white/10"
            style={{ minHeight: 44 }}
          >
            <span className="text-sp-text font-bold text-base truncate">{currentClassName}</span>
            <span className="material-symbols-outlined text-lg text-sp-muted shrink-0">
              expand_more
            </span>
          </button>
        ) : (
          <h2 className="text-sp-text font-bold text-base truncate min-w-0 shrink px-1">
            {currentClassName}
          </h2>
        )}

        {/* 날짜 이동 */}
        <div className="flex items-center ml-auto shrink-0">
          <button
            onClick={() => setSelectedDate((d) => addDays(d, -1))}
            aria-label="하루 전"
            className="grid place-items-center w-11 -mx-1 h-11 rounded-lg text-sp-muted active:bg-black/5 dark:active:bg-white/10"
          >
            <span className="material-symbols-outlined text-xl">chevron_left</span>
          </button>
          {/* 오늘이 아니면 날짜 자체가 "오늘로 돌아가기" 버튼이 된다.
              별도 칩을 두면 한 줄에 들어가지 않는다. */}
          {isToday ? (
            <span className="text-sp-text text-sm font-medium tabular-nums whitespace-nowrap px-0.5">
              {format(selectedDate, 'M월 d일 (EEE)', { locale: ko })}
            </span>
          ) : (
            <button
              onClick={() => setSelectedDate(new Date())}
              aria-label="오늘로 가기"
              className="text-sp-accent text-sm font-bold tabular-nums whitespace-nowrap px-0.5 underline decoration-dotted underline-offset-4"
            >
              {format(selectedDate, 'M월 d일 (EEE)', { locale: ko })}
            </button>
          )}
          <button
            onClick={() => setSelectedDate((d) => addDays(d, 1))}
            aria-label="하루 후"
            className="grid place-items-center w-11 -mx-1 h-11 rounded-lg text-sp-muted active:bg-black/5 dark:active:bg-white/10"
          >
            <span className="material-symbols-outlined text-xl">chevron_right</span>
          </button>
        </div>

        <div className="flex items-center shrink-0">
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

          {/* 보기 전환 — 2버튼 토글에서 아이콘 하나로.
              한 번 정하면 그 화면 내내 유지되는 설정이라 상시 두 칸을 쓸 이유가 없다.
              누르면 반대 보기로 바뀌고, 아이콘이 "지금 누르면 갈 곳"을 가리킨다. */}
          {canToggleView && (
            <button
              onClick={() => changeViewMode(viewMode === 'seating' ? 'list' : 'seating')}
              aria-label={viewMode === 'seating' ? '명단으로 보기' : '좌석으로 보기'}
              className="grid place-items-center rounded-lg text-sp-muted active:bg-black/5 dark:active:bg-white/10"
              style={{ minWidth: 44, minHeight: 44 }}
            >
              <span className="material-symbols-outlined text-xl">
                {viewMode === 'seating' ? 'format_list_bulleted' : 'grid_view'}
              </span>
            </button>
          )}
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

      {/* 반 고르기 — 가로 스크롤 탭을 대체한다.
          반이 몇 개든 한 번에 다 보이고, 뒤쪽 반이 화면 밖으로 숨지 않는다. */}
      {classPickerOpen && (
        <BottomSheet onClose={() => setClassPickerOpen(false)} ariaLabel="반 고르기">
          <div className="px-5 pt-1 pb-2">
            <p className="text-sp-text font-bold">반 고르기</p>
            <p className="text-sp-muted text-xs mt-0.5">
              {format(selectedDate, 'M월 d일 (EEE)', { locale: ko })} 기준
            </p>
          </div>
          <ul className="max-h-[60dvh] overflow-y-auto">
            {[{ id: 'homeroom', name: homeroomName, isHomeroom: true }, ...teachingClasses].map(
              (c) => {
                const isSelected = selectedClass === c.id;
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => {
                        setSelectedClass(c.id);
                        setClassPickerOpen(false);
                      }}
                      aria-current={isSelected ? 'true' : undefined}
                      className={`w-full flex items-center gap-3 px-5 text-left ${
                        isSelected ? 'bg-sp-subtle' : 'active:bg-sp-subtle'
                      }`}
                      style={{ minHeight: 52 }}
                    >
                      <span
                        className={`material-symbols-outlined text-xl ${
                          isSelected ? 'text-sp-accent' : 'text-sp-muted'
                        }`}
                      >
                        {isSelected ? 'radio_button_checked' : 'radio_button_unchecked'}
                      </span>
                      <span className="flex-1 min-w-0 truncate text-sp-text text-sm font-medium">
                        {c.name}
                      </span>
                      {'isHomeroom' in c && c.isHomeroom && (
                        /* sp-* 토큰에 Tailwind 투명도 수식(/12)을 붙이면 토큰이 CSS 변수라
                           알파 합성이 안 돼 배경이 조용히 사라진다. 단색 토큰을 쓴다. */
                        <span className="shrink-0 text-xs text-sp-accent px-2 py-0.5 rounded-lg bg-sp-subtle">
                          담임
                        </span>
                      )}
                    </button>
                  </li>
                );
              },
            )}
          </ul>
        </BottomSheet>
      )}
    </div>
  );
}
