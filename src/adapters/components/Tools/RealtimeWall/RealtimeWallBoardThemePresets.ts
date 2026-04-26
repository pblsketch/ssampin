/**
 * v1.16.x 신규 (Phase 1, Design §3.4) — 보드 테마 프리셋 카탈로그.
 *
 * 단일 진실 공급원 (Plan §0.2 원칙 v1-1):
 *   - 12 프리셋의 light/dark 변형 CSS를 한 곳에 정의.
 *   - 학생 빌드(`@student/`) + 교사 빌드(`@adapters/`) 양쪽이 동일 import.
 *   - presetId → CSS 매핑을 inline switch로 흩어 놓지 않는다.
 *
 * 주의:
 *   - 도메인은 `presetId: string`만 보유 — CSS 매핑은 adapters 레이어에만.
 *   - rounded-sp-* 사용 금지 (memory feedback). Tailwind 기본 키만.
 *   - 모든 색상 변형은 Plan §0.2 원칙 (8색 카드 alpha 80% × 96조합 가독성 PASS) 보장 의무.
 *
 * 회귀 위험 mitigation:
 *   - #10 (accent CSS injection): style 객체는 catalog 내부 hardcoded — 외부 입력 보간 0.
 *
 * 2026-04-26 사용자 피드백 라운드 — 결함 #2 ("텍스트/배경 너무 옅음") 대응:
 *   - light solid 4종: 채도/명도 살짝 강화해 흰색 카드와 명확한 구분 (paper #f1ede2,
 *     cream #f5ebd4, slate #dbe4ee, charcoal #c8d2dd).
 *   - light gradient 4종: 양 끝 hex 채도 강화 (sunrise #fde68a→#fca5a5 등) — 카드
 *     배경(흰색/95%)과 명도 차 확보.
 *   - light pattern 4종: dot/line/grid alpha 0.18~0.32 → 0.36~0.55, base 색상도
 *     배경 톤과 일치하도록 조정.
 *   - dark 모드는 거의 유지 — 이미 적당한 명도 차.
 *
 * 회귀 위험 #7 (96조합 가독성) 재검증 책임:
 *   - 카드 alpha 강화(RealtimeWallCardColors)와 함께 검토 → 흰색 카드가 모든
 *     light 배경 위에서 명확히 떠 보이는지 시각 확인.
 *   - dark 모드는 카드 alpha 30% 유지 + 배경 어두운 톤 유지 → 회귀 위험 0.
 */

import type { CSSProperties } from 'react';
import type {
  WallBoardBackgroundPresetId,
  WallBoardBackgroundType,
  WallBoardColorScheme,
} from '@domain/entities/RealtimeWallBoardTheme';

/**
 * 프리셋 변형 — light 또는 dark 한 쪽의 CSS 매핑.
 *
 * - `style`: gradient/pattern 등 동적 색상은 inline style로 적용.
 * - `className`: tailwind 기본 키만 (pattern은 SVG 외부 파일 X — CSS gradient만).
 * - `accentOverride`: 프리셋이 명시한 accent (hex 6자리 — UI 픽커는 v2 후속).
 *
 * 둘 중 하나는 반드시 정의 (wrapper가 spread). className은 sp-* 토큰과 충돌하면 X.
 */
export interface ThemePresetVariant {
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly accentOverride?: string;
}

export interface ThemePresetEntry {
  readonly id: WallBoardBackgroundPresetId;
  readonly label: string;          // 한국어 라벨 (UI 노출)
  readonly category: '단색' | '그라디언트' | '패턴';
  readonly type: WallBoardBackgroundType;
  readonly light: ThemePresetVariant;
  readonly dark: ThemePresetVariant;
}

/**
 * 12 프리셋 카탈로그. 순서는 UI grid 노출 순서.
 *
 * solid 4 + gradient 4 + pattern 4. 각각 light/dark 변형 명시 (Design §5.1 표).
 */
