import { createContext, useContext, type ReactNode } from 'react';
import { useGoogleAuth } from '@mobile/hooks/useGoogleAuth';

type GoogleAuthValue = ReturnType<typeof useGoogleAuth>;

const GoogleAuthContext = createContext<GoogleAuthValue | null>(null);

/**
 * 모바일 Google 인증 상태를 앱 전역에서 공유하기 위한 Provider.
 *
 * useGoogleAuth는 useState 기반 훅이라 컴포넌트마다 상태가 독립적이다.
 * 헤더(App)와 설정 화면(SyncStatus)이 동일한 로그인 상태를 보려면
 * 단일 인스턴스를 Context로 내려줘야 한다.
 *
 * 주의: signature 공개 페이지(`/sign/...`)에는 절대 마운트하지 않는다.
 * main.tsx의 교사 앱(App) 분기에서만 이 Provider로 감싼다.
 */
export function GoogleAuthProvider({ children }: { children: ReactNode }) {
  const auth = useGoogleAuth();
  return <GoogleAuthContext.Provider value={auth}>{children}</GoogleAuthContext.Provider>;
}

export function useGoogleAuthContext(): GoogleAuthValue {
  const ctx = useContext(GoogleAuthContext);
  if (!ctx) {
    throw new Error('useGoogleAuthContext must be used within GoogleAuthProvider');
  }
  return ctx;
}
