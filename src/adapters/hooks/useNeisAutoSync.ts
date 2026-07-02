import { useEffect, useRef } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { neisPort } from '@adapters/di/container';
import { NEIS_API_KEY } from '@domain/entities/Meal';
import {
  autoSyncNeisTimetable,
  getCurrentISOWeek,
} from '@usecases/timetable/AutoSyncNeisTimetable';
import { smartAutoAssignColors } from '@domain/rules/subjectColorRules';
import { toLocalDateString } from '@shared/utils/localDate';

/**
 * 앱 시작 시 NEIS 시간표 자동 동기화 훅. App 최상위에서 한 번 호출.
 *
 * 정책(M4): 변경이 감지되면 기본은 **알림만**(비파괴 — 수동 편집을 덮어쓰지 않음),
 * `neis.autoSync.autoApply === true`(기존 자동사용자 마이그레이션)일 때만 무음 적용.
 * 변경이 없으면 시간표 쓰기를 건너뛴다(중복 저장 방지). lastSync는 항상 갱신해 하루 1회로 스로틀.
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
      const currentClass = useScheduleStore.getState().classSchedule;
      const result = await autoSyncNeisTimetable(
        neisPort,
        NEIS_API_KEY,
        settings.neis,
        settings.neis.autoSync!,
        settings.schoolLevel,
        settings.subjectColors ?? {},
        currentClass,
      );

      if (result.skipped || !result.success || !result.data) return;

      const syncMeta = { lastSyncDate: toLocalDateString(), lastSyncWeek: getCurrentISOWeek() };
      const persistMeta = () =>
        updateSettings({
          neis: { ...settings.neis, autoSync: { ...settings.neis.autoSync!, ...syncMeta } },
        });

      // 변경 없음 → 시간표 쓰기 스킵(중복 저장 방지), 스로틀 메타만 갱신
      if (result.changed === false) {
        await persistMeta();
        return;
      }

      // 기본(비파괴): 알림만. 자동 적용은 옵트인(기존 자동사용자 마이그레이션)만.
      if (settings.neis.autoSync!.autoApply !== true) {
        useToastStore
          .getState()
          .show(
            '나이스에서 학급 시간표가 바뀐 것 같아요. 시간표 화면에서 [나이스에서 불러오기]로 확인해주세요.',
            'info',
            undefined,
            5000,
          );
        await persistMeta();
        return;
      }

      // 옵트인 무음 적용 (현행 동작 유지)
      await updateClassSchedule(result.data);

      let updatedColors = settings.subjectColors ?? {};
      if (result.newSubjects && result.newSubjects.length > 0) {
        updatedColors = smartAutoAssignColors(updatedColors, result.newSubjects);
      }

      await updateSettings({
        subjectColors: updatedColors,
        neis: { ...settings.neis, autoSync: { ...settings.neis.autoSync!, ...syncMeta } },
      });

      if (result.maxPeriods && result.maxPeriods > settings.maxPeriods) {
        await updateSettings({ maxPeriods: result.maxPeriods });
      }
    })();
  }, [settings, updateSettings, updateClassSchedule]);
}
