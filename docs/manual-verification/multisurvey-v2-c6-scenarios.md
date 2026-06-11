# C.6 — MultiSurvey v2 사용자 테스트 5 시나리오 수동 검증

- **작성**: 2026-05-30 (G004 Phase C C.6 — 본 골격 자동 생성)
- **시연 대상**: 본 세션 main HEAD `f58ba39` (Phase C C.4 까지 완료)
- **시연 환경**: 데스크톱 Electron 40.x on Windows 11 Home 24H2 (Win32)
- **트리거 조건**: `npm run electron:dev` 실행 후 V2 도구 진입(설정 → 도구 → 복합 유형 설문 → V2OptInBanner의 "새 도구 사용해보기" 클릭)
- **연관 문서**:
  - Q7 결정 — [docs/03-analysis/multisurvey-v2-renewal.open-questions.md §Q7](../03-analysis/multisurvey-v2-renewal.open-questions.md)
  - Plan §5.2 D — [docs/01-plan/features/multisurvey-v2-renewal.plan.md](../01-plan/features/multisurvey-v2-renewal.plan.md)
  - Design §3~5 — [docs/02-design/features/multisurvey-v2-renewal.design.md](../02-design/features/multisurvey-v2-renewal.design.md)
  - Phase C 핸드오프 — [docs/HANDOFF_multisurvey-v2-renewal-phase-c.md](../HANDOFF_multisurvey-v2-renewal-phase-c.md)

---

## 시연 전 셋업 (1회만)

1. 로컬 main HEAD `f58ba39` 확인 (`git log --oneline -1`).
2. `npm run electron:dev` 실행. Vite + Electron 동시 기동. Electron 창이 뜰 때까지 ~30~60s.
3. 위 창에서:
   - [ ] 설정 → 도구 탭 → 복합 유형 설문(quiz) 진입.
   - [ ] V2OptInBanner ("새 복합 유형 설문 도구가 준비됐어요. 미리 사용해 보시겠어요?") 노출 확인.
   - [ ] 보호 파일 가드는 코드 레벨에서 이미 GUARD-CLEAN — 본 시연 중 추가 가드 확인 불필요.
4. 분석 이벤트 흐름은 C.4 산출 4종 — devtools 콘솔에서 `analyticsPort.track` 호출 여부만 spot-check.

---

## 시나리오 1 — 메이커 토글 그룹 인지 (Q2 검증)

### 가설

선생님이 11종 토글의 의미를 모른 채 들어왔을 때, **3그룹(발표 설정 / 응답 설정 / 표시 설정)**으로 빠르게 추측 가능한가.

### 실행 순서

1. V2 진입 후 MakerLayout의 우측 사이드패널 `RealtimeToolSettingsPanel` 클릭.
2. 11종 토글 그룹 라벨 확인 — 발표 설정 / 응답 설정 / 표시 설정.
3. 각 그룹에 어떤 토글이 들어있는지 한 번에 인지 가능한지 self-test.

### 관찰 포인트

- [ ] 발표 설정 3종 (T01 누적점수표시 / T02 해설노출 / T03 재입장 가능) — 그룹명에 어울리는가?
- [ ] 응답 설정 5종 (T04 정답 제출 버튼 / T05 자동 넘김 / T06 빠른 풀이 / T07 연속 정답 / T08 랜덤 보너스) — 그룹명에 어울리는가?
- [ ] 표시 설정 2종 (T09 교사 집중 모드 / T10 문항별 점수 확인) — 그룹명에 어울리는가?
- [ ] 11종 토글 첫 진입 시 인지 부하 — 모든 토글 라벨을 한 번에 다 못 읽어도 그룹 구조를 추측 가능?

### 합격 기준

- 사용자가 "어디서 무엇을 켜는지" 그룹 단위로 30초 안에 추측 가능 (자기보고).
- S1(그룹명 부적합) 0건. S2(그룹 내 토글 1건 이상 이질감) 0건 → ADR 재고려 트리거.

### 결과 (시연 후 기입)

- 합격 여부:
- 발견 사항:
- 후속 조치:

---

## 시나리오 2 — 3 화면 동시 동작 (DN-10 + 멀티 세션 검증)

### 가설

진행 콘솔 + 학생 페이지 + 교실 모니터 share view 3 화면을 동시에 띄워도 다중 세션 충돌 없이 sp-\* 토큰 일관성 유지.

