---
template: plan
version: 1.2
feature: realtime-bulletin-management
date: 2026-04-21
author: pblsketch
project: ssampin
version_target: v1.12.x (realtime-bulletin 정식 승격 기점)
---

# 쌤핀 실시간 게시판 — 관리 기능 기획안

> **요약**: 실시간 게시판(BETA)에 **"여러 개 개설 + 저장 + 수정관리"** 3축을 전부 얹는다. 구체적으로 (A) **설정 프리셋**(제목/레이아웃/컬럼 세트 저장 후 재사용), (B) **진행 중 세션 자동 저장/재개**(앱 종료·의도치 않은 종료 복구), (C) **보드 엔티티화**(collab-board처럼 목록/생성/이름변경/삭제/세션 시작)를 하나의 기능 묶음으로 설계한다.
>
> **핵심 방향**: 기존 realtime-bulletin 코드(도메인/IPC/UI)를 **부수지 않고 증강**한다. "결과 복기"만 있던 저장소 위에 "관리 대상으로서의 보드(Bulletin Board)"를 새 엔티티로 얹고, collab-board가 먼저 검증한 `list/create/rename/delete/start-session/save-snapshot` 14채널 IPC 패턴을 **미러링**한다.
>
> **Project**: ssampin (쌤핀)
> **Version**: v1.11.x (현재 BETA) → v1.12.x (관리 기능 포함 정식 승격)
> **Author**: pblsketch
> **Date**: 2026-04-21
> **Status**: Draft

---

## 1. Overview

### 1.1 Purpose

교사가 실시간 게시판을 **"매번 처음부터 만드는 1회용 도구"** 가 아니라 **"내 수업의 상시 자산"** 으로 쓸 수 있게 한다. 구체적 수업 시나리오:

- 동일 교사가 **같은 단원을 여러 반에 반복 수업**: 매번 컬럼 "생각/질문/정리"를 다시 입력하는 비효율 제거 → **프리셋**
- 45분 수업 중 **앱이 종료되거나 실수로 "학생 참여 종료"를 눌러 모든 카드 유실**: 자동 저장된 스냅샷에서 재개 → **자동 저장/재개**
- 학년/과목/단원별로 여러 보드를 분리 관리: "2학년 국어-수필 단원 토론 보드", "3학년 사회-시민권 토론 보드" 등을 **독립 엔티티로 목록화** → **보드 엔티티화**

### 1.2 Background

- **현재 상태(2026-04-21)**: realtime-bulletin은 BETA 배지로 막 출시. 코어(WebSocket + cloudflared 터널 + dnd-kit + react-rnd + `tool-results.json` 읽기 전용 복기)는 완성.
- **부재 기능**: 생성된 보드를 재사용/이어가기/관리하는 상위 레이어 전무. 매 세션이 휘발성.
- **레퍼런스 존재**: [collab-board](collab-board.plan.md)가 이미 `docs/01-plan/features/collab-board.plan.md`에서 보드 엔티티화 + 자동 저장 + IPC 14채널 패턴을 **선행 검증** 완료. 이번 작업의 설계 부담을 크게 낮춘다.
- **프리셋 레퍼런스**: [`useToolPresetStore.ts`](../../../src/adapters/stores/useToolPresetStore.ts)가 roulette/random/wordcloud의 프리셋을 `tool-presets.json` 단일 파일로 CRUD하는 패턴을 확립. 동일 구조를 realtime-bulletin용으로 확장.
- **사용자 직접 요청(2026-04-21)**: "게시판 여러 개 개설 + 저장 + 수정관리 3가지 모두 필요해"

### 1.3 Related Documents

