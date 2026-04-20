---
slug: ssampin-v{VERSION_SLUG}-card-{NN}
type: image-card
series: ssampin-v{VERSION_SLUG}
card_number: {NN}
total_cards: {TOTAL_CARDS}
aspect: "1:1"
language: ko
style: notion
layout: sparse
---

A 1:1 square carousel card — **Card {NN} of {TOTAL_CARDS}** (FINAL card) — outro matching the EXACT visual style of card 1 (dark navy frame + warm cream card inside).

## Content

### (Optional) Top section — bug-fix item
Include ONLY if this release has a `fix` item that wasn't shown on a prior card.

- Green pill tag (centered): "수정" (#10B981)
- Bold title: "{FIX_TITLE}"
- 1-line body (muted): "{FIX_BODY}"
- Tiny monoline icon above title: "{FIX_ICON_DESC}"
  _예: a small bar-chart with rightmost bar restored in blue_

### Thin horizontal divider (`#E8E5DE`)

### Bottom section — outro / CTA (ALWAYS present)

- Medium headline (navy, centered): "지금 바로 업데이트해 보세요"
- Supporting (muted, centered): "쌤핀 데스크톱 앱 · ssampin.com"
- Signature motif (at very bottom, small): amber pushpin illustration (echo of card 1 — amber #F59E0B pin head, thin navy monoline body)

### Corners
- **Bottom-left**: "{NN} / {TOTAL_CARDS}"
- **Bottom-right**: tiny "made by 쌤핀 team"

## Constraints

- Same dark frame + cream card style as card 1 and all content cards
- Pass `--ref "docs/release-notes-assets/v{VERSION_SLUG}/cards/01-intro.png"` at generation
- Korean text crisp and correct
- No QR codes, no URLs beyond "ssampin.com"
- No emoji, no realistic humans
- 1:1 aspect, SRGB
