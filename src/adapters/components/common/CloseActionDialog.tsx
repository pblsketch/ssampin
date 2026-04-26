import { useState, useEffect } from 'react';

export function CloseActionDialog() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onCloseActionAsk) return;

    const cleanup = api.onCloseActionAsk(() => setVisible(true));
    return cleanup;
  }, []);

  if (!visible) return null;

  const handleAction = (action: 'widget' | 'tray') => {
    setVisible(false);
    window.electronAPI?.respondCloseAction(action);
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center">
      <div className="bg-sp-card border border-sp-border rounded-xl shadow-2xl w-full max-w-xs mx-4 p-5">
        <h3 className="text-base font-bold text-sp-text mb-1">앱 닫기</h3>
        <p className="text-xs text-sp-muted mb-4">어떻게 할까요?</p>

        <div className="space-y-2">
          <button
            onClick={() => handleAction('widget')}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-sp-surface hover:bg-sp-accent/10 transition-colors text-left"
          >
            <span className="material-symbols-outlined text-sp-accent text-xl">widgets</span>
            <div>
              <span className="text-sm font-medium text-sp-text">위젯 모드로 전환</span>
              <p className="text-caption text-sp-muted">작은 위젯 창으로 전환합니다</p>
            </div>
          </button>

          <button
            onClick={() => handleAction('tray')}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-sp-surface hover:bg-sp-accent/10 transition-colors text-left"
          >
            <span className="material-symbols-outlined text-sp-accent text-xl">minimize</span>
            <div>
              <span className="text-sm font-medium text-sp-text">트레이로 최소화</span>
              <p className="text-caption text-sp-muted">시스템 트레이로 숨깁니다</p>
            </div>
          </button>
        </div>

        <button
          onClick={() => setVisible(false)}
          className="w-full mt-3 text-xs text-sp-muted hover:text-sp-text text-center py-1"
        >
          취소
        </button>
      </div>
    </div>
  );
}
