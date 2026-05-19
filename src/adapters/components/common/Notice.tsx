/*
  Notice — 페이지/모달 안 안내·경고·오류 메시지 공용 컴포넌트.

  도입 배경: 다크 모드(sp-bg #0a0e17) 페이지에서 옅은 amber 알파 배경 위에
  옅은 amber 텍스트를 두는 ad-hoc 패턴이 코드베이스 곳곳에 반복되며
  베이지 위 노랑 인상을 주어 가독성이 떨어졌다 (WCAG AA fail).

  해결 원칙:
  1. 배경은 카드 톤 (sp-card) — 페이지 위에서 분리되어 보이지만 노란 tint 없음
  2. 좌측 4px stripe 으로 variant 강조 (amber/red/blue/emerald)
  3. 본문은 sp-text (밝은 회색) — 어느 variant 든 본문 가독성 동일
  4. variant 색은 stripe + 아이콘 + 작은 라벨에만 사용 (텍스트 본문에는 적용 X)

  사용 예:
    <Notice variant="warning">
      외부 인터넷 노출 모드 — 학생 응답이 인터넷을 경유합니다.
    </Notice>

    <Notice variant="danger" title="연결 끊김">
      네트워크 확인 후 다시 시도해 주세요.
    </Notice>

  Tailwind safelist 가 아닌 명시적 className 매핑 — purge 안 됨 보장.
*/

import type { ReactNode } from 'react';

export type NoticeVariant = 'info' | 'warning' | 'danger' | 'success';

interface VariantStyle {
  readonly stripe: string;
  readonly accent: string;
  readonly icon: string;
}

const VARIANT_STYLES: Readonly<Record<NoticeVariant, VariantStyle>> = {
  info: {
    stripe: 'border-l-blue-400',
    accent: 'text-blue-300',
    icon: '💬',
  },
  warning: {
    stripe: 'border-l-amber-400',
    accent: 'text-amber-300',
    icon: '⚠',
  },
  danger: {
    stripe: 'border-l-red-400',
    accent: 'text-red-300',
    icon: '⛔',
  },
  success: {
    stripe: 'border-l-emerald-400',
    accent: 'text-emerald-300',
    icon: '✓',
  },
};

export interface NoticeProps {
  readonly variant?: NoticeVariant;
  /** 선택: variant 색이 적용되는 짧은 강조 제목 (한 줄) */
  readonly title?: string;
  /** 선택: 아이콘 emoji 오버라이드 (기본 variant 매핑) */
  readonly icon?: string | null;
  readonly children: ReactNode;
  /** 추가 className — 보통 `mb-3` 등 spacing 용 */
  readonly className?: string;
  /** 크기 — 'sm'(기본) / 'md' */
  readonly size?: 'sm' | 'md';
}

export function Notice({
  variant = 'info',
  title,
  icon,
  children,
  className,
  size = 'sm',
}: NoticeProps): JSX.Element {
  const s = VARIANT_STYLES[variant];
  const padding = size === 'md' ? 'px-4 py-3' : 'px-3 py-2';
  const textSize = size === 'md' ? 'text-sm' : 'text-xs';
  const iconSize = size === 'md' ? 'text-base' : 'text-sm';
  const resolvedIcon = icon === null ? null : (icon ?? s.icon);

  return (
    <div
      role={variant === 'danger' ? 'alert' : 'status'}
      className={`flex items-start gap-2.5 ${padding} rounded-lg bg-sp-card border border-sp-border border-l-4 ${s.stripe} ${textSize} text-sp-text leading-relaxed ${className ?? ''}`}
    >
      {resolvedIcon && (
        <span className={`${iconSize} ${s.accent} flex-shrink-0`} aria-hidden>
          {resolvedIcon}
        </span>
      )}
      <div className="flex-1 min-w-0">
        {title && (
          <div className={`font-bold mb-0.5 ${s.accent}`}>{title}</div>
        )}
        <div>{children}</div>
      </div>
    </div>
  );
}
