import { create } from 'zustand';
// DI container에서 use case와 repository를 가져올 것 (dynamic import로 순환 참조 방지)

/**
 * 사용자가 PKCE 모달에 붙여넣은 값에서 OAuth code 추출.
 * 다음 모두 허용:
 *  - 'http://127.0.0.1:8421/callback?code=4/0AcvD...&scope=...' (전체 URL)
 *  - 'code=4/0AcvD...' (쿼리 단편)
 *  - '4/0AcvD...' (raw code)
 */
function extractAuthCode(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // URL 형태
  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const url = new URL(trimmed);
      const code = url.searchParams.get('code');
      if (code) return code;
    }
  } catch {
    // URL 파싱 실패 — 다음 단계로
  }
  // code=... 단편
  const codeMatch = trimmed.match(/(?:^|[?&])code=([^&\s]+)/);
  if (codeMatch && codeMatch[1]) return decodeURIComponent(codeMatch[1]);
  // raw code (Google OAuth code는 슬래시 포함)
  if (/^[\w/_-]+$/.test(trimmed)) return trimmed;
  return null;
}

/** OAuth 에러 정보 (에러 모달 표시용) */
interface OAuthError {
  code: string;
  message: string;
}

interface GoogleAccountState {
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

  // 액션
  initialize: () => Promise<void>;
  startAuth: (forceAccountSelect?: boolean, additionalScopes?: readonly string[]) => Promise<void>;
  cancelAuth: () => Promise<void>;
  completeAuth: (code: string, redirectUri: string, codeVerifier?: string) => Promise<void>;
  startPKCEFallback: (forceAccountSelect?: boolean, additionalScopes?: readonly string[]) => Promise<void>;
  completePKCEAuth: (code: string) => Promise<void>;
  disconnect: () => Promise<void>;
  setError: (error: string | null) => void;
  setOAuthError: (error: OAuthError | null) => void;
  setShowPKCEFallback: (show: boolean) => void;
  setShowFallbackSuggestion: (show: boolean) => void;
  acceptFallback: () => Promise<void>;
}

