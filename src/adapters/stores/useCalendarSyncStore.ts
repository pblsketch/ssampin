import { create } from 'zustand';
import type { CalendarMapping } from '@domain/entities/CalendarMapping';
import type { SyncState, SyncStatus } from '@domain/entities/SyncState';
import type { GoogleCalendarInfo } from '@domain/entities/GoogleCalendarInfo';
import type { SchoolEvent } from '@domain/entities/SchoolEvent';
import type { GoogleCalendarEvent } from '@domain/ports/IGoogleCalendarPort';
// DI container에서 use case와 repository를 가져올 것 (dynamic import로 순환 참조 방지)

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

  // 액션
  initialize: () => Promise<void>;
  startAuth: (forceAccountSelect?: boolean, additionalScopes?: readonly string[]) => Promise<void>;
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
    set({ isLoading: true, error: null, showFallbackSuggestion: false, fallbackSuggestionData: null });
    try {
      const api = window.electronAPI;
      if (!api?.startOAuth) {
        throw new Error('구글 캘린더 연결은 데스크톱 앱에서만 가능합니다. Electron 모드로 실행해주세요.');
      }

      const { authenticateGoogle } = await import('@adapters/di/container');
      // 첫 연결이면 계정 선택 화면 표시
      const shouldSelectAccount = forceAccountSelect ?? !get().isConnected;
      // placeholder redirect_uri로 URL 생성 (IPC 핸들러에서 실제 포트로 교체)
      const authUrl = authenticateGoogle.getAuthUrl('http://127.0.0.1:0/callback', shouldSelectAccount, additionalScopes);

      // redirect_uri를 IPC에서 받아오기 위한 Promise
      const redirectUriPromise = new Promise<string>((resolve) => {
        if (api.onOAuthRedirectUri) {
          const cleanup = api.onOAuthRedirectUri((uri: string) => {
            cleanup();
            resolve(uri);
          });
        } else {
          resolve('');
        }
      });

      // 콜백 미수신 → PKCE 폴백 제안 이벤트 리스너
      let fallbackCleanup: (() => void) | null = null;
      if (api.onOAuthFallbackNeeded) {
        fallbackCleanup = api.onOAuthFallbackNeeded((data) => {
          set({ showFallbackSuggestion: true, fallbackSuggestionData: data });
        });
      }

      try {
        // Electron IPC: 로컬 서버 시작 + 브라우저 열기 + 코드 수신
        const [code, actualRedirectUri] = await Promise.all([
          api.startOAuth(authUrl),
          redirectUriPromise,
        ]);

        // 성공 → 폴백 제안 숨기기
        set({ showFallbackSuggestion: false, fallbackSuggestionData: null });
        await get().completeAuth(code, actualRedirectUri);
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
      } else if (msg.includes('localhost blocked') || msg.includes('PKCE fallback offered')) {
        // PKCE 폴백으로 처리 중 — 에러 표시하지 않음 (모달이 대신 안내)
        set({ isLoading: false });
      } else {
        set({ error: msg, isLoading: false });
      }
    }
  },

  completeAuth: async (code: string, redirectUri: string) => {
    set({ isLoading: true, error: null });
    try {
      const { authenticateGoogle } = await import('@adapters/di/container');
      const tokens = await authenticateGoogle.authenticate(code, redirectUri);

      // 인증 완료 후: 구글 캘린더 목록 미리 조회
      try {
        const { manageCalendarMapping } = await import('@adapters/di/container');
        const calendars = await manageCalendarMapping.listGoogleCalendars();
        set({ googleCalendars: calendars });
      } catch (fetchErr) {
        console.error('[CalendarSync] post-auth calendar fetch error:', fetchErr);
      }

      set({
        isConnected: true,
        email: tokens.email,
        isLoading: false,
        error: null,
        showCalendarPicker: true,  // 캘린더 선택 모달 표시
      });
    } catch (err) {
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

  completePKCEAuth: async (code: string) => {
    set({ isLoading: true, error: null });
    try {
      const api = window.electronAPI;
      if (!api?.exchangePKCECode) {
        throw new Error('PKCE 인증은 데스크톱 앱에서만 가능합니다.');
      }

      // verifier 가져오기
      const verifier = await api.exchangePKCECode();

      const { authenticateGoogle } = await import('@adapters/di/container');
      const redirectUri = 'urn:ietf:wg:oauth:2.0:oob';
      const tokens = await authenticateGoogle.authenticate(code, redirectUri, verifier);

      // 인증 완료 후: 구글 캘린더 목록 미리 조회
      try {
        const { manageCalendarMapping } = await import('@adapters/di/container');
        const calendars = await manageCalendarMapping.listGoogleCalendars();
        set({ googleCalendars: calendars });
      } catch (fetchErr) {
        console.error('[CalendarSync] post-PKCE-auth calendar fetch error:', fetchErr);
      }

      set({
        isConnected: true,
        email: tokens.email,
        isLoading: false,
        error: null,
        showPKCEFallback: false,
        showCalendarPicker: true,
      });
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
}));
