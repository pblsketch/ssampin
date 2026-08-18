/*
  Notice — 페이지/모달 안 안내·경고·오류 메시지 공용 컴포넌트.

  ── 원래 도입 배경 (그대로 유효) ──
  다크 모드(sp-bg #0a0e17) 페이지에서 옅은 amber 알파 배경 위에 옅은 amber 텍스트를 두는
  ad-hoc 패턴이 코드베이스 곳곳에 반복되며 베이지 위 노랑 인상을 주어 가독성이 떨어졌다
  (WCAG AA fail). 그래서 **"배경은 중립, 색은 강조 요소에만"** 이라는 규칙을 세웠고,
  그 규칙의 구현이 좌측 4px stripe 였다.

  ── 2026-08-18 재설계: stripe → 색조 면 + 아이콘 칩 ──
  준일님 지적: "강조 띠가 좀 AI 디자인스럽다."

  진단 — 좌측 4px stripe 가 그렇게 읽히는 이유는 네 가지다.
  1. **한 장치가 네 가지 뜻을 진다.** 경고 박스·일정 분류색·"지금 이 교시"·인용문이 전부
     같은 4px 띠였다. 한 장치가 모든 것을 뜻하면 아무것도 뜻하지 않게 되고 템플릿으로 읽힌다.
  2. **형태에 붙지 않고 얹혀 있다.** 중립 카드 옆구리에 채도 높은 색 판이 맞대어 있는 모양은
     디자인된 것이 아니라 덧붙인 것으로 보인다.
  3. **튜토리얼의 표준 스니펫이다.** `border-l-4 border-amber-400 bg-amber-50` 은 모든 CSS
     예제에 나오는 경고 박스 정답이다. 폰트로 치면 Inter 에 해당한다.
  4. **중요도와 강도가 반대다.** 가장 안 중요한 안내문이 화면에서 가장 채도 높은 요소가 된다.
     브랜드 제1 원칙 "정보 우선 — 장식보다 데이터"(.impeccable.md)와 정면으로 어긋난다.
  덧붙여 참고 레퍼런스인 Notion·Linear 어느 쪽도 이 방식을 쓰지 않는다.

  새 방식 — 색을 옆구리 슬래브가 아니라 **면 전체에 7% 로 아주 옅게 녹이고**, 색 예산은
  원형 아이콘 칩에 몰아준다. 본문은 `sp-text` 그대로 두어 **원래 규칙의 목적(본문 가독성)은
  그대로 지킨다.** 오히려 더 안전해졌다 — 본문이 거의 카드색인 면 위에 있기 때문이다.

  ── 왜 `color-mix` 인가 (중요) ──
  `sp-*` 토큰에는 Tailwind 투명도 수식(`bg-sp-warning/10`)이 **듣지 않는다.** 토큰이
  `var(--sp-warning)` 원본 문자열이라 `/10` 이 유효한 색으로 컴파일되지 않고, 에러 없이
  조용히 무효가 된다(코드베이스 2,888곳이 같은 함정에 걸려 있다). `color-mix` 가 유일한 길이다.

  섞는 기준을 `var(--sp-card)` 로 잡은 것도 의도적이다. 다크 테마에선 어두운 카드에 색이 7%
  섞이고 라이트 테마에선 밝은 카드에 섞여 **테마별 분기 없이 자동 대응**된다.
  `bg-amber-50` 같은 고정 색이 라이트에서만 통했던 것과 대비된다.

  ── 아이콘 색을 본문색과 섞는 이유 ──
  라이트 테마에서 `--sp-warning`(#d97706) 을 7% 색조 배경 위에 그대로 두면 대비가 2.71:1 로
  WCAG 1.4.11(비텍스트 3:1) 에 미달한다. `sp-text` 를 22% 섞으면 라이트에선 어두워지고
  다크에선 밝아져 **양쪽 모두 기준을 넘는다** (실측 라이트 4.01:1 / 다크 7.3:1).

  사용 예:
    <Notice variant="warning">
      외부 인터넷 노출 모드 — 학생 응답이 인터넷을 경유합니다.
    </Notice>

    <Notice variant="danger" title="연결 끊김">
      네트워크 확인 후 다시 시도해 주세요.
    </Notice>
*/

import type { ReactNode } from 'react';

export type NoticeVariant = 'info' | 'warning' | 'danger' | 'success';

interface VariantStyle {
  /** 의미 색상 토큰 이름. `--sp-*` 는 테마별로 이미 정의되어 있다. */
  readonly token: string;
  /** Material Symbols 이름 — 색을 입힐 수 있어 이모지보다 낫다. */
  readonly symbol: string;
}

const VARIANT_STYLES: Readonly<Record<NoticeVariant, VariantStyle>> = {
  info: { token: '--sp-info', symbol: 'info' },
  warning: { token: '--sp-warning', symbol: 'warning' },
  danger: { token: '--sp-error', symbol: 'error' },
  success: { token: '--sp-success', symbol: 'check_circle' },
};

export interface NoticeProps {
  readonly variant?: NoticeVariant;
  /** 선택: 짧은 강조 제목 (한 줄) */
  readonly title?: string;
  /**
   * 선택: 아이콘 오버라이드. 이모지 등 **문자 그대로** 렌더된다
   * (기본 아이콘은 Material Symbols 이므로 색이 입혀지지만, 여기 넘긴 값은 원문 유지).
   * `null` 이면 아이콘을 그리지 않는다.
   */
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
  const c = `var(${s.token})`;

  const padding = size === 'md' ? 'px-4 py-3' : 'px-3 py-2.5';
  const textSize = size === 'md' ? 'text-sm' : 'text-xs';
  const chipSize = size === 'md' ? 'w-6 h-6 text-[16px]' : 'w-5 h-5 text-[14px]';

  return (
    <div
      role={variant === 'danger' ? 'alert' : 'status'}
      style={{
        backgroundColor: `color-mix(in srgb, ${c} 7%, var(--sp-card))`,
        borderColor: `color-mix(in srgb, ${c} 22%, transparent)`,
      }}
      className={`flex items-start gap-2.5 ${padding} rounded-lg border ${textSize} text-sp-text leading-relaxed ${className ?? ''}`}
    >
      {icon !== null && (
        <span
          aria-hidden
          style={{
            backgroundColor: `color-mix(in srgb, ${c} 16%, transparent)`,
            color: `color-mix(in srgb, ${c} 78%, var(--sp-text))`,
          }}
          className={`${chipSize} rounded-full shrink-0 flex items-center justify-center leading-none`}
        >
          {icon ? (
            icon
          ) : (
            <span className="material-symbols-outlined text-[inherit] leading-none">
              {s.symbol}
            </span>
          )}
        </span>
      )}
      <div className="flex-1 min-w-0 break-keep">
        {/* 제목에 의미색을 쓰지 않는다 — 색은 아이콘이 전담한다.
            색 위에 색을 얹는 것이 애초에 이 컴포넌트를 만들게 한 가독성 실패였다. */}
        {title && <div className="font-bold mb-0.5 text-sp-text">{title}</div>}
        <div>{children}</div>
      </div>
    </div>
  );
}
