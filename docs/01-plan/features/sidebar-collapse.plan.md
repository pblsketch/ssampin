---
template: plan
version: 1.2
feature: sidebar-collapse
date: 2026-04-14
author: pblsketch
project: ssampin
version_target: v1.10.0
---

# 사이드바 접기/펴기 기능 기획서

> **요약**: 쌤핀 메인 사이드바(256px 고정)를 사용자가 자유롭게 접고 펼 수 있도록 토글 기능을 추가한다. 저해상도 화면·수업 투사·몰입 작업 시나리오에서 본문 영역을 넓게 확보한다.
>
> **Project**: ssampin (쌤핀)
> **Version**: v1.9.7 → v1.10.0
> **Author**: pblsketch
> **Date**: 2026-04-14
> **Status**: Draft

---

## 1. Overview

### 1.1 Purpose

교사가 해상도가 낮은 노트북(1366×768), 빔프로젝터 송출, 긴 문서 작성 등 **본문 공간이 중요한 상황**에서 사이드바를 일시적으로 접어 작업 공간을 확보할 수 있도록 한다.

### 1.2 Background

- 사용자 피드백(2026-04): "사이드바를 열고 닫는 기능이 필요하다"
- 현재 `Sidebar.tsx`는 `w-64`(256px) 고정 — 1366px 화면에서 본문이 1110px로 축소
- `isFullscreen` 모드에서만 사이드바가 숨겨지는 특수 패턴 존재 → 일반 페이지에도 확장 필요
- VSCode·Notion·Slack 등 유사 데스크톱 앱에서 통용되는 관례 (`Ctrl+B` 단축키)

### 1.3 Related Documents

- 피드백 원문: [docs/피드백_분석_보고서_20260410 (3).md](../../피드백_분석_보고서_20260410%20(3).md)
- 현재 사이드바: [src/adapters/components/Layout/Sidebar.tsx](../../../src/adapters/components/Layout/Sidebar.tsx)
- 렌더링 위치: [src/App.tsx:562](../../../src/App.tsx#L562)

---

## 2. Scope

### 2.1 In Scope

- [ ] `useSettingsStore`에 `sidebarCollapsed: boolean` 필드 추가 (persist)
- [ ] Sidebar 상단에 접기/펴기 토글 버튼 배치 (화살표 아이콘)
- [ ] 접힌 상태: 아이콘만 노출(w-16, 64px), 라벨·프로필·버전 숨김
- [ ] 펼친 상태: 기존 w-64 동작 유지 (100% 하위 호환)
- [ ] 전역 단축키 `Ctrl+B` (macOS: `Cmd+B`) 지원
- [ ] 접힘 상태에서 메뉴 아이템에 툴팁(title) 노출
- [ ] 대시보드·시간표 등 기존 페이지 레이아웃 깨지지 않는지 회귀 테스트

### 2.2 Out of Scope

- 사이드바 폭 자유 리사이즈(드래그 핸들) — 차기 이터레이션
- 완전 숨김(0px) 모드 — 기존 `isFullscreen` 경로로 충분
- 모바일 PWA의 사이드바 — 이미 별도 하단 탭 네비게이션 사용
- 위젯 모드의 접기 — 위젯 모드는 별도 윈도우라 비해당

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | 요구사항 | 우선순위 | 상태 |
|----|---------|---------|------|
| FR-01 | 사이드바 상단에 접기/펴기 토글 버튼이 존재하고 클릭 시 폭이 전환된다 | High | Pending |
| FR-02 | 접힘 상태는 `useSettingsStore`에 영속 저장되어 앱 재시작 후에도 유지된다 | High | Pending |
| FR-03 | `Ctrl+B`(Win/Linux), `Cmd+B`(macOS) 전역 단축키로 토글된다 | Medium | Pending |
| FR-04 | 접힌 상태에서도 모든 메뉴 아이콘과 활성 상태 하이라이트가 보여야 한다 | High | Pending |
| FR-05 | 접힌 상태의 메뉴 아이템 hover 시 `title` 속성으로 라벨이 툴팁으로 표시된다 | Medium | Pending |
| FR-06 | 드래그 앤 드롭으로 메뉴 순서 재정렬 기능이 접힘 상태에서도 동작한다(또는 명시적 비활성) | Low | Pending |
| FR-07 | 설정 > 화면 표시 탭에 "사이드바 기본 상태" 옵션 제공 (펼침/접힘) | Low | Pending |

### 3.2 Non-Functional Requirements

| 카테고리 | 기준 | 측정 방법 |
|---------|------|---------|
| 성능 | 토글 애니메이션 60fps, 레이아웃 shift 없음 | Chrome DevTools Performance |
| 접근성 | 토글 버튼에 `aria-expanded`, `aria-label` 속성 | axe DevTools, 수동 스크린리더 확인 |
| 하위 호환 | 기존 `isFullscreen`·`menuOrder`·`hiddenMenus` 동작 유지 | 수동 회귀 테스트 |
| 시각 일관성 | 접힘 시에도 `design examples/`의 톤/여백 유지 | 디자인 리뷰 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] FR-01 ~ FR-05 모두 구현 완료
- [ ] TypeScript 에러 0개 (`npx tsc --noEmit`)
- [ ] `npm run build` 성공
- [ ] 대시보드·시간표·좌석·일정·메모·할일·수업관리·설정 페이지에서 접힘/펼침 모두 정상 렌더
- [ ] 위젯 모드 진입/복귀 시 사이드바 상태 보존
- [ ] PDCA `analyze` Match Rate ≥ 90%

