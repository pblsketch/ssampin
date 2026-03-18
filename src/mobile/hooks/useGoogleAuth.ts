import { useState, useEffect, useCallback } from 'react';
import type { GoogleAuthTokens } from '@domain/ports/IGoogleAuthPort';
import { googleAuthPort } from '@mobile/di/container';
import { readAuth, writeAuth, deleteAuth } from '@infrastructure/storage/IndexedDBStorageAdapter';
import { generateCodeVerifier, generateCodeChallenge } from './usePKCE';

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
      const refreshed = await googleAuthPort.refreshTokens(tokens.refreshToken);
      await writeAuth(AUTH_KEY, refreshed);
      setTokens(refreshed);
      return refreshed.accessToken;
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