- 상위 기능 계획: [docs/01-plan/features/realtime-bulletin.plan.md](realtime-bulletin.plan.md) — 이번 계획은 여기 §7 P3(저장/복기 완성)와 P4(후속 확장: 컬럼 템플릿/세션 시작 전 레이아웃 설정 UI)를 실제 설계로 전환
- 보드 엔티티화 레퍼런스: [collab-board.plan.md](collab-board.plan.md) §2.1, IPC 14채널 + before-quit 동기 저장 패턴
- 프리셋 구현 레퍼런스: [`src/adapters/stores/useToolPresetStore.ts`](../../../src/adapters/stores/useToolPresetStore.ts), [`src/domain/entities/ToolPreset.ts`](../../../src/domain/entities/ToolPreset.ts)
- Collab-board 실제 구현: [`electron/ipc/board.ts`](../../../electron/ipc/board.ts), [`src/domain/entities/Board.ts`](../../../src/domain/entities/Board.ts), [`src/adapters/repositories/FileBoardRepository.ts` (있다면)](../../../src/adapters/repositories/)
- 결과 복기 현 상태: [`src/adapters/components/Tools/TemplateManager/PastResultsView.tsx`](../../../src/adapters/components/Tools/TemplateManager/PastResultsView.tsx) (실시간 게시판 분기 추가됨 — 보존)
- 타입 정의: [`src/domain/entities/RealtimeBulletin.ts`](../../../src/domain/entities/RealtimeBulletin.ts), [`src/domain/entities/ToolResult.ts`](../../../src/domain/entities/ToolResult.ts) (`RealtimeBulletinResultData` 유지)

---

## 2. Scope

### 2.1 In Scope — Phase M1 (프리셋, v1.12.x 초기 릴리즈)

> 가장 가볍고 가장 즉각적 효용. collab-board 패턴 도입 없이 단일 JSON 파일 CRUD만으로 끝난다.

- [ ] 도메인: `src/domain/entities/RealtimeBulletinPreset.ts` — `id/name/layoutMode/columnTitles[]/createdAt/updatedAt`
- [ ] 저장소: `tool-presets.json`의 `ToolPresetType`에 `'realtime-bulletin-preset'` 추가 (기존 단일 파일 유지), 또는 전용 `realtime-bulletin-presets.json` 분리 — **§6 Architecture Considerations에서 결정**
- [ ] Zustand: `useRealtimeBulletinPresetStore` (load/getAll/add/rename/update/delete)
- [ ] UI: `CreateView` 상단에 "불러오기" 드롭다운 + 하단에 "이 설정을 프리셋으로 저장" 체크박스/버튼
- [ ] UI: 프리셋 선택 시 title/layoutMode/columnInputs 자동 채움, 이후 교사가 자유 편집 가능 (프리셋은 템플릿일 뿐 강제 아님)
- [ ] UI: 설정 > 쌤도구 섹션 (또는 프리셋 관리 모달) — 프리셋 이름 변경/삭제
- [ ] 마이그레이션: 기존 `tool-presets.json`을 읽을 때 새 type을 **몰랐던 이전 버전**이 손상시키지 않도록 unknown 타입은 보존(read-through)
- [ ] 단위 테스트: 프리셋 정규화(빈 컬럼 제거 등 `buildRealtimeBulletinColumns` 재사용) + 이름 유일성 검증

### 2.2 In Scope — Phase M2 (진행 중 세션 자동 저장/재개, v1.12.x 다음 마이너)

> 교사가 가장 크게 체감하는 안정성 향상. 여기부터는 IPC 신설이 필요하다.

- [ ] 도메인: `src/domain/entities/RealtimeBulletinSnapshot.ts` — `id(=boardId)/title/layoutMode/columns/posts[]/savedAt/sessionState('running'|'paused'|'ended')`
- [ ] 포트: `src/domain/ports/IRealtimeBulletinSnapshotPort.ts` — `saveSnapshot/loadSnapshot/listSnapshots/deleteSnapshot`
- [ ] 어댑터: `src/infrastructure/realtimeBulletin/FileBulletinSnapshotPersistence.ts` — `userData/data/bulletins/{id}.json` 경로
- [ ] IPC 신설 (M2용 4채널):
  - `realtime-bulletin:save-snapshot` (M→R 결과 반환) — debounced 30초 자동 저장 + 수동 저장
  - `realtime-bulletin:load-snapshot` — 특정 boardId 스냅샷 로드
  - `realtime-bulletin:list-snapshots` — 재개 가능 목록
  - `realtime-bulletin:delete-snapshot`
