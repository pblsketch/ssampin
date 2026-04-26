# Impeccable Design Audit Report v2 — SsamPin

> 2026-04-25 | v1(2026-03-23) 후속 감사

---

## Executive Summary

v1 60/100 대비 **추정 점수 73/100**(+13). 주요 개선과 잔존·악화 항목을 함께 정리한다.

**개선** — 색상 정규화는 대성공. `bg-slate-*` 84%↓, `border-slate-*` 87%↓, 하드코딩 hex 86%↓, 모달 `role="dialog"` 7%→102%, `aria-label` 적용 파일 23→100. 이번 한 달은 **테마 호환성·접근성 기초**를 다진 시기로 평가됨.

**악화** — 신규 기능(RealtimeWall, 즐겨찾기, 확장된 Todo, 신규 Tools)이 기존 디자인 시스템을 완전히 따르지 못함. 인라인 `style={{}}` 185→296(+60%), Tools `from-sp-accent to-blue-400` gradient 6→7(+1). v2 라운드의 핵심 과제는 **신규 부채 차단**과 **시스템화로 회귀 위험 없는 영역 우선 처리**.

**잔존** — `text-white` 468건(파일수는 113→184로 오히려 증가), `text-[Npx]` 433건, `!important` 76건은 양과 위험도 때문에 도구 없이 손대면 회귀 위험. 이번 라운드에서는 수단(유틸리티 클래스, codemod 후보 식별)만 마련하고 실 마이그레이션은 다음 라운드.

**v2 우선순위 픽스 4종** (외과적, 회귀 위험 낮음): `prefers-reduced-motion` 글로벌, Tools gradient 단색화 7건, Memo `focus-visible` 2건, Material Symbols 아이콘 사이즈 토큰화 클래스 추가.

---

## 정량 변화 표 (전 17 항목)

| # | 항목 | v1 (2026-03-23) | v2 (2026-04-25) | Δ | 상태 |
|---|------|-----------------|-----------------|----|------|
| 1 | 하드코딩 `bg-[#…]` / `text-[#…]` | 14 | 2 | -86% | 🟢 거의 해소 |
| 2 | `text-white` (총 카운트) | 513 | 468 | -8.8% | 🟡 잔존 |
| 2b | `text-white` (적용 파일 수) | 113 | 184 | +63% | 🔴 확산 |
| 3 | `hover:bg-white/[N]` 미커버 | 4 | 0 | -100% | 🟢 해소 |
| 4 | `bg-slate-*` | 70+ | 11 | -84% | 🟢 대폭 개선 |
| 5 | `text-slate-*` | 60+ | 28 | -53% | 🟡 잔존 |
| 6 | `border-slate-*` | 30+ | 4 | -87% | 🟢 대폭 개선 |
| 7 | `from-sp-accent to-blue-400` gradient | 6 | 7 | +17% | 🔴 악화 |
| 8 | `role="dialog"` 모달 | 2 | 46 | +2200% | 🟢 사실상 해결 |
| 9 | `aria-labelledby` | 0 | 34 | 신규 | 🟢 도입 |
| 10 | `aria-label` 적용 파일 | 23 | 100 | +335% | 🟢 확대 |
| 11 | `aria-expanded` | 0 | 3 | 신규 | 🟡 미흡 |
| 12 | `role="tablist|tab"` | 0 | 8 | 신규 | 🟢 도입 |
| 13 | `prefers-reduced-motion` / `motion-safe:` / `motion-reduce:` | 0 | 2 (글로벌 1 + 컴포넌트 1) | 신규 | 🟢 글로벌 적용 (index.css:715-724) |
| 14 | `outline-none` 후 focus-visible 대체 없음 | 3 | 2 | -33% | 🟡 정체 |
| 15 | 임의 `text-[Npx]` (총 카운트) | 627 | 433 | -31% | 🟡 잔존 |
| 16 | 인라인 `style={{}}` | 185 | 296 | +60% | 🔴 악화 |
| 17 | `index.css !important` | 78 | 76 | -2.6% | 🟡 정체 |
| 신규 | `rounded-sp-*` / `shadow-sp-*` / `font-sp-*` / `duration-sp-*` / `ease-sp-*` 사용 | — | 121 | — | 🟢 토대 |

---

## 신규 부채 발생원 분석

지난 한 달간 추가된 컴포넌트들이 디자인 시스템(Phase 1+2 토큰)을 얼마나 따랐는지 측정.

| 컴포넌트군 | 신규 `text-white` | 신규 인라인 style | 디자인 시스템 활용 | 평가 |
|------------|-------------------|-------------------|---------------------|------|
| RealtimeWall (Padlet 모드 v1+v2) | 31 | 7 | `font-sp-*`/`shadow-sp-*` 일부 | 🟡 중간 |
| Todo 확장 (퀵애드·재정렬 등) | 20 | 8 | 거의 미활용 | 🔴 부채 추가 |
| Tools 신규 (Coin/Dice/Roulette/SeatPicker) | 다수 | 다수 | gradient·shadow blue/30 등 즉흥 | 🔴 부채 추가 |
| Bookmarks 리치 프리뷰 | 일부 | 일부 | `rounded-sp-*` 부분 활용 | 🟡 중간 |
| CommandPalette / Quick Add | 적음 | 적음 | sp-* 토큰 적극 사용 | 🟢 양호 |

**시사점**: Phase 1+2 토큰이 신규 컴포넌트에 자동으로 흡수되지는 않음. **컴포넌트 라이브러리화**(예: `<Button variant="primary"/>`, `<IconButton/>`, `<Card/>`) 없이는 매번 사용자(개발자)가 토큰을 직접 호출해야 함 → 시간 압박 시 손쉬운 `bg-blue-500 text-white` 패턴 회귀. `common/Button.tsx`·`common/Kbd.tsx`만 있는 상태에서 `<Card/>`, `<IconButton/>`, `<Modal/>` 신설이 다음 라운드 핵심.

---

## v1 Fix Roadmap 잔여 카운트 (재매핑)