export const REALTIME_WALL_BOARD_THEME_PRESETS: readonly ThemePresetEntry[] = [
  // ============ solid 4 (단색) ============
  // 2026-04-26: 흰 카드와 명확한 구분 위해 light 톤을 살짝 더 진하게 (paper/cream/slate/charcoal).
  {
    id: 'solid-neutral-paper',
    label: '기본 종이',
    category: '단색',
    type: 'solid',
    light: { style: { backgroundColor: '#f1ede2' } }, // 기존 #fafaf7 → 더 명확한 베이지
    dark:  { style: { backgroundColor: '#1a1a1a' } },
  },
  {
    id: 'solid-cream',
    label: '크림',
    category: '단색',
    type: 'solid',
    light: { style: { backgroundColor: '#f5ebd4' } }, // 기존 #faf6ed → 더 또렷한 크림
    dark:  { style: { backgroundColor: '#2a2419' } },
  },
  {
    id: 'solid-slate',
    label: '슬레이트',
    category: '단색',
    type: 'solid',
    light: { style: { backgroundColor: '#dbe4ee' } }, // 기존 #f1f5f9 → 흰 카드 부유감
    dark:  { style: { backgroundColor: '#1e293b' } },
  },
  {
    id: 'solid-charcoal',
    label: '차콜',
    category: '단색',
    type: 'solid',
    light: { style: { backgroundColor: '#c8d2dd' } }, // 기존 #e2e8f0 → 더 깊은 슬레이트 그레이
    dark:  { style: { backgroundColor: '#0f172a' } },
  },

  // ============ gradient 4 (light 채도 강화 — 카드 가독성 PASS) ============
  // 2026-04-26: light 끝 색상을 한 톤 진하게. 카드 95% 흰색이 명확히 떠 보이게.
  {
    id: 'gradient-sunrise',
    label: '해돋이',
    category: '그라디언트',
    type: 'gradient',
    light: { style: { background: 'linear-gradient(135deg, #fde68a 0%, #fca5a5 100%)' } },
    dark:  { style: { background: 'linear-gradient(135deg, #44403c 0%, #44282d 100%)' } },
  },
  {
    id: 'gradient-ocean',
    label: '바다',
    category: '그라디언트',
    type: 'gradient',
    light: { style: { background: 'linear-gradient(135deg, #bae6fd 0%, #a5f3fc 100%)' } },
    dark:  { style: { background: 'linear-gradient(135deg, #0c4a6e 0%, #134e4a 100%)' } },
  },
  {
    id: 'gradient-forest',
    label: '숲',
    category: '그라디언트',
    type: 'gradient',
    light: { style: { background: 'linear-gradient(135deg, #bbf7d0 0%, #99f6e4 100%)' } },
    dark:  { style: { background: 'linear-gradient(135deg, #064e3b 0%, #134e4a 100%)' } },
  },
  {
    id: 'gradient-lavender',
    label: '라벤더',
    category: '그라디언트',
    type: 'gradient',
    light: { style: { background: 'linear-gradient(135deg, #ddd6fe 0%, #f5d0fe 100%)' } },
    dark:  { style: { background: 'linear-gradient(135deg, #4c1d95 0%, #581c87 100%)' } },
  },

  // ============ pattern 4 (CSS gradient만 — SVG 외부 파일 X) ============
  // 2026-04-26: alpha 0.18 → 0.36~0.55로 강화, base 배경도 단색 4종과 동일 톤.
  {
    id: 'pattern-dot-grid',
    label: '점 격자',
    category: '패턴',
    type: 'pattern',
    light: {
      style: {
        backgroundColor: '#f1ede2',
        backgroundImage: 'radial-gradient(circle, #94a3b8 1.2px, transparent 1.2px)',
        backgroundSize: '20px 20px',
      },
    },
    dark: {
      style: {
        backgroundColor: '#1a1a1a',
        backgroundImage: 'radial-gradient(circle, #475569 1px, transparent 1px)',
        backgroundSize: '20px 20px',
      },
    },
  },
  {
    id: 'pattern-diagonal-lines',
    label: '대각선',
    category: '패턴',
    type: 'pattern',
    light: {
      style: {
        backgroundColor: '#f1ede2',
        backgroundImage:
          'repeating-linear-gradient(45deg, transparent 0 12px, rgba(100, 116, 139, 0.45) 12px 13px)',
      },
    },
    dark: {
      style: {
        backgroundColor: '#1a1a1a',
        backgroundImage:
          'repeating-linear-gradient(45deg, transparent 0 12px, rgba(148, 163, 184, 0.12) 12px 13px)',
      },
    },
  },
  {
    id: 'pattern-notebook',
    label: '노트',
    category: '패턴',
    type: 'pattern',
    light: {
      style: {
        backgroundColor: '#f5ebd4',
        backgroundImage:
          'repeating-linear-gradient(transparent 0 31px, rgba(100, 116, 139, 0.55) 31px 32px)',
      },
    },
    dark: {
      style: {
        backgroundColor: '#2a2419',
        backgroundImage:
          'repeating-linear-gradient(transparent 0 31px, rgba(148, 163, 184, 0.18) 31px 32px)',
      },
    },
  },
  {
    id: 'pattern-grid',
    label: '모눈',
    category: '패턴',
    type: 'pattern',
    light: {
      style: {
        backgroundColor: '#f1ede2',
        backgroundImage:
          'linear-gradient(rgba(100, 116, 139, 0.36) 1px, transparent 1px), ' +
          'linear-gradient(90deg, rgba(100, 116, 139, 0.36) 1px, transparent 1px)',
        backgroundSize: '24px 24px',
      },
    },
    dark: {
      style: {
        backgroundColor: '#1a1a1a',
        backgroundImage:
          'linear-gradient(rgba(148, 163, 184, 0.10) 1px, transparent 1px), ' +
          'linear-gradient(90deg, rgba(148, 163, 184, 0.10) 1px, transparent 1px)',
        backgroundSize: '24px 24px',
      },
    },
  },
];

