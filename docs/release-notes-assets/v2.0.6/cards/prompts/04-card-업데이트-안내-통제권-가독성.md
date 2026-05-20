---
slug: ssampin-v206-card-04
type: image-card
series: ssampin-v206
card_number: 4
total_cards: 5
aspect: '1:1'
language: ko
style: notion
layout: balanced
---

A 1:1 square card — **Card 4 of 5** — two related UX improvements side-by-side: 업데이트 안내 통제권 강화 + 라이트 테마 amber chip 가독성.

## Visual style (LOCKED — match `cards/01-intro.png` palette and CARD-NEWS-STYLE.md §4)

- **Outer frame**: solid dark navy (#1F2937) ~15–20% border
- **Inner card**: warm off-white canvas (#FAFAF7) large rounded-corner (48–64px radius)
- **Line art**: minimalist hand-drawn monoline, 2pt strokes, deep navy (#1F2937)
- **Color accents**: brand blue (#3B82F6) + amber (#F59E0B) only — no other fills
- Typography: Noto Sans KR
- No gradients, shadows, 3D, photography, realistic humans, emoji

## Content — Layout B (balanced, two-column)

- **Header** (top-left bold navy): "UX 개선 — 알림·가독성"

### Left column

- **Tag pill**: "개선" (white text on brand blue #3B82F6)
- **Bold title**: "업데이트 알림 통제권"
- **Monoline icon**: A notification bell with a small snooze/clock overlay and a toggle switch beside it. The toggle is in the ON position with a small amber (#F59E0B) dot accent. 2pt navy monoline.
- **Body** (muted, 2 lines):
  "1일/3일 스누즈 + 이번 버전 건너뛰기"
  "사이드바 배지로 언제든 다시 확인"

### Thin vertical divider (#E8E5DE)

### Right column

- **Tag pill**: "수정" (white text on green #10B981)
- **Bold title**: "amber 가독성 회복"
- **Monoline icon**: Two side-by-side text chips — the left chip is faint/blurry (crossed out with a thin X), the right chip is bold and clear with a small checkmark. Represents before/after readability fix. 2pt navy monoline, checkmark in brand blue accent.
- **Body** (muted, 2 lines):
  "라이트 테마에서 흐릿하던 칩·배지 영구 차단"
  "amber-on-amber 색상 동화 근본 해결"

- **Bottom-left**: "4 / 5" (muted slate)

## Constraints

- Maintain EXACT style continuity with card 1 (dark frame + cream card, 2pt monoline navy)
- At generation time pass `--ref "docs/release-notes-assets/v2.0.6/cards/01-intro.png"` so Gemini propagates style
- Korean text must render crisp and correct (Noto Sans KR)
- No realistic humans, emoji, photography
- 1:1 aspect, sRGB

> Auto-generated for v2.0.6. Illustration detail may need manual refinement.