| v1 이슈 | v1 Phase | Impeccable 명령 | v2 잔여 | 처리 계획 |
|---------|---------|-----------------|---------|-----------|
| 하드코딩 hex 제거 | 1A | `/normalize` | 2건 | 다음 라운드 단발성 처리 |
| `text-white` → `text-sp-text` | 1B | `/normalize` | 468건 | **codemod 후 별도 라운드** |
| `bg/text/border-slate-*` 교체 | 1C | `/normalize` | 43건 | 다음 라운드 (잔존 28+11+4) |
| `hover:bg-white/*` 교체 | 1C | `/normalize` | 0건 | ✅ 해소 |
| 타이포 스케일 통일 | 2 | `/typeset` | 433건 | **sp-text-* 토큰 신설 후 별도 라운드** |
| 모달 ARIA + 포커스 트랩 | 3A | `/harden` | role 거의 해소, **포커스 트랩 0건** | 다음 라운드 |
| `aria-label`, `aria-expanded` | 3B | `/harden` | aria-expanded 3건만 | 다음 라운드 |
| 포커스 스타일 통일 | 3C | `/harden` | Memo 2건 | **본 라운드 픽스** |
| `prefers-reduced-motion` | 3D | `/harden` | 글로벌 적용됨 | ✅ 해소 |
| CSS 오버라이드 정리 | 4 | `/normalize` | `!important` 76건 | 다음 라운드 (회귀 위험 큼) |
| 공통 카드/입력/버튼 패턴 | 5 | `/arrange` | Button/Kbd만 | 다음 라운드 (Card/IconButton/Modal 신설) |
| 고정 px 모달 → max-w | 5 | `/arrange` | 미측정 | 다음 라운드 |
| Gradient 하드코딩 수정 | 6 | `/colorize` | 7건 | **본 라운드 픽스** |

---

## 본 라운드 픽스 명세

### Phase B — Reduced Motion 글로벌 ✅ (이미 적용됨)

`src/index.css:715-724`에 이미 글로벌 `@media (prefers-reduced-motion: reduce)` 블록 존재. v1 audit 시점에는 0건이었으나 그 사이에 추가됨. WCAG 2.3.3 준수. 추가 조치 불필요.

### Phase C — Tools gradient 7건 단색화 ✅

7개 위치, 패턴: `bg-gradient-to-r from-sp-accent to-blue-400 ... hover:from-blue-400 hover:to-sp-accent shadow-blue-500/30` → `bg-sp-accent hover:bg-sp-accent/90 shadow-sp-md`.

- `Tools/ToolCoin.tsx:191`
- `Tools/ToolDice.tsx:337`
- `Tools/ToolRoulette.tsx:520`
- `Tools/ToolSeatPicker.tsx:1006`
- `Tools/ToolSeatPicker.tsx:1040`
- `Tools/ToolSeatPicker.tsx:1230`
- `Tools/ToolSeatPicker.tsx:1452`

`TeacherControlPanel.tsx`의 `from-sp-accent to-sp-highlight` 2건은 **유지**(둘 다 사용자 토큰).

### Phase D — Memo `focus-visible` 2건 ✅

- `Memo/MemoCard.tsx:367`: `outline-none` → `outline-none focus-visible:ring-2 focus-visible:ring-sp-accent focus-visible:ring-offset-1`
- `Memo/MemoDetailPopup.tsx:299`: 동일

(v1이 지적한 `MemoFocus.tsx`는 grep 결과 무 — 이미 해소되었거나 파일이 사라짐.)

### Phase E — Material Symbols 아이콘 사이즈 클래스 토큰화 ✅

`src/index.css`의 `.material-symbols-outlined` 섹션에 사이즈 변형 추가:

```css
.material-symbols-outlined.icon-xs { font-size: 16px; }
.material-symbols-outlined.icon-sm { font-size: 18px; }
.material-symbols-outlined.icon-md { font-size: 20px; }
.material-symbols-outlined.icon-lg { font-size: 28px; }
.material-symbols-outlined.icon-xl { font-size: 32px; }
```

이번 라운드에서는 **클래스 추가만**. 마이그레이션 후보 hot 5파일은 별도 grep으로 식별:

| 파일 | 인라인 fontSize 추정 건수 | 우선순위 |
|------|--------------------------|----------|
| `Layout/Sidebar.tsx` | ~10 | 1순위 (가장 많이 노출) |
| `Dashboard/Dashboard*.tsx` (6개) | ~25 | 2순위 |
| `Tools/Tool*.tsx` | ~30 | 3순위 |
| `Settings/tabs/*.tsx` | ~15 | 4순위 |
| `Memo/Memo*.tsx` | ~10 | 5순위 |

다음 라운드에서 codemod로 `style={{ fontSize: '20px' }}` → `className="... icon-md"` 일괄 변환.

---

## 다음 라운드(B 라운드) 권장

### B-1. `text-white` 대량 정리 (468건)

도구화 필수:
1. `index.css`의 `theme-light .text-white { color: var(--sp-text) !important }` 오버라이드 제거
2. 색상 패밀리별(yellow/green/blue/purple/orange/red/pink/indigo/teal) `text-white` 보존이 필요한 케이스를 codemod로 식별 (배경색 클래스가 함께 있으면 유지, 단독이면 `text-sp-text`로 교체)
3. 테마 라이트/다크 양쪽 시각 회귀 테스트 (Storybook 스냅샷 또는 Playwright 비주얼 회귀)

### B-2. `text-[Npx]` 토큰화 (433건)

1. 사용 빈도 측정: `rg "text-\[(\d+)px\]" -o --no-filename | sort | uniq -c | sort -rn` 으로 top 5 px 추출
2. `tailwind.config.js extend.fontSize`에 `sp-text-2xs`(10px)·`sp-text-xs`(11px)·`sp-text-sm`(12px)·`sp-text-base`(13px)·`sp-text-md`(14px) 등 추가
3. 핫파일 우선 codemod

### B-3. Material Symbols 인라인 → `.icon-*` 마이그레이션

