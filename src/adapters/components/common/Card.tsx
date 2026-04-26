import type { ElementType, ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  /** 추가 className */
  className?: string;
  /** hover 시 ring + shadow opt-in (interactive 카드) */
  interactive?: boolean;
  /** 렌더링 태그 (기본 div) */
  as?: ElementType;
  /** 클릭 핸들러 (interactive 카드) */
  onClick?: () => void;
}

/**
 * 공통 Card 컴포넌트.
 *
 * 사용자 정책:
 * - rounded-sp-* 사용 금지 → Tailwind 기본 rounded-xl
 * - 카드 기본은 sp-card 배경 + sp-border ring + sp-shadow-sm
 * - interactive=true 시 hover 시 shadow-sp-md + accent ring 강조
 *
 * 2026-04-25 신설.
 */
export function Card({
  children,
  className = '',
  interactive = false,
  as: Tag = 'div',
  onClick,
}: CardProps) {
  return (
    <Tag
      className={[
        'bg-sp-card rounded-xl ring-1 ring-sp-border shadow-sp-sm',
        interactive
          ? 'cursor-pointer transition-shadow duration-sp-base ease-sp-out hover:shadow-sp-md hover:ring-sp-accent/40'
          : '',
        className,
      ].filter(Boolean).join(' ')}
      onClick={onClick}
    >
      {children}
    </Tag>
  );
}
