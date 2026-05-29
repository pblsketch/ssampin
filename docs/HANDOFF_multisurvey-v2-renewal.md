# HANDOFF — 복합 유형 설문 RB 수준 리뉴얼 (multisurvey-RB-renewal)

**작성**: 2026-05-22 (deep-interview + ralplan + Plan/Design + Phase 0 완료 시점)
**다음 세션 시작점**: Phase A (Domain + Migration) 진입
**ultragoal 상태**: 1/5 complete (G001 ✓), G002 active, G003~G005 pending

---

## 새 세션 시작 시 30초 안내

1. **컨텍스트 복구 명령** (가장 먼저):

   ```bash
   # Windows PowerShell or Bash
   node "C:/Users/wnsdl/.claude/plugins/cache/omc/oh-my-claudecode/4.14.1/bridge/cli.cjs" ultragoal status
   ```

   → G002 (Phase A) active 상태 확인

2. **5개 문서 정독** (이 순서로):
   - [docs/HANDOFF_multisurvey-RB-renewal.md](HANDOFF_multisurvey-RB-renewal.md) (이 파일, 가장 먼저)
   - [docs/01-plan/features/multisurvey-RB-renewal.plan.md](01-plan/features/multisurvey-RB-renewal.plan.md) (Plan v1.0)
   - [docs/02-design/features/multisurvey-RB-renewal.design.md](02-design/features/multisurvey-RB-renewal.design.md) (Design v0.1)
   - [docs/03-analysis/multisurvey-RB-renewal.open-questions.md](03-analysis/multisurvey-RB-renewal.open-questions.md) (Open Questions, Q2 완료)
   - [prototype/realtime-tool-spike/](../prototype/realtime-tool-spike/) (Phase 0 산출물 — wireframes 4장 + toggle-placement + component-tree + domain-notes)

3. **다른 세션이 작업 중인 파일 절대 건드리지 말기**:
   - `src/adapters/components/Widget/**` (widget-inline-ux 세션)
   - `src/adapters/components/Settings/tabs/WidgetTab.tsx`
   - `src/widgets/components/**`
   - `src/adapters/hooks/useDesktopModeFallback.ts`
   - `src/adapters/stores/useSettingsStore.ts` (다른 세션도 작업 중)
   - `src/adapters/stores/useModalCoordinatorStore.ts`
   - `src/domain/entities/RealtimeWall.ts`
   - `src/domain/rules/realtimeWallRules.ts`
   - `src/domain/valueObjects/AnalyticsEvent.ts`
   - `src/infrastructure/board/generateBoardHTML.ts`
   - `git status`로 항상 먼저 확인 (메모리 `feedback_neis_schedule_other_session.md` 참조)

---

## Phase A 작업 TODO (예상)

Plan §5.1 + Design §1.1 기준으로 분해:

### A.1 신규 도메인 엔티티 (Clean Architecture 4-layer 룰 준수)

- [ ] `src/domain/entities/multiSurvey/MultiSurveyV2.ts` — formatVersion 2, presentationOpts/responseOpts/displayOpts (Design §2.1)
- [ ] `src/domain/entities/multiSurvey/Question.ts` — 5종 유형 union (Design §2.2). domain-notes.md DN-01 (BlankQuestion isHangulInitial=true) 반영
- [ ] `src/domain/entities/multiSurvey/Response.ts` — **isCorrect: boolean 필수** (domain-notes.md DN-02), submittedAt, scoreBreakdown
- [ ] `src/domain/entities/multiSurvey/LiveSession.ts` — phase: 'lobby' | 'open' | 'revealed' | 'round_result' | 'podium' | 'end' (domain-notes.md DN-03 round_result 추가)
- [ ] `src/domain/entities/multiSurvey/MigrationReport.ts` (Design §2.3)

### A.2 도메인 규칙·포트

- [ ] `src/domain/rules/multiSurveyRules.ts` — validateSession, calcScore, isAnswerCorrect, **isAutoAdvanceReady (DN-04)** — 자동 진행 복합 조건 단일 함수
- [ ] `src/domain/ports/IMultiSurveyMigrator.ts` (Design §2.4)

### A.3 마이그레이션 어댑터

