import type { ReactNode } from 'react';

/**
 * PageHeader — 쌤핀 전 페이지(대시보드 제외) 공용 헤더.
 *
 * 표준 스펙 (docs/계획_페이지헤더-통일.md):
 * - 컨테이너: `<header shrink-0 px-8 py-4 flex flex-wrap items-center gap-3 border-b border-sp-border bg-sp-bg>`
 * - 제목: `<h1 text-xl xl:text-2xl font-sp-bold text-sp-text>` + 이모지/아이콘
 * - leftAddon 슬롯: 뷰 토글 pill 그룹, 탭 등
 * - rightActions 슬롯: `rounded-xl` 액션 버튼 그룹
 * - sticky 옵션: `sticky top-0 bg-sp-bg/95 backdrop-blur-sm z-10`
 *
 * @example
 *   <PageHeader icon="📋" title="일정 관리" leftAddon={<ViewToggle />} rightActions={<Buttons />} />
 *   <PageHeader icon="settings" iconIsMaterial title="설정" rightActions={<SaveReset />} />
 */

export interface PageHeaderProps {
  /** 이모지 또는 material-symbols 아이콘 이름 */
  icon?: string;
  /** true = material-symbols, false = 이모지(기본) */
  iconIsMaterial?: boolean;
  /** 페이지 제목 */
  title: string;
  /** 제목 오른쪽 슬롯 — 뷰 토글, 탭 pill 그룹 등 */
  leftAddon?: ReactNode;
  /** 헤더 우측 액션 영역 — 버튼 그룹 */
  rightActions?: ReactNode;
  /** 스크롤 시 헤더 고정 (부모의 overflow: hidden 주의) */
  sticky?: boolean;
  /** 커스텀 클래스 추가 병합 (드물게 필요한 경우만) */
  className?: string;
}

export function PageHeader({
  icon,
  iconIsMaterial = false,
  title,
  leftAddon,
  rightActions,
  sticky = false,
  className = '',
}: PageHeaderProps) {
  const stickyCls = sticky
    ? 'sticky top-0 bg-sp-bg/95 backdrop-blur-sm z-10'
    : 'bg-sp-bg';

  return (
    <header
      className={`shrink-0 px-8 py-3 flex flex-wrap items-center gap-3 border-b border-sp-border ${stickyCls} ${className}`.trim()}
    >
      <div className="flex items-center gap-4 mr-auto">
        <h1 className="text-lg xl:text-xl font-bold text-sp-text flex items-center gap-2 leading-none">
          {icon && (iconIsMaterial ? (
            <span
              className="material-symbols-outlined text-[22px] xl:text-[24px] text-sp-muted"
              aria-hidden="true"
            >
              {icon}
            </span>
          ) : (
            <span className="text-xl xl:text-2xl leading-none" aria-hidden="true">
              {icon}
            </span>
          ))}
          {title}
        </h1>
        {leftAddon}
      </div>
      {rightActions && (
        <div className="flex items-center gap-1.5 xl:gap-2 flex-wrap">
          {rightActions}
        </div>
      )}
    </header>
  );
}