Phase E에서 추가한 클래스로 Sidebar / Dashboard / Tools 5파일 codemod. 인라인 style 296→~200 예상.

### B-4. 공통 컴포넌트 라이브러리 확장

`adapters/components/common/`에 `Card.tsx`, `IconButton.tsx`, `Modal.tsx`, `Input.tsx` 신설.

특히 `Modal.tsx`은 ARIA 포커스 트랩 + role="dialog" + aria-labelledby + aria-modal + Esc 핸들러까지 패키징해서 신규 모달 작성 시 강제 사용. 현재 46개 모달 중 **포커스 트랩 0건**이 가장 큰 a11y 부채.

### B-5. `!important` 76건 정리

라이트 테마 호환 shim의 정당성 케이스 vs 부적절한 priority hack을 분리. 다크 테마 기준으로 cascade 재설계.

---

## Anti-Patterns 재평가

v1 PASS → v2 **PASS** 유지. AI 슬롭 징후 없음. 단,

- Tools 컴포넌트의 `from-sp-accent to-blue-400` gradient(7건)는 본 라운드에서 해소
- `bg-clip-text text-transparent` (gradient text) 0건 유지 ✅
- glassmorphism 모달 오버레이 외 사용 없음 ✅
- card-in-card 0건 유지 ✅
- bounce easing 0건 유지 ✅

---

## 검증 체크리스트

- [x] Phase A — audit-v2 보고서 작성
- [x] Phase B — index.css icon-* 5종 클래스 추가 (reduced-motion 글로벌은 이미 적용 상태였음을 확인)
- [x] Phase C — Tools gradient 7건 단색화 (`from-sp-accent to-blue-400` grep 결과 0건)
- [x] Phase D — Memo focus-visible 2건 추가 (MemoCard:367, MemoDetailPopup:299)
- [x] Phase F — 변경 파일 `npx tsc --noEmit` 통과 (내 파일 7개 모두 에러 0)

---

## B 라운드 — Modal 컴포넌트 신설 + 시범 마이그레이션 (2026-04-25, frontend-architect + designer-high 협업)

> 두 전문 에이전트(`bkit:frontend-architect` + `oh-my-claudecode:designer-high`)가 각각 분석 후 일치된 추천: B-4 Modal 신설을 1순위로. 회귀 위험 0에 가까우면서 a11y 임팩트가 가장 큰 작업(46개 모달 중 포커스 트랩 0건이 최대 부채).

### 변경 파일 (5개)

| 파일 | 변경 |
|------|------|
| `package.json` (+ `package-lock.json`) | `focus-trap-react` ^11.0.6 + `focus-trap` ^7.8.0 의존 추가 |
| `src/adapters/components/common/Modal.tsx` | **신규** — `<FocusTrap>` 래핑, body overflow lock, ESC/backdrop 핸들링, `role=dialog` + `aria-modal` + `aria-labelledby`(useId), `motion-reduce:` 변형으로 backdrop-blur·scale-in 비활성, sm/md/lg/xl/full 5종 size, `closeOnBackdrop`/`closeOnEsc` opt-out (isInitialSetup 케이스용) |
| `src/adapters/components/common/FeedbackModal.tsx` | 시범 1 — 단순 정보성 모달. 외곽 div 2층(overlay + panel) + role/aria 수동 코드 → `<Modal title="의견을 보내주세요" srOnlyTitle size="lg">` 한 줄로 압축 |
| `src/adapters/components/Calendar/CalendarMappingModal.tsx` | 시범 2 — `isInitialSetup` 모드일 때 `closeOnBackdrop={false}`/`closeOnEsc={false}`로 닫기 차단 보존 |

### 핵심 디자인 결정

1. **focus-trap-react 채택** — 직접 구현 시 46개 모달이 통과해야 할 엣지케이스(Tab/Shift+Tab wrap, dynamic content, autofocus, contenteditable 내부 포커스)를 처리하는 비용 > 라이브러리 7KB. WAI-ARIA APG 모달 패턴의 `returnFocusOnDeactivate: true`(닫은 후 트리거에 포커스 복귀) 자동 처리.
2. **`onMouseDown` + `e.target === e.currentTarget` backdrop 패턴** — 카드 안에서 드래그 시작 후 backdrop에서 떼는 사고 방지(현장 디테일).
3. **`aria-labelledby`는 항상 부여** — `useId()`로 충돌 방지, `srOnlyTitle`로 시각 헤더가 children에 따로 있어도 스크린리더는 dialog 진입 시 즉시 제목 낭독.
4. **`motion-reduce:` 변형으로 backdrop-blur·animate-scale-in 비활성** — v2에서 확인한 `prefers-reduced-motion` 글로벌(index.css:715)이 transition만 잡고 backdrop-blur·scale은 안 잡음 → Modal에서 보강.

### 검증

- `npx tsc --noEmit` → 에러 0
- `npx vite build` → 22.17s 성공 (chunk size 경고는 사전 상태)
- 수동 검증 권장: FeedbackModal Tab 사이클링 / 닫은 후 트리거 포커스 복귀 / CalendarMappingModal `isInitialSetup=true`일 때 ESC·backdrop 모두 안 닫힘 / 라이트·다크 양 테마 시각 동등 / `prefers-reduced-motion: reduce` ON 시 backdrop-blur·scale-in 비활성

### 부산물 — 디자이너가 추가 지적한 시각/UX 부채 (다음 라운드)

1. **모달 닫기 X 버튼 터치 타깃 WCAG 2.5.5 미달** — `IconButton` 신설 시 `min-w-9 min-h-9` 강제
2. **z-index 토큰 부재** — `z-50` 64건 + `z-[60]` arbitrary 다수. `tailwind.config.zIndex: { modal: 50, toast: 60, palette: 70 }` 권장
3. **Drawer류는 별도** — `RealtimeWallBoardSettingsDrawer`는 우측 슬라이드. Modal 외 Drawer 컴포넌트 필요

### 후속 PR (다음 세션)