- [ ] `electron/main.ts` — `app.before-quit`에서 활성 보드 있으면 **동기 저장**(collab-board `endActiveBoardSessionSync` 패턴)
- [ ] UI: `CreateView` 진입 시 "진행 중이던 보드가 있어요. 이어서 열까요?" 배너 (loadSnapshot 가능할 때만)
- [ ] UI: "학생 참여 종료" 누르면 기존처럼 바로 종료 말고 "스냅샷 저장 후 보드 유지" vs "완전 종료(결과 보기)" 2버튼 다이얼로그
- [ ] 런타임: `ToolRealtimeBulletin.tsx` posts/columns 변경 시 debounced(3초) autosave 호출
- [ ] 테스트: snapshot 직렬화/역직렬화 무손실, 중단 복구 시나리오 (posts status 상태 보존, kanban/freeform 배치 보존)

### 2.3 In Scope — Phase M3 (보드 엔티티화 + 목록 UI, v1.13.x)

> collab-board 체계 미러링. M1·M2가 한 줄기로 들어오는 상위 레이어.

- [ ] 도메인: `src/domain/entities/BulletinBoard.ts` — `id/name/createdAt/updatedAt/lastSessionEndedAt/hasSnapshot/presetId?/layoutMode/columns/savedResultIds[]`
- [ ] 도메인: `src/domain/valueObjects/BulletinBoardId.ts` (collab-board `BoardId` 미러링)
- [ ] 도메인: `src/domain/repositories/IBulletinBoardRepository.ts` — list/get/create/rename/delete/update
- [ ] 어댑터: `src/adapters/repositories/FileBulletinBoardRepository.ts` — `userData/data/bulletin-boards.json` (메타) + `bulletins/{id}.json` (스냅샷, M2와 공유)
- [ ] IPC 신설 (M3용, collab-board 14채널 미러):
  - `realtime-bulletin:list` / `:create` / `:rename` / `:delete`
  - `realtime-bulletin:start-session` (snapshot 로드 → 세션 활성화 연계)
  - `realtime-bulletin:end-session`
  - `realtime-bulletin:get-active-session`
  - (M2의 save/load/list/delete-snapshot은 여기서 통합 사용)
- [ ] UI 신설: "실시간 게시판" 진입 시 지금의 CreateView 대신 **보드 목록 화면** (카드 리스트: 이름/레이아웃/마지막 수정/액션 3개)
  - [새 보드 만들기] 버튼 (→ CreateView로 이동, 생성 후 목록 복귀)
  - 카드 클릭 → 보드 상세(CreateView로 편집 or 세션 시작)
  - 이름 변경/삭제/복제 액션
  - 프리셋에서 빠르게 만들기 드롭다운
- [ ] UI: 보드 상세 화면에 "저장된 결과 N개" 링크 → 해당 보드의 과거 세션 결과 목록 (ToolResult와 연결, `boardId` 메타 추가 필요)
- [ ] 라우팅: `tool-realtime-bulletin`은 **목록 페이지**, 보드 편집/실행은 서브 상태(컴포넌트 내부 view state) — 전체 새 PageId 도입은 지양 (Sidebar 오염 방지)
- [ ] 마이그레이션: 기존 ToolResult의 `realtime-bulletin` 타입 결과에 `boardId` 없을 수 있음 → `boardId?` optional로 두고 고아 결과는 "분류되지 않은 세션" 섹션에 별도 표시

### 2.4 Out of Scope (전 구간)

