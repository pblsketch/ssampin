---
template: design
version: 0.1
feature: realtime-wall-design-customization
date: 2026-04-26
author: cto-lead (council: frontend-design / bkit:frontend-architect / bkit:security-architect / bkit:qa-strategist)
project: ssampin
version_target: v1.16.x
plan: docs/01-plan/features/realtime-wall-design-customization.plan.md
parents:
  - docs/02-design/features/realtime-wall-padlet-mode-v2-student-ux.design.md
  - docs/02-design/features/realtime-wall-padlet-mode.design.md
related_design_siblings:
  - docs/01-plan/features/realtime-wall-management.plan.md
---

# 쌤핀 실시간 담벼락 — 디자인 커스터마이징 설계서 (v1)

> **요약**: 보드 단위 `theme` 필드(`colorScheme` + `background.presetId` + 선택 `accent`)를 도메인에 신설하고, `RealtimeWallBoardSettingsDrawer`에 §5 "디자인" 섹션을 추가한다. 학생 SPA의 `theme-dark` 강제(`src/student/main.tsx:7-8`)를 해제하고 `useStudentBoardTheme` 훅으로 wall-state broadcast의 `boardSettings.theme`를 즉시 추종한다. 12 배경 프리셋(solid 4 + gradient 4 + pattern 4)은 `RealtimeWallBoardThemePresets.ts` 카탈로그로 한 곳에 고정하여 학생/교사 빌드가 동일 매핑을 공유한다. 칸반 학생 "+" 버튼은 컬럼 헤더 우측 끝 24×24px → 컬럼 제목 아래 풀-와이드 min-h-44px 버튼(Trello / Linear / Padlet 패턴)으로 재배치한다.
>
> **회귀 위험 7건 보존**(v1.14 5건 + v2.1 신규 2건) — 본 Design은 코드 한 줄도 v2.1 자산을 손상시키지 않는다.
>
> **3대 정책 (Plan §1.1)**: 프리셋만(이미지 업로드 v2 후속) / light·dark 2개만(system 자동 감지 OOS) / 학생 자동 추종(개별 토글 X).
>
> **Project**: ssampin · **Version**: v1.15.x → **v1.16.x** · **Date**: 2026-04-26 · **Status**: Draft (v1)

---

## 0. 핵심 설계 원칙

### 0.1 v1.14 + v2.1 원칙 계승 (절대 수정 금지)

본 Design은 v1·v2.1 §0의 모든 원칙을 그대로 이어받는다.

1. **교사·학생 동일 뷰 원칙** (v1 §0.1) — 본 Plan의 핵심. 학생 SPA는 보드의 `theme.colorScheme`을 강제 추종(개별 토글 X). 교사 화면과 픽셀 단위 일치를 카드 레벨이 아니라 **페이지 톤** 레벨까지 확장한다.
2. **영속성 원칙** (v1 §0.2) — `theme`는 `WallBoard.settings.theme`에 저장되어 보드 단위 영속. 교사 변경 즉시 `boardSettings-changed` broadcast → 학생 화면 0.5초 내 반영 후, 다음 라이브 세션 재열기 시 그대로 복원.
3. **단계 진입 원칙** (v1 §0.3) — Phase 1 → 2 → 3 직렬 강제. Phase 1의 도메인·broadcast 토대 없이 Phase 2 UI는 의미 없음. Phase 3은 독립 가능하나 Phase 1·2 안정화 후 진행 권장.

### 0.2 v1 디자인 커스터마이징 신규 원칙 (5건)

#### 원칙 (v1-1) — 프리셋 카탈로그는 단일 진실 공급원

12 배경 프리셋은 **`src/adapters/components/Tools/RealtimeWall/RealtimeWallBoardThemePresets.ts`** 단일 파일에 정의한다. domain은 `presetId: string`만 보유, CSS 매핑은 adapters 레이어에서만. 학생 빌드도 동일 파일 import (Vite alias `@adapters/`). 어디에서도 presetId → CSS를 inline switch로 흩어 놓지 않는다.

> **근거**: v2.1 `RealtimeWallCardColors.ts` 단일 매핑 패턴이 검증됨. 프리셋이 도메인-CSS 양쪽에 흩어지면 다음 프리셋 추가 시 동기화 누락.

#### 원칙 (v1-2) — 학생 SPA 첫 페인트는 default theme 즉시 주입

`src/student/main.tsx`에서 `theme-dark` 강제 두 줄 제거 → wall-state 도착 전 빈 화면(0.3~1초) 회귀를 막기 위해 `light` + `solid-neutral-paper`를 **mount 직후 즉시 주입**한다. wall-state 도착 시 fade transition(200ms) 없이 즉시 교체 (점프 없음).

> **근거**: dark 강제 제거 시 보드가 light였다면 첫 페인트가 dark → light로 깜빡임 발생. 보드가 dark면 첫 페인트가 light → dark로 깜빡임. **default를 light + paper로 고정**하는 이유는 (a) 학생들이 가장 많이 보게 될 모드, (b) 다크 보드도 light → dark 전환은 light → light 보드의 깜빡임보다 훨씬 적음.

#### 원칙 (v1-3) — 변경은 즉시 broadcast, 별도 "저장" 버튼 없음

라디오/그리드 클릭 즉시 `boardSettings-changed` broadcast. Padlet 패턴 정합 + 디자인 패널의 "저장" 버튼은 학습 비용. 단 broadcast 폭주 방지를 위해 **클릭 단위 100ms 디바운스** (드래그 슬라이더 없음 — 라디오/그리드만이라 빠른 다중 클릭만 합치면 충분).

> **근거**: v2.1 `boardSettings-changed`는 이미 broadcast 채널 구축. 신규 메시지 추가 X. 학생 화면은 patch만 받아 동적 토글.

#### 원칙 (v1-4) — accent 색상 override는 도메인만, UI 노출은 v2

도메인은 `accent?: string` (hex 6자리)을 보유하지만 본 Plan에서는 UI 픽커 노출 X. 프리셋이 명시한 accent만 inline CSS variable override(`--sp-accent`)로 적용. 사용자 임의 입력은 v2 별도 Plan.

> **근거**: 색상 휠 / 컬러 픽커는 디자인 일관성 깨짐 + Zod 검증 부담. v1은 안전한 프리셋만 + accent는 도메인 차원에서 미래 대비.

#### 원칙 (v1-5) — 칸반 "+" 버튼은 학생 모드에서만 노출 (회귀 #3 보호)

`viewerRole === 'student' && Boolean(onAddCardToColumn)` 조건은 v2.1에서 이미 안전하게 검증된 패턴(`RealtimeWallKanbanBoard.tsx:352`). 본 Plan은 위치만 바꾸고 조건 분기는 **유지**한다. 교사 모드에서는 이 버튼이 미렌더 — 회귀 #3(viewerRole='teacher' ? actions : null) 보호 패턴과 동일한 정신.

> **근거**: 교사가 학생용 빠른 추가 버튼을 누르면 권한 동선 혼란. 교사는 헤더 우측 액션 메뉴를 통한 카드 추가가 별도 동선.

### 0.3 핵심 결정 9건 요약