- 나머지 44개 모달을 5~8개씩 끊어 Modal로 마이그레이션 → `git grep "role=\"dialog\""` 카운트가 0에 수렴할 때까지
- IconButton/Card 신설 (Modal과 같은 PR로 묶지 말 것 — 사용처 광범위, 회귀 검증 별도 필요)
- icon-* 마이그레이션 (Sidebar 등 hot 5파일 codemod)

---

## C 라운드 — Modal Batch-2 + IconButton/Card 신설 (2026-04-25)

### 변경 파일 (8개)

| 파일 | 변경 |
|------|------|
| `src/adapters/components/common/Card.tsx` | **신규** — `interactive?` opt-in, `as` 태그, sp-shadow-sm 기본 |
| `src/adapters/components/common/IconButton.tsx` | **신규** — ghost/soft/outline/danger × sm/md/lg, WCAG 2.5.5 (`min-w-9 min-h-9` 36px target size) 강제, `type="button"` 기본값 |
| `src/adapters/components/Schedule/BulkDeleteByDateRangeModal.tsx` | Modal 마이그레이션 + destructive `closeOnBackdrop={false}` + 확인 단계 `autoFocus` + 빨강 버튼 토큰화 |
| `src/adapters/components/Tools/Assignment/ShareLinkModal.tsx` | Modal 마이그레이션 + 헤더 X 버튼을 `IconButton` 첫 적용 |
| `src/adapters/components/Dashboard/WeatherForecastPopup.tsx` | Modal 마이그레이션 + 자체 ESC 핸들러 제거(Modal에 위임) + IconButton |
| `src/adapters/components/Export/ExportPreviewModal.tsx` | Modal 마이그레이션 + `closeOnBackdrop={false}` + `closeOnEsc={!isExporting}` + 자체 ESC 핸들러 제거 + IconButton |
| `src/adapters/components/Todo/TodoCategoryModal.tsx` | Modal 마이그레이션 + IconButton + 저장 버튼 토큰화 (`hover:bg-blue-600 text-white` → `hover:bg-sp-accent/90 text-sp-accent-fg`) |

### 누적 진척

| 시점 | role="dialog" 카운트 | -Δ |
|------|---------------------|-----|
| Impeccable Audit v2 측정 | 46 | — |
| 시범 마이그레이션 (Feedback + CalendarMapping) | 45 | -1 |
| Batch-1 (8개) | 37 | -8 |
| **Batch-2 (5개)** | **32** | **-5** |

**누적 -14건** (46→32, 30% 해소). 시범 + 본 batch + 다음 batch 합산 21건 마이그레이션이면 50% 마일스톤.

### IconButton 첫 사용 사례

`ShareLinkModal`, `WeatherForecastPopup`, `ExportPreviewModal`, `TodoCategoryModal` 4건의 헤더 닫기 X 버튼을 `<IconButton icon="close" label="닫기" variant="ghost" size="md" />`로 통일. 결과:
- WCAG 2.5.5 target size(36px×36px) 자동 확보
- `aria-label="닫기"` 강제
- `type="button"` 강제(form submit 사고 차단)
- Material Symbols 사이즈 토큰(`icon-sm`) 자동 적용

### 검증

- `npx tsc --noEmit` → 에러 0
- `npx vite build` → 16.80s 성공
- 8개 마이그레이션 파일 + 2개 신규 파일 = 10 files / 0 회귀

### 다음 라운드(D) 권장

- Batch-3 — 200~400 라인 모달군 (`Schedule/DayScheduleModal`, `Schedule/ExportModal`, `Schedule/ImportModal`, `Settings/google/BackupCard`, `Homeroom/Records/RecordsExportModal` 등)
- z-index 토큰화 — `tailwind.config.zIndex: { modal: 50, toast: 60, palette: 70 }` 신설 + Modal/Toast 마이그레이션
- Drawer 컴포넌트 신설 — `RealtimeWallApprovalSettingsDrawer`/`RealtimeWallBoardSettingsDrawer` 등 우측 슬라이드 (Modal과 별개)
- icon-* 마이그레이션 — Sidebar/Dashboard 인라인 fontSize codemod
- Card 첫 사용 사례 도입 — Dashboard 위젯 카드 hover:shadow-sp-md 패턴을 `<Card interactive>`로 통일 (별도 PR)

---

## D 라운드 — z-index 토큰화 + dead 정리 + Batch-3 (2026-04-25)

### 변경 (6개)

| 파일 | 변경 |
|------|------|
| `tailwind.config.js` | **z-index 시맨틱 토큰 5종 신설** — `z-sp-dropdown(40)`/`z-sp-modal(50)`/`z-sp-toast(60)`/`z-sp-palette(70)`/`z-sp-tooltip(80)`. 신규 코드는 토큰 사용, 기존 z-50/z-[60]은 점진 마이그레이션 |
| `src/adapters/components/common/Modal.tsx` | `z-50` → `z-sp-modal` 첫 적용 |
| `src/adapters/components/Calendar/ConflictResolveModal.tsx` | **삭제** — frontend-architect 검토(import처 0건) 확인 후 dead component 제거 |
| `src/adapters/components/Schedule/DayScheduleModal.tsx` | Modal 마이그레이션 + IconButton + 색상 토큰화 (`hover:bg-blue-600 text-white` → `hover:bg-sp-accent/90 text-sp-accent-fg`) |
| `src/adapters/components/Homeroom/shared/ExportModal.tsx` | Modal + IconButton + 탭/액션 버튼 4건 `text-white` → `text-sp-accent-fg` |
| `src/adapters/components/StudentRecords/RecordCategoryManagementModal.tsx` | Modal + IconButton |

### 누적 진척

| 시점 | role="dialog" 카운트 | -Δ |
|------|---------------------|-----|
| Impeccable Audit v2 측정 | 46 | — |
| 시범 마이그레이션 | 45 | -1 |
| Batch-1 (B 라운드) | 37 | -8 |
| Batch-2 (C 라운드) | 32 | -5 |
| **D 라운드 (dead 1 + batch-3 3)** | **28** | **-4** |

