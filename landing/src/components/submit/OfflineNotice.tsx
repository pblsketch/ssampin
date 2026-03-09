'use client';

interface OfflineNoticeProps {
  onRetry?: () => void;
}

export function OfflineNotice({ onRetry }: OfflineNoticeProps) {
  return (
    <div role="alert" className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center px-6">
        <div className="text-5xl mb-4">📡</div>
        <h2 className="text-xl font-bold text-sp-text mb-2">인터넷 연결이 필요합니다</h2>
        <p className="text-sp-muted mb-2">과제 제출은 온라인에서만 가능합니다.</p>
        <p className="text-sp-muted/60 text-sm mb-6">인터넷 연결을 확인한 후 다시 시도해주세요.</p>
        <button
          onClick={onRetry ?? (() => window.location.reload())}
          aria-label="인터넷 연결 재시도"
          className="px-6 py-3 bg-sp-accent text-white rounded-lg hover:bg-sp-accent-hover transition-colors inline-flex items-center gap-2"
        >
          🔄 다시 시도
        </button>
      </div>
    </div>
  );
}
