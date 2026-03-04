import type { WidgetDefinition } from '../types';
import type { ProtectedFeatureKey } from '@domain/entities/PinSettings';
import { DashboardPinGuard } from '@adapters/components/Dashboard/DashboardPinGuard';

/** 위젯 ID → PIN 보호 feature key 매핑 */
const PIN_FEATURE_MAP: Record<string, ProtectedFeatureKey> = {
  'today-class': 'timetable',
  'weekly-timetable': 'timetable',
  'class-timetable': 'timetable',
  'seating': 'seating',
  'events': 'schedule',
  'student-records': 'studentRecords',
  'meal': 'meal',
  'memo': 'memo',
  'todo': 'todo',
};

interface WidgetCardProps {
  definition: WidgetDefinition;
  isEditMode?: boolean;
  onHide?: () => void;
  onNavigate?: (page: string) => void;
  maxHeight?: number;
  scaleFactor?: number;
}

/**
 * 공통 위젯 카드 래퍼
 * - 편집 모드 시 숨김 버튼 표시
 * - PIN 보호 자동 적용
 * - 카드 배경은 각 위젯 컴포넌트가 자체 관리 (기존 대시보드 위젯 재사용)
 */
export function WidgetCard({ definition, isEditMode, onHide, onNavigate, maxHeight, scaleFactor }: WidgetCardProps) {
  const Component = definition.component;
  const pinFeature = PIN_FEATURE_MAP[definition.id];

  const isClickable = !isEditMode && !!definition.navigateTo && !!onNavigate;

  const handleClick = () => {
    if (!isClickable || !definition.navigateTo) return;
    onNavigate!(definition.navigateTo);
  };

  const scale = scaleFactor && scaleFactor < 1 ? scaleFactor : undefined;
  const adjustedMaxHeight = maxHeight && scale ? maxHeight / scale : maxHeight;

  const content = (
    <div
      className={`transition-all duration-200 relative overflow-hidden ${isClickable ? 'cursor-pointer group/clickable' : ''}`}
      onClick={handleClick}
      style={{
        ...(adjustedMaxHeight ? { maxHeight: adjustedMaxHeight, overflow: 'hidden' } : {}),
        ...(scale ? {
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          width: `${100 / scale}%`,
        } : {}),
      }}
    >
      {/* 편집 모드 오버레이 */}
      {isEditMode && (
        <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 group-hover/widget:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onHide?.();
            }}
            className="rounded-md bg-sp-surface/80 p-1 text-sp-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
            title="위젯 숨기기"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          </button>
        </div>
      )}

      {/* 위젯 컴포넌트 렌더링 */}
      <Component />

      {/* "더 보기" 오버레이 (hover 시 표시) */}
      {isClickable && (
        <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-sp-card/90 to-transparent flex items-end justify-center pb-2 opacity-0 group-hover/clickable:opacity-100 transition-opacity pointer-events-none">
          <span className="text-xs text-sp-accent font-medium flex items-center gap-1">
            {definition.navigateLabel ?? '더 보기'}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </span>
        </div>
      )}
    </div>
  );

  // PIN 보호가 필요한 위젯은 PinGuard로 래핑
  if (pinFeature) {
    return (
      <DashboardPinGuard feature={pinFeature}>
        {content}
      </DashboardPinGuard>
    );
  }

  return content;
}