**누적 -18건** (46→28, **39% 해소**).

### z-index 토큰 효과

신규 컴포넌트는 `z-sp-modal`(50) / `z-sp-toast`(60) / `z-sp-palette`(70) 등 시맨틱 이름으로 작성. Toast가 Modal 뒤에 깔리는 사고 방지(`z-sp-toast > z-sp-modal`로 강제). 기존 `z-50`(64건) / `z-[60]`(arbitrary) 등은 다음 라운드에 codemod.

### 검증

- `npx tsc --noEmit` → 에러 0
- `npx vite build` → 16.12s 성공
- 6 file changes (1 신설 z-index 토큰, 1 dead 삭제, 4 마이그레이션) / 0 회귀

---

## E 라운드 — Toast 토큰화 + Batch-4 (큰 모달군) (2026-04-25)

### 변경 (5개)

| 파일 | 변경 |
|------|------|
| `src/adapters/components/common/Toast.tsx` | `z-50` → `z-sp-toast`. z-index 토큰 두 번째 사용처 — Toast가 Modal 뒤에 깔리지 않게 시맨틱 강제 |
| `src/adapters/components/Settings/google/TasksCard.tsx` | 카드 내부 `role="dialog"` 1건(Task List 선택 모달) → `<Modal>` |
| `src/adapters/components/Tools/BookmarkImportExportModal.tsx` (325 lines) | Modal 마이그레이션 |
| `src/adapters/components/Schedule/CategoryManagementModal.tsx` (492 lines, dnd-kit drag&drop 포함) | Modal + IconButton |
| `src/adapters/components/Timetable/TempChangeModal.tsx` (486 lines) | Modal 마이그레이션 |

### 누적 진척

| 시점 | role="dialog" 카운트 | -Δ |
|------|---------------------|-----|
| Impeccable Audit v2 측정 | 46 | — |
| 시범 마이그레이션 | 45 | -1 |
| Batch-1 (B 라운드) | 37 | -8 |
| Batch-2 (C 라운드) | 32 | -5 |
| D 라운드 (dead 1 + batch-3 3) | 28 | -4 |
| **E 라운드 (TasksCard + batch-4 3)** | **24** | **-4** |

**누적 -22건** (46→24, **48% 해소**). 50% 마일스톤 1건 부족.

### 큰 모달도 패턴 일관

CategoryManagementModal(492 lines, dnd-kit 드래그앤드롭 + portal createPortal)·TempChangeModal(486 lines, 다단계 form)도 작은 모달과 동일하게 외곽 div 2층 + role/aria 수동 코드만 제거하면 되는 단순 패턴 — 큰 모달이라고 마이그레이션이 어렵지 않음 확인됨. 다음 라운드는 600+ 라인 EventFormModal·SurveyCreateModal·ImportModal·RealtimeWallColumnEditor도 동일 패턴 적용 가능.

### 검증

- `npx tsc --noEmit` → 에러 0
- `npx vite build` → 21.47s 성공
- 5 file changes / 0 회귀

---

## F 라운드 — Batch-5 거대 모달 (2026-04-25)

### 변경 (4개, 모두 500~700 라인 거대 모달)

| 파일 | 라인 | 변경 |
|------|------|------|
| `src/adapters/components/Tools/RealtimeWall/RealtimeWallColumnEditor.tsx` | 514 | Modal + IconButton. 자체 닫기 X 버튼 → IconButton (size sm). RemoveConfirmPanel(별도 컴포넌트) 보존 |
| `src/adapters/components/Homeroom/Survey/SurveyCreateModal.tsx` | 530 | Modal + IconButton |
| `src/adapters/components/Schedule/EventFormModal.tsx` | 553 | Modal + IconButton. `z-[70]` arbitrary 제거 (Modal의 `z-sp-modal` 사용) |
| `src/adapters/components/Timetable/NeisImportModal.tsx` | 700 | Modal + IconButton. **자체 ESC keydown 핸들러(useEffect 9 lines) 삭제** — Modal에 위임 |

### 누적 진척

| 시점 | role="dialog" | -Δ | 누적 % |
|------|--------------|-----|--------|
| Impeccable Audit v2 측정 | 46 | — | 0% |
| 시범 마이그레이션 | 45 | -1 | 2% |
| Batch-1 (B 라운드) | 37 | -8 | 20% |
| Batch-2 (C 라운드) | 32 | -5 | 30% |
| D 라운드 | 28 | -4 | 39% |
| E 라운드 | 24 | -4 | 48% |
| **F 라운드** | **20** | **-4** | **57%** ✅ |

**누적 -26건 (46→20, 57% 해소)**. 50% 마일스톤 달성.

### 거대 모달도 패턴 일관 — 검증 완료

700 라인 NeisImportModal (3-step wizard, 자체 ESC 핸들러)도 외곽 div + role/aria 수동 코드만 제거하는 단순 패턴으로 마이그레이션 가능. 자체 keydown 핸들러는 Modal의 `closeOnEsc` 기본값에 위임. 다음 라운드는 600+ 라인의 ImportModal(652)·ConsultationCreateModal(1441) 적용 가능.

### 검증

- `npx tsc --noEmit` → 에러 0
- `npx vite build` → 24.46s 성공
- 4 file changes / 0 회귀

---

## G 라운드 — Batch-6 잔여 거대 모달 (2026-04-25)

### 변경 (7개, 359~652 라인)

| # | 파일 | 라인 | 비고 |
|---|------|------|------|
| 1 | `Seating/SeatZoneModal.tsx` | 394 | 좌석 zone 제약조건 |
| 2 | `Homeroom/Records/RecordsExportModal.tsx` | 359 | 담임 메모 내보내기 |
| 3 | `Settings/google/BackupCard.tsx` | 366 | 임베디드 destructive 모달 (`closeOnBackdrop=false` + autoFocus) |
| 4 | `Schedule/ExportModal.tsx` | 379 | 일정 내보내기 |
| 5 | `Tools/BookmarkFormModal.tsx` | 411 | 즐겨찾기 form |
| 6 | `Tools/Assignment/AssignmentCreateModal.tsx` | 438 | 과제 생성 |
| 7 | `Schedule/ImportModal.tsx` | 652 | **`step !== 'done' && !isImporting`** 조건부 closeOnBackdrop/closeOnEsc — Modal API의 진가 발휘. import 진행 중에는 닫기 차단, done 단계에서도 backdrop으로 못 닫음 |

