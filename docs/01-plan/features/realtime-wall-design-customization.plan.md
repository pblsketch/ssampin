---
template: plan
version: 0.1
feature: realtime-wall-design-customization
date: 2026-04-26
author: cto-lead (consult: product-manager / frontend-architect / security-architect / qa-strategist)
project: ssampin
version_target: v1.16.x (디자인 커스터마이징 — v1.15.x padlet mode v2.1 위에 누적)
parents:
  - docs/01-plan/features/realtime-wall.plan.md
  - docs/01-plan/features/realtime-wall-padlet-mode.plan.md
  - docs/01-plan/features/realtime-wall-padlet-mode-v2-student-ux.plan.md
  - docs/02-design/features/realtime-wall-padlet-mode-v2-student-ux.design.md
related_plan_siblings:
  - docs/01-plan/features/realtime-wall-management.plan.md
related_design: docs/02-design/features/realtime-wall-design-customization.design.md (TBD)
---

# 쌤핀 실시간 담벼락 — 디자인 커스터마이징 기획안 (v1)

> **요약**: 실시간 담벼락 보드의 **배경 + 색상 스킴(light/dark)** 을 교사가 직접 설정·수정하고, **학생 화면이 무조건 자동 추종**하도록 한다. 보드 단위 `theme` 필드(엔티티 신설)에 프리셋 ID를 저장하고, 교사 설정 Drawer에 "디자인" 탭(§5)을 신설한다. 동시에 칸반형의 학생 "+" 버튼을 컬럼 헤더 우측 끝(작음) → **컬럼 제목 아래 풀-와이드 버튼**으로 재배치해 패들렛 / Trello / Linear 패턴과 정합시킨다.
>
> v1.15.x padlet mode v2.1 자산(viewerRole 분기, 카드 색상 8색, boardSettings broadcast, 회귀 위험 5건)은 절대 손상시키지 않는다. **이미지 업로드 / system scheme 자동 감지 / 학생 개별 토글 / 카드 색 변경**은 본 v1 OOS이며 v2 후속.
>
> **사용자 사전 결정 (2026-04-26, 4건)**:
> 1. 미커밋 변경 → 이미 푸시 완료. 별도 stash 불필요. 본 Plan은 main에서 직접 누적
> 2. 배경 커스터마이징 = **프리셋만** (단색 + 그라디언트 + 패턴 9~12개). 이미지 업로드는 v2
> 3. 색상 스킴 = **light / dark 2개만**. system 자동 감지는 OOS
> 4. 학생 화면 = 교사 설정을 **무조건 자동 추종**. 학생 개별 토글 없음
>
> **사용자가 명시한 3가지 문제 (2026-04-26)**:
> - 교사용 / 학생용 화면의 테마가 일치하지 않음 → **동일 시각 결과 강제** (Phase 1)
> - 교사가 보드 디자인(배경, light/dark)을 지정·수정할 수 없음 → **설정 Drawer에 "디자인" 탭 신설** (Phase 2)
> - 칸반형에서 학생용 "+" 버튼이 컬럼 헤더 우측 끝에 작게 있음 → **컬럼 제목 아래 풀-와이드** (Phase 3)
>
> **Project**: ssampin (쌤핀)
> **Version**: v1.15.x (padlet mode v2.1 진행 중) → **v1.16.x (디자인 커스터마이징)**
> **Author**: cto-lead
> **Date**: 2026-04-26
> **Status**: Draft (v1)

---

## 1. Overview

### 1.1 Purpose

쌤핀 실시간 담벼락 v1.14.x → v1.15.x를 거치며 **카드 단위** 표현(8색·이미지·PDF·OG 미리보기)은 풍부해졌으나, **보드 단위 시각 정체성**은 다음 3가지 문제로 일관성이 떨어진다.

1. **테마 불일치**: 학생 SPA는 `theme-dark` 강제 적용(`src/student/main.tsx:7-8`), 교사 앱은 light/dark 사용자 선택 — 같은 보드라도 교사·학생 시각이 다르다. "동일 뷰 원칙"(v1.14.x §0.1)이 카드 레벨에서만 지켜지고 페이지 톤에서는 깨진다.
2. **배경 커스터마이징 부재**: `RealtimeWallBoard` / `WallBoard` 엔티티(`src/domain/entities/RealtimeWall.ts`)에 `theme` / `background` / `colorScheme` 필드 자체가 없다. 모든 보드가 `bg-sp-bg` + `theme-dark` 한 가지 룩만 갖는다.
3. **학생 "+" 버튼 위치 부적절**: 칸반 학생 모드에서 컬럼 헤더 우측 끝에 24px 아이콘 버튼(`RealtimeWallKanbanBoard.tsx:362-372`)이 노출되어 모바일 hit target이 작고 패들렛 / Trello / Linear의 "컬럼 하단 풀-와이드 +" 패턴과 어긋난다.

본 Plan은 다음 3 Phase로 위 문제를 해결한다.

- **Phase 1 (테마 모델 + 동일뷰 강제)**: `WallBoard.theme` 필드 신설(`colorScheme` + `background` 프리셋 ID + `accent`). 학생 SPA가 boardSettings broadcast 따라 `theme-light` / `theme-dark` 클래스를 동적 토글. 보드 배경 영역은 보드 컴포넌트 내부에서 inline style로 그라디언트·패턴 적용. 무조건 자동 추종 = 학생 토글 없음.
- **Phase 2 (디자인 패널 + 라이브 프리뷰)**: `RealtimeWallBoardSettingsDrawer`에 §5 "디자인" 탭 신설(기존 §1 기본 / §2 컬럼 / §3 승인 정책 / §4 학생 권한 다음). 색상 스킴 라디오(light/dark) + 배경 프리셋 갤러리(9~12개) + 즉시 라이브 프리뷰. 변경 즉시 boardSettings broadcast → 모든 학생 화면 0.5초 내 반영.
- **Phase 3 ("+" 버튼 재배치)**: 칸반 컬럼 헤더 우측 끝 24px 버튼 제거 → **컬럼 제목 아래 풀-와이드 버튼**(Trello/Linear 패턴). 모바일 hit target 44px 이상 확보. 빈 컬럼/카드 1+장 모두에서 일관 위치.

### 1.2 Background

- **현재 상태 (2026-04-26)**: padlet mode v2.1 Phase B (이미지/PDF/8색)가 main에 푸시된 상태. v1.15.x 진행 중. 학생 SPA `dist-student/` 별도 Vite 빌드(`vite.student.config.ts`), 교사 앱과 `src/index.css` 공유.
- **테마 강제 적용 위치 (학생 SPA)**:
  - `src/student/main.tsx:7-8`:
    ```ts
    document.documentElement.classList.add('theme-dark');
    document.documentElement.classList.add('dark');
    ```
  - `<html>`에 무조건 `theme-dark` 강제. 교사 보드가 light 모드여도 학생은 항상 dark.
- **디자인 토큰 정의 위치**: `src/index.css:106-169`
  - `.theme-light` / `.theme-dark` CSS variable 오버라이드 — 이미 양쪽 다 완비. 색상 스킴 토글은 `<html>` 클래스 토글만으로 동작.
  - 신규 추가 필요: 배경 프리셋용 CSS variable (`--sp-board-bg-1` 등) 또는 보드 wrapper에 inline style.
- **Drawer 진입점**: `RealtimeWallBoardSettingsDrawer.tsx`
  - `BoardSettingsSection = 'basic' | 'columns' | 'approval' | 'student-permissions'` (4종)
  - 본 Plan에서 `'design'` 추가 (5종)
  - 통합 진입점 — 이미 사이드바 ⚙️ 아이콘 → Drawer 열림 패턴 정착
