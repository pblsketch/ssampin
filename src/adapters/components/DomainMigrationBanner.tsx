import { useState, useEffect } from 'react';

const DISMISS_KEY = 'domain-migration-banner-dismissed';

export function DomainMigrationBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (!dismissed) setVisible(true);
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="bg-gradient-to-r from-amber-600 to-orange-600 text-white px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-base">📢</span>
        <span>
          <strong>쌤핀 도메인이 변경되었습니다</strong> — 모바일 앱을 v0.5.0에서 홈 화면에 추가하신 분은 기존 아이콘을 삭제하고 m.ssampin.com에서 다시 추가해주세요. 데이터는 그대로 유지됩니다.
        </span>
      </div>
      <button
        onClick={dismiss}
        className="p-1 hover:bg-white/20 rounded transition-colors text-white/70 hover:text-white shrink-0"
        title="닫기"
      >
        <span className="material-symbols-outlined text-[18px]">close</span>
      </button>
    </div>
  );
}