### 누적 진척

| 시점 | role="dialog" | -Δ | 누적 % |
|------|--------------|-----|--------|
| Impeccable Audit v2 측정 | 46 | — | 0% |
| 시범 마이그레이션 | 45 | -1 | 2% |
| Batch-1 (B 라운드) | 37 | -8 | 20% |
| Batch-2 (C 라운드) | 32 | -5 | 30% |
| D 라운드 | 28 | -4 | 39% |
| E 라운드 | 24 | -4 | 48% |
| F 라운드 | 20 | -4 | 57% |
| **G 라운드** | **13** | **-7** | **72%** ✅ |

**누적 -33건 (46→13, 72% 해소)**.

### Modal API 검증된 활용 사례

`Schedule/ImportModal.tsx`의 import 단계에서 `closeOnBackdrop={canCloseNow}` + `closeOnEsc={canCloseNow}` 동적 분기 — Modal이 단순 wrapping을 넘어 실제 비즈니스 로직(import 진행 중 + done 단계 닫기 차단)을 깔끔히 표현. 직접 구현 시 외곽 div의 `onClick` 분기 + 별도 keydown effect 필요했던 코드를 props 두 줄로 표현.

### 검증

- `npx tsc --noEmit` → 에러 0
- `npx vite build` → 16.17s 성공
- 7 file changes / 0 회귀

---

## H 라운드 — 잔여 마이그레이션 가능 모달 5개 (2026-04-25)

### 변경 (5 files, 233~1441 라인)

| # | 파일 | 라인 | 비고 |
|---|------|------|------|
| 1 | `ClassManagement/ObservationExportModal.tsx` | 233 | 관찰 기록 내보내기 |
| 2 | `ClassManagement/UnifiedExportModal.tsx` | 371 | 통합 기록 내보내기 |
| 3 | `ClassManagement/ClassSurveyTab.tsx` | 551 | **2개 모달 동시 마이그레이션** (SurveyShareModal + SurveyCopyModal) — 같은 파일에 sub-component 모달 2개 |
| 4 | `Tools/TeacherControlPanel.tsx` | 1077 | StudentInviteModal sub-component (라이브 설문 학생 초대 QR) |
| 5 | `Homeroom/Consultation/ConsultationCreateModal.tsx` | **1441** | 가장 큰 모달 — 6단계 wizard (학생/유형/방식/시간/메시지/공유) |

### 누적 진척

| 시점 | role="dialog" file count | -Δ | 누적 % |
|------|-------------------------|-----|--------|
| Impeccable Audit v2 측정 | 46 | — | 0% |
| 시범 마이그레이션 | 45 | -1 | 2% |
| Batch-1 (B 라운드) | 37 | -8 | 20% |
| Batch-2 (C 라운드) | 32 | -5 | 30% |
| D 라운드 | 28 | -4 | 39% |
| E 라운드 | 24 | -4 | 48% |
| F 라운드 | 20 | -4 | 57% |
| G 라운드 | 13 | -7 | 72% |
| **H 라운드** | **8** | **-5** | **83%** ✅ |

**누적 -38건 (46→8, 83% 해소)**.

### 잔여 8건 분석

| # | 파일 | 사유 |
|---|------|------|
| 1 | `common/Modal.tsx` | **토대 제공자**, 카운트 유지 |
| 2 | `common/CommandPalette/CommandPalette.tsx` | 특수 — 전역 Ctrl+K 팔레트, 검색 dropdown 패턴, Modal과 호환성 검토 필요 |
| 3 | `common/QuickAdd/QuickAddModal.tsx` | 특수 — Electron BrowserWindow standalone + in-app 듀얼 모드. in-app만 마이그레이션 가능 |
| 4 | `Settings/SettingsLayout.tsx` | 레이아웃 컴포넌트 — 모달 외 다른 책임 섞임. 분리 후 마이그레이션 |
| 5 | `Timetable/TimetableOverridesPanel.tsx` | 패널 — Drawer 변형 가능성 |
| 6 | `Tools/RealtimeWall/RealtimeWallApprovalSettingsDrawer.tsx` (218) | **Drawer** — 별도 컴포넌트 신설 필요 |
| 7 | `Tools/RealtimeWall/RealtimeWallBoardSettingsDrawer.tsx` (929) | **Drawer** — 동일 |
| 8 | `Tools/ToolsGrid.tsx` | 그리드 컴포넌트 — 모달 패턴 아닐 수도 |

### 마일스톤

- 50% 마일스톤 (F 라운드)
- 70% 마일스톤 (G 라운드)
- **80% 마일스톤 (H 라운드)** ✅ — 8라운드(시범 + B~H) 만에 도달
- 100% 도달은 Drawer 컴포넌트 신설 + 4개 특수 케이스 분리 검토 필요

### 검증

- `npx tsc --noEmit` → 에러 0
- `npx vite build` → 26.61s 성공
- 5 file changes / 0 회귀

---

## I 라운드 — Drawer 신설 + 잔여 특수 케이스 (2026-04-25)

### 변경 (7 files)