- [ ] `src/adapters/multiSurvey/migration/v1ToV2.ts` — forward 변환. **DN-08 v1 타입명 실측 매핑** 후 작성 (`'objective' → 'multiple'` 등)
- [ ] `src/adapters/multiSurvey/migration/v2ToV1.ts` — backward 변환 (라운드트립 검증용, 옵션 정보 손실 허용)
- [ ] `src/adapters/multiSurvey/migration/backupWriter.ts` — `.ssampin/backup/v1/<timestamp>/sessions.json + metadata.json + failed/`
- [ ] `src/adapters/multiSurvey/migration/__tests__/roundtrip.test.ts` — v1 → v2 → v1' 질문/정답 byte-equal

### A.4 IPC + 가드

- [ ] `electron/ipc/_formatVersionGuard.ts` — sync 입력 데이터 `formatVersion: 2` + 본인 앱이 v2.0.x면 throw + 모달 트리거 (Design §4.4)
- [ ] `electron/ipc/multiSurveyMigration.ts` — v1 발견 시 자동 변환 + 백업 + 리포트 (Design §1.1)

### A.5 메타테스트 (Plan §6 메타테스트 #1, #3)

- [ ] `src/infrastructure/__tests__/syncRegistry.meta.test.ts` — `.ssampin/backup/v1/`이 syncRegistry에 등록 시 fail
- [ ] `src/infrastructure/__tests__/builderFiles.meta.test.ts` — `!prototype/**` 포함 여부

### A.6 npm scripts

- [ ] `scripts/migration-roundtrip.mjs` — `npm run migration-roundtrip`. **5단계 분리 명령 패턴 준수** (Plan §5.2 D11, CLAUDE.md 빌드 회피 패턴)
- [ ] `scripts/check-flag-usage.mjs` — Phase B에서 쓸 grep 게이트 (`useRealtimeToolFlag` ≤ 3개) 미리 작성

### A.7 electron-builder.yml 격리

- [ ] `electron-builder.yml` files 패턴에 `!prototype/**` 추가 — prototype 디렉토리 main 빌드 제외

### A.8 검증 게이트 5단계 통과

- [ ] `npx tsc --noEmit` (0 에러)
- [ ] `npm run lint` (0 에러)
- [ ] `npm run test` (1566 + 신규 통과)
- [ ] `npm run regression-check` (통과)
- [ ] `npm run migration-roundtrip` (손실 0 byte)

---

## Phase 0 산출물 — Phase A에서 즉시 참조해야 할 것

### prototype/realtime-tool-spike/domain-notes.md (10 항목)

| ID    | 도메인 요구사항                                                           | Phase A 반영 위치                                              |
| ----- | ------------------------------------------------------------------------- | -------------------------------------------------------------- |
| DN-01 | BlankQuestion에 `isHangulInitial: boolean` (초성 제거 옵션)               | Question.ts                                                    |
| DN-02 | Response.isCorrect: boolean **필수** (포디움 정답률 계산)                 | Response.ts                                                    |
| DN-03 | LivePhase에 `'round_result'` 추가                                         | LiveSession.ts                                                 |
| DN-04 | `isAutoAdvanceReady()` 함수 — 자동 진행 복합 조건 단일 함수               | multiSurveyRules.ts                                            |
| DN-05 | LiveSession에 `studentInteractions[]` (학생 wait 화면 캐릭터 클릭 이벤트) | LiveSession.ts                                                 |
| DN-06 | STUDENT_WAVE IPC 이벤트 (학생 wait 캐릭터 클릭 → 교사 화면 표시)          | multiSurveyMigration.ts (아니, 별도 IPC 신설)                  |
| DN-07 | Settings에 `realtimeToolV2Enabled` persist (Phase B로)                    | useSettingsStore.ts (Phase B로 미루기 — 다른 세션과 충돌 회피) |
| DN-08 | v1 타입명 실측 매핑 (`'objective' → 'multiple'` 등)                       | v1ToV2.ts 작성 전 v1 코드 분석 필수                            |
| DN-09 | MigrationReport에 `failedItems: { sourceId, reason, preservedRaw }[]`     | MigrationReport.ts                                             |
| DN-10 | `.ssampin/backup/v1/` 30일 자동 정리 정책                                 | backupWriter.ts                                                |

