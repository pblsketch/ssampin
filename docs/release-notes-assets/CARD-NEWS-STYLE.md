# 🔒 쌤핀 릴리즈 카드뉴스 스타일 가이드 (v1.10.1 기준 고정)

> **이 스타일은 v1.10.1 카드뉴스에서 사용자가 공식 채택한 디자인이다.**
> 새 버전 릴리즈 카드를 만들 때는 반드시 이 가이드를 준수한다. 임의 변경 금지.

---

## 1. 전체 구성

- **비율**: 1:1 정사각 (인스타그램/카카오채널 캐러셀 최적)
- **레이어**:
  1. 바깥 프레임: 다크 네이비 `#1F2937` 솔리드 — 사진에 액자를 씌운 듯 안쪽 15~20% 여백
  2. 안쪽 카드: 따뜻한 오프화이트 `#FAFAF7` 큰 라운드 사각형 (모서리 48~64px)
  3. 콘텐츠: 카드 내부에 텍스트 + 모노라인 라인아트
- **스타일 키워드**: notion / minimalist / hand-drawn monoline / Craft editor vibe

## 2. 카드 수 결정

| 변경사항 수 | 카드 구성 |
|-------------|-----------|
| 1~2개 | 인트로 → 단일 콘텐츠(1장 또는 2컬럼) → 아웃트로 (총 3장) |
| 3~4개 | 인트로 → 관련 묶기(2개 병치) + 단독(1~2개) → 아웃트로 (총 4~5장) |
| 5개 이상 | 인트로 → 카테고리별 묶기 → 아웃트로 (총 5~7장) |

v1.10.1 기준: 4개 변경사항 → 4장 구성 (인트로 · 출결 2묶음 · 좌석 단독 · 버그+아웃트로)

## 3. 타이포그래피

- **폰트**: Noto Sans KR
- **타이틀**: ExtraBold, 딥 네이비 `#1F2937`
- **본문**: Regular, 뮤티드 슬레이트 `#64748B`
- **태그 알약**: 흰색 텍스트, Medium 폰트, 배경색은 태그 규칙 참조

## 4. 색상 팔레트 (엄격 준수 — 다른 색 사용 금지)

| 역할 | HEX | 용도 |
|------|-----|------|
| 외곽 프레임 | `#1F2937` | 다크 네이비 |
| 카드 표면 | `#FAFAF7` | 웜 오프화이트 |
| 프라이머리 텍스트 | `#1F2937` | 타이틀 |
| 뮤티드 텍스트 | `#64748B` | 본문/캡션 |
| 디바이더 | `#E8E5DE` | 카드 내 분리선 |
| 브랜드 블루 | `#3B82F6` | 체크·아이콘 액센트 / "개선" 태그 |
| 앰버 | `#F59E0B` | 핀 머리 / "신규" 태그 / 강조 요소 |
| 그린 | `#10B981` | "수정" 태그 |
| 그레이 | `#64748B` | "변경" 태그 |
| 블루 틴트 | `#EEF2FF` | 날짜 알약 배경 |

**금지**: 그라디언트, 섀도우, 3D, 사진, 사실적 사람/얼굴, 이모지

## 5. 태그 알약 규칙 (release-notes.json의 `type` 매핑)

| release-notes.json type | 한글 레이블 | 배경 HEX |
|-------------------------|-------------|----------|
| `improve` | 개선 | `#3B82F6` |
| `new` | 신규 | `#F59E0B` |
| `fix` | 수정 | `#10B981` |
| `change` | 변경 | `#64748B` |

형태: 둥근 사각형 ~28px 높이, 좌우 패딩 14px, 흰 텍스트.

## 6. 고정 모티프

- **쌤핀 핀(pushpin)**: 머리 = 앰버 `#F59E0B` 원, 몸통 = 얇은 네이비 모노라인. 인트로 카드 앵커 + 아웃트로 시그니처로 반복 사용.
- **페이지 인디케이터**: 좌하단 `N / 총수`, 뮤티드.
- **아웃트로 서명**: 우하단 `made by 쌤핀 team` (tiny, muted).

## 7. 일러스트 규칙

- 2pt 모노라인, 네이비 스트로크
- 라운드 코너, 그라디언트·3D·사실적 사람 없음
- 색 채움은 브랜드 블루/앰버/그린 중 1~2색만, 절제
- 이모지 금지, 스톡 SaaS 클리셰(전구/로켓/기어) 금지

## 8. 카드별 콘텐츠 템플릿

### 인트로 카드 (1/N)
- 상단: 날짜 알약 `YYYY.MM.DD 릴리즈` (블루 틴트)
- 센터: 대형 타이틀 `쌤핀 v{VERSION}` + 호기심 유발 한 줄
- 앵커: 쌤핀 핀이 꽂힌 "쌤핀" 스티키노트 일러스트
- 좌하단: `1 / N`

### 콘텐츠 카드 — 단독 항목 (`sparse`)
- 상단 중앙 태그 알약 → 대형 타이틀 → 질문형 서브카피 → 중앙 일러스트 → 본문 2~3줄 → `N / 총수`

### 콘텐츠 카드 — 2컬럼 병치 (`balanced`)
- 상단 좌측 카테고리 헤더 → 수직 디바이더로 2등분 → 각 컬럼 {태그 + 아이콘 + 타이틀 + 본문} → `N / 총수`

### 아웃트로 카드 (N/N)
- (선택) 상단 수정 항목 1개
- 가로 디바이더
- "지금 바로 업데이트해 보세요" 헤드라인 + "쌤핀 데스크톱 앱 · ssampin.com"
- 바닥: 앰버 핀 시그니처
- 좌하단 `N / N`, 우하단 `made by 쌤핀 team`

## 9. 생성 파이프라인

```bash
# 1. 카드 1(앵커) 먼저 생성
npx -y bun "C:/Users/wnsdl/.claude/skills/baoyu-imagine/scripts/main.ts" \
  --promptfiles "docs/release-notes-assets/v{VERSION}/cards/prompts/01-card-intro.md" \
  --image     "docs/release-notes-assets/v{VERSION}/cards/01-intro.png" \
  --ar "1:1" --provider google --model "gemini-3-pro-image-preview"

# 2. 카드 2~N을 카드 1을 --ref로 참조하여 병렬 생성
npx -y bun "..." \
  --promptfiles "..../NN-card-*.md" \
  --image     "..../NN-*.png" \
  --ar "1:1" --provider google --model "gemini-3-pro-image-preview" \
  --ref       "docs/release-notes-assets/v{VERSION}/cards/01-intro.png"
```

- 백엔드: `baoyu-imagine` + Google Gemini 3 Pro Image Preview
- 품질: 2K (baoyu-imagine EXTEND.md 기본값)
- API 키: `.baoyu-skills/.env` (gitignore 됨)

## 10. 템플릿

`docs/release-notes-assets/templates/` 참조:
- `_intro-card.template.md` — 인트로 카드 스켈레톤
- `_content-card.template.md` — 내용 카드 (sparse/balanced 선택)
- `_outro-card.template.md` — 아웃트로 카드

## 11. 레퍼런스 이미지

- `v1.10.1/cards/01-intro.png` — 인트로 표준
- `v1.10.1/cards/02-attendance.png` — 2컬럼 병치 표준
- `v1.10.1/cards/03-seating.png` — 단독 항목 표준
- `v1.10.1/cards/04-outro.png` — 아웃트로 표준

**새 버전 생성 시 반드시 이 4장을 시각 기준으로 교차 검증**.