| # | 결정 | 본 Design 결정 | 위치 |
|---|------|---------------|------|
| 1 | theme 저장 위치 | **`WallBoard.settings.theme`** (v2.1 settings 필드 흡수, 신규 채널 X) | §3.1 |
| 2 | 프리셋 매핑 위치 | **`adapters/components/Tools/RealtimeWall/RealtimeWallBoardThemePresets.ts`** 단일 파일 | §3.4, §5 |
| 3 | 학생 SPA 색상 스킴 토글 | **`<html>`에 `theme-light`/`theme-dark` + `dark` 클래스 동적 토글** (기존 `src/index.css` CSS variable 인프라 재사용) | §4 |
| 4 | 보드 배경 적용 방식 | **보드 wrapper(ToolRealtimeWall + StudentBoardView) inline style** (CSS variable + className 혼합 — pattern은 className, gradient는 CSS variable). 카드(sp-card)는 보드와 독립. | §5.3 |
| 5 | broadcast 메시지 | **기존 `boardSettings-changed` 메시지에 `theme` 포함** (신규 메시지 X — backward compat 최대화) | §4.2 |
| 6 | 학생 SPA dark 강제 해제 | **`src/student/main.tsx` 두 줄 제거 + mount 직후 `light` + `solid-neutral-paper` 즉시 주입** | §4.1 |
| 7 | broadcast 디바운스 | **클릭 단위 100ms** (드래그 슬라이더 없음 — 라디오/그리드만) | §4.3 |
| 8 | 12 프리셋 ID 화이트리스트 | **`solid-neutral-paper / solid-cream / solid-slate / solid-charcoal / gradient-sunrise / gradient-ocean / gradient-forest / gradient-lavender / pattern-dot-grid / pattern-diagonal-lines / pattern-notebook / pattern-grid`** | §3.4, §5 |
| 9 | 칸반 "+" 버튼 위치 | **컬럼 제목 아래 풀-와이드 min-h-44px** (학생 모드만, 교사 모드 미렌더 — 회귀 #3 정신 계승) | §5.6 |

---

## 1. 범위 (Plan §2 정합)

### 1.1 Phase 의존성 그래프

```
[Phase 1] 테마 모델 + 동일뷰 강제 (3~4일)
   │  ─ WallBoardTheme 엔티티 신설 + RealtimeWallBoardSettings.theme? 추가
   │  ─ RealtimeWallBoardThemePresets.ts 12개 카탈로그
   │  ─ src/student/main.tsx theme-dark 강제 해제 + default 즉시 주입
   │  ─ useStudentBoardTheme 훅 신설 — wall-state 수신 시 <html> 토글
   │  ─ 보드 wrapper(교사 + 학생)에 theme 배경 inline style/className 적용
   │  ─ broadcast WallBoardSnapshotForStudent.settings.theme 포함
   │  ─ Zod 화이트리스트 + accent hex 정규식 검증
   │
   ▼
[Phase 2] 디자인 패널 + 라이브 프리뷰 (3~5일)
   │  ─ Drawer §5 "디자인" 탭 + RealtimeWallBoardThemePicker.tsx 컴포넌트
   │  ─ 색상 스킴 라디오 (light/dark 카드 2개 + 미니 미리보기)
   │  ─ 12 프리셋 grid (sm:grid-cols-3 max:grid-cols-4)
   │  ─ 클릭 즉시 100ms 디바운스 broadcast → 학생 0.5초 내 반영
   │  ─ "기본값으로 복원" 버튼
   │
   ▼
[Phase 3] 칸반 "+" 버튼 재배치 (1~2일)
   │  ─ RealtimeWallKanbanBoard.tsx:362-372 헤더 24×24px 버튼 제거
   │  ─ 컬럼 헤더 직후 + 카드 리스트 위 풀-와이드 min-h-44px 버튼 신설
   │  ─ 빈 컬럼 / 카드 1+장 모두에서 동일 위치
   │  ─ studentFormLocked 시 disabled + lock 아이콘
```

### 1.2 OOS (Plan §2.4 동기)

이미지 업로드 / system 색상 스킴 자동 감지 / 학생 개별 토글 / 카드 색 변경 / 사용자 정의 그라디언트 / 보드별 폰트 / 학생 SPA에 BoardSettingsDrawer 노출 / WallBoard schema version bump — 모두 v2+ 후속.

---

## 2. 핵심 결정사항 (대안 비교)

### 결정 1 — theme 저장 위치

| 옵션 | 장점 | 단점 | 결정 |
|------|------|------|:----:|
| (a) `WallBoard.settings.theme` | v2.1 settings 인프라(`boardSettings-changed`) 그대로 활용. 신규 broadcast 채널 0. backward compat 자연 | settings 객체에 점점 부착되어 비대 가능 | **✅** |
| (b) `WallBoard.theme` (settings 외부) | 의미 분리 명확 | broadcast 채널 신설 + 마이그레이션 1회 더 | ❌ |
| (c) 별도 `theme.json` 파일 | 보드 본문과 격리 | 두 파일 동기 부담 + 학생 broadcast 별도 | ❌ |

→ **(a) 채택**. v2.1 `RealtimeWallBoardSettings`에 `theme?: WallBoardTheme` optional 추가. version=1 유지(무손실 마이그레이션).

### 결정 2 — 프리셋 매핑 위치

| 옵션 | 장점 | 단점 | 결정 |
|------|------|------|:----:|
| (a) `adapters/.../RealtimeWallBoardThemePresets.ts` 단일 파일 | v2.1 `RealtimeWallCardColors.ts` 검증 패턴. 학생/교사 빌드 공유. 한 곳 수정 = 양쪽 반영 | adapters 레이어에 디자인 토큰 부착 (도메인은 ID만) | **✅** |
| (b) `tailwind.config.ts` extend | tailwind 기본 시스템 활용 | gradient/pattern 표현 한계 + 동적 inline style 필요 시 우회 부담 | ❌ |
| (c) `src/index.css` CSS variable 12개 신설 | 색상 토큰 일관 | 12개 × light/dark = 24개 변수 폭증, JIT 못 씀, 동적 토글 시 변수 12개 각각 set | ❌ |

→ **(a) 채택**. domain은 `presetId` 문자열만, adapters에서 `{ id, label, colorScheme, css: { background, backgroundImage?, backgroundSize?, backgroundColor? } }` 객체 매핑.

### 결정 3 — 학생 SPA 색상 스킴 적용 방식

| 옵션 | 장점 | 단점 | 결정 |
|------|------|------|:----:|
| (a) `<html>`에 `theme-light/dark` + `dark` 클래스 토글 | 기존 `src/index.css` (line 126-169) `.theme-light`/`.theme-dark` CSS variable 인프라 그대로. 코드 변경 최소 | classList 조작이 React 외부 effect | **✅** |
| (b) Zustand 토큰 store + 모든 컴포넌트 reactive | 선언적 | 모든 컴포넌트 re-render. 모바일 성능 부담 | ❌ |
| (c) data-theme attribute + CSS attribute selector | 표준 패턴 | 기존 `.theme-*` 클래스 셀렉터 모두 재작성 부담 | ❌ |

→ **(a) 채택**. `useStudentBoardTheme` 훅이 effect로 `<html>` 클래스만 변경. React tree는 unaware (보드 wrapper inline style만 reactive).

### 결정 4 — 보드 배경 적용 방식

| 옵션 | 장점 | 단점 | 결정 |
|------|------|------|:----:|
| (a) inline style + className 혼합 | gradient는 CSS variable, pattern은 className(반복 background-image). 12개 카탈로그 한 곳 정의 가능 | 두 경로 혼용 | **✅** |
| (b) 모두 inline style | 단일 경로 | pattern background-image가 base64 SVG로 길어짐 → 매 render 마다 string 생성 비용 | ❌ |
| (c) 모두 className | tailwind 기본 활용 | gradient의 동적 색상 변경 불가 (JIT 한계) | ❌ |

→ **(a) 채택**. `RealtimeWallBoardThemePresets.ts`에서 각 preset이 `{ className?: string; style?: React.CSSProperties }` 둘 중 하나를 선언. wrapper는 둘 다 spread.

### 결정 5 — broadcast 메시지

| 옵션 | 장점 | 단점 | 결정 |
|------|------|------|:----:|
| (a) `boardSettings-changed` 메시지 재활용 (settings 페이로드에 theme 포함) | 신규 메시지 X. v2.1 `BroadcastableServerMessage` union 무수정 | 메시지가 다른 종류의 변경(moderation 토글 등)도 같이 송신 — 학생 클라이언트 양쪽 patch | **✅** |
| (b) `theme-changed` 신규 메시지 | 의미 명확 | broadcast union 확장 + parser 분기 추가 | ❌ |
| (c) `wall-state` 전체 재송신 | 무조건 동기화 보장 | 페이로드 폭증, 학생 화면 깜빡임 위험 | ❌ |

→ **(a) 채택**. 학생 측 `applyMessage` 분기는 `set({ board: { ...board, settings: msg.settings } })` 한 줄 — 이미 v2.1에서 구현된 패턴(`useRealtimeWallSyncStore.ts`).

### 결정 6 — 학생 SPA dark 강제 해제 시 첫 페인트

| 옵션 | 장점 | 단점 | 결정 |
|------|------|------|:----:|
| (a) main.tsx에서 default theme(`light` + `solid-neutral-paper`) 즉시 주입 | 첫 페인트 보장. wall-state 수신 시 자연 reconcile | default가 보드 실제 theme과 다르면 1회 깜빡임 | **✅** |
| (b) wall-state 수신 전까지 빈 검은 화면 | 단순 | UX 후퇴 (학생 1초+ 빈 화면) | ❌ |
| (c) localStorage에 마지막 보드 theme 캐시 | 깜빡임 0 (재방문 시) | 첫 방문은 a와 동일. 캐시 invalidation 부담 | ❌ |

→ **(a) 채택**. v2(별도 Plan)에서 (c) 캐시 추가 검토.

### 결정 7 — broadcast 디바운스

| 옵션 | 장점 | 단점 | 결정 |
|------|------|------|:----:|
| (a) 클릭 단위 100ms 디바운스 | 빠른 다중 클릭 합치기. 학생 화면 깜빡임 최소 | 100ms 첫 응답 지연 | **✅** |
| (b) 디바운스 없음 | 즉시 broadcast | 사용자가 빠르게 12개 그리드 클릭하면 최대 12 broadcast | ❌ |
| (c) 디바운스 500ms | broadcast 폭주 100% 방지 | "변경이 적용되었나?" 사용자 의문 | ❌ |

→ **(a) 채택**. 라디오/그리드만 있으므로 100ms로 충분.

### 결정 8 — 12 프리셋 ID 확정

| 카테고리 | ID (4개) | 정합 사유 |
|---------|---------|----------|
| **solid** (단색 4) | `solid-neutral-paper` (기본 — `#fafaf7` light · `#1a1a1a` dark) / `solid-cream` (`#faf6ed` · `#2a2419`) / `solid-slate` (`#f1f5f9` · `#1e293b`) / `solid-charcoal` (`#e2e8f0` · `#0f172a`) | 가장 일반적·중립 톤 4종. 카드 alpha 80%와 모두 가독성 PASS |
| **gradient** (4) | `gradient-sunrise` (amber-100 → rose-100) / `gradient-ocean` (sky-100 → cyan-100) / `gradient-forest` (emerald-50 → teal-100) / `gradient-lavender` (violet-100 → fuchsia-100) | 약한 채도 그라디언트 4종 (강한 색조는 카드 융합 위험 — Plan §6 R-1 mitigation) |
| **pattern** (4) | `pattern-dot-grid` (점 격자) / `pattern-diagonal-lines` (대각선) / `pattern-notebook` (노트 줄무늬) / `pattern-grid` (모눈종이) | CSS background-image radial/linear-gradient 조합. SVG 외부 파일 X (Plan A-5 mitigation) |

각 프리셋은 light/dark 양쪽 변형 보유 — colorScheme 변경 시 같은 presetId 유지하고 dark 변형만 사용.

### 결정 9 — 칸반 "+" 버튼 위치

| 옵션 | 장점 | 단점 | 결정 |
|------|------|------|:----:|
| (a) 컬럼 헤더 직후 + 카드 리스트 위 풀-와이드 | Trello / Linear / Padlet 정합. 빈 컬럼/카드 1+장 일관 위치. 모바일 hit target 확보 | 컬럼당 세로 공간 +50px | **✅** |
| (b) 컬럼 하단 (카드 리스트 아래) | 일부 보드앱 패턴 | 카드 많을 때 스크롤 필요 → "추가" 동선 멀어짐 | ❌ |
| (c) FAB (좌측 하단 floating) | 글로벌 추가 동선 | 어느 컬럼에 추가할지 별도 모달 — 클릭 1회 추가 | ❌ |

→ **(a) 채택**. Trello / Padlet / Linear 모두 동일.

---

## 3. 데이터 모델

### 3.1 WallBoardTheme 엔티티 (신규)

**위치**: `src/domain/entities/RealtimeWallBoardTheme.ts` (신규 파일, 도메인 순수)

```ts
/**
 * 보드 색상 스킴 — light / dark 2개만 (Plan 결정 #3).
 * system 자동 감지는 OOS — 학생 화면 일관성 우선.
 */
export type WallBoardColorScheme = 'light' | 'dark';

/**
 * 보드 배경 타입.
 * - solid: 단색 4종
 * - gradient: 약한 그라디언트 4종 (카드 융합 위험 mitigation)
 * - pattern: CSS background-image 패턴 4종 (SVG 외부 파일 X)
 */
export type WallBoardBackgroundType = 'solid' | 'gradient' | 'pattern';

/**
 * 12 프리셋 ID 화이트리스트 (Plan 결정 #8 / Design §결정 8).
 * Zod enum으로 strict 검증 — 임의 ID는 CSS injection 차단.
 */
export const WALL_BOARD_BACKGROUND_PRESET_IDS = [
  // solid 4
  'solid-neutral-paper',  // 기본
  'solid-cream',
  'solid-slate',
  'solid-charcoal',
  // gradient 4
  'gradient-sunrise',
  'gradient-ocean',
  'gradient-forest',
  'gradient-lavender',
  // pattern 4
  'pattern-dot-grid',
  'pattern-diagonal-lines',
  'pattern-notebook',
  'pattern-grid',
] as const;

export type WallBoardBackgroundPresetId =
  (typeof WALL_BOARD_BACKGROUND_PRESET_IDS)[number];

export interface WallBoardBackground {
  readonly type: WallBoardBackgroundType;
  readonly presetId: WallBoardBackgroundPresetId;
}

/**
 * 보드 단위 디자인 테마. RealtimeWallBoardSettings.theme로 부착.
 *
 * Phase 1: colorScheme + background 신설.
 * Phase 2: UI 변경 시 broadcast.
 * accent는 도메인만 보유 — UI 픽커는 v2 후속 (Plan 결정 #4).
 */
export interface WallBoardTheme {
  readonly colorScheme: WallBoardColorScheme;
  readonly background: WallBoardBackground;
  /**
   * accent CSS variable (`--sp-accent`) inline override — hex 6자리만.
   * - 프리셋이 명시하지 않으면 undefined → 기본 sp-accent 유지
   * - UI 노출은 v2 후속 (사용자 픽커 X)
   * - Zod 정규식: /^#[0-9a-fA-F]{6}$/
   */
  readonly accent?: string;
}

/**
 * Default theme — main.tsx mount 직후 즉시 주입(첫 페인트 회귀 mitigation).
 * normalizeBoardForPadletModeV2가 v1.14~v2.1 보드 로드 시 자동 부착.
 */
export const DEFAULT_WALL_BOARD_THEME: WallBoardTheme = {
  colorScheme: 'light',
  background: {
    type: 'solid',
    presetId: 'solid-neutral-paper',
  },
};
```

### 3.2 RealtimeWallBoardSettings 확장 (수정)

**위치**: `src/domain/entities/RealtimeWallBoardSettings.ts` (기존)

```ts
import type { WallBoardTheme } from './RealtimeWallBoardTheme';

export interface RealtimeWallBoardSettings {
  readonly version: 1;  // 유지 — optional 추가 = 무손실
  readonly moderation: RealtimeWallModerationMode;
  /**
   * v1.16.x 신규 — 보드 디자인 테마.
   * 미존재 시 normalizeBoardForPadletModeV2가 DEFAULT_WALL_BOARD_THEME 주입.
   */
  readonly theme?: WallBoardTheme;
}

// DEFAULT_REALTIME_WALL_BOARD_SETTINGS는 theme를 포함하지 않음 (별도 normalizer가 주입).
```

### 3.3 normalizer 확장 (수정)

**위치**: `src/domain/rules/realtimeWallRules.ts` (`normalizeBoardForPadletModeV2`)

```ts
import { DEFAULT_WALL_BOARD_THEME, WALL_BOARD_BACKGROUND_PRESET_IDS } from '@domain/entities/RealtimeWallBoardTheme';
import type { WallBoardTheme } from '@domain/entities/RealtimeWallBoardTheme';

function normalizeWallBoardTheme(input: unknown): WallBoardTheme {
  if (!input || typeof input !== 'object') return DEFAULT_WALL_BOARD_THEME;
  const obj = input as Record<string, unknown>;
  const colorScheme = obj.colorScheme === 'dark' ? 'dark' : 'light';
  const bg = obj.background as Record<string, unknown> | undefined;
  const presetId = (bg && typeof bg.presetId === 'string' &&
    (WALL_BOARD_BACKGROUND_PRESET_IDS as readonly string[]).includes(bg.presetId))
    ? bg.presetId as WallBoardBackgroundPresetId
    : DEFAULT_WALL_BOARD_THEME.background.presetId;
  const type = bg && typeof bg.type === 'string' &&
    (['solid', 'gradient', 'pattern'] as const).includes(bg.type as WallBoardBackgroundType)
    ? bg.type as WallBoardBackgroundType
    : DEFAULT_WALL_BOARD_THEME.background.type;
  const accent = typeof obj.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(obj.accent)
    ? obj.accent
    : undefined;
  return { colorScheme, background: { type, presetId }, accent };
}

export function normalizeBoardForPadletModeV2(board: WallBoard): WallBoard {
  const settings = board.settings ?? DEFAULT_REALTIME_WALL_BOARD_SETTINGS;
  return {
    ...board,
    settings: {
      ...settings,
      theme: normalizeWallBoardTheme(settings.theme),  // v1.16.x — 항상 부착
    },
    posts: board.posts.map(normalizePostForPadletModeV2),
  };
}
```

**핵심**: Zod 검증 실패 시도 도메인 normalizer가 default로 fallback — 잘못된 페이로드가 학생 화면을 깨지지 않음.

### 3.4 프리셋 카탈로그 (신규)

**위치**: `src/adapters/components/Tools/RealtimeWall/RealtimeWallBoardThemePresets.ts`

```ts
import type { WallBoardBackgroundPresetId, WallBoardColorScheme } from '@domain/entities/RealtimeWallBoardTheme';

interface ThemePresetVariant {
  /** wrapper에 적용할 className (Tailwind 기본 키만 — sp-* 토큰은 inline에서 분리) */
  readonly className?: string;
  /** wrapper에 적용할 inline style (gradient / pattern 동적 색상) */
  readonly style?: React.CSSProperties;
  /** 프리셋이 accent를 명시하면 inline override (--sp-accent CSS variable) */
  readonly accentOverride?: string;
}

interface ThemePresetEntry {
  readonly id: WallBoardBackgroundPresetId;
  readonly label: string;          // 한국어 라벨
  readonly category: '단색' | '그라디언트' | '패턴';
  readonly type: 'solid' | 'gradient' | 'pattern';
  readonly light: ThemePresetVariant;
  readonly dark: ThemePresetVariant;
}

export const REALTIME_WALL_BOARD_THEME_PRESETS: readonly ThemePresetEntry[] = [
  // ============ solid 4 ============
  {
    id: 'solid-neutral-paper',
    label: '기본 종이',
    category: '단색',
    type: 'solid',
    light: { style: { backgroundColor: '#fafaf7' } },
    dark:  { style: { backgroundColor: '#1a1a1a' } },
  },
  {
    id: 'solid-cream',
    label: '크림',
    category: '단색',
    type: 'solid',
    light: { style: { backgroundColor: '#faf6ed' } },
    dark:  { style: { backgroundColor: '#2a2419' } },
  },
  {
    id: 'solid-slate',
    label: '슬레이트',
    category: '단색',
    type: 'solid',
    light: { style: { backgroundColor: '#f1f5f9' } },
    dark:  { style: { backgroundColor: '#1e293b' } },
  },
  {
    id: 'solid-charcoal',
    label: '차콜',
    category: '단색',
    type: 'solid',
    light: { style: { backgroundColor: '#e2e8f0' } },
    dark:  { style: { backgroundColor: '#0f172a' } },
  },

  // ============ gradient 4 (약한 채도 — 카드 가독성 PASS) ============
  {
    id: 'gradient-sunrise',
    label: '해돋이',
    category: '그라디언트',
    type: 'gradient',
    light: { style: { background: 'linear-gradient(135deg, #fef3c7 0%, #fecaca 100%)' } },
    dark:  { style: { background: 'linear-gradient(135deg, #44403c 0%, #44282d 100%)' } },
  },
  {
    id: 'gradient-ocean',
    label: '바다',
    category: '그라디언트',
    type: 'gradient',
    light: { style: { background: 'linear-gradient(135deg, #e0f2fe 0%, #cffafe 100%)' } },
    dark:  { style: { background: 'linear-gradient(135deg, #0c4a6e 0%, #134e4a 100%)' } },
  },
  {
    id: 'gradient-forest',
    label: '숲',
    category: '그라디언트',
    type: 'gradient',
    light: { style: { background: 'linear-gradient(135deg, #ecfdf5 0%, #ccfbf1 100%)' } },
    dark:  { style: { background: 'linear-gradient(135deg, #064e3b 0%, #134e4a 100%)' } },
  },
  {
    id: 'gradient-lavender',
    label: '라벤더',
    category: '그라디언트',
    type: 'gradient',
    light: { style: { background: 'linear-gradient(135deg, #ede9fe 0%, #fae8ff 100%)' } },
    dark:  { style: { background: 'linear-gradient(135deg, #4c1d95 0%, #581c87 100%)' } },
  },

  // ============ pattern 4 (CSS gradient 만 — SVG 외부 파일 X) ============
  {
    id: 'pattern-dot-grid',
    label: '점 격자',
    category: '패턴',
    type: 'pattern',
    light: {
      style: {
        backgroundColor: '#fafaf7',
        backgroundImage: 'radial-gradient(circle, #cbd5e1 1px, transparent 1px)',
        backgroundSize: '20px 20px',
      },
    },
    dark: {
      style: {
        backgroundColor: '#1a1a1a',
        backgroundImage: 'radial-gradient(circle, #475569 1px, transparent 1px)',
        backgroundSize: '20px 20px',
      },
    },
  },
  {
    id: 'pattern-diagonal-lines',
    label: '대각선',
    category: '패턴',
    type: 'pattern',
    light: {
      style: {
        backgroundColor: '#fafaf7',
        backgroundImage: 'repeating-linear-gradient(45deg, transparent 0 12px, rgba(148, 163, 184, 0.18) 12px 13px)',
      },
    },
    dark: {
      style: {
        backgroundColor: '#1a1a1a',
        backgroundImage: 'repeating-linear-gradient(45deg, transparent 0 12px, rgba(148, 163, 184, 0.12) 12px 13px)',
      },
    },
  },
  {
    id: 'pattern-notebook',
    label: '노트',
    category: '패턴',
    type: 'pattern',
    light: {
      style: {
        backgroundColor: '#faf6ed',
        backgroundImage: 'repeating-linear-gradient(transparent 0 31px, rgba(148, 163, 184, 0.32) 31px 32px)',
      },
    },
    dark: {
      style: {
        backgroundColor: '#2a2419',
        backgroundImage: 'repeating-linear-gradient(transparent 0 31px, rgba(148, 163, 184, 0.18) 31px 32px)',
      },
    },
  },
  {
    id: 'pattern-grid',
    label: '모눈',
    category: '패턴',
    type: 'pattern',
    light: {
      style: {
        backgroundColor: '#fafaf7',
        backgroundImage:
          'linear-gradient(rgba(148, 163, 184, 0.18) 1px, transparent 1px), ' +
          'linear-gradient(90deg, rgba(148, 163, 184, 0.18) 1px, transparent 1px)',
        backgroundSize: '24px 24px',
      },
    },
    dark: {
      style: {
        backgroundColor: '#1a1a1a',
        backgroundImage:
          'linear-gradient(rgba(148, 163, 184, 0.10) 1px, transparent 1px), ' +
          'linear-gradient(90deg, rgba(148, 163, 184, 0.10) 1px, transparent 1px)',
        backgroundSize: '24px 24px',
      },
    },
  },
];

/** O(1) 조회용 Map */
export const REALTIME_WALL_BOARD_THEME_PRESET_BY_ID = new Map(
  REALTIME_WALL_BOARD_THEME_PRESETS.map((p) => [p.id, p]),
);

/**
 * 프리셋 ID + colorScheme → variant 조회 헬퍼.
 * 잘못된 ID는 default(solid-neutral-paper) variant 반환 — UI 깨짐 방지.
 */
export function resolveBoardThemeVariant(
  presetId: WallBoardBackgroundPresetId | string,
  colorScheme: WallBoardColorScheme,
): ThemePresetVariant {
  const entry = REALTIME_WALL_BOARD_THEME_PRESET_BY_ID.get(presetId as WallBoardBackgroundPresetId)
    ?? REALTIME_WALL_BOARD_THEME_PRESET_BY_ID.get('solid-neutral-paper')!;
  return entry[colorScheme];
}
```

### 3.5 Zod 스키마 (Phase 1 — 보안)

**위치**: `electron/ipc/realtimeWall.ts` (기존 ClientMessageSchema와 같은 파일)

```ts
import { WALL_BOARD_BACKGROUND_PRESET_IDS } from '@domain/entities/RealtimeWallBoardTheme';

const ColorSchemeSchema = z.enum(['light', 'dark']);
const BackgroundTypeSchema = z.enum(['solid', 'gradient', 'pattern']);
const PresetIdSchema = z.enum([...WALL_BOARD_BACKGROUND_PRESET_IDS] as [
  string, ...string[]
]);

/**
 * accent override — hex 6자리만 (CSS injection 차단).
 * url(...), expression(...), javascript:, var(...) 모두 차단됨.
 */
const AccentHexSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const WallBoardThemeSchema = z.object({
  colorScheme: ColorSchemeSchema,
  background: z.object({
    type: BackgroundTypeSchema,
    presetId: PresetIdSchema,
  }),
  accent: AccentHexSchema.optional(),
});

// RealtimeWallBoardSettings Zod 스키마 (Phase A에서 정의됐으면 확장)
export const RealtimeWallBoardSettingsSchema = z.object({
  version: z.literal(1),
  moderation: z.enum(['off', 'manual']),
  theme: WallBoardThemeSchema.optional(),  // v1.16.x — optional
});
```

**중요 (회귀 위험 신규 #8 — CSS injection 차단)**:
- presetId는 z.enum 화이트리스트만 — 임의 문자열 거부
- accent는 hex 6자리 정규식 — `url()` / `expression()` / `javascript:` / `var(--evil)` 모두 차단
- 학생 → 서버 메시지에는 theme 변경 권한 X (서버는 학생 메시지의 theme 필드 무시)
- 교사 IPC 메시지(renderer → main)도 Zod 검증 — renderer 코드 변조 가정

---

## 4. 아키텍처 다이어그램

### 4.1 학생 SPA 첫 페인트 + theme 동기 흐름

```
[학생 브라우저]                          [학생 SPA — Vite 별도 빌드]
   │
   ① index.html load (cloudflared 터널)
   │
   ▼
   ② src/student/main.tsx mount
   │   ├─ ❌ classList.add('theme-dark')  ← 두 줄 제거 (Plan FR-T6)
   │   ├─ ❌ classList.add('dark')
   │   └─ ✅ applyDefaultBoardTheme()  ← v1.16 신규
   │           ├─ <html>.classList.add('theme-light')
   │           └─ document.body.style.background = '#fafaf7'  (default solid-neutral-paper)
   │
   ▼ (즉시 첫 페인트 — 빈 화면 0)
   ③ <StudentRealtimeWallApp /> render
   │
   ▼
   ④ StudentJoinScreen → 닉네임 입력 → connect()
   │
   ▼ (WebSocket OPEN)
   ⑤ wall-state broadcast 수신
   │   payload.settings.theme = { colorScheme: 'dark', background: { presetId: 'gradient-ocean' } }
   │
   ▼
   ⑥ useStudentBoardTheme(theme) effect 트리거
   │   ├─ <html>.classList.toggle('theme-dark', true)
   │   ├─ <html>.classList.toggle('theme-light', false)
   │   ├─ <html>.classList.toggle('dark', true)            ← Tailwind dark: prefix
   │   └─ <html>.style.setProperty('--sp-accent', accent)  ← accent override 시
   │
   ▼ (200ms transition 없이 즉시 — body가 이미 light였으면 light → dark 1회 깜빡임)
   ⑦ StudentBoardView render — 보드 wrapper에 inline style 적용
       <div style={resolveBoardThemeVariant(presetId, colorScheme).style}>
         <Board />
       </div>


[교사 클릭 시 broadcast 흐름]

[교사 PC]                       [Main Process]              [학생 브라우저들]
   │
   ① Drawer §5 디자인 탭
   │  → "gradient-forest" 그리드 클릭
   │
   ▼
   ② Zustand updateBoardTheme(theme)
   │  ├─ 100ms 디바운스 (Plan §A-2 mitigation)
   │  ├─ 로컬 state 즉시 갱신 (낙관적)
   │  └─ IPC realtime-wall:update-board-settings
   │
   ▼
   ③ Main 프로세스
   │  ├─ Zod RealtimeWallBoardSettingsSchema.safeParse() ← 화이트리스트 검증
   │  ├─ WallBoardRepository.save(boardId, { ...board, settings: { ..., theme } })
   │  └─ broadcastToAllStudents({ type: 'boardSettings-changed', settings })
   │
   ▼ (모든 ws OPEN 학생)
   ④ 학생 SPA — applyMessage('boardSettings-changed')
   │  ├─ set({ board: { ...board, settings: msg.settings } })
   │  └─ useStudentBoardTheme effect 트리거 → ⑥ 단계 동일
   │
   ▼ (< 500ms)
   ⑤ 학생 화면 즉시 반영
```

### 4.2 broadcast 페이로드 backward compat

```
[v1.15.x 학생 클라이언트]  ←  [v1.16.x 서버]
   │                              │
   wall-state {                    │
     settings: {                   │  ← settings.theme 필드 포함
       version: 1,                 │
       moderation: 'off',          │
       theme: { ... }              │  ← 구버전 학생은 무시 (Zod passthrough)
     }                             │
   }                               │
   │
   ▼
   v1.15.x 학생: settings 객체에서 moderation만 사용, theme 무시 → 화면 변화 X
   (단 src/student/main.tsx의 theme-dark 강제 제거는 클라이언트 변경 → 동시 배포 필수)


[v1.16.x 학생 클라이언트]  ←  [v1.15.x 서버]
   │                              │
   wall-state {                    │
     settings: {                   │  ← settings.theme 필드 미존재
       version: 1,                 │
       moderation: 'off'           │
     }                             │
   }                               │
   │
   ▼
   v1.16.x 학생: theme 필드 미존재 → useStudentBoardTheme(undefined) → DEFAULT 적용
   (학생 화면이 기본 light + paper로 표시 — v1.15.x 서버에 다른 보드 디자인 의도 X이므로 안전)
```

---

## 5. UI 시안

### 5.1 12 프리셋 명세 (한 표)

| # | ID | 라벨 | 카테고리 | light 미리보기 | dark 미리보기 | accent override |
|---|------|------|---------|--------------|--------------|----------------|
| 1 | `solid-neutral-paper` | 기본 종이 | 단색 | 따뜻한 회색 페이퍼 #fafaf7 | 거의 검정 #1a1a1a | — |
| 2 | `solid-cream` | 크림 | 단색 | 크림 #faf6ed | 다크 우드 #2a2419 | — |
| 3 | `solid-slate` | 슬레이트 | 단색 | 차분 회청 #f1f5f9 | 차분 블루그레이 #1e293b | — |
| 4 | `solid-charcoal` | 차콜 | 단색 | 진한 회색 #e2e8f0 | 차콜 #0f172a (앱 기본 톤) | — |
| 5 | `gradient-sunrise` | 해돋이 | 그라디언트 | amber-100 → rose-100 (135°) | 다크 amber-900 → rose-900 | — |
| 6 | `gradient-ocean` | 바다 | 그라디언트 | sky-100 → cyan-100 | 다크 sky-900 → teal-900 | — |
| 7 | `gradient-forest` | 숲 | 그라디언트 | emerald-50 → teal-100 | 다크 emerald-900 → teal-900 | — |
| 8 | `gradient-lavender` | 라벤더 | 그라디언트 | violet-100 → fuchsia-100 | 다크 violet-900 → purple-900 | — |
| 9 | `pattern-dot-grid` | 점 격자 | 패턴 | paper + slate-300 점 (20px) | charcoal + slate-600 점 | — |
| 10 | `pattern-diagonal-lines` | 대각선 | 패턴 | paper + 대각선 12px | charcoal + 대각선 12px | — |
| 11 | `pattern-notebook` | 노트 | 패턴 | cream + 줄 32px | dark cream + 줄 | — |
| 12 | `pattern-grid` | 모눈 | 패턴 | paper + 모눈 24px | charcoal + 모눈 | — |

**공통 제약** (frontend-design 검증):
- 모든 프리셋 light 변형은 카드 8색 alpha 80%과 가독성 매트릭스(96조합) PASS 의무
- 그라디언트는 약한 채도만 — 강한 색상은 카드 융합 위험 (Plan §6 R-1 mitigation)
- pattern은 SVG 외부 파일 0 — 모두 CSS gradient (Plan §6 A-5 mitigation)
- 아이콘은 sp-* 토큰 (rounded-sp-* 사용 X — memory feedback)

### 5.2 디자인 Drawer 패널 와이어프레임

```
┌─────────────────────────────────────────────────────┐
│ ⚙️ 보드 설정                                   ✕   │  ← Drawer 헤더 (기존)
├─────────────────────────────────────────────────────┤
│                                                     │
│ §1 기본 설정                                        │
│ §2 컬럼 구성                                        │
│ §3 승인 정책                                        │
│ §4 학생 권한                                        │
│ ─────────────────────────────────────────────────── │
│ 🎨 §5 디자인 (신규)                                  │ ← palette 아이콘
│                                                     │
│ ┌──────────────────────────────────────────────┐   │
│ │ 색상 스킴                                    │   │
│ │ ┌───────────┐  ┌───────────┐                │   │
│ │ │ ☀️         │  │ 🌙         │  ← 라디오 카드 │
│ │ │  밝은 모드 │  │ 어두운 모드 │     (mini-     │
│ │ │ ┌─────┐   │  │ ┌─────┐   │     preview)   │
│ │ │ │░░░░░│   │  │ │▓▓▓▓▓│   │                │   │
│ │ │ │ ▒▒▒ │   │  │ │ ▓▓▓ │   │                │   │
│ │ │ └─────┘   │  │ └─────┘   │                │   │
│ │ └───────────┘  └───────────┘                │   │
│ └──────────────────────────────────────────────┘   │
│                                                     │
│ ┌──────────────────────────────────────────────┐   │
│ │ 배경                                         │   │
│ │ ┌──┐ ┌──┐ ┌──┐ ┌──┐                          │   │
│ │ │①│ │②│ │③│ │④│   ← 단색 4 (3열 sm:, 4열 max:)│
│ │ └──┘ └──┘ └──┘ └──┘                          │   │
│ │ 기본 크림 슬레 차콜                           │   │
│ │                                              │   │
│ │ ┌──┐ ┌──┐ ┌──┐ ┌──┐                          │   │
│ │ │⑤│ │⑥│ │⑦│ │⑧│   ← 그라디언트 4            │   │
│ │ └──┘ └──┘ └──┘ └──┘                          │   │
│ │ 해돋 바다 숲  라벤                            │   │
│ │                                              │   │
│ │ ┌──┐ ┌──┐ ┌──┐ ┌──┐                          │   │
│ │ │⑨│ │⑩│ │⑪│ │⑫│   ← 패턴 4                  │   │
│ │ └──┘ └──┘ └──┘ └──┘                          │   │
│ │ 점  대각 노트 모눈                            │   │
│ └──────────────────────────────────────────────┘   │
│                                                     │
│ ┌──────────────────────────────────────────────┐   │
│ │ 미리보기 (현재 보드 작은 카드)                │   │
│ │ ┌─────────────────────────────────────┐     │   │
│ │ │  [선택한 배경 적용된 영역]           │     │   │
│ │ │  ┌────┐  ┌────┐                     │     │   │
│ │ │  │ 카드│  │ 카드│  ← 노랑/파랑 샘플  │     │   │
│ │ │  └────┘  └────┘                     │     │   │
│ │ └─────────────────────────────────────┘     │   │
│ └──────────────────────────────────────────────┘   │
│                                                     │
│        [기본값으로 복원]  ← 하단 outline 버튼      │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**모바일 (<640px)**: grid 3열 → 2열 자동. 미리보기 영역 축소. 색상 스킴 라디오는 가로 2개 유지.

**스타일 토큰**:
- 라디오 카드 selected: `border-sp-accent ring-2 ring-sp-accent/30 bg-sp-accent/5`
- 프리셋 셀 selected: `ring-2 ring-sp-accent` (테두리 강조). hover: `hover:ring-1 hover:ring-sp-border`
- 모서리: `rounded-xl`(카드) / `rounded-lg`(버튼) — **rounded-sp-* 절대 미사용** (memory feedback)
- 미리보기 영역: `rounded-xl border border-sp-border p-4 min-h-32`
- "기본값으로 복원": `rounded-lg border border-sp-border bg-sp-surface px-3 py-2 text-sm text-sp-muted hover:text-sp-text`

### 5.3 보드 wrapper 적용 패턴

**교사** (`ToolRealtimeWall.tsx`):
```tsx
const board = useRealtimeWallStore((s) => s.board);
const theme = board?.settings?.theme ?? DEFAULT_WALL_BOARD_THEME;
const variant = resolveBoardThemeVariant(theme.background.presetId, theme.colorScheme);

return (
  <div
    className={['min-h-full', variant.className ?? ''].join(' ').trim()}
    style={variant.style}
  >
    {/* 기존 BoardRouter 등 */}
  </div>
);
```

**학생** (`StudentBoardView.tsx`): 동일 패턴 — 같은 헬퍼 import.

**카드는 보드와 독립** — `RealtimeWallCard.tsx`의 `bg-sp-card` + 8색 alpha 80% 매핑은 절대 변경 X (회귀 #7).

### 5.4 RealtimeWallBoardThemePicker 컴포넌트 (신규)

**위치**: `src/adapters/components/Tools/RealtimeWall/RealtimeWallBoardThemePicker.tsx`

```tsx
interface RealtimeWallBoardThemePickerProps {
  readonly value: WallBoardTheme;
  readonly onChange: (next: WallBoardTheme) => void;  // 100ms 디바운스 부모에서 처리
  readonly samplePosts?: readonly RealtimeWallPost[];  // 미리보기용 (없으면 mock 카드 2장)
}

export function RealtimeWallBoardThemePicker({ value, onChange, samplePosts }: ...) {
  const handleSchemeChange = (scheme: WallBoardColorScheme) =>
    onChange({ ...value, colorScheme: scheme });
  const handlePresetChange = (presetId: WallBoardBackgroundPresetId) =>
    onChange({
      ...value,
      background: {
        type: REALTIME_WALL_BOARD_THEME_PRESET_BY_ID.get(presetId)!.type,
        presetId,
      },
    });

  const groupedPresets = useMemo(() => groupBy(REALTIME_WALL_BOARD_THEME_PRESETS, 'category'), []);

  return (
    <div className="space-y-6">
      {/* 색상 스킴 */}
      <fieldset>
        <legend className="text-sm font-bold text-sp-text mb-2">색상 스킴</legend>
        <div className="grid grid-cols-2 gap-3">
          <SchemeRadioCard scheme="light" selected={value.colorScheme === 'light'} onSelect={handleSchemeChange} />
          <SchemeRadioCard scheme="dark"  selected={value.colorScheme === 'dark'}  onSelect={handleSchemeChange} />
        </div>
      </fieldset>

      {/* 배경 */}
      <fieldset>
        <legend className="text-sm font-bold text-sp-text mb-2">배경</legend>
        {(['단색', '그라디언트', '패턴'] as const).map((cat) => (
          <div key={cat} className="mb-3">
            <p className="text-xs text-sp-muted mb-1.5">{cat}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 max:grid-cols-4 gap-2">
              {groupedPresets[cat].map((p) => (
                <PresetCell
                  key={p.id}
                  entry={p}
                  selected={value.background.presetId === p.id}
                  colorScheme={value.colorScheme}
                  onSelect={() => handlePresetChange(p.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </fieldset>

      {/* 미리보기 */}
      <BoardThemePreview theme={value} samplePosts={samplePosts} />
    </div>
  );
}
```

`PresetCell`은 60×40px 프리뷰 + 라벨(2줄). selected 시 `ring-2 ring-sp-accent`, hover 시 `ring-1 ring-sp-border/80`. 모두 `rounded-lg` (Tailwind 기본).

### 5.5 useStudentBoardTheme 훅 (신규 — frontend-architect)

**위치**: `src/student/useStudentBoardTheme.ts`

```ts
import { useEffect } from 'react';
import type { WallBoardTheme } from '@domain/entities/RealtimeWallBoardTheme';
import { DEFAULT_WALL_BOARD_THEME } from '@domain/entities/RealtimeWallBoardTheme';

/**
 * 학생 SPA — boardSettings.theme를 <html> 클래스 + accent CSS variable로 동적 토글.
 *
 * 핵심 책임:
 *   - colorScheme: 'light' | 'dark' → <html>에 'theme-light'/'theme-dark' + 'dark' 클래스 토글
 *   - accent (옵션): <html>.style.setProperty('--sp-accent', accent) 또는 removeProperty
 *   - 효과는 effect 내부 직접 DOM 조작 (React tree는 unaware — 모든 컴포넌트 re-render 회피)
 *   - cleanup: 페이지 unload 시 클래스 정리 (개발 중 HMR 안정성)
 *
 * 보드 wrapper 배경(inline style)은 별도 — StudentBoardView.tsx가 같은 theme를 prop으로 받아 처리.
 */
export function useStudentBoardTheme(theme: WallBoardTheme | undefined) {
  useEffect(() => {
    const t = theme ?? DEFAULT_WALL_BOARD_THEME;
    const html = document.documentElement;
    if (t.colorScheme === 'dark') {
      html.classList.add('theme-dark');
      html.classList.add('dark');
      html.classList.remove('theme-light');
    } else {
      html.classList.add('theme-light');
      html.classList.remove('theme-dark');
      html.classList.remove('dark');
    }
    if (t.accent) {
      html.style.setProperty('--sp-accent', t.accent);
    } else {
      html.style.removeProperty('--sp-accent');
    }
  }, [theme?.colorScheme, theme?.accent]);
}
```

**적용 위치**: `StudentRealtimeWallApp.tsx` 최상위에서 호출. `board?.settings?.theme` 변화 시 자동 trigger.

---

### 5.6 칸반 "+" 버튼 재배치 (Phase 3)

**제거 대상** (`RealtimeWallKanbanBoard.tsx:362-372`):
```tsx
{showColumnAddButton && (
  <button
    className="shrink-0 inline-flex h-6 w-6 ..."  // ❌ 제거
    aria-label={`${column.title} 컬럼에 카드 추가`}
  >
    <span className="material-symbols-outlined text-[16px]">add</span>
  </button>
)}
```

**신설 위치**: 컬럼 헤더 직후 + 카드 리스트 위 (line 374 `<div ref={setNodeRef}>` 앞)

```tsx
{/* 신설: 학생 모드 풀-와이드 카드 추가 버튼 */}
{showColumnAddButton && (
  <button
    type="button"
    onClick={() => onAddCardToColumn?.(column.id)}
    disabled={studentFormLocked}
    aria-label={`${column.title}에 카드 추가`}
    className={[
      'mx-3 mt-3 inline-flex w-[calc(100%-1.5rem)] items-center justify-center gap-1.5',
      'min-h-[44px] rounded-lg border border-dashed border-sp-border/60',
      'bg-sp-card/40 text-sm text-sky-400/80',
      'transition hover:border-sky-400/60 hover:bg-sky-500/5 hover:text-sky-300',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50',
      'disabled:cursor-not-allowed disabled:border-sp-border/30 disabled:bg-sp-card/20 disabled:text-sp-muted',
    ].join(' ')}
  >
    {studentFormLocked ? (
      <>
        <span className="material-symbols-outlined text-[18px]">lock</span>
        <span>잠겨있어요</span>
      </>
    ) : (
      <>
        <span className="material-symbols-outlined text-[18px]">add</span>
        <span>카드 추가</span>
      </>
    )}
  </button>
)}
```

**유지 사항**:
- `viewerRole === 'student' && Boolean(onAddCardToColumn)` 조건 보존 (회귀 #3 정신)
- 빈 컬럼: 본 버튼 + "여기로 드래그해 정리하세요" placeholder 둘 다 표시
- 카드 1+장: 본 버튼만 + carousel 하단 placeholder 미표시

---

## 6. 회귀 위험 매트릭스

### 6.1 Plan §5 7건 + 신규 발견 추가

| # | 위치 | 보존 사항 | 회귀 시 영향 | 자동 검증 |
|---|------|-----------|-------------|----------|
| 1 | `electron/ipc/realtimeWall.ts` `buildWallStateForStudents` | `posts.filter(p => p.status === 'approved')` | 학생에게 pending/hidden 노출 | grep 존재 |
| 2 | `src/student` `parseServerMessage` | wall-state 분기 (서버 신뢰 전제) | broadcast 의도-표시 불일치 | unit no-crash test |
| 3 | `RealtimeWallCard.tsx` line 207-208 | `viewerRole === 'teacher' ? actions : null` + dragHandle 동일 | **학생 화면에 교사 액션 노출 (가장 중대)** | grep 존재 + DOM test |
| 4 | `StudentSubmitForm.tsx` `prevSubmittingRef` useEffect | edge transition | 모달 자동 닫힘 회귀 | edge transition test |
| 5 | `electron/ipc/realtimeWall.ts` `closeSession` | `rateLimitBuckets.clear()` | 세션 재시작 시 rate limit 잔존 | grep 존재 + integration |
| 6 | `src/domain/rules/realtimeWallRules.ts` `isOwnCard` | 양방향 OR 매칭 (sessionToken/PIN hash) | 자기 카드 식별 깨짐 → Phase D 권한 회귀 | grep 존재 |
| 7 | `src/adapters/components/Tools/RealtimeWall/RealtimeWallCardColors.ts` | 8색 카드 alpha 80% 매핑 | 본 Plan 배경 추가 후 카드와 보드 시각 충돌 | unit + 96조합 매트릭스 |
| **8 (신규)** | **`src/student/main.tsx`** | **`theme-dark` 강제 두 줄 제거 + default theme 즉시 주입** | 첫 페인트 빈 화면 + 깜빡임. 보드 light인데 dark 노출 | **grep 부재 + integration** |
| **9 (신규)** | **`src/adapters/components/Tools/RealtimeWall/RealtimeWallKanbanBoard.tsx:362-372`** | **컬럼 헤더 24×24 "+" 버튼 grep 0 hit** | Phase 3 미완 (구버튼 + 신버튼 동시 노출) | **grep 부재** |
| **10 (신규)** | **`<html>.style.setProperty('--sp-accent', ...)`** | **accent inline style은 hex 6자리 검증된 값만** | CSS injection 위험 (학생 화면 변조) | **Zod + grep raw concat 부재** |

### 6.2 추가 신규 위험 (Design 단계 발견)

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **D-1: useStudentBoardTheme effect와 main.tsx default 주입의 race condition** | High | Medium | (1) main.tsx는 mount **이전** module top-level에서 즉시 default 주입. effect는 React mount 후 동작 — 자연 순서. (2) StrictMode 이중 mount 시 effect 두 번 실행 — idempotent 보장 (toggle은 idempotent) |
| **D-2: 보드 wrapper inline style 변경이 매 render 마다 새 객체 생성 → 자식 re-render 증폭** | Medium | High | (1) `resolveBoardThemeVariant`는 매번 새 객체 반환하지만 wrapper 자식은 inline style가 deps 아님. (2) Profiler로 매트릭스 측정. 필요 시 useMemo 부착 |
| **D-3: 학생 SPA가 v1.15.x 서버에 접속 → settings.theme 미존재 → default 적용. 교사가 의도한 dark 보드도 light로 표시** | Medium | Low | (1) 동시 배포 정책 — v1.16.x 클라이언트 출시 시 서버도 v1.16.x. (2) 교사 보드가 v1.15.x 시점에 작성됐다면 theme 미설정이 자연 — light default가 맞음 |
| **D-4: Tailwind `dark:` prefix 클래스가 학생 빌드에 포함되지 않음 → dark 모드에서 일부 컴포넌트 (예: 카드 텍스트) 정상 표시 안 됨** | High | Low | (1) `tailwind.config.ts`의 `content`에 `src/student/**/*` + `src/adapters/**/*` 모두 포함 검증. (2) 학생 빌드 산출물 grep `dark:bg-` / `dark:text-` 존재 확인 |
| **D-5: "기본값으로 복원" 클릭 시 broadcast 폭주 (theme + 다른 설정도 한 번에 reset?)** | Low | Low | (1) 본 Plan에서는 theme만 reset (moderation 등은 그대로). (2) confirm dialog 1회 + 단일 broadcast |

---

## 7. CI 검증 항목

### 7.1 grep 어서션 8건 (회귀 위험 #1 ~ #10 중 자동 가능)

`scripts/regression-grep-check.mjs`에 추가:

```bash
# === 존재 검사 (변경 시 깨짐) ===

# #1: 학생 broadcast approved 필터
rg "posts\.filter\(\s*p\s*=>\s*p\.status\s*===\s*'approved'" electron/ipc/realtimeWall.ts
# 1 hit 이상이어야 PASS

# #3: RealtimeWallCard teacherActions/dragHandle null
rg "viewerRole\s*===\s*'teacher'\s*\?\s*actions\s*:\s*null" src/adapters/components/Tools/RealtimeWall/RealtimeWallCard.tsx
rg "viewerRole\s*===\s*'teacher'\s*\?\s*dragHandle\s*:\s*null" src/adapters/components/Tools/RealtimeWall/RealtimeWallCard.tsx

# #5: closeSession rateLimitBuckets.clear()
rg "rateLimitBuckets\.clear\(\)" electron/ipc/realtimeWall.ts

# === 부재 검사 (회귀 시 hit) ===

# #8 (신규): 학생 SPA theme-dark 강제 코드 제거
rg "classList\.add\(['\"]theme-dark['\"]\)" src/student/main.tsx
# 0 hit이어야 PASS

# #9 (신규): 칸반 헤더 24px "+" 버튼 잔존 검증
rg "h-6 w-6.*items-center justify-center rounded-full[\s\S]*?material-symbols-outlined.*add" src/adapters/components/Tools/RealtimeWall/RealtimeWallKanbanBoard.tsx
# 0 hit이어야 PASS

# #10 (신규): accent inline style 직접 string 결합 부재 (Zod 검증된 값만 사용해야 함)
rg "style\.setProperty\(['\"]--sp-accent['\"],\s*[^,]*\$\{" src/
# 0 hit이어야 PASS — string 직접 보간 차단

# === 디자인 정책 ===

# rounded-sp-* 신규 사용 금지 (memory feedback)
rg "rounded-sp-" src/adapters/components/Tools/RealtimeWall/RealtimeWallBoardThemePicker.tsx
rg "rounded-sp-" src/student/useStudentBoardTheme.ts
# 모두 0 hit이어야 PASS

# 임의 hex 색상 (sp-* 토큰 외) 신규 사용 — 단 프리셋 카탈로그 자체는 예외
rg "#[0-9a-fA-F]{6}" src/adapters/components/Tools/RealtimeWall/RealtimeWallBoardThemePicker.tsx
# 0 hit이어야 PASS (프리셋 catalog의 색상은 RealtimeWallBoardThemePresets.ts에만)
```

### 7.2 unit test 명세

| 파일 | 대상 | 케이스 수 | 핵심 어서션 |
|------|------|---------|-----------|
| `src/domain/__tests__/RealtimeWallBoardTheme.test.ts` | normalize / Zod | 10+ | (1) 빈 객체 → DEFAULT 주입 (2) 잘못된 presetId → fallback (3) accent 5자리 → undefined (4) accent `url(evil)` → undefined (5) accent `var(--evil)` → undefined (6) accent `javascript:alert(1)` → undefined (7) presetId enum 12개 모두 통과 (8) colorScheme 'system' → 'light' fallback (9) version=2 → unsupported (10) accent 정상 hex → 보존 |
| `src/student/__tests__/useStudentBoardTheme.test.tsx` | 훅 effect | 8+ | (1) light → `<html>` `theme-light` 추가 + `dark` 제거 (2) dark → 반대 + `dark` 추가 (3) accent → setProperty (4) accent undefined → removeProperty (5) theme=undefined → DEFAULT 적용 (6) StrictMode 이중 mount idempotent (7) dependency 변경 시 toggle (8) unmount 시 정리 |
| `src/adapters/.../RealtimeWallBoardThemePresets.test.ts` | resolveBoardThemeVariant | 6+ | (1) 12개 ID × light/dark = 24 variant 모두 정의 (2) 잘못된 ID → solid-neutral-paper fallback (3) 모든 variant에 style 또는 className 존재 (4) accentOverride 정의된 프리셋 검증 (5) light/dark 항상 다른 색상 보장 (6) Map O(1) 조회 동작 |
| `electron/ipc/__tests__/realtimeWall.theme.test.ts` | Zod RealtimeWallBoardSettingsSchema | 10+ | (1) theme 미존재 OK (2) 정상 theme PASS (3) presetId 임의 string REJECT (4) accent `url(evil)` REJECT (5) colorScheme 'system' REJECT (6) version=2 REJECT (7) extra fields passthrough (8) accent 7자리 REJECT (9) background.type 임의 string REJECT (10) settings 자체 missing OK |
| `electron/ipc/__tests__/realtimeWall.broadcast.test.ts` | boardSettings-changed | 5+ | (1) theme 변경 시 모든 ws 클라이언트 broadcast 도달 (2) 구버전 클라이언트(theme 무시) 정상 (3) Zod 검증 실패 시 broadcast 0 (4) 학생이 보낸 theme 변경 메시지 차단 (5) 빠른 다중 클릭 100ms 디바운스 동작 |
| `src/adapters/.../RealtimeWallKanbanBoard.test.tsx` | + 버튼 위치 | 6+ | (1) viewerRole=student → 풀-와이드 버튼 렌더 (2) viewerRole=teacher → 미렌더 (회귀 #3 정신) (3) onAddCardToColumn 없으면 미렌더 (4) studentFormLocked → disabled + lock 아이콘 (5) min-h-44px 확인 (6) 빈 컬럼 + 카드 1+장 모두에서 동일 위치 |

신규 45+ 케이스 (도메인 + 어댑터 + IPC).

### 7.3 통합 테스트 (96조합 디자인 QA — qa-strategist 핵심)

**8 카드 색 × 12 배경 × 2 colorScheme = 192 조합. 핵심 96조합 선정 기준**:

선정 알고리즘:
- (a) 모든 12 배경 × light = 96 조합 중 8 카드 색 사이클(1배경=1카드색) → 12 조합 (smoke)
- (b) 그라디언트 4개 × 8 카드 × 2 모드 = 64 조합 (충돌 위험 가장 높음)
- (c) pattern 4개 × 4 카드 (white/yellow/blue/charcoal-반대색) × 2 모드 = 32 조합 (가독성 검증)
- (d) solid-charcoal × 8 카드 × 2 모드 = 16 조합 (앱 기본 톤 호환)

(a) + (b) + (c) + (d) = 12 + 64 + 32 + 16 = **124** → 중복 제거 후 **96조합** 핵심.

**검증 절차** (각 조합):
1. 학생 1 + 교사 1 동일 보드 열기
2. 보드 wrapper inline style 적용 후 카드 1장 (해당 색)
3. **체크포인트 4건**:
   - 카드 본문 텍스트 가독성 (대비 4.5:1 이상)
   - 카드 테두리 보드 배경과 분리 가능 (1px 이상 시각 차이)
   - 카드 좌상단 색상 dot 식별 가능
   - 카드 모서리 alpha 80% 위에서 자연 (블렌딩 깨짐 0)
4. 실패 시: 해당 프리셋의 light/dark variant 색상 조정 또는 카드 alpha 90%로 강화

**자동화**:
- Playwright + Percy 스크린샷 비교 (96조합 baseline 1회 캡처 → diff PR 단위)
- 또는 수동 디자인 QA (frontend-design 에이전트 1회 — 출시 직전)

### 7.4 backward compat 통합 테스트

| 시나리오 | 검증 |
|---------|------|
| v1.15.x 보드 (theme 미설정) → v1.16.x 로드 | normalizer가 DEFAULT 주입, 모든 화면 정상 |
| v1.16.x 보드 (theme 설정) → v1.15.x 로드 시 | settings.theme 무시, moderation만 사용 — 데이터 손실 0 |
| v1.16.x 학생 SPA + v1.15.x 서버 | settings.theme 미수신 → default 적용 |
| v1.15.x 학생 SPA + v1.16.x 서버 | settings.theme 무시 → 기존 동작 (dark 강제) |

`src/__tests__/regression-design-customization.test.ts` (신규).

---

## 8. 단계별 구현 순서 (파일 단위)

### Phase 1 — 테마 모델 + 동일뷰 강제 (3~4일)

| 순서 | 파일 | 변경 | 검증 |
|------|------|------|------|
| 1.1 | `src/domain/entities/RealtimeWallBoardTheme.ts` | 신규 — WallBoardTheme + DEFAULT_WALL_BOARD_THEME + WALL_BOARD_BACKGROUND_PRESET_IDS | tsc + unit test (10+) |
| 1.2 | `src/domain/entities/RealtimeWallBoardSettings.ts` | 수정 — theme?: WallBoardTheme 추가 | tsc |
| 1.3 | `src/domain/rules/realtimeWallRules.ts` | 수정 — normalizeBoardForPadletModeV2에 normalizeWallBoardTheme 추가 | unit test (5+) |
| 1.4 | `src/adapters/components/Tools/RealtimeWall/RealtimeWallBoardThemePresets.ts` | 신규 — 12 프리셋 + resolveBoardThemeVariant | unit test (6+) |
| 1.5 | `electron/ipc/realtimeWall.ts` | 수정 — Zod RealtimeWallBoardSettingsSchema에 WallBoardThemeSchema 추가 | unit test (10+) |
| 1.6 | `src/usecases/realtimeWall/BroadcastWallState.ts` | 수정 — WallBoardSnapshotForStudent.settings.theme 통과 (이미 settings 전달 중 — 자동) | broadcast unit test (5+) |
| 1.7 | `src/student/main.tsx` | **수정 — line 7-8 두 줄 제거 + applyDefaultBoardTheme() 호출** | grep #8 어서션 |
| 1.8 | `src/student/useStudentBoardTheme.ts` | 신규 — colorScheme + accent 동적 토글 훅 | unit test (8+) |
| 1.9 | `src/student/StudentRealtimeWallApp.tsx` | 수정 — useStudentBoardTheme(board?.settings?.theme) 호출 | render test |
| 1.10 | `src/student/StudentBoardView.tsx` | 수정 — 보드 wrapper에 resolveBoardThemeVariant 적용 | render test |
| 1.11 | `src/adapters/components/Tools/ToolRealtimeWall.tsx` | 수정 — 교사 보드 wrapper에 동일 적용 | render test |
| 1.12 | `src/adapters/components/Tools/RealtimeWall/{RealtimeWallFreeformBoard,Grid,Stream,Kanban}.tsx` | 검증 — wrapper가 inline style 영향 받지 않는지 (이미 absolute positioning이므로 영향 없음) | 회귀 매트릭스 |

**Phase 1 완료 기준**: 교사 + 학생 같은 보드 → 12 프리셋 × 2 colorScheme = 24 시나리오 시각 일치 + grep #8 PASS + Zod test PASS.

### Phase 2 — 디자인 패널 + 라이브 프리뷰 (3~5일)

| 순서 | 파일 | 변경 |
|------|------|------|
| 2.1 | `src/adapters/components/Tools/RealtimeWall/RealtimeWallBoardThemePicker.tsx` | 신규 — 메인 컴포넌트 (라디오 + 그리드 + 미리보기) |
| 2.2 | `src/adapters/components/Tools/RealtimeWall/RealtimeWallBoardThemePicker.SchemeRadioCard.tsx` | 내부 — light/dark 라디오 카드 |
| 2.3 | `src/adapters/components/Tools/RealtimeWall/RealtimeWallBoardThemePicker.PresetCell.tsx` | 내부 — 60×40 프리뷰 셀 |
| 2.4 | `src/adapters/components/Tools/RealtimeWall/RealtimeWallBoardThemePicker.Preview.tsx` | 내부 — 미리보기 영역 (현재 보드 미니 + 샘플 카드) |
| 2.5 | `src/adapters/components/Tools/RealtimeWall/RealtimeWallBoardSettingsDrawer.tsx` | 수정 — `BoardSettingsSection` union에 `'design'` 추가 + 본문에 §5 섹션 + designRef 추가 |
| 2.6 | `src/adapters/stores/useRealtimeWallSyncStore.ts` | 수정 — `updateBoardTheme(theme: WallBoardTheme)` 액션 + 100ms 디바운스 |
| 2.7 | `electron/ipc/realtimeWall.ts` | 수정 — boardSettings-changed broadcast 송신 시 theme 포함 |
| 2.8 | `src/adapters/components/Tools/RealtimeWall/RealtimeWallBoardSettingsDrawer.tsx` | 수정 — "기본값으로 복원" 버튼 + confirm dialog |

**Phase 2 완료 기준**: Drawer §5 클릭 → 12 프리셋 × 2 colorScheme = 24 라이브 변경 → 학생 0.5초 내 반영 + 모바일 grid 자동 (3열 → 2열).

### Phase 3 — 칸반 "+" 버튼 (1~2일)

| 순서 | 파일 | 변경 |
|------|------|------|
| 3.1 | `src/adapters/components/Tools/RealtimeWall/RealtimeWallKanbanBoard.tsx` | line 362-372 24×24 버튼 제거 + line 374 직전 풀-와이드 버튼 신설 |
| 3.2 | `src/adapters/components/Tools/RealtimeWall/__tests__/RealtimeWallKanbanBoard.test.tsx` | 6 케이스 신규 |
| 3.3 | `scripts/regression-grep-check.mjs` | grep #9 부재 어서션 추가 |

**Phase 3 완료 기준**: viewerRole=student + studentFormLocked 분기 모두 정상 + grep #9 PASS + 모바일 hit target 44px+.

---

## 9. Definition of Done

### 9.1 전체 (각 Phase 공통)

- [ ] `npx tsc --noEmit` EXIT=0
- [ ] `npx vitest run` 전체 통과 (신규 45+ 케이스 포함)
- [ ] `npm run build` 성공
- [ ] `vite build --config vite.student.config.ts` 성공 (학생 SPA)
- [ ] `npm run electron:build` 성공 (Windows)
- [ ] gap-detector Match Rate 90%+
- [ ] **rounded-sp-* 사용 0건** (memory feedback) — grep 검증
- [ ] **모든 UI 텍스트 한국어** — grep 영어 단어 검토
- [ ] **`any` 타입 0개** — tsc strict
- [ ] 학생 SPA 번들 크기 +8KB gzipped 이내 (`vite build` analyze 비교)

### 9.2 Phase 1 (도메인 + 동일뷰)

- [ ] FR-T1~T10 모두 구현
- [ ] WallBoardTheme 엔티티 + 12 프리셋 카탈로그 + DEFAULT_WALL_BOARD_THEME 완성
- [ ] `src/student/main.tsx` line 7-8 강제 제거 + default 즉시 주입 (grep #8 PASS)
- [ ] `useStudentBoardTheme` 훅 단위 테스트 (8+ 케이스) PASS
- [ ] 보드 wrapper(교사 + 학생) 배경 적용 동작
- [ ] WallBoardSnapshotForStudent.settings.theme broadcast 자동 포함
- [ ] **24 시나리오 동일뷰 검증 PASS** (12 프리셋 × 2 colorScheme, 교사 + 학생 스크린샷 비교)
- [ ] backward compat 통합 테스트 PASS (4 시나리오)
- [ ] 회귀 위험 7건 + 신규 #8 grep 부재 PASS

### 9.3 Phase 2 (디자인 패널)

- [ ] FR-D1~D8 모두 구현
- [ ] Drawer §5 "디자인" 섹션 + palette 아이콘 + 색상 스킴 라디오 + 12 프리셋 grid + 미리보기 동작
- [ ] 클릭 즉시 100ms 디바운스 → `boardSettings-changed` broadcast → 학생 화면 0.5초 내 반영
- [ ] "기본값으로 복원" + confirm dialog 동작
- [ ] 모바일 (<640px) grid 자동 (3열 → 2열) — chrome devtools throttle 검증
- [ ] 교사 권한만 변경 가능 (학생 broadcast read-only)
- [ ] 100ms 디바운스 unit test PASS (broadcast 5번 클릭 → 1회 broadcast)

### 9.4 Phase 3 (칸반 "+" 버튼)

- [ ] FR-K1~K7 모두 구현
- [ ] 컬럼 헤더 24×24 "+" 버튼 grep 0 hit (#9 PASS)
- [ ] 컬럼 제목 아래 풀-와이드 버튼 + min-h-44px 확인 (Chrome devtools box model)
- [ ] viewerRole=teacher 모드 미렌더 (회귀 #3 정신) — DOM test PASS
- [ ] 빈 컬럼 + 카드 1+장 동일 위치
- [ ] studentFormLocked → disabled + lock 아이콘 + "잠겨있어요" 라벨
- [ ] 키보드 Enter/Space로 모달 오픈 (tabIndex 정상)

### 9.5 v1.16.x 통합 안정화

- [ ] **96조합 디자인 QA 매트릭스 PASS** (8색 카드 × 12 배경 핵심 96조합)
- [ ] **Zod 화이트리스트 보안 테스트 PASS** (presetId 임의 / accent url() / accent javascript: 모두 REJECT)
- [ ] **broadcast latency < 500ms 측정 PASS** (10회 측정 평균)
- [ ] **theme 적용 재페인트 < 16ms** (Chrome DevTools Performance)
- [ ] CI grep 어서션 8건 모두 PASS
- [ ] release note v1.16.x 작성 — 학생 화면 dark 강제 해제 명시(BREAKING 아님)
- [ ] Notion 사용자 가이드 업데이트 — 보드 디자인 커스터마이징 안내 + 학생 자동 추종 명시
- [ ] AI 챗봇 KB 업데이트 (12 프리셋 / light·dark 핵심 Q&A)

---

## 10. Open Questions (Design 단계 잔여)

| # | 질문 | 잠정 결정 | 회신 필요도 |
|---|------|----------|------------|
| 1 | 학생 SPA mount 시 default theme 주입 위치 — `src/student/main.tsx` 모듈 top-level vs `useStudentBoardTheme` 훅 첫 effect? | **모듈 top-level** (mount 이전 첫 페인트 보장) | Low |
| 2 | "기본값으로 복원" — theme만 reset vs 전체 settings reset? | **theme만 reset** (moderation 등 별도) | Low |
| 3 | gradient 4개 외 추가 그라디언트 (예: 노을, 라임) 도입 시점? | **v2 사용자 정의 그라디언트와 함께 검토** — v1은 12개 고정 | Medium |
| 4 | 미리보기 영역 — 실제 현재 보드 카드 샘플 vs mock 카드 2장 고정? | **mock 카드 2장 고정** (실제 데이터 의존성 회피) | Medium — UX QA |
| 5 | accent override를 prefix가 다른 sp-accent CSS variable에 적용할지 (예: `--sp-accent-light` / `--sp-accent-dark`)? | **단일 `--sp-accent`** — colorScheme 토글이 자연 전환 | Low |
| 6 | 학생이 cloudflared 터널을 통해 접속한 경우, theme 변경 broadcast가 늦으면 학생 화면 깜빡임? | **100ms 디바운스 + 0.5초 latency 한도 내 자연 전환 (transition 200ms)** | Medium — 실측 |

---

## 11. Future Work (v2+ 후속)

| 항목 | v2+ 후속 | 근거 |
|------|---------|------|
| 이미지 업로드 배경 | v2 `realtime-wall-design-customization-v2-image` | Plan 결정 #2 |
| system 색상 스킴 자동 감지 | v2+ | Plan 결정 #3 |
| 학생 개별 색상 스킴 토글 | 보류 | Plan 결정 #4 |
| 사용자 정의 그라디언트 / 컬러 휠 | v2+ | 색상 휠 + 에디터 |
| accent 색상 픽커 UI | v2 | 본 Plan은 도메인만 |
| 보드별 폰트 변경 | 보류 | 디자인 일관성 |
| WallBoard schema version 1→2 bump | v2 이미지 업로드 시 | 본 Plan 무손실 호환 |
| 학생 PWA 매니페스트 색상 동기화 | 별도 Feature | 모바일 PWA Plan |
| theme 캐시 (localStorage 마지막 보드) | v2 첫 페인트 깜빡임 0 | 본 Plan은 default 즉시 주입으로 충분 |

---

## 12. 한 줄 결론

`WallBoard.settings.theme` 신설(Phase 1) → Drawer §5 디자인 패널 + 12 프리셋 라이브 프리뷰(Phase 2) → 칸반 학생 "+" 버튼 풀-와이드 재배치(Phase 3). **프리셋 카탈로그 단일 파일 + 학생 SPA 동적 토글 훅 + Zod 화이트리스트 + 96조합 디자인 QA**로 v1.14 + v2.1 회귀 위험 7건과 신규 3건(#8/#9/#10)을 모두 자동 검증한다.

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-26 | 초안 — Plan v0.1 대응. 4 에이전트 병렬 council(frontend-design / frontend-architect / security-architect / qa-strategist) 통합. 12 프리셋 ID 화이트리스트 확정 (solid 4 + gradient 4 + pattern 4). useStudentBoardTheme 훅 신설. Zod CSS injection 차단 (presetId enum + accent hex regex). 회귀 위험 7건 + 신규 3건(#8 main.tsx 강제 제거 / #9 칸반 24px 버튼 잔존 / #10 accent string concat) CI grep 어서션. 96조합 디자인 QA 매트릭스 + 단위 테스트 45+. Phase 1 → 2 → 3 직렬 12 + 8 + 3 = 23 파일 변경 매핑. backward compat 4 시나리오. | cto-lead (council: frontend-design / bkit:frontend-architect / bkit:security-architect / bkit:qa-strategist) |
