/**
 * 오늘의 학생 기록 허브 — 담임 누가기록과 교과 특기사항, 출결까지 **진입만** 모아 둔 카드.
 *
 * ★기존 담임 전용 "오늘 기록" 카드를 없애지 않고 여기로 넓혔다. 위젯 id 는 그대로 `student-records`
 * 하나다(중복 카드를 만들지 않는다). 담임의 출결 조회·상담/생활 기록·미완료 후속조치는 그대로 남는다.
 *
 * ★이 카드는 저장하지 않는다. 기록은 빠른 기록 모달이, 출결은 기존 담임·수업 출결 화면이 저장한다.
 * 대시보드 전용 저장 경로를 만들면 검증된 저장 규칙을 두 벌로 만들게 된다.
 *
 * ★학생 칩에는 오늘 기록의 **종류**만 붙인다. 누적 건수·미기록 경고·순위는 넣지 않는다 —
 * 기록량으로 학생을 줄 세우지 않기로 한 결정이다.
 */
import { useEffect, useMemo, useState } from 'react';
import { useStudentRecordsStore, RECORD_COLOR_MAP } from '@adapters/stores/useStudentRecordsStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useObservationStore } from '@adapters/stores/useObservationStore';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useQuickAddStore } from '@adapters/stores/useQuickAddStore';
import { useDesktopWidgetContextStore } from '@adapters/stores/useDesktopWidgetContextStore';
import { sortByDateDesc, recordExportLabel } from '@domain/rules/studentRecordRules';
import { isStudentActive } from '@domain/rules/studentActivity';
import { filterActiveClasses } from '@domain/rules/teachingClassArchive';
import { findMatchingClass } from '@domain/rules/matchingRules';
import { getDayOfWeek, parseMinutes } from '@domain/rules/periodRules';
import { mergeOverridesIntoTeacherSchedule } from '@domain/rules/timetableRules';
import { resolvePeriodShortLabel } from '@domain/rules/periodLabel';
import { toLocalDateString } from '@shared/utils/localDate';
import {
  buildQuickRecordCandidates,
  buildTodayRecordMarks,
  candidatesForClass,
  splitTodayLessons,
  type QuickRecordCandidate,
  type TodayLesson,
} from '@domain/rules/quickStudentRecord';
import {
  HOMEROOM_ATTENDANCE_TARGET,
  classAttendanceTarget,
  quickRecordTarget,
  requestStudentRecordNavigation,
} from './studentRecordNavigation';
import { StudentRecordsEditor } from '../Homeroom/Records/StudentRecordsEditor';

function todayString(): string {
  return toLocalDateString(new Date());
}

function formatDateKR(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

const FALLBACK_COLOR = RECORD_COLOR_MAP['gray']!;

function getTagClass(color: string): string {
  const colorInfo = RECORD_COLOR_MAP[color] ?? FALLBACK_COLOR;
  return `px-1.5 py-0.5 rounded text-caption font-medium ${colorInfo.tagBg}`;
}

type WidgetTab = 'all' | 'attendance' | 'counseling' | 'life' | 'teaching';

const WIDGET_TABS: { id: WidgetTab; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'attendance', label: '출결' },
  { id: 'counseling', label: '상담' },
  { id: 'life', label: '생활' },
  { id: 'teaching', label: '수업' },
];

const MAX_PREVIEW = 3;
/** 현재 수업 칩은 한 화면에 이만큼만 펼쳐 둔다. 나머지는 "모두 보기"로 넘긴다. */
const MAX_CHIPS = 12;

/** 담임 업무 → 기록 탭의 출결 화면으로. 저장 규칙은 그 화면이 그대로 갖는다. */
function goHomeroomAttendance(): void {
  requestStudentRecordNavigation(HOMEROOM_ATTENDANCE_TARGET);
}

