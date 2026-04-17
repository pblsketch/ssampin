---
template: plan
version: 1.2
feature: dual-tool-view
date: 2026-04-17
author: pblsketch
project: ssampin
version_target: v1.11.0
---

# 쌤 도구 병렬 표시(Dual Tool View) 기획서

> **요약**: 현재 한 번에 하나의 도구만 열리는 쌤핀의 도구 영역에 **두 도구를 동시에 표시**하는 기능을 추가한다. 교사가 수업 중 점수판과 타이머를 함께 쓰는 전형적인 시나리오를 해결한다.
>
> **Project**: ssampin (쌤핀)
> **Version**: v1.10.x → v1.11.0
> **Author**: pblsketch
> **Date**: 2026-04-17
> **Status**: Draft

---

## 1. Overview

### 1.1 Purpose

교사가 **두 개의 쌤 도구(점수판 + 타이머, 랜덤뽑기 + 점수판, 타이머 + 설문 등)를 동시에 운용**할 수 있도록 도구 영역을 확장한다. 수업 중 도구 전환으로 맥락이 끊기는 문제를 해결하고, 빔프로젝터로 송출 시 "점수판 + 카운트다운"을 한 화면에 띄우는 실사용 시나리오를 지원한다.

### 1.2 Background

- 사용자 피드백(2026-04-17 AI 챗봇 문의 로그): "점수판에 점수를 저장하면서 타이머를 동시에 사용할 수 있나요?" — 현재 불가
- 챗봇이 **"위젯으로 보기/창 분리/압정 아이콘"** 기능이 있는 것처럼 허위 답변 → 사용자 기대 미스매치 발생
- 수업 현장 시나리오 대부분 "점수판 + 타이머" 또는 "랜덤뽑기 + 점수판" 조합 필요
- 관련 인프라 일부 선행 구축됨: `window:applyWidgetSettings` IPC, 위젯 모드 쉘 존재

### 1.3 Related Documents

- 챗봇 피드백 검증 결과: 본 세션(2026-04-17) 분석 — scoreboard/timer 완전 독립 컴포넌트, 분리 UI 없음
- 대상 도구 래퍼: [src/adapters/components/Tools/ToolLayout.tsx](../../../src/adapters/components/Tools/ToolLayout.tsx)
- 대상 도구(예시):
  - [src/adapters/components/Tools/ToolScoreboard.tsx](../../../src/adapters/components/Tools/ToolScoreboard.tsx)
  - [src/adapters/components/Tools/ToolTimer.tsx](../../../src/adapters/components/Tools/ToolTimer.tsx)
  - [src/adapters/components/Tools/ToolPoll.tsx](../../../src/adapters/components/Tools/ToolPoll.tsx)
- 위젯 IPC: [electron/main.ts](../../../electron/main.ts) `window:applyWidgetSettings`
- AI 챗봇 지식 베이스 업데이트 대상: `scripts/ingest-chatbot-qa.mjs`

---

## 2. Scope

### 2.1 In Scope — MVP (Phase 1, v1.11.0)

- [ ] **분할 뷰(Split View)** 방식: 동일 창 내 좌/우 2 슬롯으로 두 도구 동시 표시
- [ ] 듀얼 모드 **진입 UI**: ToolLayout 헤더에 "도구 추가" 아이콘 버튼 (material-symbol: `splitscreen`)
- [ ] 두 번째 도구 **선택 UI**: 슬롯 내부 인라인 피커(현재 도구 제외한 목록)
- [ ] 슬롯별 **교체(swap_horiz) / 좌우 전환(swap_vert) / 닫기(close)** 컨트롤
- [ ] 기본 분할 비율 **50:50** + **프리셋(30:70, 50:50, 70:30)**
- [ ] 슬롯별 **독립 전체화면 토글** (슬롯 콘텐츠 최대화) 및 **독립 줌(+/−)**
- [ ] 좁은 화면 **자동 단일 모드 폴백** (window.innerWidth < 1280)
- [ ] **세션 유지**: `sessionStorage`에 `{leftTool, rightTool, splitRatio}` 저장 (F5 복원, 앱 재시작 시엔 리셋)
- [ ] 접근성: 활성 슬롯 시각 표시(border accent), 키보드 포커스 기반 단축키 라우팅
- [ ] AI 챗봇 지식 베이스 업데이트 (이 기능 Q&A 추가, 없는 UI 참조 제거)