### 실행 순서

1. 콘솔(데스크톱 Electron): MakerLayout에서 설문 1건 작성 → "라이브 시작" → 콘솔 진입.
2. 학생 페이지(브라우저 또는 동일 PC 2번째 창): QR 스캔 or URL 입력 → 학생 lobby 진입 → 닉네임 입력.
3. 교실 모니터(추가 창): share entry URL 입력 → Share Lobby 진입.
4. 콘솔에서 문항 활성화(open) → 학생 답변 → 콘솔에서 reveal → share view에서 distribution bar 표시 확인.

### 관찰 포인트

- [ ] 콘솔/학생/share 3 화면에서 sp-\* 토큰 색상이 동일한가? (DN-10 fallback이 학생 페이지 정적 HTML에 정상 주입)
- [ ] 학생이 답변할 때 콘솔 ResponseCounter + share view 응답 수 동시 증가?
- [ ] phase 전환(lobby → question → reveal) 시 3 화면 동기화 지연 < 2s?
- [ ] 새로 추가된 분석 이벤트(`multi_survey_v2_opt_in`, migration completed/failed)는 옵트인 시점에만 발생하고 라이브 중에는 0건?

### 합격 기준

- 3 화면 동시 운영 1회 라운드 완주.
- 토큰 색상 시각적 일관 (별도 측정 불필요 — 정성 판단).

### 결과 (시연 후 기입)

- 합격 여부:
- 발견 사항:
- 후속 조치:

---

## 시나리오 3 — 재입장 흐름 (DN-04 + presentationOpts.allowReentry)

### 가설

라운드 종료 후 학생이 "다시 하기"/"한 번 더"로 같은 핀 코드 재입장하면 DN-04 도메인 노트대로 동일 세션 컨텍스트 유지.

### 실행 순서

1. 시나리오 2와 동일하게 라이브 진행 → 1 라운드 완주(reveal까지).
2. 콘솔에서 `presentationOpts.allowReentry = true` 확인 (기본값 — DEFAULT_PRESENTATION_OPTS).
3. 학생 페이지에서 ResultView → "다시 하기" 또는 "한 번 더" 버튼 클릭.
4. 같은 핀 코드 + 같은 닉네임으로 재입장 → 새 라운드 lobby 진입 확인.

### 관찰 포인트

- [ ] 재입장 시 학생이 다시 lobby로 진입하는가? (단, 진행 중인 라운드면 wait screen)
- [ ] 콘솔의 StudentAvatarGrid에 동일 학생이 중복 추가되지 않는가?
- [ ] `allowReentry = false`로 토글 시 재입장 시도가 거부되는가?
- [ ] STUDENT_WAVE IPC 이벤트(DN-03)가 wait screen에서 발송되는가? (devtools 콘솔에서 확인)

### 합격 기준

- 동일 핀+닉네임 재입장 정상.
- 토글 OFF 시 재입장 차단 메시지 표시.
- StudentAvatarGrid 중복 0건.

### 결과 (시연 후 기입)

- 합격 여부:
- 발견 사항:
- 후속 조치:

---

## 시나리오 4 — MigrationReportModal 명확성

### 가설

V1 템플릿이 있는 사용자가 처음 V2를 켰을 때, MigrationReportModal이 "무엇이 변환됐고 무엇이 실패했는지" 비개발자에게 즉시 이해 가능.

### 실행 순서

1. V1 ToolMultiSurvey에서 템플릿 2건 이상 저장 (예: 단일선택 1건 + 척도 1건). `useToolTemplateStore`에 영속됨.
2. V2 도구 진입 시 OptInBanner의 "새 도구 사용해보기" 클릭.
3. **자동 트리거**: `useV1MultiSurveyData` 변환 → `migrationReport.runMigration(v1Sessions)` 호출 → 결과 모달 표시.
4. 모달 본문 확인 — totalCount / successCount / failedCount / failedItems 명세 + 백업 경로.

### 관찰 포인트

- [ ] 모달 첫 진입 시 비개발자에게 "성공 N건 / 실패 M건"이 즉시 보이는가?
- [ ] failedItems의 sourceId/reason이 사용자에게 의미 있는 정보로 보이는가?
- [ ] "다시 안 보기" 토글이 명확하게 옵션이라는 게 인지되는가?
- [ ] ESC / 외부 클릭 / X 모두 모달을 닫는가?
- [ ] devtools에서 `multi_survey_v2_migration_completed` 이벤트가 properties(total/success/failed)와 함께 발송되는가? (C.4 산출 검증)
- [ ] ModalCoordinator 통합 TODO 명시 — 본 시연에서 우선순위 충돌이 발생하면 별도 이슈로 기록.

