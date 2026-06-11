# HANDOFF — 복합 유형 설문 RB 수준 리뉴얼 · Phase B 진입 (G003)

**작성**: 2026-05-29 (G002 Phase A 완료 직후)
**이전 핸드오프**: [docs/HANDOFF_multisurvey-v2-renewal.md](HANDOFF_multisurvey-v2-renewal.md) (Phase A 진입용 — 보존)
**다음 세션 시작점**: Phase B (UI Build — 3-column Maker + Console + Student + Share + Migration Modal)
**ultragoal 상태**: 2/5 complete (G001 ✓, G002 ✓), G003 active, G004~G005 pending

---

## 새 세션 시작 시 30초 안내

1. **컨텍스트 복구**:

   ```bash
   cd /e/github/ssampin && node "C:/Users/wnsdl/.claude/plugins/cache/omc/oh-my-claudecode/4.14.1/bridge/cli.cjs" ultragoal status
   ```

   → G003 (Phase B) active 또는 pending 확인. activeGoalId null이면 `complete-goals`로 다음 pending(G003) 시작.

2. **5개 문서 정독** (이 순서):
   - 본 파일 (가장 먼저)
   - [docs/01-plan/features/multisurvey-v2-renewal.plan.md](01-plan/features/multisurvey-v2-renewal.plan.md) — Plan v1.0 (불변)
   - [docs/02-design/features/multisurvey-v2-renewal.design.md](02-design/features/multisurvey-v2-renewal.design.md) — **Design v0.2** (2026-05-29 갱신, Q11 결정 반영, §2.2 9종 union)
   - [docs/03-analysis/multisurvey-v2-renewal.open-questions.md](03-analysis/multisurvey-v2-renewal.open-questions.md) — Q2/Q11 결정 완료, Q1/Q3/Q4/Q5/Q6/Q7/Q8/Q9/Q10 미정
   - [prototype/realtime-tool-spike/](../prototype/realtime-tool-spike/) — Phase 0 산출물 4종 (특히 component-tree.md §1~§4, domain-notes.md DN-01~DN-10)

3. **G002 산출물 (Phase A에서 만들어진 신규 파일 — 절대 다시 만들지 말기)**:

   **Domain (worker-1)**:
   - `src/domain/entities/multiSurvey/MultiSurveyV2.ts`
   - `src/domain/entities/multiSurvey/Question.ts` — 9종 union + `isQuizType` narrowing
   - `src/domain/entities/multiSurvey/Response.ts` — `isCorrect?: boolean` (quiz만)
   - `src/domain/entities/multiSurvey/LiveSession.ts` — 6 phases, round, studentInteractions, focusModeActive, StudentProfile.pin4
   - `src/domain/entities/multiSurvey/MigrationReport.ts`
   - `src/domain/entities/multiSurvey/index.ts` — barrel
   - `src/domain/ports/IMultiSurveyMigrator.ts`
   - `src/domain/rules/multiSurveyRules.ts` — validateSession, calcScore, isAnswerCorrect, isAutoAdvanceEnabled, groupResponsesByChoice, calcAccuracy
   - `src/domain/rules/multiSurveyRules.test.ts` — 24 unit tests (PASS)

   **Adapters/IPC (worker-2)**:
   - `src/adapters/multiSurvey/migration/v1ToV2.ts` — named `migrateV1ToV2`
   - `src/adapters/multiSurvey/migration/v2ToV1.ts` — named `migrateV2ToV1`, quiz 타입 throw
   - `src/adapters/multiSurvey/migration/backupWriter.ts` — `writeBackup` + `cleanupOldBackups` (30일)
   - `src/adapters/multiSurvey/migration/__tests__/roundtrip.test.ts` — 29 tests (PASS)
   - `electron/ipc/_formatVersionGuard.ts` — `assertSafeForCurrentApp` + `FormatVersionMismatchError` + Q3 모달 문구
   - `electron/ipc/multiSurveyMigration.ts` — `registerMultiSurveyMigrationHandler` (renderer 트리거)
   - `tests/fixtures/multiSurvey-v1.json` — 4종 question fixture (single-choice/multi-choice/text/scale)

   **Infra/Scripts (worker-3)**:
   - `src/infrastructure/__tests__/syncRegistry.meta.test.ts`
   - `src/infrastructure/__tests__/builderFiles.meta.test.ts`
   - `scripts/migration-roundtrip.mjs` + `migration-roundtrip-{1..5}-*.mjs` (5단계 분리)
   - `scripts/check-flag-usage.mjs`
   - `package.json` scripts: `migration-roundtrip`, `migration-roundtrip:1-load`~`:5-report`, `check-flag-usage`

   **Main**:
   - `electron-builder.yml`에 `!prototype/**` 추가 (Plan D8)
   - `scripts/migration-roundtrip-5-report.mjs` — whitelist를 step 4와 일치시키고 overallStatus를 exit code로 propagate (거짓 양성 버그 수정)