- **여러 보드 동시 세션 실행**: 현재 `tunnel.ts` 싱글턴 + 포트 충돌로 불가. collab-board도 Out of Scope로 유지. 한 번에 하나의 보드만 라이브.
- **보드 공유/내보내기/가져오기**: `.ssampin` 같은 파일 포맷으로 다른 교사와 공유. Phase M4+ 후순위.
- **학생 계정/로그인 기반 보드 참여 히스토리**: 쌤핀은 PIPA 준수 위해 학생 계정 미보유. 유지.
- **보드 간 카드 이동/복사**: 한 보드의 카드를 다른 보드로 드래그. 사용 빈도 예측 낮아 후순위.
- **실시간 공동 편집**(여러 교사가 동시에 한 보드 관리): collab-board가 해당 영역 담당. 실시간 게시판은 교사 1인 주도 모델 유지.
- **버전 히스토리/되돌리기**(Undo 스택): posts 상태의 N단계 이전 복원. 복잡도 대비 효용 낮음.
- **프리셋 import/export**(JSON 파일로 주고받기): Phase M4+.

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Phase | Status |
|----|-------------|----------|-------|--------|
| FR-01 | 교사는 CreateView에서 현재 설정(제목/레이아웃/컬럼)을 "프리셋"으로 이름 붙여 저장할 수 있다 | High | M1 | Pending |
| FR-02 | 교사는 CreateView에서 저장된 프리셋을 선택해 설정을 즉시 채울 수 있다 | High | M1 | Pending |
| FR-03 | 교사는 프리셋을 이름 변경/삭제할 수 있다 | Medium | M1 | Pending |
| FR-04 | 진행 중인 실시간 게시판 세션은 **30초마다 자동 스냅샷 저장**된다 | High | M2 | Pending |
| FR-05 | posts/columns 변경 시 **debounced(3초) autosave**가 보조로 동작한다 | Medium | M2 | Pending |
| FR-06 | 앱 종료 시(`before-quit`) 활성 세션이 있으면 **동기 저장**으로 유실을 막는다 | High | M2 | Pending |
| FR-07 | 교사는 재진입 시 "이어서 열기" 다이얼로그로 이전 세션을 그대로 복구할 수 있다 (posts 상태/배치 포함) | High | M2 | Pending |
| FR-08 | "학생 참여 종료"는 "보드 유지(일시 정지)" vs "완전 종료(결과 저장 단계)" 분기 선택이다 | High | M2 | Pending |
| FR-09 | 실시간 게시판 진입 시 **보드 목록 화면**이 먼저 표시된다 (프로젝트 내 생성된 모든 보드) | High | M3 | Pending |
| FR-10 | 교사는 새 보드 생성/기존 보드 편집/이름 변경/삭제/복제가 가능하다 | High | M3 | Pending |
| FR-11 | 보드 상세에서 "이 보드의 과거 세션 결과" N개에 바로 접근할 수 있다 | Medium | M3 | Pending |
| FR-12 | 프리셋에서 빠르게 새 보드 만들기 (드롭다운 → 생성) | Medium | M3 | Pending |
| FR-13 | 기존 realtime-bulletin의 **모든 동작(학생 참여/승인/고정/숨김/보드 조작/결과 저장)** 은 1줄도 퇴행하지 않는다 | High | M1~M3 | Pending |
| FR-14 | 기존 저장된 ToolResult의 `realtime-bulletin` 결과는 `boardId` 없이도 계속 표시된다 | High | M3 | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| Performance | 보드 목록 로드 < 150ms (보드 50개 기준) | JSON 파일 크기 모니터링 + React 렌더 측정 |
| Performance | autosave가 UI 인터랙션(드래그/리사이즈)을 막지 않음 | 드래그 중 frame drop 없음 확인 |
| Reliability | 동기 저장(before-quit)이 10MB posts + 30개 카드에서 < 500ms | 수동 테스트 + 로그 |
| Data Integrity | 스냅샷 JSON 손상 시 백업에서 자동 복구 (기존 `data:read` 패턴) | 파일 삭제/손상 시나리오 테스트 |
| Compatibility | v1.11.x에서 저장된 `tool-presets.json`/ToolResult는 v1.12.x에서 **손실 없이 읽힘** | 기존 데이터 파일 로드 테스트 |
| UX | 프리셋 불러오기 → 세션 시작까지 클릭 수 **3회 이하** | 흐름 카운트 |
| Architecture | Clean Architecture 4-layer 규칙 준수 (domain 순수, usecases→domain만) | ESLint import rules + 수동 검토 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] Phase M1~M3 FR 전체 구현 + 각 Phase 독립 릴리즈 가능
- [ ] 기존 실시간 게시판 BETA 사용자가 v1.12.x 업그레이드 후 **데이터 손실 0건** (프리셋 마이그레이션, ToolResult 포맷 유지)
- [ ] 단위 테스트: 도메인 rules + repository CRUD + 스냅샷 직렬화 (80% 커버리지)
- [ ] 통합 테스트: 세션 중단 → 재개 시나리오, before-quit 동기 저장 시나리오
- [ ] `npx tsc --noEmit` EXIT=0, `npx vitest run` 전체 통과, `npm run electron:build` 성공
- [ ] 사용자 가이드(Notion) 업데이트, 챗봇 KB(`scripts/ingest-chatbot-qa.mjs`) 업데이트
- [ ] 릴리즈 노트 업데이트 (M1/M2/M3 각각)
- [ ] realtime-bulletin BETA 배지는 **M3 완료 시점에 제거** 검토 (기획자 결정)