### 합격 기준

- 비개발자가 모달 본문 5초 안에 "성공/실패 수" 파악.
- 백업 경로가 OS 파일 탐색기로 추적 가능한 절대 경로.

### 결과 (시연 후 기입)

- 합격 여부:
- 발견 사항:
- 후속 조치:

---

## 시나리오 5 — 멀티 PC sync 일시 정지 안내 명확성 (Q3 재오픈 트리거)

### 가설

PC1↔PC2 4 사분면 매트릭스(v2.1.0↔v2.0.x 교차)에서 sync 일시 정지 모달이 비개발자에게 충분히 이해되는가.

### 현재 초안 문구 (Plan §5.2 D6 / open-questions Q3 — 미확정)

> "다른 PC에서 v2.1.0으로 업데이트된 데이터가 있어요. 이 PC도 v2.1.0으로 업데이트하면 다시 sync됩니다."

### 실행 순서

1. PC1: V2 옵트인 + 1 세션 작성 → cloud sync 대상에 들어가는지 확인 (또는 placeholder).
2. PC2(가상 또는 별도 PC): 동일 계정 로그인 + V2 아직 옵트인 안 함 (v2.0.x 상태 시뮬레이션).
3. PC2 진입 시 sync 일시 정지 안내 모달 노출 확인.
4. 모달 문구 비개발자에게 자가 평가.

### 관찰 포인트

- [ ] "다른 PC"가 어느 PC인지 디바이스 이름으로 명시되는가? (없으면 Q3 재오픈 트리거)
- [ ] "업데이트"가 비개발자에게 "버전 업그레이드"로 이해되는가, "데이터 갱신"으로 오해되는가?
- [ ] "v2.1.0"이라는 버전 번호가 사용자에게 의미 있는가? — "최신 버전"으로 풀어쓰는 게 나은지 자가 판정.
- [ ] 모달이 sync 일시 정지의 **이유**를 충분히 설명하는가? (그냥 "동기화가 중단되었어요"가 아니라)

### 합격 기준

- 비개발자가 모달 1회 읽고 "PC2도 업데이트하면 다시 동기화된다"는 액션 아이템 파악.
- 디바이스 이름 + "최신 버전" 표기 1개 이상 미흡 → **Q3 재오픈 → Phase C 이전 단계로 회귀**.

### 결과 (시연 후 기입)

- 합격 여부:
- Q3 재오픈 여부:
- 발견 사항:
- 후속 조치:

---

## 종합 합격 기준 (G004 complete checkpoint 입력)

| 시나리오                     | 합격 (✓/✕) | 비고            |
| ---------------------------- | ---------- | --------------- |
| 1. 메이커 토글 그룹 인지     |            |                 |
| 2. 3 화면 동시 동작          |            |                 |
| 3. 재입장 흐름               |            |                 |
| 4. MigrationReportModal 명확 |            |                 |
| 5. sync 일시 정지 안내       |            | Q3 재오픈 여부: |

- **5건 ALL ✓** → G004 Phase C C.6 통과 → C.5 릴리즈 워크플로우 진입.
- **1건 이상 ✕** → 해당 영역 후속 PDCA 분리 결정 (준일님 + 본 핸드오프 § "Phase C 잔여 작업" 갱신).
- **Q3 재오픈 시** → Phase C C.6 결과 박힌 후 Plan §5.2 D6 모달 문구 재발행, Phase D 진입 시점 연기 가능.

---

## 시연 후 후속

1. 본 파일 § "결과 (시연 후 기입)" 5개 블록 작성.
2. § "종합 합격 기준" 표 채움.
3. C.6 통과 시:
   - PROGRESS.md Recently completed에 한 줄 추가.
   - HANDOFF 핸드오프 § "Phase C C.4 진행 결과" 다음에 § "Phase C C.6 진행 결과" 신설.
   - Task #3 completed로 마킹.
4. C.6 불합격 시:
   - 불합격 항목별 후속 작업을 핸드오프 § "Phase C 잔여 작업"에 추가.
   - 합격선 미달 시 ADR-005(Q5 폴백) 트리거 점검.
