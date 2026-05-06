import { create } from 'zustand';
import { NEIS_API_KEY } from '@domain/entities/Meal';
import { DEFAULT_NEIS_SCHEDULE_SETTINGS, NEIS_SCHEDULE_CATEGORY } from '@domain/entities/NeisSchedule';
import type { NeisScheduleSettings, NeisGroup } from '@domain/entities/NeisSchedule';
import type { SyncResult } from '@usecases/events/SyncNeisSchedule';
import { SyncNeisSchedule } from '@usecases/events/SyncNeisSchedule';
import { neisPort, eventsRepository, settingsRepository } from '@adapters/di/container';
import { useEventsStore } from './useEventsStore';
import { useSettingsStore } from './useSettingsStore';

/**
 * v2.0.3 이전 사용자가 저장한 NeisScheduleSettings는 새 google-sync 필드가 없을 수 있다.
 * 마이그레이션: 누락된 필드만 DEFAULT로 채워 일관 상태 보장.
 */
function migrateSettings(stored: Partial<NeisScheduleSettings> | null | undefined): NeisScheduleSettings {
  return {
    ...DEFAULT_NEIS_SCHEDULE_SETTINGS,
    ...(stored ?? {}),
    googleSyncGroups: {
      ...DEFAULT_NEIS_SCHEDULE_SETTINGS.googleSyncGroups,
      ...(stored?.googleSyncGroups ?? {}),
    },
    googleSyncExcludedIds: stored?.googleSyncExcludedIds ?? [],
    googleSyncIncludedIds: stored?.googleSyncIncludedIds ?? [],
    googleSyncSuggestionDismissed: stored?.googleSyncSuggestionDismissed ?? false,
  };
}

export type NeisSyncStatus = 'idle' | 'syncing' | 'success' | 'error';

interface NeisScheduleState {
  // 동기화 상태
  syncStatus: NeisSyncStatus;
  lastSyncResult: SyncResult | null;
  errorMessage: string | null;

  // 설정 (캐시)
  settings: NeisScheduleSettings;

  // 액션
  loadSettings: () => Promise<void>;
  updateSettings: (partial: Partial<NeisScheduleSettings>) => Promise<void>;
  syncNow: () => Promise<SyncResult | null>;
  syncIfNeeded: () => Promise<SyncResult | null>;
  toggleEnabled: (enabled: boolean) => Promise<void>;
  removeAllNeisEvents: () => Promise<number>;

  // 구글 캘린더 동기화 — 그룹/개별 선택 액션
  setGoogleSyncGroup: (group: NeisGroup, enabled: boolean) => Promise<void>;
  toggleEventInclusion: (eventId: string, included: boolean) => Promise<void>;
  resetGroupSelection: () => Promise<void>;
}

const syncUseCase = new SyncNeisSchedule(neisPort, eventsRepository, settingsRepository);