### 4.2 Quality Criteria

- [ ] Clean Architecture 의존성 규칙 위반 없음 (domain/usecases 수정 불필요)
- [ ] `any` 타입 미사용
- [ ] Tailwind 유틸리티 클래스로만 스타일링
- [ ] 모든 UI 텍스트 한국어

---

## 5. Risks and Mitigation

| 리스크 | 영향 | 가능성 | 완화 방안 |
|-------|------|-------|---------|
| 접힘 상태에서 드래그 앤 드롭 UX 혼선 | Medium | Medium | 접힘 시 드래그 비활성 또는 아이콘 드래그만 허용 |
| `SyncStatusBar`·`DriveSyncIndicator`·프로필·버전 라벨이 좁은 폭에 깨짐 | Medium | High | 접힘 시 해당 요소는 아이콘만 노출하거나 완전 숨김 |
| 단축키 충돌 (브라우저 모드에서 `Ctrl+B`가 굵게) | Low | Low | 입력 포커스(input, textarea, contenteditable) 감지 시 단축키 무시 |
| 기존 사용자에게 갑작스러운 UX 변화 | Low | Low | 기본값 = 펼침(하위 호환), 토글은 옵트인 |
| 프로젝트 전역 CSS transition으로 다른 컴포넌트에 영향 | Low | Low | Tailwind `transition-[width]`로 스코프 한정 |

---

## 6. Architecture Considerations

### 6.1 Project Level Selection

| Level | 특성 | 권장 | 선택 |
|-------|-----|-----|:---:|
| **Starter** | 단순 구조 | 정적 사이트 | ☐ |
| **Dynamic** | 기능 모듈·BaaS | 풀스택 웹앱 | ☑ |
| **Enterprise** | 엄격 레이어·DI·마이크로서비스 | 대규모 시스템 | ☐ |

쌤핀은 이미 **Clean Architecture 4-layer(Dynamic 상위)** 로 구성됨. 본 기능은 UI 상태 변경만 포함하므로 domain/usecases 레이어 변경 불필요.

### 6.2 Key Architectural Decisions

