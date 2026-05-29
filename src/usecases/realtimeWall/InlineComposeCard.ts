/**
 * InlineComposeCard — β-Step6 (v2.0 inline composer use case)
 *
 * Spec §RealtimeWallTab 표 L188: `InlineComposer | UI state (NEW v2.0) | active,
 * trigger(double-click 좌표·플러스 버튼), textDraft, color, fontSize | scoped-to
 * current layout view`.
 *
 * 본 use case 는 InlineComposer UI 가 제출 직전에 호출하는 **도메인 invariant
 * 검증** 만 담당한다. UI 표시 도구인 `fontSize` 는 도메인 영속 필드가 아니므로
 * 검증 대상이 아니다 (spec 카테고리 "UI state").
 *
 * Plan §2.2 Step 6: "텍스트·색상·폰트크기 3 요소만 검증" 의 해석 — UI form 입력
 * 3종 중 도메인에 흘러 들어가는 2종(텍스트·색상)만 invariant 검사. `fontSize` 는
 * 카드 배경/글씨 표시 도구로 카드 도메인에 저장되지 않는다 (RealtimeWallPost 에
 * 필드 미존재 — 회귀 #11 viewerRole 비대칭 0건 보존).
 *
 * 모달 우회 단축 경로이므로 모달 form 의 옵션(nickname/링크/이미지/PDF 등)은 본
 * use case 의 책임 밖이다. 호출자가 별도 채널로 정규화·송신.
 *
 * 출력은 `validateEdit` 패턴과 동일한 discriminated union 으로 통일해 호출자
 * (RealtimeWallInlineComposer / StudentInlineComposer) 가 `result.ok` 분기로 단일
 * 처리할 수 있게 한다.
 */
import type { RealtimeWallCardColor } from '@domain/entities/RealtimeWall';
import {
  REALTIME_WALL_MAX_TEXT_LENGTH_V2,
  isValidRealtimeWallCardColor,
} from '@domain/rules/realtimeWallRules';

/**
 * InlineComposer 가 제출 직전에 use case 로 넘기는 raw 입력.
 *
 * - `text`: 사용자가 textarea 에 입력한 원본 문자열 (use case 내부에서 trim)
 * - `color`: undefined → white 기본값 (정규화 단계 출력)
 * - `tabId`: 현재 활성 탭 식별자. β-Step8 student SPA 에서 학생측이 전달.
 *   교사측은 활성 탭 또는 `DEFAULT_TAB_ID` 사용 (호출자 책임).
 */
export interface InlineComposeRequest {
  readonly text: string;
  readonly color?: RealtimeWallCardColor;
  readonly tabId?: string;
}

/**
 * 정규화된 도메인 입력 — submit 채널 직전 페이로드.
 * 빈 문자열 trim, color 기본값 'white' 보정.
 */
export interface NormalizedInlineCompose {
  readonly text: string;
  readonly color: RealtimeWallCardColor;
  readonly tabId?: string;
}

export type InlineComposeValidationResult =
  | { readonly ok: true; readonly value: NormalizedInlineCompose }
  | {
      readonly ok: false;
      readonly reason: 'text-empty' | 'text-overflow' | 'invalid-color';
    };

/**
 * β-Step6 — 인라인 컴포저 입력 검증 (도메인 순수).
 *
 * 검증 규칙:
 *   1. `text` trim 후 길이 1 이상 (빈 카드 차단)
 *   2. `text` trim 후 길이 `REALTIME_WALL_MAX_TEXT_LENGTH_V2`(=1000) 이하
 *   3. `color` 미지정 시 'white' 로 보정, 지정 시 8색 union 검증
 *
 * `fontSize` 는 도메인 invariant 가 아니므로 본 함수는 받지 않는다. UI 컴포넌트는
 * 자체 state 로 보관 후 textarea/카드 표시에 직접 적용한다.
 *
 * `tabId` 는 통과 그대로 — `assertTabCountWithinCap`/`isLegacyAlphaShortCode` 같은
 * 보드-level 검증은 호출자 (β-Step8 student SPA, β-Step12 server-trusted broadcast)
 * 가 담당한다.
 */
export function validateInlineCompose(req: InlineComposeRequest): InlineComposeValidationResult {
  const trimmed = req.text.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: 'text-empty' };
  }
  if (trimmed.length > REALTIME_WALL_MAX_TEXT_LENGTH_V2) {
    return { ok: false, reason: 'text-overflow' };
  }
  if (req.color !== undefined && !isValidRealtimeWallCardColor(req.color)) {
    return { ok: false, reason: 'invalid-color' };
  }
  const color: RealtimeWallCardColor = req.color ?? 'white';
  const normalized: NormalizedInlineCompose =
    req.tabId !== undefined ? { text: trimmed, color, tabId: req.tabId } : { text: trimmed, color };
  return { ok: true, value: normalized };
}

/**
 * UI 폰트크기 옵션 (UI state only — 도메인 미저장).
 *
 * Spec L188 카테고리 "UI state" 정합. 텍스트 영역과 카드 본문 표시 크기에만
 * 적용된다. 호출자가 CSS 변환 ('text-sm' / 'text-base' / 'text-lg' 등) 으로 매핑.
 */
export const INLINE_COMPOSER_FONT_SIZES = ['small', 'medium', 'large'] as const;
export type InlineComposerFontSize = (typeof INLINE_COMPOSER_FONT_SIZES)[number];
export const INLINE_COMPOSER_DEFAULT_FONT_SIZE: InlineComposerFontSize = 'medium';
