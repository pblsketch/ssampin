/** OAuth 폴백/에러/PKCE 모달을 App 루트에서 1회 마운트. 중복 제거 용도. */
import { useState, useEffect } from 'react';
import { useGoogleAccountStore } from '@adapters/stores/useGoogleAccountStore';

/** OAuth 에러 모달: 로컬 서버 실패 시 해결 안내 + 수동 인증 폴백 */
function OAuthErrorModal({
  error,
  onClose,
  onStartPKCE,
}: {
  error: { code: string; message: string };
  onClose: () => void;
  onStartPKCE: () => void;
}) {
  const isServerBlocked = error.code === 'SERVER_START_FAILED' || error.code === 'LOCALHOST_BLOCKED';
  const isTimeout = error.code === 'TIMEOUT';
  const isAccessDenied = error.code === 'ACCESS_DENIED';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl bg-sp-card border border-sp-border p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center gap-3 mb-4">
          <div className={`p-2 rounded-lg ${isAccessDenied ? 'bg-amber-500/10' : 'bg-red-500/10'}`}>
            <span className={`material-symbols-outlined ${isAccessDenied ? 'text-amber-400' : 'text-red-400'}`}>
              {isAccessDenied ? 'info' : 'error'}
            </span>
          </div>
          <h3 className="text-lg font-bold text-sp-text">
            {isTimeout ? '인증 시간 초과' : isAccessDenied ? 'Google 연결 거부됨' : 'Google 로그인 연결 실패'}
          </h3>
        </div>

        {/* 본문 */}
        {isServerBlocked && (
          <div className="space-y-3">
            <p className="text-sm text-sp-muted">
              보안 프로그램이 로그인 과정을 차단하고 있을 수 있어요.
            </p>
            <div className="rounded-lg bg-sp-surface p-4 space-y-2">
              <p className="text-sm font-medium text-sp-text">해결 방법:</p>
              <ol className="list-decimal list-inside space-y-1.5 text-sm text-sp-muted">
                <li>V3이나 알약 실시간 감시를 잠시 끄고 다시 시도해보세요.</li>
                <li>쌤핀을 완전히 종료 후 재실행해보세요.</li>
                <li>학교 Wi-Fi 대신 핸드폰 핫스팟으로 연결 후 시도해보세요.</li>
              </ol>
            </div>
          </div>
        )}

        {isTimeout && (
          <p className="text-sm text-sp-muted">
            10분 안에 Google 로그인을 완료하지 못했어요. 다시 시도해주세요.
          </p>
        )}

        {isAccessDenied && (
          <div className="space-y-3">
            <p className="text-sm text-sp-muted">
              Google 계정 연결이 거부되었어요. 로그인 화면에서 &apos;허용&apos;을 눌러주세요.
            </p>
            <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-4 space-y-2">
              <p className="text-sm font-medium text-blue-400">해결 방법</p>
              <ul className="list-disc list-inside space-y-1.5 text-sm text-sp-muted">
                <li>Google 로그인 창에서 &apos;허용&apos; 또는 &apos;Continue&apos;를 클릭해주세요.</li>
                <li>학교 관리자 계정(Google Workspace)은 관리자가 앱 접근을 차단했을 수 있어요.</li>
                <li>개인 Gmail 계정으로 시도해보세요.</li>
              </ul>
            </div>
          </div>
        )}

        {!isServerBlocked && !isTimeout && !isAccessDenied && (
          <p className="text-sm text-sp-muted">{error.message}</p>
        )}

        {/* 액션 버튼 */}
        <div className="flex items-center justify-end gap-2 mt-6">
          {isServerBlocked && (
            <button
              onClick={() => {
                onClose();
                onStartPKCE();
              }}
              className="rounded-lg bg-sp-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sp-accent/80"
            >
              수동 인증으로 시도
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded-lg border border-sp-border px-4 py-2 text-sm text-sp-muted transition-colors hover:bg-sp-surface"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

/** PKCE 수동 인증 코드 입력 모달 */
function PKCEFallbackModal({
  isLoading,
  error,
  onSubmit,
  onClose,
}: {
  isLoading: boolean;
  error: string | null;
  onSubmit: (code: string) => void;
  onClose: () => void;
}) {
  const [code, setCode] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl bg-sp-card border border-sp-border p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-blue-500/10">
            <span className="material-symbols-outlined text-blue-400">key</span>
          </div>
          <h3 className="text-lg font-bold text-sp-text">수동 인증</h3>
        </div>

        {/* 안내 */}
        <div className="space-y-3 mb-4">
          <p className="text-sm text-sp-muted">
            브라우저에서 Google 로그인 후 표시된 인증 코드를 아래에 붙여넣어 주세요.
          </p>

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="인증 코드 입력..."
            className="w-full rounded-lg border border-sp-border bg-sp-surface px-4 py-3 text-sm text-sp-text placeholder:text-sp-muted/50 focus:border-sp-accent focus:outline-none"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && code.trim()) {
                onSubmit(code.trim());
              }
            }}
          />
        </div>

        {/* 액션 버튼 */}
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="rounded-lg border border-sp-border px-4 py-2 text-sm text-sp-muted transition-colors hover:bg-sp-surface disabled:opacity-50"
          >
            취소
          </button>
          <button
            onClick={() => code.trim() && onSubmit(code.trim())}
            disabled={isLoading || !code.trim()}
            className="flex items-center gap-2 rounded-lg bg-sp-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sp-accent/80 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                인증 중...
              </>
            ) : (
              '인증 완료'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 콜백 미수신 → PKCE 폴백 제안 모달 */
function FallbackSuggestionModal({
  data,
  onAccept,
  onDismiss,
}: {
  data: { reason: string; message: string; elapsedSec: number };
  onAccept: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onDismiss}>
      <div
        className="w-full max-w-md rounded-xl bg-sp-card border border-sp-border p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-amber-500/10">
            <span className="material-symbols-outlined text-amber-400">wifi_off</span>
          </div>
          <h3 className="text-lg font-bold text-sp-text">연결이 안 되시나요?</h3>
        </div>

        {/* 본문 */}
        <div className="space-y-3">
          <p className="text-sm text-sp-muted">
            Google 로그인은 완료했지만 앱과의 연결이 {data.elapsedSec}초째 대기 중이에요.
            보안 프로그램이 연결을 차단하고 있을 수 있습니다.
          </p>
          <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-4">
            <p className="text-sm font-medium text-blue-400 mb-1">수동 인증 방식으로 전환할까요?</p>
            <p className="text-xs text-sp-muted">
              Google이 표시하는 인증 코드를 직접 입력하는 방식입니다.
              보안 프로그램의 영향을 받지 않아요.
            </p>
          </div>
        </div>

        {/* 액션 버튼 */}
        <div className="flex items-center justify-end gap-2 mt-6">
          <button
            onClick={onDismiss}
            className="rounded-lg border border-sp-border px-4 py-2 text-sm text-sp-muted transition-colors hover:bg-sp-surface"
          >
            좀 더 기다릴게요
          </button>
          <button
            onClick={onAccept}
            className="rounded-lg bg-sp-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sp-accent/80"
          >
            수동 인증으로 전환
          </button>
        </div>
      </div>
    </div>
  );
}

