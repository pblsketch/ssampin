import { useEffect } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useCurrentPeriod } from '@mobile/hooks/useCurrentPeriod';
import { useMobileSettingsStore } from '@mobile/stores/useMobileSettingsStore';
import { useMobileScheduleStore } from '@mobile/stores/useMobileScheduleStore';
import { useMobileAttendanceStore } from '@mobile/stores/useMobileAttendanceStore';
import { useMobileMealStore } from '@mobile/stores/useMobileMealStore';
import { useMobileDriveSyncStore } from '@mobile/stores/useMobileDriveSyncStore';
import { CurrentClassCard } from './CurrentClassCard';
import { HomeroomAttendanceCard } from './HomeroomAttendanceCard';
import { ClassAttendanceCard } from './ClassAttendanceCard';
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
  const loadSchedule = useMobileScheduleStore((s) => s.load);

  const loadAttendance = useMobileAttendanceStore((s) => s.load);
  const getTodayRecord = useMobileAttendanceStore((s) => s.getTodayRecord);

  const todayMeals = useMobileMealStore((s) => s.todayMeals);
  const mealLoading = useMobileMealStore((s) => s.loading);
  const loadMeals = useMobileMealStore((s) => s.loadTodayMeals);

  const syncState = useMobileDriveSyncStore((s) => s.state);
  const lastSyncedAt = useMobileDriveSyncStore((s) => s.lastSyncedAt);

  const periodInfo = useCurrentPeriod(settings.periodTimes);

  useEffect(() => {
    void loadSettings();
    void loadSchedule();
    void loadAttendance();
  }, [loadSettings, loadSchedule, loadAttendance]);

  useEffect(() => {
    if (settingsLoaded && settings.neis.atptCode && settings.neis.schoolCode) {
      void loadMeals(settings.neis.atptCode, settings.neis.schoolCode);
    }
  }, [settingsLoaded, settings.neis.atptCode, settings.neis.schoolCode, loadMeals]);

  // 동기화 완료 후 급식 데이터 재로딩 (settings가 갱신된 뒤 NEIS 코드가 생기면)
  useEffect(() => {
    if (syncState === 'idle' && lastSyncedAt && settingsLoaded && settings.neis.atptCode && settings.neis.schoolCode) {
      void loadMeals(settings.neis.atptCode, settings.neis.schoolCode);
    }
  }, [syncState, lastSyncedAt, settingsLoaded, settings.neis.atptCode, settings.neis.schoolCode, loadMeals]);

  const roles = settings.teacherRoles ?? [];
  const isHomeroom = roles.includes('homeroom');

  const daySchedule = teacherSchedule[periodInfo.dayOfWeek];
  const currentClass = periodInfo.currentPeriod && daySchedule
    ? daySchedule[periodInfo.currentPeriod - 1] ?? null
    : null;

  const totalStudents = 30;
  const homeroomRecord = getTodayRecord(settings.className);

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

      {/* Bento Grid */}
      <div className="px-4 grid grid-cols-2 gap-3">
        {/* 현재 교시 — 풀 너비 */}
        <div className="col-span-2">
          <CurrentClassCard periodInfo={periodInfo} teacherSchedule={teacherSchedule} />
        </div>

        {/* 담임 출결 + 수업 출결 — 반 너비 */}
        {isHomeroom && (
          <div className="col-span-1">
            <HomeroomAttendanceCard
              todayRecord={homeroomRecord}
              totalStudents={totalStudents}
              onCheckAttendance={() => onNavigateAttendance({
                classId: settings.className,
                className: settings.className,
                period: 0,
                type: 'homeroom',
              })}
            />
          </div>
        )}

        {periodInfo.currentPeriod && currentClass ? (
          <div className={isHomeroom ? 'col-span-1' : 'col-span-2'}>
            <ClassAttendanceCard
              period={periodInfo.currentPeriod}
              classInfo={currentClass}
              attendanceRecord={getTodayRecord(currentClass.classroom, periodInfo.currentPeriod)}
              onCheckAttendance={() => onNavigateAttendance({
                classId: currentClass.classroom,
                className: currentClass.classroom,
                period: periodInfo.currentPeriod!,
                type: 'class',
              })}
            />
          </div>
        ) : isHomeroom ? (
          /* 수업이 없는데 담임 출결만 있으면 나머지 반 너비 채우기 */
          <div className="col-span-1" />
        ) : null}

        {/* 날씨 — 풀 너비 */}
        <div className="col-span-2">
          <WeatherCard />
        </div>

        {/* 급식 — 풀 너비 */}
        <div className="col-span-2">
          <MealCard meals={todayMeals} loading={mealLoading} />
        </div>
      </div>
    </div>
  );
}
