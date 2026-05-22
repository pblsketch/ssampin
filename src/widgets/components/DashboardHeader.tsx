import { Clock } from '@adapters/components/Dashboard/Clock';
import { WeatherBar } from '@adapters/components/Dashboard/WeatherBar';
import { MessageBanner } from '@adapters/components/Dashboard/MessageBanner';
import { triggerRefreshAll } from '../hooks/useWidgetRefresh';

interface DashboardHeaderProps {
  onOpenWidgetPanel: () => void;
  onOpenStylePanel: () => void;
}

/**
 * 대시보드 헤더
 * - 시계/날씨/메시지 배너 (기존 그대로)
 * - 우측 상단: 새로고침 + 📋 위젯 관리 + 🎨 스타일 버튼
 */
export function DashboardHeader({ onOpenWidgetPanel, onOpenStylePanel }: DashboardHeaderProps) {
  return (
    <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
      <div>
        <Clock />
        <WeatherBar />
      </div>

      <div className="flex items-end gap-3">
        <MessageBanner />

        {/* 새로고침 버튼 */}
        <button
          onClick={triggerRefreshAll}
          className="shrink-0 rounded-lg p-2 text-sp-muted hover:text-sp-text hover:bg-sp-card transition-colors"
          title="모든 위젯 새로고침"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 2v6h-6" />
            <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
            <path d="M3 22v-6h6" />
            <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
          </svg>
        </button>

        {/* 위젯 관리 버튼 */}
        <button
          onClick={onOpenWidgetPanel}
          className="shrink-0 rounded-lg px-3 py-2 transition-colors flex items-center gap-1.5 text-sm font-medium text-sp-muted hover:text-sp-text hover:bg-sp-card"
          title="위젯 구성 관리"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          위젯 관리
        </button>

        {/* 스타일 버튼 */}
        <button
          onClick={onOpenStylePanel}
          className="shrink-0 rounded-lg px-3 py-2 transition-colors flex items-center gap-1.5 text-sm font-medium text-sp-muted hover:text-sp-text hover:bg-sp-card"
          title="대시보드 스타일 편집"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
            <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
            <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
            <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
            <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
          </svg>
          스타일
        </button>
      </div>
    </header>
  );
}