/** 수업 관리 → 그 수업반의 수업 기록 탭으로. 출결 섹션이 그 화면 안에 있다. */
function goClassAttendance(classId: string): void {
  requestStudentRecordNavigation(classAttendanceTarget(classId));
}

/**
 * 빠른 기록 열기.
 *
 * ★바탕화면 위젯 창에는 모달을 띄울 자리가 없다(`QuickAddModal` 을 마운트하지 않는다).
 * 그 창에서는 메인 창을 띄워 같은 화면을 연다 — 다른 위젯 카드의 이동과 같은 방식이다.
 * 학생까지 미리 고르는 칩은 메인 창에서만 쓰므로 위젯에서는 학생 없이 목록으로 연다.
 */
function openQuickRecord(focus?: { classId?: string; studentIdentity?: string }): void {
  if (useDesktopWidgetContextStore.getState().isDesktopWidget) {
    requestStudentRecordNavigation(quickRecordTarget(focus?.classId ?? null));
    return;
  }
  useQuickAddStore.getState().open('student-record', focus ?? null);
}

interface DashboardStudentRecordsProps {
  /** false = 확장 모달 뷰(분할 에디터). 기본값 true(카드 뷰) */
  isCompactMode?: boolean;
}

export function DashboardStudentRecords({ isCompactMode = true }: DashboardStudentRecordsProps) {
  // widget-expanded-editors Phase 4A: 모달(확장) 모드는 별도 컴포넌트로 위임.
  // wrapper 분기 패턴 — Hook 규칙(rules-of-hooks) 준수.
  if (!isCompactMode) {
    return <ExpandedStudentRecords />;
  }
  return <DashboardStudentRecordsCompact />;
}

/**
 * 카드를 눌러 크게 열었을 때. 담임 명렬이 있으면 기존 담임 기록 편집기를 그대로 쓴다.
 * ★담임이 아닌 선생님에게 빈 담임 화면을 강제하지 않는다 — 그쪽은 수업 기록으로 안내한다.
 */
function ExpandedStudentRecords(): JSX.Element {
  const { students, loaded, load } = useStudentStore();

  useEffect(() => {
    void load();
  }, [load]);

  if (!loaded) return <div className="p-6" />;
  if (students.length > 0) return <StudentRecordsEditor />;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-sm text-sp-text">
        담임 학급 명렬이 없어 담임 기록 화면을 열지 않았습니다.
      </p>
      <p className="text-xs text-sp-muted">
        수업반 학생은 빠른 기록이나 수업 관리에서 기록할 수 있습니다.
      </p>
      <div className="mt-1 flex gap-2">
        <button
          type="button"
          onClick={() => openQuickRecord()}
          className="rounded-lg bg-sp-accent px-4 py-1.5 text-sm font-sp-semibold text-white transition-all hover:brightness-110"
        >
          학생 빠른 기록 열기
        </button>
        <button
          type="button"
          onClick={() => requestStudentRecordNavigation('class-management')}
          className="rounded-lg border border-sp-border px-4 py-1.5 text-sm text-sp-muted transition-colors hover:border-sp-accent hover:text-sp-text"
        >
          수업 관리 열기
        </button>
      </div>
    </div>
  );
}

