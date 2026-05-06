import { useEffect, useRef } from 'react';
import { useTasksSyncStore } from '@adapters/stores/useTasksSyncStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useTodoStore } from '@adapters/stores/useTodoStore';

/**
 * 일일 쿼터 쿨다운 중인지 확인.
 * 쿨다운 중이면 어떤 트리거도 syncNow를 호출하지 않는다 (스토어 안에서도 동일 가드가
 * 있지만, 여기서 1차 차단해 setTimeout/intervals가 무의미하게 깨어나는 것을 줄인다).
 */
function isInQuotaCooldown(): boolean {
  const until = useTasksSyncStore.getState().quotaCooldownUntil;
  if (!until) return false;
  const ms = new Date(until).getTime();
  return Number.isFinite(ms) && Date.now() < ms;
}

/**
 * 자동 동기화 주기 최소값(분).
 * Google Tasks 일일 쿼터(50K) + listTasks 페이지네이션을 고려한 안전 하한선.
 * 사용자가 1분 등 너무 짧은 값을 설정해도 5분으로 클램프된다.
 */
const MIN_AUTO_SYNC_INTERVAL_MIN = 5;

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
      if (isInQuotaCooldown()) return;
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
        if (isInQuotaCooldown()) return;
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
  // 너무 짧은 주기는 일일 쿼터를 빠르게 소진하므로 MIN_AUTO_SYNC_INTERVAL_MIN으로 클램프.
  useEffect(() => {
    if (!isEnabled || !taskListId) return;
    if (!autoSyncIntervalMin || autoSyncIntervalMin <= 0) return;

    const effectiveMin = Math.max(autoSyncIntervalMin, MIN_AUTO_SYNC_INTERVAL_MIN);
    const intervalMs = effectiveMin * 60 * 1000;
    const timer = setInterval(() => {
      const s = useTasksSyncStore.getState();
      if (!s.isEnabled || s.isSyncing) return;
      if (isInQuotaCooldown()) return;
      void s.syncNow();
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
      if (isInQuotaCooldown()) return;
      const last = s.lastSyncedAt ? new Date(s.lastSyncedAt).getTime() : 0;
      if (Date.now() - last < COOLDOWN_MS) return;
      if (s.isSyncing) return;
      void s.syncNow();
    };
    window.addEventListener('focus', handler);
    return () => window.removeEventListener('focus', handler);
  }, [isEnabled, taskListId]);
}