- **boardSettings broadcast 패턴**:
  - `BroadcastableServerMessage`에 `boardSettings-changed` 메시지 이미 존재 (`src/usecases/realtimeWall/BroadcastWallState.ts:78-80`)
  - v2.1 Phase B 단계에서 `RealtimeWallBoardSettings = { version: 1; moderation: 'off'|'manual' }`만 정의됨
  - 본 Plan에서 `theme` 필드 추가 — `version` 그대로 유지(optional 추가 = 무손실 마이그레이션)
- **칸반 "+" 버튼 현 위치**: `RealtimeWallKanbanBoard.tsx:362-372`
  ```tsx
  <header className="flex items-center gap-2 ...">
    <span className="h-2 w-2 ...dot..." />
    <span className="...title...">{column.title}</span>
    <span className="...count...">{posts.length}</span>
    {showColumnAddButton && (
      <button ... className="shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-full ...">
        <span>add</span>
      </button>
    )}
  </header>
  ```
  - 24×24px 버튼 (모바일 WCAG 2.5.5 권장 44px 미달). 패들렛 / Trello / Linear는 컬럼 하단 또는 카드 리스트 직전에 풀-와이드 "+ 카드 추가" 버튼.
- **카드 색상 8색 충돌 고려**: v2.1에서 도입된 `RealtimeWallCardColor` 8색은 카드 배경에 alpha 80% (`bg-amber-100/80 dark:bg-amber-900/30`). 보드 배경이 동일 색조 그라디언트일 때 카드와 보드가 시각적으로 융합될 위험 → 회귀 위험 매트릭스 §6에서 다룸.

### 1.3 Related Documents

- v1 패들렛 모드: [`docs/01-plan/features/realtime-wall-padlet-mode.plan.md`](realtime-wall-padlet-mode.plan.md)
- v2.1 학생 UX 정교화: [`docs/01-plan/features/realtime-wall-padlet-mode-v2-student-ux.plan.md`](realtime-wall-padlet-mode-v2-student-ux.plan.md) — 본 Plan은 이 문서의 톤·구조를 따른다
- 관리 기능 계획: [`docs/01-plan/features/realtime-wall-management.plan.md`](realtime-wall-management.plan.md) — M2 스냅샷 포맷 호환성 보장
- 도메인 엔티티: [`src/domain/entities/RealtimeWall.ts`](../../../src/domain/entities/RealtimeWall.ts), [`src/domain/entities/RealtimeWallBoardSettings.ts`](../../../src/domain/entities/RealtimeWallBoardSettings.ts)
- broadcast 메시지: [`src/usecases/realtimeWall/BroadcastWallState.ts`](../../../src/usecases/realtimeWall/BroadcastWallState.ts)
- Drawer: [`src/adapters/components/Tools/RealtimeWall/RealtimeWallBoardSettingsDrawer.tsx`](../../../src/adapters/components/Tools/RealtimeWall/RealtimeWallBoardSettingsDrawer.tsx)
- 칸반 보드: [`src/adapters/components/Tools/RealtimeWall/RealtimeWallKanbanBoard.tsx`](../../../src/adapters/components/Tools/RealtimeWall/RealtimeWallKanbanBoard.tsx)
- 학생 entry: [`src/student/main.tsx`](../../../src/student/main.tsx), [`src/student/StudentRealtimeWallApp.tsx`](../../../src/student/StudentRealtimeWallApp.tsx)
- 디자인 토큰: [`src/index.css`](../../../src/index.css), [`tailwind.config.js`](../../../tailwind.config.js)
- 레퍼런스: Padlet (배경 갤러리·색상 스킴 토글), Trello / Linear (컬럼 하단 풀-와이드 + 카드 추가 버튼)

---

## 2. Scope

본 Plan은 3 Phase로 구성한다. **Phase 1 → Phase 2 → Phase 3 순차 진행** 권장 (Phase 1의 도메인·broadcast 기반이 Phase 2 UI의 전제).

### 2.1 In Scope — **Phase 1: 테마 모델 + 동일뷰 강제 (3~4일)**

> 목적: 보드 단위 `theme` 필드 도입 + 학생 SPA의 `theme-dark` 강제 해제 + boardSettings broadcast 자동 추종.

| ID | 항목 | 목표 | 우선순위 |
|----|------|------|:--------:|
| P1-1 | `WallBoardTheme` 엔티티 신설 | `RealtimeWallBoardTheme.ts` 파일에 `colorScheme: 'light'\|'dark'` + `background: { type: 'solid'\|'gradient'\|'pattern', presetId: string }` + `accent?: string` (선택, sp-accent override) | High |
| P1-2 | `RealtimeWallBoardSettings.theme` 필드 추가 | 기존 `{ version: 1, moderation }` → `{ version: 1, moderation, theme? }` 확장. version은 1 유지 (optional 추가 = 무손실 마이그레이션) | High |
| P1-3 | 마이그레이션 정규화 | `normalizeBoardForPadletModeV2` (또는 동등 위치) — 기존 보드 `theme` 부재 시 `{ colorScheme: 'light', background: { type: 'solid', presetId: 'neutral-paper' } }` 자동 주입 | High |
| P1-4 | 배경 프리셋 카탈로그 | `RealtimeWallBoardThemePresets.ts` — 9~12개 프리셋: solid 4 (white/cream/sky/charcoal) + gradient 4 (sunset/ocean/forest/lavender) + pattern 4 (dots/grid/lines/cork). presetId → CSS class/inline style 매핑 | High |
| P1-5 | 학생 SPA `theme-dark` 강제 해제 | `src/student/main.tsx:7-8` 두 줄 제거. 대체: `StudentRealtimeWallApp` 마운트 후 `wall-state` broadcast 수신 시 `document.documentElement.classList`에 `theme-{light\|dark}` 동적 토글 | High |
| P1-6 | 보드 wrapper 배경 적용 | `ToolRealtimeWall` (교사) + `StudentBoardView` (학생) 양쪽에서 `boardSettings.theme.background` → `<div style={{...}}>` inline style 또는 className 매핑. 카드 배경(sp-card)은 보드 배경과 별개 유지 | High |
| P1-7 | broadcast 페이로드 확장 검증 | `WallBoardSnapshotForStudent.settings`에 `theme` 포함되어 학생 wall-state 수신 시 즉시 적용 | High |
| P1-8 | 동일뷰 회귀 테스트 | 교사 화면 + 학생 화면 같은 보드 열고 스크린샷 비교 (수동) — 배경/색상 스킴/카드 색 모두 일치 | High |

### 2.2 In Scope — **Phase 2: 디자인 패널 + 라이브 프리뷰 (3~5일)**

> 목적: Drawer §5 "디자인" 탭 신설 + 색상 스킴 라디오 + 배경 갤러리 + 즉시 broadcast.

