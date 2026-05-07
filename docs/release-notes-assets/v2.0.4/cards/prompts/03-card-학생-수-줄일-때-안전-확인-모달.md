---
slug: ssampin-v204-card-03
type: image-card
series: ssampin-v204
card_number: 3
total_cards: 8
aspect: "1:1"
language: ko
style: notion
layout: sparse
---

A 1:1 square card — **Card 3 of 8** — featuring **학생 수 줄일 때 안전 확인 모달**.

## Visual style (LOCKED — match `cards/01-intro.png` palette and CARD-NEWS-STYLE.md §4)
- **Outer frame**: solid dark navy (#1F2937) ~15–20% border
- **Inner card**: warm off-white canvas (#FAFAF7) large rounded-corner (48–64px radius)
- **Line art**: minimalist hand-drawn monoline, 2pt strokes, deep navy (#1F2937)
- **Color accents**: brand blue (#3B82F6) + amber (#F59E0B) only — no other fills
- Typography: Noto Sans KR
- No gradients, shadows, 3D, photography, realistic humans, emoji

## Content
- **Top-center tag pill** (~28px height, rounded): "신규" pill (white bold text on amber #F59E0B background)
- **Headline** (ExtraBold, deep navy): "학생 수 줄일 때 안전 확인 모달"
- **Sub-copy** (muted slate #64748B, regular): "명렬관리에서 학생 수를 줄이려고 할 때 활성 학생을 영구 삭제하기 전에 확인 모달이 뜹니다"
- **Central illustration** (monoline, ~50% card height):
  - 모티프: 신규 도구·새 화면·새 패턴을 상징하는 monoline 일러스트
  - 예: 새 패널·토글 스위치·플래그·박스
  - One small accent stroke in brand blue (single element only — visual emphasis)
  - **⚠️ 운영자 수동 후편집 필요**: 위 모티프 가이드를 `학생 수 줄일 때 안전 확인 모달`에 어울리는 구체 비주얼로 다듬어주세요. (예: v2.0.3 02-card-native-desktop.md의 desktop frame + widget panel 같은 구체 비주얼)
- **Body text below illustration** (muted slate, 1~2 lines centered):
  "끝번호부터 비활성 학생 우선 정리 (자동 처리 카운트 표시)"
  "학년말 정리나 명렬 일괄 수정 중에 실수로 학생기록이 사라지는 사고를 구조적으로 막아드려요."
- **Bottom-left**: "3 / 8" (muted slate)

## Constraints
- Pure notion minimalist style
- Korean text crisp
- The pin character (from Card 1) must remain visually consistent if reused
- No realistic humans, no photographs, no 3D, no real brand logos
- Tag pill color must match release-notes.json type=new mapping

> ⚙️ 자동 생성: `scripts/release-notes-to-card-prompts.mjs`. 일러스트 구체화는 수동 후편집.
