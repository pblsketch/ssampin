import { useEffect } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useCurrentPeriod } from '@mobile/hooks/useCurrentPeriod';
import { useMobileSettingsStore } from '@mobile/stores/useMobileSettingsStore';
import { useMobileScheduleStore } from '@mobile/stores/useMobileScheduleStore';
import { useMobileAttendanceStore } from '@mobile/stores/useMobileAttendanceStore';
import { useMobileMealStore } from '@mobile/stores/useMobileMealStore';
import { CurrentClassCard } from './CurrentClassCard';
import { HomeroomAttendanceCard } from './HomeroomAttendanceCard';
import { ClassAttendanceCard } from './ClassAttendanceCard';
import { MealCard } from './MealCard';
import { WeatherCard } from './WeatherCard';

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
    <div className="tab-content p-4 space-y-4">
      {/* 날짜 헤더 */}
      <div>
        <h2 className="text-xl font-bold text-sp-text">{dateStr}</h2>
        {settings.schoolName && (
          <p className="text-xs text-sp-muted mt-0.5">
            {settings.schoolName} &middot; {settings.teacherName}
          </p>
        )}
      </div>

      {/* 날씨 */}
      <WeatherCard />

      {/* 현재 교시 카드 */}
      <CurrentClassCard periodInfo={periodInfo} teacherSchedule={teacherSchedule} />

      {/* 담임 출결 (담임 역할일 때만) */}
      {isHomeroom && (
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
      )}

      {/* 수업 출결 (현재 교시에 수업이 있을 때) */}
      {periodInfo.currentPeriod && currentClass && (
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
      )}

      {/* 급식 */}
      <MealCard meals={todayMeals} loading={mealLoading} />
    </div>
  );
}
