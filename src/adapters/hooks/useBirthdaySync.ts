import { useCallback } from 'react';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';

export function useBirthdaySync() {
  const students = useStudentStore((s) => s.students);
  const syncEnabled = useSettingsStore((s) => s.settings.syncBirthdaysToSchedule);

  const syncAll = useCallback(async () => {
    await useEventsStore.getState().syncBirthdayEvents(students);
  }, [students]);

  const removeAll = useCallback(async () => {
    await useEventsStore.getState().removeBirthdayEvents();
  }, []);

  const toggle = useCallback(async (enabled: boolean) => {
    await useSettingsStore.getState().update({ syncBirthdaysToSchedule: enabled });
    if (enabled) {
      await useEventsStore.getState().syncBirthdayEvents(
        useStudentStore.getState().students,
      );
    } else {
      await useEventsStore.getState().removeBirthdayEvents();
    }
  }, []);

  return { syncAll, removeAll, toggle, syncEnabled };
}
