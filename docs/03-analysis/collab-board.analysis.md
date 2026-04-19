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

## Version History

| Version | Date | Notes |
|---|---|---|
| 0.1 | 2026-04-19 | Step 1+2 완료 시점 분석. 충실도 98%, 전체 진행률 30.8%. iteration 불필요, Step 3 계속 진행 권고. |
