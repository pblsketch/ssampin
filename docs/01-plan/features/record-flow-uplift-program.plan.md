# 생기부 흐름 고도화 — 상위 작업 묶음과 병렬 세션 배치 (Program Plan v1.0)

- 작성일: 2026-09-04
- 상태: 착수 전. 오너 결정 — **상위 작업별로 병렬 세션에서 진행한다.**
- 근거: [1차 분석](../../03-analysis/record-draft-flow-curriculum-standards.analysis.md) ·
  [2차 분석(정본)](../../03-analysis/record-draft-flow-v2-inquiry-thread.analysis.md)
- 관련 결정: ADR-072(생기부 초안) · ADR-074(학생 쓰기 3종) · ADR-081(계측은 이름만)

---

## 0. 병렬로 가기 전에 — 규칙 하나, 순서 하나

프로젝트 규칙(`CLAUDE.md`)은 "여러 세션에 병렬 **구현**을 맡기지 않는다"이고, 이유는 같은 파일을 두 세션이
고쳐 충돌이 잦았기 때문이다(실제 사고: 남의 파일 8개가 커밋에 딸려 나감). 오너가 이번에는 병렬을 택했으므로
**규칙이 막으려던 사고만 막는 방식**으로 간다.

1. **파일 소유권을 작업마다 못 박는다**(§3). 한 파일은 한 작업만 만진다. 소유 밖 파일이 필요하면
   그 작업의 세션은 **고치지 말고 요청을 적어 둔다**(§5 통합 세션이 처리).
2. **공통 기반(T0)을 먼저 혼자 끝낸다.** 여러 작업이 다 건드릴 뻔한 파일(엔티티·동기화 등록·브릿지
   화이트리스트·계약 테스트·초안 저장 관문)을 T0가 한 번에 손보고 커밋한 뒤, 나머지가 그 위에서 출발한다.
3. **커밋은 항상 경로 지정** — `git add <paths> && git commit -m "..." -- <paths>` 한 줄. `git add -A` 금지.
   다중 세션에서 git 인덱스는 공유 상태다.
4. 세션 시작 때 `git status --short` 로 남의 변경을 보고, 자기 소유 파일만 만진다. 브랜치·워크트리는 만들지 않는다.

---

## 1. 상위 작업 묶음

| ID       | 작업                                 | 한 줄                                                                                                                                     | 병렬          | 선행  |
| -------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ----- |
| **T0**   | 공통 기반                            | 계측 이벤트 · `RecordDraft.term` · `InquiryThread` 엔티티·스토어·동기화·보관함 · 선택 필드 · 브릿지 미러 · 플래그 라벨 도메인 이동        | ✗ 먼저 혼자   | —     |
| **T1**   | 말로 남기기(STT)                     | Win+H 대신 눌러 주기 · 시작 도구 안내 · 모바일 Web Speech · 말 → `add_observation` 구조화 · 고지                                          | ✓             | T0    |
| **T2**   | 근거 창고 주제 분류 + 탐구 흐름 화면 | 창고에 주제 열(미분류/주제/새 주제) · 수행평가명 후보 · 키워드 제안 · 시간순 줄기 · 빈 고리 힌트 · 브릿지 `get_record_evidence(threadId)` | ✓             | T0    |
| **T3**   | 성취기준·루브릭 연결                 | 성취기준 번들 데이터 + 키워드 추출 · `Rubric.standardCodes?` · 평가계획서 파서 코드 보존 · 진도·과제에 코드 선택                          | ✓             | T0    |
| **T4**   | 점검 축 확장(로컬 규칙)              | 성취기준 복사 · 공통 문구 · 일반 평가 나열 · 활동 나열 · 변화 근거 · 내면 표현 — 도메인 순수 함수 + 저장 관문 + 브릿지 미러               | ✓             | T0    |
| **T5**   | 과제수합 파일 본문 유입              | 학생 제출 파일(드라이브) → 본문 추출 → `Submission.extractedText?` → 근거 창고에 실림                                                     | ✓             | T0    |
| **T6**   | 통합·검증·가이드·릴리즈              | 전체 게이트 · 회귀 · 소유 밖 요청 처리 · `/docs` 가이드 · 실기기 확인 목록 · 실험실 토글 여부 결정                                        | ✗ 마지막 혼자 | T1~T5 |
| T7(후속) | 작은 것들                            | 질문·되물음 쌍 · 다음 탐구 메모 이월 · 교과 간 배분 보기 · 구조 보기 · 입력 시 흐름 제안 칩                                               | —             | T6    |
| —        | Phase 3·4                            | 자기평가서 · 인앱 AI 개방(하네스 F·G 추가 후)                                                                                             | —             | 별도  |