| ID | 항목 | 목표 | 우선순위 |
|----|------|------|:--------:|
| P2-1 | Drawer §5 "디자인" 탭 신설 | `BoardSettingsSection`에 `'design'` 추가. SectionHeader 아이콘: `palette` | High |
| P2-2 | 색상 스킴 라디오 | light / dark 2개 라디오 카드 (Padlet 패턴). 각 카드는 미니 미리보기(보드 배경 thumbnail + sample 카드 1개) 포함 | High |
| P2-3 | 배경 프리셋 갤러리 | 9~12개 프리셋 grid (3열, 4행) — 각 셀에 미리보기 + 한국어 라벨. 클릭 시 즉시 적용 | High |
| P2-4 | 라이브 프리뷰 broadcast | 사용자가 라디오/프리셋 클릭 즉시 `boardSettings-changed` broadcast → 학생 화면 0.5초 내 반영. 별도 "저장" 버튼 없음 (즉시 반영 정책) | High |
| P2-5 | "기본값으로 복원" 버튼 | 디자인 탭 하단에 "이 보드를 기본 디자인으로" 버튼. confirm 후 `theme` 필드 → default로 reset | Medium |
| P2-6 | 진입점 버튼 노출 | 보드 사이드바 또는 헤더에 ⚙️ → "디자인" 빠른 진입점 추가 (선택 — Drawer §5 직접 스크롤). 기존 사이드바 ⚙️ 아이콘 우클릭/롱프레스로 컨텍스트 메뉴는 v2 | Low |
| P2-7 | 디자인 변경 권한 | 교사만. 학생 측 broadcast 수신 핸들러는 read-only 적용 | High |
| P2-8 | accent 색상 override (옵션) | 프리셋이 accent를 명시하면 `--sp-accent` CSS variable inline override. 미명시 시 기본 sp-accent 유지. UI 노출은 v2 (본 Plan에서는 도메인만) | Medium |

### 2.3 In Scope — **Phase 3: 칸반 "+" 버튼 재배치 (1~2일)**

> 목적: 컬럼 헤더 우측 끝 24px 버튼 → 컬럼 제목 아래 풀-와이드 버튼 (Trello/Linear 패턴).

| ID | 항목 | 목표 | 우선순위 |
|----|------|------|:--------:|
| P3-1 | 헤더 "+" 버튼 제거 | `RealtimeWallKanbanBoard.tsx:362-372` `showColumnAddButton` 분기 제거 | High |
| P3-2 | 컬럼 제목 아래 풀-와이드 버튼 신설 | 컬럼 헤더 직후 (카드 리스트 위) 영역에 `<button className="w-full ... min-h-[44px] ...">+ 카드 추가</button>` 배치. dashed border + sky text + hover 시 sky border. 학생 모드에서만 노출 (교사 모드는 카드 추가 동선이 다름) | High |
| P3-3 | 빈 컬럼 vs 카드 1+장 일관성 | 빈 컬럼: "+ 카드 추가" 버튼 + "여기로 드래그해 정리하세요" placeholder 둘 다 표시. 카드 1+장: "+ 카드 추가" 버튼만 (placeholder 미표시) | High |
| P3-4 | 모바일 hit target 검증 | `min-h-[44px]` 명시 + tap 영역 44×44px 이상 (WCAG 2.5.5) | High |
| P3-5 | 잠금 상태 시각 단서 | `studentFormLocked=true` 시 버튼 disabled + "잠겨있어요" 라벨 + lock 아이콘 (FAB 잠금과 일관) | Medium |
| P3-6 | 키보드 접근성 | `tabIndex` 정상 + Enter/Space로 모달 오픈 | Medium |

### 2.4 Out of Scope (본 Plan)