export const useNeisScheduleStore = create<NeisScheduleState>((set, get) => ({
  syncStatus: 'idle',
  lastSyncResult: null,
  errorMessage: null,
  settings: { ...DEFAULT_NEIS_SCHEDULE_SETTINGS },

  loadSettings: async () => {
    const settingsState = useSettingsStore.getState();
    if (!settingsState.loaded) await settingsState.load();

    const fullSettings = useSettingsStore.getState().settings;
    // 마이그레이션: 새 google-sync 필드 누락 시 DEFAULT로 채움
    const neisSchedule = migrateSettings(fullSettings.neisSchedule);
    set({ settings: neisSchedule });
  },

  updateSettings: async (partial) => {
    const current = get().settings;
    const updated: NeisScheduleSettings = { ...current, ...partial };
    set({ settings: updated });

    // Settings 저장소에도 반영
    await useSettingsStore.getState().update({ neisSchedule: updated });
  },

  syncNow: async () => {
    const state = get();
    if (state.syncStatus === 'syncing') return null;

    set({ syncStatus: 'syncing', errorMessage: null });

    try {
      const result = await syncUseCase.syncNow(NEIS_API_KEY);

      // 설정 업데이트 (lastSyncAt, syncedCount)
      const now = new Date().toISOString();
      await get().updateSettings({
        lastSyncAt: now,
        syncedCount: result.total,
      });

      // 이벤트 스토어 새로고침
      const eventsState = useEventsStore.getState();
      const data = await eventsRepository.getEvents();
      if (data) {
        // 직접 상태 설정 (loaded를 false로 변경하지 않고)
        useEventsStore.setState({
          events: data.events,
          categories: data.categories ?? eventsState.categories,
        });
      }

      set({
        syncStatus: 'success',
        lastSyncResult: result,
      });

      // NEIS 동기화 완료 후 구글 캘린더 동기화 제안 체크 (dynamic import로 순환 참조 방지)
      try {
        const { useCalendarSyncStore } = await import('./useCalendarSyncStore');
        void useCalendarSyncStore.getState().checkNeisSyncSuggestion();
      } catch {
        // 무시 — 제안 체크 실패가 NEIS 동기화 결과에 영향을 주지 않게
      }

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : '동기화 중 오류가 발생했습니다.';
      set({
        syncStatus: 'error',
        errorMessage: message,
      });
      return null;
    }
  },

  syncIfNeeded: async () => {
    const state = get();
    if (state.syncStatus === 'syncing') return null;
    if (!state.settings.enabled || !state.settings.autoSync) return null;

    // lastSyncAt 기준 간격 확인
    if (state.settings.lastSyncAt) {
      const lastSync = new Date(state.settings.lastSyncAt).getTime();
      const intervalMs = (state.settings.syncIntervalHours ?? 24) * 60 * 60 * 1000;
      if (Date.now() - lastSync < intervalMs) return null;
    }

    return get().syncNow();
  },

  toggleEnabled: async (enabled) => {
    await get().updateSettings({ enabled });

    if (enabled) {
      // ON 시: NEIS 카테고리 확인 후 즉시 동기화
      const eventsState = useEventsStore.getState();
      const hasCategory = eventsState.categories.some(
        (c) => c.id === NEIS_SCHEDULE_CATEGORY.id,
      );
      if (!hasCategory) {
        // 고정 ID가 필요하므로 직접 저장
        const { ManageEvents } = await import('@usecases/events/ManageEvents');
        const manageEvents = new ManageEvents(eventsRepository);
        await manageEvents.addCategory({
          id: NEIS_SCHEDULE_CATEGORY.id,
          name: NEIS_SCHEDULE_CATEGORY.name,
          color: NEIS_SCHEDULE_CATEGORY.color,
        });
        const cats = await manageEvents.getCategories();
        useEventsStore.setState({ categories: cats });
      }

      // 즉시 동기화
      void get().syncNow();
    }
  },

  removeAllNeisEvents: async () => {
    const removed = await syncUseCase.removeAllNeisEvents();

    // 이벤트 스토어 새로고침
    const data = await eventsRepository.getEvents();
    if (data) {
      useEventsStore.setState({ events: data.events });
    }

    return removed;
  },

  setGoogleSyncGroup: async (group, enabled) => {
    const current = get().settings;
    await get().updateSettings({
      googleSyncGroups: { ...current.googleSyncGroups, [group]: enabled },
    });
  },

  toggleEventInclusion: async (eventId, included) => {
    // 우선순위: includedIds > excludedIds > 그룹 토글
    // included=true 누르면: includedIds에 추가, excludedIds에서 제거
    // included=false 누르면: excludedIds에 추가, includedIds에서 제거
    const s = get().settings;
    const newIncluded = included
      ? Array.from(new Set([...s.googleSyncIncludedIds, eventId]))
      : s.googleSyncIncludedIds.filter((id) => id !== eventId);
    const newExcluded = !included
      ? Array.from(new Set([...s.googleSyncExcludedIds, eventId]))
      : s.googleSyncExcludedIds.filter((id) => id !== eventId);
    await get().updateSettings({
      googleSyncIncludedIds: newIncluded,
      googleSyncExcludedIds: newExcluded,
    });
  },

  resetGroupSelection: async () => {
    await get().updateSettings({
      googleSyncGroups: { ...DEFAULT_NEIS_SCHEDULE_SETTINGS.googleSyncGroups },
      googleSyncExcludedIds: [],
      googleSyncIncludedIds: [],
    });
  },
}));