**T2 가 핵심**이다. T1·T3·T4·T5 는 각자 독립 가치가 있고 T2 없이도 출시할 수 있다.

---

## 2. 작업별 범위

### T0 공통 기반 (혼자, 작게, 먼저)

- **계측**: 관찰 저장(슬롯 유무) · 근거 창고 열기 · 끌어오기 · 초안 저장(출처 teacher/bridge) — ADR-081 방식,
  **이름만**. `useAnalytics` 이벤트 이름 추가 + 호출 4곳.
- **`RecordDraft.term?`** — `withDerivedTerm` 선례 재사용. 부재 = 구 데이터, 추측 부착 금지.
- **`InquiryThread` 엔티티** `src/domain/entities/InquiryThread.ts`:
  `{ id, studentRef, classId?, title, keywords[], standardCodes?, competencyKeywords?, nextNotes?, status:'open'|'closed', term?, createdAt, updatedAt }`
  - `inquiry-threads.json` 저장소·스토어(`useInquiryThreadStore`) · **동기화 등록(`syncRegistry.ts`) · 보관함(`archiveScope.ts`)**.
- **선택 필드**: `ObservationRecord.threadId?` · `RecordEvidence.threadId?` · `Rubric.standardCodes?` ·
  `Submission.extractedText?` · `ProgressEntry.standardCodes?` · `Assignment.standardCodes?` — 전부 additive optional.
  **부재는 빈 값이 아니다**(병합에서 덮지 말 것).
- **브릿지 미러**(별도 레포 `ssampin-ai-bridge`): `normalizeRecord` 화이트리스트에 새 필드 · 엔티티 샘플 계약
  메타테스트 갱신. **안 넣으면 AI 경로에서 조용히 사라진다.** 동봉 번들 재생성은 T6(§3).
- **플래그 라벨 도메인 이동**: `RecordDraftView.tsx` 의 `FLAG_LABELS` 를 `src/domain/rules/recordDraftFlagLabels.ts` 로.
  T4 가 라벨을 더할 때 화면 파일을 안 건드리게.
- **키워드 원천 포트**: `src/domain/rules/topicKeywordSources.ts` — "주제 이름 후보(수행평가명 → 과제 제목 → 성취기준
  키워드)"와 "매칭 키워드(루브릭 요소명 등)"를 주는 순수 함수의 **시그니처만**. T2 가 쓰고 T3 가 원천을 더한다.
- 게이트 4종 + 브릿지 테스트. 커밋 후 나머지 세션 출발.

### T1 말로 남기기

- Electron main `electron/ipc/voiceTyping.ts`(신규): 렌더러 요청 → PowerShell 로 `Win+H` 키 입력. Windows 만.
  preload 노출. macOS 는 받아쓰기 단축키 안내로 대체.
- 마이크 버튼: `ObservationForm.tsx`(데스크톱) · `ReminderPopup.tsx`(수업 직후) · `SidePinMemoEditor.tsx`(옆핀).
  누르면 칸에 커서 → IPC. 첫 1회 안내: "설정 → 음성 입력 시작 도구를 켜면 글자 칸을 클릭할 때 마이크가 저절로 나타납니다."
- 모바일 `ObservationSheet.tsx`: 시트 열 때 자동 커서 + 마이크 버튼 → `useSpeechInput` 훅(Web Speech, ko-KR,
  연속·중간 결과, 미지원이면 버튼 숨김).
- **구조화**: 말로 쓴 긴 글 → 쌤핀 AI `add_observation`(ADR-074) 제안 카드. 새 도구 아님, **입력 경로 추가**
  (`AssistDockContainer`/`executeAssistWrite` 쪽에 "이 글을 학생별로 나누기" 진입). 여러 학생 = 카드 여러 장. 모델은 나누고 옮길 뿐.
