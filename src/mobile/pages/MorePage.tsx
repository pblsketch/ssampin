import { useState, useCallback } from 'react';
import { SyncStatus } from '@mobile/components/More/SyncStatus';
import { MobileShareModal } from '@mobile/components/Share/MobileShareModal';

interface Props {
  onNavigate: (page: string) => void;
}

interface MenuItemProps {
  icon: string;
  iconColor?: string;
  label: string;
  description: string;
  onClick: () => void;
}

function MenuItem({ icon, iconColor = 'text-sp-accent bg-sp-accent/15', label, description, onClick }: MenuItemProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-4 w-full px-4 py-4 glass-card active:scale-[0.98] transition-transform text-left"
    >
      <div className={`flex items-center justify-center w-11 h-11 rounded-xl shrink-0 ${iconColor.includes('bg-') ? iconColor.split(' ').find((c) => c.startsWith('bg-')) : 'bg-sp-accent/15'}`}>
        <span className={`material-symbols-outlined text-icon-xl ${iconColor.includes('text-') ? iconColor.split(' ').find((c) => c.startsWith('text-')) : 'text-sp-accent'}`}>{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sp-text font-semibold text-sm">{label}</p>
        <p className="text-sp-muted text-xs mt-0.5">{description}</p>
      </div>
      <span className="material-symbols-outlined text-sp-muted text-icon-lg shrink-0">
        chevron_right
      </span>
    </button>
  );
}

export function MorePage({ onNavigate }: Props) {
  const [showShare, setShowShare] = useState(false);

  const handleShared = useCallback(() => {
    // 분석은 MobileShareModal 내부에서 처리 가능하지만
    // 여기서는 간단히 모달 닫기만 처리
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* 메뉴 항목 */}
        <section>
          <h3 className="text-sp-muted text-xs font-semibold uppercase tracking-wider mb-2 px-1">
            메뉴
          </h3>
          <div className="space-y-2">
            <MenuItem
              icon="sticky_note_2"
              iconColor="text-yellow-500 bg-yellow-500/10"
              label="메모"
              description="포스트잇 메모 관리"
              onClick={() => onNavigate('memo')}
            />
            <MenuItem
              icon="build"
              iconColor="text-indigo-400 bg-indigo-400/10"
              label="쌤도구"
              description="과제 수합 · 설문/체크리스트"
              onClick={() => onNavigate('tools')}
            />
            <MenuItem
              icon="settings"
              label="설정"
              description="학교, 교사, 학급 정보 확인"
              onClick={() => onNavigate('settings')}
            />
            <MenuItem
              icon="mail"
              iconColor="text-amber-500 bg-amber-500/10"
              label="지인에게 추천"
              description="동료 선생님께 쌤핀을 알려주세요"
              onClick={() => setShowShare(true)}
            />
          </div>
        </section>

        {/* 구글 드라이브 동기화 */}
        <section>
          <h3 className="text-sp-muted text-xs font-semibold uppercase tracking-wider mb-2 px-1">
            구글 드라이브 동기화
          </h3>
          <SyncStatus />
        </section>

        {/* 버전 */}
        <div className="flex items-center justify-center py-4">
          <p className="text-sp-muted text-xs">쌤핀 모바일 v1.9.6</p>
        </div>
      </div>

      {/* 공유 모달 */}
      <MobileShareModal
        isOpen={showShare}
        onClose={() => setShowShare(false)}
        onShared={handleShared}
      />
    </div>
  );
}