### 2.2 Phase 2 (차기 이터레이션, v1.12+ 검토)

- [ ] **팝아웃 창(Popout Window)** 방식: 두 번째 도구를 별도 BrowserWindow로 띄우고 `alwaysOnTop` 적용
- [ ] 팝아웃 창 OS 닫기(X) 비활성화 + 전용 종료 버튼 (빔프로젝터 중 실수 방지)
- [ ] 팝아웃 창 위치·크기 영속화 (`useSettingsStore`)
- [ ] 듀얼 모니터 환경 최적화 (주 화면·보조 화면 자동 배치)

### 2.3 Out of Scope

- **동일 도구 2개 동시 실행** (점수판 2개) — Zustand 스토어 공유 인스턴스 충돌 위험, 스토어 인스턴스 분리 설계 필요 → 향후 별도 과제
- **3개 이상 도구 동시 표시** — 화면 복잡도 초과, 수업 가독성 저해
- **드래그로 슬롯 간 도구 이동** — 프리셋·교체 버튼으로 충분
- **위젯 모드에서의 듀얼 표시** — 위젯은 단일 도구 노출 목적, 듀얼 진입 시 위젯 버튼 비활성화
- **모바일 PWA 듀얼 뷰** — 화면 크기 부적합

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | 요구사항 | 우선순위 | 상태 |
|----|---------|---------|------|
| FR-01 | ToolLayout 헤더에 "도구 추가"(splitscreen) 버튼이 존재하고 클릭 시 듀얼 모드로 진입한다 | High | Pending |
| FR-02 | 듀얼 모드 진입 시 좌측은 현재 도구, 우측은 **비어있는 피커 상태**로 시작한다 | High | Pending |
| FR-03 | 우측 슬롯 피커에서 선택 가능한 도구 목록은 **좌측에 이미 선택된 도구를 제외**한다 | High | Pending |
| FR-04 | 각 슬롯 헤더에 **교체 / 좌우 전환 / 닫기** 버튼이 배치된다 | High | Pending |
| FR-05 | 슬롯 닫기 시 단일 모드로 복귀, 남은 슬롯의 도구가 유지된다 | High | Pending |
| FR-06 | 분할 비율 프리셋(30:70, 50:50, 70:30) 토글 버튼이 헤더에 제공된다 | Medium | Pending |
| FR-07 | 슬롯 사이 **리사이즈 핸들** 드래그로 분할 비율을 무단계 조정할 수 있다 | Medium | Pending |
| FR-08 | 각 슬롯은 **독립 줌 레벨**과 **독립 콘텐츠 최대화(슬롯 전체 확대)** 상태를 가진다 | High | Pending |
| FR-09 | 활성 슬롯(키보드 포커스 대상)은 **테두리 하이라이트**로 시각 표시된다 | High | Pending |
| FR-10 | 슬롯 클릭 시 활성 슬롯이 전환되고 이후 키보드 단축키는 활성 슬롯에만 라우팅된다 | High | Pending |
| FR-11 | `window.innerWidth < 1280` 환경에서는 듀얼 모드 진입 시 Toast로 안내 후 단일 모드 유지 | Medium | Pending |
| FR-12 | 듀얼 모드 상태(`leftTool`, `rightTool`, `splitRatio`)는 `sessionStorage`에 저장되어 F5 새로고침 시 복원된다 | Medium | Pending |
| FR-13 | 듀얼 모드 진입 중에는 **위젯 모드 전환 버튼이 비활성화**된다 (호버 시 안내 툴팁) | Medium | Pending |
| FR-14 | 릴리즈 전 AI 챗봇 지식 베이스(`scripts/ingest-chatbot-qa.mjs`)에 듀얼 뷰 Q&A 반영 | High | Pending |

### 3.2 Non-Functional Requirements