| 결정 | 옵션 | 선택 | 근거 |
|-----|-----|-----|-----|
| 상태 관리 위치 | Zustand store / 로컬 useState / React Context | **useSettingsStore (Zustand, persist)** | 기존 `menuOrder`·`hiddenMenus` 패턴 재사용, 앱 재시작 간 유지 필요 |
| 스타일링 | Tailwind 조건부 / styled-components / CSS Modules | **Tailwind 조건부 클래스** | 프로젝트 컨벤션, `w-64 ↔ w-16` 전환 |
| 단축키 처리 | 전역 window 리스너 / useHotkeys 라이브러리 / Electron accelerator | **React 전역 window 리스너(App.tsx useEffect)** | 추가 의존성 없음, 브라우저 모드에서도 동작 |
| 아이콘 전환 | Material Symbols `chevron_left/right` / `menu_open/menu` | **`menu_open` ↔ `menu`** | 기존 material-symbols-outlined 일관성 |
| 애니메이션 | Tailwind transition / Framer Motion | **Tailwind `transition-[width] duration-200`** | 경량, 프로젝트에 Framer 미사용 |

### 6.3 Clean Architecture Approach

```
선택 레벨: Dynamic (Clean Architecture 4-layer)

영향 레이어:
┌─────────────────────────────────────────┐
│ infrastructure/  변경 없음              │
│ ┌─────────────────────────────────────┐ │
│ │ adapters/                           │ │
│ │   - stores/useSettingsStore.ts  ✏️  │ │
│ │   - components/Layout/Sidebar.tsx ✏️│ │
│ │   - App.tsx (단축키 리스너)      ✏️ │ │
│ │ ┌─────────────────────────────────┐ │ │
│ │ │ usecases/   변경 없음           │ │ │
│ │ │ ┌─────────────────────────────┐ │ │ │
│ │ │ │ domain/   변경 없음         │ │ │ │
│ │ │ └─────────────────────────────┘ │ │ │
│ │ └─────────────────────────────────┘ │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘

순수 UI 상태 개선 — 의존성 규칙 위반 없음
```

---

## 7. Convention Prerequisites

### 7.1 Existing Project Conventions

- [x] `CLAUDE.md`에 코딩 컨벤션 존재 (Clean Architecture, TypeScript strict, Tailwind)
- [x] `tsconfig.json` strict 모드
- [x] Path alias (`@adapters/*`, `@domain/*`) 운영 중
- [ ] ESLint 설정 확인 필요 (프로젝트 루트)
- [x] Tailwind 디자인 토큰 (sp-bg, sp-surface, sp-card 등)

### 7.2 Conventions to Define/Verify

| 카테고리 | 현 상태 | 정의할 내용 | 우선순위 |
|---------|--------|-----------|:-------:|
| **네이밍** | 기존 camelCase 유지 | `sidebarCollapsed` (boolean) | High |
| **폴더 구조** | 기존 규칙 준수 | 신규 파일 없음(기존 파일 수정만) | High |
| **단축키 컨벤션** | 미정의 | `Ctrl/Cmd + B`(VSCode 관례) | Medium |
| **영속 설정 키** | `useSettingsStore` 확장 | `sidebarCollapsed` 키 추가 | High |

### 7.3 Environment Variables Needed

환경 변수 추가 불필요 (순수 클라이언트 UI 상태).

### 7.4 Pipeline Integration

9-phase 파이프라인 미적용 프로젝트(기존 PDCA 기반 운영). Plan → Design → Do → Analyze → Report 플로우만 사용.

---

## 8. Next Steps

1. [ ] 설계 문서 작성 (`/pdca design sidebar-collapse`)
   - `useSettingsStore` 인터페이스 정의
   - Sidebar 접힘 상태 레이아웃 상세 (아이콘 배치, 툴팁, 드래그 UX)
   - 단축키 등록/해제 라이프사이클
2. [ ] 디자인 예시 확인 (`design examples/` 내 접힘 상태 참고 이미지 유무)
3. [ ] 구현 (`/pdca do sidebar-collapse`)
4. [ ] Gap 분석 (`/pdca analyze sidebar-collapse`)
5. [ ] 릴리즈 (v1.10.0 노트에 포함, 챗봇 Q&A 반영, 노션 가이드 업데이트)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-14 | 초기 Plan 작성 (사이드바 접기/펴기 피드백 대응) | pblsketch |