4. **다른 세션이 작업 중인 보호 파일 10종 — 절대 건드리지 말기**:
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
   - **매 작업 전 `git status --porcelain -- <위 10개 경로>` 가드 0줄 확인**

---

## Phase B 작업 TODO (Plan §5.1 + Design §5 + component-tree §1~§4)

### B.1 Adapter Store + Facade Hook (Design §3)

- [ ] `src/adapters/stores/useMultiSurveyV2Store.ts` — V2 도메인 facade. loadSessions/createSession/updateSession/deleteSession/startLive/nextPhase/endLive
- [ ] `src/adapters/hooks/useRealtimeToolFlag.ts` — single facade, 분기 ≤ 3개 약속 (Plan D5)
  - 호출 위치: ① `useMultiSurveyV2Store.loadSessions` V1/V2 분기, ② `MultiSurveyToolEntry.tsx` UI 라우팅, ③ `multiSurveyMigration.ts` 첫 실행 트리거
  - **check-flag-usage 게이트가 3을 넘으면 CI fail** — 추가 호출은 ADR 필요
- [ ] `src/adapters/hooks/useMigrationReport.ts` — MigrationReportModal 트리거 hook

### B.2 Maker (3-column, 14 components — component-tree §1)

- [ ] `src/adapters/components/MultiSurvey/v2/Maker/MakerLayout.tsx` — `grid-cols-[240px_1fr_320px]`, 1280px 미만 COL-C 드로어
- [ ] `MakerHeader.tsx` (sticky)
- [ ] `QuestionList.tsx` + `QuestionListItem.tsx` + `QuestionTypeChip.tsx`
- [ ] `QuestionEditor.tsx` + `QuestionTextInput.tsx` + `ChoiceList.tsx` + `ChoiceItem.tsx` + `TimerScorePanel.tsx`
- [ ] `LivePreview.tsx` — 360×640 학생 화면 1:1 mock
- [ ] `RealtimeToolSettingsPanel.tsx` + `ToggleGroup.tsx` + `SettingToggle.tsx` — **11종 토글 3그룹** (presentationOpts/responseOpts/displayOpts)
  - 그룹 1 **발표 설정**: 누적점수표시 · 해설노출 · 재입장 가능
  - 그룹 2 **응답 설정**: 정답 제출 버튼 · 자동 넘김 · 빠른 풀이 · 연속 정답 · 랜덤 보너스
  - 그룹 3 **표시 설정**: 교사 집중 모드 · 문항별 점수 공개
  - UI 배치: **메이커 우측 인라인 사이드패널** (P, Q2 결정 완료)
- [ ] **Q11 영향**: QuestionTypeChip 색상 매핑 5종 → **9종으로 확장**. v1 4종(설문)과 v2 5종(퀴즈) 시각 구분 필요 — designer 에이전트 협업 필수
- [ ] **Q11 신규 UX 요구사항** [TBD]: v1 문항을 v2 quiz 타입으로 변환하는 옵션 (사용자가 수동으로 정답 입력) — 별도 PDCA 또는 Phase B에서 결정

### B.3 Console (15 components — component-tree §2)

- [ ] `TeacherConsole.tsx` — 4 phase 조건부 렌더 (lobby/open/revealed/podium), `round_result`는 T10 ON 시만
- [ ] `PhaseIndicator`, `LobbyView` + `EntryCodeDisplay` + `StudentAvatarGrid`, `QuestionDisplay` + `TimerBar` + `ResponseCounter`, `AnswerReveal` + `DistributionBar`, `RoundResultTable`, `Podium` + `PodiumEntry`, `ConsoleHeader`, `SidePanelConsole`

### B.4 Student (14 components — component-tree §3) — 정적 HTML 생성

