---
slug: ssampin-v206-card-03
type: image-card
series: ssampin-v206
card_number: 3
total_cards: 5
aspect: '1:1'
language: ko
style: notion
layout: balanced
---

A 1:1 square card — **Card 3 of 5** — two related **상담** features side-by-side: 상담 예약 수정·취소 + 상담 일정표 자동 동기화.

## Visual style (LOCKED — match `cards/01-intro.png` palette and CARD-NEWS-STYLE.md §4)

- **Outer frame**: solid dark navy (#1F2937) ~15–20% border
- **Inner card**: warm off-white canvas (#FAFAF7) large rounded-corner (48–64px radius)
- **Line art**: minimalist hand-drawn monoline, 2pt strokes, deep navy (#1F2937)
- **Color accents**: brand blue (#3B82F6) + amber (#F59E0B) only — no other fills
- Typography: Noto Sans KR
- No gradients, shadows, 3D, photography, realistic humans, emoji

## Content — Layout B (balanced, two-column)

- **Header** (top-left bold navy): "상담 예약 — 더 유연하게"

### Left column

- **Tag pill**: "신규" (white text on amber #F59E0B)
- **Bold title**: "예약 수정·취소"
- **Monoline icon**: Two overlapping calendar-event cards — the front card has a pencil icon (edit), the back card has a small X (cancel). 2pt navy monoline, pencil tip in brand blue accent.
- **Body** (muted, 2 lines):
  "담임이 직접 수정/취소"
  "학부모 셀프 링크로 본인이 변경"

### Thin vertical divider (#E8E5DE)

### Right column

- **Tag pill**: "신규" (white text on amber #F59E0B)
- **Bold title**: "일정 ↔ 슬롯 자동동기화"
- **Monoline icon**: A simple clock/calendar on the left connected by a double-headed arrow to a grid of time slots on the right. The arrow has small circular motion marks. 2pt navy monoline, arrow accent in brand blue.
- **Body** (muted, 2 lines):
  "일정표 수정 → 학부모 페이지 즉시 반영"
  "예약된 슬롯은 보호, 중복 예약 차단"

- **Bottom-left**: "3 / 5" (muted slate)

## Constraints

- Maintain EXACT style continuity with card 1 (dark frame + cream card, 2pt monoline navy)
- At generation time pass `--ref "docs/release-notes-assets/v2.0.6/cards/01-intro.png"` so Gemini propagates style
- Korean text must render crisp and correct (Noto Sans KR)
- No realistic humans, emoji, photography
- 1:1 aspect, sRGB

> Auto-generated for v2.0.6. Illustration detail may need manual refinement.
