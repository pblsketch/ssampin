interface OfflineNoticeProps {
  onRetry?: () => void;
  message?: string;
}

export function OfflineNotice({
  onRetry,
  message = '과제수합 기능은 온라인에서만 사용할 수 있습니다.',
}: OfflineNoticeProps) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <div className="text-5xl mb-4">📡</div>
        <h2 className="text-xl font-bold text-sp-text mb-2">인터넷 연결이 필요합니다</h2>
        <p className="text-sp-muted mb-2">{message}</p>
        <p className="text-sp-muted/60 text-sm mb-6">인터넷 연결을 확인한 후 다시 시도해주세요.</p>
        <button
          onClick={onRetry ?? (() => window.location.reload())}
          className="px-6 py-3 bg-sp-accent text-white rounded-lg hover:bg-sp-accent/80 transition-colors flex items-center gap-2 mx-auto"
        >
          <span className="material-symbols-outlined text-[18px]">refresh</span>
          다시 시도
        </button>
      </div>
    </div>
  );
}