- [ ] `electron/ipc/_studentPageChrome.ts`에 `injectDesignTokens()` + `getDesignTokenDefaults()` (DN-10 CSS 변수 fallback 이중 안전장치)
- [ ] `StudentPageShell` + `StudentEntryForm` + `StudentProfileForm` + `AvatarPicker` + `StudentWaitScreen` + `QuestionView` (**9종 variant — Q11 영향**) + `ChoiceButton` + `OXButton` + `StudentTimerBar` + `SubmitButton` + `WaitingOverlay` + `ResultView` + `StudentPodium`
- [ ] DN-03 STUDENT_WAVE IPC 신규 추가 (학생 대기 화면 탭 → 교사 콘솔 강조)
- [ ] DN-06 TOGGLE_FOCUS_MODE IPC + 학생 페이지 `data-focus-mode` 속성 토글

### B.5 Share (8 components — component-tree §4) — 교실 모니터 별도 BrowserWindow

- [ ] `ClassroomShareView` + 7 sub-components
- [ ] 4m 가독성: 문항 48px, 보기 36px, 타이머 64px, 입장코드 64px Bold

### B.6 Migration Modal (component-tree §5)

- [ ] `MigrationReportModal.tsx` — ModalCoordinator 우선순위 큐 등록 (Plan D10)

### B.7 검증 게이트 (Plan §7 5+2단계, 동일)

- [ ] `npx tsc --noEmit` (0 errors)
- [ ] `npm run lint` (0 errors)
- [ ] `npm run test` (2202 + 신규 통과)
- [ ] `npm run regression-check` (46+ 통과)
- [ ] `npm run migration-roundtrip` (status:ok 유지)
- [ ] `npm run check-flag-usage` (count ≤ 3)
- [ ] **B 신설**: 미감 정량 게이트 — `src/adapters/components/RealtimeTool/**` sp-\* ratio baseline (Q4 미정 — v2.0.7 권장)
- [ ] **B 신설**: frontend-design 에이전트 사용자 눈검증 (정성 게이트)
- [ ] 사용자 테스트 시나리오 5개 (Q7 미정 — Phase C 진입 전)

---

## Phase A 진행 중 정정된 항목 (Phase B 진입 전 인지 필요)

| ID                | 정정 내용                                                                                                            | 영향                                                                                                                                                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Q11**           | v2 QuestionType을 v1 4종 + v2 5종 = **9종 합집합**으로 확장 (경로 ① 채택)                                            | Design §2.2 9종 union, isQuizType helper, Response.isCorrect optional, isAutoAdvanceEnabled에 isQuizType guard, Maker QuestionTypeChip 9종 색상, Student QuestionView 9종 variant, Migration v2ToV1은 quiz 타입에서 throw |
| **DN 번호 정정**  | HANDOFF v1 (Phase A 진입용)의 DN 번호 매핑이 실제 domain-notes.md와 어긋남. 실제 매핑이 정확                         | DN-02 (Response.isCorrect), DN-03 (STUDENT_WAVE), DN-04 (round/pin4), DN-06 (TOGGLE_FOCUS_MODE), DN-08 (isAutoAdvanceEnabled), DN-09 (round_result phase)                                                                 |
| **scale 타입**    | v2 quiz에 매핑 안 됨 — v1 'scale'은 9종 union에서 v1-survey 영역 유지. v2ToV1은 scale 보존, quiz 5종은 throw         | Migration adapter에서 scale은 lossless로 처리                                                                                                                                                                             |
| **required 필드** | v1에만 있고 v2에 없음 → v2ToV1이 `true`로 강제 복원 (Design §4.2 lossy 허용). step 4/5 whitelist에서 `required` 제외 | roundtrip "손실 0"은 사용자 작성 내용(text/options/correctAnswer)에만 적용                                                                                                                                                |

---

## Phase B에서 결정 필요한 Open Questions

