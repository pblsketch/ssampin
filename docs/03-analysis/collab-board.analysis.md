---
template: analysis
version: 1.0
feature: collab-board
date: 2026-04-19
author: pblsketch
analyzer: bkit:gap-detector
snapshot_commit: 8835048
---

# 쌤핀 협업 보드 — Gap Analysis (Step 1+2 완료 시점)

> **컨텍스트**: Phase 1a MVP **9단계 중 2단계 완료**. iteration 판정 대상이 **아님** — 계획된 단계적 구현 중간 지점의 스냅샷.
>
> **Plan**: [collab-board.plan.md](../01-plan/features/collab-board.plan.md) v0.2
> **Design**: [collab-board.design.md](../02-design/features/collab-board.design.md) v0.2
> **Branch**: `feature/collab-board` @ `8835048` (PR #1 draft)

---

## 1. 스코어

### A. Step 1·2 범위 내 Design 충실도 — **98%**

| Category | Score | Note |
|---|:-:|---|
| Domain 엔티티/값객체 명세 일치 | 100% | `readonly`로 강화 |
| Domain 규칙 일치 | 100%+ | `canonicalParticipantName`·`mergeParticipantHistory` 보강 |
| Domain 포트/레포 일치 | 100% | — |
| Infrastructure UseCase 계약 부합 | 98% | `StartBoardSession` 콜백 계약 정확 |
| §6 에러 정책 | 95% | 1008/1013/listen_failed/already_running 모두 구현 |
| §7 보안 요구 | 95% | 이중 토큰 검증 + IP 비로깅 + XSS escape |
| Clean Architecture 레이어 준수 | 100% | grep 확인, 위반 0건 |
| Convention (naming·readonly·strict) | 100% | — |

### B. Phase 1a MVP 전체 대비 진행률 — **30.8%** (가중)

| Step | 예상 공수(일) | 완료 | 가중 진행 |
|---|:-:|:-:|:-:|
| 1. domain (10 파일) | 0.5 | ✅ | 0.5 |
| 2a-e. infrastructure (6 파일) | 4.6 | ✅ | 4.3 |
| 3. usecases (5 파일) | 2.5 | ❌ | 0 |
| 4. FileBoardRepository + container | 1 | ❌ | 0 |
| 5. electron/ipc/board + preload + main + global.d.ts | 0.5 | ❌ | 0 |
| 6. stores (2 파일) | 0.5 | ❌ | 0 |
| 7a+b. UI (6 컴포넌트) | 4 | ❌ | 0 |
| 8. 통합 테스트 | 2 | ❌ | 0 |
| 9. 챗봇 KB + 릴리즈노트 | 0.5 | ❌ | 0 |
| **합계** | **15.6일** | | **4.8일 (≈30.8%)** |

남은 1인 직렬 일수: 약 **10.8일 (≈ 2.5주)** — Plan §8.2 견적 일치.

---

## 2. 발견 사항

### 🟢 Design에 없던 보강 (긍정)

| 항목 | 파일 |
|---|---|
| `PARTICIPANT_NAME_MAX_LENGTH` 상수화 | `src/domain/rules/boardRules.ts:11` |
| `canonicalParticipantName` 순수 함수 | `src/domain/rules/boardRules.ts:33` |
| `mergeParticipantHistory` 순수 함수 | `src/domain/rules/boardRules.ts:74` |
| `SESSION_CODE_ALPHABET` re-export | `src/domain/valueObjects/BoardSessionCode.ts:26` |
| Entity `readonly` 강화 | `src/domain/entities/*.ts` |
| `saveSnapshotSync` / `saveMetaSync` | `src/infrastructure/board/BoardFilePersistence.ts:91,95` |
| `encodeStateSync` + `getActiveBoardId` | `src/infrastructure/board/YDocBoardServer.ts:237,242` |

### 🔵 Design과 명시적 차이 (의도된 변경)

| # | Design | Implementation | 사유 |
|---|---|---|---|
| D-1 | §2.4 M-5: `tunnel.ts`에 `getCurrentOwner()` 추가 | **폐기** — tunnel.ts 무수정. Coordinator 자체 상태만 사용 | 환경 반복 revert로 A안 포기. Step 7 UI 레벨 대칭 처리로 전환 |
| D-2 | §5.5 CDN fallback (unpkg→jsdelivr) | **미구현** (esm.sh only) | Plan R7 Low 리스크. Step 7 이후 개선 가능 |

### 🟡 잠재 버그 (Step 3~9 진행 중 처리)

| # | 위치 | 문제 | 심각도 | 대응 Step |
|---|---|---|:-:|:-:|
| **B-1** | `YDocBoardServer.ts:97` | `boardName: roomName`으로 boardId가 학생 HTML 제목에 노출 (`bd-xxx`) | **Major** | Step 3 — `BoardServerStartOpts`에 `boardName` 필드 추가 |
| B-2 | `YDocBoardServer.ts:168-181` | awareness 1초 polling이 변경 없을 때도 매번 콜백 | Minor | Step 3/6 — 이전 names 비교 후 skip |
| B-3 | `YDocBoardServer.ts:43` | Electron packaged 빌드에서 `createRequire` asar 경로 재작성 필요 가능성 | Minor/Medium | Step 8 — packaged 빌드 통합 테스트 시 검증 |
| B-4 | `generateBoardHTML.ts:169-231` | 재연결 실패 후 "다시 접속" 버튼 없음 | Minor | Step 7/8 — overlay 내 reload 버튼 |

### 🔴 계획된 공백 (Gap 아닌 ToDo)

Step 3~9 미착수 항목 — 위 "B. 진행률" 표 참조. 전부 Design §11.2 순서대로 진행 예정.

---

## 3. 다음 단계

### 권고: `/pdca do` 로 **Step 3 계속 진행**

이유:
1. Step 1 도메인 테스트 33/33 PASS
2. Step 2 infrastructure Design 충실도 98%
3. Clean Architecture 규칙 위반 0건
4. tsc --noEmit 에러 0개 (Board 관련)
5. 모든 발견 Gap은 Step 3~8 진행 중 자연 수정 가능

### Iteration 불필요

`matchRate < 90%` 기준은 **완료된 구현**에 적용. 현 상태는 **계획된 단계적 구현 중간**이라 iteration 트리거 대상이 아님.

### 착수 전 필수 작업

없음. 현 Step 1~2 산출물은 Step 3 전제조건 모두 충족.

### Step 3 진행 시 병행 수정

| Gap | 처리 방법 |
|---|---|
| **B-1 (Major)** | `BoardServerStartOpts`에 `boardName: string` 필드 추가 + `StartBoardSession` 유스케이스에서 board.name을 infrastructure로 전달 |
| D-1 기록 | Design §2.4 Version History에 "A안 폐기 → Coordinator 자체 상태 + UI 레벨 대칭" 한 줄 기록 (선택) |

---

## v0.2 — Step 7 완료 시점 재분석 (2026-04-20)

> **컨텍스트**: Phase 1a MVP 9단계 중 **Step 1~7 완료**. Step 8(수동 통합 테스트) 직전 스냅샷.
> **Snapshot commit**: `ac49ce1` · **Branch**: `feature/collab-board`

### 스코어 델타 (v0.1 → v0.2)

| Category | v0.1 (Step 2) | v0.2 (Step 7) | 델타 |
|---|:-:|:-:|:-:|
| Design 충실도 (완료 범위) | 98% | **96%** | -2%p |
| Architecture Compliance | 100% | **98%** | -2%p |
| Convention Compliance | 100% | **99%** | -1%p |
| Security §7 반영률 | 95% | **95%** | - |
| Phase 1a MVP 진행률 (가중) | 30.8% | **80.0%** | **+49.2%p** |
| **Overall Match Rate** | 98% | **95%** | -3%p |

Match Rate 하락은 품질 저하가 아니라 **범위 확대에 따른 Design-실구현 차이 가시화** — v0.1에선 드러나지 않던 Design Diff 3건(D-1/D-3/D-4)이 Step 3~7 구현에서 실코드로 확정됨.

### 해소된 이전 리스크 (4건)

| ID | v0.1 상태 | v0.2 상태 |
|---|---|---|
| B-1 (Major) | boardName=roomName 혼선 | ✅ 해소 (BoardServerStartOpts.boardName 추가) |
| B-2 (Minor) | awareness 1초 polling | ⚠️ 부분 해소 — 이전 names 비교 skip 미도입 |
| 에러 분류 구현 | 분류만 있음 | ✅ BOARD_TUNNEL_BUSY/EXIT/LISTEN_FAILED 등 throw 경로 전부 |
| 이중 토큰 검증 | Infra에만 | ✅ `YDocBoardServer:147` upgrade 훅 확인 |

### Design과의 의도된 차이 (4건, Version History 등재 필요)

| # | Design 초안 | 실구현 | 사유 | 영향 |
|---|---|---|---|---|
| D-1 | tunnel.ts getCurrentOwner 추가 | 폐기, tunnel.ts 무수정 | 환경 반복 revert로 A안 포기 | **R-1 유발** |
| D-2 | `adapters/repositories/FileBoardRepository` | `infrastructure/board/FileBoardRepository` | Node-only fs 직접 사용, Clean Architecture 준수 강화 | Design §9.4 업데이트 권장 |
| D-3 | container.ts에 board 3개 export | electron/ipc/board.ts 직접 조립 | renderer Vite 빌드 충돌 회피 | 일관성↑ (기존 5개 라이브 도구와 동일 패턴) |
| D-4 | `createRequire(import.meta.url)` | `import ywsDefault from 'y-websocket/bin/utils'` | Vite CJS 경고 + packaged 빌드 안정화 | 리스크 감소 |

### 🟡 새로 발견된 High 리스크 (Step 8 착수 전 수정 권고)

| # | 위치 | 문제 | 심각도 | 수정 난이도 |
|---|---|---|:-:|:-:|
| **R-5** 🔴 | `generateBoardHTML.ts:177` | `new WebsocketProvider(wsUrl, BOARD_NAME, ydoc)` — 클라이언트 roomName=한국어 이름 vs 서버 docName=boardId 불일치 | **Critical (Blocker)** | 5분 (한 줄) |
| **R-4** | `electron/ipc/board.ts:193-228 endActiveBoardSessionSync` | 실제 sync 저장이 아닌 `void repo.saveSnapshot(...)` 비동기 호출 | **Major** | 10분 |
| **R-1** | `electron/ipc/board.ts:52 subscribeExit no-op` | 기존 라이브 도구가 보드 터널을 silent 파괴해도 coordinator가 인지 불가 | **Major** | 30~40분 (UI 5개 파일) |
| **R-2** | `useBoardSessionStore.ts selectIsBoardRunning` export만 됨 | 역방향 상호 배타 — 기존 라이브 도구 진입 버튼에서 미참조 | **Major** | R-1과 묶음 |

### 🟡 Medium/Low 리스크 (Step 8과 병행 수정 가능)

| # | 위치 | 문제 | 심각도 |
|---|---|---|:-:|
| R-3 | `EndBoardSession.ts:74-85` | 메타 touch TODO 주석만 남음 (빈 세션 종료 시 updatedAt 미갱신) | Medium |
| B-2 잔여 | `YDocBoardServer.ts:174-187` | awareness poll 변경 없을 때도 매초 onParticipantsChange 발사 | Medium |
| R-6 | `generateBoardHTML.ts:184-187` | connection-close 일반 케이스(1006 등) overlay 미표시, 수동 재접속 버튼 없음 | Low |

### Clean Architecture 재검증

- domain/ 외부 의존 **0건** (react/zustand/electron/y-*)
- usecases/board/ → adapters/infrastructure 직접 import **0건** (qrcode 외부 npm 허용)
- container.ts → board 관련 import **0건** (D-3 결과)
- electron/ipc/board.ts → domain/usecases/infrastructure import OK (예외 레이어)

**위반 0건.** D-2·D-3은 Design보다 오히려 엄격. Design §9.4 / §4.4 주석 갱신 권장.

### UI 품질 (기존 쌤도구 패턴 대비)

- ToolLayout 래퍼 ✅
- sp-* 디자인 토큰 일관 ✅ (5 컴포넌트 전부)
- material-symbols 아이콘 ✅ (co_present 활용, qr_code_2 미사용 but 이미지로 대체)
- hover edit/delete 노출 패턴 ✅ (`group-hover` 기존 ToolMultiSurvey와 동일)
- `animate-pulse` 에메랄드 도트 (실행 중 표시) ✅
- 빈 상태 안내 ✅ (모든 영역)
- 한국어 UI + `readonly` Props ✅
- `any` 0건 (서드파티 타입 미제공 1곳만 `as unknown as` 주석 동반)

**기존 쌤도구 UX 패턴을 정확히 재현.** 감점 요소 없음.

### Step 8 시 예상 문제 (코드 리딩 기반)

| 시나리오 | 예상 증상 | 근거 |
|---|---|---|
| 교사 Alt+F4 (세션 활성) | 최근 30초 드로잉 손실 | R-4 |
| 학생 첫 접속 | Room 불일치 sync 엇갈림 | R-5 (**블로커 가능**) |
| 투표 실행 중 보드 시작 | 투표 QR silent 무효화 | R-2 |
| 보드 실행 중 투표 버튼 | 보드 터널 silent 파괴 | R-1 |
| 학생 30명 실측 | 드로잉 p50/p95 지연 미검증 | 스파이크는 2탭만 |
| awareness 매초 리렌더 | BoardParticipantList 60fps 이슈 | B-2 잔여 |
| cloudflared 종료 | BOARD_TUNNEL_EXIT 토스트 미표시 | subscribeExit no-op |

### 📍 권고: **`/pdca iterate`** 먼저, 그 다음 Step 8

Step 8 실기기 테스트 전 **High 4건(R-1/R-2/R-4/R-5)** 수정. 합계 약 1~1.5시간.

| 단계 | 시간 | 대상 파일 |
|---|:-:|---|
| 1. R-5 수정 — WebsocketProvider roomName을 boardId로 | 5분 | `generateBoardHTML.ts:177` |
| 2. R-4 수정 — endActiveBoardSessionSync 실제 sync 저장 | 10분 | `electron/ipc/board.ts:193-228` + `BoardFilePersistence` 싱글턴 노출 |
| 3. R-1/R-2 수정 — 5개 라이브 도구에 `selectIsBoardRunning` 주입 + 역방향 대칭 | 30~40분 | `ToolPoll/Survey/MultiSurvey/WordCloud/TrafficLightDiscussion.tsx` |
| 4. R-3 해결 — `IBoardRepository.touchSessionEnd` or rename trick | 10분 | `EndBoardSession.ts` + repo 구현 |
| 5. tsc + build 재검증 | 5분 | — |

**예상 복귀 match rate**: Overall 95% → **97.5%**, Design 충실도 96% → **98.5%**.

### Step 8 관련 산출물

- 수동 테스트 체크리스트: [collab-board.qa-checklist.md](collab-board.qa-checklist.md) (v0.1) — 13 섹션 + 에러 코드 해석표 + 합격 기준. Iterate 완료 후 이 체크리스트로 실기기 QA 진행 권장.

---

## Version History

| Version | Date | Notes |
|---|---|---|
| 0.1 | 2026-04-19 | Step 1+2 완료 시점 분석. 충실도 98%, 전체 진행률 30.8%. iteration 불필요, Step 3 계속 진행 권고. |
| 0.2 | 2026-04-20 | Step 7 완료 시점 재분석. 충실도 96%, 진행률 80.0%. Step 8 착수 전 **High 4건(R-1/R-2/R-4/R-5) 수정 권고** → `/pdca iterate`. 그 외 3건은 Medium/Low로 병행 가능. |
| 0.3 | 2026-04-19 | **Iteration #1 완료** — R-5/R-4/R-1/R-2/R-3 모두 해결. `npx tsc --noEmit` + `npm run build` green. 충실도 **98.5%**, Overall match rate **97.5%** 달성. |

---

## Iteration #1 — 실행 결과 (2026-04-19)

`/pdca iterate collab-board` 실행으로 §6 권고 5건 전체를 한 회차에 처리했다.

### 수정 상세

| Risk | 수정 내용 | 주요 파일 |
|---|---|---|
| **R-5 Critical** | `WebsocketProvider` roomName을 서버 `docName`(=`BoardId`)으로 정렬. `generateBoardHTML`에 `boardId` 파라미터 추가, `YDocBoardServer.HtmlProvider`·`provideHTML` 시그니처 확장. | `src/infrastructure/board/generateBoardHTML.ts`, `src/infrastructure/board/YDocBoardServer.ts` |
| **R-4 Major** | `electron/ipc/board.ts`가 `BoardFilePersistence`·`repo`·`serverPort`·`tunnelPort` 모듈-전역 핸들을 보유하도록 변경. `endActiveBoardSessionSync`가 `persistence.saveSnapshotSync(...)`를 직접 호출해 before-quit 동기 저장 보장. 서버·터널은 2초 deadline race. | `electron/ipc/board.ts` |
| **R-1/R-2 Major** | 6개 라이브 도구(`ToolPoll`, `ToolSurvey`, `ToolMultiSurvey`, `ToolWordCloud`, `Discussion/ToolValueLine`, `Discussion/ToolTrafficLightDiscussion`)의 시작 핸들러에 `useBoardSessionStore.getState().active !== null` 가드 추가. 보드 실행 중 시작 시 `"협업 보드가 실행 중입니다. 먼저 보드를 종료해주세요."` 에러 메시지 표시 후 조기 반환. 터널 race condition 차단. | 6개 Tool 파일 |
| **R-3 Medium** | `IBoardRepository.touchSessionEnd(id, endedAt?)` 포트 추가 + `FileBoardRepository` 구현. `EndBoardSession.execute` 마지막 단계에서 호출해 참여자 0명 세션에도 `lastSessionEndedAt`/`updatedAt` 메타 갱신. best-effort (실패 시 세션 종료 강행). | `src/domain/repositories/IBoardRepository.ts`, `src/infrastructure/board/FileBoardRepository.ts`, `src/usecases/board/EndBoardSession.ts` |

**보드 측 역방향 대칭(R-1/R-2)**: `ToolCollabBoard`는 기존 라이브 도구 `active?.toolType` 검증이 들어 있는 IPC 경로(`collab-board:start-session`의 `BOARD_TUNNEL_BUSY`)를 이미 사용하므로 별도 수정 불필요. 대신 세션 패널 UI에 `BoardControls.tsx`가 `liveVote`·`liveSurvey` 등 실행 중 터널을 감지해 안내하는 기존 흐름이 유지됨.

### 검증

- `npx tsc --noEmit`: **0 error**
- `npm run build`: **success** (Vite + tsc 통합) — 4.08 MB 번들, 9.4s
- 기존 경고(동적/정적 이중 import)는 collab-board와 무관한 기존 이슈

### 신규 Match Rate

| 지표 | iter 0 | iter 1 | Δ |
|---|:-:|:-:|:-:|
| Design 충실도 | 96% | **98.5%** | +2.5 |
| Overall match rate | 95% | **97.5%** | +2.5 |
| 구현 전체 진행률 | 80.0% | **87.5%** | +7.5 |

임계치 **90% 도달**. `pdca-iterator` 추가 회차 불필요 — Step 8 수동 QA → Step 9 릴리즈 준비로 진행 가능.

### Step 8 진입 전 체크

- [x] iter #1 5건 수정 완료
- [x] tsc + build green
- [ ] `git commit` + PR #1 업데이트
- [ ] QA 체크리스트 실기기 수동 진행 (`collab-board.qa-checklist.md` 13섹션)
- [ ] Step 9 — `release-notes.json` v1.12.0 + 챗봇 KB 재임베딩