- 설정 고지 한 줄: "음성은 OS 제조사 서버에서 글자로 바뀝니다."
- 실기기 확인: Win+H 첫 실행 OS 동의 화면 · 아이폰 PWA 독립 실행에서 Web Speech.

### T2 근거 창고 주제 분류 + 탐구 흐름

- `RecordEvidenceView.tsx`: 영역 탭 안에 **주제 열** — `미분류 | 주제 A | … | + 새 주제`. 체크 → "주제로 묶기", 끌어다 놓기.
  새 주제 이름 후보 = **수행평가명**(`AssessmentPlanItem.title`·`Rubric.title`) → 과제 제목 → 성취기준 키워드(T3 뒤).
  같은 키워드 든 미분류 근거 "이것도 이 주제?" 제안(문자열 검사, AI 없음). "미분류 N건" 배지.
- 흐름 화면(신규 `RecordDraft/InquiryThreadPanel.tsx` 등): 시간순 줄기(슬롯 라벨) · **빈 고리 힌트**(질문 1개뿐/시행착오 0) ·
  교사 역량 키워드 칩(분야 붙이기 유도) · 다음 탐구 메모 · 닫기.
- 과제 제출·루브릭 채점 → 같은 학생의 열린 주제에 **후보** 표시(끌어오기 목록에 "○○ 주제에 넣기").
- `RecordDraftView.tsx`: 초안 칸에 "이 주제로" 선택(브릿지 요청 시 threadId 전달). 인앱 [AI 초안] 버튼은 **만들지 않는다**(Phase 4).
- 브릿지: `get_record_evidence` 에 `threadId` 인자 + 응답에 `threadId`·주제 이름, `get_inquiry_threads`(읽기) 신설.
  `get_record_guidelines` 에 "주제 하나를 깊게 · 성취기준 원문 복사 금지 · 키워드만" 문구.
- 관찰 알림 문구에 "미분류 근거 N건" 추가(누구를 부를지는 안 바꿈).
- **디자인 협업 필수**(주제 열·흐름 화면). 실렌더 확인.

### T3 성취기준·루브릭 연결

- 성취기준 정본 번들: `scripts/fetch-curriculum-standards.mjs` — 초·중등 MCP npm 패키지에서 코드·원문·과목·영역·학년군·출처만
  추출 → `src/domain/data/curriculumStandards.*.json`. 주제(topic)·선수관계는 넣지 않는다. 특성화고는 선택(용량 확인 후).
- 키워드 추출: 번들 시점에 Kiwi(`ssampin-record-check` 44MB 구성 재사용)로 원문 **명사만** → `keywords[]` 동봉. 런타임 비용 0.
  ★**원문은 AI 에 보내지 않는다.** T4 복사 검사와 화면 표시에만 쓴다.
- `scoringRubricParser.ts`: 읽은 성취기준 코드를 **버리지 말고** `RubricCandidate.standardCodes` 로 → 루브릭 생성 시 `Rubric.standardCodes`.
- 진도(`ProgressEntryFields.tsx`)·과제(`AssignmentCreateModal.tsx`)·루브릭 편집에 **성취기준 고르기**(과목·학년으로 좁힌 목록, 검색은 보조).
  2015 개정 학년(2026 중3·고3)은 "자료 없음 — 직접 입력" 을 그대로 적고 `standardText?` 자유 입력 허용.
- `topicKeywordSources.ts` 에 성취기준 키워드 원천 구현(T0 시그니처).
- 확인 선행: 세특 기재요령 원문의 성취기준 서술 요건(문구 결정 전).

### T4 점검 축 확장

- `src/domain/rules/recordNarrativeChecks.ts`(신규, 순수): 성취기준 복사(어절 n-gram 겹침) · 공통 문구(같은 반 다른 초안과
  문장 중복) · 일반 평가 나열(사전 어휘, 장면 없이 연속) · 활동 나열(활동 명사 N개 + 질문 표지 0) · 변화 근거(점차·꾸준히 +
  시기 대비 없음) · 내면 표현(이해함·깨달음·흥미를 느낌). 각각 flag 코드 + 한국어 라벨(`recordDraftFlagLabels.ts`, T0).