- **Q1** Phase 0 frontend-design 1주 (Phase 0 완료 — 더 이상 영향 없음)
- **Q3** sync 일시 정지 모달 문구 — Phase A에서 Plan 초안 그대로 박힘. Phase B에서 사용자 테스트 후 재확정 검토
- **Q4** sp-\* ratio baseline (v2.0.7 권장) — Phase B 진입 전 필수
- **Q5** opt-in 95% 미달 폴백 합격선 — Phase C 진입 전
- **Q6** "인지 부하 횟수" 측정 방법 — Design 최종 확정 시
- **Q7** 사용자 테스트 5 시나리오 — Phase C 진입 전
- **Q8** 모바일 메이커 UI — v2.1.0 출시 후
- **Q9** Phase 0 prototype 흡수 검증 — Phase B 종료 시 (`prototype/realtime-tool-spike/` git rm 확인)
- **Q10** migration-roundtrip 5단계 분리 (채택 완료) — 영향 없음

---

## Phase B 권장 worker 분해안 (가설)

| Worker                  | 작업 범위                         | 의존                                      |
| ----------------------- | --------------------------------- | ----------------------------------------- |
| store-builder           | B.1 Store + Facade Hook           | worker-1 G002 결과(@domain barrel)        |
| maker-builder           | B.2 Maker 14 components           | store-builder                             |
| console-builder         | B.3 Console 15 components         | store-builder                             |
| student-builder         | B.4 Student 14 + sp-\* token 주입 | store-builder, designer (sp-\* 토큰 매핑) |
| share-builder           | B.5 Share 8                       | store-builder                             |
| migration-modal-builder | B.6 MigrationReportModal          | worker-2 G002 결과                        |

**병렬화 가능**: maker / console / share는 서로 독립 (다른 디렉터리). student는 정적 HTML 생성기와 IPC를 건드려 직렬 처리 권장.

**frontend-design 에이전트 협업 의무**: maker / console / student / share 모든 worker는 PR 전에 sp-\* 토큰 매핑 검증 + 정성 미감 게이트 통과 필요 (`feedback_frontend_agent_collaboration.md` 메모리 룰).

---

## 새 세션에서 Phase B 시작 명령

```bash
# 1. ultragoal 상태 확인
cd /e/github/ssampin && node "C:/Users/wnsdl/.claude/plugins/cache/omc/oh-my-claudecode/4.14.1/bridge/cli.cjs" ultragoal status

# 2. Plan + Design v0.2 + Open Questions(Q11 확정 부분) + component-tree §1~§4 + domain-notes 정독

# 3. /goal 설정 또는 ultragoal complete-goals로 G003 진입
cd /e/github/ssampin && node "C:/Users/wnsdl/.claude/plugins/cache/omc/oh-my-claudecode/4.14.1/bridge/cli.cjs" ultragoal complete-goals

# 4. Q4 sp-* ratio baseline 측정 (Phase B 진입 전 필수)
git checkout v2.0.7
grep -r "sp-" src/adapters/components/RealtimeTool/ | wc -l
# → N (baseline 기록)
git checkout HEAD

# 5. Phase B 작업 시작 (위 B.1 → B.7 순서)

# 6. 검증 게이트 5+2단계 통과 (B.7)

# 7. G003 checkpoint
cd /e/github/ssampin && node "C:/Users/wnsdl/.claude/plugins/cache/omc/oh-my-claudecode/4.14.1/bridge/cli.cjs" ultragoal checkpoint --goal-id G003-phase-b-ui-build-3-column-questionli --status complete --evidence "..."

# 8. G004 (Phase C) handoff
```

---

## G002 결과 요약 (참고)

| 항목                | 값                                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 작업 기간           | 2026-05-29 단일 세션 (omc team 3 worker 병렬)                                                                          |
| 신규 파일 수        | domain 9 + adapters 4 + electron/ipc 2 + tests 1 fixture + infra 2 meta-tests + scripts 8 = **26개 + index/test 부속** |
| 신규 vitest 통과    | worker-1 24 + worker-2 29 + meta 2 = **55건 신규** (총 2202 통과 / 10 skipped)                                         |
| tsc delta           | 0 (pre 0 → post 0)                                                                                                     |
| lint delta          | 0 errors (123 pre-existing warnings 동일)                                                                              |
| regression          | 46/46 PASS (변화 없음)                                                                                                 |
| migration-roundtrip | status:"ok", questions 4 byte-equal (v1 whitelist 기준)                                                                |
| 보호 파일 10종      | 작업 내내 GUARD-CLEAN                                                                                                  |
| 사용자 확정 결정    | Q11 (경로 ① 9종 union), Q3 (Plan 초안 모달 문구), Q10 (5단계 분리)                                                     |

**상태**: G002 complete, G003 (Phase B) 진입 준비.
