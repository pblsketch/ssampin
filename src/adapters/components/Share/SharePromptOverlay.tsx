import { useEffect } from 'react';
import { useShareStore } from '@adapters/stores/useShareStore';
import { useAnalytics } from '@adapters/hooks/useAnalytics';

/**
 * 충성 사용자 추천 팝업.
 * 트리거 조건: 설치 14일+, 실행 20회+, 최근 7일 중 5일+ 사용.
 */
export function SharePromptOverlay() {
  const { isPromptVisible, showPrompt, hidePrompt, dismissPrompt, openModal, checkPromptEligibility } = useShareStore();
  const { track } = useAnalytics();

  // 앱 시작 후 5초 뒤 조건 확인
  useEffect(() => {
    const timer = setTimeout(() => {
      if (checkPromptEligibility()) {
        showPrompt();
        track('share_prompt_shown');
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isPromptVisible) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm"
        onClick={() => {
          dismissPrompt(false);
          track('share_prompt_action', { action: 'later' });
        }}
      />

      {/* Card */}
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-sp-card rounded-2xl ring-1 ring-sp-border shadow-2xl w-full max-w-sm pointer-events-auto animate-scale-in">
          <div className="px-6 py-8 flex flex-col items-center text-center">
            <span className="text-4xl mb-4">💌</span>
            <h3 className="text-lg font-bold text-sp-text mb-2">
              쌤핀이 도움이 되고 있나요?
            </h3>
            <p className="text-sm text-sp-muted mb-6">
              동료 선생님께도 추천해주세요!
            </p>

            {/* CTA */}
            <button
              onClick={() => {
                hidePrompt();
                openModal('prompt');
                track('share_prompt_action', { action: 'share' });
              }}
              className="w-full px-4 py-3 rounded-xl bg-sp-accent text-white font-medium text-sm hover:bg-sp-accent/80 transition-all mb-3"
            >
              지인에게 추천하기
            </button>

            {/* 나중에 */}
            <button
              onClick={() => {
                dismissPrompt(false);
                track('share_prompt_action', { action: 'later' });
              }}
              className="w-full px-4 py-2.5 rounded-xl text-sp-muted text-sm hover:bg-sp-text/5 transition-all mb-1"
            >
              나중에
            </button>

            {/* 다시 보지 않기 */}
            <button
              onClick={() => {
                dismissPrompt(true);
                track('share_prompt_action', { action: 'never' });
              }}
              className="text-xs text-sp-muted/50 hover:text-sp-muted transition-colors mt-1"
            >
              다시 보지 않기
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