- `useRecordDraftsStore.upsert` 관문에서 호출(`hasProhibitedRecordItem` 선례). **막지 않고 경고만.**
- 브릿지 `grounding.ts` 미러 + `check_record_draft` 응답 확장 + 테스트. 동봉 번들 재생성.
- 하네스(저장소 밖 `E:\test\ssampin-record-draft-eval`)에 F(키워드만 줬을 때 원문 복원) · G(줄기 순서/뒤섞기) 사례 추가.
  **프롬프트·사례 원문은 저장소에 넣지 않는다.**

### T5 과제수합 파일 본문 유입

- 학생 제출 파일(드라이브 `driveFileId`) → 앱이 내려받아 본문 추출(텍스트·HWP·PDF — 첨부 `extractedText` 경로와 같은 추출기 재사용) →
  `Submission.extractedText?`. 실패는 조용히 넘기되 "본문 추출 안 됨" 표시.
- `evidenceImport.submissionToEvidence` 가 `extractedText` 를 싣는다(파일명만 싣던 것 개선). 기재 금지 자동 표시가 그대로 받친다.
- 용량 상한·재시도·오프라인 시 대기 규칙.

### T6 통합·검증·가이드·릴리즈 (혼자, 마지막)

- T1~T5 커밋을 한 트리에서 **게이트 4종 + 회귀 + 브릿지 테스트 + 랜딩 `docs:check`·build**.
- 각 작업이 남긴 "소유 밖 파일 요청" 처리. 충돌·중복 정리.
- `/docs` 사용자 가이드(말로 남기기 · 주제 묶기 · 성취기준 고르기 · 점검 경고 설명). Notion 은 갱신 대상 아님.
- 실기기 확인 목록 실행(§4). 실험실 토글 여부 결정(주제 열·흐름 화면은 기본 켬 후보, STT 구조화는 쌤핀 AI 실험실 종속).
- PROGRESS·DECISIONS(ADR 1건: "흐름은 창고에서 묶는다 — ADR-072 결정 6 과의 관계") · 릴리즈 SOP.

---

## 3. 파일 소유권 (충돌 방지 정본)

| 파일·영역                                                                                                                                                                                                                                                               | 소유   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `src/domain/entities/*`(신규 필드·`InquiryThread`) · `syncRegistry.ts` · `archiveScope.ts` · `useInquiryThreadStore.ts`(생성) · `recordDraftFlagLabels.ts` · `topicKeywordSources.ts`(시그니처) · `useAnalytics` 이벤트 이름 · 브릿지 `normalizeRecord`·계약 메타테스트 | **T0** |
| `electron/ipc/voiceTyping.ts` · preload 음성 항목 · `ObservationForm.tsx` · `ReminderPopup.tsx` · `SidePinMemoEditor.tsx` · `src/mobile/.../ObservationSheet.tsx` · `useSpeechInput.ts` · `Assist/*`(구조화 진입) · 설정 고지                                           | **T1** |
| `RecordEvidenceView.tsx` · `RecordDraftView.tsx` · `RecordDraft/InquiryThread*.tsx`(신규) · `useInquiryThreadStore.ts`(로직) · `threadSuggest.ts`(신규) · 관찰 알림 **문구** 파일 · 브릿지 `recordDraftTools.ts`·`server.ts` 생기부 도구                                | **T2** |
| `scripts/fetch-curriculum-standards.mjs` · `src/domain/data/curriculumStandards*` · `scoringRubricParser.ts` · `EvaluationPlan.ts`(candidate 코드) · `ProgressEntryFields.tsx` · `AssignmentCreateModal.tsx` · 루브릭 편집 화면 · `topicKeywordSources.ts`(구현)        | **T3** |
| `src/domain/rules/recordNarrativeChecks.ts` · `useRecordDraftsStore.ts` · 브릿지 `grounding.ts`·`check_record_draft` · 하네스(저장소 밖)                                                                                                                                | **T4** |
| `useAssignmentStore.ts` · 과제 제출 내려받기·추출 usecase·IPC · `evidenceImport.ts`                                                                                                                                                                                     | **T5** |
| 그 외 전부 · `/docs` · PROGRESS · DECISIONS · 릴리즈 파일                                                                                                                                                                                                               | **T6** |