### 4.2 Quality Criteria

- [ ] 테스트 커버리지 80%+ (도메인 rules/repository 계층)
- [ ] TypeScript 에러 0개, 린트 에러 0개
- [ ] Electron 메인 ↔ 렌더러 IPC 타입 안전성 100% (`global.d.ts` + `preload.ts` 동기)
- [ ] Gap Analysis Match Rate 90%+ (`/pdca analyze`)

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **IPC 채널 충돌**: collab-board 14채널과 realtime-bulletin 14채널이 비슷한 이름으로 혼선 | Medium | Medium | 네이밍 규칙 고정: `collab-board:*` vs `realtime-bulletin:*` prefix로 강제 분리. 통합 라우터 도입하지 않음. |
| **before-quit 동기 저장 교착**: collab-board가 이미 `endActiveBoardSessionSync` 사용 중. realtime-bulletin도 동일 훅 추가 시 순서/타임아웃 이슈 | High | Low | `main.ts`에서 **순차 호출**(collab 먼저, bulletin 다음). 각 핸들러 타임아웃 300ms cap. 실패해도 quit는 진행. |
| **tool-presets.json 스키마 확장 시 이전 버전 앱이 파일을 덮어씀** (다운그레이드 시 데이터 손실) | Medium | Low | 스키마 버전 필드 추가(`version: 2`). 이전 버전이 모르는 키/타입은 pass-through 읽기 (useToolPresetStore 수정 범위에 포함). |
| **스냅샷 파일이 너무 커짐**: 세션당 posts 수백 개 + 긴 링크/텍스트 | Medium | Medium | posts[]에 텍스트 280자 상한 이미 존재. boards/*.json 크기 모니터링 로그. 1MB 초과 시 경고 Toast. |
| **보드 목록 페이지 진입점 변경**: BETA 사용자는 지금 바로 CreateView에 익숙함 | Low | High | M3 첫 진입 시 "이제 여러 보드를 관리할 수 있어요!" 온보딩 Toast 1회. CreateView로 가는 경로는 [+ 새 보드 만들기] 1클릭. |
| **고아 ToolResult**: 기존 결과에 `boardId` 없음 | Low | High | 타입상 `boardId?` optional. UI에서 "분류되지 않은 세션" 섹션에 그대로 표시. 강제 마이그레이션 없음. |
| **프리셋/보드 이름 중복** | Low | Medium | UI 선에서만 경고(서버 검증 X). 사용자가 의도적으로 같은 이름 쓸 수도 있음(동명 수업). |
| **autosave가 드래그 중 re-render 유발** | Medium | Medium | debounce(3초) + `leading: false`. 드래그 진행 중이면 onDragEnd 이후로 미룸. |
| **collab-board와 동시 실행 충돌**: 두 도구 모두 tunnel.ts 싱글턴 공유 | High | Medium | 기존 패턴 그대로 재사용 — 한 번에 하나의 라이브 도구만 실행 가능. UI에서 "협업 보드 실행 중" Toast로 차단. |

---

## 6. Architecture Considerations

### 6.1 Project Level Selection

| Level | Characteristics | Recommended For | Selected |
|-------|-----------------|-----------------|:--------:|
| Starter | 단순 구조 | 정적 사이트 | ☐ |
| Dynamic | Feature-based modules | SaaS MVP | ☐ |
| **Enterprise** | Strict layer separation, DI | **ssampin 프로젝트의 기존 레벨** | ☑ |

**결정**: 기존 쌤핀이 Clean Architecture 4-layer(domain/usecases/adapters/infrastructure)를 따르므로 이번 기능도 동일 레이어링 준수. collab-board 패턴과 정합.

### 6.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| **프리셋 저장 위치** | (a) 기존 `tool-presets.json` 확장 / (b) 전용 `realtime-bulletin-presets.json` | **(a)** | 단일 진실원(single source) + useToolPresetStore 확장 최소. ToolPresetType에 `'realtime-bulletin-preset'` 추가. |
| **프리셋 `items` 구조** | 기존 `items: readonly string[]` 재사용 / 새 discriminated union | **새 discriminated union** | 프리셋은 이제 레이아웃 모드/컬럼 다건을 품어야 함. `items: string[]`로 우겨넣으면 의미 왜곡. `ToolPreset`을 `TextListPreset | BulletinPreset` union으로 승격. |
| **스냅샷 저장 경로** | `userData/data/bulletins/{id}.json` / 통합 `bulletin-boards.json` | **분리** | 세션당 수백 KB 가능. 통합 파일은 I/O 부담. collab-board도 `userData/data/boards/{id}.ybin`로 분리 중. |
| **보드 메타 저장 경로** | `bulletin-boards.json` 단일 / 보드별 개별 파일 | **단일 메타 + 개별 스냅샷** | 메타는 작음(수십 KB), 목록 로드 성능 유지. 스냅샷만 분리. |
| **autosave 트리거** | setInterval 30초 / debounced state change | **둘 다** | 30초 주기는 안전망, state change debounce(3초)는 빠른 반영. 중복 I/O는 마지막 write만 유효하므로 무해. |
| **보드 진입 UI 패턴** | 별도 Sidebar 항목 / 기존 `tool-realtime-bulletin` 내부 뷰 분기 | **내부 뷰 분기** | Sidebar 오염 방지. `ToolRealtimeBulletin.tsx`에 `viewMode: 'list' \| 'create' \| 'running' \| 'results'` 확장. |
| **IPC 네이밍** | collab-board 미러 / 독자 prefix | **`realtime-bulletin:*` prefix 고수** | 기존 5채널(`:start/:stop/:tunnel-*/:student-submitted/:connection-count`)과 연속성. collab-board `:list/:create/:rename/:delete/:start-session/:end-session/:get-active-session/:save-snapshot` 구조 그대로 네이밍 미러. |
| **결과(ToolResult)와 보드의 관계** | ToolResult에 `boardId` 필드 추가 / 별도 인덱스 테이블 | **ToolResult에 optional `boardId` 추가** | 최소 침습. `RealtimeBulletinResultData`에 `boardId?: string` 추가. 기존 결과는 optional이라 hydration 가능. |
| **State Management** | 신규 스토어 / 기존 스토어 확장 | **신규 3개 스토어** | `useRealtimeBulletinPresetStore`(M1), `useRealtimeBulletinBoardStore`(M3), `useRealtimeBulletinSessionStore`(M2 런타임 상태). 관심사 분리. |
| **Testing** | Vitest 유지 | **Vitest** | 프로젝트 표준. 도메인 rules부터 먼저. |

### 6.3 Clean Architecture Approach

```
Selected Level: Enterprise (기존)