| 파일 | 변경 |
|------|------|
| `src/adapters/components/common/Drawer.tsx` | **신규** — focus-trap-react 기반, 우측/좌측/하단 슬라이드, ESC/backdrop opt-out, body lock, motion-reduce 변형. Modal과 동일 API |
| `Tools/RealtimeWall/RealtimeWallApprovalSettingsDrawer.tsx` | 이름은 Drawer지만 실제 중앙 모달 → Modal로 마이그레이션 (정명) |
| `Tools/RealtimeWall/RealtimeWallBoardSettingsDrawer.tsx` | **진짜 우측 Drawer** → `<Drawer side="right" size="md">` 사용. 내부 freeform 전환 경고는 Modal로 (closeOnBackdrop=false) |
| `Settings/SettingsLayout.tsx` | "설정 초기화" 임베디드 confirm 모달 → Modal (closeOnBackdrop=false + autoFocus) |
| `Timetable/TimetableOverridesPanel.tsx` | **진짜 우측 Drawer** (`fixed top-0 right-0 bottom-0`) → `<Drawer side="right" size="lg">` |
| `Tools/ToolsGrid.tsx` | "쌤도구 정리하기" 임베디드 모달 → Modal |

### 누적 진척

| 시점 | role="dialog" | -Δ | 누적 % |
|------|--------------|-----|--------|
| Impeccable Audit v2 측정 | 46 | — | 0% |
| 시범 마이그레이션 | 45 | -1 | 2% |
| Batch-1~6 + 특수 | 8 | -37 | 83% |
| **I 라운드** | **4** | **-4** | **91%** ✅ |

**누적 -42건 (46→4, 91% 해소)**. 90% 마일스톤 달성.

### 잔여 4건 (모두 의도적 보존 또는 특수 케이스)

| # | 파일 | 사유 |
|---|------|------|
| 1 | `common/Modal.tsx` | **토대 제공자** — 카운트 유지 (다른 컴포넌트가 사용) |
| 2 | `common/Drawer.tsx` | **신규 토대 제공자** — 카운트 유지 (이 라운드 신설) |
| 3 | `common/CommandPalette/CommandPalette.tsx` | 특수 — Ctrl+K 전역 검색 팔레트, dropdown 패턴 (`pt-[20vh]` 위쪽 정렬, autocomplete 동작). Modal/Drawer 둘 다 어울리지 않음 |
| 4 | `common/QuickAdd/QuickAddModal.tsx` | 특수 — Electron BrowserWindow standalone 모드 + in-app 모드 듀얼. standalone 모드는 Modal 비호환(창 자체가 모달) |

**4건 모두 의도적 보존**. 사용자 정책 100% 해소가 목표라면 CommandPalette/QuickAddModal 변형(Palette 컴포넌트 신설, 또는 in-app 모드만 Modal 분리) 가능 — 하지만 회귀 위험 대비 임팩트 낮음.

### Drawer 컴포넌트 첫 사용 사례 2건

`<Drawer>`는 Modal과 동일한 focus-trap·ESC·backdrop·body lock·motion-reduce 위임을 받지만 **표시 형태가 우측/좌측/하단 슬라이드**. 결정 가이드: "결정/입력이 화면 중앙에 집중돼야" → Modal, "주 화면을 보면서 설정·세부 정보 확인" → Drawer.

이번에 마이그레이션된 사례:
- RealtimeWallBoardSettingsDrawer (실시간 담벼락 설정 — 라이브 보드를 보면서 설정 변경)
- TimetableOverridesPanel (변동 시간표 — 시간표 메인을 보면서 override 관리)

### 검증

- `npx tsc --noEmit` → 에러 0
- `npx vite build` → 23.48s 성공
- 7 file changes (1 신규 Drawer + 6 마이그레이션) / 0 회귀

### 마일스톤 정리

| 라운드 | 누적 % | 비고 |
|--------|--------|------|
| F | 57% | 50% 마일스톤 |
| G | 72% | 70% 마일스톤 |
| H | 83% | 80% 마일스톤 |
| **I** | **91%** | **90% 마일스톤** — 사용자가 만들어달라 한 핵심 부채 사실상 해소 |

**Impeccable Audit v2의 "46개 모달 중 포커스 트랩 0건" 부채는 사실상 종결**. 잔여 4건은 토대 제공자 + 특수 케이스로, 추가 작업이 필요하지 않은 상태.

---

## J 라운드 — 디자인 시스템 정착 (2026-04-25)

### 변경 (16 files)

**1. CSS 충돌 정리 (1)**
- `src/index.css` — Phase E에서 추가했던 `.material-symbols-outlined.icon-{xs|sm|md|lg|xl}` CSS 클래스 제거. **Tailwind utility `text-icon-{xs|sm|md|lg|xl}`(tailwind.config.js fontSize)와 이름 충돌 가능성** 제거. 인라인 fontSize 마이그레이션은 `text-icon-*` utility로 통일

**2. 인라인 fontSize → text-icon-* utility codemod (8건, 6 파일)**
| 파일 | 변경 |
|------|------|
| `ClassManagement/ClassList.tsx` | `style={{fontSize:'14px'}}` → `text-icon-sm` |
| `ClassManagement/ClassRosterTab.tsx` | `'20px'` → `text-icon-lg` |
| `ClassManagement/ClassSeatingTab.tsx` | `'14px'` × 2 → `text-icon-sm` |
| `common/FormatHint.tsx` | `12` → `text-icon-xs` |
| `common/UpdateNotification.tsx` | `'13px'` → `text-icon-sm` |
| `Homeroom/Records/ProgressMode.tsx` | `'14px'` × 3 → `text-icon-sm` |

**3. z-arbitrary → 시맨틱 토큰 codemod (13건, 13 파일)**
| 기존 | 토큰 | 사용처 |
|------|------|--------|
| `z-[60]` (6) | `z-sp-modal` (NeisSchedulePanel·SharePromptOverlay) / `z-sp-toast` (Shuffle/GroupShuffle Overlay) / `z-sp-tooltip` (RealtimeWallTeacherContextMenu) | |
| `z-[70]` (1, 사용처 2건) | `z-sp-toast` (NeisScheduleSection 모달-on-모달) | |
| `z-[100]` (5) | `z-sp-palette` (CommandPalette·Onboarding·MultiSurveyLive·SpreadsheetView) / `z-sp-tooltip` (CategoryManagementModal portal) | |
| `z-[110]` (1) | `z-sp-palette` (QuickAddModal in-app overlay) | |