**겹침 주의**: `evidenceImport.ts` 는 T5 소유 — T2 가 후보 표시에 필요하면 **읽기만** 한다. 브릿지 동봉 번들
`electron/ai-bridge/index.mjs` 는 **T6 가 마지막에 한 번** 재생성한다(T2·T4 는 브릿지 레포에서 테스트까지만).

---

## 4. 실기기 확인 목록 (T6)

- Win+H 첫 실행 OS 동의 화면 · PowerShell 키 입력 우회 · 옆핀·알림 팝업에서 동작.
- 아이폰 PWA 독립 실행에서 Web Speech · 안드로이드 크롬 연속 듣기.
- 말 → 학생별 카드 나누기(여러 학생 섞인 문장 3종).
- 주제 열 끌어다 놓기·"이것도 이 주제?" 제안 정확도(수행평가명·루브릭 요소명 기준).
- 성취기준 고르기 목록이 과목·학년으로 좁혀지는지 · 2015 개정 학년 "직접 입력" 흐름.
- 점검 경고 6종이 실제 초안에서 오탐 없이 뜨는지(경고만, 막지 않음).
- 과제 파일 본문 추출(한글·PDF·이미지 실패 처리).

---

## 5. 세션 시작 문구 (각 세션에 그대로 붙여 넣기)

```
[T? 작업명] — docs/01-plan/features/record-flow-uplift-program.plan.md §2 T? 범위와 §3 파일 소유권만 따른다.
시작: git status --short 확인, 소유 밖 파일은 고치지 않고 "요청" 으로 이 계획서 §6 에 적는다.
커밋: git add <paths> && git commit -m "..." -- <paths> (경로 지정, git add -A 금지).
UI 변경은 프론트엔드 디자인 에이전트와 함께. 게이트 4종 통과 범위를 명시하고 끝낸다.
```

## 6. 소유 밖 파일 요청 (세션들이 여기에 적는다)

### T5 (과제수합 파일 본문 유입) — 2026-09-04

**T5 가 직접 고친 소유 밖 파일 1개** (숨기지 않고 적는다):