| 항목 | OOS 사유 | 후속 |
|------|---------|------|
| **이미지 업로드 배경** | 사용자 결정 #2 — 프리셋만. 이미지는 base64 페이로드 폭증 + 저작권 검토 필요 | v2 (별도 Plan: `realtime-wall-design-customization-v2-image`) |
| **system 색상 스킴 자동 감지** | 사용자 결정 #3 — light/dark 2개만. matchMedia 자동 감지는 학생 화면 일관성 깨짐 | v2 후속 검토 |
| **학생 개별 색상 스킴 토글** | 사용자 결정 #4 — 학생은 무조건 자동 추종. 학생 토글 시 교사 의도와 어긋남 | 보류 (정책 변경 필요) |
| **카드 색상 변경** | 카드 색상은 v2.1에서 이미 8색 픽커 도입 완료. 본 Plan은 보드 단위만 다룸 | 완료된 별도 Feature |
| **사용자 정의 그라디언트 / 색상 휠** | 프리셋 9~12개 정책 (사용자 결정 #2) | v2 검토 |
| **보드별 폰트 변경** | 디자인 시스템 일관성 (Pretendard/Noto Sans KR 고정) | 보류 |
| **다크 모드 시간대 자동 전환** | 사용자 결정 #3 — 자동 감지 OOS | v2 검토 |
| **학생 SPA에 BoardSettingsDrawer 노출** | 학생 토글 OOS (사용자 결정 #4). 학생은 결과만 봄 | 보류 |
| **모바일 PWA 매니페스트 색상 스킴 동기화** | 학생 PWA는 별도 Feature | 별도 |
| **WallBoard 스냅샷 schema version bump** | 본 Plan은 optional 필드 추가만 (version=1 유지). bump는 v2 이미지 업로드 시 검토 | v2+ |

### 2.5 Future Work — v1.15.x 자산 보존

본 Plan은 v1.15.x padlet mode v2.1 (`realtime-wall-padlet-mode-v2-student-ux.plan.md` §5)의 회귀 위험 5건을 그대로 계승한다. 본 Plan 작업 중 다음 5건은 절대 손상시키지 않는다.

1. `buildWallStateForStudents`의 `status==='approved'` 필터
2. `parseServerMessage` wall-state 분기 (서버 신뢰 전제)
3. `RealtimeWallCard.tsx` line 207-208 (line shift 가능 — `teacherActions = viewerRole === 'teacher' ? actions : null` 패턴 grep 검증)
4. `StudentSubmitForm` isSubmitting useEffect (prevSubmittingRef edge transition)
5. `rateLimitBuckets.clear()` (closeSession 시)

추가로 v1.15.x v2.1 신규 회귀 위험:

6. v2.1 `isOwnCard(post, { currentSessionToken, currentPinHash })` 매칭 로직 (Phase D 자기 카드 식별)
7. v2.1 카드 색상 8색 alpha 80% 매핑 (`RealtimeWallCardColors.ts`) — 본 Plan §6 회귀 매트릭스에서 다크 모드 alpha 충돌 검증 필수

---

## 3. Requirements

### 3.1 Functional Requirements

#### Phase 1 — 테마 모델 + 동일뷰

| ID | Requirement | Priority | Phase | Status |
|----|-------------|----------|-------|--------|
| **FR-T1** | `WallBoardTheme` 엔티티 신설: `colorScheme: 'light' \| 'dark'` + `background: WallBoardBackground` + `accent?: string` | High | 1 | Pending |
| **FR-T2** | `WallBoardBackground` 엔티티: `{ type: 'solid' \| 'gradient' \| 'pattern', presetId: string }` | High | 1 | Pending |
| **FR-T3** | `RealtimeWallBoardSettings`에 `theme?: WallBoardTheme` optional 필드 추가. `version: 1` 유지 | High | 1 | Pending |
| **FR-T4** | `normalizeBoardForPadletModeV2` (또는 동등) — 기존 보드 로드 시 `theme` 부재면 `{ colorScheme: 'light', background: { type: 'solid', presetId: 'neutral-paper' } }` 주입 | High | 1 | Pending |
| **FR-T5** | 배경 프리셋 카탈로그 `REALTIME_WALL_THEME_PRESETS`: solid 4 + gradient 4 + pattern 4 (총 12개). 각 프리셋 = `{ id, label, type, css }` | High | 1 | Pending |
| **FR-T6** | 학생 SPA `src/student/main.tsx:7-8` `theme-dark` 강제 코드 제거 | High | 1 | Pending |
| **FR-T7** | 학생 SPA가 `wall-state` broadcast 수신 시 `boardSettings.theme.colorScheme` 따라 `<html>`에 `theme-light`/`theme-dark` + (`dark` Tailwind 클래스) 동적 토글 | High | 1 | Pending |
| **FR-T8** | 보드 wrapper(교사 + 학생) 배경: `theme.background.presetId` → `REALTIME_WALL_THEME_PRESETS[id].css` (className 또는 inline style) 적용 | High | 1 | Pending |
| **FR-T9** | `WallBoardSnapshotForStudent.settings.theme` 포함 broadcast | High | 1 | Pending |
| **FR-T10** | 카드 배경(`bg-sp-card` + 8색 alpha 80%)은 보드 배경과 독립. 보드 배경 변경 시 카드는 그대로 | High | 1 | Pending |

#### Phase 2 — 디자인 패널

| ID | Requirement | Priority | Phase | Status |
|----|-------------|----------|-------|--------|
| **FR-D1** | `BoardSettingsSection`에 `'design'` 추가. Drawer §5 "디자인" 섹션 신설 (palette 아이콘) | High | 2 | Pending |
| **FR-D2** | 색상 스킴 영역: light / dark 2개 라디오 카드. 각 카드 = 미니 미리보기 + 한국어 라벨 ("밝은 모드" / "어두운 모드") | High | 2 | Pending |
| **FR-D3** | 배경 프리셋 갤러리: 12개 grid (3열). 각 셀 = preset 미리보기(60×40px) + 라벨 + selected 시 sp-accent 테두리 | High | 2 | Pending |
| **FR-D4** | 클릭 즉시 `boardSettings-changed` broadcast (저장 버튼 없음) | High | 2 | Pending |
| **FR-D5** | "기본값으로 복원" 버튼 — confirm dialog 후 default theme으로 reset | Medium | 2 | Pending |
| **FR-D6** | 학생 화면 0.5초 내 반영 (broadcast latency 측정) | High | 2 | Pending |
| **FR-D7** | 디자인 변경은 교사 권한 only. 학생 측 broadcast 수신은 read-only 적용 | High | 2 | Pending |
| **FR-D8** | 모달 오픈 시 현재 theme 표시 + selected 상태 동기화 | High | 2 | Pending |

#### Phase 3 — 칸반 "+" 버튼

| ID | Requirement | Priority | Phase | Status |
|----|-------------|----------|-------|--------|
| **FR-K1** | `RealtimeWallKanbanBoard.tsx`의 컬럼 헤더 우측 끝 24px "+" 버튼 제거 | High | 3 | Pending |
| **FR-K2** | 컬럼 제목 아래 (카드 리스트 위) 풀-와이드 "+ 카드 추가" 버튼 신설. 학생 모드(viewerRole='student' + onAddCardToColumn 존재)에서만 노출 | High | 3 | Pending |
| **FR-K3** | 버튼 시각: dashed border + sky text + hover 시 sky border + bg-sky-500/5. min-h-[44px] | High | 3 | Pending |
| **FR-K4** | 빈 컬럼: "+ 카드 추가" 버튼 + "여기로 드래그해 정리하세요" placeholder 둘 다 표시. 카드 1+장: 버튼만 | High | 3 | Pending |
| **FR-K5** | `studentFormLocked=true` 시 버튼 disabled + lock 아이콘 + "잠겨있어요" 라벨 | Medium | 3 | Pending |
| **FR-K6** | 키보드 Enter/Space로 모달 오픈 + tabIndex 정상 | Medium | 3 | Pending |
| **FR-K7** | 교사 모드(viewerRole='teacher')에서는 본 버튼 미렌더 (회귀 위험 #3 보호) | Critical | 3 | Pending |

#### 회귀 금지 (전 Phase 공통)

| ID | Requirement | Priority | Phase | Status |
|----|-------------|----------|-------|--------|
| **FR-NR1** | `buildWallStateForStudents`의 `status==='approved'` 필터 보존 | Critical | All | Must |
| **FR-NR2** | `RealtimeWallCard.tsx` `teacherActions/teacherDragHandle null` 처리 보존 (line shift 시 grep 패턴 검증) | Critical | All | Must |
| **FR-NR3** | `StudentSubmitForm` isSubmitting useEffect 보존 | Critical | All | Must |
| **FR-NR4** | `rateLimitBuckets.clear()` (closeSession 시) 보존 | Critical | All | Must |
| **FR-NR5** | v2.1 `isOwnCard(post, ...)` 매칭 로직 보존 | Critical | All | Must |
| **FR-NR6** | `WallBoard` schema version 미변경 (optional 추가만) | Critical | 1 | Must |
| **FR-NR7** | 카드 색상 8색 alpha 80% 매핑 미변경. 보드 배경 변경 후 카드 가독성 회귀 0 | High | 1, 2 | Must |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| Performance | 학생 SPA 번들 크기 추가 < 8KB gzipped (theme 카탈로그 + 토글 핸들러) | `vite build` analyze 출력 |
| Performance | boardSettings-changed broadcast latency < 500ms (교사 클릭 → 학생 화면 반영) | 통합 테스트 + 수동 측정 |
| Performance | theme 적용 시 재페인트 < 16ms (한 프레임 내) | Chrome DevTools Performance |
| Reliability | 기존 v1.14.x / v1.15.x 보드는 theme 부재 시 자동 정규화로 무손실 로드 | 단위 테스트 + 마이그레이션 테스트 |
| Reliability | 잘못된 presetId broadcast 수신 시 학생은 default presetId fallback (오류 화면 X) | 단위 테스트 |
| Reliability | `theme.colorScheme` 변경 시 학생 화면 검은 깜빡임 없이 부드러운 전환 (transition 200ms) | 수동 QA |
| Security | broadcast 페이로드의 `presetId`는 화이트리스트 검증 (서버 측 enum 매칭). 임의 CSS injection 차단 | 코드 리뷰 + Zod 스키마 |
| Security | `accent` 색상 override는 hex 문자열만 허용 (`/^#[0-9a-fA-F]{6}$/`). url(), expression() 등 차단 | Zod 스키마 |
| Compatibility | v1.15.x 카드 색상 8색이 모든 12개 배경 프리셋에서 가독성 유지 (alpha 충돌 0) | 디자인 QA 매트릭스 (8×12=96조합 스크린샷) |
| Compatibility | 학생 + 교사 양쪽 빌드 토큰 동기화: `src/index.css` 변경 시 양쪽 모두 적용 검증 | 수동 빌드 테스트 |
| Compatibility | broadcast 페이로드 backward compat: 구버전 학생 클라이언트가 신규 `theme` 필드 수신 시 무시하고 정상 동작 | 통합 테스트 |
| UX | 색상 스킴 변경 시 모든 sp-* 토큰 일관 적용 (배경/카드/텍스트/border/accent) | 디자인 QA |
| UX | 디자인 패널 모바일 뷰포트(<640px)에서도 갤러리 grid 가독 (3열 → 2열 자동) | 수동 테스트 |
| UX | "동일뷰" 검증: 교사 + 학생 같은 보드 스크린샷 픽셀 단위 일치 (배경/카드/텍스트 색) | 수동 비교 |
| Architecture | Clean Architecture 4-layer 준수: theme 엔티티는 `domain/`, 프리셋 카탈로그는 `domain/` 또는 `adapters/`(CSS 매핑은 adapters) | ESLint + 수동 검토 |
| Architecture | `student/` → `electron/`·`infrastructure/` import 0 | 빌드 산출물 grep |

---

## 4. Success Criteria

### 4.1 Definition of Done

#### Phase 1 완료 기준 (3~4일)
- [ ] FR-T1~T10 모두 구현
- [ ] `WallBoardTheme` 엔티티 + 12개 프리셋 카탈로그 완성
- [ ] 학생 SPA `theme-dark` 강제 해제 + boardSettings 동적 토글 동작
- [ ] 교사 + 학생 같은 보드 열고 스크린샷 비교 — 배경/스킴/카드 색 모두 일치 (수동 QA)
- [ ] 기존 v1.14.x / v1.15.x 보드 로드 시 자동 마이그레이션 (default theme 주입) 무손실
- [ ] broadcast 페이로드 backward compat (구버전 학생 무시 동작) 통합 테스트 PASS
- [ ] 회귀 위험 7건 보존

#### Phase 2 완료 기준 (3~5일)
- [ ] FR-D1~D8 모두 구현
- [ ] Drawer §5 "디자인" 탭 + 색상 스킴 라디오 + 12개 프리셋 갤러리 동작
- [ ] 라이브 프리뷰: 클릭 즉시 broadcast → 학생 화면 0.5초 내 반영
- [ ] "기본값으로 복원" 버튼 동작
- [ ] 교사 권한만 변경 가능 (학생 read-only) 통합 테스트 PASS
- [ ] 모바일 뷰포트(<640px)에서 갤러리 grid 가독 (3열 → 2열)
- [ ] 회귀 위험 7건 보존

#### Phase 3 완료 기준 (1~2일)
- [ ] FR-K1~K7 모두 구현
- [ ] 컬럼 헤더 우측 끝 24px "+" 버튼 제거 (grep 0 hit)
- [ ] 컬럼 제목 아래 풀-와이드 버튼 신설 + min-h-[44px] 검증
- [ ] 학생 모드만 노출 + 교사 모드 미렌더 (회귀 #3 보호)
- [ ] 빈 컬럼 / 카드 1+장 일관 위치
- [ ] 잠금 상태 시각 단서 + 키보드 접근성
- [ ] 회귀 위험 7건 보존

#### 전체 완료 기준
- [ ] `npx tsc --noEmit` EXIT=0
- [ ] `npx vitest run` 전체 통과 (theme 단위 테스트 + 마이그레이션 테스트 신규)
- [ ] `npm run build` + `npm run electron:build` 성공
- [ ] gap-detector Match Rate 90%+
- [ ] 학생 SPA 번들 < 500KB gzipped 유지 (v1.15.x 한도)
- [ ] **8색 카드 × 12 배경 프리셋 = 96조합** 가독성 디자인 QA 매트릭스 PASS
- [ ] 사용자 가이드(Notion) 업데이트 — 보드 디자인 커스터마이징 안내 + 학생 화면 자동 추종 명시
- [ ] 챗봇 KB 업데이트 (배경 프리셋 / light·dark 핵심 Q&A)
- [ ] 릴리즈 노트 — 학생 화면 dark 강제 해제(BREAKING은 아님 — 교사 보드의 colorScheme 따름) 명시

### 4.2 Quality Criteria

- [ ] 테스트 커버리지 80%+ (theme 정규화 + 매핑 + broadcast)
- [ ] TypeScript 에러 0개
- [ ] Zod 스키마로 broadcast 페이로드 양방향 검증 (presetId 화이트리스트, accent hex 검증)
- [ ] 회귀 위험 7건 자동 grep 검증 (CI 어서션)
- [ ] **rounded-sp-* 사용 금지** 정책 준수 (Tailwind 기본 키만)
- [ ] 모든 UI 텍스트 한국어
- [ ] `any` 타입 0개

---

## 5. 회귀 금지 — 절대 보존 7건 (v1.14 + v2.1 자산 보호)

본 Plan은 v1.14.x ~ v1.15.x 자산을 손상시키지 않아야 한다. 다음 7건은 코드 한 줄도 건드리면 안 된다.

| # | 위치 | 보존 사항 | 회귀 시 영향 |
|---|------|-----------|-------------|
| 1 | `electron/ipc/realtimeWall.ts` `buildWallStateForStudents` | `posts.filter(p => p.status === 'approved')` 필터 (v2.1: `'hidden-by-author'` placeholder 포함은 변경 없음) | 학생에게 pending/hidden 카드 노출 |
| 2 | `src/student` `parseServerMessage` (또는 동등) | wall-state 분기 (서버 신뢰 전제) | 서버 broadcast 의도와 클라이언트 표시 불일치 |
| 3 | `RealtimeWallCard.tsx` `teacherActions = viewerRole === 'teacher' ? actions : null` + `teacherDragHandle = viewerRole === 'teacher' ? dragHandle : null` | 학생 모드에서 교사 액션 칩 미렌더 | **학생 화면에 교사 액션 노출 (가장 중대 회귀)** |
| 4 | `src/student/StudentSubmitForm.tsx` isSubmitting useEffect | `prevSubmittingRef` edge transition | 모달 자동 닫힘 회귀 |
| 5 | `electron/ipc/realtimeWall.ts` `closeSession` | `rateLimitBuckets.clear()` | 세션 재시작 시 rate limit 잔존 |
| 6 | `src/domain/rules/realtimeWallRules.ts` `isOwnCard` | `currentSessionToken === post.ownerSessionToken \|\| currentPinHash === post.studentPinHash` 양방향 매칭 | 학생 자기 카드 식별 깨짐 → Phase D 권한 회귀 |
| 7 | `src/adapters/components/Tools/RealtimeWall/RealtimeWallCardColors.ts` | 8색 카드 alpha 80% 매핑 | 본 Plan 배경 프리셋 추가 후 카드와 보드 시각 충돌 |

**검증 방법**:
- Phase 진입 직전 7건 위치 git blame 기록
- Phase 종료 시 동일 위치 git diff 확인 (의도된 변경 외 0)
- CI에 회귀 위험 7건 grep 어서션 추가:
  - `posts.filter(p => p.status === 'approved')`
  - `viewerRole === 'teacher' ? actions : null`
  - `viewerRole === 'teacher' ? dragHandle : null`
  - `isOwnCard(`
  - `REALTIME_WALL_CARD_COLOR_CLASSES`

---

## 6. Risks and Mitigation

### 6.1 회귀 위험 매트릭스 (7건)

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **R-1: 8색 카드 × dark mode alpha 충돌** | High | High | (1) 디자인 QA 매트릭스 8×12=96조합 스크린샷 검증 의무. (2) 카드는 alpha 80%로 보드 배경과 융합되는 색조(예: gradient sky vs blue 카드)에서 가독성 점검. (3) 필요 시 카드에 ring-1 ring-sp-border 자동 부착 fallback |
| **R-2: 학생 빌드 + 교사 빌드 토큰 동기화** | High | Medium | (1) `src/index.css` 단일 source — 양쪽 빌드 모두 import 보장. (2) 변경 후 `npm run build` + `vite -c vite.student.config.ts build` 양쪽 실행 검증. (3) CI에 dist + dist-student 양쪽 sp-* CSS variable 추출 비교 |
| **R-3: broadcast 페이로드 backward compat** | High | Medium | (1) `theme` 필드 optional. 구버전 학생 클라이언트는 미인지 → default 적용. (2) Zod 스키마 `passthrough()` 유지. (3) version=1 미변경 (bump 시 마이그레이션 부담 大) |
| **R-4: 학생 SPA `theme-dark` 강제 제거 시 디자인 깨짐** | High | Medium | (1) `main.tsx` 두 줄 제거 직후 default theme(`light` + `neutral-paper`)이 즉시 주입되도록 보장. (2) wall-state 수신 전 빈 화면 시점에도 default 적용. (3) PHASE 1 완료 기준에 동일뷰 스크린샷 검증 명시 |
| **R-5: presetId 임의 값 → CSS injection** | High | Low | (1) 서버 측 Zod enum 화이트리스트 검증. (2) `accent` 색상은 hex 6자리 정규식만 허용. (3) inline style 사용 시 string interpolation 0 (객체 prop만) |
| **R-6: 카드 색 변경(v2.1) + 보드 배경 동시 broadcast 충돌** | Medium | Low | (1) `post-updated` (카드 색)과 `boardSettings-changed`(테마)는 별도 메시지 — 순서 무관. (2) 학생 클라이언트는 둘 다 idempotent 적용 |
| **R-7: 교사가 dark 보드 만들었는데 학생이 light 강제 환경(예: 다른 PWA dark 강제 무력화)** | Low | Low | (1) `<html>` 클래스 토글 + Tailwind `dark:` 클래스 의존 — system 설정 무관. (2) 학생 토글 OOS이므로 학생이 임의 변경 불가 |

### 6.2 추가 Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **A-1: 12개 프리셋 미적 완성도 부족** | Medium | Medium | (1) frontend-design 에이전트 협업 의무 (memory feedback). (2) 패들렛 무료 배경 갤러리 톤 참고. (3) Phase 2 진입 전 시안 시각 검토 |
| **A-2: 라이브 프리뷰 broadcast 폭주 (드래그 시 매 클릭마다 broadcast)** | Medium | Medium | (1) 클릭 단위 1회 broadcast (드래그 슬라이더 없음 — 라디오/그리드 클릭만). (2) 디바운스 100ms 적용 |
| **A-3: 모바일 디자인 패널 사용성** | Medium | Medium | (1) 갤러리 3열 → 2열 자동 (sm: breakpoint). (2) 색상 스킴 라디오는 항상 가로 2개 |
| **A-4: 보드 배경 그라디언트 vs 카드 색 가독성 매트릭스 비현실적** | Medium | Medium | (1) 12개 프리셋 중 그라디언트 4개로 제한 (단색 4 + 패턴 4). (2) 그라디언트는 sky→white, lavender→white 등 약한 조합만 |
| **A-5: 패턴 배경(dots/grid/lines/cork) SVG 부피** | Low | Low | (1) CSS background-image gradient + radial-gradient만 사용 (SVG 외부 파일 X). (2) 번들 < 8KB gzipped 한도 |
| **A-6: 학생 PWA 캐시로 구버전 SPA 잔존 → theme 미적용** | Medium | Medium | (1) Service Worker 미사용(현재). 단순 cache busting (Vite hash) 충분. (2) 릴리즈 노트에 학생 새로고침 안내 |
| **A-7: frontend-design 단독 진행 위험 (memory feedback)** | High | High | (1) **디자인 작업 시 frontend-design 에이전트 협업 의무**. 1순위 frontend-design, 2순위 bkit:frontend-architect. (2) 프리셋 시안 + 디자인 패널 UI는 단독 진행 금지 — Plan 승인 후 Design 단계에서 협업 호출 |

---

## 7. Architecture Considerations

### 7.1 Project Level Selection

| Level | Characteristics | Selected |
|-------|-----------------|:--------:|
| Starter | 단순 구조 | ☐ |
| Dynamic | Feature-based modules | ☐ |
| **Enterprise** | Strict layer separation, DI | **☑** (v1.14.x 그대로) |

### 7.2 Key Architectural Decisions

| # | Decision | 확정안 | Rationale |
|---|----------|--------|-----------|
| 1 | **theme 저장 위치** | **확정: `WallBoard.settings.theme` (RealtimeWallBoardSettings에 흡수)** | v2.1에서 이미 `settings` 필드 + `boardSettings-changed` broadcast 인프라 완비. 별도 채널 신설 불필요 |
| 2 | **배경 프리셋 매핑 위치** | **확정: `adapters/` 레이어 (CSS class/inline style)** | domain은 `presetId: string`만 보유 (외부 CSS 의존 0). adapters에서 ID → CSS 매핑 (v2.1 `RealtimeWallCardColors.ts` 패턴 동일) |
| 3 | **학생 SPA 색상 스킴 적용 방식** | **확정: `<html>`에 `theme-light`/`theme-dark` + `dark` 클래스 동적 토글** | 기존 `src/index.css` `.theme-light` / `.theme-dark` CSS variable 인프라 그대로 재사용. main.tsx 강제 코드만 제거 |
| 4 | **보드 배경 적용 방식** | **확정: 보드 wrapper (ToolRealtimeWall + StudentBoardView) inline style 또는 className** | 보드 영역에만 적용 (앱 전체 배경은 sp-bg 유지). 카드 영역은 sp-card 유지로 가독성 보장 |
| 5 | **broadcast 채널** | **확정: 기존 `boardSettings-changed` 메시지에 `theme` 포함** | 신규 메시지 타입 추가 X — backward compat 최대화 |
| 6 | **이미지 업로드 OOS** | **확정: 본 Plan은 프리셋만. 이미지는 v2** | 사용자 결정 #2. 페이로드 폭증 + 저작권 검토 부담 |
| 7 | **system 색상 스킴 자동 감지 OOS** | **확정: light/dark 2개만, system 자동 감지 X** | 사용자 결정 #3. 학생 화면 일관성 우선 |
| 8 | **학생 개별 토글 OOS** | **확정: 학생은 무조건 자동 추종** | 사용자 결정 #4. 교사 의도 = 학생 시각 |
| 9 | **칸반 "+" 버튼 위치** | **확정: 컬럼 제목 아래 풀-와이드** | Trello/Linear 패턴 + 모바일 hit target 44px+ + 패들렛 정합 |

### 7.3 Clean Architecture Approach

```
Selected Level: Enterprise

신규 / 수정 파일 배치:

src/
├── domain/
│   ├── entities/
│   │   ├── RealtimeWallBoardTheme.ts             [v1 신규]
│   │   │   - WallBoardTheme: { colorScheme, background, accent? }
│   │   │   - WallBoardBackground: { type, presetId }
│   │   │   - WallBoardColorScheme = 'light' | 'dark'
│   │   │   - WallBoardBackgroundType = 'solid' | 'gradient' | 'pattern'
│   │   ├── RealtimeWallBoardSettings.ts          [수정: theme?: WallBoardTheme 추가, version 1 유지]
│   │   └── RealtimeWall.ts                       [무수정 — settings 통해 간접 노출]
│   └── rules/
│       └── realtimeWallRules.ts                  [수정:
│                                                    - normalizeBoardForPadletModeV2 — theme 부재 시 default 주입
│                                                    - validateBoardTheme — presetId 화이트리스트 + accent hex]
│
├── usecases/
│   └── realtimeWall/
│       ├── BroadcastWallState.ts                 [수정:
│       │                                            - boardSettings-changed 페이로드에 theme 포함
│       │                                            - WallBoardSnapshotForStudent.settings.theme 노출]
│       └── ApplyBoardTheme.ts                    [v1 신규 — 교사 theme 변경 적용 + broadcast]
│
├── adapters/
│   ├── components/Tools/RealtimeWall/
│   │   ├── RealtimeWallBoardThemePresets.ts      [v1 신규 — 12개 프리셋 카탈로그 (id → CSS 매핑)]
│   │   ├── RealtimeWallBoardSettingsDrawer.tsx   [수정:
│   │   │                                            - BoardSettingsSection에 'design' 추가
│   │   │                                            - §5 "디자인" 섹션 추가 (palette 아이콘)
│   │   │                                            - 색상 스킴 라디오 + 프리셋 갤러리 + "기본값으로 복원"]
│   │   ├── RealtimeWallBoardThemePicker.tsx      [v1 신규 — 디자인 탭 본문 컴포넌트
│   │   │                                            - light/dark 라디오 카드 2개
│   │   │                                            - 12개 프리셋 grid 갤러리]
│   │   ├── RealtimeWallKanbanBoard.tsx           [수정:
│   │   │                                            - 컬럼 헤더 우측 끝 "+" 버튼 제거
│   │   │                                            - 컬럼 제목 아래 풀-와이드 버튼 추가
│   │   │                                            - 회귀 #3 grep 검증]
│   │   ├── RealtimeWallFreeformBoard.tsx         [수정 (Phase 1 한정):
│   │   │                                            - 보드 wrapper에 theme 배경 적용]
│   │   ├── RealtimeWallGridBoard.tsx             [수정 (Phase 1): 보드 wrapper 배경]
│   │   └── RealtimeWallStreamBoard.tsx           [수정 (Phase 1): 보드 wrapper 배경]
│   ├── components/Tools/
│   │   └── ToolRealtimeWall.tsx                  [수정 (Phase 1): 보드 컨테이너 wrapper에 theme 배경]
│   └── stores/
│       └── useRealtimeWallSyncStore.ts           [수정: applyTheme 액션 추가 + broadcast]
│
└── student/                                      [Phase 1 핵심 변경]
    ├── main.tsx                                  [수정:
    │                                                - line 7-8 (`theme-dark` / `dark` 강제) 제거
    │                                                - wall-state 수신 전 default theme 1회 적용]
    ├── StudentRealtimeWallApp.tsx                [수정:
    │                                                - wall-state broadcast 수신 시 theme 동기화 effect
    │                                                - applyBoardTheme(theme) 헬퍼]
    ├── StudentBoardView.tsx                      [수정: 보드 wrapper에 theme 배경 적용]
    └── useStudentBoardTheme.ts                   [v1 신규 — boardSettings.theme → <html> 클래스 토글 + 배경 매핑 훅]

electron/ipc/
└── realtimeWall.ts                               [수정:
                                                    - boardSettings-changed 페이로드에 theme Zod 검증 추가
                                                    - presetId 화이트리스트 + accent hex 정규식]
```

**의존성 규칙 검증**:
- `domain/` ← 외부 의존성 0 (presetId는 string, CSS 매핑은 adapters)
- `usecases/` → `domain/`만
- `adapters/` → `domain/` + `usecases/`
- `student/` → `adapters/components/Tools/RealtimeWall/RealtimeWallBoardThemePresets.ts` import 가능 (학생도 같은 매핑 사용)

---

## 8. Convention Prerequisites

### 8.1 Existing Project Conventions (계승)

- [x] `CLAUDE.md` 코딩 컨벤션 (TypeScript strict, any 금지, 한국어 UI)
- [x] Path Alias (`@domain/*`, `@usecases/*`, `@adapters/*`, `@student/*`)
- [x] Tailwind 디자인 토큰 sp-* 사용
- [x] **rounded-sp-* 사용 금지** (memory `feedback_rounding_policy.md`) — Tailwind 기본 키만
- [x] viewerRole prop 컨벤션 (v1.14)
- [x] WebSocket 메시지 12종 (v2.1 기준)
- [x] `frontend-design` 에이전트 협업 의무 (memory `feedback_frontend_agent_collaboration.md`)

### 8.2 Conventions to Define/Verify

| Category | Current State | To Define | Priority |
|----------|---------------|-----------|:--------:|
| **WallBoardTheme 엔티티** | 없음 | `domain/entities/RealtimeWallBoardTheme.ts` 신설. interface 표준 | High |
| **배경 프리셋 ID 화이트리스트** | 없음 | `solid-neutral-paper` / `solid-cream` / `solid-sky` / `solid-charcoal` / `gradient-sunset` / `gradient-ocean` / `gradient-forest` / `gradient-lavender` / `pattern-dots` / `pattern-grid` / `pattern-lines` / `pattern-cork` (12개) | High |
| **boardSettings-changed 페이로드 확장** | v2.1: `{ version, moderation }` | v1.16.x: `{ version, moderation, theme? }`. version=1 유지 | High |
| **학생 SPA 동적 theme 토글** | 없음 (hardcoded `theme-dark`) | `useStudentBoardTheme` 훅 신설 — boardSettings.theme.colorScheme 변경 시 `<html>` 클래스 토글 | High |
| **CSS variable 추가 (선택)** | sp-* 토큰 완비 | 필요 시 `--sp-board-bg` 추가 (또는 inline style — 결정은 Design 단계) | Medium |
| **칸반 "+" 버튼 위치 컨벤션** | 컬럼 헤더 우측 끝 24px | 컬럼 제목 아래 풀-와이드 min-h-[44px] dashed border | High |
| **accent override 정규식** | 없음 | `/^#[0-9a-fA-F]{6}$/` (hex 6자리만) | High |
| **Zod 스키마 — 페이로드 검증** | v2.1 boardSettings 스키마 존재 | theme 필드 추가 + presetId enum + accent regex | High |

### 8.3 Environment Variables

별도 환경 변수 추가 없음.

### 8.4 Pipeline Integration

- Phase 1 (Schema) → 본 Plan §3
- Phase 2 (Convention) → §8.2
- Phase 3~9 → Phase 1/2/3 단위로 직진

---

## 9. CI 검증 항목 (grep + unit test)

본 Plan은 다음 자동 검증 가능 항목을 CI에 추가한다.

### 9.1 grep 어서션 (회귀 위험 7건)

```bash
# 회귀 #1
rg "posts\.filter\(.*status === 'approved'" src/usecases/realtimeWall/BroadcastWallState.ts
# 회귀 #3 (line shift 가능, 패턴 매칭)
rg "viewerRole === 'teacher' \? actions : null" src/adapters/components/Tools/RealtimeWall/RealtimeWallCard.tsx
rg "viewerRole === 'teacher' \? dragHandle : null" src/adapters/components/Tools/RealtimeWall/RealtimeWallCard.tsx
# 회귀 #5
rg "rateLimitBuckets\.clear\(\)" electron/ipc/realtimeWall.ts
# 회귀 #6
rg "isOwnCard\(" src/adapters/components/Tools/RealtimeWall/
# 회귀 #7
rg "REALTIME_WALL_CARD_COLOR_CLASSES" src/adapters/components/Tools/RealtimeWall/RealtimeWallCardColors.ts

# Phase 1: theme-dark 강제 제거 검증
rg "classList\.add\('theme-dark'\)" src/student/main.tsx
# 위 명령이 0 hit이어야 PASS (강제 코드 제거됨)

# Phase 3: 컬럼 헤더 우측 끝 24px 버튼 제거 검증
rg "h-6 w-6.*items-center justify-center rounded-full.*add" src/adapters/components/Tools/RealtimeWall/RealtimeWallKanbanBoard.tsx
# 위 명령이 0 hit이어야 PASS

# rounded-sp-* 신규 사용 금지 (memory 정책)
rg "rounded-sp-" src/adapters/components/Tools/RealtimeWall/RealtimeWallBoardThemePicker.tsx
# 위 명령이 0 hit이어야 PASS (신규 파일)
```

### 9.2 unit test (theme 도메인 + 매핑)

| 테스트 | 대상 | 케이스 |
|--------|------|--------|
| `normalizeBoardForPadletModeV2` | 마이그레이션 | (a) v1.14.x 보드(theme 부재) → default 주입 (b) 잘못된 presetId → fallback (c) version=2 → unsupported 거부 |
| `validateBoardTheme` | Zod 스키마 | (a) 정상 페이로드 PASS (b) 임의 presetId REJECT (c) accent="#fff" REJECT (3자리) (d) accent="javascript:alert" REJECT |
| `applyTheme` (학생 훅) | `useStudentBoardTheme` | (a) light → `<html>` `theme-light` 추가 + `dark` 제거 (b) dark → 반대 (c) preset 변경 → background CSS 매핑 |
| `boardSettings-changed broadcast` | broadcast 페이로드 | (a) 구버전 클라이언트가 theme 무시하고 정상 동작 (b) 신버전 즉시 반영 |
| `Kanban 컬럼 + 버튼` | `RealtimeWallKanbanBoard` | (a) 학생 모드 + onAddCardToColumn 존재 → 풀-와이드 버튼 렌더 (b) 교사 모드 → 미렌더 (c) studentFormLocked → disabled |
| `RealtimeWallCard` | 회귀 #3 | viewerRole='student'에서 actions/dragHandle null 유지 |

### 9.3 통합 테스트 (수동 + 자동)

| 테스트 | 방법 |
|--------|------|
| 동일뷰 검증 | 교사 + 학생 같은 보드 열고 스크린샷 비교 (수동) — 12개 프리셋 × light/dark = 24조합 |
| broadcast latency | 교사 클릭 → 학생 화면 반영 시간 측정 (수동, < 500ms) |
| 8색 카드 × 12 배경 가독성 | 96조합 스크린샷 매트릭스 (디자인 QA) |
| backward compat | 구버전 학생 SPA(theme 미인지)가 신규 broadcast 수신 시 정상 동작 |

---

## 10. Red Flags (방향 어긋남 감지)

본 Plan 진행 중 다음 중 하나라도 발생하면 **즉시 중단하고 사용자 재컨설팅**.

- ❌ **이미지 업로드 배경** 구현 (사용자 결정 #2 위배 — v2 후속)
- ❌ **system 색상 스킴 자동 감지 (matchMedia)** 도입 (사용자 결정 #3 위배)
- ❌ **학생 개별 색상 스킴 토글** UI 노출 (사용자 결정 #4 위배)
- ❌ **카드 색 변경 UI 추가** (본 Plan은 보드 단위만 — v2.1 카드 8색은 이미 완료)
- ❌ **사용자 정의 그라디언트 휠 / 컬러피커** (프리셋 9~12개 정책 위배)
- ❌ **회귀 위험 7건 위반** — 특히 `viewerRole === 'teacher' ? actions : null` line shift 시 grep 0 hit이면 즉시 중단
- ❌ **WallBoard schema version bump** (optional 추가만 허용)
- ❌ **boardSettings-changed 신규 메시지 분기** (기존 메시지에 theme 포함)
- ❌ **학생 SPA 별도 CSS variable 정의** (`src/index.css` 단일 source 원칙 위배)
- ❌ **rounded-sp-* 사용** (memory feedback 위배 — Tailwind 기본 키만)
- ❌ **frontend-design 에이전트 단독 진행 없이 디자인 작업** (memory feedback 위배)
- ❌ **presetId 임의 입력 허용** (Zod 화이트리스트 누락 시 CSS injection 위험)
- ❌ **accent 색상 hex 외 형식 허용** (rgb()/url()/expression() 등)
- ❌ **칸반 "+" 버튼 교사 모드에도 노출** (회귀 #3 보호 — 학생 전용)
- ❌ **칸반 "+" 버튼 컬럼 헤더 우측 끝 24px 잔존** (Phase 3 미완)
- ❌ **모바일 hit target < 44px** (WCAG 2.5.5 위배)
- ❌ **학생 SPA 번들 500KB gzipped 초과** (NFR)
- ❌ **theme broadcast 폭주 (드래그 슬라이더 등)** — 라디오/그리드 클릭만, 디바운스 100ms
- ❌ **카드와 보드 배경 시각 충돌 (96조합 디자인 QA 미통과)**

---

## 11. Future Work / Open Questions (v2+ 후속)

본 Plan v1 범위 밖. 별도 Plan으로 신설.

| 항목 | v2+ 후속 Phase | 근거 |
|------|---------------|------|
| **이미지 업로드 배경** | v2 `realtime-wall-design-customization-v2-image` | 사용자 결정 #2 — v2 미룸. 페이로드/저작권 검토 |
| **system 색상 스킴 자동 감지** | v2+ | 사용자 결정 #3 — 학생 화면 일관성 검토 후 |
| **학생 개별 색상 스킴 토글** | 보류 | 정책 변경 필요 |
| **사용자 정의 그라디언트** | v2+ | 색상 휠 + 그라디언트 에디터 신설 |
| **보드별 폰트 변경** | 보류 | 디자인 시스템 일관성 |
| **시간대 자동 dark 전환** | v2+ | 자동 감지 OOS 해소 후 |
| **학생 PWA 매니페스트 색상 동기화** | 별도 Feature | 모바일 PWA Plan에 통합 |
| **accent 색상 픽커 UI** | v2 | 본 Plan은 도메인만 — 프리셋이 명시한 accent만 적용 |
| **보드별 폰트 크기/배율** | v2+ | 접근성 요구 시 별도 |
| **WallBoard schema version 2 bump** | v2 이미지 업로드 시 | 본 Plan은 version 1 유지 |
| **부적절 콘텐츠 필터링** | 별도 Plan `realtime-wall-content-moderation` | v2.1 §11.3 보류 그대로 |

---

## 12. 한 줄 결론

쌤핀 실시간 담벼락 v1.15.x 위에서, 보드 단위 `theme` 필드 신설(Phase 1) → 교사 디자인 패널 Drawer §5 신설(Phase 2) → 칸반 학생 "+" 버튼을 컬럼 제목 아래 풀-와이드로 재배치(Phase 3)한다. **프리셋만 / light·dark 2개만 / 학생 자동 추종** 3대 정책으로 단순성을 유지하고, v1.14 + v2.1 회귀 위험 7건을 절대 손상시키지 않는다.

---

## 13. Next Steps (Design 단계 진입 조건)

1. [x] **본 Plan 사용자 리뷰/승인** — 사용자 사전 결정 4건 + 명시 문제 3건 모두 반영
2. [ ] **`/pdca design realtime-wall-design-customization`** 진입 — Design 단계
   - **에이전트 조합**: `cto-lead` (orchestrator) + `frontend-design` (UI 디자인 + 12개 프리셋 시안 — memory feedback 의무) + `bkit:frontend-architect` (학생 SPA 동적 theme 토글 아키텍처) + `bkit:security-architect` (Zod 화이트리스트 + accent hex 검증) + `bkit:qa-strategist` (96조합 디자인 QA 매트릭스 + backward compat 통합 테스트 설계)
   - 산출물: `docs/02-design/features/realtime-wall-design-customization.design.md`
   - 핵심 결정: presetId 12개 최종 확정 + CSS 매핑 (className vs inline style) + 학생 SPA 동적 토글 시점 (wall-state 수신 시점 + default 적용 타이밍)
3. [ ] **Phase 1 → 2 → 3 직진 권장** (Phase 1의 도메인·broadcast가 Phase 2의 전제, Phase 3은 독립 가능)
4. [ ] 각 Phase 완료마다 `/pdca analyze realtime-wall-design-customization` Match Rate 측정 → 90%↑ + 회귀 위험 7건 + 96조합 디자인 QA PASS 시 다음 Phase
5. [ ] **출시 윈도우 정렬**: padlet mode v2.1 Phase B 안정화 후 v1.16.x로 누적. 5월 / 7월 / 10월 초 윈도우 권고 (v2.1 §1.2 계승)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-26 | 초안 작성 — 3 Phase 로드맵(테마 모델·동일뷰 / 디자인 패널·라이브 프리뷰 / "+" 버튼 재배치). 사용자 사전 결정 4건 + 명시 문제 3건 반영. 회귀 위험 7건 (v1.14 5건 + v2.1 신규 2건). OOS 명시: 이미지 업로드 / system scheme 자동 감지 / 학생 개별 토글 / 카드 색 변경 / 사용자 정의 그라디언트. 12개 배경 프리셋 카탈로그 명세 (solid 4 + gradient 4 + pattern 4). 8색 카드 × 12 배경 = 96조합 디자인 QA 매트릭스 의무화. broadcast backward compat 보장 (`theme` optional, version 1 유지). | cto-lead (consult: pm/frontend/security/qa) |
