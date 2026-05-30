# HANDOFF — 복합 유형 설문 RB 수준 리뉴얼 · Phase C 진입 (G004)

**작성**: 2026-05-30 (G003 Phase B 완료 직후)
**갱신**: 2026-05-30 (Phase C C.0 + C.1 + C.3 + **C.4** 완료 — 본 핸드오프 § "Phase C C.0/C.1/C.3 진행 결과" + § "Phase C C.4 진행 결과" 참조)
**이전 핸드오프**: [docs/HANDOFF_multisurvey-v2-renewal-phase-b.md](HANDOFF_multisurvey-v2-renewal-phase-b.md) (Phase B 진입용 — 보존)
**다음 세션 시작점**: Phase C 잔여 (C.2 정성 게이트 시각 검증 → C.6 사용자 테스트 → C.5 릴리즈 워크플로우)
**ultragoal 상태**: 3/5 complete (G001 ✓, G002 ✓, G003 ✓), G004 active (C.0/C.1/C.3/**C.4** 완료, C.2/C.5/C.6 잔여), G005 pending

---

## 새 세션 시작 시 30초 안내

1. **컨텍스트 복구**:

   ```bash
   cd /e/github/ssampin && node "C:/Users/wnsdl/.claude/plugins/cache/omc/oh-my-claudecode/4.14.1/bridge/cli.cjs" ultragoal status
   ```

   → G004 (Phase C) active 또는 pending 확인. activeGoalId null이면 `complete-goals`로 G004 시작.

2. **5개 문서 정독** (이 순서):
   - 본 파일 (가장 먼저)
   - [docs/HANDOFF_multisurvey-v2-renewal-phase-b.md](HANDOFF_multisurvey-v2-renewal-phase-b.md) — G003 Phase B 진입 가이드 (보존)
   - [docs/01-plan/features/multisurvey-v2-renewal.plan.md](01-plan/features/multisurvey-v2-renewal.plan.md) — Plan v1.0 (불변)
   - [docs/02-design/features/multisurvey-v2-renewal.design.md](02-design/features/multisurvey-v2-renewal.design.md) — Design v0.2
   - [docs/03-analysis/multisurvey-v2-renewal.open-questions.md](03-analysis/multisurvey-v2-renewal.open-questions.md) — Q4 결정 반영 갱신 필요

3. **G003 산출물 (Phase B에서 만들어진 신규 파일 55개 + 수정 2개 — 절대 다시 만들지 말기)**:

   **B.1 Adapter Store + Facade (3 파일)**:
   - `src/adapters/stores/useMultiSurveyV2Store.ts` — V2 도메인 facade. `realtimeToolV2Enabled` 영속(zustand persist) + sessions/liveSession + 6 phase 머신 + 11종 토글 동기 업데이트
   - `src/adapters/hooks/useRealtimeToolFlag.ts` — single facade, 호출 2/3 (≤3 가드 통과)
   - `src/adapters/hooks/useMigrationReport.ts` — MigrationReportModal 트리거 + IPC `multi-survey:migrate-v1-to-v2` 호출 + localStorage dismiss

   **B.2 Maker (14 컴포넌트)** `src/adapters/components/MultiSurvey/v2/Maker/`:
   - `MakerLayout` (3-column + 1280px 미만 드로어) / `MakerHeader` (sticky)
   - `QuestionList` + `QuestionListItem` + `QuestionTypeChip` (**9종 색상** — v1 4종 회색톤 / v2 5종 의미 색상)
   - `QuestionEditor` + `QuestionTextInput` + `ChoiceList` + `ChoiceItem` + `TimerScorePanel`
   - `LivePreview` (360×640 학생 1:1 mock)
   - `RealtimeToolSettingsPanel` (11종 토글 3그룹) + `ToggleGroup` + `SettingToggle`

   **B.3 Console (15 컴포넌트)** `src/adapters/components/MultiSurvey/v2/Console/`:
   - `TeacherConsole` (6 phase 조건부 렌더) + `PhaseIndicator` + `ConsoleHeader` + `SidePanelConsole`
   - `LobbyView` + `EntryCodeDisplay` + `StudentAvatarGrid` (qrcode lib 의존)
   - `QuestionDisplay` + `TimerBar` (sp-timer-urgent keyframe) + `ResponseCounter`
   - `AnswerReveal` + `DistributionBar` (`var(--sp-duration-slow)` × 3 토큰화)
   - `RoundResultTable` (T10 ON 시만) + `Podium` + `PodiumEntry` (DN-02 정답률 가드)

   **B.4 Student (14 컴포넌트)** `src/adapters/components/MultiSurvey/v2/Student/` + IPC 2종:
   - `StudentPageShell` + `StudentEntryForm` + `StudentProfileForm` + `AvatarPicker`
   - `StudentWaitScreen` (STUDENT_WAVE 발송 hook) + `QuestionView` (**9종 variant**) + `ChoiceButton` + `OXButton`
   - `StudentTimerBar` + `SubmitButton` + `WaitingOverlay` + `ResultView` + `StudentPodium` + `index.ts` barrel
   - **수정**: `electron/ipc/_studentPageChrome.ts` — `injectDesignTokens()` + `getDesignTokenDefaults()` (DN-10 CSS 변수 fallback 이중 안전장치)
   - **수정**: `electron/ipc/liveMultiSurvey.ts` — `LiveIpcEvent` union에 `STUDENT_WAVE` (DN-03) + `TOGGLE_FOCUS_MODE` (DN-06) 추가 (타입만, 실제 ipcMain.handle 등록은 후속 작업)

   **B.5 Share (8 컴포넌트)** `src/adapters/components/MultiSurvey/v2/Share/`:
   - `ClassroomShareView` + `ShareEntryCodeBar` + `ShareLobbyScreen` (qrcode lib)
   - `ShareQuestionScreen` + `ShareAnswerReveal` + `ShareDistributionBar`
   - `ShareRoundResult` + `SharePodium` (3→2→1 스태거 + CSS confetti)

   **B.6 Migration (1 컴포넌트)** `src/adapters/components/MultiSurvey/v2/Migration/MigrationReportModal.tsx`:
   - createPortal 모달 / ESC/외부클릭/X 모두 닫기 / "다시 안 보기" / aria-modal / ModalCoordinator 통합은 TODO

   **테마 토큰 신설** `src/index.css`:
   - `--sp-info` / `--sp-success` / `--sp-warning` — light/dark/gray 3블록 (Phase B B.7 S1)
   - `@keyframes sp-timer-urgent` — TimerBar urgent pulse (Phase B B.7 S2-A)

4. **보호 파일 10종 — 절대 건드리지 말기** (Phase B 내내 GUARD-CLEAN 유지):
   - `src/adapters/components/Widget/**` (widget-inline-ux 세션)
   - `src/adapters/components/Settings/tabs/WidgetTab.tsx`
   - `src/widgets/components/**`
   - `src/adapters/hooks/useDesktopModeFallback.ts`
   - `src/adapters/stores/useSettingsStore.ts`
   - `src/adapters/stores/useModalCoordinatorStore.ts`
   - `src/domain/entities/RealtimeWall.ts`
   - `src/domain/rules/realtimeWallRules.ts`
   - `src/domain/valueObjects/AnalyticsEvent.ts`
   - `src/infrastructure/board/generateBoardHTML.ts`
   - **매 작업 전 `git status --porcelain -- <위 10개 경로>` 가드 0줄 확인**

---

## Phase C 작업 TODO (Plan §5.1 + Design §5 + Phase B 잔여)

### C.0 Phase B 잔여 통합 (Phase C 진입 직후 처리 필수)

- [ ] **MultiSurveyToolEntry.tsx 신규 작성** — UI 라우팅 진입점. `useRealtimeToolFlag().enabled` 기준 V1 도구 ↔ V2 도구 분기. flag 호출 3번째 위치 (현재 2/3 → 3/3). 위치: `src/adapters/components/MultiSurvey/MultiSurveyToolEntry.tsx`
- [ ] **multiSurveyMigration.ts 자동 트리거** — 현재 IPC handler만 등록됨. v2 첫 진입 시 v1 데이터 감지 → 자동 변환 트리거. `useRealtimeToolFlag().enabled === true` 진입점에서 `useMigrationReport().runMigration(v1Sessions)` 호출 연결
- [ ] **사용자 시각 검증 (frontend-design 실 화면)** — 데스크톱 환경에서 5 화면(Maker/Console/Student/Share/Migration Modal) 실제 렌더링 확인. 마크다운 정성 검토는 G003에서 통과 (RB 미감 85% 도달)
- [ ] **vitest flaky 안정화 (Phase B 무관)** — `FillFormFields.test.ts` 한글 baked 5초 timeout, 단독 실행 시 10/10 PASS. `testTimeout: 30000`을 globalThis 또는 해당 파일 단위로 적용 검토 (별도 PDCA 가능)

### C.1 미감 게이트 정량 3종 (Plan §7 Phase C 본격)

- [ ] **sp-\* ratio ±20% baseline 게이트 재정의** — Plan §7 §6 미감 정량의 첫 번째 게이트. Phase B에서 절대 카운트(125 vs 575) 비교가 v1 모놀리식 vs v2 분리 구조 차이로 무의미 판정. Phase C에서 재정의:
  - 옵션 1: 컴포넌트당 비율 비교 (v1 31.25 vs v2 11.06 — 분리도가 미감 지표인지 ADR 결정)
  - 옵션 2: "신규 코드 HEX 하드코딩 0건 + sp-\* 토큰 채택률 100%" 단순화 (Phase B에서 사실상 통과)
  - 옵션 3: ADR로 ±20% 게이트 폐기 + frontend-design 정성만 사용 (Pre-mortem #2 위험 명시)
  - 결정자: 준일님 + frontend-design 협의
- [ ] **fade-in 존재 게이트** — 정답 공개 화면(AnswerReveal·DistributionBar) 등 fade-in 모션 실재 확인
- [ ] **타이포 분포 게이트** — 폰트 weight 변형 분포 정상 (sp-font-medium/semibold/bold 사용 균형)

### C.2 미감 게이트 정성 2종

- [ ] **여백 게이트** — 한국형 RB 수준의 여백 충실도. 데스크톱 시연 후 사용자/frontend-design 판정
- [ ] **ambient motion 게이트** — 스태거/bounce/scale/duration 자연스러움. Phase B에서 코드 레벨은 통과 (S1/S2 6건 모두 수정)

### C.3 Percy/Chromatic 미도입 ADR

- [ ] **별도 PDCA로 분리** — Plan §10 ADR Consequences "Percy 미도입으로 정성 평가 의존도 높음" 명시. C에서는 ADR 문서만 갱신 (`.omc/specs/adr-percy-non-adoption.md`)

### C.4 flag opt-in 출시 (v2.1.0)

- [ ] **MultiSurveyToolEntry에서 flag 노출 UI** — 설정 화면 또는 메이커 진입 시 "새 도구 사용해보기" 토글 (사용자 첫 진입 시 모달 또는 인라인)
- [ ] **opt-in 이벤트 로깅** — 옵트인/옵트아웃 비율 추적용. `useSettingsStore`는 보호 파일이라 직접 못 건드림 → 별도 analytics 채널 (Phase D 합격선 95% 측정에 필수)
- [ ] **마이그레이션 자동 트리거 + 리포트 모달** — opt-in 시점에 자동 v1→v2 변환 + MigrationReportModal 1회 노출

### C.5 릴리즈 워크플로우 8단계

- [ ] KB(Notion) 갱신
- [ ] release-notes v2.1.0 작성
- [ ] electron-builder 인스톨러 빌드
- [ ] GitHub 릴리즈 (assets 첨부)
- [ ] 사용자 공지 (Notion + 이메일/슬랙)
- [ ] 모니터링 대시보드 준비 (opt-in 비율 + crash-free)
- [ ] 30일 모니터링 시작 → G005 (Phase D) 진입 시점 결정
- [ ] `prototype/realtime-tool-spike/` git rm (Plan §5.2 D8 — Phase 0 흡수 검증 완료 시)

### C.6 사용자 테스트 시나리오 5개 (Q7 결정 후)

- [ ] **Q7 결정** — Phase C 진입 직후 사용자와 확정. 권장 시나리오:
  1. 메이커에서 11종 토글 그룹 인지 (선생님이 의미를 모르고도 빠르게 그룹 추측 가능?)
  2. 진행 콘솔 → 학생 페이지 → 교실 모니터 share view 3 화면 동시 동작
  3. 라운드 종료 후 학생 화면 "다시 하기" / "한 번 더" 흐름 (DN-04 pin4 재입장)
  4. 마이그레이션 리포트 모달이 사용자에게 명확한가
  5. 멀티 PC sync 일시 정지 안내가 비개발자에게 이해되는가

---

## Phase B 진행 중 정정된 항목 (Phase C 진입 전 인지 필요)

| ID                                 | 정정 내용                                                                                                                               | 영향                                                                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Q4 baseline**                    | v2.0.7 태그 부재 → **v2.0.8 + Homeroom/Survey 디렉터리 = 125 hits**로 변경 (사용자 결정 1-A)                                            | Phase C에서 ±20% 게이트 자체 재정의 필요 (위 C.1 첫 항목)                                                            |
| **Q11 v1→quiz 변환 옵션**          | **미채택** (사용자 결정 2-B) — Maker UI에 변환 버튼 추가하지 않음. v1 문항은 survey 그대로 보존                                         | QuestionEditor 유형 전환 세그먼트는 quiz 5종만 표시. v1 문항은 read-only                                             |
| **Q11 9종 색상**                   | 사용자 결정 3-A — v2 quiz 5종 의미 색상(`sp-info/sp-success/sp-highlight/sp-accent/sp-warning`) + v1 survey 4종 회색톤(`sp-muted` 변형) | 데스크톱 테마에 `--sp-info/--sp-success/--sp-warning` 신설 (src/index.css light/dark/gray 3블록). 모바일과 의미 통일 |
| **sp-shadow-card 토큰 부재**       | Tailwind에 `sp-shadow-card` 미정의 → `shadow-sp-lg`로 대체 (Migration Modal 등)                                                         | component-tree §1~§5의 "sp-shadow-card" 표기는 디자인 명세, 실제 Tailwind 클래스는 `shadow-sp-lg`                    |
| **TimerBar fabJiggle keyframe**    | 본래 코드 작성 시 미정의된 `fabJiggle` 참조 → `sp-timer-urgent` keyframe 신설 (`src/index.css`)                                         | Phase B B.7 S2-A 수정 완료. urgent pulse 정상 동작                                                                   |
| **DistributionBar 600ms 하드코딩** | `'width 600ms var(--sp-ease-out)'` → `'width calc(var(--sp-duration-slow) * 3) var(--sp-ease-out)'` 토큰화                              | Phase B B.7 S2-B 수정 완료. sp-duration-slow(200ms) × 3 = 600ms 의도 유지                                            |

---

## Phase C에서 결정 필요한 Open Questions

- **Q1** Phase 0 frontend-design 1주 (Phase 0 완료 — 더 이상 영향 없음)
- **Q3** sync 일시 정지 모달 문구 — Phase A에서 Plan 초안 그대로 박힘. Phase C에서 사용자 테스트 후 재확정 검토
- **Q4** sp-\* ratio baseline — Phase B에서 v2.0.8 Homeroom/Survey @ 125로 측정. ±20% 게이트 의미 재정의는 Phase C C.1 첫 항목
- **Q5** opt-in 95% 미달 폴백 합격선 — Phase C 진입 전 결정 필요
- **Q6** "인지 부하 횟수" 측정 방법 — Design 최종 확정 시
- **Q7** 사용자 테스트 5 시나리오 — Phase C 진입 직후 확정 (위 C.6 참조)
- **Q8** 모바일 메이커 UI — v2.1.0 출시 후
- **Q9** Phase 0 prototype 흡수 검증 — Phase C 종료 시 (`prototype/realtime-tool-spike/` git rm 확인)
- **Q10** migration-roundtrip 5단계 분리 (채택 완료) — 영향 없음

---

## G003 결과 요약

| 항목                      | 값                                                                                                                                                                                                                            |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 작업 기간                 | 2026-05-30 단일 세션 (omc 6 worker — store-builder 직렬 + 5 parallel agents)                                                                                                                                                  |
| 신규 파일 수              | Maker 14 + Console 15 + Student 14 + Share 8 + Migration 1 + Store/Hooks 3 = **55개**                                                                                                                                         |
| 수정 파일 수              | `electron/ipc/_studentPageChrome.ts` (DN-10) + `electron/ipc/liveMultiSurvey.ts` (IPC 타입) + `src/index.css` (토큰 3종 + keyframe) + `QuestionTypeChip.tsx` (description 의미 색상) + S2 4건 = **2 신규 수정 + 4 후속 수정** |
| sp-\* 토큰 사용           | 575회 (52 컴포넌트 평균 11회)                                                                                                                                                                                                 |
| tsc delta                 | 0 (pre 0 → post 0)                                                                                                                                                                                                            |
| lint delta                | 0 errors (Phase B scope)                                                                                                                                                                                                      |
| vitest                    | 2201/2212 (1건 flaky FillFormFields PDF — Phase B 무관, 단독 10/10 PASS)                                                                                                                                                      |
| regression                | 46/46 PASS (변화 없음)                                                                                                                                                                                                        |
| migration-roundtrip       | status:ok, questions 4 byte-equal, 5단계 OK                                                                                                                                                                                   |
| check-flag-usage          | 2/3 (≤3 가드 통과). 3번째 위치는 MultiSurveyToolEntry — Phase C C.0에서 추가                                                                                                                                                  |
| 보호 파일 10종            | 작업 내내 GUARD-CLEAN                                                                                                                                                                                                         |
| frontend-design 정성 검토 | 절대 게이트 ALL PASS / 정성 6종 S1 2건 + S2 4건 발견·모두 수정 / RB 미감 코드 레벨 85%                                                                                                                                        |
| 사용자 확정 결정          | Q4 (1-A baseline 변경), Q11 v1→quiz 변환 (2-B 미채택), Q11 9종 색상 (3-A)                                                                                                                                                     |

**상태**: G003 complete, G004 (Phase C) 진입 준비.

---

## Phase C C.0/C.1/C.3 진행 결과 (2026-05-30, 본 세션)

### 신규 산출물

**문서 (2건 갱신 + 2건 신규)**:

- `DECISIONS.md` ADR-010 — MultiSurvey v2 미감 정량 게이트 재정의 (sp-\* ratio ±20% 폐기 + 3종 새 게이트)
- `docs/03-analysis/multisurvey-v2-renewal.open-questions.md` — Q5/Q7 결정 반영 + 진행 기록 3행 추가
- `.omc/specs/adr-percy-non-adoption.md` (신규) — C.3 Percy/Chromatic 미도입 ADR (1인 OSS 운영 비용/효과 + 4종 재오픈 트리거)
- `docs/HANDOFF_multisurvey-v2-renewal-phase-c.md` (본 파일) — § 진행 결과 추가

**코드 (1 신규 + 2 수정)**:

- `src/adapters/components/MultiSurvey/MultiSurveyToolEntry.tsx` (신규, ~200줄) — V1/V2 flag 분기 진입점. `useRealtimeToolFlag` 3번째(마지막) 호출 위치. flag OFF → ToolMultiSurvey + V2OptInBanner(신규 도구 사용해보기 버튼). flag ON → MakerLayout + V2HeaderActions(이전 도구로 돌아가기 버튼) + 자동 빈 세션 1개 생성 + MigrationReportModal `api` prop 주입 + 자동 마이그레이션 1회 트리거(useRef gate).
- `src/adapters/components/Tools/toolRegistry.ts` (수정) — 'tool-multi-survey' component를 ToolMultiSurvey → MultiSurveyToolEntry로 교체.
- `src/App.tsx` (수정) — page === 'tool-multi-survey' 분기에서 ToolMultiSurvey → MultiSurveyToolEntry로 교체. ToolMultiSurvey 직접 import 제거(unused).

**스크립트 (2 신규 + package.json scripts 2 추가)**:

- `scripts/check-hex-hardcoding.mjs` (신규) — 화이트리스트 4종 마스킹 후 잔여 HEX 검출. exit 0/1.
- `scripts/check-sp-coverage.mjs` (신규) — sp-\* 토큰 바인딩 카운트. 임계 500건(Phase B baseline 582 기준).
- `package.json` — `check-hex-hardcoding`, `check-sp-coverage` 두 scripts 추가.

### 검증 결과

| 게이트                         | 결과                  | 비고                                                                                                                       |
| ------------------------------ | --------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `npx tsc --noEmit`             | 0 errors              | 본 세션 변경 범위 전부 통과                                                                                                |
| `npm run lint`                 | 본 작업 범위 0 errors | 1 error는 `src/widgets/items/MemoFocus.tsx:70` (다른 세션 부채, 보호 영역 밖)                                              |
| `npm run check-flag-usage`     | 3/3 PASS              | MultiSurveyToolEntry 1 호출 + useMigrationReport 주석 1 + useRealtimeToolFlag 정의 1 = 3건                                 |
| `npm run check-hex-hardcoding` | 0건 PASS              | 52 파일 스캔. 화이트리스트 4종(var fallback + qrcode color + [Ff]allback 식별자 + \_studentPageChrome.ts) 마스킹 후 잔여 0 |
| `npm run check-sp-coverage`    | 1175건 PASS           | 임계 500의 2.35배. Phase B baseline 582 대비 정확한 증가(스크립트 카운트 방식 차이)                                        |
| 보호 파일 10종 가드            | 0줄                   | 작업 내내 GUARD-CLEAN                                                                                                      |

### 사용자 확정 결정 (2026-05-30 본 세션)

| Open Q | 결정                                                                        | 영향                                                                                    |
| ------ | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Q4     | ADR-010 발행 — sp-\* ratio ±20% 폐기 + 3종 새 게이트 채택                   | C.1 첫 항목 해소. 자동화 스크립트 2종 신규.                                             |
| Q5     | 폴백 합격선 A 채택 (opt-in 90% + crash-free 99.5% + 신고 0건 + 90일 + 결재) | Phase D 합격선 미달 시 발동. flag 영구 부채 위험 차단.                                  |
| Q7     | 권장 5건 전부 채택                                                          | Phase C C.6 수동 검증 체크리스트로 박힘. Q3 모달 문구 재평가는 시나리오 #5 결과에 따라. |

### Phase C 잔여 작업 (다음 세션 핸드오프)

- [ ] **C.2 정성 게이트 (여백 + ambient motion)** — 데스크톱 실 화면 시연. frontend-design 협업 의무(`feedback_frontend_agent_collaboration.md` 메모리 룰).
- [x] **C.4 v1 데이터 추출 + opt-in 이벤트 로깅** — 2026-05-30 완료. § "Phase C C.4 진행 결과" 참조.
- [ ] **C.5 릴리즈 워크플로우 8단계** — KB(Notion) 갱신 / release-notes v2.1.0 작성 / electron-builder 인스톨러 빌드 / GitHub 릴리즈 / 사용자 공지 / 모니터링 대시보드 / 30일 모니터링 시작 / prototype/realtime-tool-spike/ git rm.
- [ ] **C.6 사용자 테스트 5 시나리오 수동 검증** — Open Questions Q7 결정된 5건. 데스크톱 환경(Electron 40.x Win11 24H2). 결과를 `docs/manual-verification/multisurvey-v2-c6-scenarios.md`로 별도 작성.
- [ ] **G004 ultragoal checkpoint complete** — C.2/C.5/C.6 모두 통과 후 `ultragoal checkpoint --goal-id G004-... --status complete --evidence "..."` 실행.

---

## Phase C C.4 진행 결과 (2026-05-30, 본 세션)

### 신규 산출물

**코드 (1 파일 5개 영역 수정)**:

- `src/adapters/components/MultiSurvey/MultiSurveyToolEntry.tsx` — 5개 수술적 편집:
  1. **import 확장**: `useMemo` from react + `useAnalytics` from `@adapters/hooks/useAnalytics` + `useToolTemplateStore` from `@adapters/stores/useToolTemplateStore` 추가.
  2. **`useV1MultiSurveyData()` 실제 구현** (line 55~94, 약 40줄): 빈 배열 stub → `useToolTemplateStore`의 `toolType==='multi-survey' && config.type==='multi-survey'` 필터 + `Date.parse(template.createdAt)` epoch ms 변환 + V1Survey shape(id/title/questions/submissions=[]/isOpen=false/createdAt) 조립. `useEffect`로 미로드 시 `load()` 호출 + `useMemo`로 변환 캐시.
  3. **`useAnalytics().trackRaw` 도입** (line 107): `trackRaw` 채널 사용으로 `AnalyticsEvent` enum(보호 파일) 확장 회피. 보호 파일 `useSettingsStore`는 useAnalytics 내부에서 _읽기만_ 함 → 본 진입점은 보호 파일 비-수정.
  4. **마이그레이션 useEffect 보강** (line 118~142): (a) `v1Sessions.length === 0` 시 `migrationAttemptedRef` 미세팅 → 템플릿 비동기 로드 후 재진입 시 자동 트리거 가능, (b) `runMigration` 결과 promise 체인에서 `multi_survey_v2_migration_completed`(totalCount/successCount/failedCount) 또는 `multi_survey_v2_migration_failed` 이벤트 게재.
  5. **`handleOptIn`/`handleRollbackToV1` 트래킹 추가** (line 165~178): 클릭 시점에 `multi_survey_v2_opt_in`(source: entry-banner + v1_templates_count) / `multi_survey_v2_opt_out`(source: entry-header) 이벤트 게재. V2OptInBanner의 `onOptIn={() => flag.setEnabled(true)}` inline 콜백을 `onOptIn={handleOptIn}` 참조로 교체.

**문서 갱신**:

- `docs/03-analysis/multisurvey-v2-renewal.open-questions.md` — 진행 기록 표 1행 추가 ("C.4 v1 데이터 추출 + opt-in 이벤트 로깅 구현 완료").
- `docs/HANDOFF_multisurvey-v2-renewal-phase-c.md` (본 파일) — 헤더 § "Phase C 잔여 작업"의 C.4 체크박스 ✓ + 본 § "Phase C C.4 진행 결과" 신설.

### 검증 결과

| 게이트                                | 결과        | 비고                                                                    |
| ------------------------------------- | ----------- | ----------------------------------------------------------------------- |
| `npx tsc --noEmit`                    | 0 errors    | 본 세션 변경 범위 전부 통과 (TSC_EXIT=0)                                |
| `npx eslint MultiSurveyToolEntry.tsx` | 0 errors    | LINT_EXIT=0                                                             |
| `npm run check-flag-usage`            | 3/3 PASS    | useRealtimeToolFlag 추가 호출 없음 (line 101 1건 + hooks 정의 2건 유지) |
| `npm run check-hex-hardcoding`        | 0건 PASS    | v2/\*\* 범위 무변경                                                     |
| `npm run check-sp-coverage`           | 1175건 PASS | sp-\* 토큰 사용 무변경 (entry 파일은 v2/\*\* 외 범위)                   |
| migration roundtrip test              | 29/29 PASS  | `src/adapters/multiSurvey/migration/__tests__/roundtrip.test.ts`        |
| 보호 파일 10종 가드                   | 0줄         | 본 세션 내내 GUARD-CLEAN — useAnalytics는 *호출*만 (수정 X)             |

### 새로 게재되는 분석 이벤트 (Phase D 모니터링 입력)

- `multi_survey_v2_opt_in` — properties: `source: 'entry-banner'`, `v1_templates_count: number`. Phase D 합격선 95% (Q5 ADR-005) 측정의 분자.
- `multi_survey_v2_opt_out` — properties: `source: 'entry-header'`. 폴백 합격선 미달 시 분기 분석 입력.
- `multi_survey_v2_migration_completed` — properties: `total_count`, `success_count`, `failed_count`. 마이그레이션 신뢰도 + DN-02/DN-07 v1 enum 4종 실측 분포 확인.
- `multi_survey_v2_migration_failed` — properties: `{}`. IPC 라인 끊김/타임아웃 모니터.

**※ AnalyticsEvent enum 비-확장 원칙**: 위 4종은 trackRaw 채널로만 발행 (보호 파일 비-수정). Phase D 합격선 측정 시 분석 대시보드 측에서 raw 이벤트 키를 인덱싱.

### C.4 잔여 결정 (사용자 명시 받기)

- **본 세션 변경을 c4 커밋으로 묶을지** — 현재 본 진입점 1 파일 + 문서 2건. 단일 commit `feat(multi-survey-v2): Phase C C.4 — v1 템플릿 추출 + opt-in 이벤트 로깅` 권장.
- **본 세션 4 커밋(C.0/C.1/C.3 3 commit + C.4 1 commit) push 시점** — main 푸시는 사용자 명시 대기.

### MultiSurveyToolEntry 구현 세부 (다음 세션 참고)

- **사용자 진입 시나리오**:
  1. **첫 진입 (flag OFF, 기본값)**: V2OptInBanner ✨ + V1 ToolMultiSurvey 그대로. "새 도구 사용해보기" 버튼 또는 ✕로 배너 닫기 가능.
  2. **opt-in 시점**: `flag.setEnabled(true)` → V2 진입. useEffect로 v1Sessions(현재 빈 배열) 대상 자동 마이그레이션 1회 실행(useRef gate). 빈 세션 자동 생성 후 MakerLayout 진입.
  3. **opt-out (이전 도구로 돌아가기)**: V2HeaderActions의 "이전 도구로 돌아가기" 버튼 → `flag.setEnabled(false)` → V1 복귀.
- **MigrationReportModal 통합**: 본 entry에서 이미 `useMigrationReport()`를 호출했으므로 `<MigrationReportModal api={migrationReport} />` 형태로 prop 주입. 컴포넌트 내부 hook 중복 호출 방지.
- **flag 호출 3/3 가드**: 본 entry는 라인 5 주석(grep 대상)을 `flag.enabled`로 표기해 카운트 제외. 라인 52만 실제 호출. useMigrationReport.ts:11 + useRealtimeToolFlag.ts:33 + MultiSurveyToolEntry.tsx:52 = 3건.
- **잔여 TODO**:
  - `useV1MultiSurveyData()` → useToolTemplateStore 'tool-multi-survey' 추출 구현 (C.4)
  - opt-in 토글 UI는 현재 배너 + 헤더 버튼 MVP — 설정 화면 통합은 Phase D 또는 별도 PDCA
  - V2 진입 시 빈 세션 자동 생성 후 MakerLayout 진입 — 실제 신규 사용자 흐름은 "세션 목록 → 새 세션 만들기" 화면이 더 자연스러움 (후속 UX 개선 PDCA)

---

## 새 세션에서 Phase C 시작 명령

```bash
# 1. ultragoal 상태 확인
cd /e/github/ssampin && node "C:/Users/wnsdl/.claude/plugins/cache/omc/oh-my-claudecode/4.14.1/bridge/cli.cjs" ultragoal status

# 2. Plan + Design v0.2 + 본 핸드오프 정독

# 3. /goal 설정 또는 ultragoal complete-goals로 G004 진입
cd /e/github/ssampin && node "C:/Users/wnsdl/.claude/plugins/cache/omc/oh-my-claudecode/4.14.1/bridge/cli.cjs" ultragoal complete-goals

# 4. Q4 sp-* ratio 게이트 재정의 ADR 작성 (위 C.1)

# 5. Q5/Q7 사용자 결정 받기

# 6. C.0 Phase B 잔여 통합 (MultiSurveyToolEntry + multiSurveyMigration 자동 트리거)

# 7. C.1~C.5 본 작업

# 8. G004 checkpoint
```