/** O(1) 조회용 Map — preset id → entry. */
export const REALTIME_WALL_BOARD_THEME_PRESET_BY_ID: ReadonlyMap<
  WallBoardBackgroundPresetId,
  ThemePresetEntry
> = new Map(REALTIME_WALL_BOARD_THEME_PRESETS.map((p) => [p.id, p]));

/** Default fallback entry — solid-neutral-paper. */
const DEFAULT_PRESET_ENTRY: ThemePresetEntry = (() => {
  const fallback = REALTIME_WALL_BOARD_THEME_PRESET_BY_ID.get('solid-neutral-paper');
  if (!fallback) {
    // 카탈로그 정의 깨짐 — 빌드 타임 가드 (테스트로도 검증).
    throw new Error('REALTIME_WALL_BOARD_THEME_PRESETS missing solid-neutral-paper entry');
  }
  return fallback;
})();

/**
 * 프리셋 ID + colorScheme → variant 조회 헬퍼.
 *
 * 잘못된 ID는 default(solid-neutral-paper) variant 반환 — UI 깨짐 방지.
 * Zod 화이트리스트가 통과시킨 값만 받는 것이 정상이지만, 방어적 fallback은 유지.
 */
export function resolveBoardThemeVariant(
  presetId: WallBoardBackgroundPresetId | string,
  colorScheme: WallBoardColorScheme,
): ThemePresetVariant {
  const entry =
    REALTIME_WALL_BOARD_THEME_PRESET_BY_ID.get(presetId as WallBoardBackgroundPresetId)
    ?? DEFAULT_PRESET_ENTRY;
  return entry[colorScheme];
}

/**
 * 프리셋 ID → entry (label 표시 등 메타 필요 시).
 * 잘못된 ID는 default fallback.
 */
export function resolveBoardThemePresetEntry(
  presetId: WallBoardBackgroundPresetId | string,
): ThemePresetEntry {
  return (
    REALTIME_WALL_BOARD_THEME_PRESET_BY_ID.get(presetId as WallBoardBackgroundPresetId)
    ?? DEFAULT_PRESET_ENTRY
  );
}
