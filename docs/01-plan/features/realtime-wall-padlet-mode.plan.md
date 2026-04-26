---
template: plan
version: 0.1
feature: realtime-wall-padlet-mode
date: 2026-04-24
author: cto-lead (consult: product-manager / frontend-architect / security-architect / infra-architect)
project: ssampin
version_target: v1.14.x (BREAKING — 학생 노출 정책 전면 전환)
parents:
  - docs/01-plan/features/realtime-wall.plan.md
  - docs/01-plan/features/realtime-wall-v1.13-enhancement.plan.md
  - docs/01-plan/features/realtime-wall-management.plan.md
related_design: docs/02-design/features/realtime-wall-padlet-mode.design.md
---

# 쌤핀 실시간 담벼락 — 패들렛 모드 (학생·교사 통합 뷰) 기획안

> **요약**: 실시간 담벼락의 기본 동작을 **"학생 제출 전용"** 에서 **"학생·교사가 동일한 보드 뷰를 공유하는 패들렛 스타일"** 로 전환한다. 학생도 Kanban/Freeform/Grid/Stream 4 레이아웃에서 다른 학생의 카드를 보고, 카드를 직접 추가하고, 좋아요·댓글로 상호작용한다. 교사는 학생과 동일한 뷰를 보되 설정/큐레이션 권한을 오버레이로 갖는다.
>
> **핵심 결정 (사용자 사전 확정)**:
> 1. **공개 범위**: 전면 전환. 기존 "학생 제출 전용" 정책은 폐기. 모든 WallBoard가 패들렛 모드 기본. (BETA 전환 수용)
> 2. **좋아요·댓글 저장**: 영속 + 익명. WallBoard 스냅샷 안에 likes/likedBy(sessionToken[])/comments[] 서브필드 적재. (M2 스냅샷 포맷과 호환)
> 3. **부적절 콘텐츠 실시간 방지**: 보류. 본 Phase 비범위. 당장은 manual 승인 + 교사 hidden 전환이 유일한 안전장치 — Red Flag로 명시.
> 4. **팀 구성**: CTO-Lead 오케스트레이션. product-manager → frontend-architect → security-architect → infra-architect 순차 자문, qa-strategist는 §10에서 테스트 전략 자문.
> 5. **교사·학생 동일 뷰 원칙**: 학생도 교사와 같은 보드 화면을 본다. 차이는 오로지 **교사 오버레이 권한**(설정 드로어, 카드 hidden/pinned, 대기열 승인, teacherHearts, 학생 연결 현황, QR 공유 패널) 뿐.
>
> **Project**: ssampin (쌤핀)
> **Version**: v1.13.x (현재 BETA, 4 레이아웃 + 큐레이션 완성) → **v1.14.x (BREAKING: 패들렛 모드)**
> **Author**: cto-lead
> **Date**: 2026-04-24
> **Status**: Draft

---

## 1. Overview

### 1.1 Purpose

쌤핀 실시간 담벼락은 v1.13에서 영속 WallBoard 엔티티 + 4 레이아웃 + 교사 큐레이션을 완성했다. 그러나 학생 화면은 여전히 **단일 입력 폼**(닉네임 + 본문 + 링크 1개)이며, 다른 학생의 카드/좋아요/댓글을 일절 볼 수 없다. 이는 v1.13 전까지의 정책 — `electron/ipc/realtimeWallHTML.ts:1-21`에 하드코딩된 "학생 HTML 절대 노출 금지" 5종 — 의 결과다.

이 정책의 의도(부적절 콘텐츠 차단·교사 큐레이션 보존)는 합리적이었으나, FGI(2026-04-23)와 패들렛 사용자 경험 비교 결과 **"보드의 사회적 가치"** 가 결락된 것이 패들렛 이탈을 막는 최대 결점으로 지목되었다. 학생이 **다른 학생의 의견을 즉시 보고 반응할 수 있는 환경**이 되어야 토론·발표·아이디어 수합 시나리오가 비로소 완성된다.

본 기획은 학생 뷰를 **교사와 동일한 보드 뷰로 격상**하면서, 교사만 쥐는 **큐레이션 권한**을 오버레이 형태로 분리해 **"패들렛의 개방성 + 쌤핀의 교사 통제권"** 두 마리 토끼를 함께 잡는다.

### 1.2 Background

- **현재 상태(2026-04-24)**: realtime-wall v1.13.x BETA. WallBoard 영속화 + 4 레이아웃 + 승인 정책(manual/auto) + 컬럼 편집 + 보드 복제 + teacherHearts 모두 완성. `feature/realtime-wall` 브랜치 11 커밋, 285/285 tests, Match Rate ~95%+.
- **학생 HTML 정책**: `electron/ipc/realtimeWallHTML.ts:1-21` 하드코딩 정책. 본 Plan 문서가 "PDCA 명시 동의"의 근거가 되어 정책 주석을 패들렛 모드로 업데이트해야 한다 (Phase P1 Convention Prerequisite §7.2).
- **교사 UI**: `src/adapters/components/Tools/RealtimeWall/` 13개 컴포넌트 — Kanban/Freeform/Grid/Stream 4 보드 + Card/Actions + LiveSharePanel + 2개 Drawer + QueuePanel + ResultView + ColumnEditor + ListView/Thumbnail. **이들이 학생 뷰에서 재사용될 수 있도록 isReadOnlyForTeacherOnly 같은 권한 prop 도입**이 핵심 리팩터링.
- **WebSocket**: `electron/ipc/realtimeWall.ts` 289L. 현재 5종 메시지 (`join`/`submit`/`submitted`/`closed`/`already_submitted`)만. 패들렛 모드는 **양방향 브로드캐스트**가 필수 — 좋아요/댓글/카드 추가/hidden 전환 등.
- **저장 호환**: realtime-wall-management M2 스냅샷 포맷 (`userData/data/bulletins/{id}.json`)이 v1.13에서 `userData/data/wall-board-{id}.json`으로 안착. 본 Plan은 이 포맷에 likes/likedBy/comments 서브필드를 **추가만** 한다. 기존 데이터는 손실 없이 읽혀야 함.