| 카테고리 | 기준 | 측정 방법 |
|---------|------|---------|
| 성능 | 듀얼 진입 애니메이션 60fps, 리사이즈 드래그 중 프레임 드롭 없음 | Chrome DevTools Performance |
| 반응성 | 듀얼 진입 < 200ms, 도구 교체 < 300ms | 수동 스톱워치 |
| 접근성 | 활성 슬롯 표시는 색뿐 아니라 border·aria-selected 속성 병행 | 수동 스크린리더 확인 |
| 하위 호환 | 기존 단일 도구 동작 100% 유지, 듀얼 모드 미진입 사용자 영향 없음 | 회귀 테스트 |
| 디자인 일관성 | 기존 토큰(sp-bg, sp-card, sp-border, sp-accent)만 사용, 디자인 예시 톤 유지 | 디자인 리뷰 |
| 한국어 | 모든 신규 UI 텍스트 한국어 (버튼 라벨, 툴팁, Toast) | 수동 검수 |

---

## 4. Success Criteria

### 4.1 Definition of Done (MVP)

- [ ] FR-01 ~ FR-05, FR-08 ~ FR-10, FR-14 모두 구현 완료 (Must)
- [ ] FR-06, FR-07, FR-11 ~ FR-13 구현 완료 (Should)
- [ ] 점수판 + 타이머, 점수판 + 랜덤뽑기, 타이머 + 설문 조합 실사용 테스트 통과
- [ ] 좁은 화면(1366×768 기준) 자동 폴백 동작 확인
- [ ] 듀얼 모드 진입·종료 후 각 도구 내부 상태(점수, 타이머 남은 시간 등) 보존 확인
- [ ] TypeScript 에러 0개 (`npx tsc --noEmit`)
- [ ] `npm run build` 성공
- [ ] PDCA `analyze` Match Rate ≥ 90%
- [ ] 챗봇 지식 베이스 재임베딩 완료, v1.11.0 릴리즈 노트에 포함

### 4.2 Quality Criteria

- [ ] Clean Architecture 의존성 규칙 위반 없음 (신규 코드는 `adapters/` 레이어에만 추가)
- [ ] `any` 타입 미사용
- [ ] Tailwind 유틸리티 클래스로만 스타일링
- [ ] 모든 UI 텍스트 한국어
- [ ] 기존 `useSoundStore`, `useSettingsStore` 등은 재사용, 중복 스토어 생성 금지

### 4.3 사용자 경험 수락 기준 (UX Acceptance)

- [ ] **학습 곡선 5초**: 사이드바 → 도구 선택 → 헤더의 splitscreen 버튼 클릭 만으로 듀얼 진입 가능
- [ ] **실수 복구 쉬움**: 슬롯 닫기 후에도 남은 도구의 작업 내용이 유지됨
- [ ] **시선 분산 최소화**: 활성 슬롯 하이라이트는 색상 변화(1px border-accent)만, 과도한 애니메이션 없음
- [ ] **수업 중 안정감**: F5 눌러도 세션 내에서는 듀얼 상태 복원, 앱 재시작 시에는 깔끔한 초기화

---

## 5. Risks and Mitigation

| 리스크 | 영향 | 가능성 | 완화 방안 |
|-------|------|-------|---------|
| 기존 도구 컴포넌트가 `document.fullscreenElement` 전역 상태 가정으로 듀얼에서 충돌 | High | High | 슬롯 레벨 "콘텐츠 최대화"로 대체, 브라우저 전체화면 API는 듀얼 모드에서 창 전체 기준으로 한정 |
| 각 Tool의 줌 상태를 내부 `useState`로 관리해 듀얼 진입 시 공유되는 것처럼 보임 | Medium | Medium | 각 슬롯이 별도 `ToolLayout` 인스턴스를 마운트하므로 자동 격리됨, 명시적 회귀 테스트 필요 |
| Zustand 스토어 공유로 "도구 간 상태 간섭" (예: `useSoundStore`) | Medium | Low | 사운드는 앱 전역 단일 스토어가 정상 동작, 간섭 아닌 공유가 의도된 영역만 해당 |
| 좁은 해상도 사용자에게 듀얼 진입 버튼이 오히려 혼란 유발 | Medium | Medium | 1280px 미만 환경에서는 버튼에 "화면이 좁아 권장하지 않습니다" 툴팁 + Toast로 폴백 안내 |
| 챗봇 학습 데이터가 이전 답변("위젯으로 보기/압정 아이콘")을 계속 답변 | Medium | High | 릴리즈 직후 `ingest-chatbot-qa.mjs`에 해당 Q를 명시적으로 덮어씀 + 없는 UI 지시문 제거 |
| 빔프로젝터 송출 시 리사이즈 드래그로 학생에게 어수선한 애니메이션 노출 | Low | Low | 프리셋 버튼(30:70, 50:50, 70:30)을 기본 동선으로, 드래그는 보조 수단 |
| 팝아웃 요구가 Phase 2로 밀리면서 사용자 불만 | Low | Medium | MVP 릴리즈 노트에 "2단계로 팝아웃 창 지원 예정" 명시, 분할 뷰도 빔프로젝터 미러링에 충분함을 안내 |

