import type { ReactNode } from 'react';
import { useMobileHomeLayoutStore, type HomeCardId } from '@mobile/stores/useMobileHomeLayoutStore';

interface CollapsibleCardProps {
  cardId: HomeCardId;
  title: string;
  icon: string;
  /** 아이콘 색상 Tailwind 클래스 (기본 sp-muted). */
  iconClass?: string;
  /** 접혔을 때 헤더에 1줄로 보여줄 요약 (예: "맑음 18°"). */
  summary?: ReactNode;
  /** 펼쳤을 때 헤더 우측에 보여줄 부가 요소 (예: 급식 끼니 탭). */
  headerExtra?: ReactNode;
  /** 카드 배경 스타일 — 'accent' 면 glass-card-accent (수업 중·등교 전 강조용). */
  variant?: 'default' | 'accent';
  /** 루트 div 에 추가할 클래스 (예: 'h-full'). */
  className?: string;
  /** 펼쳤을 때 보여줄 본문. */
  children: ReactNode;
}

/**
 * 홈 탭 카드 공통 래퍼 — 헤더 탭으로 본문을 접고/펴며, 접힘 상태는 기기별로 영속(localStorage).
 * 접힘 상태에서는 헤더에 1줄 요약만 보여준다.
 */
export function CollapsibleCard({
  cardId,
  title,
  icon,
  iconClass,
  summary,
  headerExtra,
  variant = 'default',
  className,
  children,
}: CollapsibleCardProps) {
  const collapsed = useMobileHomeLayoutStore((s) => s.collapsedCards[cardId] === true);
  const toggle = useMobileHomeLayoutStore((s) => s.toggleCollapsed);
  const bodyId = `home-card-body-${cardId}`;
  const bg = variant === 'accent' ? 'glass-card-accent' : 'glass-card';

  return (
    <div className={`${bg} p-4 ${className ?? ''}`}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => toggle(cardId)}
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          /* 보이는 줄 높이는 28px 그대로 두고 누를 수 있는 높이만 44px 로.
             음수 마진이 차이(16px)를 상쇄해 카드가 커지지 않는다. */
          className="flex items-center gap-2 min-w-0 flex-1 text-left min-h-[44px] -my-2"
        >
          <span
            className={`material-symbols-outlined shrink-0 ${iconClass ?? 'text-sp-muted'}`}
            aria-hidden="true"
          >
            {icon}
          </span>
          <span className="text-sp-text font-bold shrink-0">{title}</span>
          {collapsed && summary != null && (
            <span className="text-sp-muted text-xs ml-1 truncate">{summary}</span>
          )}
        </button>
        {!collapsed && headerExtra != null && <div className="shrink-0">{headerExtra}</div>}
        <button
          type="button"
          onClick={() => toggle(cardId)}
          aria-label={collapsed ? `${title} 펼치기` : `${title} 접기`}
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          /* 같은 이유 — 보이는 크기 28px, 누를 수 있는 크기 44px. */
          className="shrink-0 flex items-center justify-center w-11 h-11 -m-2"
        >
          <span
            className={`material-symbols-outlined text-sp-muted transition-transform ${collapsed ? '' : 'rotate-180'}`}
            aria-hidden="true"
          >
            expand_more
          </span>
        </button>
      </div>
      {!collapsed && (
        <div id={bodyId} className="mt-3">
          {children}
        </div>
      )}
    </div>
  );
}
