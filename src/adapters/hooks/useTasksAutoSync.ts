import { useEffect, useRef } from 'react';
import { useTasksSyncStore } from '@adapters/stores/useTasksSyncStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useTodoStore } from '@adapters/stores/useTodoStore';

/** Google Tasks 자동 동기화 훅 — 앱 시작/저장/주기/포커스 4가지 트리거 */
export function useTasksAutoSync() {
  const isEnabled = useTasksSyncStore((s) => s.isEnabled);
  const taskListId = useTasksSyncStore((s) => s.taskListId);
  const autoSyncOnStart = useSettingsStore((s) => s.settings.sync?.autoSyncOnStart);
  const autoSyncOnSave = useSettingsStore((s) => s.settings.sync?.autoSyncOnSave);
  const autoSyncIntervalMin = useSettingsStore((s) => s.settings.sync?.autoSyncIntervalMin);
  const startSyncedRef = useRef(false);

  // 1. 앱 시작 시 동기화 (2초 딜레이 — Drive 동기화 우선)
  useEffect(() => {
    if (!isEnabled || !taskListId || !autoSyncOnStart) return;
    if (startSyncedRef.current) return;
    startSyncedRef.current = true;
    const timer = setTimeout(() => {
      void useTasksSyncStore.getState().syncNow();
    }, 2000);
    return () => clearTimeout(timer);
  }, [isEnabled, taskListId, autoSyncOnStart]);

  // 2. 저장 시 동기화 (todo 변경 후 2500ms 디바운스)
  useEffect(() => {
    if (!autoSyncOnSave) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const debouncedSync = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (!useTasksSyncStore.getState().isEnabled) return;
        if (useTasksSyncStore.getState().isSyncing) return;
        void useTasksSyncStore.getState().syncNow();
      }, 2500);
    };

    // todos 레퍼런스 변화만 감지 (categories/loaded 변경은 무시)
    let prevTodos = useTodoStore.getState().todos;
    const unsubscribe = useTodoStore.subscribe((state) => {
      if (state.todos !== prevTodos) {
        prevTodos = state.todos;
        if (useTasksSyncStore.getState().isEnabled) {
          debouncedSync();
        }
      }
    });

    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [autoSyncOnSave]);

  // 3. 주기적 동기화 (autoSyncIntervalMin 분 간격, 0이면 비활성)
  useEffect(() => {
    if (!isEnabled || !taskListId) return;
    if (!autoSyncIntervalMin || autoSyncIntervalMin <= 0) return;

    const intervalMs = autoSyncIntervalMin * 60 * 1000;
    const timer = setInterval(() => {
      const s = useTasksSyncStore.getState();
      if (s.isEnabled && !s.isSyncing) {
        void s.syncNow();
      }
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isEnabled, taskListId, autoSyncIntervalMin]);

  // 4. 창 포커스 시 동기화 (10초 쿨다운)
  useEffect(() => {
    if (!isEnabled || !taskListId) return;

    const COOLDOWN_MS = 10_000;
    const handler = () => {
      const s = useTasksSyncStore.getState();
      if (!s.isEnabled) return;
      const last = s.lastSyncedAt ? new Date(s.lastSyncedAt).getTime() : 0;
      if (Date.now() - last < COOLDOWN_MS) return;
      if (s.isSyncing) return;
      void s.syncNow();
    };
    window.addEventListener('focus', handler);
    return () => window.removeEventListener('focus', handler);
  }, [isEnabled, taskListId]);
}
