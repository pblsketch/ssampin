import type { RealtimeWallCardColor } from '@domain/entities/RealtimeWall';

/**
 * v2.1 — 카드 색상 8색 → Tailwind 클래스 매핑 (Design v2.1 §5.4 / §5.11).
 *
 * 카드 배경: alpha 80% 사용 (학생 표현 자유도 + sp-* 토큰 일관성 절충).
 * Dark mode 클래스도 함께 부착 (시스템 정합).
 */
export const REALTIME_WALL_CARD_COLOR_CLASSES: Record<RealtimeWallCardColor, string> = {
  white: 'bg-sp-card',
  yellow: 'bg-amber-100/80 dark:bg-amber-900/30',
  pink: 'bg-pink-100/80 dark:bg-pink-900/30',
  blue: 'bg-sky-100/80 dark:bg-sky-900/30',
  green: 'bg-emerald-100/80 dark:bg-emerald-900/30',
  purple: 'bg-violet-100/80 dark:bg-violet-900/30',
  orange: 'bg-orange-100/80 dark:bg-orange-900/30',
  gray: 'bg-slate-100/80 dark:bg-slate-800/30',
};

/**
 * v2.1 — 카드 좌상단 색상 점 (white 제외 7색).
 */
export const REALTIME_WALL_CARD_COLOR_DOT: Record<
  Exclude<RealtimeWallCardColor, 'white'>,
  string
> = {
  yellow: 'bg-amber-400',
  pink: 'bg-pink-400',
  blue: 'bg-sky-400',
  green: 'bg-emerald-400',
  purple: 'bg-violet-400',
  orange: 'bg-orange-400',
  gray: 'bg-slate-400',
};

/**
 * v2.1 — 픽커 라벨 (한국어).
 */
export const REALTIME_WALL_CARD_COLOR_LABELS: Record<RealtimeWallCardColor, string> = {
  white: '기본',
  yellow: '노랑',
  pink: '분홍',
  blue: '파랑',
  green: '초록',
  purple: '보라',
  orange: '주황',
  gray: '회색',
};

/**
 * v2.1 — 픽커 버튼 미리보기 배경 (radio button 외형 — alpha 100%).
 */
export const REALTIME_WALL_CARD_COLOR_SWATCH: Record<RealtimeWallCardColor, string> = {
  white: 'bg-white border-sp-border',
  yellow: 'bg-amber-200',
  pink: 'bg-pink-200',
  blue: 'bg-sky-200',
  green: 'bg-emerald-200',
  purple: 'bg-violet-200',
  orange: 'bg-orange-200',
  gray: 'bg-slate-200',
};