### 1.3 Related Documents

- 상위 기능 계획: [`docs/01-plan/features/realtime-wall.plan.md`](realtime-wall.plan.md) — v1.10~v1.13 base
- 직전 기능 계획: [`docs/01-plan/features/realtime-wall-v1.13-enhancement.plan.md`](realtime-wall-v1.13-enhancement.plan.md) — WallBoard 엔티티 + 4 MUST 정의
- 직전 설계서: [`docs/02-design/features/realtime-wall-v1.13-enhancement.design.md`](../../02-design/features/realtime-wall-v1.13-enhancement.design.md) — `WallBoard`/`WallBoardMeta`/`WallApprovalMode` 엔티티 정의 (본 Plan은 이 위에 누적)
- 관리 기능 계획: [`docs/01-plan/features/realtime-wall-management.plan.md`](realtime-wall-management.plan.md) — M2 스냅샷 포맷 (본 Plan §6 호환성 절대 보장)
- 학생 노출 정책 원본: [`electron/ipc/realtimeWallHTML.ts:1-21`](../../../electron/ipc/realtimeWallHTML.ts) — 본 Plan이 정책 폐기·재작성의 근거 문서
- 교사 UI 컴포넌트 트리: `src/adapters/components/Tools/RealtimeWall/` — 13개 파일 전체 리팩터링 대상

---

## 2. Scope

본 Feature는 한 번에 모두 릴리즈하지 않고 **3 Phase로 나누어 단계적 검증**한다. 각 Phase는 독립 릴리즈 가능해야 한다.

### 2.1 In Scope — Phase P1 (학생 뷰 대칭화 — Read-Only 패들렛, v1.14.0)

> 가장 적은 보안·성능 위험으로 "학생도 다른 카드 본다"의 핵심 가치를 1차 검증한다. 좋아요/댓글은 P2.

- [ ] 정책 폐기 선언 — `electron/ipc/realtimeWallHTML.ts:1-21` 주석 패들렛 모드로 재작성
- [ ] 학생 뷰 컴포넌트 트리 신설 — 교사 컴포넌트(`RealtimeWallKanbanBoard` 등 4종)를 **`StudentRealtimeWallView`** 라는 컨테이너에서 `isStudent: true` prop으로 재사용
- [ ] 학생 HTML 폐지 → React SPA 번들로 교체 (§6.2 Architecture Decision)
- [ ] WebSocket 브로드캐스트 신설:
  - `wall-state` (서버→전체): 보드 초기 스냅샷 + 매 변경마다 차분 push
  - `post-added` (서버→전체): 새 카드 승인되면 전체에게 push
  - `post-updated` (서버→전체): pinned/hidden 상태 변경 push
  - `post-removed` (서버→전체): 카드 영구 삭제 시
- [ ] 학생 뷰는 **읽기 전용** (P1 한정): 카드 보기 + 레이아웃 따라 카드 위치 동기화. 카드 추가는 기존 폼 그대로 별도 영역
- [ ] 마이그레이션: 기존 WallBoard 데이터 손실 0건, schema version bump 없음 (likes/comments는 P2부터)
- [ ] 도메인 규칙: 변경 없음 (P1은 UI/IPC 레이어 작업)
- [ ] Release note에 **BREAKING** 명시: "학생도 이제 다른 학생의 카드를 봅니다. 부적절 콘텐츠 차단은 교사의 hidden 전환 + manual 승인 모드 활용을 권장합니다."

### 2.2 In Scope — Phase P2 (학생 상호작용 — 좋아요·댓글, v1.14.x 다음 마이너)

> P1 완료 후 BETA 피드백 수렴 후 진입. 좋아요/댓글의 영속화·동기화·익명 식별 모두 신설.

- [ ] 도메인 엔티티 확장:
  - `RealtimeWallPost.likes?: number` (집계, 익명 카운트)
  - `RealtimeWallPost.likedBy?: readonly string[]` (sessionToken 배열, 중복 누름 방지)
  - `RealtimeWallPost.comments?: readonly RealtimeWallComment[]` (신규 엔티티)
- [ ] 신규 엔티티: `RealtimeWallComment { id, postId, nickname, text, createdAt, sessionToken }`
- [ ] 도메인 규칙 신설:
  - `toggleStudentLike(post, sessionToken)` → 같은 sessionToken이 다시 누르면 unlike
  - `addStudentComment(post, input, sessionToken)` → 댓글 검증·추가
  - `removeStudentComment(post, commentId)` → 교사 권한 (오버레이)
- [ ] WebSocket 메시지 추가:
  - `like-toggle` (학생→서버, 서버→전체): postId + sessionToken
  - `comment-add` (학생→서버, 서버→전체): postId + nickname + text + sessionToken
  - `comment-remove` (교사→서버, 서버→전체): postId + commentId (교사만)
- [ ] 학생 뷰: 카드에 좋아요 버튼 + 댓글 토글 + 댓글 목록 표시
- [ ] 교사 뷰: 카드 우상단 오버레이에 "댓글 N개 / 좋아요 N개" 카운터 + 댓글 삭제 권한
- [ ] 마이그레이션: 기존 post에 likes/likedBy/comments **없으면 기본값 주입** (likes: 0, likedBy: [], comments: [])
- [ ] teacherHearts와 명확히 구분: teacherHearts는 교사 오버레이 권한 유지(rose 색상), 학생 likes는 별도 색상(sky 또는 emerald)
- [ ] 페이로드 크기 상한: 댓글 텍스트 200자, 한 카드당 댓글 최대 50개 (도메인 규칙으로 강제)
- [ ] Rate limit: sessionToken당 좋아요 분당 30회, 댓글 분당 5개 (서버 측 IP+sessionToken 키)

