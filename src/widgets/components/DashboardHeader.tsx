import { Clock } from '@adapters/components/Dashboard/Clock';
import { WeatherBar } from '@adapters/components/Dashboard/WeatherBar';
import { MessageBanner } from '@adapters/components/Dashboard/MessageBanner';

interface DashboardHeaderProps {
  isEditMode?: boolean;
  onToggleEditMode?: () => void;
}

/**
 * 대시보드 헤더
 * - 시계/날씨/메시지 배너 (기존 그대로)
 * - 우측 상단 편집 버튼 (편집 모드 + 설정 드로어 통합)
 */
export function DashboardHeader({ isEditMode, onToggleEditMode }: DashboardHeaderProps) {
  return (
    <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
      <div>
        <Clock />
        <WeatherBar />
      </div>

      <div className="flex items-end gap-3">
        <MessageBanner />

        {/* 편집 모드 토글 버튼 (설정 드로어도 함께 열림) */}
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
      </div>
    </header>
  );
}
