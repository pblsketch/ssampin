# Impeccable Design Audit Report — SsamPin

> 2026-03-23 | Phase 0 기준선 감사

## Anti-Patterns Verdict

**PASS** — AI 슬롭 징후 없음. 쌤핀은 AI가 생성한 일반적 패턴(gradient text, glassmorphism 남용, cyan-on-dark, bounce easing)을 사용하지 않음. 카드 구조가 많지만 중첩(card-in-card)은 없고, 버튼 계층 구분도 잘 되어 있음.

**주의**: Tools 컴포넌트의 `from-sp-accent to-blue-400` gradient (6건)는 accent가 비파란색일 때 이질적. 개선 대상.

---

## Executive Summary

| 카테고리 | 이슈 수 | 심각도 |
|---------|--------|--------|
| 하드코딩 색상 (hex in classes) | 14건 (Onboarding) | Critical |
| `text-white` 오남용 | 513건 (CSS 오버라이드로 땜질) | High |
| `hover:bg-white/[arbitrary]` 미커버 | 4건 | High |
| `bg-slate-*` 하드코딩 | 70+건 | High |
| `text-slate-*` 하드코딩 | 60+건 | Medium |
| `border-slate-*` 하드코딩 | 30+건 | Medium |
| 모달 ARIA 미적용 | 26/28 파일 | High |
| 아이콘 버튼 aria-label 미적용 | ~200건 | High |
| 탭 ARIA role 미적용 | 4+ 컴포넌트 | Medium |
| `aria-expanded` 미적용 | 전체 0건 | Medium |
| `prefers-reduced-motion` 미적용 | 전체 0건 | Medium |
| 임의 font size `text-[Npx]` | 627건 | Medium |
| 인라인 스타일 `style={{}}` | 185건 | Low |
| `!important` (index.css) | 78건 | Medium (기술부채) |

**총점**: 60/100 — 설계는 우수하나 실행에 일관성 결여

---

## Detailed Findings

### 1. Theme Compatibility (Critical/High)

#### 1A. Hardcoded `bg-[#...]` — Critical (14건, 1개 파일)
- `src/adapters/components/Onboarding/Onboarding.tsx` — 13건 `bg-[#0d1117]`, `text-[#e2e8f0]`
- `src/adapters/components/Dashboard/MessageBanner.tsx` — 1건 `bg-[#0a0e17]`
- `src/adapters/components/Share/ShareModal.tsx` — 카카오 브랜드 `bg-[#FEE500]` (의도적, 유지)

#### 1B. `text-white` 오남용 — High (513건, 113 파일)
- `index.css:157-159`의 `.theme-light .text-white { color: var(--sp-text) !important }` 전역 오버라이드로 대응
- 이후 과목색 배경에서 white를 복원하기 위해 10개 색상 패밀리별 재오버라이드 (lines 174-222)
- **유지보수 함정**: 새로운 색상 배경 추가 시 CSS 오버라이드도 수동 추가 필요

#### 1C. `hover:bg-white/[arbitrary]` 미커버 — High (4건)
| 파일 | 패턴 |
|------|------|
| `ClassRosterTab.tsx:681` | `hover:bg-white/[0.02]` |
| `ClassRosterTab.tsx:774` | `hover:bg-white/[0.04]` |
| `WidgetContextMenu.tsx:114` | `hover:bg-white/[0.06]` |
| `WidgetContextMenu.tsx:140,220` | `hover:bg-white/[0.08]` |

index.css는 `/5`, `/10`, `/20`만 커버. 이 4건은 라이트 테마에서 호버 피드백 소실.

#### 1D. `bg-slate-*` — High (70+건)
주요 집중 파일: Onboarding(20+), Seating(12), GroupSeatingView(8), TimetableEditor(5)

#### 1E. `text-slate-*` — Medium (60+건)
`text-slate-200`, `text-slate-400` 미커버 (index.css는 300/500만 오버라이드)

#### 1F. Gradient 하드코딩 — Medium (6건)
Tools 컴포넌트의 `from-sp-accent to-blue-400` — accent 비파란색 시 이질적

---

### 2. Accessibility (High/Medium)