### 2.3 In Scope — Phase P3 (학생 카드 추가의 패들렛화, v1.14.x 후속)

> 학생이 "별도 폼 페이지"가 아니라 **보드 화면 안에서 직접** "+카드 추가" 버튼으로 카드를 만드는 패들렛 정통 UX. P1+P2의 동기화 인프라 위에서만 의미 있음.

- [ ] 학생 뷰 보드 좌하단(또는 적절한 위치)에 "+ 카드 추가" FAB 버튼
- [ ] 클릭 시 인라인 카드 입력 모달(닉네임 + 본문 + 링크) — 기존 학생 폼 재사용
- [ ] 제출 시 기존 `submit` WebSocket 메시지 그대로 → 승인 모드에 따라 pending 또는 즉시 approved
- [ ] approvalMode='auto'일 때: 카드 즉시 보드에 등장 (애니메이션 강조)
- [ ] approvalMode='manual'일 때: 학생에게 "검토 중입니다" 표시, 승인되면 wall-state push로 등장
- [ ] 1 sessionToken = 1 카드 제한은 **유지** (현재 정책 — `electron/ipc/realtimeWall.ts:155-160`). 학생 1인 다중 카드 허용은 **별도 Phase P4 후속 논의**
- [ ] 학생 폼 별도 페이지를 보드 뷰 내부 모달로 대체 → URL 진입 즉시 보드가 보임

### 2.4 Out of Scope (전 Phase)