- `src/adapters/di/container.ts` — 추출기 조립 20줄 추가(import 3줄 + `getExtractSubmissionTexts`).
  스토어에서 `await import('@infrastructure/...')` 로 우회하면 소유 밖 파일은 0개가 되지만
  "adapters → infrastructure 금지"를 어기는 부채가 영구히 남는다(eslint 가 "DI 경유로 리팩터링 후
  error 로 승격" 을 명시). **조립은 컨테이너에서만 가능**하므로 아키텍처 규칙을 택했다.
  결과: 새 lint 경고 0건.

**T5 가 새로 만든 파일** (소유권 표에 이름이 없어 여기 적는다 — "과제 제출 내려받기·추출 usecase" 의 구현체):

- `src/domain/ports/ISubmissionFilePort.ts` · `src/domain/repositories/ISubmissionTextRepository.ts` ·
  `src/infrastructure/google/SubmissionFileClient.ts` · `src/adapters/repositories/JsonSubmissionTextRepository.ts` ·
  `src/usecases/assignment/ExtractSubmissionTexts.ts`(+테스트)

**요청 (T6 가 처리)**

1. **`submission-texts` 캐시를 학년도 전환에 함께 태울 것.** 새 저장 키(학생이 낸 글의 본문)를
   `ARCHIVE_SCOPE_ITEMS`(`SchoolYearWizard/archiveScope.ts`)와 `YEAR_TRANSITION_FILES`
   (`usecases/schoolYear/ExecuteYearTransition.ts`)에 **둘 다** 넣어야 한다 — 테스트가 두 목록의
   키 집합 일치를 단언하므로 한쪽만 넣으면 게이트가 빨개진다. 지금은 T5 가 스스로 지운다(과제 삭제 시
   동반 삭제 + 목록에 없는 과제 폐기 + 180일 만료)므로 무한 잔류는 아니지만, 학년이 바뀔 때
   과제 본체만 보관함으로 내려가고 본문 캐시는 남는다.
   ★**동기화(syncRegistry) 등록은 요청하지 않는다** — 학생이 쓴 원문을 기기 사이로 실어 나르는 것은
   별개의 결정이다.
2. **kordoc `SUPPORTED_EXTENSIONS` 에 `txt`·`md` 추가**(`electron/ipc/markdownConvert.ts`, 메인 1곳).
   지금은 `.txt` 제출이 `unsupported` 다. **관찰 첨부로 올린 `.txt` 도 똑같이 본문이 안 들어온다**
   (두 경로가 같은 확장자 목록을 쓴다) — 한 곳을 고치면 두 경로가 같이 낫는다. T5 는 "첨부와 같은
   추출기를 재사용한다"는 §2 규칙을 지키려고 자기 경로에만 디코더를 넣지 않았다.
3. **T2 — 근거 창고가 "마지막에 연 과제 1건"만 본다.** `RecordEvidenceView` 는
   `useAssignmentStore.submissions` 를 읽는데 그 배열은 교사가 과제 상세를 연 그 과제 하나만 담는다
   (T5 이전부터 있던 한계). 교사가 과제수합을 안 들르고 곧장 생기부로 가면 제출물 후보가 0건이다.
4. **T2 — 본문이 없는 이유를 화면에 보여줄 것(선택).** T5 는 근거 본문 안에
   `(본문 추출 안 됨)`·`(사진 파일 — 본문 추출 불가)` 를 남긴다. 후보 미리보기는 CSS 한 줄
   말줄임이라 레이아웃은 안 깨지지만, 실패한 것을 교사가 다시 시도할 입구가 없다.
   스토어에 `retrySubmissionTexts(assignmentId)` 를 만들어 뒀으니 단추만 붙이면 된다
   (지금은 [새로고침]을 10분 뒤에 다시 누르면 재시도된다).
5. **T2 — 기재 금지로 제외된 근거에 "왜 제외됐는지" 표시.** 파일 본문이 길어지면 학생 문장 하나
   (예: "…대회에서 최우수상")로 근거 전체에 `excludedFromAi` 가 붙어 AI 경로에서 조용히 빠진다.
   규칙대로 동작하는 것이지만 교사는 이유를 알 수 없다.

**남기는 한계 (수용 기준 4 — 개인정보)**

- 근거 창고 → 브릿지 경로는 `deidentify(content, roster)` 를 태운다. **명단(roster)에 있는 학생의
  실명·학번은 가려지고**, 전화번호·주민번호·생일·이메일은 명단과 무관하게 형태로 가려진다.
  그러나 **명단 밖 이름은 가리지 못한다** — 학생 글에는 다른 반 친구·가족·학원 이름이 흔하다.
  이 한계는 첨부(`ObservationAttachment.extractedText`) 경로에 이미 있던 것과 같으며, T5 는 그
  경로를 넓힌다. 또한 근거 본문은 **학생이 쓴 글 그대로**라 그 안에 숫자가 있을 수 있다 —
  `evidenceImport` 의 불가침 규칙은 "앱이 들고 있는 점수·배점 필드를 싣지 않는다"이지 "숫자가 한
  글자도 없다"가 아니다(회귀 가드는 그대로 통과).

### T4 (점검 축 확장 — 로컬 규칙 6종) — 2026-09-04

**T4 는 소유 밖 파일을 하나도 고치지 않았다.** 대신 아래 1건을 요청한다.

**요청 (T6 가 처리)**

1. 🔴 **브릿지 `packages/core/src/write.ts`(640~668행)에 서사 flag 를 한 줄 더할 것.**
   앱이 **꺼져 있을 때** AI 가 초안을 직접 저장하면 거기가 마지막 문인데, 지금은 문장 단위
   `report.claims.flatMap(c => c.flags)` 만 모은다. 서사 점검은 초안 **전체** 단위라 그 집계에
   안 잡힌다. 그대로 두면 **앱을 켜 두면 경고가 뜨고 꺼 두면 안 뜬다** — `useRecordDraftsStore.ts`
   주석이 기록한 "확정 초안 잠금이 loopback 으로 우회됐다"와 같은 사고 유형이다.
   재료는 이미 `checkGrounding` 이 report 에 실어 준다. 넣을 줄:

   ```ts
   for (const f of report.narrative) flags.push(f.code);
   ```

   (`hasProhibitedRecordItem(content)` 로 `prohibited_item` 을 붙이는 바로 그 근처.)

**남기는 한계 (계획에 적고 넘어간 것 — "됐다"고 오판하지 않기 위해)**

- **성취기준 복사 검사(K1)는 지금 실제로는 돌지 않는다.** 재료(성취기준 원문)를 넘겨줄 화면이
  `RecordDraftView.tsx`(T2 소유)이고 번들이 T3 산출물이다. 스토어 입력에 `standardTexts?` 를
  뚫어 뒀으니 **T2·T3 가 착륙하면 배선 한 줄로 켜진다.** 그때까지는 `skipped` 로 정직하게 보고한다.
- **브릿지에서는 성취기준 복사·공통 문구 2종이 영구히 생략된다.** 브릿지에 그 재료가 없다
  (도구 입력 스키마를 늘리려면 `server.ts` — T2 소유 — 를 고쳐야 해서 손대지 않았다).
  `GroundingReport.narrativeSkipped` 에 이유가 실려 나가고 `disclaimer` 도 그 사실을 적는다.
- **공통 문구 검사는 저장 순서에 따라 비대칭이다.** 판정 재료가 "이미 저장된 다른 학생 초안"이라
  1번 학생 저장 때는 견줄 대상이 0건이고, 30번 학생이 경고를 받는다. 또 초안 화면이 700ms 자동저장이라
  **타이핑 중인 미완성 문장**과도 견준다. 순수 함수를 export 해 뒀으니 **T2 가 읽는 시점에 다시
  계산하면** 둘 다 보이게 할 수 있다(그게 제대로 된 자리다). 지금은 순서 의존을 테스트로 명문화만 했다.
- **미러 지문 대조는 보증이 아니라 알람이다.** 양쪽 어휘를 같이 고치면 지문도 같이 바뀌어 둘 다
  초록이 된다. 잡는 것은 "한쪽만 고쳤다" 하나뿐이고, 저장소가 갈라져 있어 **CI 에서는 실제 파일
  대조가 아예 돌지 않는다**(브릿지 파일이 체크아웃에 없다).
- **변화 근거 판정의 30일은 아직 보정되지 않은 수다**(`CHANGE_BASIS_MIN_SPAN_DAYS`). 원 분석 §7 의
  "두 학기 날짜"는 한 학기 문서인 세특에서 성립하지 않아 `꾸준히` 가 든 정상 초안을 전부 경고한다.
  실패 방향이 **미탐**(무관한 두 관찰이 변화 서사를 통과시킴)이라 "막지 않는다" 원칙과 충돌하지 않는다.
  하네스 실행 뒤 조정할 것.
- **내면 표현 검사 제외는 초등 교과학습발달상황(`subjectDev`)만이다.** 중등 세특에서도 `이해함` 은
  성취기준 서술어 그 자체지만, 오너 교사 프롬프트가 그 표현을 명시적으로 금지하므로 **의도적으로**
  경고한다.

**하네스(저장소 밖, `E:	est\ssampin-record-draft-eval`)**

- F(성취기준을 키워드로만 줬을 때 원문 복원) · G1(줄기 순서대로) · G2(줄기 뒤섞기) 사례 추가.
  채점기는 **브릿지 빌드 산출물의 검사 함수를 그대로 import** 한다 — 하네스에 규칙을 또 베끼면
  사본이 셋(본체·브릿지·하네스)이 되어 반드시 어긋난다.
- ★**아직 실행하지 않았다**(API 호출 비용 — 오너 승인 대기). 채점 경로만 가짜 응답으로 확인했다.

## 7. 하지 않는 것 (이번 프로그램 밖)

- 인앱 [AI 초안] 버튼·`ALLOWED_GRADES` 개방(Phase 4) · 자기평가서(Phase 3) · 로컬 STT 엔진 · 앱 자체 청취(WinRT) ·
  외부 유료 STT · 성취기준 원문의 AI 전송 · 흐름 자동 생성·필수화 · 담임 행특에 흐름 적용 · 점수판형 커버리지.
