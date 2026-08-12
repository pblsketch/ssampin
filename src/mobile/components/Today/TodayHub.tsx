import { useEffect, useMemo, useRef, useState } from 'react';
import type { TouchEvent } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useCurrentPeriod } from '@mobile/hooks/useCurrentPeriod';
import { useMobileSettingsStore } from '@mobile/stores/useMobileSettingsStore';
import { useMobileScheduleStore } from '@mobile/stores/useMobileScheduleStore';
import { useMobileAttendanceStore } from '@mobile/stores/useMobileAttendanceStore';
import { useMobileMealStore } from '@mobile/stores/useMobileMealStore';
import { useMobileDriveSyncStore } from '@mobile/stores/useMobileDriveSyncStore';
import { useMobileTeachingClassStore } from '@mobile/stores/useMobileTeachingClassStore';
import { useMobileProgressStore } from '@mobile/stores/useMobileProgressStore';
import { useMobileStudentStore } from '@mobile/stores/useMobileStudentStore';
import { useMobileHomeLayoutStore } from '@mobile/stores/useMobileHomeLayoutStore';
import { isStudentActive } from '@domain/rules/studentActivity';
import { CollapsibleCard } from '@mobile/components/common/CollapsibleCard';
import { HomeScheduleCarousel } from './HomeScheduleCarousel';
import { AttendanceSummaryCard } from './AttendanceSummaryCard';
import { MealCard } from './MealCard';
import { WeatherCard } from './WeatherCard';
import { SyncStatusBanner } from './SyncStatusBanner';
import { TodayRemaining } from './TodayRemaining';
import { SyncFreshnessIndicator } from './SyncFreshnessIndicator';
import { haptic } from '@mobile/utils/haptic';

/** 당겨서 새로고침 임계값(px) — 이 이상 당기고 놓으면 동기화 실행 */
const PULL_THRESHOLD = 64;
/** 당김 인디케이터 최대 높이(px) — 고무줄 저항으로 이 이상은 늘어나지 않음 */
const PULL_MAX = 96;

interface Props {
  onNavigateAttendance: (params: {
    classId: string;
    className: string;
    period: number;
    type: 'homeroom' | 'class';
  }) => void;
  /** "오늘 남은 일"의 할 일 줄을 눌렀을 때 — 일정 탭의 할 일로 이동 */
  onNavigateTodo: () => void;
}