### prototype/realtime-tool-spike/toggle-placement.md (확정)

- 그룹 1 = **발표 설정** (T01~T03)
- 그룹 2 = **응답 설정** (T04~T08)
- 그룹 3 = **표시 설정** (T09~T10)
- UI 배치 = **P (메이커 우측 인라인 사이드패널)**

---

## 새 세션에서 Phase A 시작 명령

```bash
# 1. ultragoal 상태 확인
node "C:/Users/wnsdl/.claude/plugins/cache/omc/oh-my-claudecode/4.14.1/bridge/cli.cjs" ultragoal status

# 2. Plan + Design 정독 (Read 도구)

# 3. /goal 설정 (Claude /goal slash command 권장)
#    /goal Phase A Domain Plus Migration — MultiSurveyV2 엔티티 + formatVersion 2 + v1↔v2 라운드트립 + ...

# 4. Phase A 작업 시작 (위 TODO A.1~A.7 순서)

# 5. 검증 게이트 5단계 통과 (A.8)

# 6. checkpoint
node "C:/Users/wnsdl/.claude/plugins/cache/omc/oh-my-claudecode/4.14.1/bridge/cli.cjs" ultragoal checkpoint \
  --goal-id G002-phase-a-domain-plus-migration-multis \
  --status complete \
  --evidence "..." \
  --claude-goal-json '...'

# 7. G003 (Phase B) handoff
node "C:/Users/wnsdl/.claude/plugins/cache/omc/oh-my-claudecode/4.14.1/bridge/cli.cjs" ultragoal complete-goals
```

---

## 본 세션에서 결정된 것 (요약)

ralplan consensus 3차 + Phase 0:

| #                 | 결정                                                                   |
| ----------------- | ---------------------------------------------------------------------- |
| D1                | Option D — feature flag + 단일 v2.1.0 (사용자 인지 1회)                |
| D2                | Phase 0 UI 스파이크 선행 (도메인 추측 굳히기 방지)                     |
| D3                | `formatVersion: 2` + v1↔v2 라운드트립 무손실                           |
| D4                | 멀티 PC sync 완전 차단 (부분 동작 금지)                                |
| D5                | `useRealtimeToolFlag()` facade + 분기 ≤3개                             |
| D6                | 미감 게이트 정량/정성 라벨링                                           |
| D7                | Percy/Chromatic 미도입 솔직 선언                                       |
| D8                | `prototype/realtime-tool-spike/` 격리 + 종료 시 git rm                 |
| D9                | `.ssampin/backup/v1/` syncRegistry 제외                                |
| D10               | `RealtimeToolSettingsPanel` ModalCoordinator 큐 또는 `sp-z-modal`      |
| D11               | flag 제거 정량 합격선 (opt-in 95% / crash-free 99.5% / 신고 0건, 30일) |
| **D12 (Phase 0)** | **11종 토글 = 발표/응답/표시 3그룹 + P 메이커 인라인**                 |

---

## 미정 사항 (Open Questions Q1, Q3~Q10)

- Q1 frontend-design 1주 일정 가능 여부 — Phase 0 designer 에이전트로 0.5일 소요 (✓ 빠르게 끝남)
- Q3 멀티 PC sync 일시 정지 모달 문구 — Phase A `_formatVersionGuard.ts` 작성 시 확정
- Q4 sp-\* ratio baseline (`v2.0.7` 권장) — Phase B 진입 전
- Q5 opt-in 95% 폴백 — v2.1.0 출시 6개월 시점
- Q6 ADR C "인지 부하 횟수" 측정 — Design 최종 확정 시
- Q7 사용자 테스트 시나리오 5개 — Phase C 진입 전
- Q8 모바일 메이커 UI — v2.1.0 출시 후
- Q9 Phase 0 prototype 흡수 검증 — Phase A 종료 시
- Q10 `migration-roundtrip` 5단계 분리 호환 — A.6 작성 시

---

**다른 세션 동시 진행 (절대 충돌 금지)**:

- widget-inline-ux 작업 (Widget·Settings/WidgetTab·useDesktopModeFallback·useSettingsStore 등)

**본 세션 종료 후 새 세션에서 만나기**.
