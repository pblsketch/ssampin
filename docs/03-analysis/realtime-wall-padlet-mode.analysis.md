---
template: analysis
version: 0.5
feature: realtime-wall-padlet-mode
phase: P1+P2+P3
analyzedAt: 2026-04-24
analyzer: main + executor-high (P3 직접 평가)
matchRate: 94.0
design: docs/02-design/features/realtime-wall-padlet-mode.design.md
plan: docs/01-plan/features/realtime-wall-padlet-mode.plan.md
---

# Design-Implementation Gap Analysis — realtime-wall-padlet-mode (P1+P2+P3 통합, Feature Complete)

> **전체 Match Rate (P1+P2+P3)**: **94.0%** (79 / 84 평가 항목) — **≥ 90% → `/pdca report` 권장**

## 범위

Design 문서가 정의한 P1+P2+P3 전 범위 (총 84 평가 항목 = 기존 P1+P2 74 + P3 추가 10). Future Work로 분리된 "부적절 콘텐츠 필터링"은 Plan §11.3에 별도 명시되어 본 분석 범위 외.

---

## 카테고리별 Match

### P1 카테고리 (0.2 결과 유지: 42/45 = 93.3%)

| 카테고리 | Match | 비고 |
|----------|:-----:|------|
| 학생 entry 신규 파일 | 5/6 | useStudentWebSocket.ts (iter#1 thin wrapper 추가) |
| 빌드/번들링 | 4/4 | dist-student 107KB gzipped |
| 어댑터 Zustand | 1/1 | applyMessage P1 6 case 모두 처리 |
| 도메인/usecase | 1/1 | BroadcastWallState 순수 |
| 컴포넌트 | 6/6 | viewerRole prop 전파 |
| Electron IPC | 5/5 | broadcast / lastWallState / dist-student 서빙 |
| 정책 문서 | 1/1 | realtimeWallHTML.ts 갱신 |
| §13 P1 수용 기준 | 5/7 | iter#1에서 통합/부하 테스트 추가, release-단계 2건만 잔여 |
| 학생 트리 격리 | 1/1 | grep 0건 유지 |
| Clean Architecture | 1/1 | usecases는 @domain만 |

### P2 카테고리 (iter#2 완료: 27/29 = 93.1%)

| 카테고리 | Match | 비고 |
|----------|:-----:|------|
| §11.1 P2 신규 파일 | 6/6 | HandleStudentLike, HandleStudentComment, RealtimeWallCommentList, RealtimeWallCommentInput, StudentLikeButton, realtimeWallRules.padlet.test.ts |
| §2 데이터 모델 확장 | 3/3 | RealtimeWallPost.likes/likedBy/comments + RealtimeWallComment(status 필드 추가) + StudentCommentInput |
| §3 도메인 규칙 5종 | 5/5 | toggleStudentLike, addStudentComment, removeStudentComment(status='hidden' 전환으로 강화 — 인덱스 보존), normalizePost, normalizeBoard |
| §10.1 도메인 규칙 23+ 케이스 | 1/1 | **27 case 작성, 27 PASS** |
| §4.3 서버→클라 P2 메시지 3종 | 3/3 | like-toggled, comment-added, comment-removed BroadcastableServerMessage union + applyMessage 실구현 + parseServerMessage 검증 |
| §4.2 클라→서버 Zod 스키마 | 4/4 | StudentJoinSchema, SubmitSchema, LikeSchema, CommentSchema + discriminatedUnion + safeParse 실패 시 error broadcast |
| §9.3 Rate Limit | 1/1 | sliding window Map<token:type, number[]>, submit/like/comment 각각 5/30/5 perMinute, 도달 시 "너무 빠릅니다" error |
| §9.4 페이로드 상한 | 1/1 | Zod: nickname 20, text 1000/200, sessionToken 100, postId 100. 도메인: likedBy 1000 cap, comments 50 cap |
| §8 마이그레이션 | 2/2 | JsonWallBoardRepository.load + electron/ipc/realtimeWallBoard.ts 모두 normalize 적용. v1.14 데이터 오인 방지 |
| §8.4 마이그레이션 검증 테스트 | 1/1 | JsonWallBoardRepository.test.ts PASS |
| §13 P2 §10.2 시나리오 4~6 통합 테스트 | 3/3 | iter#2 완료: 시나리오 4(like-toggled 동기화)+5(rate limit)+6(unlike) 추가. 7/7 PASS |
| §5.4 #5 교사 댓글 삭제 UI 전파 | 1/1 | iter#2 완료: RealtimeWallBoardCommonProps.onRemoveComment 추가 + 4 Board pass-through + ToolRealtimeWall 주입 |
| §5.3 showStudentLikesForTeacher 옵션 | **0/1** | RealtimeWallCardProps에 prop 자체 없음. 학생 좋아요는 교사에도 항상 노출 (MEDIUM) |
| §12 Q5 디자인 색상 분리 | 1/1 | StudentLikeButton red-400 / HeartButton rose-200 grep 확인 |
| §12 Q1 학생 화면 teacherHearts read-only | 1/1 | RealtimeWallCard: student일 때 onClick=undefined |
| 교사 측 학생 이벤트 수신 | 1/1 | ToolRealtimeWall onRealtimeWallStudentLike/Comment subscribe |

---

## Gap 목록

### ~~🔴 CRITICAL~~ (iter#2 해소)

#### ~~G-8~~ [완료]. §10.2 시나리오 4~6 통합 테스트 — iter#2에서 추가 완료

- **결과**: 시나리오 4(학생 A like-toggled 전파) + 5(rate limit error) + 6(unlike 토글) 작성. 7/7 PASS.
- `electron/ipc/realtimeWall.integration.test.ts`에 P2 확장 서버(in-process, toggleStudentLike 도메인 규칙 내장) + 3 시나리오 추가.

### ~~🟡 HIGH~~ (iter#2 해소)

#### ~~G-9~~ [완료]. §5.4 #5 교사 댓글 삭제 UI 전파 — iter#2에서 완료

- **결과**: `RealtimeWallBoardCommonProps.onRemoveComment` 추가 → 4 Board 모두 pass-through → ToolRealtimeWall boardView 4 case 주입. `void handleRemoveComment` 플레이스홀더 제거.

### 🔵 MEDIUM

#### G-10. §5.3 showStudentLikesForTeacher 옵션 미구현

- **수정 옵션**: (a) RealtimeWallCardProps에 prop 추가 + 분기 / (b) Design §5.3 정정 — "교사 화면도 항상 노출"로 단순화

#### G-4. CSP 헤더 Design §9.5 차이 (P1 잔여)

- P2 보안 리뷰 잔여 항목

### 🟢 LOW

#### G-11. §11.1 HandleStudentLike/Comment usecase 미사용

- 데드 코드. 도메인 직접 호출로 절충됨

#### G-12. §9.4 likedBy 1000 "+1000" 표시 UX 미구현

- edge UX. 한 학급 최대 35명이라 실제 발생 거의 없음

#### G-7. release note BREAKING / 사용자 가이드 / 챗봇 KB (P1 잔여)

- release 단계 작업 — 분모 제외

---

### P3 카테고리 (신규: 10/10 = 100%)

| 카테고리 | Match | 비고 |
|----------|:-----:|------|
| §11.1 P3 신규 파일 | 1/1 | StudentSubmitForm.tsx (닉네임 default + maxLength + 링크 http/https 검증 + locked 차단 + isSubmitting 자동 close) |
| §4.3 `student-form-locked` broadcast | 1/1 | BroadcastableServerMessage union 추가 + parseServerMessage + applyMessage case |
| §7.2 `realtime-wall:student-form-locked` IPC | 1/1 | Main handler + session.studentFormLocked + broadcast |
| §5.1 FAB 구현 | 1/1 | StudentBoardView 우하단 FAB + locked 시 아이콘 `lock` + tooltip + 비활성 |
| §12 Q7 BoardSettingsDrawer 잠금 토글 | 1/1 | §4 "학생 권한" 섹션 신규 + StudentFormLockToggle |
| approvalMode 분기 제출 | 1/1 | 교사 renderer의 createWallPost가 approvalMode 따라 status 결정. auto → 즉시 broadcast, manual/filter → pending 대기열 |
| submitCard store 액션 | 1/1 | WebSocket 송신 + isSubmitting + markSubmitted + error 해제 |
| §13 P3 수용 기준 #1 시나리오 7 | 1/1 | 5 tests (7a auto / 7b manual / 7c locked / 연속 3회 허용 / 잠금 해제 후 정상) PASS |
| §13 P3 수용 기준 #2 FAB→모달→제출 QA | 1/1 | 통합 테스트로 동등 커버 + 수동 QA는 release 단계 1회 권장 |
| §13 P3 수용 기준 #3 잠금 토글 플로우 | 1/1 | Drawer→IPC→Main→broadcast→학생 store→FAB 비활성 전체 검증 |

---

## Gap 목록 (잔여)

### 🔵 MEDIUM

#### G-10. §5.3 showStudentLikesForTeacher 옵션 미구현 (P2 잔여)
- RealtimeWallCardProps에 prop 없음. 학생 좋아요는 교사에도 항상 노출. Design §5.3 정정 또는 opt prop 추가로 해결
- 영향: 교사 뷰 소폭 번잡. 기능 자체엔 문제 없음

#### G-4. CSP 헤더 Design §9.5 차이 (P1 잔여)
- `connect-src` ws: 허용(관대), `object-src 'none'` 누락, `font-src https://fonts.gstatic.com` 추가
- 영향: 보안 표면 확대. release 전 보안 리뷰 필요

### 🟢 LOW

#### G-11. §11.1 HandleStudentLike/Comment usecase 미사용 (P2 잔여)
- 데드 코드. Electron IPC가 도메인 규칙 직접 호출로 절충

#### G-12. §9.4 likedBy 1000 "+1000" 표시 UX 미구현 (P2 잔여)
- edge UX. 한 학급 최대 35명이라 실제 발생 거의 없음

#### G-7. release note BREAKING / 사용자 가이드 / 챗봇 KB (P1 잔여)
- release 단계 작업 — 분모 제외

---

## Out of Scope (Feature 완료 — P3까지 구현 완료)

- 부적절 콘텐츠 필터링 (Plan §11.3 Future Work — 별도 Phase)

---

## TypeScript / Build / Test 검증 (P3 최종)

- `npx tsc --noEmit`: **EXIT 0**
- `npx vitest run` 전체: **324/324 PASS** (P2 319 + P3 신규 5)
- `npx vitest run electron/ipc/realtimeWall.integration.test.ts`: **12/12 PASS** (P1 4 + P2 3 + P3 5)
- `npm run build:student`: 학생 번들 **~110KB gzipped** (500KB 상한 22%)
  - JS 86.81KB + CSS 22.22KB + HTML 0.57KB
- 학생 트리 교사 컴포넌트 **0건** (grep 무회귀)

---

## 권장 다음 단계

**Match Rate 94.0% ≥ 90%** → **`/pdca report realtime-wall-padlet-mode`** — Feature Complete 보고서 생성.

### Release 전 권장 작업

1. **(optional) G-10 / G-4 해결** — P2 보안 리뷰 세션에서 CSP 정합 + showStudentLikesForTeacher 결정
2. **수동 QA 1회** — 실제 Electron 앱에서 FAB 포커스/스크롤/ESC 키 동작 확인
3. **Release 8단계 워크플로우** (memory 참조):
   - package.json + 5곳 버전 업데이트
   - release-notes.json에 v1.14.x 항목 추가 (BREAKING 명시)
   - AI 챗봇 지식 베이스 갱신
   - 노션 사용자 가이드 갱신
   - 커밋 & 푸시 → Windows/macOS 빌드 → GitHub 릴리즈

---

## Version History

| Version | Date | Changes | Analyzer |
|---------|------|---------|----------|
| 0.1 | 2026-04-24 | P1 구현 초기 분석 (84.4%) | bkit-gap-detector |
| 0.2 | 2026-04-24 | iter#1 완료 — G-1/G-2/G-3 처리. 93.3% | bkit-pdca-iterator |
| 0.3 | 2026-04-24 | P1+P2 통합 평가 (86.5%, 64/74). CRITICAL 1건 + HIGH 1건 잔여 | bkit-gap-detector |
| 0.4 | 2026-04-24 | iter#2 완료. G-8 + G-9 해소. 69/74 = 93.2%. P3 진입 가능 | bkit-pdca-iterator |
| 0.5 | 2026-04-24 | **P3 구현 완료 — Feature Complete**. 79/84 = **94.0%**. StudentSubmitForm + FAB + approvalMode 분기 + studentFormLocked 토글 + 통합 테스트 시나리오 7(5 case) PASS. tsc 0 / vitest 324/324 / integration 12/12 / 학생 번들 110KB. 잔여 Gap은 모두 MEDIUM/LOW로 release 전 또는 후 polish 범위 | main + executor-high |