- **부적절 콘텐츠 실시간 필터링** (사용자 결정 #3): 한국어 욕설/개인정보 사전·정규식·LLM 호출. 본 Phase 범위 아님. **Future Work §11.3에 분리 기록**.
- **학생 1인 다중 카드 허용**: 1 sessionToken = 1 카드 제한 유지. P4+ 후속.
- **학생 카드 편집/삭제 권한**: 학생은 자기 카드도 수정 불가. 교사 hidden/삭제만 가능. (대규모 수업 신뢰성 우선)
- **학생 카드 위치 드래그**: freeform 모드에서 학생이 자기 카드를 드래그해 위치 잡기. P5+ 후속.
- **학생 별명 변경/계정**: 매 세션 익명 닉네임 입력 유지. 계정 시스템 도입 X (PIPA 준수).
- **댓글에 좋아요/대댓글**: 댓글은 평면 구조. 1단계만.
- **이미지/영상/음성 업로드**: 링크 미리보기만. v1.13 정책 그대로.
- **학생 뷰 다크 모드 토글**: 교사 화면과 동일한 sp-bg(#0a0e17) 다크 베이스 유지.
- **모바일 전용 PWA**: 학생은 일반 브라우저로 cloudflared 터널 URL 접속. PWA installable 메타 추가는 P5+.

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Phase | Status |
|----|-------------|----------|-------|--------|
| FR-01 | 학생은 cloudflared 터널 URL 접속 시 즉시 **현재 보드 상태**(승인된 모든 카드, 레이아웃 그대로)를 본다 | High | P1 | Pending |
| FR-02 | 학생 뷰는 교사가 사용하는 4 레이아웃(Kanban/Freeform/Grid/Stream)과 **동일 컴포넌트**로 렌더된다 | High | P1 | Pending |
| FR-03 | 교사가 카드를 승인하면 **모든 학생 화면에 0.5초 이내 반영**된다 (WebSocket push) | High | P1 | Pending |
| FR-04 | 교사가 카드를 hidden/삭제로 전환하면 **모든 학생 화면에서 즉시 제거**된다 | High | P1 | Pending |
| FR-05 | 교사가 카드를 pinned 토글하면 **학생 화면에도 핀 표시**가 동기화된다 | Medium | P1 | Pending |
| FR-06 | 학생은 카드의 좋아요 버튼을 누를 수 있고, 같은 sessionToken은 **재누름 시 unlike** | High | P2 | Pending |
| FR-07 | 학생 좋아요 카운트는 **모든 화면에 실시간 동기화**된다 | High | P2 | Pending |
| FR-08 | 학생은 카드 댓글을 200자 이내로 작성할 수 있다 | High | P2 | Pending |
| FR-09 | 댓글은 **카드별 최대 50개** 도메인 규칙으로 강제된다 | High | P2 | Pending |
| FR-10 | 교사는 모든 학생 댓글을 삭제할 수 있다 (교사 오버레이 권한) | High | P2 | Pending |
| FR-11 | 학생 좋아요·댓글은 WallBoard 스냅샷에 **영속**되며 보드 재열기 시 복원된다 | High | P2 | Pending |
| FR-12 | teacherHearts는 학생 likes와 **시각적·필드명·색상** 모두 분리되어 표시된다 | High | P2 | Pending |
| FR-13 | 학생은 보드 화면 내 "+ 카드 추가" FAB로 즉석 카드를 만들 수 있다 | High | P3 | Pending |
| FR-14 | approvalMode='auto'일 때 학생 카드 즉시 보드에 등장 + 등장 애니메이션 강조 | Medium | P3 | Pending |
| FR-15 | approvalMode='manual'일 때 학생에게 "검토 중" 표시 + 승인 후 자동 등장 | High | P3 | Pending |
| FR-16 | 1 sessionToken = 1 카드 제한 **유지** (P1~P3 전 구간) | High | P1~P3 | Pending |
| FR-17 | 교사 전용 권한 8종(§5)이 학생 화면에 절대 노출되지 않음 | High | P1~P3 | Pending |
| FR-18 | 기존 v1.13.x WallBoard 데이터(likes/comments 없는 post)는 P2 진입 후 **기본값 주입**으로 무손실 로드 | High | P2 | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| Performance | WebSocket 브로드캐스트 평균 latency < 200ms (학생 50명 기준) | 클라이언트 timestamp 측정 + 로그 |
| Performance | 학생 뷰 초기 로드 < 1.5s (cloudflared 터널, 보드 카드 50장 기준) | Lighthouse + 수동 측정 |
| Performance | 좋아요 토글 후 모든 클라이언트 반영 < 500ms | timestamp 측정 |
| Scalability | 한 보드에서 학생 동시 접속 100명까지 안정 (브로드캐스트 fan-out) | 부하 테스트 (Node.js ws) |
| Reliability | WebSocket 연결 끊김 시 자동 재연결 (exponential backoff, 최대 5회) | 수동 네트워크 차단 테스트 |
| Reliability | 학생 댓글/좋아요 영속화 무손실 — before-quit/세션 종료 시 디스크 fsync | iter #5 교훈: fs.stat 검증 |
| Security | 모든 학생 입력은 서버에서 escape 후 broadcast (XSS 차단) | 페이로드 fuzz 테스트 |
| Security | sessionToken은 학생 브라우저에서만 생성, 서버 신뢰 안 함 (스푸핑 가능 전제로 1 카드 제한은 best-effort) | 위협 모델 §6.4 |
| Security | rate limit: 좋아요 30/분, 댓글 5/분, 카드 1/세션 (도메인 규칙 + WebSocket 핸들러 강제) | 통합 테스트 |
| Compatibility | v1.13.x WallBoard 데이터는 v1.14.x에서 **손실 없이 읽힘** | 기존 데이터 파일 로드 테스트 |
| UX | 교사·학생 화면이 같은 카드를 보여줄 때 **시각적 차이는 권한 오버레이뿐** (위치/크기/배경/내용 동일) | 디자인 QA + 스크린샷 비교 |
| UX | 학생이 댓글 작성 → 보드 다른 화면에서 보일 때까지 **로딩 인디케이터 없이 부드러운 등장** | 수동 UX 테스트 |
| Architecture | Clean Architecture 4-layer 규칙 준수 (domain 순수, usecases→domain만) | ESLint import rules + 수동 검토 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] Phase P1~P3 FR 전체 구현 + 각 Phase 독립 릴리즈 가능
- [ ] 기존 v1.13.x BETA 사용자가 v1.14.x 업그레이드 후 **WallBoard 데이터 손실 0건**
- [ ] 단위 테스트: 도메인 규칙 80% 커버리지 + 새 규칙(toggleStudentLike/addStudentComment 등)당 5케이스 이상
- [ ] 통합 테스트: WebSocket 브로드캐스트 (1 보드 + 10 클라이언트 시나리오)
- [ ] 부하 테스트: 100 동시 학생 접속에서 latency < 200ms 유지 (P1 완료 시점)
- [ ] `npx tsc --noEmit` EXIT=0, `npx vitest run` 전체 통과, `npm run electron:build` 성공
- [ ] 사용자 가이드(Notion) 업데이트 — "학생도 이제 다른 카드를 봅니다" 안내 + 부적절 콘텐츠 대응 가이드
- [ ] 챗봇 KB(`scripts/ingest-chatbot-qa.mjs`) 업데이트 — 패들렛 모드 Q&A
- [ ] 릴리즈 노트 BREAKING 표시 + 부적절 콘텐츠 보류 안내 + 권장 운영 가이드(승인 모드 manual + 교사 hidden 전환)
- [ ] **realtime-wall BETA 배지 제거 검토**는 P3 완료 시점

### 4.2 Quality Criteria

- [ ] 테스트 커버리지 80%+ (도메인 규칙 + 새 IPC 핸들러)
- [ ] TypeScript 에러 0개, 린트 에러 0개
- [ ] Electron 메인 ↔ 렌더러 IPC 타입 안전성 100% (`global.d.ts` + `preload.ts` 동기)
- [ ] WebSocket 메시지 타입 양방향 type-safe (Zod 또는 discriminated union — Design §4 결정)
- [ ] Gap Analysis Match Rate 90%+ (`/pdca analyze`)

---

## 5. 교사 전용 권한 목록 (Padlet 원칙: 학생 비노출 절대)

본 표는 **학생 화면에서 절대 보이지 않아야 하는 8종 교사 권한**을 명시한다. Design §6에서 컴포넌트별 prop 매핑으로 강제.

| # | 권한 | 표면(UI) | 동기화 방향 |
|---|------|---------|------------|
| 1 | 카드 승인/거부 | 대기열(QueuePanel) — pending 카드 일괄 검토 | 교사→서버, 서버→전체 (post-added) |
| 2 | 카드 hidden 전환 | 카드 우상단 호버 액션(visibility_off) | 교사→서버, 서버→전체 (post-updated 또는 post-removed) |
| 3 | 카드 pinned 토글 | 카드 우상단 호버 액션(push_pin) | 교사→서버, 서버→전체 (post-updated) |
| 4 | teacherHearts +1 | 카드 우하단 하트 카운터(rose) | 교사 로컬, 서버 영속 (학생 화면에는 카운터만 read-only 표시 옵션 — Design §5.3에서 토글 결정) |
| 5 | 댓글 삭제 | 댓글 우측 휴지통 아이콘 (학생 자신 댓글에도 가능) | 교사→서버, 서버→전체 (comment-remove) |
| 6 | 보드 설정 변경 | 톱니 아이콘 → 설정 드로어 (제목/레이아웃/컬럼/승인모드) | 교사 로컬 + WallBoard 저장 |
| 7 | 학생 연결 현황 표시 | LiveSharePanel 우상단 "참여 N명" | 서버→교사 (connection-count) |
| 8 | QR/URL 공유 패널 | LiveSharePanel — shortCode/QR 표시 | 교사 로컬 |

**구현 강제 방법** (Design §6.2 상세):
- `RealtimeWallCardProps`에 `viewerRole: 'teacher' | 'student'` prop 추가
- `viewerRole === 'student'`일 때 `actions` 슬롯, `onTogglePin`, `onHide`, `onTeacherHeart` 모두 무시
- 컴포넌트 내부에서 conditional render — 권한 표면 자체가 학생 DOM에 없음 (CSS hidden 의존 금지)

---

## 6. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **부적절 콘텐츠가 학생에게 즉시 노출** (필터링 보류) | High | Medium | (a) 기본 approvalMode 'manual' 유지, (b) 교사 hidden 즉시 전체 동기화, (c) 릴리즈 노트·사용자 가이드에 권장 운영 명시, (d) **Red Flag로 기록 §10**, (e) 향후 Phase P4+로 필터링 분리 |
| **교사·학생 동일 뷰 전환 충격** — 기존 BETA 사용자가 "학생이 다른 카드 본다"에 놀람 | Medium | High | (1) Release note BREAKING 명시, (2) 첫 진입 시 1회 교사용 안내 모달 "이제 학생도 보드를 함께 봅니다", (3) v1.13.x로 다운그레이드 경로 안내 |
| **WebSocket 브로드캐스트 부하** — 100명 학생 + 분당 좋아요 30회 = 3000 msg/min/board | Medium | Medium | (1) Server-side debounce: 같은 post의 like 토글은 100ms 윈도우 내 합쳐서 1회 push, (2) wall-state는 차분 push (added/updated/removed만, 전체 스냅샷 X), (3) 부하 테스트 필수 (100 클라이언트) |
| **WallBoard 스냅샷 호환성 깨짐** — likes/comments 추가 시 v1.13.x 로더가 미인식 필드 | Medium | Low | (1) optional 필드만 추가, (2) loader에 default 주입 (Design §8 마이그레이션), (3) schema version bump는 P3 완료 시점 검토 (v1.14.0 시작은 version 변경 없음) |
| **sessionToken 스푸핑** — 학생이 토큰 리셋해 무한 카드 추가 | Medium | High | (1) 1 카드 제한은 best-effort 인정, (2) IP+UA 보조 키로 rate limit 강화, (3) 교사가 hidden으로 즉시 대응 가능, (4) 위협 모델 §6.4 명시 |
| **댓글 XSS** — 학생 입력이 다른 학생 화면에 그대로 표시 | High | Medium | (1) 서버에서 `escapeHtml` 적용 후 broadcast, (2) React 자동 escape 신뢰 + `dangerouslySetInnerHTML` 절대 금지, (3) Content-Security-Policy 메타 태그 명시 |
| **학생 댓글 봇/스팸** — 자동화 도구로 댓글 폭격 | Medium | Low | (1) Rate limit 5/분, (2) 댓글 200자 상한, (3) 카드당 50개 상한, (4) 교사 일괄 hidden/삭제 권한, (5) cloudflared 터널 URL은 본질적으로 비공개라 봇 발견 자체가 어려움 |
| **학생 뷰 SPA 번들 크기** — 교사 컴포넌트 재사용 시 전체 React 앱이 cloudflared로 배포됨 | Medium | Medium | (1) 학생 진입점 별도 entry point + tree-shaking, (2) 교사 전용 컴포넌트(QueuePanel/Drawer 등)는 lazy-load 또는 entry 분리, (3) Design §6.4 번들 분리 전략 명시 |
| **WebSocket 재연결 폭주** — 와이파이 불안정한 학생 다수가 동시 재연결 | Medium | Medium | (1) Exponential backoff (1s, 2s, 4s, 8s, 16s), (2) 5회 실패 시 사용자에게 명시 메시지 "선생님께 알려주세요", (3) 서버는 동일 sessionToken 중복 연결 시 이전 연결 close |
| **freeform 모드 위치 동기화 race condition** — 교사 A가 카드 드래그 중 학생 B의 like 도착 | Low | Medium | (1) 교사 드래그 중에는 wall-state 적용을 일시 연기 (드래그 종료 후 reconcile), (2) 같은 post의 변경은 server timestamp로 ordering, (3) 충돌 시 "교사 변경 우선" 규칙 |
| **realtime-wall-management M2 스냅샷 포맷 충돌** | Low | Low | M2 스냅샷이 안착한 `userData/data/wall-board-{id}.json` 그대로 사용. 새 필드는 optional 추가만 (§8) |

---

## 7. Architecture Considerations

### 7.1 Project Level Selection

| Level | Characteristics | Recommended For | Selected |
|-------|-----------------|-----------------|:--------:|
| Starter | 단순 구조 | 정적 사이트 | ☐ |
| Dynamic | Feature-based modules | SaaS MVP | ☐ |
| **Enterprise** | Strict layer separation, DI | **ssampin 프로젝트의 기존 레벨** | ☑ |

**결정**: Clean Architecture 4-layer + Electron + cloudflared 터널 + WebSocket fan-out 구조는 Enterprise 그대로 유지.

### 7.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| **학생 뷰 구현 방식** | (a) HTML 정적 생성 (현재) 확장 / (b) React SPA 번들 cloudflared 서빙 / (c) 학생 전용 경량 React 분리 entry | **(c) 학생 전용 React entry** | (a)는 4 레이아웃 + dnd-kit + react-rnd를 vanilla JS로 재구현 불가능. (b)는 교사 전용 컴포넌트(QueuePanel/Drawer)까지 묶여 번들 크기·보안 표면 모두 부담. (c)는 `vite.student.config.ts` 별도 entry로 학생용 번들만 빌드 → cloudflared가 서빙. 번들 크기 < 500KB 목표. |
| **WebSocket 메시지 프로토콜** | (a) JSON 자유 형식 / (b) discriminated union TypeScript 타입 / (c) Zod 런타임 검증 | **(b) + 부분 (c)** | 서버 송신 타입은 (b)로 강제. 학생→서버 수신은 (c) Zod validation (외부 입력은 신뢰 불가). 학습 곡선 + 의존성 추가 부담은 학생 입력 4종(`like-toggle`/`comment-add`/`submit`/`join`)에만 한정. |
| **교사 컴포넌트 재사용 전략** | (a) 그대로 import + isStudent prop / (b) 학생용 fork 컴포넌트 신설 / (c) presenter 패턴으로 데이터 변환만 분리 | **(a) viewerRole prop** | (b)는 코드 중복 4 보드 × 2 = 8개. (c)는 presenter 추가 레이어 부담. (a)는 prop 1개 추가만으로 권한 토글 + 컴포넌트 내부 conditional. 단 학생 entry가 import하는 트리에 교사 전용 코드(승인/숨김 핸들러 등) 들어가지 않도록 분리는 §6.4에서 컴파일 시 강제. |
| **좋아요 저장 위치** | (a) WallBoard.posts[i]의 새 필드 / (b) 별도 likes 테이블 / (c) 클라이언트 로컬만 | **(a) post 필드 추가** | (b)는 추가 파일 I/O. (c)는 영속화 사용자 결정 위배. (a)는 M2 스냅샷 그대로 — `post.likes`/`post.likedBy` 추가, 무손실 마이그레이션. |
| **익명 식별** | (a) 기존 sessionToken 재사용 / (b) IP 해시 / (c) 닉네임+UA 조합 | **(a) sessionToken** | 기존 1 카드 제한이 이미 sessionToken 사용. PIPA 추가 위반 0. 스푸핑 가능성은 §6.4 위협 모델 명시. |
| **댓글 수정 가능 여부** | (a) 학생 본인만 수정 / (b) 수정 불가 (삭제만) / (c) 5분 내 수정 가능 | **(b) 수정 불가, 교사 삭제만** | (a)는 sessionToken 재사용으로 본인 인증 — 스푸핑 우회 가능. (c)는 시간 동기화 복잡. (b)가 가장 단순·신뢰. 학생은 다시 댓글 달기로 정정. |
| **Phase P3 학생 카드 추가 권한** | (a) approvalMode='auto'일 때만 / (b) 항상 가능 (manual은 검토 중 표시) / (c) 교사 토글로 비활성화 가능 | **(b) + (c)** | (a)는 manual 모드의 학생 참여 동선 파괴. (b)가 패들렛 정통. 교사가 카드 추가 자체를 차단하고 싶을 때를 위해 (c) "학생 카드 추가 잠금" 토글 별도 (Design §5.3 oversight 권한 추가). |
| **broadcast 주체** | (a) Main 프로세스가 직접 / (b) Renderer가 IPC로 요청 → Main이 broadcast | **(a) Main 직접** | 학생 입력은 WebSocket→Main 도착. Main이 도메인 규칙 적용 후 즉시 다른 학생들에게 broadcast + Renderer(교사)에도 IPC. 한 번의 Main 처리로 양쪽 동기화. (b)는 hop 1회 추가, latency 손해. |
| **Testing** | Vitest 유지 | **Vitest** | 프로젝트 표준. 도메인 규칙 + WebSocket protocol type 테스트. |

### 7.3 Clean Architecture Approach

```
Selected Level: Enterprise (기존)

신규 파일 배치:
src/
├── domain/
│   ├── entities/
│   │   ├── RealtimeWall.ts                 [수정: likes/likedBy/comments 서브필드 추가]
│   │   └── RealtimeWallComment.ts          [P2 신규]
│   └── rules/
│       └── realtimeWallRules.ts            [수정: toggleStudentLike, addStudentComment, removeStudentComment 추가]
│
├── usecases/
│   └── realtimeWall/
│       ├── BroadcastWallState.ts           [P1 신규 — 상태 변경 → 브로드캐스트 메시지 변환]
│       ├── HandleStudentLike.ts            [P2 신규]
│       └── HandleStudentComment.ts         [P2 신규]
│
├── adapters/
│   ├── components/Tools/RealtimeWall/
│   │   ├── RealtimeWallCard.tsx            [수정: viewerRole prop, 학생용 like/comment UI]
│   │   ├── RealtimeWallCardActions.tsx     [수정: viewerRole='student'면 null 반환]
│   │   ├── RealtimeWallKanbanBoard.tsx     [수정: viewerRole prop 전파]
│   │   ├── RealtimeWallFreeformBoard.tsx   [수정]
│   │   ├── RealtimeWallGridBoard.tsx       [수정]
│   │   ├── RealtimeWallStreamBoard.tsx     [수정]
│   │   ├── RealtimeWallCommentList.tsx     [P2 신규 — 카드 내부 댓글 목록]
│   │   └── RealtimeWallCommentInput.tsx    [P2 신규]
│   └── stores/
│       └── useRealtimeWallSyncStore.ts     [P1 신규 — WebSocket 클라이언트 상태]
│
├── infrastructure/
│   └── realtimeWall/
│       └── (Main 프로세스 IPC만 — adapters에 React entry 별도)
│
└── (학생 React entry — 새 디렉토리)
    student/                                [P1 신규 — 학생 전용 React entry point]
    ├── main.tsx                            [학생용 entry]
    ├── StudentRealtimeWallApp.tsx          [최상위 컨테이너]
    ├── StudentBoardView.tsx                [4 레이아웃 라우터 (재사용)]
    ├── StudentSubmitForm.tsx               [P3에서 모달화]
    └── useStudentWebSocket.ts              [학생 클라이언트 WebSocket 훅]

electron/ipc/
├── realtimeWall.ts                         [수정: 브로드캐스트 메시지 5종 추가, like/comment 핸들러 추가]
└── realtimeWallHTML.ts                     [폐기 — 학생 SPA로 대체. 1~21줄 정책 주석 패들렛 모드 재작성]

vite.student.config.ts                      [P1 신규 — 학생 entry 별도 빌드]
```

의존성 규칙:
- `domain/` ← 외부 의존성 0 (CLAUDE.md 준수)
- `usecases/` → `domain/`만 (Broadcast/Handle 클래스는 순수 함수형)
- `adapters/components/` → 교사·학생 양쪽 entry에서 import (단일 SoR)
- `student/` 디렉토리는 `adapters/components/` import 가능 (어댑터 계층 내), `electron/`·`infrastructure/` import 절대 금지
- `electron/ipc/` → `domain/` + `usecases/` import 가능, `adapters/` import 금지

**핵심 강제 규칙**: 학생 entry가 빌드된 번들에 교사 전용 컴포넌트(`RealtimeWallApprovalSettingsDrawer`, `RealtimeWallBoardSettingsDrawer`, `RealtimeWallQueuePanel`, `WallBoardListView` 등)가 **들어가지 않도록** import 그래프 검증. CI에 `import-cost` 또는 수동 grep 체크 추가.

---

## 8. Convention Prerequisites

### 8.1 Existing Project Conventions

- [x] `CLAUDE.md` 코딩 컨벤션 섹션 존재
- [x] TypeScript strict 모드 적용 중
- [x] Path Alias (`@domain/*`, `@usecases/*`, `@adapters/*`, `@infrastructure/*`)
- [x] ESLint 설정
- [x] Tailwind 디자인 토큰 `sp-*` 사용 (단 `rounded-sp-*`는 금지 — `feedback_rounding_policy.md`)

### 8.2 Conventions to Define/Verify

| Category | Current State | To Define | Priority |
|----------|---------------|-----------|:--------:|
| **WebSocket 메시지 타입** | 5종 (`join`/`submit`/`submitted`/`closed`/`already_submitted`) | 신규 9종 추가 (`wall-state`/`post-added`/`post-updated`/`post-removed`/`like-toggle`/`comment-add`/`comment-remove`/`student-form-locked`/`error`) — Design §4 상세 | High |
| **viewerRole prop 컨벤션** | 미존재 | `viewerRole: 'teacher' \| 'student'` 모든 RealtimeWall 컴포넌트에 통일 도입. 기본값 'teacher' (기존 동작 호환) | High |
| **학생 entry 빌드 출력 경로** | 미존재 | `dist/student/` (cloudflared 서빙용). `vite.student.config.ts`로 별도 빌드 | High |
| **학생 HTML 정책 주석** | `realtimeWallHTML.ts:1-21` 5종 금지 | 패들렛 모드 정책으로 재작성 (학생 카드/like/comment 노출 허용 + 교사 권한 비노출 8종 명시) | High |
| **rate limit 정책** | 1 카드/sessionToken만 | like 30/분 + comment 5/분 추가 (도메인 규칙 + WebSocket 핸들러 강제) | High |
| **CSP 메타 태그** | 학생 HTML에 부분 적용 | 학생 SPA에 명시적 CSP — `script-src 'self'` + `connect-src 'self' wss:` | Medium |

### 8.3 Environment Variables Needed

별도 환경 변수 필요 없음. 기존 cloudflared 터널 인프라 그대로.

### 8.4 Pipeline Integration

- Phase 1 (Schema) → 본 Plan §3 + Design §3
- Phase 2 (Convention) → §8.2
- Phase 3~9 → Phase P1/P2/P3 단위로 직진 (Plan/Design/Do/Check/Act 각 Phase마다 1회전)

---

## 9. Phase별 구현 로드맵

### Phase P1 — 학생 뷰 대칭화 (5~7일 예상)

1. 학생 React entry 디렉토리(`src/student/`) + `vite.student.config.ts` 신설
2. `viewerRole` prop을 `RealtimeWallCard*` 7개 컴포넌트에 통일 도입 (기본값 'teacher', 기존 동작 호환)
3. `electron/ipc/realtimeWall.ts` WebSocket 메시지 4종 추가 (`wall-state`/`post-added`/`post-updated`/`post-removed`)
4. Main 프로세스: 카드 승인/hidden/pinned 변경 시 자동 broadcast 훅
5. `electron/ipc/realtimeWallHTML.ts` 폐기 → `dist/student/index.html` 서빙으로 교체
6. 학생용 컨테이너 `StudentRealtimeWallApp` + 4 레이아웃 재사용
7. 학생 클라이언트 WebSocket 훅 `useStudentWebSocket` (재연결 backoff 포함)
8. 부하 테스트 (100 동시 클라이언트, latency < 200ms)
9. release note BREAKING + 사용자 가이드 업데이트

### Phase P2 — 학생 좋아요·댓글 (7~10일 예상)

1. 도메인 엔티티 확장 (`RealtimeWallPost.likes/likedBy/comments`, `RealtimeWallComment` 신규)
2. 도메인 규칙 (`toggleStudentLike`/`addStudentComment`/`removeStudentComment`) + 단위 테스트 5케이스 이상씩
3. WebSocket 메시지 3종 추가 (`like-toggle`/`comment-add`/`comment-remove`)
4. Rate limit 도메인 규칙 + WebSocket 핸들러 (`like` 30/분, `comment` 5/분)
5. 마이그레이션 로더: 기존 post에 `likes: 0`, `likedBy: []`, `comments: []` 기본값 주입
6. UI: 카드에 학생 좋아요 버튼(sky 색상) + 댓글 토글 + `RealtimeWallCommentList`/`Input`
7. 교사 오버레이: 댓글 삭제 권한 + likes 카운터 read-only 표시 옵션 (Design §5.3)
8. WebSocket 통합 테스트 (좋아요/댓글 동기화 시나리오)
9. release note + 사용자 가이드 업데이트

### Phase P3 — 학생 카드 추가의 패들렛화 (3~5일 예상)

1. 학생 보드 뷰 좌하단 "+ 카드 추가" FAB 추가
2. 클릭 시 `StudentSubmitForm`을 모달로 띄움 (기존 폼 컴포넌트 재사용, 라우팅 변경)
3. approvalMode='auto'일 때 카드 등장 애니메이션 강조 (CSS keyframe)
4. approvalMode='manual'일 때 학생에게 "검토 중" 인디케이터 + 승인 후 `wall-state`로 카드 등장
5. 교사 오버레이: "학생 카드 추가 잠금" 토글 (LiveSharePanel 또는 BoardSettingsDrawer)
6. 라우팅: 학생 entry 진입 즉시 `StudentBoardView` (보드 화면), 폼은 모달로만 호출
7. realtime-wall BETA 배지 제거 검토
8. release note + 사용자 가이드 업데이트

---

## 10. Red Flags (방향 어긋남 감지)

- **부적절 콘텐츠 필터링이 Phase 안으로 끌려 들어옴** → 이번 Plan은 보류. Future Work §11.3에서만 분리. 절대 P1~P3 안에 넣지 말 것.
- 학생 화면에 교사 전용 권한 8종 중 하나라도 노출 (CSS hidden 의존도 포함)
- 학생 entry 번들에 교사 전용 컴포넌트(`QueuePanel`, `*Drawer`, `WallBoardListView`)가 import 그래프상 포함됨
- `electron/ipc/realtimeWallHTML.ts:1-21` 정책 주석을 업데이트하지 않은 채 학생 노출 코드만 추가 (정책 문서 정합성 깨짐)
- WebSocket 메시지 타입을 `any`로 처리 (discriminated union 또는 Zod 필수)
- 좋아요/댓글을 클라이언트 로컬에만 저장 (사용자 결정 #2 위배)
- `dangerouslySetInnerHTML`을 한 곳이라도 사용
- 학생 1인 다중 카드 제한을 P1~P3에서 풀어버림 (별도 Phase 논의 필요)
- 마이그레이션 시 기존 v1.13.x 데이터에 schema version bump 강제 (optional 추가만 허용)
- M2 스냅샷 포맷(`userData/data/wall-board-{id}.json`)을 새 경로로 이동
- 부적절 콘텐츠 보류 결정을 release note에 명시하지 않음 (운영 책임 회피 인상)
- 각 Phase를 한 번에 몰아 릴리즈 (P1 단독 BETA 검증 누락)

---

## 11. Future Work / Open Questions

본 Plan 범위가 아닌, 후속 Phase 또는 다른 Feature로 분리되는 항목.

### 11.1 학생 1인 다중 카드 허용 (P4 후보)
1 sessionToken = 1 카드 제한은 본 Plan 전 구간 유지. 패들렛처럼 학생 1명이 여러 장 카드 만드는 시나리오는 별도 사용자 결정 필요.

### 11.2 학생 카드 위치 드래그 (P5 후보)
freeform 모드에서 학생이 자기 카드를 드래그해 위치 잡기. UX 가치는 크지만 race condition·권한 분기 추가 복잡.

### 11.3 부적절 콘텐츠 실시간 필터링 (별도 Feature 후보)

**본 Plan은 절대 구현하지 않는다**. 사용자 결정 #3에 따라 보류.

향후 별도 Plan(`realtime-wall-content-moderation` 등) 신설 시 검토할 옵션:
- 한국어 욕설 사전 (정적 파일 기반)
- 개인정보 정규식 (전화번호/주민번호 패턴)
- LLM 기반 부적절성 판정 (Gemini API)
- approvalMode='filter' (v1.13에서 enum만 정의, 동작은 보류 중)

**현재 운영 가이드** (Release note + Notion 가이드 명시):
- 기본 approvalMode = 'manual' 권장 (특히 초중등)
- 부적절 카드 발견 시 교사가 즉시 hidden/삭제 (전체 학생 화면에서 즉시 사라짐)
- 학생 댓글도 동일 — 교사 댓글 삭제 권한 활용
- 이는 **유일한 안전장치**임을 명시 (Plan Red Flag와 일관)

### 11.4 WallBoard schema version bump (P3 완료 시점)
P1~P3 통과 후 v1.14.x 안정화 시점에 schema version 1→2 bump 검토. 그때까지는 optional 필드 추가만으로 무손실 마이그레이션 유지.

### 11.5 학생 댓글 좋아요 / 대댓글 (별도 Feature 후보)
댓글은 본 Plan에서 평면 구조. 패들렛도 이 정도까진 안 함. 후순위.

### 11.6 모바일 PWA installable (P5+ 후보)
학생이 cloudflared URL을 홈화면에 추가해 앱처럼 사용. 매니페스트·서비스워커 추가 필요.

---

## 12. 한 줄 결론

실시간 담벼락은 **"교사·학생이 같은 보드 뷰를 공유하되, 큐레이션 권한만 교사 오버레이로 분리"** 하는 패들렛 모델로 전면 전환한다. P1(읽기) → P2(좋아요·댓글) → P3(학생 카드 추가) 3 Phase로 단계 검증하며, 부적절 콘텐츠 필터링은 본 Plan 비범위 — manual 승인 + 교사 hidden이 유일한 안전장치임을 운영 가이드와 Red Flag로 명시한다. v1.13.x 데이터는 무손실 호환된다.

---

## 13. Next Steps

1. [ ] 이 Plan 문서 사용자 리뷰/승인
2. [ ] `/pdca design realtime-wall-padlet-mode` — IPC 메시지 protocol, 컴포넌트 prop 시그니처, 마이그레이션 절차 상세화 (이미 본 작업에서 함께 작성 — `docs/02-design/features/realtime-wall-padlet-mode.design.md`)
3. [ ] Phase P1 Do 진입 — 학생 React entry 분리 + WebSocket 브로드캐스트 4종부터 구현
4. [ ] 각 Phase 완료마다 `/pdca analyze realtime-wall-padlet-mode` Match Rate 측정 → 90%↑ 시 다음 Phase
5. [ ] **부적절 콘텐츠 필터링 Plan**(`realtime-wall-content-moderation`) 별도 신설 검토 — 본 Plan과 동시 진행 가능

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-24 | 초안 작성 — P1(학생 뷰 대칭화) / P2(좋아요·댓글) / P3(학생 카드 추가 패들렛화) 3 Phase 로드맵, 교사 전용 권한 8종 명시, 부적절 콘텐츠 필터링 Future Work 분리, M2 스냅샷 포맷 호환성 보장 | cto-lead (consult: pm/frontend/security/infra) |
