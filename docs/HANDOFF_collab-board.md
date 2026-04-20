---
title: 협업 보드(collab-board) 작업 인계
date: 2026-04-20
branch: feature/collab-board
latest_commit: 7fb372c
status: Step 8 QA 대부분 통과, Step 9 릴리즈 대기
---

# 협업 보드 작업 인계 — 새 세션용

> **목적**: 새 Claude 세션이 이 파일만 읽고도 협업 보드 feature 현재 상태·남은 작업·주의사항을 즉시 파악할 수 있도록.

---

## 1. 한 줄 요약

쌤핀 v1.12.0용 "협업 보드" 기능(Jamboard 대안) Phase 1a MVP 구현 완료 + iter #1~#5 + 베타 표시까지 끝났고, **Step 9 릴리즈 워크플로우**와 **PR #1 리뷰·머지**만 남음. 릴리즈는 **타 세션 기능 완료 대기 중**이라 보류.

---

## 2. 현재 상태

| 항목 | 값 |
|---|---|
| 브랜치 | `feature/collab-board` |
| 최신 커밋 | `7fb372c` — 베타 배지 + 안내 배너 |
| PR | #1 (draft) on `pblsketch/ssampin` |
| 대상 버전 | v1.12.0 (현재 package.json 1.10.1) |
| 최신 빌드 | `release/ssampin-Setup.exe` (21:59, 119 MB) |
| 설계 일치도 | 97.5% (iter #1 기준) + 런타임 동작 수정 완료 (iter #5) |

---

## 3. 완료된 것

### 구현 (Step 1~7)
- **도메인 10파일**: `BoardId/BoardAuthToken/BoardSessionCode` 브랜디드 타입, `Board/BoardSession/BoardParticipant` 엔티티, `boardRules`(33/33 테스트), `IBoardRepository/IBoardServerPort/IBoardTunnelPort` 포트
- **인프라 7파일**: `BoardFilePersistence`, `BoardTunnelCoordinator`, `YDocBoardServer`(Y.js + y-websocket), `generateBoardHTML`(esm.sh CDN), `FileBoardRepository`
- **유스케이스 6파일**: `ManageBoard`, `StartBoardSession`, `EndBoardSession`, `SaveBoardSnapshot`, `AuthorizeBoardJoin`
- **Electron IPC 14채널**: `collab-board:*` (list/create/rename/delete/start/end/save/active/tunnel-*) + before-quit 동기 저장
- **스토어 2개**: `useBoardStore`, `useBoardSessionStore`
- **UI 6컴포넌트**: `ToolCollabBoard`, `BoardListPanel`, `BoardControls`, `BoardQRCard`, `BoardParticipantList`, `BoardSessionPanel`

### 버그 수정 (iter #1~#5)

| Iter | 내용 | Commit |
|---|---|---|
| #1 | gap-detector 5건(R-1~R-5) 해소 | `985df63` |
| #2 | y-websocket `params:` 옵션 전환 (예방) | `faadfac` |
| #3 | 클라이언트 진단 로그 추가 (유지) | `c147914` |
| #4 | **CSS `[hidden]` vs `display:flex` 우선순위 버그** (실제 접속 불가 원인) | `1735b36` |
| #5 | **자동 저장 실질 미구현 수정** + 참여자 이력 UI + 카드 문구 | `408a98a` |

### 베타 표시
- ToolsGrid 협업 보드 카드에 앰버 `BETA` 배지
- ToolCollabBoard 페이지 상단 베타 안내 배너 + 피드백 메일 링크

### 문서
- `docs/01-plan/features/collab-board.plan.md` (v0.2)
- `docs/02-design/features/collab-board.design.md` (v0.2)
- `docs/03-analysis/collab-board.analysis.md` (**v0.5** — iter #5까지 통합)
- `docs/03-analysis/collab-board.qa-checklist.md` (v0.1)
- `docs/04-report/features/collab-board.report.md` (v1.0)

---

## 4. 남은 작업

### 🔄 Step 8 — 수동 QA 잔여 (사용자가 할 일)

통과 완료:
- [x] 학생 QR 접속·이름 입력·드로잉
- [x] 실시간 동기화 (학생 여러 명)
- [x] 세션 종료 후 새 세션 시작
- [x] 자동 저장(iter #5 재빌드 후) — **사용자 재확인 필요**

재확인 필요 (iter #5 빌드 21:40 이후):
- [ ] 30초 자동 저장 → 우측 패널 "마지막 자동 저장: 방금" 표시
- [ ] `%APPDATA%\쌤핀\data\boards\{boardId}.ybin` 파일 크기 증가 확인 (KB 단위)
- [ ] 강제 종료 → 재실행 → 드로잉 복원
- [ ] "이 보드를 썼던 학생들" 토글 — 과거 이름 리스트 + 현재 접속자 초록 강조
- [ ] 라이브 도구 가드 (보드 실행 중 투표/설문/워드클라우드 시작 차단)
- [ ] 역방향 가드 (라이브 도구 실행 중 보드 시작 시 터널 충돌 안내)

스킵 가능:
- MAX_PARTICIPANTS 50명 상한 (실기기 부족)

### ⏸️ Step 9 — 릴리즈 (타 세션 완료 대기)

타 세션(`/pdca do 발제피드백응답모아보기` — 다른 기능)이 main에 머지되면 재개. [`~/.claude/projects/e--github-ssampin/memory/MEMORY.md`](file://C:\Users\wnsdl\.claude\projects\e--github-ssampin\memory\MEMORY.md) 릴리즈 워크플로우 8단계 참조.

핵심 단계:
1. `git rebase main` on feature/collab-board (충돌 해소 필수)
2. 버전 번호 6곳 수동 업데이트 (1.10.1 → 1.12.0)
3. `public/release-notes.json` v1.12.0 항목 — 협업 보드 BETA 명시
4. 챗봇 KB 재임베딩 (`scripts/ingest-chatbot-qa.mjs`에 협업 보드 Q&A 추가 후 실행)
5. 노션 사용자 가이드 업데이트
6. 커밋 + 푸시
7. Windows 빌드 (`npm run electron:build`) — 기존 release/ exe 덮어쓰기
8. macOS 빌드 (`gh workflow run "Build macOS" --ref main`)
9. GitHub Release 생성 (Win .exe + latest.yml + Mac .dmg 2개 + latest-mac.yml)

### 🔀 PR #1 처리

- 현재 `draft`. Step 9 진입 시점에 rebase → Ready-for-review → merge → tag `v1.12.0`.

### 🚀 Phase 2 (차후, 별도 Plan 문서)

- Undo/Redo 복원 (y-excalidraw 2.0.12 `setupUndoRedo` null-check 버그 해결 후)
- 드로잉 export (PNG/PDF)
- 실시간 cursor 표시 (awareness 1초 폴링 → WebSocket push)
- 터널 상호 배타 강화 (`tunnel.ts`에 `getCurrentOwner` polyfill)

---

## 5. 절대 놓치지 말아야 할 교훈

### 🔥 "동작한다"의 기준은 UI 토스트가 아니라 실제 파일 바이트

iter #5에서 가장 큰 교훈. gap-detector match rate 97.5% + UI에 "자동 저장됨" 표시까지 다 떴지만 실제 `.ybin` 파일은 빈 데이터였음. **앞으로 협업 보드 관련 QA는 반드시 `%APPDATA%\쌤핀\data\boards\{boardId}.ybin` 파일 크기 증가를 직접 확인할 것**.

### 🔥 외부 라이브러리가 내부 상태를 자체 관리하는 경우

y-websocket의 `setupWSConnection`은 자기 내부 `docs` Map에 WSSharedDoc을 생성. 외부에서 `new Y.Doc()` 만들어 리스너 걸어도 안 닿는다. 반드시 `ywsUtils.docs.get(roomName)`처럼 라이브러리가 제공하는 훅을 통해 실제 객체를 획득할 것. 유사 패턴(`setupXxxConnection` 류)을 쓰는 다른 라이브러리도 같은 함정 있음.

### 🔥 Electron main process `console.warn`은 renderer DevTools에 안 뜬다

서버 로직 디버깅할 때 main에 `console.warn` 찍어도 학생/교사 브라우저 DevTools에서 보이지 않음. 반드시 **클라이언트 측 `console.log`**로 대체하거나 IPC로 렌더러에 포워드해야 한다. iter #3의 `[board]` 진단 로그를 정식 릴리즈에도 유지 결정한 이유.

### 🔥 HTML `hidden` attribute는 CSS 우선순위에 쉽게 진다

`[hidden] { display: none }`(UA 기본)은 ID 셀렉터 `#foo { display: flex }`에 이김. 모달 류 요소 만들 때 반드시 `#foo[hidden] { display: none !important }` 추가할 것. iter #4의 실기기 접속 불가 원인.

### 🔥 타 세션 WIP 존중

사용자가 여러 Claude 세션을 병행한다. 이 리포는 `발제피드백응답모아보기` 기능이 동시에 진행됨. `ToolMultiSurvey.tsx` 등은 타 세션의 WIP이니 건드리지 말 것. tsc 에러가 나와도 그 파일은 무시 (본 세션 스코프 아님).

---

## 6. 주요 파일 경로표

### 도메인/인프라
- [src/domain/entities/Board.ts](../src/domain/entities/Board.ts) 등 10개
- [src/infrastructure/board/YDocBoardServer.ts](../src/infrastructure/board/YDocBoardServer.ts) — **iter #5 핵심 수정 파일**
- [src/infrastructure/board/generateBoardHTML.ts](../src/infrastructure/board/generateBoardHTML.ts) — **iter #2/#4 수정, 진단 로그 유지**
- [src/infrastructure/board/BoardFilePersistence.ts](../src/infrastructure/board/BoardFilePersistence.ts)
- [src/infrastructure/board/FileBoardRepository.ts](../src/infrastructure/board/FileBoardRepository.ts)

### UI
- [src/adapters/components/Tools/ToolCollabBoard.tsx](../src/adapters/components/Tools/ToolCollabBoard.tsx) — 베타 배너
- [src/adapters/components/Tools/Board/BoardSessionPanel.tsx](../src/adapters/components/Tools/Board/BoardSessionPanel.tsx) — 참여자 이력 UI
- [src/adapters/components/Tools/Board/BoardControls.tsx](../src/adapters/components/Tools/Board/BoardControls.tsx) — 세션 종료 시 store reload
- [src/adapters/components/Tools/ToolsGrid.tsx](../src/adapters/components/Tools/ToolsGrid.tsx) — BETA 배지

### Electron
- [electron/ipc/board.ts](../electron/ipc/board.ts) — 14개 IPC 채널 + before-quit 동기 저장
- [electron/preload.ts](../electron/preload.ts) — `window.electronAPI.collabBoard`
- [electron/main.ts](../electron/main.ts) — `registerBoardHandlers` 등록

### 스토어
- [src/adapters/stores/useBoardStore.ts](../src/adapters/stores/useBoardStore.ts)
- [src/adapters/stores/useBoardSessionStore.ts](../src/adapters/stores/useBoardSessionStore.ts)

### PDCA 문서
- [docs/01-plan/features/collab-board.plan.md](01-plan/features/collab-board.plan.md)
- [docs/02-design/features/collab-board.design.md](02-design/features/collab-board.design.md)
- [docs/03-analysis/collab-board.analysis.md](03-analysis/collab-board.analysis.md) — v0.5 최신
- [docs/03-analysis/collab-board.qa-checklist.md](03-analysis/collab-board.qa-checklist.md)
- [docs/04-report/features/collab-board.report.md](04-report/features/collab-board.report.md)

---

## 7. 빠른 리오리엔테이션 명령 (새 세션에서 실행)

```bash
cd e:/github/ssampin
git status                                            # 브랜치 확인
git log --oneline feature/collab-board ^main | head  # 이번 feature 커밋 전체
cat docs/HANDOFF_collab-board.md                     # 이 문서
cat docs/03-analysis/collab-board.analysis.md        # 상세 이력
```

또는 새 세션에 이렇게 말하면 즉시 컨텍스트 로드:

> "협업 보드 작업 이어서 할게. docs/HANDOFF_collab-board.md 읽고 시작해줘."

---

## 8. 알려진 리스크 / 주의사항

- **1.10.1 → 1.12.0** 버전 번호 점프: 1.11.0은 타 세션(`발제피드백`) 용으로 예정 가능성. 릴리즈 순서 조율 필요.
- **PR rebase 충돌**: 다음 파일들은 타 세션도 건드릴 수 있어 rebase 시 충돌 가능성 높음:
  - `src/adapters/components/Tools/ToolsGrid.tsx` (협업 보드 카드 badge 추가)
  - `package.json` (버전 번호)
  - `public/release-notes.json` (버전 항목)
- **진단 로그 제거 여부**: iter #3의 클라이언트 `[board]` 로그는 유지 결정됨. 만약 학교 Wi-Fi에서 문제 재발 없이 안정 운영되면 v1.13 쯤 제거 고려.
- **y-excalidraw setupUndoRedo 버그**: Phase 2에서 해결 전까지 Undo 비활성. 상용 릴리즈에서 교사가 "되돌리기 왜 안 돼요"라고 물을 수 있으니 가이드/챗봇 KB에 명시 필요.

---

*Written by Claude (Opus 4.7) — 2026-04-20 evening*