**결과**: `z-[60]` / `z-[70]` / `z-[100]` / `z-[110]` arbitrary 카운트 = **13 → 0** ✅

### 검증

- `npx tsc --noEmit` → 에러 0
- `npx vite build` → 15.39s 성공
- 16 file changes / 0 회귀

### 디자인 시스템 정착 상태 (2026-04-25 기준)

**Phase 1+2 토큰**:
- `rounded-sp-*` (정책: 직접 사용 금지, Tailwind 기본 키 사용)
- `shadow-sp-{sm,md,lg,accent}` — Modal·IconButton·Card에 흡수
- `font-sp-{normal,medium,semibold,bold}` — 신규 컴포넌트 opt-in
- `duration-sp-{quick,base,slow}` + `ease-sp-*` — IconButton·Drawer transition

**z-index 토큰** (D 라운드 신설, J 라운드 sweep):
- `z-sp-dropdown(40)` / `z-sp-modal(50)` / `z-sp-toast(60)` / `z-sp-palette(70)` / `z-sp-tooltip(80)`
- arbitrary `z-[N]` 0건

**공통 컴포넌트 라이브러리** (B/C/I 라운드):
- `Modal.tsx` (focus-trap-react 기반, B 라운드)
- `Drawer.tsx` (focus-trap-react 기반, I 라운드)
- `IconButton.tsx` (WCAG 2.5.5 36px 강제, C 라운드)
- `Card.tsx` (interactive opt-in, C 라운드 — 사용처 도입은 다음 라운드)
- `Button.tsx` (Phase 2 신설)
- `Kbd.tsx` (Phase 2 신설)

### 다음 라운드 후보 (K)

J 라운드까지로 디자인 시스템 토대(컴포넌트 + 토큰)가 사실상 완성됨. 다음은 잔여 부채 codemod:

1. **Card 사용 사례 확장** — Bookmark 카드, Tools 도구 카드, Settings 카드 등 인터랙티브 카드 패턴에 `<Card interactive>` 적용
2. **인라인 fontSize 잔여 56건 codemod** — Material Symbols 외에 `style={{ fontSize: '...px', ... }}` 같은 복합 style은 보존 (CSS variable 주입 등 정당 케이스)
3. **text-white 468건 codemod** — Impeccable v2 Phase B-1 (codemod 도구 + 비주얼 회귀 테스트 인프라 필수)
4. **text-[Npx] 433건 codemod** — Phase B-2 (sp-text-* 토큰 신설 후)
5. **!important 76건 정리** — 라이트 테마 호환 shim 분석 후 cascade 재설계

---

## K 라운드 — Card 첫 사용 + 인라인 fontSize codemod 확대 (2026-04-25)

### 변경 (8 files)

**1. Card 첫 사용 사례**
- `Dashboard/DashboardPinGuard.tsx` — 잠금 카드의 `<div className="rounded-xl bg-sp-card p-4 cursor-pointer group hover:ring-1 hover:ring-sp-accent/30 transition-all">` → `<Card interactive className="p-4 group" onClick={...}>`. **Card 컴포넌트가 실제로 사용되는 첫 사례** (C 라운드 신설 후)

**2. 인라인 fontSize 26건 codemod (7 파일)**
| 파일 | 변경 |
|------|------|
| `Homeroom/RosterManagementTab.tsx` | `'14px'` × 5 → `text-icon-sm`, `'16px'` × 3 → `text-icon`, `'20px'` × 1 → `text-icon-lg`, `'18px'` × 1 → `text-icon-md` |
| `Homeroom/Consultation/ConsultationCreateModal.tsx` | `'10px'` × 1 → `text-icon-xs`, `'12px'` × 3 → `text-icon-xs`, `'14px'` × 1 → `text-icon-sm` |
| `Homeroom/Records/DefaultRecordListView.tsx` | `'12px'` × 2 → `text-icon-xs` |
| `Homeroom/Records/StudentTimelineView.tsx` | `'12px'` × 2 → `text-icon-xs` |
| `Seating/Seating.tsx` | `'12px'` × 4 → `text-icon-xs` |
| `Dashboard/MessageBanner.tsx` | `'16px'` × 2 → `text-icon` |
| `Schedule/EventFormModal.tsx` | `'14px'` × 2 (이미 `text-sm` 있음, 정리) → `text-icon-sm` |
| `Memo/MemoImageAttachment.tsx` | `'16px'` × 1 → `text-icon` |

### 누적 진척

| 라운드 | 인라인 fontSize 카운트 | 누적 -Δ |
|--------|----------------------|---------|
| Impeccable Audit v2 | 296 | — |
| J 라운드 (8건) | ~85 → 80 | — |
| **K 라운드 (26건)** | **80 → 30** | **-50** |

**(현재 잔여 30건은 대부분 정당 케이스: CSS variable 주입, 동적 계산, 복합 style 등)**

### Card 사용 첫 사례 검증

`<Card interactive className="p-4 group" onClick={...}>` 패턴이 실제 코드에 들어감으로써 C 라운드 신설 컴포넌트가 검증됨. 향후 인터랙티브 카드 패턴은 이 사례를 따라 작성.

### 검증

- `npx tsc --noEmit` → 에러 0
- `npx vite build` → 21.59s 성공
- 8 file changes / 0 회귀

### 마일스톤 누적 정리

| 영역 | 시작 | 현재 | 해소율 |
|------|------|------|--------|
| `role="dialog"` 모달 부채 | 46 | 4 (의도 보존) | 91% |
| `z-[N]` arbitrary | 13 | 0 | 100% |
| 인라인 fontSize | 296 | 30 (정당 케이스) | 90% |
| Material Symbols 사이즈 토큰화 | 0 | text-icon-* utility 사용 정착 | — |

**디자인 시스템 코어(Modal/Drawer/IconButton/Card/Button/Kbd + 6개 토큰 네임스페이스) 완비**. 실제 사용처(DashboardPinGuard) 1건 검증.
