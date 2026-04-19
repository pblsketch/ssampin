---
slug: ssampin-v{VERSION_SLUG}-card-{NN}
type: image-card
series: ssampin-v{VERSION_SLUG}
card_number: {NN}
total_cards: {TOTAL_CARDS}
aspect: "1:1"
language: ko
style: notion
layout: {balanced|sparse}   # 2컬럼 병치면 balanced, 단독 항목이면 sparse
---

A 1:1 square carousel card — **Card {NN} of {TOTAL_CARDS}** — matching the EXACT visual style of card 1 (dark navy frame + warm cream card inside, 2pt monoline navy strokes, restrained blue/amber/green accents).

## Choose ONE of the two layouts below based on content

---

### Layout A — Single feature highlight (`layout: sparse`)

Use when this card covers ONE release item.

- **Tag pill** (top, centered): "{TAG_LABEL}" with color per rule:
  - improve → 개선, blue `#3B82F6`
  - new → 신규, amber `#F59E0B`
  - fix → 수정, green `#10B981`
  - change → 변경, gray `#64748B`
- **Large bold title** (centered, Noto Sans KR Bold, navy): "{TITLE}"
- **Supporting sentence** (centered, muted #64748B): "{TEASER_QUESTION}"
  _예: "학생 이름이 잘 안 보여서 답답하셨나요?"_
- **Visual anchor — centered illustration**: "{ILLUSTRATION_DESC}"
  _예: 4×5 좌석 그리드, 중앙 한 좌석만 2×로 확대+앰버 채움_
- **Body** (below illustration, muted, 2~3줄): "{BODY}"
- **Bottom-left corner**: "{NN} / {TOTAL_CARDS}"

---

### Layout B — Two related items side-by-side (`layout: balanced`)

Use when two release items share a category (예: 출결 관련, 좌석 관련).

- **Header** (top-left bold navy): "{CATEGORY_HEADER}"
- **Two equal columns divided by thin vertical `#E8E5DE` line**:

**Left column**
- Tag pill: "{LEFT_TAG_LABEL}" (color per rule)
- Bold title: "{LEFT_TITLE}"
- Monoline icon: "{LEFT_ICON_DESC}"
- Body (muted, 2~3 lines): "{LEFT_BODY}"

**Right column**
- Tag pill: "{RIGHT_TAG_LABEL}" (color per rule)
- Bold title: "{RIGHT_TITLE}"
- Monoline icon: "{RIGHT_ICON_DESC}"
- Body (muted, 2~3 lines): "{RIGHT_BODY}"

- **Bottom-left corner**: "{NN} / {TOTAL_CARDS}"

---

## Constraints (both layouts)

- Maintain EXACT style continuity with card 1 (dark frame + cream card, 2pt monoline navy)
- At generation time pass `--ref "docs/release-notes-assets/v{VERSION_SLUG}/cards/01-intro.png"` so Gemini propagates style
- Korean text must render crisp and correct (Noto Sans KR)
- No realistic humans, emoji, photography
- 1:1 aspect, SRGB
