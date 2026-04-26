---
template: plan
version: 0.2
feature: realtime-wall-padlet-mode-v2-student-ux
date: 2026-04-25
revised: 2026-04-24 (v2.1 — 4 페르소나 검토 반영)
author: cto-lead (consult: product-manager / frontend-architect / security-architect / qa-strategist)
project: ssampin
version_target: v1.15.x (학생 UX 정교화 — v1.14.x 패들렛 모드 위에 누적)
parents:
  - docs/01-plan/features/realtime-wall-padlet-mode.plan.md
  - docs/02-design/features/realtime-wall-padlet-mode.design.md
  - docs/03-analysis/realtime-wall-padlet-mode.analysis.md
  - docs/04-report/features/realtime-wall-padlet-mode.report.md
related_research: docs/research/padlet-student-interactions.md
related_design: docs/02-design/features/realtime-wall-padlet-mode-v2-student-ux.design.md (TBD)
---

# 쌤핀 실시간 담벼락 — 패들렛 모드 v2 · 학생 UX 정교화 기획안 (v2.1)

> **v2.1 갱신 요지 (2026-04-24)**: 4 페르소나(초등 교사 / 중등 교사 / 보안·QA / 패들렛 비교) 검토 결과를 반영해 ① **Phase 순서를 B→A→D→C로 재배치** ② **카드 색상 / 이미지 다중 / PDF / moderation OFF / 영속 PIN** 5건 v2 흡수 ③ critical 7건 + high 5건 mitigation 반영. v2 본문은 가능한 보존하고 영향받은 섹션만 v2.1 표기로 갱신함.
>
> **요약**: v1.14.x로 완성한 패들렛 모드(교사·학생 동일 뷰 + 4 보드 + 좋아요/댓글 + 학생 카드 추가) 위에서, 학생의 **카드 추가 / 내용 입력 / 카드 위치 변경 / 자기 카드 수정·삭제** 네 인터랙션을 패들렛 수준으로 정교화한다. v1 기능은 절대 회귀하지 않으며, 부적절 콘텐츠 필터링은 v1 Plan §11.3을 그대로 계승해 본 v2 범위에서도 보류한다 (단 v2.1에서 **moderation OFF 프리셋 토글**을 추가해 보드 단위 즉시 공개 모드를 선택 가능).
>
> **사용자 한국어 지시 (2026-04-25)**:
> > "학생이 카드를 추가, 내용 입력, 카드 위치를 변경하는 방법이 정교하지 않습니다. 패들렛이 어떻게 되어 있는지 심층 리서치를 해서 이 부분을 정교화해주세요."
>
> 즉, 본 v2 Plan의 핵심 범위는 **학생 측 3대 인터랙션의 정교화**(Add UX / Input UX / Move UX)이며, v1에서 이미 완성된 권한 격리·동기화 인프라(WebSocket 12종 broadcast, viewerRole prop, sessionToken 매칭)를 **재활용**한다.
>
> **사용자 사전 결정 (v1 계승)**:
> 1. 전면 전환 — 학생 노출 정책은 v1.14.x 패들렛 모드 그대로
> 2. 영속 + 익명 — 좋아요/댓글 모두 sessionToken 기반 (v2도 동일)
> 3. 부적절 콘텐츠 필터링 보류 — v1 Plan §11.3 계승, 본 v2도 OOS (단 v2.1에서 moderation OFF 프리셋 토글 추가)
> 4. CTO-Lead 오케스트레이션
> 5. 동일 뷰 원칙 — 학생도 교사와 동일 보드, 차이는 권한 오버레이뿐
>
> **v2.1 사용자 확정 결정 5건 (2026-04-24, 4 페르소나 검토 후)**:
> 1. **댓글 입력 UX 정교화** v2 포함 (Phase B에 흡수 — B9)
> 2. **카드 색상 변경** v2 포함 (Phase B에 흡수, 8색 선택 — B3)
> 3. **PDF 첨부** v2 포함 (Phase B에 흡수, 별도 IPC, 10MB — B2)
> 4. **moderation OFF 프리셋** v2 포함 (Phase A에 추가, boardSettings 토글 — A5). 근거: Padlet 기본값 + 대안학교/시사토론 시나리오
> 5. **영속 정책: localStorage 영속 + 학기 단위 PIN 옵션** (Phase D에 추가 — D5). 근거: sessionStorage 양방향 위험. PIN은 학생이 스스로 정한 4자리, 학기 내 자기 카드 식별 영속. PIN 미설정 시 익명 일회성 모드(현재 동작) 유지.
>
> **Project**: ssampin (쌤핀)
> **Version**: v1.14.x (패들렛 모드 BETA 안정) → **v1.15.x (학생 UX 정교화)**
> **Author**: cto-lead
> **Date**: 2026-04-25 / Revised: 2026-04-24 (v2.1)
> **Status**: Draft (v2.1)

---

## 1. Overview

### 1.1 Purpose

쌤핀 실시간 담벼락 v1.14.x는 패들렛 모드 P1~P3을 통해 **학생도 보드를 함께 보고·좋아요/댓글을 달고·카드를 추가**할 수 있게 되었다. Match Rate 94.0% (`docs/03-analysis/realtime-wall-padlet-mode.analysis.md`)로 준수한 완성도를 달성했으나, 사용자 피드백 결과 학생 측 **3대 인터랙션(카드 추가 / 내용 입력 / 카드 위치 변경)이 "정교하지 않다"** 는 점이 명확히 지적되었다.

본 v2 Plan은 다음 세 영역을 정교화한다.

1. **카드 추가 UX (Add)** — 현재는 FAB 단일 진입점 + 단일 모달. 패들렛은 FAB / 보드 더블클릭 / 키보드 `C` 단축키 / 드래프트 자동저장 / 모달 최소화·재개 / Activity Indicator 6종을 제공한다 (research §2). 본 v2는 그중 한국 교실 환경에 적합한 4종을 선별 적용한다.
2. **내용 입력 UX (Input)** — 현재는 텍스트(1~1000자) + 링크 1개만. 패들렛은 12종+ 미디어 첨부와 풍부한 텍스트 포맷을 지원하나(research §3), 본 v2는 가장 가치 높은 **이미지 첨부 + 링크 OG 인라인 미리보기 + 미니멀 마크다운** 3종을 1차 적용한다. 동영상/오디오/그리기/AI 이미지는 v3+ 후속.
3. **카드 위치 변경 UX (Move)** — 현재는 4 보드 모두 학생 readOnly. 패들렛은 Freeform만 학생 자유 드래그를 허용하고 나머지는 자동 정렬 (research §4). 본 v2는 패들렛 정책을 그대로 계승하여 **Freeform에서 자기 카드만 드래그/리사이즈, Kanban에서 자기 카드 컬럼 간 이동**을 허용하고 Grid/Stream은 정렬 불가를 유지한다.

세 영역을 통합하면, 학생은 **(a) 더 빠르게 카드를 시작**하고 **(b) 더 풍부하게 내용을 표현**하며 **(c) 패들렛처럼 자기 카드를 직접 배치**하면서, 동시에 **다른 학생 카드는 절대 건드릴 수 없고 부적절 콘텐츠는 교사 hidden + manual 승인으로만 통제**되는 v1.14.x의 안전장치는 그대로 유지된다.

### 1.2 Background

- **현재 상태 (2026-04-25)**: realtime-wall-padlet-mode v1.14.x BETA. 학생 entry 5 파일 + 4 보드 viewerRole 분기 + WebSocket 12종 broadcast 모두 안정 동작. Match Rate 94.0%, 285/285 tests, 보고서 `docs/04-report/features/realtime-wall-padlet-mode.report.md` 존재.
- **사용자 피드백** (2026-04-25): "카드 추가/내용 입력/위치 변경 정교화" 명시 지시. 부적절 콘텐츠 필터링은 추가 보류 동의 (v1 Plan §11.3 계승).
- **v2.1 추가 — 4 페르소나 검토 (2026-04-24)**: 초등 교사 / 중등 교사 / 보안·QA / 패들렛 비교 4 페르소나가 v2 초안을 검토. critical 7건(Phase 순서/이미지 다중/단축키/영속/삭제/마크다운/댓글) + high 5건(marquee/iOS Safari/1인 다중/출시 일정/부하)이 합의되어 본 v2.1로 흡수. 4 페르소나 합의 결과는 §6 Risks와 §7.2 Decisions에 mitigation/근거로 반영.
- **v2.1 추가 — 출시 일정 가이드**: 학생 측 신규 인터랙션은 학기 초/방학 직전을 피해 학기 운영 안정기에 도입할 때 마찰이 가장 적다. 권고 윈도우는 다음 3종.
  - **5월 초** — 1학기 단원평가/체험학습 직전, 학급 분위기 안정기. 수업 활용 부담 낮음.
  - **7월 초** — 1학기 마무리 활동 + 방학 전 회고 보드 수요. 학생들이 보드 도구 학습 곡선을 거친 직후라 v2.1 신규 인터랙션 학습 부담 낮음.
  - **10월 초** — 2학기 중간 안정기. 가을 학예 행사·진로 캠페인 보드 수요 결합.
  - 회피 권장: 3월 첫 2주(학기 초 혼란), 12월 마지막 2주(학년말 행정 폭주), 6/11월 평가 주간.
- **현재 코드 표면** — 매핑 결과 (explore-medium):
  - 학생 entry 5 파일: `src/student/main.tsx` / `StudentRealtimeWallApp.tsx` (status 6분기) / `StudentJoinScreen.tsx` (닉네임 입력 + sessionStorage) / `StudentBoardView.tsx` (FAB + 모달 분기) / `StudentSubmitForm.tsx` (닉네임/내용/링크 + isSubmitting 자동 close)
  - 카드 추가 흐름 (현재):
    1. `StudentBoardView` FAB 클릭 → `setSubmitOpen(true)`
    2. `StudentSubmitForm` 모달 열림 — nickname (sessionStorage default) / text (1~1000자) / linkUrl (max 500자, http/https 검증)
    3. `submitCard()` → `useRealtimeWallSyncStore.submitCard` → WebSocket send `{type:'submit', sessionToken, nickname, text, linkUrl?}`
    4. 서버: `StudentSubmitSchema` Zod 검증 → rate limit (5회/분) → studentFormLocked 검사 → text slice(0, maxTextLength) → submission 생성 (id/submittedAt만 서버 부여) → `ws.send({type:'submitted'})`만 제출자에게 → `mainWindow.webContents.send('realtime-wall:student-submitted', ...)`
    5. 교사 renderer: IPC 수신 → `createWallPost()` → approvalMode 따라 status 결정 → setPosts → broadcast useEffect → `'realtime-wall:broadcast'` IPC
    6. 서버: lastWallState 갱신 + rebuildPostsCacheFromWallState → broadcastToStudents
    7. 학생: `socket.onmessage` → markSubmitted() → isSubmitting=false → 모달 자동 닫힘. post-added broadcast 수신 → board.posts 추가
  - 4 보드 viewerRole='student' 분기 (`effectiveReadOnly = readOnly || viewerRole === 'student'`):
    - Kanban: DndContext 미렌더, useDroppable disabled
    - Freeform: Rnd 컴포넌트 미사용, 절대위치 div만
    - Grid/Stream: RealtimeWallCardActions/onHeart/onRemoveComment 미전달
  - `RealtimeWallCard.tsx` line 207-208 핵심 격리:
    ```ts
    const teacherActions = viewerRole === 'teacher' ? actions : null;
    const teacherDragHandle = viewerRole === 'teacher' ? dragHandle : null;
    ```
    이 두 줄이 회귀되면 학생 화면에 교사 액션 칩 노출 — **회귀 금지 1순위**.
  - 도메인:
    - `RealtimeWallPost.linkUrl` (선택, http/https) / `linkPreview` (Main OG fetch 비동기 upsert) / `kanban: {columnId, order}` / `freeform: {x, y, w, h, zIndex}`
    - 학생 입력: nickname/text/linkUrl만. 서버 부여: id/submittedAt/status/pinned/teacherHearts/likes/likedBy/comments
    - `WallBoardSnapshotForStudent` 필터: `posts.filter(p => p.status === 'approved')` (회귀 위험 1순위)
  - WebSocket 12종 broadcast: P1(wall-state, post-added/updated/removed, closed, error) + P2(like-toggled, comment-added/removed) + P3(student-form-locked) + 단일수신(submitted, wall)
  - Hook 거는 자연 지점:
    1. `submitCard` 호출 직전 → 추가 필드 (이미지, 첨부) 끼우기
    2. `BoardRouter` props → `onStudentLike` / `onAddComment` / `onCardMove`(신규) / `onCardEdit`(신규) / `onCardDelete`(신규)
    3. `applyMessage` switch case 추가
    4. `studentFormLocked` 실시간 broadcast 패턴 (이미 동작) 재활용
