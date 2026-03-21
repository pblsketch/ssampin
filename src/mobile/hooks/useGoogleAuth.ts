import { useState, useEffect, useCallback } from 'react';
import type { GoogleAuthTokens } from '@domain/ports/IGoogleAuthPort';
import { googleAuthPort } from '@mobile/di/container';
import { readAuth, writeAuth, deleteAuth } from '@infrastructure/storage/IndexedDBStorageAdapter';
import { generateCodeVerifier, generateCodeChallenge } from './usePKCE';
import { detectInAppBrowser } from '@infrastructure/browser/detectInAppBrowser';

const AUTH_KEY = 'google-tokens';
const VERIFIER_KEY = 'pkce-verifier';

interface GoogleAuthState {
  isLoading: boolean;
  isAuthenticated: boolean;
  email: string | null;
  startLogin: () => Promise<void>;
  handleCallback: (code: string) => Promise<void>;
  getValidAccessToken: () => Promise<string>;
  logout: () => Promise<void>;
}

export function useGoogleAuth(): GoogleAuthState {
  const [tokens, setTokens] = useState<GoogleAuthTokens | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 기존 토큰 로드
  useEffect(() => {
    readAuth<GoogleAuthTokens>(AUTH_KEY)
      .then((saved) => {
        if (saved) setTokens(saved);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const startLogin = useCallback(async () => {
    // 인앱 브라우저 감지 → 로그인 차단 + 안내
    const { isInApp, appName } = detectInAppBrowser();
    if (isInApp) {
      const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
      const guide = isIOS
        ? '하단의 "Safari로 열기" 버튼을 눌러 Safari에서 다시 접속해주세요.'
        : '우측 상단 ⋮ 메뉴에서 "브라우저에서 열기"를 눌러 Chrome에서 다시 접속해주세요.';

      alert(
        `${appName ?? '앱 내'} 브라우저에서는 Google 로그인이 차단돼요.\n\n${guide}\n\n또는 주소창의 URL을 복사해서 크롬/사파리에 붙여넣기 해주세요.`,
      );
      return;
    }

    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    await writeAuth(VERIFIER_KEY, verifier);

    const redirectUri = window.location.origin + '/';
    const url = googleAuthPort.getAuthUrl(redirectUri, challenge);
    window.location.href = url;
  }, []);

  const handleCallback = useCallback(async (code: string) => {
    const verifier = await readAuth<string>(VERIFIER_KEY);
    const redirectUri = window.location.origin + '/';
    const newTokens = await googleAuthPort.exchangeCode(
      code,
      redirectUri,
      verifier ?? undefined,
    );
    await writeAuth(AUTH_KEY, newTokens);
    await deleteAuth(VERIFIER_KEY);
    setTokens(newTokens);
  }, []);

  const getValidAccessToken = useCallback(async (): Promise<string> => {
    if (!tokens) throw new Error('Not authenticated');

    // 만료 5분 전이면 갱신
    if (Date.now() > tokens.expiresAt - 5 * 60 * 1000) {
      try {
        const refreshed = await googleAuthPort.refreshTokens(tokens.refreshToken);
        await writeAuth(AUTH_KEY, refreshed);
        setTokens(refreshed);
        return refreshed.accessToken;
      } catch (err) {
        // invalid_grant: 다른 기기에서 재인증하여 토큰이 무효화됨
        if (err instanceof Error && err.message.includes('INVALID_GRANT')) {
          await deleteAuth(AUTH_KEY);
          setTokens(null);
          throw new Error('INVALID_GRANT: Google 인증이 만료되었습니다. 다시 로그인해주세요.');
        }
        throw err;
      }
    }
    return tokens.accessToken;
  }, [tokens]);

  const logout = useCallback(async () => {
    if (tokens) {
      try {
        await googleAuthPort.revokeTokens(tokens.accessToken);
      } catch { /* ignore */ }
    }
    await deleteAuth(AUTH_KEY);
    setTokens(null);
  }, [tokens]);

  return {
    isLoading,
    isAuthenticated: tokens != null,
    email: tokens?.email ?? null,
    startLogin,
    handleCallback,
    getValidAccessToken,
    logout,
  };
}
