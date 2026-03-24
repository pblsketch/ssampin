import { useEffect, useRef } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { neisPort } from '@adapters/di/container';
import { NEIS_API_KEY } from '@domain/entities/Meal';
import { autoSyncNeisTimetable, getCurrentISOWeek } from '@usecases/timetable/AutoSyncNeisTimetable';
import { smartAutoAssignColors } from '@domain/rules/subjectColorRules';

/**
 * 앱 시작 시 NEIS 시간표 자동 동기화 훅
 * App 최상위에서 한 번 호출
 */
export function useNeisAutoSync() {
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.update);
  const updateClassSchedule = useScheduleStore((s) => s.updateClassSchedule);
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    if (!settings.neis?.autoSync?.enabled) return;
    hasRun.current = true;

    void (async () => {
      const result = await autoSyncNeisTimetable(
        neisPort,
        NEIS_API_KEY,
        settings.neis,
        settings.neis.autoSync!,
        settings.schoolLevel,
        settings.subjectColors ?? {},
      );

      if (result.skipped || !result.success || !result.data) return;

      // 시간표 업데이트
      await updateClassSchedule(result.data);

      // 새 과목에 자동 색상 배정
      let updatedColors = settings.subjectColors ?? {};
      if (result.newSubjects && result.newSubjects.length > 0) {
        updatedColors = smartAutoAssignColors(
          updatedColors,
          result.newSubjects,
        );
      }

      // 설정 업데이트 (lastSyncWeek + 색상)
      const currentWeek = getCurrentISOWeek();
      await updateSettings({
        subjectColors: updatedColors,
        neis: {
          ...settings.neis,
          autoSync: {
            ...settings.neis.autoSync!,
            lastSyncDate: new Date().toISOString().slice(0, 10),
            lastSyncWeek: currentWeek,
          },
        },
      });

      // maxPeriods 업데이트 (필요 시)
      if (result.maxPeriods && result.maxPeriods > settings.maxPeriods) {
        await updateSettings({ maxPeriods: result.maxPeriods });
      }
    })();
  }, [settings, updateSettings, updateClassSchedule]);
}