function DashboardStudentRecordsCompact() {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<WidgetTab>('all');
  const [openLessonKey, setOpenLessonKey] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  const { records, loaded, load, categories } = useStudentRecordsStore();
  const { students, load: loadStudents, loaded: studentsLoaded } = useStudentStore();
  const { classes, load: loadClasses, loaded: classesLoaded } = useTeachingClassStore();
  const {
    records: observationRecords,
    load: loadObservations,
    loaded: observationsLoaded,
  } = useObservationStore();
  const loadSchedule = useScheduleStore((s) => s.load);
  const teacherSchedule = useScheduleStore((s) => s.teacherSchedule);
  const overrides = useScheduleStore((s) => s.overrides);
  const settings = useSettingsStore((s) => s.settings);

  useEffect(() => {
    void load();
    void loadStudents();
    void loadClasses();
    void loadObservations();
    void loadSchedule();
  }, [load, loadStudents, loadClasses, loadObservations, loadSchedule]);

  // 현재 수업 판정은 시각에 달렸다 — 다른 시간표 위젯과 같은 1분 주기.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    const unsubResume = window.electronAPI?.onSystemResume?.(() => setNow(new Date()));
    return () => {
      clearInterval(timer);
      unsubResume?.();
    };
  }, []);

  // 담임 반 학생 ID로 필터링 — 다른 학급 학생 기록 제외
  const studentIds = useMemo(() => new Set(students.map((s) => s.id)), [students]);
  const homeroomRecords = useMemo(
    () => records.filter((r) => studentIds.has(r.studentId)),
    [records, studentIds],
  );

  const categoryColorMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c.color])),
    [categories],
  );

  const studentMap = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);

  const today = todayString();
  const todayRecords = useMemo(
    () => sortByDateDesc(homeroomRecords.filter((r) => r.date === today)),
    [homeroomRecords, today],
  );

  const activeClasses = useMemo(() => filterActiveClasses(classes), [classes]);
  const classMap = useMemo(() => new Map(activeClasses.map((c) => [c.id, c])), [activeClasses]);

  const hasHomeroom = students.length > 0;
  /**
   * 담임이 아니면 담임 축(출결·상담·생활)은 항상 비어 있다.
   * 빈 담임 화면을 강제하지 않기 위해 수업 기록 한 축만 남긴다.
   */
  const visibleTabs = hasHomeroom ? WIDGET_TABS : WIDGET_TABS.filter((t) => t.id === 'teaching');
  const effectiveTab: WidgetTab = hasHomeroom ? activeTab : 'teaching';

  const candidates = useMemo(
    () =>
      buildQuickRecordCandidates({
        homeroom: hasHomeroom
          ? { className: settings.className, grade: settings.grade, students }
          : null,
        teachingClasses: activeClasses,
      }),
    [hasHomeroom, settings.className, settings.grade, students, activeClasses],
  );

  const todayMarks = useMemo(
    () =>
      buildTodayRecordMarks({
        candidates,
        homeroomRecords,
        observationRecords,
        today,
      }),
    [candidates, homeroomRecords, observationRecords, today],
  );

  const todayObservations = useMemo(
    () => observationRecords.filter((r) => r.date === today),
    [observationRecords, today],
  );

  /**
   * 오늘 시간표 → 수업반 연결 → 시각 기준 현재/다음/나머지.
   *
   * ★스토어의 getter 대신 순수 함수(`mergeOverridesIntoTeacherSchedule`)를 직접 쓴다.
   * getter 는 스토어 안에서 상태를 읽어서, 시간표나 변경분이 바뀌어도 이 계산이 다시 돌지 않는다.
   */
  const lessonSplit = useMemo(() => {
    const dayOfWeek = getDayOfWeek(now, settings.enableWeekendDays);
    if (dayOfWeek === null)
      return { current: null, next: null, rest: [] as readonly TodayLesson[] };
    const periods = mergeOverridesIntoTeacherSchedule(
      teacherSchedule[dayOfWeek] ?? [],
      overrides.filter((o) => o.date === today),
    );
    const periodTimeByNumber = new Map(settings.periodTimes.map((pt) => [pt.period, pt]));
    const lessons: TodayLesson[] = [];
    periods.forEach((period, index) => {
      if (period === null) return;
      const periodNumber = index + 1;
      const pt = periodTimeByNumber.get(periodNumber);
      if (pt === undefined) return;
      // 보관된 반은 새 기록 대상이 아니므로 활성 반에서만 찾는다.
      const matched = findMatchingClass(activeClasses, period.classroom, period.subject);
      lessons.push({
        period: periodNumber,
        subject: period.subject,
        classroom: period.classroom,
        classId: matched?.id ?? null,
        startMinutes: parseMinutes(pt.start),
        endMinutes: parseMinutes(pt.end),
      });
    });
    return splitTodayLessons(lessons, now.getHours() * 60 + now.getMinutes());
  }, [
    now,
    today,
    settings.enableWeekendDays,
    settings.periodTimes,
    teacherSchedule,
    overrides,
    activeClasses,
  ]);

  // 2-3: 미완료 후속 조치
  const pendingFollowUps = useMemo(
    () => homeroomRecords.filter((r) => r.followUp && !r.followUpDone),
    [homeroomRecords],
  );

  const filteredRecords = useMemo(() => {
    if (effectiveTab === 'all') return todayRecords;
    if (effectiveTab === 'teaching') return [];
    return todayRecords.filter((r) => r.category === effectiveTab);
  }, [todayRecords, effectiveTab]);

  // Attendance stats for attendance tab
  const attendanceStats = useMemo(() => {
    if (effectiveTab !== 'attendance') return null;
    const activeStudents = students.filter(isStudentActive);
    const todayAttendance = todayRecords.filter((r) => r.category === 'attendance');

    // Students who have attendance records today
    const studentsWithRecords = new Set(todayAttendance.map((r) => r.studentId));

    let absent = 0;
    let late = 0;
    let earlyLeave = 0;
    let resultAbsent = 0;

    for (const record of todayAttendance) {
      const sub = record.subcategory;
      const type = sub.includes(' (') ? sub.slice(0, sub.indexOf(' (')) : sub;
      if (type === '결석') absent++;
      else if (type === '지각') late++;
      else if (type === '조퇴') earlyLeave++;
      else if (type === '결과') resultAbsent++;
    }

    const present = activeStudents.length - studentsWithRecords.size;

    return { present, absent, late, earlyLeave, resultAbsent, todayAttendance };
  }, [effectiveTab, todayRecords, students]);

  if (!loaded || !studentsLoaded || !classesLoaded || !observationsLoaded) return null;

  const handleTabChange = (tab: WidgetTab) => {
    setActiveTab(tab);
    setExpanded(false);
  };

  const lessonKey = (l: TodayLesson): string => `${l.period}-${l.classroom}-${l.subject}`;

  const renderLessonBlock = (lesson: TodayLesson, variant: 'current' | 'next'): JSX.Element => {
    const key = lessonKey(lesson);
    const cls = lesson.classId === null ? null : (classMap.get(lesson.classId) ?? null);
    const isOpen =
      variant === 'current' ? openLessonKey !== `closed:${key}` : openLessonKey === key;
    const chips = cls === null ? [] : candidatesForClass(candidates, cls.id);
    return (
      <div
        key={key}
        className={`mb-2 rounded-lg p-2.5 ${
          variant === 'current' ? 'bg-sp-accent/10 ring-1 ring-sp-accent/30' : 'bg-sp-bg/40'
        }`}
      >
        <div className="flex items-center gap-1.5">
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-caption font-medium ${
              variant === 'current'
                ? 'bg-sp-accent/20 text-sp-accent'
                : 'bg-sp-surface text-sp-muted'
            }`}
          >
            {variant === 'current' ? '지금' : '다음'}
          </span>
          <span className="truncate text-xs font-medium text-sp-text">
            {resolvePeriodShortLabel(lesson.period, settings.periodTimes)} · {lesson.classroom}{' '}
            {lesson.subject}
          </span>
          {cls !== null && (
            <button
              type="button"
              onClick={() => goClassAttendance(cls.id)}
              className="ml-auto shrink-0 text-caption text-sp-accent hover:brightness-110"
            >
              출결 기록
            </button>
          )}
        </div>

        {cls === null ? (
          <p className="mt-1.5 text-caption text-sp-muted/70">
            수업 관리에 이 반을 등록하면 학생 명단이 여기 나옵니다
          </p>
        ) : (
          <>
            <button
              type="button"
              onClick={() =>
                setOpenLessonKey(
                  variant === 'current' ? (isOpen ? `closed:${key}` : null) : isOpen ? null : key,
                )
              }
              aria-expanded={isOpen}
              className="mt-1.5 text-caption text-sp-muted hover:text-sp-text"
            >
              학생 {chips.length}명 {isOpen ? '접기' : '펼치기'}
            </button>
            {isOpen && chips.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {chips.slice(0, MAX_CHIPS).map((c) => (
                  <StudentChip
                    key={c.identity}
                    candidate={c}
                    marked={todayMarks.get(c.identity)}
                    classId={cls.id}
                  />
                ))}
                {chips.length > MAX_CHIPS && (
                  <button
                    type="button"
                    onClick={() => openQuickRecord({ classId: cls.id })}
                    className="rounded-full bg-sp-surface px-2 py-0.5 text-caption text-sp-muted hover:text-sp-text"
                  >
                    +{chips.length - MAX_CHIPS}명 모두 보기
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="rounded-xl bg-sp-card p-4 h-full flex flex-col">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-sp-text flex items-center gap-1.5">
          <span>👩‍🏫</span>학생 빠른 기록
        </h3>
        <button
          type="button"
          onClick={() => openQuickRecord()}
          className="rounded-lg bg-sp-accent/15 px-2.5 py-1 text-xs font-medium text-sp-accent transition-colors hover:bg-sp-accent/25"
        >
          기록 남기기
        </button>
      </div>

      <button
        type="button"
        onClick={() => openQuickRecord()}
        className="mb-3 w-full rounded-lg border border-sp-border bg-sp-bg/50 px-3 py-2 text-left text-xs text-sp-muted transition-colors hover:border-sp-accent"
      >
        🔍 담임반·수업반 학생을 이름이나 번호로 찾기
      </button>

      {/* 오늘 만나는 학생 — 현재 수업이 먼저, 다음 수업은 접어 둔다 */}
      {lessonSplit.current !== null && renderLessonBlock(lessonSplit.current, 'current')}
      {lessonSplit.next !== null && renderLessonBlock(lessonSplit.next, 'next')}
      {lessonSplit.current === null && lessonSplit.next === null && activeClasses.length > 0 && (
        <p className="mb-2 rounded-lg bg-sp-bg/40 px-2.5 py-2 text-caption text-sp-muted">
          오늘 남은 수업이 없습니다. 위 검색으로 학생을 찾아 기록할 수 있습니다.
        </p>
      )}
      {lessonSplit.rest.length > 0 && (
        <details className="mb-3">
          <summary className="cursor-pointer text-caption text-sp-muted hover:text-sp-text">
            오늘의 다른 수업 {lessonSplit.rest.length}개
          </summary>
          <ul className="mt-1.5 space-y-1">
            {lessonSplit.rest.map((l) => {
              const cls = l.classId === null ? null : (classMap.get(l.classId) ?? null);
              return (
                <li key={lessonKey(l)} className="flex items-center gap-1.5 text-caption">
                  <span className="text-sp-muted">
                    {resolvePeriodShortLabel(l.period, settings.periodTimes)}
                  </span>
                  <span className="truncate text-sp-text">
                    {l.classroom} {l.subject}
                  </span>
                  {cls !== null && (
                    <span className="ml-auto flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => openQuickRecord({ classId: cls.id })}
                        className="text-sp-accent hover:brightness-110"
                      >
                        기록
                      </button>
                      <button
                        type="button"
                        onClick={() => goClassAttendance(cls.id)}
                        className="text-sp-muted hover:text-sp-text"
                      >
                        출결
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      )}

      {hasHomeroom && (
        <button
          type="button"
          onClick={goHomeroomAttendance}
          className="mb-3 w-full rounded-lg border border-sp-border px-3 py-1.5 text-caption text-sp-muted transition-colors hover:border-sp-accent hover:text-sp-text"
        >
          담임 출결 기록 열기
        </button>
      )}

      {/* Tab UI */}
      <div className="flex gap-1 mb-3">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`flex-1 px-1.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              effectiveTab === tab.id
                ? 'bg-sp-accent/20 text-sp-accent'
                : 'text-sp-muted hover:text-sp-text hover:bg-sp-text/5'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {effectiveTab === 'teaching' ? (
          todayObservations.length === 0 ? (
            <div className="flex items-center justify-center py-6">
              <p className="text-sm text-sp-muted">오늘 수업 기록이 없습니다</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {(expanded ? todayObservations : todayObservations.slice(0, MAX_PREVIEW)).map((r) => {
                const cls = classMap.get(r.classId);
                return (
                  <li key={r.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5">
                    <span className="px-1.5 py-0.5 rounded text-caption font-medium bg-sp-accent/15 text-sp-accent">
                      {cls ? `${cls.subject} · ${cls.name}` : '수업'}
                    </span>
                    <span className="text-xs text-sp-muted truncate flex-1">{r.content}</span>
                  </li>
                );
              })}
              {todayObservations.length > MAX_PREVIEW && (
                <li className="text-right">
                  <button
                    type="button"
                    onClick={() => setExpanded(!expanded)}
                    className="text-xs text-sp-accent transition-colors hover:text-sp-accent/80"
                  >
                    {expanded ? '접기' : `+${todayObservations.length - MAX_PREVIEW}건 더`}
                  </button>
                </li>
              )}
            </ul>
          )
        ) : effectiveTab === 'attendance' && attendanceStats ? (
          <div>
            {/* Stats row */}
            <div className="grid grid-cols-4 gap-1.5 mb-3">
              <div className="bg-green-500/10 rounded-lg p-2 text-center">
                <div className="text-green-400 text-sm font-bold">{attendanceStats.present}</div>
                <div className="text-caption text-sp-muted">출석</div>
              </div>
              <div className="bg-red-500/10 rounded-lg p-2 text-center">
                <div className="text-red-400 text-sm font-bold">{attendanceStats.absent}</div>
                <div className="text-caption text-sp-muted">결석</div>
              </div>
              <div className="bg-yellow-500/10 rounded-lg p-2 text-center">
                <div className="text-yellow-400 text-sm font-bold">{attendanceStats.late}</div>
                <div className="text-caption text-sp-muted">지각</div>
              </div>
              <div className="bg-orange-500/10 rounded-lg p-2 text-center">
                <div className="text-orange-400 text-sm font-bold">
                  {attendanceStats.earlyLeave}
                </div>
                <div className="text-caption text-sp-muted">조퇴</div>
              </div>
            </div>
            {/* Attendance issue list */}
            {attendanceStats.todayAttendance.length > 0 ? (
              <ul className="space-y-1.5">
                {attendanceStats.todayAttendance.map((record) => {
                  const student = studentMap.get(record.studentId);
                  return (
                    <li key={record.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5">
                      <span
                        className={getTagClass(categoryColorMap.get(record.category) ?? 'gray')}
                      >
                        {record.subcategory}
                      </span>
                      <span className="text-sm text-sp-text font-medium">
                        {student?.name ?? '?'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="flex items-center justify-center py-4">
                <p className="text-xs text-sp-muted">오늘 출결 기록이 없습니다</p>
              </div>
            )}
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="flex items-center justify-center py-6">
            <p className="text-sm text-sp-muted">
              {effectiveTab === 'all' ? '오늘 기록이 없습니다' : '오늘 해당 기록이 없습니다'}
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {(expanded ? filteredRecords : filteredRecords.slice(0, MAX_PREVIEW)).map((record) => {
              const student = studentMap.get(record.studentId);
              return (
                <li key={record.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5">
                  <span className={getTagClass(categoryColorMap.get(record.category) ?? 'gray')}>
                    {recordExportLabel(record)}
                  </span>
                  <span className="text-sm text-sp-text font-medium">{student?.name ?? '?'}</span>
                  {record.content && (
                    <span className="text-xs text-sp-muted truncate flex-1">{record.content}</span>
                  )}
                </li>
              );
            })}
            {filteredRecords.length > MAX_PREVIEW && (
              <li className="text-right">
                <button
                  type="button"
                  onClick={() => setExpanded(!expanded)}
                  className="text-xs text-sp-accent hover:text-sp-accent/80 transition-colors"
                >
                  {expanded ? '접기' : `+${filteredRecords.length - MAX_PREVIEW}건 더`}
                </button>
              </li>
            )}
          </ul>
        )}
      </div>

      {/* 2-3: 미완료 후속 조치 */}
      {pendingFollowUps.length > 0 && (
        <div className="mt-3 pt-3 border-t border-sp-border">
          <h4 className="text-xs font-bold text-sp-text mb-2">
            {'📌'} 미완료 후속 조치 ({pendingFollowUps.length}건)
          </h4>
          <ul className="space-y-1.5">
            {pendingFollowUps.slice(0, 3).map((record) => {
              const student = studentMap.get(record.studentId);
              const isOverdue = record.followUpDate ? record.followUpDate < today : false;
              const isToday = record.followUpDate === today;
              const colorClass = isOverdue
                ? 'text-red-400'
                : isToday
                  ? 'text-orange-400'
                  : 'text-sp-muted';
              return (
                <li key={record.id} className="flex items-center gap-2 text-xs">
                  <span className={`font-medium ${colorClass}`}>
                    {record.followUpDate ? formatDateKR(record.followUpDate) : '-'}
                  </span>
                  <span className="text-sp-text font-medium">{student?.name ?? '?'}</span>
                  <span className="text-sp-muted truncate flex-1">{record.followUp}</span>
                </li>
              );
            })}
            {pendingFollowUps.length > 3 && (
              <li className="text-xs text-sp-muted">+{pendingFollowUps.length - 3}건 더</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

interface StudentChipProps {
  readonly candidate: QuickRecordCandidate;
  readonly marked: { readonly attendance: boolean; readonly note: boolean } | undefined;
  readonly classId: string;
}

/**
 * 학생 칩 — 누르면 그 학생으로 빠른 기록을 연다.
 * 표시는 오늘 기록의 **종류**뿐이다: `✔` 은 출결, `·` 은 누가기록/특기사항. 건수는 붙이지 않는다.
 */
function StudentChip({ candidate, marked, classId }: StudentChipProps): JSX.Element {
  const label = `${candidate.number != null ? `${candidate.number} ` : ''}${candidate.name}`;
  const hints: string[] = [];
  if (marked?.attendance === true) hints.push('오늘 출결 기록 있음');
  if (marked?.note === true) hints.push('오늘 누가기록/특기사항 있음');
  // ★표시가 학생 이름을 가리지 않게 이름을 먼저 읽히도록 이름표를 직접 만든다.
  const ariaLabel = hints.length > 0 ? `${label} · ${hints.join(' · ')}` : label;
  return (
    <button
      type="button"
      onClick={() => openQuickRecord({ classId, studentIdentity: candidate.identity })}
      aria-label={ariaLabel}
      title={ariaLabel}
      className="rounded-full bg-sp-surface px-2 py-0.5 text-caption text-sp-text transition-colors hover:bg-sp-accent/20"
    >
      {label}
      {marked?.attendance === true && (
        <span aria-hidden className="ml-0.5 text-amber-400">
          ✔
        </span>
      )}
      {marked?.note === true && (
        <span aria-hidden className="ml-0.5 text-emerald-400">
          ●
        </span>
      )}
    </button>
  );
}