#### 2A. Modal/Dialog — High (26/28 파일 미적용)
- `role="dialog"` 있는 파일: 2개 (AssignmentCreateModal, NeisImportModal)
- `aria-labelledby`: 전체 0건
- 포커스 트랩: 전체 0건
- `tabindex` 사용: 전체 0건

#### 2B. Interactive Elements — High
- `aria-label`: 23개 파일에서 49회 사용 (HelpChat/Assignment에 집중)
- `aria-expanded`: 전체 0건
- `role="tablist"` / `role="tab"`: 전체 0건
- 드롭다운/확장 섹션 다수 존재하나 ARIA 미적용

#### 2C. Focus Management — Medium
- `outline-none` 229건 중 대부분은 `focus:ring` 대체 있음
- **대체 없이 outline만 제거**: MemoCard.tsx, MemoDetailPopup.tsx, MemoFocus.tsx (3건)
- `focus-visible:` 사용 드묾 (대부분 `focus:` 사용)

#### 2D. Motion — Medium
- `prefers-reduced-motion`: 0건
- `motion-safe:` / `motion-reduce:`: 0건

---

### 3. Typography (Medium)
- 임의 `text-[Npx]` 627건 (123 파일)
- font weight 계층 불명확 (medium/semibold/bold 혼재)
- Material Symbols 아이콘 100+ 인라인 `style={{ fontSize }}` (유틸리티 클래스 없음)

---

### 4. Responsive (Low — 데스크톱 앱이므로)
- breakpoint 사용: 23/168 파일 (14%)
- 고정 px 모달: `w-[560px]`, `w-[380px]`, `w-[320px]` (max-w 패턴 미사용)
- Settings 페이지만 반응형 잘 처리 (`hidden md:block`)
- 시간표/좌석배치: `overflow-x-auto`로 가로 스크롤 적절히 처리

---

## Positive Findings

| 영역 | 평가 | 설명 |
|------|------|------|
| CSS 변수 시스템 | EXCELLENT | `--sp-*` 9개 토큰, 일관된 Tailwind 매핑 |
| Auto-contrast 로직 | EXCELLENT | `perceivedBrightness()` 기반 accent-fg 자동 계산 |
| 테마 전환 | GOOD | `useLayoutEffect`로 FOUC 방지, CSS 변수 런타임 주입 |
| 위젯 커스터마이징 | GOOD | 색상/폰트/그림자/배경 CSS 변수 파이프라인 |
| Gradient text 없음 | PASS | `bg-clip-text text-transparent` 0건 |
| Glassmorphism 절제 | PASS | 모달 오버레이에만 적절히 사용 |
| 카드 중첩 없음 | PASS | card-in-card 패턴 0건 |
| 버튼 계층 구분 | PASS | primary/secondary/ghost 분리 |
| 바운스 이징 없음 | PASS | typing indicator 1곳만 (적절) |
| WCAG 색상 대비 | GOOD | 라이트 테마 텍스트 다크닝 규칙 (index.css 269-435) |

---

## Fix Roadmap (Phase별 매핑)

| 이슈 | Phase | Impeccable 스킬 |
|------|-------|-----------------|
| 하드코딩 hex 제거 | Phase 1A | `/normalize` |
| `text-white` → `text-sp-text` | Phase 1B | `/normalize` |
| `bg/text/border-slate-*` 교체 | Phase 1C | `/normalize` |
| `hover:bg-white/*` 교체 | Phase 1C | `/normalize` |
| 타이포 스케일 통일 | Phase 2 | `/typeset` |
| 모달 ARIA + 포커스 트랩 | Phase 3A | `/harden` |
| aria-label, aria-expanded | Phase 3B | `/harden` |
| 포커스 스타일 통일 | Phase 3C | `/harden` |
| `prefers-reduced-motion` | Phase 3D | `/harden` |
| CSS 오버라이드 정리 | Phase 4 | `/normalize` |
| 공통 카드/입력/버튼 패턴 | Phase 5 | `/arrange` |
| 고정 px 모달 → max-w | Phase 5 | `/arrange` |
| Gradient 하드코딩 수정 | Phase 6 | `/colorize` |
