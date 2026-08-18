import type { ReactNode } from 'react';

/**
 * PageHeader — 쌤핀 전 페이지(대시보드 제외) 공용 헤더.
 *
 * 표준 스펙 (docs/계획_페이지헤더-통일.md):
 * - 컨테이너: `<header shrink-0 px-8 py-3 flex flex-wrap items-center gap-3 border-b bg-sp-surface>`
 * - 제목: `<h1 text-xl xl:text-2xl font-sp-bold text-sp-text>` + 이모지/아이콘
 * - leftAddon 슬롯: 뷰 토글 pill 그룹, 탭 등
 * - rightActions 슬롯: `rounded-xl` 액션 버튼 그룹
 * - sticky 옵션: `sticky top-0 z-10` + `backdrop-blur-sm` (배경은 color-mix 인라인)
 *
 * 표면 재질 (2026-08-18) — "제목줄이 배경과 안 어울린다"에서 출발해 두 가지를 고쳤다.
 *
 * 1. **`bg-sp-bg` → `bg-sp-surface`.** `sp-bg` 는 "맨 아래 배경"을 뜻하는 토큰인데,
 *    `AppBackdrop` 이 도입되면서 맨 아래는 그라데이션 레이어가 차지했다. 그 상태로
 *    `sp-bg` 를 계속 쓰면 제목줄만 **순백 판**으로 남아(라이트 테마 `#ffffff`) 배경 위에
 *    얹힌 것처럼 보인다. 제목줄은 사이드바와 같은 **껍데기(chrome)** 이므로 같은 토큰을
 *    쓰는 것이 맞다 — 둘이 이어져 ㄱ자 테두리를 이룬다(Notion 의 사이드바+상단바와 같은 관계).
 * 2. **`data-sp-glass-surface` 등록.** 사이드바는 이 속성으로 유리 규칙을 받는데
 *    (`index.css` 의 `html.sp-glass-on [data-sp-glass-surface]`), 제목줄은 어느 규칙에도
 *    걸리지 않아 유리를 켜도 혼자 불투명하게 남았다. 사이드바와 같은 재질에 합류시킨다.
 *
 * `border-b` 의 색을 `sp-border` 대신 `sp-text` 8% 로 낮춘 것도 같은 이유다 — 불투명한
 * 실선은 배경 위에서 판을 잘라 놓은 것처럼 보인다.
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
  /**
   * 스크롤 시 헤더 고정.
   *
   * ⚠️ **쓰기 전에 스크롤 컨테이너부터 확인할 것.** 쌤핀의 페이지는 거의 다
   * `[제목줄] + [flex-1 min-h-0 overflow-y-auto 본문]` 구조라, 제목줄이 **스크롤 영역
   * 바깥의 형제**다. 스크롤되는 것은 본문이고 제목줄은 원래 그 자리에 남으므로,
   * 여기에 `sticky` 를 줘도 **붙어 있을 대상이 없어 아무 일도 하지 않는다.**
   *
   * 실제 사고 (2026-08-18) — 급식·학교알리미 두 페이지만 이 옵션을 켜 두었는데, 기능은
   * 없으면서 렌더링 경로만 달라져(예전 sticky 배경 `bg-sp-bg/95` 는 sp-* 토큰에 투명도
   * 수식이 듣지 않아 **배경이 통째로 사라졌다**) 두 페이지의 제목줄만 투명해졌다.
   * "제목줄과 창 버튼 줄 사이에 뭔가 하나 더 있는 것 같다"는 신고의 정체가 이것이었다.
   * 지금은 두 페이지 모두 옵션을 껐고 **사용처가 0곳**이다.
   *
   * 정말 필요하다면 제목줄이 **스크롤 컨테이너 안에** 있는지 먼저 확인하라.
   */
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
  /*
    sticky 배경은 `bg-sp-bg/95` 였다. 그런데 `sp-*` 토큰에는 Tailwind 투명도 수식이 듣지
    않는다(토큰이 `var(--sp-*)` 원본 문자열이라 `/95` 가 유효한 색으로 컴파일되지 않는다).
    그래서 "반투명 95%" 가 아니라 **배경이 통째로 사라져** 스크롤한 내용이 제목 글자 위로
    그대로 지나갔다. 고정 헤더는 뒤가 비치면 안 되므로 불투명(`bg-sp-surface`)이 정답이고,
    비치는 처리는 유리를 켰을 때 `[data-sp-glass-surface]` 규칙이 맡는다.

    배경·테두리를 인라인 style 로 주지 않는 이유 — 인라인은 모든 스타일시트 규칙을 이겨서
    유리 규칙(`html.sp-glass-on [data-sp-glass-surface]`)까지 덮어버린다. 그러면 속성을
    붙여 놓고도 유리가 안 걸린다. 색은 클래스와 CSS 규칙으로만 준다.
  */
  const stickyCls = sticky ? 'sticky top-0 backdrop-blur-sm z-10' : '';

  return (
    <header
      data-sp-page-header
      data-sp-glass-surface
      className={`shrink-0 px-8 py-3 flex flex-wrap items-center gap-3 border-b bg-sp-surface ${stickyCls} ${className}`.trim()}
    >
      <div className="flex items-center gap-4">
        <h1 className="text-lg xl:text-xl font-bold text-sp-text flex items-center gap-2 leading-none">
          {icon &&
            (iconIsMaterial ? (
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
        <div className="flex grow items-center justify-end gap-1.5 xl:gap-2 flex-wrap">
          {rightActions}
        </div>
      )}
    </header>
  );
}