export const useGoogleAccountStore = create<GoogleAccountState>((set, get) => ({
  isConnected: false,
  email: null,
  isLoading: false,
  error: null,
  oauthError: null,
  showPKCEFallback: false,
  showFallbackSuggestion: false,
  fallbackSuggestionData: null,

  initialize: async () => {
    try {
      const { authenticateGoogle } = await import('@adapters/di/container');
      const connected = await authenticateGoogle.isConnected();
      if (connected) {
        const email = await authenticateGoogle.getEmail();
        set({ isConnected: true, email });
        // 교차 참조: 연결되어 있으면 캘린더 스토어의 매핑/동기화 상태도 초기화
        const { useCalendarSyncStore } = await import('./useCalendarSyncStore');
        await useCalendarSyncStore.getState().initialize();
      }
    } catch (err) {
      console.error('[GoogleAccount] initialize error:', err);
    }
  },

  startAuth: async (forceAccountSelect?: boolean, additionalScopes?: readonly string[]) => {
    console.log('[GoogleAccount] startAuth begin');
    set({ isLoading: true, error: null, showFallbackSuggestion: false, fallbackSuggestionData: null });
    try {
      const api = window.electronAPI;
      if (!api?.startOAuth) {
        throw new Error('구글 캘린더 연결은 데스크톱 앱에서만 가능합니다. Electron 모드로 실행해주세요.');
      }

      const { authenticateGoogle } = await import('@adapters/di/container');
      const shouldSelectAccount = forceAccountSelect ?? !get().isConnected;
      const authUrl = authenticateGoogle.getAuthUrl('http://127.0.0.1:0/callback', shouldSelectAccount, additionalScopes);

      // 콜백 미수신 → PKCE 폴백 제안 이벤트 리스너
      let fallbackCleanup: (() => void) | null = null;
      if (api.onOAuthFallbackNeeded) {
        fallbackCleanup = api.onOAuthFallbackNeeded((data) => {
          set({ showFallbackSuggestion: true, fallbackSuggestionData: data });
        });
      }

      try {
        console.log('[GoogleAccount] awaiting api.startOAuth');
        // 신규 시그니처: code/redirectUri를 한 번의 IPC 응답으로 묶어서 받음.
        // 이전 구현은 별도 oauth:redirect-uri 이벤트와 Promise.all로 결합했는데,
        // 이벤트 리스너 등록 타이밍 race 또는 IPC 채널 일시 단절 시 redirectUriPromise가
        // 영원히 hang하는 사고가 발생함. 단일 응답으로 그 위험을 제거.
        const result = await api.startOAuth(authUrl);
        console.log('[GoogleAccount] startOAuth resolved', { hasCode: Boolean(result?.code) });

        // 성공 → 폴백 제안 숨기기
        set({ showFallbackSuggestion: false, fallbackSuggestionData: null });
        await get().completeAuth(result.code, result.redirectUri, result.codeVerifier);
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
      console.error('[GoogleAccount] cancelAuth error:', err);
    }
    // startAuth의 catch 블록이 isLoading=false로 정리하지만,
    // 안전망으로 즉시 UI 상태도 초기화한다 (Promise reject가 늦게 도달하더라도 버튼 활성화)
    set({
      isLoading: false,
      error: null,
      showFallbackSuggestion: false,
      fallbackSuggestionData: null,
    });
  },

  completeAuth: async (code: string, redirectUri: string, codeVerifier?: string) => {
    console.log('[GoogleAccount] completeAuth start', { redirectUri, hasVerifier: Boolean(codeVerifier) });
    set({ isLoading: true, error: null });
    try {
      const { authenticateGoogle } = await import('@adapters/di/container');
      const tokens = await authenticateGoogle.authenticate(code, redirectUri, codeVerifier);
      console.log('[GoogleAccount] completeAuth tokens saved');

      // 토큰 저장 직후 즉시 연결 상태로 마크 — 캘린더 프리로드는 별개로 분리.
      // 학교망 등에서 calendar API가 hang하더라도 isLoading이 풀리지 않는 사고 방지.
      const { useCalendarSyncStore } = await import('./useCalendarSyncStore');
      useCalendarSyncStore.setState({ isConnected: true, email: tokens.email });
      set({
        isConnected: true,
        email: tokens.email,
        isLoading: false,
        error: null,
      });
      console.log('[GoogleAccount] completeAuth marked connected');

      // 캘린더 프리로드 — 백그라운드에서 시도. 실패/지연되어도 연결 상태에는 영향 없음.
      void (async () => {
        try {
          const { manageCalendarMapping } = await import('@adapters/di/container');
          const calendars = await manageCalendarMapping.listGoogleCalendars();
          useCalendarSyncStore.setState({
            googleCalendars: calendars,
            showCalendarPicker: true,
          });
          console.log('[GoogleAccount] background calendar preload done', calendars.length);
        } catch (fetchErr) {
          console.error('[GoogleAccount] post-auth calendar fetch error:', fetchErr);
        }
      })();
    } catch (err) {
      console.error('[GoogleAccount] completeAuth error', err);
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

      // 입력값에서 인증 코드 추출 (URL 통째로 또는 raw code 모두 허용)
      const code = extractAuthCode(codeOrUrl);
      if (!code) {
        throw new Error('인증 코드를 찾지 못했습니다. 브라우저 주소창의 URL 또는 code= 값을 그대로 붙여넣어주세요.');
      }

      // verifier + redirect_uri 가져오기 (PKCE 시작 시 사용한 것과 동일해야 함)
      const { verifier, redirectUri } = await api.exchangePKCECode();

      const { authenticateGoogle } = await import('@adapters/di/container');
      const tokens = await authenticateGoogle.authenticate(code, redirectUri, verifier);

      // 즉시 연결 상태 마크 후 캘린더 프리로드는 백그라운드 분리
      const { useCalendarSyncStore } = await import('./useCalendarSyncStore');
      useCalendarSyncStore.setState({ isConnected: true, email: tokens.email });
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
          useCalendarSyncStore.setState({
            googleCalendars: calendars,
            showCalendarPicker: true,
          });
        } catch (fetchErr) {
          console.error('[GoogleAccount] post-PKCE-auth calendar fetch error:', fetchErr);
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

      // 교차 참조: 캘린더 스토어에서 현재 매핑 조회 (구글 캘린더 전용 카테고리 정리용)
      const { useCalendarSyncStore } = await import('./useCalendarSyncStore');
      const calendarState = useCalendarSyncStore.getState();

      // 2. 구글에서 동기화된 일정 삭제
      const evData = await eventsRepository.getEvents();
      if (evData) {
        const cleanedEvents = evData.events.filter(
          (e) => e.source !== 'google' && !e.googleEventId,
        );
        // 매핑에서 생성된 구글 캘린더 전용 카테고리도 정리
        const googleCalendarIds = new Set(
          calendarState.mappings
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

      // 3. 계정 상태 초기화
      set({
        isConnected: false,
        email: null,
        isLoading: false,
      });
      // 4. 교차 참조: 캘린더 스토어 상태도 초기화 (mappings/syncState/googleCalendars/conflicts/isConnected)
      useCalendarSyncStore.setState({
        isConnected: false,
        email: null,
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
}));