---

## 6. Architecture Considerations

### 6.1 Project Level Selection

| Level | 특성 | 권장 | 선택 |
|-------|-----|-----|:---:|
| **Starter** | 단순 구조 | 정적 사이트 | ☐ |
| **Dynamic** | 기능 모듈·BaaS | 풀스택 웹앱 | ☑ |
| **Enterprise** | 엄격 레이어·DI·마이크로서비스 | 대규모 시스템 | ☐ |

쌤핀은 이미 **Clean Architecture 4-layer(Dynamic 상위)**. 본 기능은 adapters 레이어의 UI 구성 변경이 주이며 domain/usecases 변경이 없다.

### 6.2 Key Architectural Decisions

| 결정 | 옵션 | 선택 | 근거 |
|-----|-----|-----|-----|
| 병렬 표시 방식 | 분할 뷰 / 팝아웃 창 / 하이브리드 | **분할 뷰 (MVP) → 팝아웃 (Phase 2)** | 단일 모니터 1366×768 사용자 다수·기존 컴포넌트 무수정 재활용·수업 시나리오 대부분 충족 |
| 상태 관리 | 전역 Zustand 신규 스토어 / 로컬 useState / sessionStorage 하이브리드 | **로컬 useState + sessionStorage 경량 훅** | 분할 비율·활성 슬롯은 UI 상태, 영속화는 F5 수준만 필요, 앱 재시작 간 이월은 비의도 |
| 컴포넌트 구조 | ToolLayout 확장 / 신규 컨테이너 sibling / HOC | **신규 `DualToolContainer` sibling** | ToolLayout을 건드리지 않아 기존 도구 회귀 리스크 차단 |
| 도구 선택 UI | 모달 / 드롭다운 / 슬롯 인라인 피커 | **슬롯 인라인 피커** | 슬롯 컨텍스트 안에 UI가 있어 "이 자리에 무엇을 둘까" 의도가 명확, z-index 충돌 없음 |
| 활성 슬롯 전환 | 클릭 기반 / 포커스 자동 / 명시 키보드 단축키 | **클릭(onPointerDown) + 테두리 하이라이트** | 교사에게 가장 직관적, 실수 전환 적음 |
| 분할 비율 조정 | 드래그만 / 프리셋만 / 둘 다 | **프리셋(주) + 드래그(보조)** | 수업 중 빠르게 3가지 비율 택일이 주 시나리오, 드래그는 고급 사용자용 |
| 폴백 임계값 | 1024 / 1280 / 1366 | **1280px** | 쌤핀 주요 타겟 1366×768 유지·웹표준 태블릿 한계선·남는 여백 안전 |

### 6.3 Clean Architecture Approach

```
선택 레벨: Dynamic (Clean Architecture 4-layer)

영향 레이어:
┌─────────────────────────────────────────────────────┐
│ infrastructure/  변경 없음                          │
│ ┌─────────────────────────────────────────────────┐ │
│ │ adapters/                                       │ │
│ │   - components/Tools/DualToolContainer.tsx  ➕  │ │
│ │   - components/Tools/DualToolSlot.tsx       ➕  │ │
│ │   - components/Tools/DualToolPicker.tsx     ➕  │ │
│ │   - components/Tools/ResizeDivider.tsx      ➕  │ │
│ │   - components/Tools/ToolLayout.tsx         ✏️  │ │  ← "도구 추가" 버튼만 추가
│ │   - components/Tools/ToolsGrid.tsx          (무수정) │
│ │   - hooks/useDualToolSession.ts             ➕  │ │  ← sessionStorage 경량 훅
│ │ ┌─────────────────────────────────────────────┐ │ │
│ │ │ usecases/   변경 없음                       │ │ │
│ │ │ ┌─────────────────────────────────────────┐ │ │ │
│ │ │ │ domain/   변경 없음                     │ │ │ │
│ │ │ └─────────────────────────────────────────┘ │ │ │
│ │ └─────────────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘

순수 UI 구성 개선 — 의존성 규칙 위반 없음
```

