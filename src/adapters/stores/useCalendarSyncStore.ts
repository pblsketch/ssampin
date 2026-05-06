import { create } from 'zustand';
import type { CalendarMapping } from '@domain/entities/CalendarMapping';
import type { SyncState, SyncStatus } from '@domain/entities/SyncState';
import type { GoogleCalendarInfo } from '@domain/entities/GoogleCalendarInfo';
import type { SchoolEvent } from '@domain/entities/SchoolEvent';
import type { GoogleCalendarEvent } from '@domain/ports/IGoogleCalendarPort';
// DI container에서 use case와 repository를 가져올 것 (dynamic import로 순환 참조 방지)

/** PKCE 모달 입력값에서 OAuth code 추출 (URL 통째로 또는 raw code 모두 허용) */
function extractAuthCode(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const url = new URL(trimmed);
      const code = url.searchParams.get('code');
      if (code) return code;
    }
  } catch {
    // 다음 단계로
  }
  const codeMatch = trimmed.match(/(?:^|[?&])code=([^&\s]+)/);
  if (codeMatch && codeMatch[1]) return decodeURIComponent(codeMatch[1]);
  if (/^[\w/_-]+$/.test(trimmed)) return trimmed;
  return null;
}

/** OAuth 에러 정보 (에러 모달 표시용) */
interface OAuthError {
  code: string;
  message: string;
}

interface CalendarSyncState {
  // 연결 상태
  isConnected: boolean;
  email: string | null;
  isLoading: boolean;
  error: string | null;

  // OAuth 에러 (모달 표시용)
  oauthError: OAuthError | null;
  // PKCE 폴백 모달 표시
  showPKCEFallback: boolean;

  // OAuth 콜백 대기 중 폴백 제안 상태
  showFallbackSuggestion: boolean;
  fallbackSuggestionData: { reason: string; message: string; elapsedSec: number } | null;

  // 동기화 상태
  syncState: SyncState;
  mappings: readonly CalendarMapping[];
  googleCalendars: readonly GoogleCalendarInfo[];

  // 충돌
  conflicts: readonly { local: SchoolEvent; remote: GoogleCalendarEvent }[];

  // 동기화 설정
  syncInterval: number;  // 분 단위
  syncOnStart: boolean;
  syncOnFocus: boolean;
  autoResolveConflicts: boolean;

  // 캘린더 선택 모달 표시 (최초 연결 후)
  showCalendarPicker: boolean;

  // NEIS 학사일정 → 구글 캘린더 동기화 제안 (배너 + 진행률)
  showNeisSyncSuggestion: boolean;
  neisSyncSuggestionDismissed: boolean;
  neisSyncInProgress: boolean;
  neisSyncProgress: { current: number; total: number };

  // 액션
  initialize: () => Promise<void>;
  startAuth: (forceAccountSelect?: boolean, additionalScopes?: readonly string[]) => Promise<void>;
  cancelAuth: () => Promise<void>;
  completeAuth: (code: string, redirectUri: string) => Promise<void>;
  startPKCEFallback: (forceAccountSelect?: boolean, additionalScopes?: readonly string[]) => Promise<void>;
  completePKCEAuth: (code: string) => Promise<void>;
  disconnect: () => Promise<void>;
  setError: (error: string | null) => void;
  setOAuthError: (error: OAuthError | null) => void;
  setShowPKCEFallback: (show: boolean) => void;
  setShowFallbackSuggestion: (show: boolean) => void;
  acceptFallback: () => Promise<void>;
  setSyncStatus: (status: SyncStatus) => void;
  setMappings: (mappings: readonly CalendarMapping[]) => void;
  setSyncInterval: (minutes: number) => void;
  setSyncOnStart: (value: boolean) => void;
  setSyncOnFocus: (value: boolean) => void;
  setAutoResolveConflicts: (value: boolean) => void;
  setShowCalendarPicker: (show: boolean) => void;
  fetchGoogleCalendars: () => Promise<void>;
  updateMappings: (mappings: readonly CalendarMapping[]) => Promise<void>;
  syncNow: () => Promise<void>;
  startPeriodicSync: () => () => void;
  addConflict: (local: SchoolEvent, remote: GoogleCalendarEvent) => void;
  resolveConflict: (index: number, resolution: 'local' | 'remote') => Promise<void>;

  // NEIS → 구글 캘린더 동기화 제안 액션
  checkNeisSyncSuggestion: () => Promise<void>;
  dismissNeisSyncSuggestion: () => void;
  dismissNeisSyncSuggestionPermanent: () => Promise<void>;
  acceptNeisSyncSuggestion: () => Promise<void>;
  disconnectNeisFromGoogle: (deleteRemoteEvents: boolean) => Promise<void>;
}

// syncNow 동시 실행 방지 뮤텍스
let syncPromise: Promise<void> | null = null;