새 파일 배치:
src/
├── domain/
│   ├── entities/
│   │   ├── RealtimeBulletinPreset.ts       [M1 신규]
│   │   ├── RealtimeBulletinSnapshot.ts     [M2 신규]
│   │   └── BulletinBoard.ts                [M3 신규]
│   ├── valueObjects/
│   │   └── BulletinBoardId.ts              [M3 신규]
│   ├── ports/
│   │   └── IRealtimeBulletinSnapshotPort.ts[M2 신규]
│   ├── repositories/
│   │   ├── IRealtimeBulletinPresetRepository.ts [M1]
│   │   └── IBulletinBoardRepository.ts     [M3 신규]
│   └── rules/
│       └── realtimeBulletinRules.ts        [기존 — 확장 함수 추가: buildPresetFromConfig 등]
│
├── usecases/
│   └── realtimeBulletin/
│       ├── ManagePresets.ts                [M1]
│       ├── SaveBulletinSnapshot.ts         [M2]
│       ├── LoadBulletinSnapshot.ts         [M2]
│       ├── ResumeBulletinSession.ts        [M2]
│       ├── ManageBulletinBoard.ts          [M3]
│       └── StartBulletinBoardSession.ts    [M3 — M2 snapshot과 연계]
│
├── adapters/
│   ├── repositories/
│   │   ├── JsonRealtimeBulletinPresetRepository.ts [M1]
│   │   └── FileBulletinBoardRepository.ts  [M3]
│   ├── stores/
│   │   ├── useRealtimeBulletinPresetStore.ts [M1]
│   │   ├── useRealtimeBulletinBoardStore.ts  [M3]
│   │   └── useRealtimeBulletinSessionStore.ts[M2]
│   └── components/Tools/RealtimeBulletin/
│       ├── BulletinBoardList.tsx           [M3 신규 — 목록 뷰]
│       ├── PresetPicker.tsx                [M1 신규 — CreateView 내부 드롭다운]
│       ├── PresetManagerModal.tsx          [M1 신규]
│       ├── ResumeSessionBanner.tsx         [M2 신규]
│       └── EndSessionDialog.tsx            [M2 신규 — 유지/완전종료 선택]
│
└── infrastructure/
    └── realtimeBulletin/
        └── FileBulletinSnapshotPersistence.ts [M2 신규]