- **회귀 위험 5건 (반드시 보존)**:
  1. `buildWallStateForStudents`의 `status==='approved'` 필터
  2. `parseServerMessage` wall-state 분기 (서버 신뢰 전제)
  3. `RealtimeWallCard.tsx` line 207-208 teacherActions/teacherDragHandle null 처리
  4. `StudentSubmitForm` isSubmitting useEffect (prevSubmittingRef edge transition)
  5. `rateLimitBuckets.clear()` (closeSession 시)

### 1.3 Related Documents

- 직전 v1 기획: [`docs/01-plan/features/realtime-wall-padlet-mode.plan.md`](realtime-wall-padlet-mode.plan.md) — 본 v2 Plan은 이 문서를 **수정하지 않고 누적**한다.
- 직전 v1 설계: [`docs/02-design/features/realtime-wall-padlet-mode.design.md`](../../02-design/features/realtime-wall-padlet-mode.design.md)
- 직전 v1 분석: [`docs/03-analysis/realtime-wall-padlet-mode.analysis.md`](../../03-analysis/realtime-wall-padlet-mode.analysis.md) — Match Rate 94.0%
- 직전 v1 보고서: [`docs/04-report/features/realtime-wall-padlet-mode.report.md`](../../04-report/features/realtime-wall-padlet-mode.report.md)
- **핵심 입력 자료**: [`docs/research/padlet-student-interactions.md`](../../research/padlet-student-interactions.md) — 본 v2의 모든 디자인 결정의 근거
- 관리 기능 계획: [`docs/01-plan/features/realtime-wall-management.plan.md`](realtime-wall-management.plan.md) — M2 스냅샷 포맷 호환성 보장 (v1 §6 그대로)

---

## 2. Scope

본 v2는 4 Phase로 분할한다. 각 Phase는 독립 릴리즈 가능해야 하며, **v2.1에서 Phase 순서를 B → A → D → C로 재배치**(4 페르소나 4/4 합의 critical-1).

### v2.1 Phase 재배치 근거

| 항목 | v2 (이전) | v2.1 (이후) | 근거 |
|------|----------|------------|------|
| 1순위 | A 카드 추가 | **B 내용 입력** | 페르소나 4/4 합의 — 내용 입력 정교화가 학생 가치 임팩트 가장 큼 (이미지/PDF/색상/마크다운 누적 효과). A는 단축키/드래프트 등 보조적. |
| 2순위 | B 내용 입력 | **A 카드 추가 진입** | B에서 모달 풀스크린·이미지 첨부가 안정화된 후, A의 진입점/드래프트가 의미 있음 (드래프트에 이미지 base64 충돌 검증 선행 필요) |
| 3순위 | C 위치 변경 | **D 자기 카드 수정/삭제** | 교사 모더레이션 보강(D6/D7) 시급. moderation OFF 프리셋(A5)과 결합되어 교사 도구 강화 우선 |
| 4순위 | D 수정/삭제 | **C 위치 변경** | 가장 무거움 + 모바일 readOnly 정책 변경 등 정책 정합성 후순위. A·B·D 안정화 후 위치 변경 도입이 회귀 부담 최소 |

### 2.1 In Scope — **Phase B: 카드 내용 입력 UX (5~7일, 가장 시급) — v2.1 1순위**

> 패들렛 §3 미디어 매트릭스 + 카드 색상 + PDF + 댓글 입력 정교화까지 통합. v2의 Phase B 본문에 v2.1 신규 5건(B2 PDF, B3 색상, B8 PIPA, B9 댓글, B10 다중 카드) 추가.