export function TodayHub({ onNavigateAttendance, onNavigateTodo }: Props) {
  const settings = useMobileSettingsStore((s) => s.settings);
  const settingsLoaded = useMobileSettingsStore((s) => s.loaded);
  const loadSettings = useMobileSettingsStore((s) => s.load);

  const teacherSchedule = useMobileScheduleStore((s) => s.teacherSchedule);
  const classSchedule = useMobileScheduleStore((s) => s.classSchedule);
  const loadSchedule = useMobileScheduleStore((s) => s.load);

  const loadAttendance = useMobileAttendanceStore((s) => s.load);
  const getTodayRecord = useMobileAttendanceStore((s) => s.getTodayRecord);

  const todayMeals = useMobileMealStore((s) => s.todayMeals);
  const mealLoading = useMobileMealStore((s) => s.loading);
  const loadMeals = useMobileMealStore((s) => s.loadTodayMeals);

  const syncState = useMobileDriveSyncStore((s) => s.state);
  const lastSyncedAt = useMobileDriveSyncStore((s) => s.lastSyncedAt);
  const syncFromCloud = useMobileDriveSyncStore((s) => s.syncFromCloud);
  const isSyncAuthenticated = useMobileDriveSyncStore((s) => s.isAuthenticated);

  const loadTeachingClasses = useMobileTeachingClassStore((s) => s.load);
  const loadProgress = useMobileProgressStore((s) => s.load);

  const homeroomStudents = useMobileStudentStore((s) => s.students);
  const loadStudents = useMobileStudentStore((s) => s.load);

  const hiddenCards = useMobileHomeLayoutStore((s) => s.hiddenCards);
  const isHidden = (
    id: 'currentClass' | 'homeroomAttendance' | 'classAttendance' | 'weather' | 'meal',
  ) => hiddenCards[id] === true;

  const periodInfo = useCurrentPeriod(settings.periodTimes);

  // 급식 조회용 별도 학교가 설정되어 있으면 우선 사용
  const mealAtptCode = settings.mealSchool?.atptCode || settings.neis.atptCode;
  const mealSchoolCode = settings.mealSchool?.schoolCode || settings.neis.schoolCode;

  // ── 당겨서 새로고침 (pull-to-refresh) ──
  // 외부 라이브러리 없이 touch 이벤트로 구현. scrollTop===0 일 때만 당김을 인식해
  // 스크롤 중간에 아래로 튕기는 제스처와 섞이지 않게 한다.
  const scrollRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const handleTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    if (refreshing || !isSyncAuthenticated) return;
    const el = scrollRef.current;
    const touch = e.touches[0];
    touchStartY.current = el && el.scrollTop <= 0 && touch ? touch.clientY : null;
  };

  const handleTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    if (touchStartY.current === null || refreshing) return;
    const el = scrollRef.current;
    const touch = e.touches[0];
    if (!el || el.scrollTop > 0 || !touch) {
      setPullDistance(0);
      return;
    }
    const delta = touch.clientY - touchStartY.current;
    // 고무줄 저항(0.5배) + 최대치 제한
    setPullDistance(delta > 0 ? Math.min(PULL_MAX, delta * 0.5) : 0);
  };

  const handleTouchEnd = () => {
    touchStartY.current = null;
    if (pullDistance >= PULL_THRESHOLD && !refreshing && isSyncAuthenticated) {
      haptic();
      setRefreshing(true);
      void syncFromCloud().finally(() => setRefreshing(false));
    }
    setPullDistance(0);
  };

  useEffect(() => {
    void loadSettings();
    void loadSchedule();
    void loadAttendance();
    void loadTeachingClasses();
    void loadProgress();
    void loadStudents();
  }, [loadSettings, loadSchedule, loadAttendance, loadTeachingClasses, loadProgress, loadStudents]);

  useEffect(() => {
    if (settingsLoaded && mealAtptCode && mealSchoolCode) {
      void loadMeals(mealAtptCode, mealSchoolCode);
    }
  }, [settingsLoaded, mealAtptCode, mealSchoolCode, loadMeals]);

  // 동기화 완료 후 급식 데이터 재로딩 (settings가 갱신된 뒤 NEIS 코드가 생기면)
  useEffect(() => {
    if (syncState === 'idle' && lastSyncedAt && settingsLoaded && mealAtptCode && mealSchoolCode) {
      void loadMeals(mealAtptCode, mealSchoolCode);
    }
  }, [syncState, lastSyncedAt, settingsLoaded, mealAtptCode, mealSchoolCode, loadMeals]);

  const roles = settings.teacherRoles ?? [];
  const isHomeroom = roles.includes('homeroom');

  const daySchedule = teacherSchedule[periodInfo.dayOfWeek];
  const currentClass =
    periodInfo.currentPeriod && daySchedule
      ? (daySchedule[periodInfo.currentPeriod - 1] ?? null)
      : null;

  const totalStudents = homeroomStudents.filter(isStudentActive).length;
  const homeroomRecord = getTodayRecord(settings.className);

  const showHomeroomCard = isHomeroom && !isHidden('homeroomAttendance');
  const showClassCard =
    Boolean(periodInfo.currentPeriod && currentClass) && !isHidden('classAttendance');

  /**
   * \uC624\uB298 \uC544\uC9C1 \uCD9C\uACB0\uC744 \uB123\uC9C0 \uC54A\uC740 \uAC83\uB4E4.
   *
   * \uB2F4\uC784 \uC870\uD68C + \uC624\uB298 \uC2DC\uAC04\uD45C\uC5D0 \uC788\uB294 \uC218\uC5C5\uC744 \uD6D1\uC5B4 \uAE30\uB85D\uC774 \uC5C6\uB294 \uAC83\uC744 \uC13C\uB2E4.
   * \uD310\uB2E8 \uAE30\uC900\uC740 \uD654\uBA74 \uCE74\uB4DC\uC640 \uAC19\uC740 getTodayRecord \uB77C \uC11C\uB85C \uC5B4\uAE0B\uB098\uC9C0 \uC54A\uB294\uB2E4.
   */
  const missingAttendance = useMemo(() => {
    const items: {
      label: string;
      classId: string;
      className: string;
      period: number;
      type: 'homeroom' | 'class';
    }[] = [];

    if (isHomeroom && settings.className && !homeroomRecord) {
      items.push({
        label: `${settings.className} \uC870\uD68C`,
        classId: settings.className,
        className: settings.className,
        period: 0,
        type: 'homeroom',
      });
    }

    for (let i = 0; i < (daySchedule?.length ?? 0); i += 1) {
      const slot = daySchedule?.[i];
      if (!slot?.classroom) continue;
      const period = i + 1;
      if (getTodayRecord(slot.classroom, period)) continue;
      items.push({
        label: `${slot.classroom} ${period}\uAD50\uC2DC`,
        classId: slot.classroom,
        className: slot.classroom,
        period,
        type: 'class',
      });
    }
    return items;
  }, [isHomeroom, settings.className, homeroomRecord, daySchedule, getTodayRecord]);

  const today = new Date();
  const dateStr = format(today, 'M\uC6D4 d\uC77C (EEEE)', { locale: ko });

  // 당김 정도에 비례해 인디케이터를 회전/페이드 (임계값 도달 시 180deg)
  const pullProgress = Math.min(1, pullDistance / PULL_THRESHOLD);
  const indicatorHeight = refreshing ? 48 : pullDistance;

  return (
    <div
      ref={scrollRef}
      className="tab-content pt-4 pb-6 space-y-4 overscroll-y-contain"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* 당겨서 새로고침 인디케이터 */}
      <div
        className="flex flex-col items-center justify-center gap-0.5 overflow-hidden transition-[height] duration-150 ease-out"
        style={{ height: indicatorHeight }}
        aria-hidden={!refreshing && pullDistance === 0}
      >
        <span
          className={`material-symbols-outlined text-sp-accent ${refreshing ? 'animate-spin' : ''}`}
          style={
            refreshing
              ? undefined
              : { transform: `rotate(${pullProgress * 180}deg)`, opacity: pullProgress }
          }
        >
          {refreshing ? 'sync' : 'arrow_downward'}
        </span>
        <span
          className="text-tiny text-sp-muted"
          style={{ opacity: refreshing ? 1 : pullProgress }}
        >
          {refreshing
            ? '새로고침 중...'
            : pullProgress >= 1
              ? '놓으면 새로고침'
              : '당겨서 새로고침'}
        </span>
      </div>

      {/* 동기화 상태 배너 */}
      <SyncStatusBanner />

      {/* 날짜 헤더 */}
      <div className="px-4 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-sp-text">{dateStr}</h2>
          {settings.schoolName && (
            <p className="text-xs text-sp-muted mt-0.5">
              {settings.schoolName} &middot; {settings.teacherName}
            </p>
          )}
        </div>
        <SyncFreshnessIndicator />
      </div>

      {/* 오늘 남은 일 — 출결 미입력과 급한 할 일을 한 묶음으로.
          앱을 열자마자 보이므로, 그 화면에 들어가야만 알 수 있던 것들이 먼저 뜬다.
          남은 게 없으면 통째로 사라진다(칭찬·달성률 없음). */}
      <TodayRemaining
        attendanceMissingCount={missingAttendance.length}
        attendanceMissingLabel={missingAttendance.map((m) => m.label).join(' · ')}
        onOpenAttendance={() => {
          const first = missingAttendance[0];
          if (first) {
            onNavigateAttendance({
              classId: first.classId,
              className: first.className,
              period: first.period,
              type: first.type,
            });
          }
        }}
        onOpenTodo={onNavigateTodo}
      />

      {/* 오늘 현황 + 주간 시간표 캐러셀 — 좌우 스와이프로 오늘/주간 교사/주간 학급 시간표 전환 */}
      {!isHidden('currentClass') && (
        <HomeScheduleCarousel
          periodInfo={periodInfo}
          teacherSchedule={teacherSchedule}
          classSchedule={classSchedule}
        />
      )}

      {/* Bento Grid */}
      <div className="px-4 grid grid-cols-2 gap-3">
        {/* 담임 출결 + 수업 출결 — 반 너비 */}
        {showHomeroomCard && (
          <div className="col-span-1">
            <CollapsibleCard
              cardId="homeroomAttendance"
              title="우리 반"
              icon="groups"
              iconClass="text-amber-500"
              className="h-full"
            >
              <AttendanceSummaryCard
                record={homeroomRecord}
                totalStudents={totalStudents}
                onCheckAttendance={() =>
                  onNavigateAttendance({
                    classId: settings.className,
                    className: settings.className,
                    period: 0,
                    type: 'homeroom',
                  })
                }
              />
            </CollapsibleCard>
          </div>
        )}

        {showClassCard && periodInfo.currentPeriod && currentClass ? (
          <div className={showHomeroomCard ? 'col-span-1' : 'col-span-2'}>
            <CollapsibleCard
              cardId="classAttendance"
              title={`${periodInfo.currentPeriod}교시 · ${currentClass.classroom}`}
              icon="fact_check"
              iconClass="text-sp-accent"
              className="h-full"
            >
              <AttendanceSummaryCard
                record={getTodayRecord(currentClass.classroom, periodInfo.currentPeriod)}
                onCheckAttendance={() =>
                  onNavigateAttendance({
                    classId: currentClass.classroom,
                    className: currentClass.classroom,
                    period: periodInfo.currentPeriod!,
                    type: 'class',
                  })
                }
              />
            </CollapsibleCard>
          </div>
        ) : showHomeroomCard ? (
          /* 수업 출결 카드가 없는데 담임 출결만 있으면 나머지 반 너비 채우기 */
          <div className="col-span-1" />
        ) : null}

        {/* 날씨 — 풀 너비 */}
        {!isHidden('weather') && (
          <div className="col-span-2">
            <WeatherCard />
          </div>
        )}

        {/* 급식 — 풀 너비 */}
        {!isHidden('meal') && (
          <div className="col-span-2">
            <MealCard meals={todayMeals} loading={mealLoading} />
          </div>
        )}
      </div>
    </div>
  );
}