electron/ipc/
└── realtimeBulletin.ts                     [기존 — IPC 채널 대거 추가]

수정 파일(기존):
- src/adapters/components/Tools/ToolRealtimeBulletin.tsx  (뷰 모드 확장)
- src/domain/entities/ToolResult.ts                        (boardId? 추가)
- src/domain/entities/ToolPreset.ts                        (discriminated union 승격)
- src/adapters/stores/useToolPresetStore.ts                (새 type 처리)
- src/global.d.ts, electron/preload.ts                     (IPC 타입/브릿지 확장)
- electron/main.ts                                         (before-quit 훅 추가)
```

의존성 규칙은 기존 CLAUDE.md 규칙 그대로 준수:
- `domain/` ← 아무도 import 안 함
- `usecases/` → `domain/`만
- `adapters/` → `domain/` + `usecases/`
- `infrastructure/` → `domain/` (포트 구현만)
- `adapters/di/container.ts` → infrastructure DI 조립 지점

---

## 7. Convention Prerequisites

### 7.1 Existing Project Conventions

- [x] `CLAUDE.md` 코딩 컨벤션 섹션 존재
- [x] TypeScript strict 모드 적용 중
- [x] Path Alias (`@domain/*`, `@usecases/*`, `@adapters/*`, `@infrastructure/*`)
- [x] ESLint 설정
- [x] 기존 Repository 패턴(`JsonScheduleRepository` 등)

### 7.2 Conventions to Define/Verify

| Category | Current State | To Define | Priority |
|----------|---------------|-----------|:--------:|
| **IPC 채널 네이밍** | 기존: `realtime-bulletin:start/stop/...` | `realtime-bulletin:list/create/rename/delete/start-session/end-session/get-active-session/save-snapshot/load-snapshot/list-snapshots/delete-snapshot` 추가 | High |
| **파일 경로 규약** | `userData/data/{name}.json` | `userData/data/bulletin-boards.json` + `userData/data/bulletins/{id}.json` | High |
| **스키마 버전 필드** | 기존 파일엔 version 없음 | 신규 파일부터 `version: 1` 필드 도입, 기존 파일은 "없으면 v1"으로 간주 | High |
| **ID 생성** | 기존 `generateUUID()` 사용 | 동일 사용 (`@infrastructure/utils/uuid`) | - |
| **한국어 UI 문구 스타일** | CLAUDE.md 명시, 모든 UI 한국어 | 신규 문구도 동일 (친근+담백) | - |

### 7.3 Environment Variables Needed

별도 환경 변수 필요 없음. 모든 기능 로컬 파일 I/O로 해결.

### 7.4 Pipeline Integration

이번 기능은 Clean Architecture 기존 레이어 확장이며 9-phase pipeline 전체는 과함.
- Phase 1 (Schema) → 새 entities/ports/repositories 정의로 대체
- Phase 2 (Convention) → §7.2로 대체
- Phase 3~9 → 기능 단위 구현으로 직진

---

## 8. Phase별 구현 로드맵

### Phase M1 — 프리셋 (1~2일 예상)
1. `ToolPreset`을 discriminated union으로 승격 (기존 타입 호환 유지)
2. `RealtimeBulletinPreset` 엔티티 + 도메인 규칙 추가
3. `useToolPresetStore` 확장 (또는 신규 `useRealtimeBulletinPresetStore`)
4. `CreateView`에 PresetPicker 드롭다운 + "프리셋으로 저장" 버튼
5. PresetManagerModal (목록/이름변경/삭제)
6. 단위 테스트

### Phase M2 — 자동 저장/재개 (3~5일 예상)
1. `RealtimeBulletinSnapshot` 엔티티 + `IRealtimeBulletinSnapshotPort`
2. `FileBulletinSnapshotPersistence` (Electron 어댑터)
3. IPC 4채널 신설 + preload/global.d.ts 동기
4. `ToolRealtimeBulletin.tsx`에 30초 interval + 3초 debounce autosave 훅
5. `main.ts` before-quit 훅 추가 (collab-board 뒤 순차)
6. UI: ResumeSessionBanner, EndSessionDialog
7. 중단/복구 시나리오 통합 테스트

### Phase M3 — 보드 엔티티화 + 목록 UI (5~7일 예상)
1. `BulletinBoard` 엔티티 + `BulletinBoardId` VO + `IBulletinBoardRepository`
2. `FileBulletinBoardRepository` + 사용 사례 (ManageBulletinBoard, StartBulletinBoardSession)
3. IPC 8채널 추가(`:list/:create/:rename/:delete/:start-session/:end-session/:get-active-session` + M2 `:save-snapshot`과 통합 재사용)
4. `useRealtimeBulletinBoardStore`
5. `ToolRealtimeBulletin.tsx`에 `viewMode: 'list'` 추가 + `BulletinBoardList.tsx` 구현
6. 라우팅: 진입 시 목록이 기본. "새 보드" 눌러야 CreateView로
7. 보드 상세 → 세션 시작 → 종료 → 결과 저장 전체 플로우 통합 (M2 스냅샷과 완전 연결)
8. ToolResult에 `boardId?` 추가 + 고아 결과 섹션 처리
9. 마이그레이션 검증 + 사용자 가이드 업데이트

---

## 9. Red Flags (방향 어긋남 감지)

- ❌ `tool-realtime-bulletin` 외에 새로운 Sidebar PageId 추가 (예: `tool-realtime-bulletin-manage`)
- ❌ collab-board 코드를 직접 import해서 공유 (두 도구는 엔티티/저장 경로/IPC prefix 모두 독립)
- ❌ realtime-bulletin 기존 5채널 IPC 이름 변경 (하위 호환 깨짐)
- ❌ 기존 `tool-presets.json` 포맷을 **파괴적**으로 변경 (이전 버전 다운그레이드 시 crash)
- ❌ before-quit 저장을 비동기로 (Electron quit 가속 시 데이터 유실)
- ❌ autosave가 React 상태를 과도하게 트리거해 드래그 중 끊김 발생
- ❌ 보드 목록 화면에서 "한 번 클릭에 바로 세션 시작"이 안 되는 3단계 이상 경로
- ❌ 각 Phase를 한 번에 몰아 릴리즈 (M1 단독 릴리즈 가능해야 함)

---

## 10. 한 줄 결론

실시간 게시판의 관리 기능은 **"프리셋(M1) → 자동 저장/재개(M2) → 보드 엔티티화(M3)"** 순으로 단계적으로 쌓으며, **collab-board의 14채널 IPC 패턴과 useToolPresetStore 확장 패턴을 미러링**해 최소 설계 비용으로 "여러 개 개설 + 저장 + 수정관리" 3축을 모두 확보한다. BETA 배지는 M3 완료 시점에 제거 검토한다.

---

## 11. Next Steps

1. [ ] 이 계획서에 대한 사용자 리뷰/승인
2. [ ] `/pdca design realtime-bulletin-management` — M1·M2·M3의 상세 설계 문서 작성 (IPC 채널 signature, 엔티티 필드 확정, UI 컴포넌트 시그니처)
3. [ ] Phase M1 Do 진입 — 프리셋부터 구현·테스트·릴리즈
4. [ ] 각 Phase 완료마다 `/pdca analyze realtime-bulletin-management` Match Rate 측정 → 90%↑ 시 다음 Phase

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-21 | 초안 작성 (M1 프리셋 / M2 자동저장·재개 / M3 보드 엔티티화 3-Phase 로드맵 수립, collab-board 미러링 패턴 확정) | pblsketch |
