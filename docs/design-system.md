# Design System — 쌤핀 UI 규칙

## 디자인 레퍼런스

`design examples/` 폴더에 Google Stitch로 생성한 UI 디자인 예시가 있다.
**프론트엔드 컴포넌트 구현 시 반드시 이 폴더의 이미지를 먼저 확인하고 디자인을 최대한 재현할 것.**

- 디자인과 SPEC이 충돌하면 **디자인 예시를 우선**한다
- 디자인 예시에 없는 페이지는 기존 디자인 톤을 유지

## 컬러 토큰 (`--sp-*` CSS Variables)

| Token        | 용도             | Dark Default |
| ------------ | ---------------- | ------------ |
| sp-bg        | 최하단 배경      | #0a0e17      |
| sp-surface   | 사이드바         | #131a2b      |
| sp-card      | 카드 배경        | #1a2332      |
| sp-border    | 테두리           | #2a3548      |
| sp-accent    | 주 강조 (파란)   | #3b82f6      |
| sp-highlight | 보조 강조 (앰버) | #f59e0b      |
| sp-text      | 기본 텍스트      | #e2e8f0      |
| sp-muted     | 보조 텍스트      | #94a3b8      |

- Tailwind: `bg-sp-card`, `text-sp-text`, `border-sp-border`
- **하드코딩 HEX 금지** — 반드시 `sp-*` 토큰 사용
- 테마 전환: `.theme-light` / `.theme-dark` 클래스, `useThemeApplier` 훅

## 과목별 컬러 코드

국어=yellow, 영어=green, 수학=blue, 과학=purple, 사회=orange, 체육=red, 음악=pink, 미술=indigo, 창체=teal

## 타이포그래피

- 기본 폰트: Noto Sans KR (400 Regular, 700 Bold)
- 10+ 대체 폰트 지원 (Pretendard, IBM Plex Sans KR, SUIT 등)
- 아이콘: Material Symbols Outlined (Google Fonts CDN)
- **모든 UI 텍스트는 한국어**

## 레이아웃

- 카드 모서리: `rounded-xl` (12px)
- 버튼/입력: `rounded-lg`
- 카드 간격: 16px (`--sp-card-gap`)
- 4px 그리드 기반 (Tailwind: gap-1 ~ gap-4)

## 추가 디자인 컨텍스트

`.impeccable.md` 파일에 브랜드 퍼스널리티, 미적 방향, 디자인 원칙이 정리되어 있다.
UI 디자인 판단이 필요할 때 참고할 것.