export const useCalendarSyncStore = create<CalendarSyncState>((set, get) => ({
  isConnected: false,
  email: null,
  isLoading: false,
  error: null,
  oauthError: null,
  showPKCEFallback: false,
  showFallbackSuggestion: false,
  fallbackSuggestionData: null,
  syncState: {
    status: 'idle',
    pendingChanges: 0,
    syncTokens: {},
  },
  mappings: [],
  googleCalendars: [],
  conflicts: [],
  syncInterval: 5,
  syncOnStart: true,
  syncOnFocus: true,
  autoResolveConflicts: true,
  showCalendarPicker: false,
  showNeisSyncSuggestion: false,
  neisSyncSuggestionDismissed: false,
  neisSyncInProgress: false,
  neisSyncProgress: { current: 0, total: 0 },

  initialize: async () => {
    try {
      const { authenticateGoogle, calendarSyncRepo } = await import('@adapters/di/container');
      const connected = await authenticateGoogle.isConnected();
      if (connected) {
        const email = await authenticateGoogle.getEmail();
        const mappings = await calendarSyncRepo.getMappings();
        // 매핑이 없으면 연결 상태만 설정하고 동기화는 스킵
        if (mappings.length === 0) {
          set({ isConnected: true, email, mappings });
          return;
        }
        const syncState = await calendarSyncRepo.getSyncState();
        set({ isConnected: true, email, mappings, syncState });
      }
    } catch (err) {
      console.error('[CalendarSync] initialize error:', err);
    }
  },

  startAuth: async (forceAccountSelect?: boolean, additionalScopes?: readonly string[]) => {
    console.log('[CalendarSync] startAuth begin');
    set({ isLoading: true, error: null, showFallbackSuggestion: false, fallbackSuggestionData: null });
    try {
      const api = window.electronAPI;
      if (!api?.startOAuth) {
        throw new Error('구글 캘린더 연결은 데스크톱 앱에서만 가능합니다. Electron 모드로 실행해주세요.');
      }

      const { authenticateGoogle } = await import('@adapters/di/container');
      const shouldSelectAccount = forceAccountSelect ?? !get().isConnected;
      const authUrl = authenticateGoogle.getAuthUrl('http://127.0.0.1:0/callback', shouldSelectAccount, additionalScopes);

      let fallbackCleanup: (() => void) | null = null;
      if (api.onOAuthFallbackNeeded) {
        fallbackCleanup = api.onOAuthFallbackNeeded((data) => {
          set({ showFallbackSuggestion: true, fallbackSuggestionData: data });
        });
      }

      try {
        console.log('[CalendarSync] awaiting api.startOAuth');
        const result = await api.startOAuth(authUrl);
        console.log('[CalendarSync] startOAuth resolved', { hasCode: Boolean(result?.code) });
        set({ showFallbackSuggestion: false, fallbackSuggestionData: null });
        await get().completeAuth(result.code, result.redirectUri);
      } finally {
        fallbackCleanup?.();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '인증 중 오류가 발생했습니다.';
      if (msg.includes('access_denied')) {
        set({
          error: '구글 인증이 거부되었습니다. 다시 시도해주세요.',
          isLoading: false,
        });
      } else if (msg.includes('superseded by new request')) {
        // 새 요청이 진행 중 — isLoading은 새 요청이 관리하므로 건드리지 않음
      } else if (msg.includes('cancelled')) {
        // 사용자가 취소함 — 에러 표시하지 않음
        set({
          isLoading: false,
          error: null,
          showFallbackSuggestion: false,
          fallbackSuggestionData: null,
        });
      } else if (msg.includes('localhost blocked') || msg.includes('PKCE fallback offered')) {
        // PKCE 폴백으로 처리 중 — 에러 표시하지 않음 (모달이 대신 안내)
        set({ isLoading: false });
      } else {
        set({ error: msg, isLoading: false });
      }
    }
  },

  cancelAuth: async () => {
    try {
      const api = window.electronAPI;
      if (api?.cancelOAuth) {
        await api.cancelOAuth();
      }
    } catch (err) {
      console.error('[CalendarSync] cancelAuth error:', err);
    }
    set({
      isLoading: false,
      error: null,
      showFallbackSuggestion: false,
      fallbackSuggestionData: null,
    });
  },

  completeAuth: async (code: string, redirectUri: string) => {
    console.log('[CalendarSync] completeAuth start', { redirectUri });
    set({ isLoading: true, error: null });
    try {
      const { authenticateGoogle } = await import('@adapters/di/container');
      const tokens = await authenticateGoogle.authenticate(code, redirectUri);
      console.log('[CalendarSync] completeAuth tokens saved');

      // 토큰 저장 직후 즉시 연결 상태 마크 — 캘린더 프리로드는 백그라운드 분리.
      set({
        isConnected: true,
        email: tokens.email,
        isLoading: false,
        error: null,
      });

      void (async () => {
        try {
          const { manageCalendarMapping } = await import('@adapters/di/container');
          const calendars = await manageCalendarMapping.listGoogleCalendars();
          set({
            googleCalendars: calendars,
            showCalendarPicker: true,
          });
          console.log('[CalendarSync] background calendar preload done', calendars.length);
        } catch (fetchErr) {
          console.error('[CalendarSync] post-auth calendar fetch error:', fetchErr);
        }
      })();
    } catch (err) {
      console.error('[CalendarSync] completeAuth error', err);
      set({
        error: err instanceof Error ? err.message : '인증 완료 중 오류가 발생했습니다.',
        isLoading: false,
      });
    }
  },

  startPKCEFallback: async (forceAccountSelect?: boolean, additionalScopes?: readonly string[]) => {
    set({ isLoading: true, error: null, oauthError: null });
    try {
      const api = window.electronAPI;
      if (!api?.startPKCEAuth) {
        throw new Error('PKCE 인증은 데스크톱 앱에서만 가능합니다.');
      }

      const { authenticateGoogle } = await import('@adapters/di/container');
      const shouldSelectAccount = forceAccountSelect ?? !get().isConnected;
      const authUrl = authenticateGoogle.getAuthUrl('http://127.0.0.1:0/callback', shouldSelectAccount, additionalScopes);

      // PKCE 시작: 브라우저에서 인증 URL 열기
      await api.startPKCEAuth(authUrl);

      // 수동 인증 코드 입력 모달 표시
      set({ isLoading: false, showPKCEFallback: true });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'PKCE 인증 시작 중 오류가 발생했습니다.',
        isLoading: false,
      });
    }
  },

  completePKCEAuth: async (codeOrUrl: string) => {
    set({ isLoading: true, error: null });
    try {
      const api = window.electronAPI;
      if (!api?.exchangePKCECode) {
        throw new Error('PKCE 인증은 데스크톱 앱에서만 가능합니다.');
      }

      const code = extractAuthCode(codeOrUrl);
      if (!code) {
        throw new Error('인증 코드를 찾지 못했습니다. 브라우저 주소창의 URL 또는 code= 값을 그대로 붙여넣어주세요.');
      }

      const { verifier, redirectUri } = await api.exchangePKCECode();

      const { authenticateGoogle } = await import('@adapters/di/container');
      const tokens = await authenticateGoogle.authenticate(code, redirectUri, verifier);

      // 즉시 연결 상태 마크 + 백그라운드 캘린더 프리로드
      set({
        isConnected: true,
        email: tokens.email,
        isLoading: false,
        error: null,
        showPKCEFallback: false,
      });

      void (async () => {
        try {
          const { manageCalendarMapping } = await import('@adapters/di/container');
          const calendars = await manageCalendarMapping.listGoogleCalendars();
          set({ googleCalendars: calendars, showCalendarPicker: true });
        } catch (fetchErr) {
          console.error('[CalendarSync] post-PKCE-auth calendar fetch error:', fetchErr);
        }
      })();
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'PKCE 인증 완료 중 오류가 발생했습니다.',
        isLoading: false,
      });
    }
  },

  disconnect: async () => {
    set({ isLoading: true });
    try {
      const { authenticateGoogle, eventsRepository } = await import('@adapters/di/container');

      // 1. 토큰 폐기 + 삭제
      await authenticateGoogle.disconnect();

      // 2. 구글에서 동기화된 일정 삭제
      const evData = await eventsRepository.getEvents();
      if (evData) {
        const cleanedEvents = evData.events.filter(
          (e) => e.source !== 'google' && !e.googleEventId,
        );
        // 매핑에서 생성된 구글 캘린더 전용 카테고리도 정리
        const googleCalendarIds = new Set(
          get().mappings
            .filter((m) => m.googleCalendarId)
            .map((m) => m.categoryId),
        );
        const cleanedCategories = (evData.categories ?? []).filter(
          (c) => !googleCalendarIds.has(c.id),
        );
        await eventsRepository.saveEvents({
          events: cleanedEvents,
          categories: cleanedCategories,
        });
      }

      // 3. 상태 초기화
      set({
        isConnected: false,
        email: null,
        isLoading: false,
        mappings: [],
        syncState: { status: 'idle', pendingChanges: 0, syncTokens: {} },
        googleCalendars: [],
        conflicts: [],
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : '연결 해제 중 오류가 발생했습니다.',
        isLoading: false,
      });
    }
  },

  setError: (error) => set({ error }),
  setOAuthError: (oauthError) => set({ oauthError }),
  setShowPKCEFallback: (showPKCEFallback) => set({ showPKCEFallback }),
  setShowFallbackSuggestion: (show) => set({ showFallbackSuggestion: show, ...(!show && { fallbackSuggestionData: null }) }),
  acceptFallback: async () => {
    // 1. 로컬 서버 OAuth 취소
    const api = window.electronAPI;
    if (api?.cancelOAuth) {
      await api.cancelOAuth();
    }
    // 2. 폴백 제안 닫기
    set({ showFallbackSuggestion: false, fallbackSuggestionData: null, isLoading: false });
    // 3. PKCE 폴백 시작
    await get().startPKCEFallback();
  },
  setSyncStatus: (status) => set((state) => ({
    syncState: { ...state.syncState, status },
  })),
  setMappings: (mappings) => set({ mappings }),
  setSyncInterval: (syncInterval) => set({ syncInterval }),
  setSyncOnStart: (syncOnStart) => set({ syncOnStart }),
  setSyncOnFocus: (syncOnFocus) => set({ syncOnFocus }),
  setAutoResolveConflicts: (autoResolveConflicts) => set({ autoResolveConflicts }),
  setShowCalendarPicker: (showCalendarPicker) => set({ showCalendarPicker }),

  fetchGoogleCalendars: async () => {
    const { manageCalendarMapping } = await import('@adapters/di/container');
    const calendars = await manageCalendarMapping.listGoogleCalendars();
    set({ googleCalendars: calendars });
  },

  updateMappings: async (mappings) => {
    try {
      const { manageCalendarMapping } = await import('@adapters/di/container');
      await manageCalendarMapping.saveMappings(mappings);
      set({ mappings });
    } catch (err) {
      console.error('[CalendarSync] updateMappings error:', err);
    }
  },

  syncNow: async () => {
    const state = get();
    if (!state.isConnected) return;

    // 이미 진행 중인 동기화가 있으면 그 Promise를 기다림 (중복 실행 방지)
    if (syncPromise) {
      await syncPromise;
      return;
    }

    set((s) => ({ syncState: { ...s.syncState, status: 'syncing' } }));

    syncPromise = (async () => {
      try {
        const { syncFromGoogle, calendarSyncRepo } = await import('@adapters/di/container');
        await syncFromGoogle.execute();
        const syncState = await calendarSyncRepo.getSyncState();
        set({ syncState });

        // 동기화 후 이벤트 스토어 갱신 (UI에 반영)
        const { useEventsStore } = await import('./useEventsStore');
        await useEventsStore.getState().reload();
      } catch (err) {
        console.error('[CalendarSync] syncNow error:', err);
        set((s) => ({
          syncState: { ...s.syncState, status: 'error', lastError: err instanceof Error ? err.message : 'Sync failed' },
        }));
      }
    })();

    try {
      await syncPromise;
    } finally {
      syncPromise = null;
    }
  },

  startPeriodicSync: () => {
    const state = get();
    const intervalMs = state.syncInterval * 60 * 1000;
    const timer = window.setInterval(() => {
      void get().syncNow();
    }, intervalMs);
    return () => window.clearInterval(timer);
  },

  addConflict: (local, remote) => {
    set((s) => ({ conflicts: [...s.conflicts, { local, remote }] }));
  },

  resolveConflict: async (index, resolution) => {
    const state = get();
    const conflict = state.conflicts[index];
    if (!conflict) return;
    try {
      if (resolution === 'local') {
        const { syncToGoogle } = await import('@adapters/di/container');
        await syncToGoogle.syncEvent(conflict.local);
      } else {
        const { fromGoogleEvent } = await import('@domain/rules/calendarSyncRules');
        const updatedEvent = fromGoogleEvent(
          conflict.remote,
          conflict.local.googleCalendarId ?? '',
          conflict.local.category,
        );
        const { useEventsStore } = await import('./useEventsStore');
        await useEventsStore.getState().updateEvent({ ...updatedEvent, id: conflict.local.id });
      }
      set((s) => ({
        conflicts: s.conflicts.filter((_, i) => i !== index),
      }));
    } catch (err) {
      console.error('[CalendarSync] resolveConflict error:', err);
    }
  },

  checkNeisSyncSuggestion: async () => {
    const state = get();
    if (state.neisSyncSuggestionDismissed) return;
    if (!state.isConnected) return;
    // 매핑이 어떤 형태로든 있으면(syncEnabled=false 포함) 띄우지 않음 — 사용자 의도 존중
    if (state.mappings.some((m) => m.categoryId === 'neis-schedule')) return;

    // 영구 dismiss 가드 — 사용자가 "다시 보지 않기"를 누른 적 있으면 안 띄움
    const { useNeisScheduleStore } = await import('./useNeisScheduleStore');
    const neisState = useNeisScheduleStore.getState();
    // settings 로드 보장
    if (neisState.settings === useNeisScheduleStore.getState().settings) {
      // loaded 여부 추적이 없으니 항상 한 번 load 호출 (idempotent)
      await neisState.loadSettings();
    }
    if (useNeisScheduleStore.getState().settings.googleSyncSuggestionDismissed) {
      return;
    }

    // events 스토어가 아직 로드되지 않았을 가능성 → 안전하게 dynamic import + 로드 보장
    const { useEventsStore } = await import('./useEventsStore');
    const eventsState = useEventsStore.getState();
    if (!eventsState.loaded) {
      await eventsState.load();
    }
    const hasNeisEvents = useEventsStore.getState().events.some(
      (e) => e.category === 'neis-schedule',
    );
    if (!hasNeisEvents) return;

    set({ showNeisSyncSuggestion: true });
  },

  dismissNeisSyncSuggestion: () => {
    // 임시 dismiss — 메모리만. 앱 재시작하면 다시 체크.
    set({ showNeisSyncSuggestion: false, neisSyncSuggestionDismissed: true });
  },

  dismissNeisSyncSuggestionPermanent: async () => {
    // 영구 dismiss — settings에 저장해 다음 세션에도 안 뜸.
    set({ showNeisSyncSuggestion: false, neisSyncSuggestionDismissed: true });
    try {
      const { useNeisScheduleStore } = await import('./useNeisScheduleStore');
      await useNeisScheduleStore.getState().updateSettings({
        googleSyncSuggestionDismissed: true,
      });
      console.log('[NeisSync] suggestion permanently dismissed');
    } catch (err) {
      console.error('[NeisSync] permanent dismiss failed:', err);
    }
  },

  acceptNeisSyncSuggestion: async () => {
    if (get().neisSyncInProgress) return;
    if (!get().isConnected) {
      const { useToastStore } = await import('@adapters/components/common/Toast');
      useToastStore.getState().show('먼저 구글 캘린더를 연결해주세요.', 'error');
      return;
    }
    set({ neisSyncInProgress: true, neisSyncProgress: { current: 0, total: 0 } });
    console.log('[NeisSync] accept start');

    try {
      const { NEIS_SCHEDULE_CATEGORY } = await import('@domain/entities/NeisSchedule');

      // 1) 기존 매핑 확인 — 멱등 처리. 이미 있으면 syncEnabled를 켜기만 하고 그대로 사용.
      const existingMapping = get().mappings.find((m) => m.categoryId === NEIS_SCHEDULE_CATEGORY.id);

      if (existingMapping && existingMapping.googleCalendarId) {
        console.log('[NeisSync] reusing existing mapping:', existingMapping.googleCalendarId);
        if (!existingMapping.syncEnabled) {
          const updated = get().mappings.map((m) =>
            m.categoryId === NEIS_SCHEDULE_CATEGORY.id ? { ...m, syncEnabled: true } : m,
          );
          await get().updateMappings(updated);
          console.log('[NeisSync] re-enabled existing mapping');
        }
      } else {
        // googleCalendars 비어있으면 먼저 채우기 (앱 재시작 후 첫 수락 케이스)
        if (get().googleCalendars.length === 0) {
          console.log('[NeisSync] fetching googleCalendars (empty)');
          await get().fetchGoogleCalendars();
          console.log('[NeisSync] googleCalendars fetched, count:', get().googleCalendars.length);
        }
        const calendars = get().googleCalendars;
        const primary = calendars.find((c) => c.primary === true) ?? calendars[0];
        if (!primary) {
          throw new Error('구글 캘린더 목록을 불러올 수 없습니다. 잠시 후 다시 시도해주세요.');
        }
        console.log('[NeisSync] primary calendar:', primary.id, primary.summary);

        const newMapping: CalendarMapping = {
          categoryId: NEIS_SCHEDULE_CATEGORY.id,
          categoryName: NEIS_SCHEDULE_CATEGORY.name,
          syncEnabled: true,
          googleCalendarId: primary.id,
          googleCalendarName: primary.summary,
          syncDirection: 'toGoogle',
        };
        console.log('[NeisSync] saving new mapping...');
        await get().updateMappings([...get().mappings, newMapping]);
        console.log('[NeisSync] mapping saved');
      }

      // 2) NEIS 이벤트 일괄 푸시
      const { useEventsStore } = await import('./useEventsStore');
      const { eventsRepository, syncToGoogle } = await import('@adapters/di/container');
      const neisEvents = useEventsStore.getState().events.filter(
        (e) => e.category === 'neis-schedule',
      );
      console.log('[NeisSync] start pushing events, total:', neisEvents.length);

      if (neisEvents.length === 0) {
        const { useToastStore } = await import('@adapters/components/common/Toast');
        useToastStore.getState().show(
          'NEIS 학사일정이 없어요. 먼저 설정에서 학사일정 동기화를 켜고 일정을 가져와주세요.',
          'info',
        );
        set({ showNeisSyncSuggestion: false });
        return;
      }

      // 그룹/개별 선택 설정 로드 + 분기 — push/update/delete/skip 결정
      const { shouldSyncToGoogle } = await import('@domain/entities/NeisSchedule');
      const { useNeisScheduleStore } = await import('./useNeisScheduleStore');
      const neisSettings = useNeisScheduleStore.getState().settings;

      const toSync: SchoolEvent[] = [];   // create or update
      const toDelete: SchoolEvent[] = []; // 이미 푸시된 일정인데 사용자가 OFF로 변경
      let skippedCount = 0;
      for (const ev of neisEvents) {
        const should = ev.neis
          ? shouldSyncToGoogle(
              { eventId: ev.neis.eventId, title: ev.title, subtractDayType: ev.neis.subtractDayType },
              neisSettings,
            )
          : false;
        const isPushed = !!ev.googleEventId;
        if (should) {
          toSync.push(ev); // create or update — syncEvent가 분기
        } else if (isPushed) {
          toDelete.push(ev); // 사용자가 OFF로 변경한 기존 푸시 일정
        } else {
          skippedCount += 1;
        }
      }
      const totalWork = toSync.length + toDelete.length;
      console.log('[NeisSync] plan: sync', toSync.length, '+ delete', toDelete.length, '+ skip', skippedCount);

      if (totalWork === 0) {
        const { useToastStore } = await import('@adapters/components/common/Toast');
        useToastStore.getState().show(
          '동기화 대상 학사일정이 없어요. 그룹을 1개 이상 선택해주세요.',
          'info',
        );
        set({ showNeisSyncSuggestion: false });
        return;
      }
      set({ neisSyncProgress: { current: 0, total: totalWork } });

      let successCount = 0;
      let deletedCount = 0;
      let failCount = 0;
      let firstError: string | null = null;
      let abortReason: 'rate_limit' | 'auth' | null = null;
      const updatedEvents: SchoolEvent[] = [];   // googleEventId 채워진 결과
      const clearedIds = new Set<string>();      // 삭제 후 메타 제거할 이벤트 id

      const handleApiError = (err: unknown, ev: SchoolEvent, op: string): boolean => {
        failCount += 1;
        const msg = err instanceof Error ? err.message : 'Unknown error';
        if (!firstError) firstError = msg;
        console.error(`[NeisSync] ${op} failed:`, ev.id, ev.title, err);
        if (
          msg.includes('429') ||
          msg.includes('Quota exceeded') ||
          /rate ?limit/i.test(msg) ||
          msg.includes('RESOURCE_EXHAUSTED')
        ) {
          abortReason = 'rate_limit';
          return true;
        }
        if (
          msg.includes('401') ||
          msg.includes('invalid_grant') ||
          msg.includes('UNAUTHENTICATED')
        ) {
          abortReason = 'auth';
          return true;
        }
        return false;
      };

      let progressIdx = 0;
      const reportProgress = () => {
        progressIdx += 1;
        set({ neisSyncProgress: { current: progressIdx, total: totalWork } });
        if (progressIdx % 10 === 0 || progressIdx === totalWork) {
          console.log(`[NeisSync] progress ${progressIdx}/${totalWork} (sync=${successCount}, del=${deletedCount}, fail=${failCount})`);
        }
      };

      // STEP A — 사용자가 OFF한 푸시 일정부터 구글에서 삭제 (사용자 의도가 즉각 반영)
      for (const ev of toDelete) {
        try {
          await syncToGoogle.deleteEvent(ev);
          deletedCount += 1;
          clearedIds.add(ev.id);
        } catch (err) {
          if (handleApiError(err, ev, 'deleteEvent')) break;
        }
        reportProgress();
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      // STEP B — 동기화 대상 push/update (abort 시 skip)
      if (!abortReason) {
        for (const ev of toSync) {
          try {
            const synced = await syncToGoogle.syncEvent(ev);
            if (synced.googleEventId) {
              updatedEvents.push(synced);
              successCount += 1;
            } else {
              console.warn('[NeisSync] event returned without googleEventId (mapping miss?):', ev.id, ev.title);
            }
          } catch (err) {
            if (handleApiError(err, ev, 'syncEvent')) break;
          }
          reportProgress();
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }
      console.log('[NeisSync] done — sync:', successCount, 'delete:', deletedCount, 'fail:', failCount, 'abort:', abortReason);

      // STEP C — events 저장소 일괄 갱신: 성공한 것만 메타 반영, 삭제된 것은 메타 제거
      if (updatedEvents.length > 0 || clearedIds.size > 0) {
        const allEvents = useEventsStore.getState().events;
        const updateMap = new Map(updatedEvents.map((e) => [e.id, e]));
        const merged = allEvents.map((e) => {
          if (updateMap.has(e.id)) return updateMap.get(e.id)!;
          if (clearedIds.has(e.id)) {
            // 삭제된 이벤트 — google 메타 정리
            const {
              googleEventId: _gid,
              googleCalendarId: _gcid,
              etag: _etag,
              googleUpdatedAt: _gupd,
              lastSyncedAt: _lsa,
              syncStatus: _sst,
              ...rest
            } = e;
            void _gid; void _gcid; void _etag; void _gupd; void _lsa; void _sst;
            return rest;
          }
          return e;
        });
        const evData = await eventsRepository.getEvents();
        await eventsRepository.saveEvents({
          events: merged,
          categories: evData?.categories,
        });
        useEventsStore.setState({ events: merged });
      }

      // STEP D — 토스트
      const { useToastStore } = await import('@adapters/components/common/Toast');
      if (abortReason === 'rate_limit') {
        useToastStore.getState().show(
          `구글 캘린더 일일 사용량 한도가 초과돼 동기화가 중단됐어요. (추가 ${successCount}, 제거 ${deletedCount}) 내일 다시 시도해주세요.`,
          'error',
        );
      } else if (abortReason === 'auth') {
        useToastStore.getState().show(
          '구글 인증이 만료됐어요. 설정 → 구글 계정에서 다시 로그인해주세요.',
          'error',
        );
      } else if (failCount === 0) {
        const parts: string[] = [];
        if (successCount > 0) parts.push(`추가 ${successCount}건`);
        if (deletedCount > 0) parts.push(`제거 ${deletedCount}건`);
        if (parts.length === 0) parts.push('변경 없음');
        useToastStore.getState().show(
          `구글 캘린더 동기화 완료 — ${parts.join(', ')}.`,
          'success',
        );
      } else {
        useToastStore.getState().show(
          `동기화 — 추가 ${successCount}, 제거 ${deletedCount}, 실패 ${failCount}${firstError ? `: ${firstError}` : ''}`,
          failCount === totalWork ? 'error' : 'info',
        );
      }

      // STEP E — 본 호출에서 *새로* 만든 매핑이고 0건 성공 + rate_limit/auth 중단인 경우 매핑 롤백.
      //          (사용자가 사전에 만든 매핑은 보존)
      const createdNewMapping = !existingMapping;
      if (abortReason && successCount === 0 && deletedCount === 0 && createdNewMapping) {
        const rolledBack = get().mappings.filter((m) => m.categoryId !== 'neis-schedule');
        await get().updateMappings(rolledBack);
        console.log('[NeisSync] rolled back newly-created NEIS mapping (no events synced)');
      }

      set({ showNeisSyncSuggestion: false });
    } catch (err) {
      console.error('[NeisSync] accept aborted:', err);
      const { useToastStore } = await import('@adapters/components/common/Toast');
      useToastStore.getState().show(
        `구글 캘린더 동기화 시작 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`,
        'error',
      );
    } finally {
      set({ neisSyncInProgress: false, neisSyncProgress: { current: 0, total: 0 } });
      console.log('[NeisSync] accept end');
    }
  },

  disconnectNeisFromGoogle: async (deleteRemoteEvents) => {
    if (get().neisSyncInProgress) return;
    set({ neisSyncInProgress: true, neisSyncProgress: { current: 0, total: 0 } });
    console.log('[NeisSync] disconnect start, deleteRemote:', deleteRemoteEvents);

    try {
      const { useEventsStore } = await import('./useEventsStore');
      const { eventsRepository, syncToGoogle } = await import('@adapters/di/container');

      let deletedCount = 0;
      let failedCount = 0;
      let firstError: string | null = null;
      let abortReason: 'rate_limit' | 'auth' | null = null;

      const allEvents = useEventsStore.getState().events;
      const neisWithGoogleId = allEvents.filter(
        (e) => e.category === 'neis-schedule' && e.googleEventId,
      );

      // calendarId fallback — 매핑 또는 events 자체에서 가장 신선한 calendarId 추출.
      // SyncToGoogle.deleteEvent는 ev.googleCalendarId가 없으면 silent return하므로
      // calendarId가 누락된 옛 이벤트를 위해 fallback이 필수다.
      const neisMapping = get().mappings.find((m) => m.categoryId === 'neis-schedule');
      const fallbackCalId =
        neisMapping?.googleCalendarId
        ?? allEvents.find((e) => e.category === 'neis-schedule' && e.googleCalendarId)?.googleCalendarId;
      let skippedNoCalId = 0;

      console.log(
        '[NeisSync] disconnect plan:',
        'totalWithGoogleId=', neisWithGoogleId.length,
        'withCalId=', neisWithGoogleId.filter((e) => e.googleCalendarId).length,
        'needFallback=', neisWithGoogleId.filter((e) => !e.googleCalendarId).length,
        'fallbackCalId=', fallbackCalId ?? '(none)',
      );

      // 1) 옵션: 구글 캘린더에서도 NEIS 이벤트 삭제
      if (deleteRemoteEvents && neisWithGoogleId.length > 0) {
        console.log('[NeisSync] deleting from Google, count:', neisWithGoogleId.length);
        set({ neisSyncProgress: { current: 0, total: neisWithGoogleId.length } });

        for (let i = 0; i < neisWithGoogleId.length; i++) {
          const original = neisWithGoogleId[i]!;
          // calendarId 보강 — ev에 없으면 fallback 적용
          const ev = original.googleCalendarId
            ? original
            : (fallbackCalId
              ? { ...original, googleCalendarId: fallbackCalId }
              : original);

          if (!ev.googleCalendarId) {
            // 캘린더 ID를 어디에서도 못 구하면 skip — 메타만 정리(STEP 2)
            skippedNoCalId += 1;
            console.warn('[NeisSync] skip delete (no calendarId):', original.id, original.title);
            set({ neisSyncProgress: { current: i + 1, total: neisWithGoogleId.length } });
            continue;
          }

          try {
            await syncToGoogle.deleteEvent(ev);
            deletedCount += 1;
          } catch (err) {
            failedCount += 1;
            const msg = err instanceof Error ? err.message : 'Unknown error';
            if (!firstError) firstError = msg;
            console.error('[NeisSync] deleteEvent failed:', ev.id, ev.title, err);

            if (
              msg.includes('429') ||
              msg.includes('Quota exceeded') ||
              /rate ?limit/i.test(msg) ||
              msg.includes('RESOURCE_EXHAUSTED')
            ) {
              abortReason = 'rate_limit';
              break;
            }
            if (
              msg.includes('401') ||
              msg.includes('invalid_grant') ||
              msg.includes('UNAUTHENTICATED')
            ) {
              abortReason = 'auth';
              break;
            }
          }
          set({ neisSyncProgress: { current: i + 1, total: neisWithGoogleId.length } });
          if ((i + 1) % 10 === 0 || i === neisWithGoogleId.length - 1) {
            console.log(`[NeisSync] delete progress ${i + 1}/${neisWithGoogleId.length} (deleted=${deletedCount}, failed=${failedCount}, skipNoCal=${skippedNoCalId})`);
          }
          if (i < neisWithGoogleId.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
        }
      }

      // 2) NEIS 이벤트의 google 메타데이터 제거 — deleteRemote 여부와 무관하게 정리
      const cleaned = allEvents.map((e) => {
        if (e.category !== 'neis-schedule') return e;
        const {
          googleEventId: _gid,
          googleCalendarId: _gcid,
          etag: _etag,
          googleUpdatedAt: _gupd,
          lastSyncedAt: _lsa,
          syncStatus: _sst,
          source: _src,
          ...rest
        } = e;
        void _gid; void _gcid; void _etag; void _gupd; void _lsa; void _sst; void _src;
        return rest;
      });
      const evData = await eventsRepository.getEvents();
      await eventsRepository.saveEvents({ events: cleaned, categories: evData?.categories });
      useEventsStore.setState({ events: cleaned });

      // 3) NEIS 매핑 제거
      const filteredMappings = get().mappings.filter((m) => m.categoryId !== 'neis-schedule');
      await get().updateMappings(filteredMappings);

      // 4) 토스트
      const { useToastStore } = await import('@adapters/components/common/Toast');
      const skippedNote = skippedNoCalId > 0
        ? ` (캘린더 정보 누락 ${skippedNoCalId}건은 구글에서 삭제 못 했어요 — 로컬 메타만 정리)`
        : '';
      if (abortReason === 'rate_limit') {
        const remaining = neisWithGoogleId.length - deletedCount - failedCount - skippedNoCalId;
        useToastStore.getState().show(
          `구글 캘린더 일일 사용량 한도가 초과돼 일정 삭제가 중단됐어요. (${deletedCount}건 삭제, ${remaining}건 미처리)${skippedNote} 연동은 해제됐어요.`,
          'error',
        );
      } else if (abortReason === 'auth') {
        useToastStore.getState().show(
          `구글 인증이 만료돼 일정 삭제가 중단됐어요.${skippedNote} 연동은 해제됐어요.`,
          'error',
        );
      } else if (deleteRemoteEvents) {
        if (failedCount === 0 && skippedNoCalId === 0) {
          useToastStore.getState().show(
            `구글 캘린더 연동을 해제했어요. 학사일정 ${deletedCount}건이 구글 캘린더에서 삭제됐어요.`,
            'success',
          );
        } else {
          useToastStore.getState().show(
            `연동 해제 — ${deletedCount}건 삭제, ${failedCount}건 실패${skippedNote}${firstError ? `: ${firstError}` : ''}`,
            'info',
          );
        }
      } else {
        useToastStore.getState().show(
          '구글 캘린더 연동을 해제했어요. 구글 캘린더의 학사일정은 그대로 유지됩니다.',
          'success',
        );
      }

      console.log('[NeisSync] disconnect done');
    } catch (err) {
      console.error('[NeisSync] disconnect error:', err);
      const { useToastStore } = await import('@adapters/components/common/Toast');
      useToastStore.getState().show(
        `연동 해제 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`,
        'error',
      );
    } finally {
      set({ neisSyncInProgress: false, neisSyncProgress: { current: 0, total: 0 } });
    }
  },
}));