export function OAuthModalsProvider() {
  const {
    isLoading,
    error,
    oauthError,
    showPKCEFallback,
    showFallbackSuggestion,
    fallbackSuggestionData,
    startPKCEFallback,
    completePKCEAuth,
    setOAuthError,
    setShowPKCEFallback,
    setShowFallbackSuggestion,
    acceptFallback,
  } = useGoogleAccountStore();

  // OAuth 에러 이벤트 수신 (Electron IPC)
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onOAuthError) return;
    const cleanup = api.onOAuthError((err) => {
      setOAuthError(err);
    });
    return cleanup;
  }, [setOAuthError]);

  return (
    <>
      {/* 콜백 미수신 → 폴백 제안 모달 */}
      {showFallbackSuggestion && fallbackSuggestionData && (
        <FallbackSuggestionModal
          data={fallbackSuggestionData}
          onAccept={() => void acceptFallback()}
          onDismiss={() => setShowFallbackSuggestion(false)}
        />
      )}

      {/* OAuth 에러 모달 */}
      {oauthError && (
        <OAuthErrorModal
          error={oauthError}
          onClose={() => setOAuthError(null)}
          onStartPKCE={startPKCEFallback}
        />
      )}

      {/* PKCE 수동 인증 코드 입력 모달 */}
      {showPKCEFallback && (
        <PKCEFallbackModal
          isLoading={isLoading}
          error={error}
          onSubmit={completePKCEAuth}
          onClose={() => setShowPKCEFallback(false)}
        />
      )}
    </>
  );
}

export default OAuthModalsProvider;
