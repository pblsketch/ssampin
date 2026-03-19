import { SyncStatus } from '@mobile/components/More/SyncStatus';

interface Props {
  onNavigate: (page: 'settings') => void;
}

interface MenuItemProps {
  icon: string;
  label: string;
  description: string;
  onClick: () => void;
}

function MenuItem({ icon, label, description, onClick }: MenuItemProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-4 w-full px-4 py-4 glass-card active:scale-[0.98] transition-transform text-left"
    >
      <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-blue-500/10 shrink-0">
        <span className="material-symbols-outlined text-blue-500 text-[24px]">{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sp-text font-semibold text-sm">{label}</p>
        <p className="text-sp-muted text-xs mt-0.5">{description}</p>
      </div>
      <span className="material-symbols-outlined text-sp-muted text-[20px] shrink-0">
        chevron_right
      </span>
    </button>
  );
}

export function MorePage({ onNavigate }: Props) {
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
              icon="settings"
              label="설정"
              description="학교, 교사, 학급 정보 확인"
              onClick={() => onNavigate('settings')}
            />
          </div>
        </section>

        {/* 동기화 */}
        <section>
          <h3 className="text-sp-muted text-xs font-semibold uppercase tracking-wider mb-2 px-1">
            동기화
          </h3>
          <SyncStatus />
        </section>

        {/* 버전 */}
        <div className="flex items-center justify-center py-4">
          <p className="text-sp-muted text-xs">쌤핀 모바일 v0.5.0</p>
        </div>
      </div>
    </div>
  );
}
