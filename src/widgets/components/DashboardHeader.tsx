import { Clock } from '@adapters/components/Dashboard/Clock';
import { WeatherBar } from '@adapters/components/Dashboard/WeatherBar';
import { MessageBanner } from '@adapters/components/Dashboard/MessageBanner';

interface DashboardHeaderProps {
  onOpenSettings: () => void;
  isEditMode?: boolean;
  onToggleEditMode?: () => void;
}

/**
 * 대시보드 헤더
 * - 시계/날씨/메시지 배너 (기존 그대로)
 * - 우측 상단 편집/설정 버튼
 */
export function DashboardHeader({ onOpenSettings, isEditMode, onToggleEditMode }: DashboardHeaderProps) {
  return (
    <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
      <div>
        <Clock />
        <WeatherBar />
      </div>

      <div className="flex items-end gap-3">
        <MessageBanner />

        {/* 편집 모드 토글 버튼 */}
        {onToggleEditMode && (
          <button
            onClick={onToggleEditMode}
            className={`shrink-0 rounded-lg p-2 transition-colors ${
              isEditMode
                ? 'bg-sp-accent text-white'
                : 'text-sp-muted hover:text-sp-text hover:bg-sp-card'
            }`}
            title={isEditMode ? '편집 모드 끄기' : '위젯 편집'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
        )}

        {/* 대시보드 설정 버튼 */}
        <button
          onClick={onOpenSettings}
          className="shrink-0 rounded-lg p-2 text-sp-muted hover:text-sp-text hover:bg-sp-card transition-colors"
          title="대시보드 설정"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    </header>
  );
}
