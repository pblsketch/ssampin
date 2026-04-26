import type { RealtimeWallCardColor } from '@domain/entities/RealtimeWall';
import type { WallBoardColorScheme } from '@domain/entities/RealtimeWallBoardTheme';

/**
 * v2.1 — 카드 색상 8색 → Tailwind 클래스 매핑 (Design v2.1 §5.4 / §5.11).
 *
 * 2026-04-26 사용자 피드백 라운드 — 결함 #2 ("카드 배경 alpha 80%로 보드와 구분 거의 안 됨"):
 *   - light 모드 alpha 80% → **불투명** (alpha 표기 제거 = 100%) — 흰 카드는 명시적 #ffffff 풀톤.
 *   - dark 모드는 alpha 30% 유지 (어두운 보드 위에서 너무 강한 카드 침범 방지).
 *   - 모든 색상 카드에 ring-1 ring-black/5 (light) + soft shadow가 RealtimeWallCard에서 부여.
 *
 * 회귀 위험 #7 (96조합 가독성):
 *   - light 배경(프리셋 12종)이 #c8d2dd~#fde68a 범위로 강화됨 → 흰/유채색 카드가 모두 명확히 떠 보임.
 *   - dark 배경 위 카드는 기존 alpha 30% 유지 → 회귀 0.
 *
 * 2026-04-26 결함 #2 (교사 카드 글쓴이/제목/본문 invisible) fix:
 *   - 교사 main app은 `<html class="dark">` 강제이므로 `dark:` variants가 항상 활성화됨.
 *   - 그러나 boardTheme.colorScheme은 기본 'light' → 보드 배경은 light beige인데 카드는
 *     dark variant (transparent dark amber etc.) + text는 dark variant (slate-100=흰색)으로
 *     렌더되어 **light 보드 위에 흰 글씨**가 그려져 invisible.
 *   - 학생 SPA는 useStudentBoardTheme이 html.dark를 boardTheme.colorScheme과 동기화하므로 OK.
 *   - 해결: `dark:` variant 의존을 제거하고 boardColorScheme를 React Context로 주입받아
 *     양 모드 클래스를 명시적으로 선택. RealtimeWallBoardColorSchemeContext가 단일 소스.
 *
 * 기존 `REALTIME_WALL_CARD_COLOR_CLASSES` 상수는 호환을 위해 보존하되, 신규 코드는 헬퍼
 * `getCardColorClass(color, scheme)` 사용을 권장.
 */
export const REALTIME_WALL_CARD_COLOR_CLASSES: Record<RealtimeWallCardColor, string> = {
  // white: 명시적 흰색 + light/dark mode 분기
  white: 'bg-white dark:bg-sp-card',
  yellow: 'bg-amber-100 dark:bg-amber-900/30',
  pink: 'bg-pink-100 dark:bg-pink-900/30',
  blue: 'bg-sky-100 dark:bg-sky-900/30',
  green: 'bg-emerald-100 dark:bg-emerald-900/30',
  purple: 'bg-violet-100 dark:bg-violet-900/30',
  orange: 'bg-orange-100 dark:bg-orange-900/30',
  gray: 'bg-slate-100 dark:bg-slate-800/30',
};

/**
 * 2026-04-26 신설 — boardColorScheme-aware 카드 배경 클래스.
 *
 * 교사 main app(html.dark 강제)에서도 light board 위에 light card가 정확히 매칭되도록,
 * `dark:` variant 대신 명시적 분기로 클래스 선택.
 *
 * - scheme='light': light 톤 카드 (흰색/파스텔)
 * - scheme='dark': 어두운 톤 카드 (alpha 30%)
 *
 * 사용처: RealtimeWallCard / RealtimeWallCardDetailModal.
 */
const CARD_COLOR_CLASSES_LIGHT: Record<RealtimeWallCardColor, string> = {
  white: 'bg-white',
  yellow: 'bg-amber-100',
  pink: 'bg-pink-100',
  blue: 'bg-sky-100',
  green: 'bg-emerald-100',
  purple: 'bg-violet-100',
  orange: 'bg-orange-100',
  gray: 'bg-slate-100',
};

const CARD_COLOR_CLASSES_DARK: Record<RealtimeWallCardColor, string> = {
  white: 'bg-sp-card',
  yellow: 'bg-amber-900/30',
  pink: 'bg-pink-900/30',
  blue: 'bg-sky-900/30',
  green: 'bg-emerald-900/30',
  purple: 'bg-violet-900/30',
  orange: 'bg-orange-900/30',
  gray: 'bg-slate-800/30',
};

export function getCardColorClass(
  color: RealtimeWallCardColor,
  scheme: WallBoardColorScheme,
): string {
  return scheme === 'dark' ? CARD_COLOR_CLASSES_DARK[color] : CARD_COLOR_CLASSES_LIGHT[color];
}

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

/**
 * 2026-04-26 신설 — 카드 본문 텍스트 색상 토큰 (Padlet 정합 4.5:1 대비).
 *
 * RealtimeWallCard 본문(닉네임/마크다운 텍스트)은 이 클래스를 사용해 light에서 진한 회색,
 * dark에서 옅은 회색을 보장한다. sp-muted(#94a3b8)는 메타데이터(시간/도메인) 전용으로 격하.
 *
 * @deprecated 2026-04-26 결함 #2 fix — `dark:` variant는 html.dark 전역 클래스에 의존해
 *   교사 main app(html.dark 강제) + light board 조합에서 흰 글씨가 light 보드 위에 invisible.
 *   대신 `getCardTextPrimaryClass(scheme)` / `getCardTextMetaClass(scheme)` 헬퍼 사용.
 *   상수는 호환을 위해 보존하되 신규 코드에서 import 금지.
 *
 * 적용 대상:
 *   - 닉네임, 마크다운 본문, 댓글 본문 — TEXT_PRIMARY
 *   - 작성 시각, 도메인 칩, 보조 안내 — TEXT_META (기존 sp-muted)
 */
export const REALTIME_WALL_CARD_TEXT_PRIMARY = 'text-slate-900 dark:text-slate-100';
export const REALTIME_WALL_CARD_TEXT_META = 'text-slate-500 dark:text-sp-muted';

/**
 * 2026-04-26 신설 — boardColorScheme-aware 본문/메타 텍스트 클래스.
 *
 * `dark:` variant 의존을 제거하고 boardTheme.colorScheme를 React Context로 받아 명시적 분기.
 * 교사 main app(html.dark 강제) + light board 조합에서도 정확한 색 선택 보장.
 */
export function getCardTextPrimaryClass(scheme: WallBoardColorScheme): string {
  return scheme === 'dark' ? 'text-slate-100' : 'text-slate-900';
}

export function getCardTextMetaClass(scheme: WallBoardColorScheme): string {
  return scheme === 'dark' ? 'text-sp-muted' : 'text-slate-500';
}