| ID | 항목 | Padlet 패턴 출처 | 쌤핀 적용 형태 | 우선순위 |
|----|------|------------------|----------------|:--------:|
| B1 | **이미지 다중 첨부** (드래그앤드롭 + paste + 파일 선택) — **v2.1 갱신: 1장 → 3장** | research §3 (#2 이미지 + 포토앨범) | 모달 본문 drop zone + paste + 파일 선택 버튼. **base64 인코딩 + canvas 리사이즈(max width 1600px, JPEG quality 0.82)**. 카드당 **최대 3장**, 카드 합계 5MB. Padlet 포토앨범 패턴 (페르소나 4/4 합의 critical-2) | High |
| B2 | **PDF 첨부 — v2.1 신규** | research §3 (#3 파일 업로드) | 별도 IPC 채널 (`realtime-wall:upload-pdf`)로 base64 우회. **max 10MB**. 학생 카드에 PDF 아이콘 + 클릭 시 새 탭 열기. magic byte (`%PDF-`) 검증 + svg/script 차단. 사용자 결정 5건 #3 흡수 | High |
| B3 | **카드 색상 8색 선택 — v2.1 신규** | research §3 (#1 색상 토큰) | pastel yellow / pink / blue / green / purple / orange / gray / white 8색. 모달 하단 픽커 + 카드 좌상단 점. 도메인: `RealtimeWallPost.color?: 'yellow'\|'pink'\|...`. 사용자 결정 5건 #2 흡수 | High |
| B4 | 학생측 OG 미리보기 인라인 (스냅샷에 linkPreview 포함) | research §3 (#7 자동 OG) | 현재 `linkPreview`는 교사 카드에만 표시 → **학생 wall-state snapshot에 linkPreview 포함**해 학생 카드 인라인 표시. 학생 입력 모달에서도 URL 디바운스 800ms 후 OG 미리보기. | High |
| B5 | 텍스트 미니멀 마크다운 — **v2.1 갱신: Bold/Italic 버튼 UI + blockquote 화이트리스트** | research §3 (#1 Bold/Italic) | **입력은 Bold/Italic 버튼 UI** (페1 초등 critical-6 — 별표 입력 자모분리 회피). 저장은 마크다운 변환(`**`/`*`). 추가로 unordered list (`-`), blockquote (`>`) 화이트리스트. 헤딩/rich text는 OOS. 렌더러는 react-markdown `allowedElements: ['p','strong','em','ul','ol','li','blockquote']` (페3 high-1) | Medium |
| B6 | 모바일 풀스크린 모달 + 키보드 자동 스크롤 | research §7-2 | 모바일 뷰포트(<640px) 모달 풀스크린 + safe-area-inset-bottom + 활성 input 자동 스크롤 | High |
| B7 | IME-aware 글자수 카운터 — **v2.1 갱신: Intl.Segmenter 사용** | (한국 특이) | `composing` 상태 카운트 일시 정지 + composition end 시 갱신. **글자 단위는 `Intl.Segmenter('ko', {granularity:'grapheme'})`로 grapheme 카운트** (이모지/한글 자모 정확 처리) | Medium |
| B8 | **PIPA 동의 1회 안내 모달 — v2.1 신규** | (한국 PIPA) | 친구 얼굴이 포함된 사진 첨부 시도 시 (= 첫 이미지 첨부 시점) 1회 모달: "친구 얼굴이 포함된 사진은 동의 받고 올려주세요." localStorage `ssampin-pipa-consent-shown` 1회 플래그. (페4 단일 강력 M-8) | High |
| B9 | **댓글 입력 UX 정교화 — v2.1 신규 (사용자 결정 #1)** | (페르소나 critical-7) | 댓글에도 ① 이미지 1장 첨부 (max 3MB) ② Bold/Italic 버튼 UI 미니멀 마크다운 ③ 모바일 풀스크린 ④ IME-aware 글자수 카운터 (max 200자) 적용. 카드 입력 폼과 동일 컴포넌트 재사용. | High |
| B10 | **학생 1인 다중 카드 허용 — v2.1 명시** | (페3 high-3) | v1.14.x에서 1 카드 제한 → v2.1에서 **무제한 명시**. rate limit는 5회/분 유지(서버 차원 폭주 방지). v1 Plan §11.1 항목 본 v2.1로 흡수. | High |

### 2.2 In Scope — **Phase A: 카드 추가 진입 UX (1~2일) — v2.1 2순위**

> 진입점 + 드래프트 + 모더레이션 프리셋. v2의 Phase A에서 단축키 변경 + moderation 프리셋 신규.

| ID | 항목 | Padlet 패턴 출처 | 쌤핀 적용 형태 | 우선순위 |
|----|------|------------------|----------------|:--------:|
| A1 | FAB 잠금 상태 시각 강화 | research §2-1 | lock 아이콘 + tooltip + 명시 메시지 | High |
| A2 | **진입 인터랙션 — v2.1 갱신: `C` 단축키 제거 → 모바일 long-press + 데스크톱 더블클릭** | research §2-1 + Padlet 모바일 패턴 | **`C` 키 단축키 제거**(페르소나 3/4 합의 critical-3 — IME 충돌 + 학생 키보드 미숙). 대체: ① **모바일 long-press(빈 영역 600ms 터치홀드)** ② **데스크톱 더블클릭(빈 영역)** 양방향 진입. 카드 영역 hit area 분리 (`pointer-events: none` 카드 외부) | High |
| A3 | 드래프트 자동저장 (보드 단위 분리) | research §2-2 | localStorage 키: `ssampin-realtime-wall-draft-{boardId}-{sessionToken}` (v2.1 — boardId 분리로 다보드 동시 작성 지원) | High |
| A4 | 모달 최소화 → 보드 → 재개 | research §2-2 | 모달 우상단 minimize → 좌하단 "작성 중인 카드 (1)" 칩 → 클릭 재오픈 | Medium |
| A5 | **moderation 프리셋 토글 — v2.1 신규 (사용자 결정 #4)** | Padlet 기본값 OFF | 보드 생성 시 `boardSettings.approvalMode`: `'off' (즉시 공개)` / `'on' (교사 승인)` 선택. 기본 'off'(Padlet 정합) 권장하되 교사가 학교 정책 따라 전환. 대안학교/시사토론 시나리오 + Padlet 패턴 정합. UI: 보드 생성 모달 + 보드 설정 패널 모두에서 토글 | High |

- 보드 더블클릭은 v2.1에서 **A2로 채택**(이전 OOS에서 변경).
- Activity Indicator (작성 중 표시)는 v2.1에서도 OOS (v3+).

### 2.3 In Scope — **Phase D: 학생 자기 카드 수정/삭제 + 교사 모더레이션 도구 (3~4일) — v2.1 3순위**

> 패들렛 §5 수정·삭제 정책 + v2.1 신규 PIN 영속 + 교사 모더레이션 도구 통합. moderation OFF 기본되니 교사 도구가 더 시급(D6/D7).

| ID | 항목 | Padlet 패턴 출처 | 쌤핀 적용 형태 | 우선순위 |
|----|------|------------------|----------------|:--------:|
| D1 | 자기 카드 hover 시 수정/삭제 메뉴 | research §5-1 | sky 색상 hover-action. sessionToken 또는 PIN 매칭 시에만 렌더 (모바일은 long-press로 진입) | High |
| D2 | 수정 모달 (`StudentSubmitForm` `mode='edit'` 재사용) | research §5-1 | 이미지 다중 / 색상 / PDF 모두 수정 가능. 제출 시 `submit-edit` WebSocket → 서버 sessionToken 또는 PIN 검증 → broadcast `post-updated` | High |
| D3 | **삭제 정책 — v2.1 갱신: (b) 실제 제거 → (a) soft delete + placeholder** | research §5-1 + 페2 critical-5 | 한국어 confirm → `submit-delete` → 서버 검증 후 **`status='hidden'` + "작성자가 삭제했어요" placeholder 카드** 표시. 좋아요/댓글 보존(데이터 일관성). 교사 화면에서는 placeholder 위에 "복원" 메뉴 제공 | High |
| D4 | 세션 종료 후 권한 명시 (한국어 안내) | research §5-1 | 학생 진입 시 1회 안내: "이 브라우저 탭이 닫히면 작성한 카드를 수정/삭제할 수 없게 됩니다. 학기 내내 자기 카드를 관리하려면 4자리 PIN을 설정하세요." (D5 안내 통합) | Medium |
| D5 | **학기 영속 PIN 옵션 — v2.1 신규 (사용자 결정 #5)** | (한국 PIPA + 학기 운영) | 학생이 4자리 PIN 입력 → SHA-256 hash 후 `post.studentPinHash`에 저장. 같은 PIN으로 학기 내 자기 카드 식별 영속. PIN 미설정 시 익명 일회성(현재 동작 = sessionToken 매칭). PIN ↔ sessionToken 양방향 매칭(둘 중 하나만 일치해도 본인 인정). PIN은 학생 본인만 알고 서버는 hash만 보관 (PIPA 안전) | High |
| D6 | **교사 카드 작성자 추적 도구 — v2.1 신규** | (페4 단일 강력 M-5) | 카드 우클릭 → 컨텍스트 메뉴 "이 작성자의 다른 카드 보기" → 같은 sessionToken 또는 같은 PIN hash 카드 모두 강조(border ring + filter). moderation OFF 기본되니 욕설/스팸 식별 더 시급 | High |
| D7 | **교사 닉네임 차단/수정 권한 — v2.1 신규** | (페4 단일 강력 M-6) | 학생 닉네임 클릭 시 컨텍스트 메뉴: ① "닉네임 변경" (즉시 발효, 학생에게 broadcast) ② "이 학생 카드 모두 숨김" (sessionToken 또는 PIN hash 기준 일괄 hidden) | Medium |

### 2.4 In Scope — **Phase C: 카드 위치 변경 UX (5~7일) — v2.1 4순위**

> 패들렛 §4 레이아웃별 학생 권한 매트릭스 계승. v2.1 추가: Freeform 기본 locked + 토글, 모바일 readOnly.

| ID | 항목 | Padlet 패턴 출처 | 쌤핀 적용 형태 | 우선순위 |
|----|------|------------------|----------------|:--------:|
| C1 | Freeform 자기 카드 react-rnd 드래그 — **v2.1 갱신: 모바일 readOnly** | research §4 + 페2 high-2 | `RealtimeWallFreeformBoard`의 `Rnd` 학생도 마운트. **모바일 viewport(<768px)에서는 readOnly 유지**(작은 화면에서 위치 조정은 실수 유발). per-card 동적 disableDragging | High |
| C2 | Kanban 자기 카드 컬럼 간 이동 | research §4 | DndContext 학생 마운트, 자기 카드만 활성 | High |
| C3 | Grid/Stream 정렬 불가 유지 | research §4 | 회귀 0 | High |
| C4 | sessionToken/PIN 서버 검증 | research §5 + v2.1 D5 | 위치 변경 메시지에 sessionToken (+ PIN hash 옵션) 포함 → 서버 매칭 검증 | High |
| C5 | **Freeform 학생 카드 기본 locked + "✏️ 위치 바꾸기" 토글 — v2.1 신규 (페1 critical)** | (페1 초등 실수 방지) | Freeform 자기 카드 기본 `disableDragging: true`. 카드 우상단 "✏️ 위치 바꾸기" 토글 활성 시에만 드래그 가능. 토글 OFF 시 다시 잠금 (실수 방지) | High |
| C6 | 위치 변경 broadcast 차분 push | (성능) | `post-updated` 메시지 변경 필드만 (`{id, freeform: {...}}` 또는 `{id, kanban: {...}}`) | Medium |
| C7 | 낙관적 업데이트 + 서버 reconcile | (UX) | 드래그 종료 즉시 로컬 적용 → broadcast 도착 시 reconcile, 충돌 시 서버 우선 | Medium |
| C8 | 드래그 중 latency 표시 | (NFR) | 100ms 내 ACK 미수신 시 sync indicator | Low |

**중요**: 자기 카드 식별은 **클라이언트 sessionToken (옵션 PIN hash)** + **서버 저장 `post.studentSessionToken` (옵션 `post.studentPinHash`)** 둘 중 하나라도 매칭하면 본인 인정 (D5 PIN 영속과 정합).

### 2.5 Out of Scope (본 v2.1)

| 항목 | OOS 사유 | 후속 Phase 후보 |
|------|---------|------------------|
| 동영상 첨부 (MP4 / 웹캠 녹화) | base64 페이로드 폭증 | v3 P-Video |
| 오디오 녹음 | 자동 자막 인프라 부재 | v3 P-Audio |
| 그리기 (Drawing Canvas) | 모바일 터치 정밀도 검증 필요 | v3 P-Draw |
| AI 이미지 생성 ("I Can't Draw") | 외부 API 비용/가이드 미정 | v4+ |
| **GIF 검색 (Giphy 등)** — v2.1 명시 | 외부 API 의존 + 학교망 차단 가능 (페4 M-3) | **v3 P-GIF** |
| 카메라 (Photo Booth) | mediaDevices 권한 검증 | v3 P-Camera |
| 위치 (Map Pin) | 새 레이아웃 신설 필요 | 별도 Feature |
| 폴 (Poll) 위젯 | 카드 내부 위젯 시스템 신설 필요 | 별도 Feature |
| 동영상 댓글 | 미디어 확장 본 v2 외 | v3 P-Audio·Video |
| 다른 Padlet 임베드 | v2 범위 외 | v3+ |
| Activity Indicator (작성 중 표시) | 가치 vs 복잡도 미정 | v3+ |
| **카드 연결선 (Sandbox 패턴)** — v2.1 명시 | 새 인터랙션 + 도메인 변경 大 (페4 M-4) | **v3 P-Connection** |
| **태그 / 검색 / 정렬** — v2.1 명시 | 메타데이터 + 인덱스 신설 (페4 M-7) | **v3 P-Discover** |
| **카드 복사/이동 (보드 간)** — v2.1 명시 | 보드 간 마이그레이션 정책 + 충돌 (페4 M-10) | **v3 P-CardOps** |
| 텍스트 헤딩 / 색상 / rich text editor | 가치 대비 복잡도 | v3+ |
| WCAG AA 완전 준수 | 별도 접근성 Feature | 별도 |
| 모바일 PWA installable | 매니페스트·서비스워커 추가 | v1 §11.6 |

### 2.6 Future Work — 보존 (v1 Plan §11 계승)

본 v2 Plan은 v1 Plan §11의 모든 Future Work 항목을 그대로 계승한다. 특히 **§11.3 부적절 콘텐츠 실시간 필터링**은 본 v2에서도 절대 구현하지 않는다. 운영 가이드(release note + Notion)에 다음을 명시:

- **v2.1 변경**: 기본 approvalMode = `'off'`(즉시 공개) — Padlet 정합 (사용자 결정 #4 — A5). 단 보드 생성 시 교사가 `'on'`(승인 필요)으로 전환 가능. 초중등 학교 정책 따라 권장 기본값은 학교 단위 결정.
- 부적절 카드 발견 시 교사가 즉시 hidden/삭제 (전체 학생 화면에서 즉시 사라짐)
- 학생 댓글도 동일 — 교사 댓글 삭제 권한 활용
- **v2.1 추가** — 교사 모더레이션 도구 강화: D6(작성자 추적) + D7(닉네임 차단/수정)으로 moderation OFF 기본 시 욕설/스팸 대응 가능
- 학생 자기 카드 수정/삭제 (Phase D)는 학생 자율 권한이며 교사 hidden 권한과 **독립** — 교사 hidden 후에도 학생이 자기 카드 수정 가능 여부는 §7.2 신규 결정 #5 (v2.1 — (c) 무관 + 시도 시 (a))

---

## 3. Requirements

### 3.1 Functional Requirements

> **v2.1 변경**: Phase 순서가 B→A→D→C로 재배치되어 FR ID는 의미적 그룹 유지(A/B/C/D 접두사). v2.1 신규 FR은 명시.

#### Phase B — 카드 내용 입력 UX (1순위)

| ID | Requirement | Priority | Phase | Status |
|----|-------------|----------|-------|--------|
| **FR-B1** | 카드 작성 모달에 이미지 첨부 영역. 드래그앤드롭 / 클립보드 paste / 파일 선택 버튼 3 진입점 | High | B | Pending |
| **FR-B2 (v2.1 갱신)** | 첨부 이미지는 카드당 **최대 3장**, 카드 합계 5MB. 첨부 시 canvas 리사이즈(max width 1600px, JPEG quality 0.82) 적용 후 base64 인코딩 → broadcast | High | B | Pending |
| **FR-B3** | 이미지 첨부 시 모달 내 미리보기 표시. X 버튼으로 개별 제거 가능 | High | B | Pending |
| **FR-B4 (v2.1 신규)** | **PDF 첨부**: 별도 IPC 채널(`realtime-wall:upload-pdf`)로 전송. max 10MB. 학생 카드에 PDF 아이콘 + 클릭 시 새 탭. magic byte `%PDF-` 검증 | High | B | Pending |
| **FR-B5 (v2.1 신규)** | **카드 색상 8색**: pastel yellow / pink / blue / green / purple / orange / gray / white. 모달 하단 픽커 + 카드 좌상단 점. 도메인 `RealtimeWallPost.color?` | High | B | Pending |
| **FR-B6** | 학생 wall-state snapshot에 `linkPreview` 포함되어 학생 카드에 OG 인라인 표시 | High | B | Pending |
| **FR-B7** | 학생 입력 모달에서 링크URL 입력 후 디바운스 800ms 후 OG 미리보기 카드 표시 (사전 검토) | High | B | Pending |
| **FR-B8 (v2.1 갱신)** | 카드 본문 미니멀 마크다운: **Bold/Italic 버튼 UI**(별표 직접 입력 아님) + list (`-`) + blockquote (`>`). react-markdown `allowedElements: ['p','strong','em','ul','ol','li','blockquote']` 화이트리스트 | Medium | B | Pending |
| **FR-B9** | 모바일 뷰포트(<640px) 모달 풀스크린 + 키보드 등장 시 활성 input 자동 스크롤 + safe-area-inset-bottom | High | B | Pending |
| **FR-B10 (v2.1 갱신)** | 글자수 카운터는 IME composition 중 일시 정지 + `Intl.Segmenter('ko', {granularity:'grapheme'})` 사용으로 한글/이모지 grapheme 정확 카운트 | Medium | B | Pending |
| **FR-B11 (v2.1 신규)** | **PIPA 동의 1회 안내 모달**: 첫 이미지 첨부 시점 1회 표시. localStorage `ssampin-pipa-consent-shown` 플래그 | High | B | Pending |
| **FR-B12 (v2.1 신규)** | **댓글 입력 정교화**: 댓글에도 ① 이미지 1장(max 3MB) ② Bold/Italic 버튼 UI ③ 모바일 풀스크린 ④ IME-aware 글자수(max 200) 적용 | High | B | Pending |
| **FR-B13 (v2.1 신규)** | **학생 1인 다중 카드 허용**: v1.14.x 1 카드 제한 해제. rate limit 5회/분만 유지 | High | B | Pending |

#### Phase A — 카드 추가 진입 UX (2순위)

| ID | Requirement | Priority | Phase | Status |
|----|-------------|----------|-------|--------|
| **FR-A1** | FAB가 잠금 상태(`studentFormLocked=true`)일 때 lock 아이콘 + tooltip + 명시 메시지로 비활성 사유 안내 | High | A | Pending |
| **FR-A2 (v2.1 갱신)** | **`C` 단축키 제거**. 대체: ① 모바일 빈 영역 600ms long-press ② 데스크톱 빈 영역 더블클릭. 카드 영역 hit area 분리 (카드 위 long-press/더블클릭은 카드 자체 액션) | High | A | Pending |
| **FR-A3 (v2.1 갱신)** | 카드 작성 도중 모달 닫으면 입력 내용이 localStorage에 자동 저장(보드 단위 분리). 키: `ssampin-realtime-wall-draft-{boardId}-{sessionToken}` | High | A | Pending |
| **FR-A4** | 모달 재오픈 시 저장된 드래프트 자동 복원. "이전 작성 내용을 불러왔습니다" 1회 토스트 | High | A | Pending |
| **FR-A5** | 모달 우상단 minimize 버튼 → 보드 좌하단 "작성 중인 카드 (1)" 칩 → 클릭 시 재오픈 | Medium | A | Pending |
| **FR-A6** | 카드 제출 성공 시 드래프트 자동 삭제 | High | A | Pending |
| **FR-A7 (v2.1 신규)** | **moderation 프리셋 토글**: 보드 생성 모달 + 보드 설정 패널 모두에서 `boardSettings.approvalMode`: `'off' (즉시 공개)` / `'on' (교사 승인)` 선택. 기본 'off' | High | A | Pending |

#### Phase D — 학생 자기 카드 수정/삭제 + 교사 모더레이션 (3순위)

| ID | Requirement | Priority | Phase | Status |
|----|-------------|----------|-------|--------|
| **FR-D1** | 학생은 자기 카드 hover(데스크톱) 또는 long-press(모바일) 시 sky 색상 수정/삭제 메뉴 노출 | High | D | Pending |
| **FR-D2 (v2.1 갱신)** | 수정 메뉴 클릭 시 `StudentSubmitForm`이 `mode='edit'`로 열림. 이미지 다중 / 색상 / PDF 모두 수정 가능 | High | D | Pending |
| **FR-D3** | 수정 제출 시 `submit-edit` WebSocket 메시지 → 서버 sessionToken/PIN 검증 → broadcast `post-updated` | High | D | Pending |
| **FR-D4 (v2.1 갱신)** | **삭제 = soft delete**: 한국어 confirm → `submit-delete` → 서버 검증 후 `status='hidden-by-author'` + "작성자가 삭제했어요" placeholder 카드. 좋아요/댓글 보존 | High | D | Pending |
| **FR-D5 (v2.1 갱신)** | 학생 진입 시 1회 안내(D5 PIN 옵션 통합): "이 브라우저 탭이 닫히면 작성한 카드를 수정/삭제할 수 없게 됩니다. 학기 내내 자기 카드를 관리하려면 4자리 PIN을 설정하세요." | Medium | D | Pending |
| **FR-D6 (v2.1 신규)** | **학기 영속 PIN**: 학생 4자리 PIN 입력 → SHA-256 hash → `post.studentPinHash`. 같은 PIN으로 학기 내 자기 카드 식별. PIN 미설정 시 익명 일회성(현재 동작). PIN ↔ sessionToken 양방향 매칭 | High | D | Pending |
| **FR-D7 (v2.1 신규)** | **교사 작성자 추적 도구**: 카드 우클릭 컨텍스트 메뉴 "이 작성자의 다른 카드 보기" → 같은 sessionToken/PIN hash 카드 모두 강조 | High | D | Pending |
| **FR-D8 (v2.1 신규)** | **교사 닉네임 차단/수정 권한**: 학생 닉네임 클릭 컨텍스트 메뉴: ① "닉네임 변경" (즉시 broadcast) ② "이 학생 카드 모두 숨김" (sessionToken/PIN 기준 일괄 hidden) | Medium | D | Pending |
| **FR-D9** | 교사 hidden 카드는 학생 화면에서 안 보이므로 hover-action 자체 없음. 학생이 직접 메시지 보낼 경우 서버는 학생 본인 권한 우선 처리 (§7.2 결정 #5 (c) + (a)) | High | D | Pending |

#### Phase C — 카드 위치 변경 UX (4순위)

| ID | Requirement | Priority | Phase | Status |
|----|-------------|----------|-------|--------|
| **FR-C1 (v2.1 갱신)** | Freeform 보드에서 학생은 자기 카드(sessionToken/PIN 매칭)만 드래그/리사이즈. **모바일 viewport(<768px)에서는 readOnly 유지**(실수 방지) | High | C | Pending |
| **FR-C2** | Kanban 보드에서 학생은 자기 카드만 컬럼 간 이동 가능 | High | C | Pending |
| **FR-C3** | Grid/Stream 보드에서 학생 위치 변경 불가 (현 정책 유지) | High | C | Pending |
| **FR-C4** | 학생이 다른 학생/교사 카드 드래그 시도 시 드래그 시작 자체 차단 (서버 응답 의존 X) | High | C | Pending |
| **FR-C5** | 서버는 위치 변경 메시지 수신 시 `post.studentSessionToken === msg.sessionToken` OR `post.studentPinHash === sha256(msg.pin)` 검증. 불일치 시 무시 + error | High | C | Pending |
| **FR-C6** | 위치 변경 broadcast는 `post-updated` 메시지에 **변경 필드만** 포함 | Medium | C | Pending |
| **FR-C7** | 학생 클라이언트는 드래그 종료 즉시 로컬 낙관적 업데이트 → broadcast 도착 시 reconcile. 충돌 시 서버 기준 우선 | Medium | C | Pending |
| **FR-C8 (v2.1 신규)** | **Freeform 자기 카드 기본 locked**: 카드 우상단 "✏️ 위치 바꾸기" 토글 활성 시에만 드래그 가능. 토글 OFF 시 다시 잠금 (페1 critical 실수 방지) | High | C | Pending |

#### 회귀 금지 (전 Phase 공통)

| ID | Requirement | Priority | Phase | Status |
|----|-------------|----------|-------|--------|
| **FR-NR1** | `buildWallStateForStudents`의 `status==='approved'` 필터 보존 | Critical | All | Must |
| **FR-NR2** | `RealtimeWallCard.tsx` line 207-208 teacherActions/teacherDragHandle null 처리 보존 | Critical | All | Must |
| **FR-NR3** | `StudentSubmitForm` isSubmitting useEffect (prevSubmittingRef edge transition) 보존 — Phase D 모달 재사용 시 특히 주의 | Critical | A,B,D | Must |
| **FR-NR4** | `rateLimitBuckets.clear()` (closeSession 시) 보존 | Critical | All | Must |
| **FR-NR5** | `parseServerMessage` wall-state 분기 (서버 신뢰 전제) 보존 | Critical | All | Must |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| Performance | 학생 entry 번들 크기 < 500KB gzipped (이미지 첨부 + PDF 처리 + 마크다운 라이브러리 + 색상 픽커 추가 후) | `vite build` analyze 출력 |
| Performance | 모바일 터치 latency < 100ms (Phase C 드래그 응답성) | 수동 측정 + Chrome DevTools Performance |
| Performance (v2.1 갱신) | 이미지 업로드 max **카드당 3장 / 카드 합계 5MB** (이미지) + PDF 별도 max 10MB | 도메인 규칙 + 클라이언트 사전 차단 |
| Performance (v2.1 갱신) | **동시 150명** (6학급 합) 위치 변경 broadcast latency < 200ms | 부하 테스트 (Node.js ws 150 클라이언트) — 페3 high-5 |
| Performance (v2.1 신규) | **첫 join → 첫 화면 표시 < 1초** (페4 M-11) | Lighthouse + 수동 측정. WebSocket 연결 + 초기 wall-state 적용 포함 |
| Performance | 드래프트 localStorage write 빈도 = onChange 디바운스 500ms | 코드 검증 |
| Performance | OG 미리보기 디바운스 800ms (학생 입력) | 코드 검증 |
| Reliability | 이미지/PDF 첨부 실패 시 사용자에게 명확한 에러 (크기 초과 / 지원 안 함 형식 / 서버 거부) | 수동 테스트 |
| Reliability | 드래프트 복원 시 이미지 base64가 유효하지 않으면 이미지만 제외하고 텍스트는 복원 | 단위 테스트 |
| Reliability | 학생 위치 변경 broadcast 도착 전 다른 broadcast 수신 시 ordering은 server timestamp 기준 | 통합 테스트 |
| Reliability (v2.1 신규) | **iOS Safari 백그라운드 30초 후 WebSocket 자동 재연결** (페3 high-2). visibilitychange 이벤트 + 지수 백오프 재연결 | 통합 테스트 (실기기 권장) |
| Security | 이미지 base64 페이로드는 서버에서 magic byte 검증 (PNG/JPG/GIF/WebP만 허용. SVG 차단) | 통합 테스트 |
| Security (v2.1 신규) | PDF 페이로드는 magic byte `%PDF-` 검증. svg/script/exe 거부 | 통합 테스트 |
| Security | 미니멀 마크다운 렌더링 시 HTML injection 차단 (`dangerouslySetInnerHTML` 절대 금지, react-markdown `allowedElements` 화이트리스트 사용) | 코드 리뷰 + fuzz |
| Security | 학생 위치 변경/수정/삭제 메시지의 sessionToken/PIN hash 검증은 **서버에서만 신뢰** | 위협 모델 §6.4 |
| Security (v2.1 갱신) | rate limit: 위치 변경 60/분, 수정 10/분, 삭제 5/분, 카드 제출 5/분, 댓글 10/분 (sessionToken+IP 키) | 통합 테스트 |
| Security (v2.1 신규) | PIN은 클라이언트 SHA-256 hash 후 전송. 서버는 hash만 보관 (PIN 평문 절대 저장 X) | 코드 리뷰 |
| Compatibility | v1.14.x WallBoard 데이터는 v1.15.x에서 손실 없이 읽힘 (이미지/PDF/색상/PIN hash 필드 모두 optional 추가만) | 기존 데이터 파일 로드 테스트 |
| Compatibility | 기존 카드(v2 이전 작성)는 자기 sessionToken/PIN 매칭 불가 → 학생 위치 변경/수정/삭제 모두 차단 (best-effort, 기존 카드 손실 없음) | 마이그레이션 테스트 |
| UX | Phase C 드래그 시 자기 카드와 다른 카드의 시각 차이가 명확 (테두리/cursor/opacity) | 디자인 QA |
| UX | Phase D 자기 카드 hover-action은 다른 학생 카드 hover와 구분되는 색상(sky) | 디자인 QA + 스크린샷 |
| UX (v2.1 갱신) | IME 한글 입력 정확 처리 — `Intl.Segmenter` grapheme 카운트, composition 중 카운트 일시 정지. **`C` 단축키 제거되어 한글 자모 충돌 위험 0** | 수동 테스트 |
| Architecture | Clean Architecture 4-layer 규칙 준수 (domain 순수, usecases→domain만) | ESLint import rules + 수동 검토 |
| Architecture | 학생 entry 번들에 교사 전용 컴포넌트 import 그래프 진입 0 | 빌드 산출물 grep 검증 |

---

## 4. Success Criteria

### 4.1 Definition of Done

> **v2.1 변경**: Phase 순서 B→A→D→C로 재배치. 각 Phase 완료 기준에 v2.1 신규 항목 추가.

#### Phase B 완료 기준 (1순위, 5~7일)
- [ ] FR-B1~B13 모두 구현
- [ ] 이미지 다중(최대 3장 / 합계 5MB) 드래그앤드롭 / paste / 파일 선택 3 진입점 동작
- [ ] PDF 첨부(max 10MB) 별도 IPC 경로로 동작 + magic byte 검증
- [ ] 카드 색상 8색 픽커 + 카드 좌상단 점 표시
- [ ] 학생측 OG 인라인 표시(snapshot에 linkPreview 포함) + 입력 모달 디바운스 800ms
- [ ] Bold/Italic 버튼 UI 마크다운 + react-markdown allowedElements 화이트리스트(blockquote 포함) + HTML injection 0
- [ ] 모바일 풀스크린 모달 + 키보드 자동 스크롤 + safe-area
- [ ] `Intl.Segmenter` grapheme 카운터 정확
- [ ] PIPA 동의 1회 안내 모달 (첫 이미지 첨부 시)
- [ ] 댓글 입력 정교화 (이미지 1장 + Bold/Italic + 풀스크린 + IME 카운터)
- [ ] 학생 1인 다중 카드 (rate limit 5회/분 유지)
- [ ] **부하 테스트 150명 동시(6학급 합) 카드 제출/이미지 broadcast latency < 200ms**
- [ ] 학생 entry 번들 < 500KB gzipped 유지
- [ ] 회귀 위험 5건 보존

#### Phase A 완료 기준 (2순위, 1~2일)
- [ ] FR-A1~A7 모두 구현
- [ ] FAB 잠금 시각 단서 + 모바일 long-press(600ms) + 데스크톱 더블클릭 진입 동작
- [ ] **`C` 단축키 코드 완전 제거 검증** (grep 0 hit)
- [ ] localStorage 드래프트(보드 단위 분리) 모달 닫힘/탭 새로고침 후 복원
- [ ] 모달 minimize → 보드 좌하단 칩 → 재오픈 동작
- [ ] moderation 프리셋 토글 (보드 생성 + 설정 패널 모두) + 기본 'off'
- [ ] **iOS Safari 30초 백그라운드 후 WebSocket 자동 재연결 통합 테스트 PASS**
- [ ] **첫 join → 첫 화면 표시 < 1초 측정 PASS**
- [ ] 회귀 위험 5건 보존

#### Phase D 완료 기준 (3순위, 3~4일)
- [ ] FR-D1~D9 모두 구현
- [ ] 자기 카드 hover/long-press → sky 액션 메뉴 + sessionToken/PIN 매칭
- [ ] `StudentSubmitForm` `mode='edit'` (이미지 다중 / 색상 / PDF 모두 수정 가능)
- [ ] **soft delete + "작성자가 삭제했어요" placeholder + 좋아요/댓글 보존**
- [ ] 학기 영속 PIN: 4자리 입력 → SHA-256 hash → 학기 내 자기 카드 식별. 양방향 매칭(sessionToken OR PIN)
- [ ] PIN은 클라이언트 해싱, 서버 평문 보관 0
- [ ] 교사 작성자 추적 도구 (우클릭 메뉴) — 같은 sessionToken/PIN 카드 강조
- [ ] 교사 닉네임 변경/일괄 숨김 권한 동작
- [ ] §7.2 결정 #5 (c)+(a) 따라 hidden 후 학생 권한 정책 일관
- [ ] 회귀 위험 5건 보존

#### Phase C 완료 기준 (4순위, 5~7일)
- [ ] FR-C1~C8 모두 구현
- [ ] Freeform 자기 카드 react-rnd 드래그 + 다른 카드 차단 + **모바일 readOnly**
- [ ] **Freeform 자기 카드 기본 locked + "✏️ 위치 바꾸기" 토글** 동작
- [ ] Kanban 자기 카드 컬럼 이동 + 다른 카드 차단
- [ ] Grid/Stream 학생 정렬 불가 (회귀 0)
- [ ] 서버 sessionToken/PIN hash 검증 통과/실패 모두 통합 테스트
- [ ] 위치 변경 broadcast 차분 push
- [ ] **부하 테스트 150명 동시 드래그 latency < 200ms**
- [ ] 회귀 위험 5건 보존

#### 전체 완료 기준
- [ ] `npx tsc --noEmit` EXIT=0
- [ ] `npx vitest run` 전체 통과 (신규 테스트 포함)
- [ ] `npm run electron:build` 성공
- [ ] gap-detector Match Rate 90%+ (`/pdca analyze`)
- [ ] 학생 번들 < 500KB gzipped 검증
- [ ] 사용자 가이드(Notion) 업데이트 — 학생 측 신규 인터랙션 4종(B/A/D/C 순) + 교사 모더레이션 도구 안내
- [ ] 챗봇 KB(`scripts/ingest-chatbot-qa.mjs`) 업데이트 (PIN / moderation OFF / soft delete 핵심 Q&A 포함)
- [ ] 릴리즈 노트에 v2.1 변경사항 명시 (BREAKING은 아님 — 추가 기능 + moderation 기본값 변경 명시)

### 4.2 Quality Criteria

- [ ] 테스트 커버리지 80%+ (도메인 규칙 + WebSocket 핸들러)
- [ ] TypeScript 에러 0개, 린트 에러 0개
- [ ] WebSocket 메시지 타입 양방향 type-safe (Zod or discriminated union, v1 컨벤션 계승)
- [ ] Gap Analysis Match Rate 90%+
- [ ] 회귀 위험 5건 자동 검증 (가능하면 단위 테스트로 격리)

---

## 5. 회귀 금지 — 절대 보존 5건 (v1 자산 보호)

본 v2는 v1.14.x를 손상시키지 않아야 한다. 특히 다음 5건은 코드 한 줄도 건드리면 안 된다 (필요 시 별도 PR로 분리하고 별도 Plan 작성).

| # | 위치 | 보존 사항 | 회귀 시 영향 |
|---|------|-----------|-------------|
| 1 | `electron/ipc/realtimeWall.ts` `buildWallStateForStudents` | `posts.filter(p => p.status === 'approved')` 필터 | 학생에게 pending/hidden 카드 노출 → 큐레이션 정책 붕괴 |
| 2 | `src/student/parseServerMessage` (또는 동등 위치) | wall-state 분기 (서버 신뢰 전제, 클라이언트 재검증 없음) | 서버 broadcast 의도와 클라이언트 표시 불일치 |
| 3 | `src/adapters/components/Tools/RealtimeWall/RealtimeWallCard.tsx` line 207-208 | `teacherActions = viewerRole === 'teacher' ? actions : null;` `teacherDragHandle = viewerRole === 'teacher' ? dragHandle : null;` | **학생 화면에 교사 액션 칩 노출** (가장 중대 회귀) |
| 4 | `src/student/StudentSubmitForm.tsx` isSubmitting useEffect | `prevSubmittingRef` edge transition (false→true→false 시점에만 모달 자동 닫힘) | Phase D 모달 재사용 시 수정 완료 후 모달이 닫히지 않거나 무한 루프 |
| 5 | `electron/ipc/realtimeWall.ts` `closeSession` | `rateLimitBuckets.clear()` | 세션 재시작 후 이전 rate limit 상태 잔존 |

**검증 방법**:
- Phase 진입 직전 5건 위치 git blame 기록
- Phase 종료 시 동일 위치 git diff 확인 (의도된 변경 외 0)
- CI에 회귀 위험 5건 grep 어서션 추가 (`teacherActions = viewerRole === 'teacher'` 등 정확한 문자열)

---

## 6. Risks and Mitigation

> **v2.1 추가**: 4 페르소나 합의 critical 7건 mitigation 통합. v2 본문 항목은 보존하되 일부 항목을 v2.1 결정에 맞게 갱신.

### 6.1 v2 본문 Risks (v2.1 갱신 포함)

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **이미지 base64 페이로드 폭증** — 5MB × 카드당 3장 × 학생 30명 동시 첨부 (v2.1 갱신: 3장으로 증가) | High | Medium | (1) 클라이언트 사전 차단(카드당 합계 5MB), (2) **canvas 리사이즈(max 1600px, JPEG 0.82)**로 첨부 시점에 압축, (3) WebSocket payload max 8MB, (4) PDF는 별도 IPC로 우회 (대용량 분리), (5) **150명 부하 테스트 필수**(페3 high-5) |
| **~~IME 한글 충돌 (`C` 단축키)~~ — v2.1에서 단축키 제거되어 위험 해소** | ~~High~~ | ~~High~~ | **(v2.1)** `C` 단축키 코드 완전 제거 → critical-3 해결. 모바일 long-press + 데스크톱 더블클릭 진입으로 대체 (한글 입력과 충돌 영역 0). |
| **Freeform 학생 드래그 race condition** | Medium | Medium | (1) 드래그 중 wall-state 적용 일시 연기 → 드래그 종료 후 reconcile, (2) server timestamp ordering, (3) like는 위치와 별개 필드 |
| **~~sessionToken 분실~~ — v2.1에서 PIN 옵션으로 부분 해소** | ~~High~~ | ~~High~~ | **(v2.1)** PIN 미설정 시 = 기존 위험 그대로(익명 일회성). PIN 설정 시 학기 내 권한 영속. 안내 텍스트(FR-D5)로 학생에게 PIN 옵션 1회 노출. |
| **다른 학생 카드 동시 편집 race** | Low | Low | (1) 동일 sessionToken/PIN 중복 연결 시 이전 연결 close, (2) 마지막 변경 wins |
| **마크다운 HTML injection** | High | Low | (1) `dangerouslySetInnerHTML` 절대 금지, (2) **react-markdown `allowedElements: ['p','strong','em','ul','ol','li','blockquote']` 화이트리스트** (v2.1 갱신 — blockquote 추가), (3) fuzz 테스트, (4) **marquee/iframe/script 모두 미허용 명시** (페3 high-1) |
| **이미지 매직 바이트 검증 누락** | High | Medium | (1) 서버 magic byte 검증, (2) SVG 명시 차단, (3) `<img src="data:image/png;base64,...">` 직접 렌더만, (4) PDF magic byte `%PDF-` 추가 검증 (v2.1) |
| **드래프트 localStorage 폭증** | Medium | Medium | (1) 드래프트 저장 시 **이미지/PDF base64 저장 제외** (메타만 — 파일명 / 크기), (2) 텍스트만 저장, (3) quota exceeded 시 명시 에러, (4) **보드 단위 키 분리**로 키 충돌 0 (v2.1) |
| **모바일 키보드 등장 시 입력 가려짐** | Medium | High | (1) viewport-fit + safe-area-inset-bottom, (2) 활성 input 자동 스크롤, (3) iOS/Android 실기기 테스트 |
| **회귀 위험 5건 위반** | Critical | Medium | (1) §5 명시, (2) Phase 진입 전 git blame 기록, (3) CI grep 어서션 |
| **Phase 한 번에 몰아치기** | Medium | Low | (1) Phase별 독립 릴리즈, (2) **B → A → D → C 순 직진 권장**(v2.1 재배치), (3) Phase 완료 기준 미충족 시 다음 Phase 진입 금지 |
| **사용자가 v2 추가 인터랙션을 부담스러워함** | Low | Low | (1) v1 기본 동선 유지, v2.1은 추가 옵션, (2) 모든 신기능 opt-in 또는 비파괴 |

### 6.2 v2.1 추가 Risks (4 페르소나 critical/high 합의)

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **C-1 Phase 순서 부적합** — v2 A→B→C→D는 가치 임팩트와 학습 곡선 정렬 어긋남 | High | High | **v2.1 재배치 B→A→D→C** 4/4 합의. §2 Scope에 근거 표 추가. |
| **C-2 이미지 단일 제한** — 1장은 Padlet 포토앨범 패턴 미달, 학생 표현 한계 | High | High | **카드당 3장으로 확장**(B1) + canvas 리사이즈로 페이로드 통제 + 합계 5MB 한도 |
| **C-3 `C` 단축키 IME 충돌 + 학생 키보드 미숙** | High | High | **단축키 제거** + 모바일 long-press + 데스크톱 더블클릭 (A2). 코드 완전 제거 + grep 검증 |
| **C-4 sessionStorage 양방향 위험** — 탭 닫으면 권한 소실 + 다른 학생 사칭 가능 | High | Medium | **localStorage sessionToken 영속** + **학기 단위 4자리 PIN 옵션**(D5). PIN은 클라이언트 SHA-256 hash, 서버는 hash만 보관 (PIPA 안전) |
| **C-5 hard delete 데이터 일관성** — 댓글/좋아요 고아 + UI 갑자기 사라짐 | High | High | **soft delete + "작성자가 삭제했어요" placeholder**(D4) + 좋아요/댓글 보존. 교사는 placeholder에 "복원" 메뉴 |
| **C-6 별표 `**`/`*` 직접 입력 자모 분리** — 초등 학생 IME 충돌 critical | High | High | **Bold/Italic 버튼 UI**(B5) — 입력은 버튼 클릭, 저장은 마크다운 변환. 학생은 별표 자체 안 봄 |
| **C-7 댓글 입력 단순화 부족** — 카드만 정교화하고 댓글은 plain text → 일관성 깨짐 | Medium | Medium | **댓글 입력 정교화**(B9) — 이미지 1장 + Bold/Italic + 풀스크린 + IME 카운터. 카드 입력 폼 컴포넌트 재사용 |
| **H-1 marquee blockquote 화이트리스트 누락** | Medium | Low | react-markdown `allowedElements`에 blockquote 1줄 추가. marquee/iframe/script는 명시 미포함 |
| **H-2 iOS Safari 백그라운드 WebSocket 끊김** — 학생 휴대폰 백그라운드 → 재진입 시 빈 화면 | High | High | **visibilitychange 이벤트 + 지수 백오프 재연결**. 30초 백그라운드 후 자동 재연결 통합 테스트 PASS |
| **H-3 1인 1카드 제한 학생 표현 막힘** | Medium | Medium | **무제한 명시**(B10) + rate limit 5회/분만 유지(폭주 방지) |
| **H-4 출시 일정 미고려** — 학기 초/말 도입 시 학습 곡선 부담 | Medium | Medium | **§1.2에 5월/7월/10월 초 윈도우 권고** 추가. 회피 권장 시기(3월·12월·평가 주간) 명시 |
| **H-5 부하 테스트 100명 부족** — 6학급 합 150명 시나리오 미커버 | High | Medium | **150명으로 확장**(NFR + Phase B/C 완료 기준). Node.js ws 클라이언트 150 구동 |
| **moderation OFF 기본 → 욕설/스팸 폭주 가능** (v2.1 사용자 결정 #4 부작용) | High | Medium | **D6/D7 교사 모더레이션 도구 강화**(작성자 추적 + 닉네임 차단). 보드 생성 시 토글 기본은 'off'지만 안내 텍스트로 학교 정책 권고. **부적절 콘텐츠 필터링 별도 Plan(`realtime-wall-content-moderation`)** 후속 검토 |
| **PIN 분실 → 학생이 자기 카드 권한 영구 소실** | Medium | Medium | (1) PIN은 학생 본인 책임 명시, (2) 교사 화면에서 PIN reset 권한 X (PIPA 정합 — 교사는 hash만 봄), (3) sessionToken 매칭이 살아있으면 동일 탭에서는 계속 권한 유지(이중 매칭) |

---

## 7. Architecture Considerations

### 7.1 Project Level Selection

| Level | Characteristics | Selected |
|-------|-----------------|:--------:|
| Starter | 단순 구조 | ☐ |
| Dynamic | Feature-based modules | ☐ |
| **Enterprise** | Strict layer separation, DI | **☑** (v1 그대로) |

본 v2는 v1.14.x의 Enterprise 레벨 그대로 유지. 신규 레이어 도입 0.

### 7.2 Key Architectural Decisions (v2.1 — 사용자 결정 모두 확정)

> **v2.1 갱신**: v2의 5건 잠정 권고가 **사용자 결정으로 모두 확정**됨(2026-04-24, 4 페르소나 검토 후). 추가로 v2.1 신규 결정 4건(B C D 흡수 + PIN + moderation)도 확정.

#### 7.2.1 v2 본문 5건 — 사용자 확정

| # | Decision | 확정안 | Rationale |
|---|----------|--------|-----------|
| 1 | **이미지 첨부 저장 방식** | **확정: (a) base64 (v2.1 한정), 단 카드당 3장 / 합계 5MB로 확장 + canvas 리사이즈 압축** | 인프라 추가 0 + canvas 리사이즈로 페이로드 통제. PDF는 별도 IPC로 분리(B2). v3에서 blob URL/파일 IPC 전환 검토. |
| 2 | **드래프트 저장 위치** | **확정: (a) localStorage + 보드 단위 키 분리** | sessionStorage는 양방향 위험(C-4). 보드 단위 키로 다보드 동시 작성 지원. |
| 3 | **키보드 단축키 매니저** | **확정: (a) 학생 entry 독립 — 단 v2.1에서 `C` 단축키 자체를 제거** | 4 페르소나 critical-3. 한글 IME 충돌 + 학생 키보드 미숙. 모바일 long-press + 데스크톱 더블클릭으로 대체(A2). 단축키 매니저 자체가 불필요. |
| 4 | **학생 카드 삭제 정책** | **확정: (a) soft delete + "작성자가 삭제했어요" placeholder + 좋아요/댓글 보존** | v2 잠정 (b)에서 페2 critical-5 지적으로 (a) 변경. 데이터 일관성 + 댓글 고아 방지. 교사 화면에서 placeholder에 "복원" 메뉴. |
| 5 | **교사 hidden 카드의 학생 수정/삭제 권한** | **확정: (c) 학생 화면에 안 보이므로 hover-action 자체 없음 + 직접 메시지 시도 시 (a) 학생 본인 권한 우선** | 교사 hidden과 학생 자율 권한은 독립. 단 D7(교사 일괄 숨김) 후에는 (b) 학생도 수정/삭제 불가로 강제(교사 명시 차단 의도 존중). |

#### 7.2.2 v2.1 신규 결정 4건

| # | Decision | 확정안 | Rationale |
|---|----------|--------|-----------|
| 6 | **카드 색상 v2.1 포함 여부** (사용자 결정 #2) | **확정: 포함 — Phase B에 흡수, 8색 픽커** | 학생 표현 가치 高 + 도메인 변경 작음(`color?` optional 필드). pastel 8색은 카드 가독성 & 미적 통일성 양립. |
| 7 | **PDF 첨부 v2.1 포함 여부** (사용자 결정 #3) | **확정: 포함 — Phase B에 흡수, 별도 IPC, max 10MB** | 중등 수업 자료 공유 수요 + 이미지 base64와 분리해 페이로드 폭증 회피. magic byte `%PDF-` 검증으로 보안 확보. |
| 8 | **moderation 기본값** (사용자 결정 #4) | **확정: 기본 'off' (즉시 공개) + 보드 단위 토글로 'on' 전환 가능** | Padlet 기본값 정합 + 대안학교/시사토론 시나리오 + 교사 모더레이션 도구(D6/D7) 강화로 욕설/스팸 대응 가능. 학교 정책 따라 안내 텍스트로 권고. |
| 9 | **학생 영속 정책** (사용자 결정 #5) | **확정: localStorage sessionToken 영속 (기본) + 학기 단위 4자리 PIN 옵션** | sessionStorage 양방향 위험(C-4). PIN은 학생 본인이 정한 4자리 → SHA-256 hash → 서버 hash만 보관(PIPA 안전). PIN 미설정 시 익명 일회성(현재 동작). PIN ↔ sessionToken 양방향 매칭. 교사 화면에서 PIN reset 권한 X. |

### 7.3 Clean Architecture Approach

```
Selected Level: Enterprise (v1 그대로)

신규 파일 배치 (v2.1 — Phase B → A → D → C 순):

src/
├── domain/
│   ├── entities/
│   │   ├── RealtimeWall.ts                       [수정: images?: string[] (max 3, base64), pdfUrl?: string,
│   │   │                                                 color?: 'yellow'|'pink'|'blue'|'green'|'purple'|'orange'|'gray'|'white',
│   │   │                                                 studentPinHash?: string (SHA-256), edited?: boolean,
│   │   │                                                 status union에 'hidden-by-author' 추가]
│   │   ├── RealtimeWallDraft.ts                  [v2 신규 — 드래프트 엔티티 (보드 단위 키)]
│   │   └── RealtimeWallBoardSettings.ts          [v2.1 신규 — approvalMode 'off'|'on' + presetVersion]
│   └── rules/
│       └── realtimeWallRules.ts                  [수정: validateImages (max 3, 합계 5MB), validatePdf (magic byte),
│                                                          validateMarkdownAllowedElements (whitelist),
│                                                          validateMove/Edit/Delete (sessionToken OR pinHash 매칭),
│                                                          hashPin (SHA-256, 클라이언트 헬퍼),
│                                                          softDeletePost (status='hidden-by-author' + placeholder)]
│
├── usecases/
│   └── realtimeWall/
│       ├── HandleStudentMove.ts                  [v2 신규 — 위치 변경 검증·broadcast]
│       ├── HandleStudentEdit.ts                  [v2 신규]
│       ├── HandleStudentDelete.ts                [v2 신규 — soft delete + placeholder broadcast]
│       ├── ValidateImageAttachment.ts            [v2 신규 — magic byte + 크기 검증 + multi-image]
│       ├── ValidatePdfAttachment.ts              [v2.1 신규 — magic byte + 10MB 검증]
│       ├── HashStudentPin.ts                     [v2.1 신규 — SHA-256 클라이언트 헬퍼]
│       ├── TeacherTrackAuthor.ts                 [v2.1 신규 — sessionToken/pinHash 기준 같은 작성자 카드 조회]
│       └── TeacherUpdateNickname.ts              [v2.1 신규 — 교사 권한 닉네임 변경/일괄 숨김]
│
├── adapters/
│   ├── components/Tools/RealtimeWall/
│   │   ├── RealtimeWallCard.tsx                  [수정: 자기 카드 hover-action sky, 마크다운 렌더(allowedElements),
│   │   │                                                 이미지 다중 표시(carousel), PDF 아이콘, 색상 배경 + 좌상단 점,
│   │   │                                                 placeholder ('작성자가 삭제했어요') 분기]
│   │   ├── RealtimeWallFreeformBoard.tsx         [수정: 학생 자기 카드 Rnd 활성화 + 모바일 readOnly + 기본 locked 토글]
│   │   ├── RealtimeWallKanbanBoard.tsx           [수정: 학생 자기 카드 DndContext 활성화]
│   │   ├── RealtimeWallBoardSettingsPanel.tsx    [v2.1 신규 — moderation 토글 UI]
│   │   ├── RealtimeWallTeacherContextMenu.tsx    [v2.1 신규 — 우클릭 작성자 추적 + 닉네임 변경/숨김]
│   │   └── (Grid/Stream은 v2 변경 없음 — 회귀 0)
│   ├── components/Tools/RealtimeWall/Settings/
│   │   └── BoardCreateModal.tsx                  [수정: moderation 프리셋 토글 추가]
│   └── stores/
│       └── useRealtimeWallSyncStore.ts           [수정: moveCard, editCard, deleteCard, updateNickname,
│                                                          trackAuthor 액션 추가]
│
└── student/                                      [v2 핵심 변경 영역]
    ├── StudentSubmitForm.tsx                     [수정: 이미지 다중 첨부 + PDF 첨부 + 색상 픽커 +
    │                                                    OG 미리보기 + Bold/Italic 버튼 마크다운 +
    │                                                    모바일 풀스크린 + Intl.Segmenter 카운터 + mode='edit' 지원]
    ├── StudentCommentForm.tsx                    [v2.1 신규 — 댓글 정교화 폼 (B9)]
    ├── StudentBoardView.tsx                      [수정: FAB 잠금 시각 강화, 드래프트 칩, 자기 카드 hover/long-press,
    │                                                    moderation OFF 시 즉시 공개 안내 1회]
    ├── StudentRealtimeWallApp.tsx                [수정: long-press/더블클릭 진입 등록, 드래프트 복원,
    │                                                    안내 텍스트(PIN 옵션 포함), iOS Safari visibilitychange 재연결]
    ├── StudentPinSetupModal.tsx                  [v2.1 신규 — 4자리 PIN 입력/확인 모달]
    ├── StudentPipaConsentModal.tsx               [v2.1 신규 — 친구 얼굴 사진 동의 1회 안내 (B11)]
    ├── useStudentDraft.ts                        [v2 신규 — localStorage 드래프트 훅 (보드 단위 키)]
    ├── useStudentLongPress.ts                    [v2.1 신규 — 600ms long-press 진입 훅]
    ├── useStudentDoubleClick.ts                  [v2.1 신규 — 데스크톱 더블클릭 진입 훅]
    ├── useStudentImageUpload.ts                  [v2 신규 — drop/paste/파일 선택 통합 훅 + canvas 리사이즈]
    ├── useStudentPdfUpload.ts                    [v2.1 신규 — PDF 별도 IPC 채널 훅]
    ├── useStudentPin.ts                          [v2.1 신규 — PIN 설정/조회/hash 훅]
    ├── useStudentReconnect.ts                    [v2.1 신규 — visibilitychange + 지수 백오프 재연결]
    └── useGraphemeCounter.ts                     [v2.1 신규 — Intl.Segmenter 한글/이모지 grapheme 카운터]

electron/ipc/
├── realtimeWall.ts                               [수정: move/edit/delete 메시지 핸들러 + sessionToken/pinHash 검증 +
│                                                          이미지 magic byte 검증(다중) + 카드 색상 검증 +
│                                                          rate limit (위치 60/분, 수정 10/분, 삭제 5/분, 카드 5/분, 댓글 10/분) +
│                                                          교사 작성자 추적 + 닉네임 변경/일괄 숨김 핸들러]
├── realtimeWallPdfUpload.ts                      [v2.1 신규 — PDF 별도 IPC 채널 + magic byte 검증]
└── (기타 파일 변경 없음)
```

**의존성 규칙 검증** (v1 그대로):
- `domain/` ← 외부 의존성 0
- `usecases/` → `domain/`만
- `student/` → `adapters/components/` import 가능, `electron/`·`infrastructure/` import 절대 금지
- `electron/ipc/` → `domain/` + `usecases/` import 가능, `adapters/` import 금지

---

## 8. Convention Prerequisites

### 8.1 Existing Project Conventions (v1 계승)

- [x] `CLAUDE.md` 코딩 컨벤션
- [x] TypeScript strict 모드
- [x] Path Alias (`@domain/*`, `@usecases/*`, `@adapters/*`, `@infrastructure/*`)
- [x] ESLint
- [x] Tailwind 디자인 토큰 `sp-*` 사용 (`rounded-sp-*` 금지 — `feedback_rounding_policy.md`)
- [x] viewerRole prop 컨벤션 (v1 도입)
- [x] WebSocket 메시지 12종 (v1)

### 8.2 Conventions to Define/Verify (v2.1 갱신)

| Category | Current State | To Define | Priority |
|----------|---------------|-----------|:--------:|
| **WebSocket 메시지 추가 (v2.1)** | v1: 12종 | v2.1: **5종 추가** (`submit-move`, `submit-edit`, `submit-delete`, `update-nickname`, `track-author`). 서버→전체 broadcast는 기존 `post-updated`(자기 카드 변경) / `post-removed`(soft delete = `post-updated` status 변경) / `nickname-changed`(신규) 재활용·확장 | High |
| **PDF 별도 IPC 채널** | 없음 | `realtime-wall:upload-pdf` IPC 채널 (Electron Main → cloudflared 우회) | High |
| **카드 색상 토큰 (v2.1)** | 없음 | `RealtimeWallPost.color?: 'yellow'\|'pink'\|'blue'\|'green'\|'purple'\|'orange'\|'gray'\|'white'`. Tailwind 색상 매핑은 sp-* 토큰 + 카드 배경 alpha 80% | High |
| **이미지 다중 첨부 필드 (v2.1 갱신)** | 없음 | `RealtimeWallPost.images?: string[]` (max 3, base64 data URI). 단일 `imageData` 필드는 사용 X. `linkPreview.kind`에 'image' 추가는 OOS | High |
| **PDF 첨부 필드 (v2.1 신규)** | 없음 | `RealtimeWallPost.pdfUrl?: string` (Electron file:// 또는 base64 data URI), `pdfFilename?: string` | High |
| **PIN hash 필드 (v2.1 신규)** | 없음 | `RealtimeWallPost.studentPinHash?: string` (SHA-256, hex 64자리). 클라이언트 hash, 서버는 hash만 저장 | High |
| **status union 확장 (v2.1 신규)** | `'pending'\|'approved'\|'hidden'` | `'pending'\|'approved'\|'hidden'\|'hidden-by-author'` 추가 (placeholder 분기) | High |
| **boardSettings.approvalMode (v2.1 신규)** | 없음 | `'off' (즉시 공개)` / `'on' (교사 승인)`. 기본 'off' | High |
| **마크다운 라이브러리** | 없음 | **react-markdown** 채택. `allowedElements: ['p','strong','em','ul','ol','li','blockquote']` 화이트리스트. 번들 < 30KB gzipped 검증 | High |
| **Bold/Italic 버튼 UI 컨벤션 (v2.1 신규)** | 없음 | textarea 위 툴바: B(Bold) / I(Italic) / List / Quote 4 버튼. 클릭 시 선택 영역에 마크다운 wrap. 사용자는 별표 자체를 입력하지 않음 | High |
| **드래프트 localStorage 키 (v2.1 갱신)** | 없음 | `ssampin-realtime-wall-draft-{boardId}-{sessionToken}` (boardId 분리로 다보드 동시 작성 지원) | Medium |
| **PIN localStorage 키 (v2.1 신규)** | 없음 | `ssampin-realtime-wall-pin-{boardId}` (PIN 평문 X — 클라이언트 hash 저장) | High |
| **PIPA 동의 플래그 (v2.1 신규)** | 없음 | `ssampin-pipa-consent-shown` (boolean, 1회 안내 후 true) | Medium |
| **단축키 컨벤션 (v2.1 갱신)** | 없음 (학생 entry) | **`C` 단축키 제거**. 진입은 모바일 long-press 600ms + 데스크톱 더블클릭. 추후 `Cmd/Ctrl+Enter` 게시 단축키는 v3+ 검토 | High |
| **모바일 long-press / 더블클릭 진입 (v2.1 신규)** | 없음 | `useStudentLongPress` (touchstart 600ms hold) + `useStudentDoubleClick` (data-empty-area 영역에서만). 카드 영역은 hit area 분리 | High |
| **rate limit 정책 (v2.1 갱신)** | 1 카드/분, 댓글 5/분, 좋아요 30/분 (v1) | v2.1: 카드 제출 5/분 (1→5 완화 — B13 다중 카드 정합), 댓글 10/분, 좋아요 30/분 유지, **위치 변경 60/분, 수정 10/분, 삭제 5/분 신규** (sessionToken+IP 키) | High |
| **이미지 magic byte 검증** | 없음 | PNG (89 50 4E 47), JPG (FF D8 FF), GIF (47 49 46 38), WebP (52 49 46 46 .. 57 45 42 50). SVG 명시 차단 | High |
| **PDF magic byte 검증 (v2.1 신규)** | 없음 | `%PDF-` (25 50 44 46 2D). svg/script/exe magic byte 거부 | High |
| **iOS Safari 재연결 컨벤션 (v2.1 신규)** | 없음 | `useStudentReconnect`: visibilitychange 이벤트 → document.visibilityState === 'visible' 시 ws 상태 검사 → 끊김 시 지수 백오프 재연결 (1s, 2s, 4s, 8s, max 30s) | High |

### 8.3 Environment Variables

별도 환경 변수 추가 없음. 기존 cloudflared 터널 인프라 그대로.

### 8.4 Pipeline Integration

- Phase 1 (Schema) → 본 Plan §3 + Design §3
- Phase 2 (Convention) → §8.2
- Phase 3~9 → Phase A/B/C/D 단위로 직진 (Plan/Design/Do/Check/Act 각 Phase마다 1회전 권장)

---

## 9. Phase별 구현 로드맵 (v2.1 — B → A → D → C 재배치)

### Phase B — 카드 내용 입력 UX (5~7일, 1순위)

1. 도메인: `RealtimeWallPost.images?: string[]` (max 3) / `pdfUrl?` / `pdfFilename?` / `color?` / `studentPinHash?` 추가, status union에 `'hidden-by-author'` 추가
2. `useStudentImageUpload` 훅 신설 (drop/paste/file picker 통합 + canvas 리사이즈 max 1600px, JPEG 0.82, 합계 5MB 한도)
3. `useStudentPdfUpload` 훅 신설 (별도 IPC 채널)
4. `ValidateImageAttachment` / `ValidatePdfAttachment` use case 신설 (magic byte + 크기 + 다중)
5. `StudentSubmitForm`: 이미지 다중 첨부 + PDF 첨부 + 색상 픽커(8색) + 미리보기/개별 제거 + Bold/Italic 버튼 툴바
6. 학생 입력 모달 OG 미리보기 인라인 (디바운스 800ms)
7. 학생 wall-state snapshot에 `linkPreview` 포함되도록 `buildWallStateForStudents` 보강 (회귀 위험 1번 보존 — `status==='approved'` 필터 유지)
8. react-markdown 도입 + `allowedElements` 화이트리스트(blockquote 포함) + HTML injection 0 fuzz
9. 모바일 풀스크린 모달 + 키보드 자동 스크롤 + safe-area
10. `useGraphemeCounter` 훅 신설 (`Intl.Segmenter` 기반)
11. `StudentPipaConsentModal` (첫 이미지 첨부 시 1회)
12. `StudentCommentForm` 신설 — 댓글 정교화 (B9)
13. 학생 1인 다중 카드 제한 해제 (rate limit 5/분만 유지)
14. 서버: 이미지/PDF magic byte 검증 + WebSocket payload max 8MB
15. **부하 테스트 150명 동시** (Node.js ws 150 클라이언트)
16. release note: "v1.15.x — 이미지(최대 3장)·PDF·색상·댓글까지 학생 카드 표현이 풍부해졌습니다"

### Phase A — 카드 추가 진입 UX (1~2일, 2순위)

1. `useStudentLongPress` 훅 신설 (모바일 600ms touchhold)
2. `useStudentDoubleClick` 훅 신설 (데스크톱 빈 영역 더블클릭)
3. **`C` 단축키 코드 완전 제거** (grep 0 hit 검증)
4. `useStudentDraft` 훅 신설 (localStorage CRUD + 디바운스 500ms + 보드 단위 키 분리)
5. `StudentBoardView` FAB 잠금 시각 강화 (lock 아이콘 + tooltip + 명시 메시지)
6. `StudentSubmitForm` 모달 minimize 버튼 + 보드 좌하단 "작성 중인 카드 (1)" 칩
7. `StudentRealtimeWallApp` 진입 시 드래프트 복원 + 1회 토스트
8. **moderation 프리셋 토글** UI: `BoardCreateModal` + `RealtimeWallBoardSettingsPanel` 양쪽
9. `useStudentReconnect` 훅 신설 (visibilitychange + 지수 백오프) — H-2 mitigation
10. 단위/통합 테스트: long-press/더블클릭 진입, 드래프트 저장/복원/삭제, **iOS Safari 30초 백그라운드 재연결**, **첫 join → 1초 측정**
11. release note: "v1.15.x — 모바일 길게 누르기·데스크톱 더블클릭으로 카드 시작 + 작성 중 자동 저장"

### Phase D — 학생 자기 카드 수정/삭제 + 교사 모더레이션 (3~4일, 3순위)

1. `HandleStudentEdit` / `HandleStudentDelete` (soft delete) use case 신설
2. `HashStudentPin` use case + `useStudentPin` 훅 신설 (SHA-256 클라이언트 hash)
3. `StudentPinSetupModal` 신설 (4자리 PIN 입력/확인)
4. WebSocket 메시지 `submit-edit` / `submit-delete` / `update-nickname` / `track-author` 추가
5. 서버: sessionToken OR pinHash 매칭 검증 + rate limit (수정 10/분, 삭제 5/분) + soft delete broadcast
6. `RealtimeWallCard` 자기 카드 hover/long-press → sky 액션 메뉴 (sessionToken/PIN 매칭 시에만)
7. `RealtimeWallCard` placeholder 분기 ("작성자가 삭제했어요")
8. `StudentSubmitForm` `mode='edit'` 지원 (이미지 다중/색상/PDF 모두 수정)
9. 한국어 삭제 confirm + 학생 진입 시 안내 텍스트 1회 (PIN 옵션 통합)
10. `TeacherTrackAuthor` / `TeacherUpdateNickname` use case + `RealtimeWallTeacherContextMenu` 신설 (D6/D7)
11. 통합 테스트: 다른 학생 카드 수정/삭제 차단, PIN 매칭/sessionToken 매칭 양방향, 교사 모더레이션 도구
12. release note: "v1.15.x — 학생이 자기 카드 수정/삭제 + 학기 PIN 옵션 + 교사 작성자 추적 도구"

### Phase C — 카드 위치 변경 UX (5~7일, 4순위)

1. `HandleStudentMove` use case 신설 (sessionToken/PIN 검증 + 차분 broadcast)
2. WebSocket 메시지 `submit-move` 추가
3. 서버: rate limit 60/분, sessionToken/PIN 매칭 검증 후 `post-updated` broadcast (변경 필드만)
4. `RealtimeWallFreeformBoard` 학생 자기 카드 Rnd 활성화 (per-card 동적, **모바일 viewport readOnly**)
5. **Freeform 자기 카드 기본 locked + "✏️ 위치 바꾸기" 토글 UI** (C5)
6. `RealtimeWallKanbanBoard` 학생 자기 카드 DndContext 활성화
7. 낙관적 업데이트 + reconcile (`useRealtimeWallSyncStore.moveCard`)
8. Grid/Stream 회귀 0 검증 (단위 테스트 격리)
9. **부하 테스트 150명 동시 드래그 latency < 200ms**
10. 통합 테스트: 다른 학생 카드 드래그 차단, sessionToken 불일치 시 무시 + error
11. release note: "v1.15.x — Freeform/Kanban에서 학생이 자기 카드 위치 직접 조정 (모바일은 보호 정책)"

### 추정 작업 일수 (v2.1)

- **직렬 진행** (권장): B(7) + A(2) + D(4) + C(7) = **20일** (B → A → D → C)
- v2의 17일 대비 +3일은 v2.1 신규 항목(이미지 다중·PDF·색상·PIN·교사 도구·moderation 토글·iOS 재연결·150명 부하) 흡수분
- 병렬 최적화 가능 구간: B 진행 중 A의 일부(useStudentReconnect / 드래프트 훅)는 사전 시작 가능 → 18일 단축 가능

---

## 10. Red Flags (방향 어긋남 감지) — v2.1 갱신

본 v2.1 진행 중 다음 중 하나라도 발생하면 **즉시 중단하고 사용자 재컨설팅**.

- ❌ **부적절 콘텐츠 필터링** 구현 (v1 §11.3 + 본 v2.1 §2.6 모두 명시 보류 — D6/D7로 교사 도구만 강화)
- ❌ **동영상/오디오/AI 이미지/카메라/그리기/위치/폴/GIF/카드 연결선/태그/검색/카드 복사/Padlet 임베드** 등 v2.1 OOS 항목 구현 (모두 v3+)
- ❌ **학생이 다른 학생 카드 이동/수정/삭제** 가능 (Padlet도 차단 — research §5-1)
- ❌ **회귀 위험 5건 위반** — 특히 `buildWallStateForStudents` 필터, `RealtimeWallCard.tsx` line 207-208, `StudentSubmitForm` isSubmitting useEffect
- ❌ **Phase 순서 변경** — v2.1 확정 순서는 **B → A → D → C**. 임의 재배치 금지
- ❌ **Padlet 패턴 100% 모방** — 쌤핀 정체성(교사 큐레이션 + 익명/PIN 옵션 + 학기 내 보드 재사용) 손상
- ❌ **이미지를 base64가 아닌 다른 방식으로 갑자기 전환** (§7.2 결정 #1 위배 — 결정 변경은 별도 Plan)
- ❌ **이미지 카드당 4장 이상** 또는 **카드 합계 5MB 초과** 허용 (§7.2 결정 #1 위배)
- ❌ **PDF base64 + WebSocket payload 직접** (별도 IPC 채널 우회 의무 — §8.2)
- ❌ **마크다운에 헤딩/언더라인/색상/iframe/marquee/script 추가** (§2.5 OOS + react-markdown allowedElements 화이트리스트 위반)
- ❌ **별표 `**`/`*` 직접 입력 UI** (반드시 Bold/Italic 버튼 UI — 페1 critical-6, B5)
- ❌ **`dangerouslySetInnerHTML` 사용** (한 곳이라도 — XSS 위험)
- ❌ **`C` 단축키 부활** (v2.1에서 명시 제거 — 한글 IME 충돌 critical-3)
- ❌ **sessionStorage로 sessionToken 저장** (v2.1에서 localStorage 영속으로 변경 — 사용자 결정 #5)
- ❌ **PIN 평문 서버 저장** (반드시 클라이언트 SHA-256 hash, 서버는 hash만)
- ❌ **PIN reset 권한을 교사에게 부여** (PIPA 정합 — 교사는 hash만 봄)
- ❌ **hard delete (posts 배열 제거)** (반드시 soft delete + placeholder — 페2 critical-5)
- ❌ **placeholder에서 좋아요/댓글 제거** (데이터 일관성 보존 의무)
- ❌ **moderation 기본값을 `'on'`으로 강제** (사용자 결정 #4 — 기본 'off' + 토글 제공)
- ❌ **moderation 토글 UI 누락** (보드 생성 + 설정 패널 양쪽 모두 필수 — A5)
- ❌ **드래프트 localStorage에 이미지/PDF base64 저장** (quota 초과 위험 — §6 Risks)
- ❌ **드래프트 키에 boardId 누락** (다보드 동시 작성 시 충돌 — A3)
- ❌ **`Intl.Segmenter` 미사용한 글자수 카운트** (한글 grapheme 부정확 — B7)
- ❌ **iOS Safari 백그라운드 재연결 로직 누락** (`useStudentReconnect` 필수 — H-2)
- ❌ **모바일 viewport(<768px)에서 Freeform 드래그 허용** (페2 high-2 — readOnly 강제, C1)
- ❌ **Freeform 자기 카드 기본 unlocked** (반드시 기본 locked + "✏️ 위치 바꾸기" 토글 — 페1 critical, C5)
- ❌ **댓글 입력 정교화 누락** (B9 — 카드만 정교화하고 댓글은 plain text 방치 시 일관성 깨짐)
- ❌ **PIPA 동의 모달 누락** (B11 — 친구 얼굴 사진 첫 첨부 시 1회 안내 의무)
- ❌ **부하 테스트 100명에서 종료** (반드시 150명 — 페3 high-5, NFR + Phase B/C 완료 기준)
- ❌ **`student/` 디렉토리에서 `electron/`·`infrastructure/` import** (Clean Architecture 위반)
- ❌ **학생 entry 번들에 교사 전용 컴포넌트(QueuePanel/Drawer 등) 진입** (v1 import 그래프 정책 위배)
- ❌ **학생 entry 번들 500KB gzipped 초과** (NFR — 이미지/PDF/색상/마크다운/PIN 모두 합쳐도 한도 유지)
- ❌ **WallBoard 스냅샷 schema version bump** (optional 추가만 허용 — 무손실 마이그레이션 보장)
- ❌ **사용자 결정 5건 (v1) 또는 v2.1 신규 결정 5건** 변경
- ❌ **release note에 학생 신규 권한(수정/삭제/PIN) + moderation 기본값 'off' 변경 명시 누락** (운영 책임 고지 의무)

---

## 11. Future Work / Open Questions (v3+ 후속)

본 v2.1 범위 밖. v1 Plan §11과 통합 관리.

### 11.1 v1 Plan §11 항목 (계승)
- **§11.1 학생 1인 다중 카드 허용** — **v2.1에서 구현됨** ✅ (B10)
- **§11.2 학생 카드 위치 드래그 (freeform)** — **본 v2.1 Phase C에서 구현됨** ✅
- **§11.3 부적절 콘텐츠 실시간 필터링** — v2.1도 보류 (단 D6/D7 교사 도구 강화)
- **§11.4 WallBoard schema version bump** — v2.1도 optional 추가만
- **§11.5 학생 댓글 좋아요 / 대댓글** — v3+ 후속
- **§11.6 모바일 PWA installable** — v3+ 후속

### 11.2 v2 → v2.1에서 흡수된 항목 (이전 OOS → 본 Plan In Scope)
- ✅ **이미지 다중 업로드 (포토앨범 3장)** — Phase B에 흡수 (B1)
- ✅ **PDF 첨부** — Phase B에 흡수 (B2)
- ✅ **카드 색상 8색** — Phase B에 흡수 (B3)
- ✅ **댓글 입력 정교화** — Phase B에 흡수 (B9)
- ✅ **moderation OFF 프리셋 토글** — Phase A에 흡수 (A5)
- ✅ **학기 영속 PIN** — Phase D에 흡수 (D5)
- ✅ **교사 모더레이션 도구 강화 (작성자 추적/닉네임 차단)** — Phase D에 흡수 (D6/D7)
- ✅ **모바일 long-press 진입 / 데스크톱 더블클릭** — Phase A에 흡수 (A2, 보드 더블클릭 v2 OOS에서 변경)
- ✅ **PIPA 동의 안내** — Phase B에 흡수 (B11)

### 11.3 v3+ 후속 (v2.1 명시 OOS — 4 페르소나 단일 강력 지적 분류)

| 항목 | v3 후속 Phase | 근거 |
|------|---------------|------|
| **GIF 검색 (Giphy 등)** | **v3 P-GIF** | 페4 단일 강력 M-3. 외부 API 의존 + 학교망 차단 가능. 별도 Feature 검토 |
| **카드 연결선 (Sandbox 패턴)** | **v3 P-Connection** | 페4 M-4. 새 인터랙션 + 도메인 변경 大. Padlet Sandbox 패턴 참고 |
| **태그 / 검색 / 정렬** | **v3 P-Discover** | 페4 M-7. 메타데이터 + 인덱스 신설 필요 |
| **카드 복사/이동 (보드 간)** | **v3 P-CardOps** | 페4 M-10. 보드 간 마이그레이션 정책 + 충돌 해소 필요 |
| **동영상 첨부 (MP4 / 웹캠 녹화)** | v3 P-Video | base64 페이로드 폭증, 인프라 검증 필요 |
| **오디오 녹음** | v3 P-Audio | 자동 자막 인프라 부재 |
| **그리기 (Drawing Canvas)** | v3 P-Draw | 모바일 터치 정밀도 검증 필요 |
| **카메라 (Photo Booth)** | v3 P-Camera | mediaDevices 권한 검증 필요 |
| **AI 이미지 생성 ("I Can't Draw")** | v4+ | 외부 API 비용/가이드 미정 |
| **위치 (Map Pin)** | 별도 Feature | 새 레이아웃 (Map) 신설 필요 |
| **폴 (Poll) 위젯** | 별도 Feature | 카드 내부 위젯 시스템 신설 필요 |
| **rich text editor (헤딩/색상 등)** | v3+ | 가치 대비 복잡도 검증 후 |
| **이미지 base64 → blob URL + 파일 IPC 전환** | v3+ | §7.2 결정 #1 검토 — 5MB·3장 한도가 부담될 경우 |
| **세션 간 드래프트 동기화 (서버 영속)** | v3+ | PIPA 검토 필수 |
| **학생 카드 수정 이력 (Version History)** | v3+ | Padlet도 비공개 |
| **교사 화면 "학생이 삭제한 카드 N개" 카운터** | v3+ | placeholder 카드와 통합 검토 |
| **Activity Indicator (작성 중 표시)** | v3+ | broadcast 추가 + 가치 검증 후 |
| **WCAG AA 완전 준수** | 별도 접근성 Feature | 별도 |
| **`Cmd/Ctrl+Enter` 게시 단축키** | v3+ | 학생 키보드 미숙 + IME-aware 재검토 |
| **부적절 콘텐츠 실시간 필터링** | 별도 Plan `realtime-wall-content-moderation` | moderation OFF 기본 채택 후 별도 검토 |

---

## 12. 한 줄 결론 (v2.1)

쌤핀 실시간 담벼락 v1.14.x 패들렛 모드 위에서, 학생 측 **카드 내용 입력(B) → 추가 진입(A) → 자기 카드 수정·삭제 + 교사 모더레이션 도구(D) → 위치 변경(C)** 4 Phase로 정교화한다. v1 자산(viewerRole 분기, sessionToken 매칭, 12종 broadcast, 회귀 위험 5건)을 절대 손상시키지 않으며, 부적절 콘텐츠 필터링은 v1 §11.3 그대로 보류하되 **moderation OFF 기본 + 교사 추적/차단 도구 강화 + 학기 PIN 옵션**을 추가해 패들렛 정합성과 한국 교실 운영 책임을 양립시킨다.

---

## 13. Next Steps (v2.1)

1. [x] **본 v2.1 Plan 사용자 리뷰/승인** — 4 페르소나 검토 결과 5건 결정 확정 완료 (2026-04-24)
2. [x] **§7.2 결정 9건 모두 사용자 확정** — v2 본문 5건 + v2.1 신규 4건
3. [ ] **`/pdca design realtime-wall-padlet-mode-v2-student-ux` (designer-high 위임)** — IPC 메시지 protocol(5종 신규), 컴포넌트 prop 시그니처(다중 이미지/PDF/색상/PIN/모더레이션 토글), 마이그레이션 절차(optional 필드 추가 + status union 확장), react-markdown allowedElements 최종 확정, Bold/Italic 버튼 툴바 시각, 모바일 long-press/더블클릭 hit area 분리 디자인 상세화
4. [ ] **Phase B 진입** (5~7일) → A(1~2일) → D(3~4일) → C(5~7일) **직진 권장**
5. [ ] 각 Phase 완료마다 `/pdca analyze realtime-wall-padlet-mode-v2-student-ux` Match Rate 측정 → 90%↑ + 회귀 위험 5건 + 신규 critical mitigation 모두 PASS 시 다음 Phase
6. [ ] **출시 윈도우 정렬**: §1.2 권고 (5월 / 7월 / 10월 초) 중 선택. Phase B 완료만으로도 첫 릴리즈 가능 (가장 큰 가치 임팩트)
7. [ ] **부적절 콘텐츠 필터링 Plan**(`realtime-wall-content-moderation`)은 본 v2.1과 무관하게 별도 신설 검토 — moderation OFF 기본 채택으로 우선순위 상승

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-25 | 초안 작성 — Phase A(카드 추가 UX) / B(내용 입력 UX) / C(카드 위치 변경 UX) / D(학생 자기 카드 수정·삭제) 4 Phase 로드맵, 회귀 위험 5건 보존 명시, 부적절 콘텐츠 필터링 v1 §11.3 계승 보류, §7.2 신규 결정 5건 표시, Padlet research §2~§5 출처 명시 | cto-lead (consult: pm/frontend/security/qa) |
| **0.2 (v2.1)** | **2026-04-24** | **4 페르소나(초등 교사 / 중등 교사 / 보안·QA / 패들렛 비교) 검토 반영. 사용자 확정 결정 5건 흡수 (댓글 정교화 + 카드 색상 + PDF + moderation OFF 프리셋 + 학기 PIN). Phase 순서 A→B→C→D를 **B→A→D→C로 재배치** (페 4/4 합의 critical-1). Critical 7건 + High 5건 mitigation 통합. 갱신된 섹션: §1.2 (출시 일정 가이드), §2 (Phase 재배치 + 신규 항목), §3 (FR 재정렬 + 신규), §4 (완료 기준 갱신 + 부하 150명 + 첫 join 1초), §6 (Risks v2.1 추가 표), §7.2 (Decisions 9건 모두 확정), §7.3 (신규 파일 배치 — PIN/PIPA/PDF/색상/교사 도구), §8.2 (WebSocket 5종 + 색상 + PDF + PIN hash + 화이트리스트 + iOS 재연결), §9 (로드맵 B→A→D→C), §10 (Red Flags 대폭 갱신), §11 (Future Work + v3 OOS 명시 — GIF/연결선/태그/카드복사), §12 (한 줄 결론), §13 (Next Steps). v2 본문은 보존, 영향받은 섹션만 v2.1 표기로 갱신. | cto-lead (consult: 4 personas — elementary-teacher / secondary-teacher / security-qa / padlet-comparator) |
