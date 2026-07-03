import { useEffect } from 'react';
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

interface Props {
  onNavigateAttendance: (params: {
    classId: string;
    className: string;
    period: number;
    type: 'homeroom' | 'class';
  }) => void;
}

export function TodayHub({ onNavigateAttendance }: Props) {
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

  const today = new Date();
  const dateStr = format(today, 'M\uC6D4 d\uC77C (EEEE)', { locale: ko });

  return (
    <div className="tab-content pt-4 pb-6 space-y-4">
      {/* 동기화 상태 배너 */}
      <SyncStatusBanner />

      {/* 날짜 헤더 */}
      <div className="px-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-sp-text">{dateStr}</h2>
          {settings.schoolName && (
            <p className="text-xs text-sp-muted mt-0.5">
              {settings.schoolName} &middot; {settings.teacherName}
            </p>
          )}
        </div>
      </div>

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