### 6.4 신규 컴포넌트 책임 분리

| 컴포넌트 | 책임 | 상태 소유 |
|---------|------|---------|
| `DualToolContainer` | 듀얼 모드 셸, 좌/우 슬롯 배치, 활성 슬롯 추적 | `leftTool`, `rightTool`, `splitRatio`, `activeSlot` |
| `DualToolSlot` | 단일 슬롯 래퍼, ToolLayout을 감싸 내부 도구 렌더 | `zoom`, `slotMaximized` (슬롯 로컬) |
| `DualToolPicker` | 슬롯 내부 인라인 도구 선택 UI | 없음 (stateless) |
| `ResizeDivider` | 두 슬롯 사이 드래그 핸들 | 없음 (onChange 콜백만) |
| `useDualToolSession` | sessionStorage 직렬화/복원 경량 훅 | 없음 (브라우저 storage) |

---

## 7. Convention Prerequisites

### 7.1 Existing Project Conventions

- [x] `CLAUDE.md`에 코딩 컨벤션 존재 (Clean Architecture, TypeScript strict, Tailwind, 한국어 UI)
- [x] `tsconfig.json` strict 모드
- [x] Path alias (`@adapters/*`, `@domain/*`) 운영 중
- [x] Tailwind 디자인 토큰 (sp-bg, sp-surface, sp-card, sp-border, sp-accent, sp-highlight, sp-text, sp-muted)
- [x] material-symbols-outlined 아이콘 사용

### 7.2 Conventions to Define/Verify

| 카테고리 | 현 상태 | 정의할 내용 | 우선순위 |
|---------|--------|-----------|:-------:|
| **컴포넌트 네이밍** | PascalCase 유지 | `DualTool*` prefix | High |
| **슬롯 상태 네이밍** | — | `activeSlot: 'left' \| 'right'` (유니온 타입) | High |
| **sessionStorage 키** | 미사용 | `ssampin:dual-tool-session` | Medium |
| **아이콘 컨벤션** | material-symbols | `splitscreen`(진입), `swap_horiz`(교체), `swap_vert`(좌우전환), `close`(닫기) | High |
| **하이라이트 토큰** | sp-accent 활용 중 | 활성 슬롯 테두리: `border-sp-accent/60` | Medium |

### 7.3 Environment Variables Needed

환경 변수 추가 불필요 (순수 클라이언트 UI 상태).

### 7.4 Pipeline Integration

9-phase 파이프라인 미적용 프로젝트. 기존 PDCA Plan → Design → Do → Analyze → Report 플로우.

---

## 8. Next Steps

1. [ ] 설계 문서 작성 (`/pdca design dual-tool-view`)
   - `DualToolContainer` 인터페이스 및 props 정의
   - 슬롯 상태 전이 다이어그램 (진입 / 교체 / 스왑 / 닫기 / 폴백)
   - `useDualToolSession` 훅 시그니처 및 키 스키마
   - ToolLayout 헤더 버튼 추가 위치 상세 (기존 버튼군과의 순서·간격)
   - 반응형 임계값 감지 전략 (ResizeObserver vs window resize)
2. [ ] 디자인 예시 (`design examples/`) 검토 — 듀얼 뷰 레퍼런스 존재 여부 확인
3. [ ] 구현 (`/pdca do dual-tool-view`)
4. [ ] Gap 분석 (`/pdca analyze dual-tool-view`)
5. [ ] 릴리즈 (v1.11.0 노트 + 챗봇 지식 베이스 업데이트 + 노션 사용자 가이드 갱신)
6. [ ] (Phase 2) 팝아웃 창 방식 추가 설계 — 별도 Plan 문서로 분리 예정

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-17 | 초기 Plan 작성 (챗봇 피드백 기반 듀얼 도구 뷰 요구사항 정의, product-manager·frontend-architect 협업 결과 반영) | pblsketch |
