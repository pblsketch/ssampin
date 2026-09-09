# 학생 자기평가서 → 생기부 근거 계획 (Phase 3 구현)

상태: **승인됨(2026-09-08) · P0·P1 완료(2026-09-09), 미커밋·미배포 · P2·P3 미착수**
작성일: 2026-09-08
상위 설계: [record-draft-phase34.design.md](../../02-design/features/record-draft-phase34.design.md) Phase 3 (v1.1 정정 반영)
관련 결정: ADR-072 결정 7 · [ADR-096](../../03-decisions/ADR-096.md)(채택 2026-09-08)
방침 문구: [self-assessment-privacy-wording.md](../../release-prep/self-assessment-privacy-wording.md)(초안)
실행 추적: `.omc/ultragoal/plans/self-assessment-p0p1/`(G001 P0 · G002 도메인 · G003 서버 · G004 학생화면 · G005 게이트)
선행 작업: **학생 번호 무결성 S1**(과제 명단·식별·근거 후보) — [분석](../../03-analysis/student-number-integrity-20260908.analysis.md) P1-3·P1-4

---

## 0. 요약

생기부 초안의 근거 3종(교사 관찰 / 학생 과제물과 교사 평가 / **학생 자기평가서**) 중 세 번째가 코드에 없다.
설계는 2026-08-25 오너 인터뷰로 확정돼 있고(설계서 §0 표), 이 계획은 그 설계를 **지금 코드 위에** 올리는 순서를 정한다.

한 줄로: **과제 수합을 넓힌다.** 학생이 이미 링크로 들어와 학년·반·번호·이름을 대고 제출하는 통로가 있으니, 그 제출 화면에 자기평가 문항을 붙이고, 답변을 근거 정리 보드의 거울 카드로 띄워 교사가 고른 것만 창고에 넣는다.

용어를 처음 한 번씩 풀어 둔다.

- **근거 창고(RecordEvidence)**: 학생별로 모아 둔 생기부 작성 재료. 초안을 쓰는 AI 는 이것만 읽는다.
- **거울 카드**: 관찰기록·과제물 같은 원본이 근거 정리 보드 "미분류" 열에 저절로 비쳐 보이는 카드. 교사가 손대기 전에는 저장되지 않는다. 설계서가 말한 "대기 목록"이 바로 이것이다.
- **슬롯**: 기록 하나가 "어떤 장면인가"(질문·시도·시행착오·산출물·피드백·융합)를 붙이는 축. 자기평가 문항에도 같은 축을 단다.
- **엣지 함수(Edge Function)**: 서버에서 도는 작은 프로그램. 학생 제출과 교사 조회가 전부 이 함수를 거친다. 표 자체는 앱에서 직접 못 읽는다(RLS deny-all).
- **마이그레이션**: 데이터베이스 구조 변경 기록. 번호가 삼중으로 겹쳐 있어 정리해 둔다.

  | 번호    | 임자                                   | 상태                                                                             |
  | ------- | -------------------------------------- | -------------------------------------------------------------------------------- |
  | 066     | 온라인 교무실 제출과제                 | 커밋됨                                                                           |
  | **067** | 설문 학생 번호(학생 번호 무결성 세션)  | **파일 있음**(미커밋)                                                            |
  | 068·069 | 상담 교사 Google 신원 전환 계획이 예약 | 계획서에는 067·068 로 적혀 있다 — 067 을 뺏겼으니 **그쪽이 한 칸씩 밀어야 한다** |
  | **070** | 이 계획(자기평가서)                    | **파일 있음**(미커밋)                                                            |

- **게이트 4종**: 타입 검사 · 코드 품질 · 테스트 · 회귀 검사. 완료 선언 전 필수.

규모: 마이그레이션 1건, 엣지 함수 3개 수정(신규 0), 학생 페이지 1개 수정, 앱 도메인 2파일 신설 + 10여 파일 수정, 브릿지 2곳, 문서 3종.
복잡도: **MEDIUM-HIGH**(미성년자 데이터 신규 수집 · 학생 식별 결함과 겹침 · 서버 배포 동반).

---

## 1. 현재 상태 (2026-09-08 조사)

### 1.1 있는 것

| 부품                                     | 상태 | 위치                                                                                                       |
| ---------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------- |
| 근거 창고 출처 6종                       | 완성 | `src/domain/entities/RecordEvidence.ts:18-49`                                                              |
| 원본 → 거울 카드 → 저장 경로             | 완성 | `src/usecases/studentRecords/collectEvidenceCandidates.ts` · `src/adapters/hooks/useEvidenceCandidates.ts` |
| 저장 시 기재 금지 항목 자동 검사         | 완성 | `src/adapters/stores/useRecordEvidenceStore.ts:296-298`(`buildEvidence`)                                   |
| 과제물 → 근거 변환                       | 완성 | `src/usecases/studentRecords/evidenceImport.ts:72-87`(`submissionToEvidence`)                              |
| 학생 제출 페이지(링크·본인 확인·글 제출) | 완성 | `landing/src/components/submit/SubmitForm.tsx` · `supabase/functions/submit-assignment`                    |
| 글만 제출 시 드라이브 미경유             | 완성 | `submit-assignment/index.ts:377` 파일 없으면 `drive_file_id` null, `text_content` 만 저장                  |
| 담임반·수업반 대상 지정                  | 완성 | `Assignment.target.type = 'class' \| 'teaching'`                                                           |
| 과제 생성 시 교사 Google 계정 확인       | 완성 | `create-assignment/index.ts:36-43,82`(`teacher_id` = 이메일)                                               |
| 근거 창고 기기 간 동기화                 | 완성 | `src/usecases/sync/syncRegistry.ts:361-365`(ADR-072 가 적은 "동기화 안 됨"은 이제 사실이 아니다)           |
| 관찰 슬롯 축                             | 완성 | `src/domain/rules/observationSlots.ts`(교과 6 · 담임 6)                                                    |

### 1.2 없는 것

- 자기평가 문항·답변 엔티티 — 검색 0건.
- 근거 출처 `selfAssessment` — 없음.
- 초안 프롬프트에서 출처를 구분하는 자리 — **없음.** `recordDraftPack.ts:35-42` 의 근거 입력 타입에 `sourceType` 필드 자체가 없다. 학생 본인 말과 교사 관찰이 같은 줄로 나열된다.

### 1.3 설계서와 코드가 어긋난 곳 (v1.1 로 정정)

1. ADR-072·설계서가 재사용 대상으로 지목한 `src/student/`(`student.html`)는 **교실 와이파이 안에서만 열리는 실시간 담벼락·학급규칙 번들**이다. 링크로 어디서나 열리는 학생 화면은 `landing/`의 `/submit/{id}` 다. 의도(링크·본인 확인·제출 폼 재사용)는 그대로, 파일만 정정.
2. 설계서 §3-5 "대기 목록에 쌓이고 교사가 고른 것만 창고로" — 근거 보드 2차(ADR-085 이후)의 **거울 카드가 정확히 이 방식**이다. 별도 대기 목록 UI 를 만들지 않는다.
3. ADR-072 "남은 한계"의 "`record-evidence.json` 이 동기화 대상에 없다"는 해소됐다(§1.1).

### 1.4 겹치는 결함 — 착수 전에 먼저 닫아야 한다

같은 날 다른 세션이 실행 재현한 [학생 번호 무결성 결함](../../03-analysis/student-number-integrity-20260908.analysis.md) 중 두 건이 이 기능의 뿌리를 흔든다.

- **P1-3** 과제 조회가 학생이 다르다는 정보가 있어도 마지막에 **번호만으로** 연결한다(`GetSubmissions.ts:39-53` 3단계 폴백).
- **P1-4** 수업반 과제 자료가 **다른 학생의 근거 후보**로 뜬다.

자기평가서는 "누가 썼는가"가 전부인 데이터다. 이 두 결함이 남은 채로 붙이면 **A 학생의 속마음 서술이 B 학생 세특 근거로 들어간다.** 과거 "16번 자퇴에 상담 예약이 남의 학생 기록칸에 저장"과 같은 종류의 사고다. → **S1 수정이 먼저**(§4 P0).

### 1.4-a 동시 진행 세션과의 충돌 검토 (2026-09-08, 오너 요청)

§1.4 의 결함을 찾은 파세오 에이전트(codex, 제목 "상담 신청에서 … 학번이 일치하지 않는 문제")의 활동 기록과
핸드오프(`docs/03-analysis/student-number-integrity.handoff.md` §수정 범위 A~E)를 읽고, 그 수정 세션이 손댈
파일과 이 계획의 파일 목록(§5)을 대조했다. 검토 시점에 수정 세션은 `src/domain/rules/rosterNumbering.ts` 를
막 신설한 상태(아직 어디서도 import 안 됨).

**결론: 지금은 충돌 없음(이 세션은 문서만 썼다). 그러나 P1~P3 은 같은 파일을 만진다 → 순서를 못 박는다.**

| 수정 세션 항목   | 그쪽이 고치는 파일                                                                                    | 이 계획에서 겹치는 단계 |
| ---------------- | ----------------------------------------------------------------------------------------------------- | ----------------------- |
| A 담임 과제 번호 | `useStudentLists.ts` · `AssignmentCreateModal.tsx` · `CreateAssignment.ts` · 서버 명단 · 학생 제출 폼 | **P1·P2**               |
| B 제출 오연결    | `GetSubmissions.ts` · `ToolAssignmentPage.tsx` · `useAssignmentStore.ts` · `CopyMissingList.ts`       | **P2**                  |
| C·D 설문         | `surveyRules.ts` · 설문 화면·PIN · `landing/.../check/*`                                              | 없음(설문은 이 계획 밖) |
| E 근거 후보      | `collectEvidenceCandidates.ts` · `useEvidenceCandidates.ts`                                           | **P3**                  |
| 공용 문서        | `PROGRESS.md` · `docs/progress/2026-09.md` · `/docs` 가이드                                           | 이 세션도 편집함        |

### 1.4-b 갱신 (2026-09-09) — 그 세션이 커밋까지 끝냈다. 차단 해제

수정 세션이 **5건 전부 고치고 게이트를 통과했다**([ADR-097](../../03-decisions/ADR-097.md), 기록은 [2026-09](../../progress/2026-09.md)).
규칙을 `rosterNumbering.ts`·`submissionMatching.ts` 두 곳으로 모았고, **마이그레이션 067 은 운영에 적용까지 됐다.**
겹치던 P1-3(번호 폴백)·P1-4(수업반 과제가 남의 근거 후보)가 닫혔다.

**커밋도 났다 — `06ad0dd7`**(그 위에 문서 커밋 `33ed3f48`). 즉 P2·P3 의 차단 조건은 풀렸다.
⚠️ 인덱스는 여전히 공유 상태다. **경로 없는 `git commit` 은 다른 세션 작업을 통째로 쓸어 간다.** 반드시 `git commit -- <path>`.

★**실릴 버전은 아직 정해지지 않았다.** `git tag --contains 06ad0dd7` 는 0건이고 최신 태그는 v2.5.0 이다.
ADR-096 결정 6 이 "선행조건은 버전으로 적는다"고 했으므로, 여기에 적을 수 있는 사실은 지금은
**"커밋 `06ad0dd7` · 실릴 버전 미정"** 이다. 버전이 정해지면 이 줄에 숫자를 적는다.

→ **P2·P3 은 이제 착수할 수 있다.** 착수하면 자기평가의 학생 연결은 `submissionMatching.ts` 의
규칙 **위에** 얹는다 — 번호 비교를 이 기능에서 새로 쓰지 않는다.

규칙:

1. **P1·P2·P3 은 수정 세션의 S1(과제 명단·식별·근거 후보)이 커밋된 뒤에만 시작한다.** 같은 함수(`GetSubmissions` 3단계 매칭, `collectEvidenceCandidates` 의 수업반 제출물 비교)를 두 세션이 동시에 고치면 한쪽이 지워진다. P0 은 문서뿐이라 지금 해도 된다.
2. 자기평가 답변의 학생 연결은 **수정 세션이 만든 `rosterNumberOf()`·새 매칭 규칙 위에** 얹는다. 번호 비교 코드를 이 계획에서 따로 쓰지 않는다(⚠️ 배열 위치·활성 학생 수를 식별자로 쓰지 말 것 — 그쪽 사고의 원인).
3. 공용 문서 두 개는 양쪽이 **서로 다른 섹션**에 쓴다. 커밋할 때는 `git commit -- <path>` 로 파일을 지정한다(공유 인덱스 사고 방지). 상태판 줄이 다른 세션의 옛 사본으로 되돌아갔는지 다음 세션 시작 때 확인한다.
4. 수정 세션이 `landing/src/components/submit/SubmitForm.tsx` 를 건드렸는지 P1 착수 전에 `git log -- <path>` 로 본다(A 항목의 "학생 제출 폼"이 그 파일일 수 있다).

### 1.5 조사 중 발견한 기존 결함 2건 (이 계획에서 같이 고친다)

- 🔴 AI 브릿지의 근거 출처 화이트리스트에 `attachment` 가 빠져 있다 — `E:\github\ssampin-ai-bridge\packages\core\src\entities\recordEvidence.ts:12-27` · 동봉 번들 `electron/ai-bridge/index.mjs:34772-34780`. 첨부에서 온 근거가 AI 에게 "교사 직접 입력"으로 보인다. **새 출처를 추가하면 같은 증상이 재현되므로** 함께 고친다.
- `scripts/seed-record-flow-test-data.mjs:511,517` 이 출처 값으로 `'submission'`(후보 종류 이름)을 쓴다. 올바른 값은 `'assignment'`. 근거 보드 실기기 확인의 "빈 회색 알약"(`record-evidence-board-v2.design.md:168` 항목 g) 원인.

---

## 2. 오너 결정 3건 — **승인됨(2026-09-08)**

오너가 "네가 권해 준 방안으로 작업을 진행할 거고"로 아래 권고안을 승인했다. ADR-096 으로 확정했고,
설계서 결정 4 를 좁히는 건(§3.5)도 같이 승인됐다. 남은 미정은 **보관 기간 개월 수 하나**뿐이다
(→ `docs/release-prep/self-assessment-privacy-wording.md` §C).

| #   | 물음                         | 권고(기본값)                                                                                                                                                                  | 다르게 정하면                                                        |
| --- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| D1  | 개인정보 처리방침 갱신 시점  | **릴리즈 전 필수.** 과제 수합 조항이 "제출물은 드라이브에 보관"이라 답변이 서버 표에 남는 사실과 어긋난다. 수집 항목·목적·보관 기간 추가. 에듀집 필수기준 대조는 오너 확인.   | 방침 갱신 없이는 출시하지 않는다(대안 없음).                         |
| D2  | 답변 저장 방식               | **v1 은 지금의 글 제출(`text_content`)과 같은 수위** — 표는 RLS deny-all, 엣지 함수로만 읽고 씀, 관리 키 인증. 단말 암호화는 **보류**(§2.1).                                  | 암호화를 요구하면 교사 공개키 체계가 먼저 필요 → 별도 계획, 기간 +1. |
| D3  | 상담·설문 신원 전환과의 순서 | **독립 진행.** 과제 수합은 이미 만들 때 Google 계정을 확인하고 `teacher_id` 에 이메일을 박는다. 신원 전환이 과제 조회까지 확장되면 자기평가 답변도 자동으로 그 아래 들어간다. | 신원 전환 뒤로 미루면 출시 시점이 그쪽에 묶인다.                     |

### 2.1 D2 를 "보류"로 권고하는 이유

상담 예약의 `*Encrypted` 패턴은 **관리 키를 학부모 링크에 실어 보내서** 학부모 브라우저가 그 키로 암호화하는 방식이다. 그 "링크에 실린 관리 키"가 지금 상담·설문 신원 전환 계획이 없애려는 바로 그 구멍이다. 같은 방식을 새로 만들면 구멍을 하나 더 파는 셈이다. 학생 브라우저가 교사만 풀 수 있게 잠그려면 교사 공개키를 서버에 두는 체계가 필요한데 아직 없다.

대신 v1 에서 지키는 것:

- 표는 이미 `deny_all_submissions`(003) — 앱이 직접 못 읽는다. 설문 응답이 겪은 "공개 읽기" 부채와 다르다.
- 답변 길이 상한(문항당 1,000자·문항 6개)을 서버에서 검사한다.
- **과제 삭제 시 답변도 삭제**(CASCADE 이미 있음).
- ✅ **보관 기간 = 12개월**(오너 확정 2026-09-09, 기준 시각은 과제 생성일).
- ⚠️ **만료 정리 코드는 아직 없다.** 방침 문장(초안 §C)과 정리 코드를 **같은 작업 단위에서
  함께** 만들어야 ADR-096 결정 7(방침 갱신 = 릴리즈 게이트)이 닫힌다.

---

## 3. 설계 요지 (설계서를 코드 위치로 번역)

### 3.1 데이터

```
// ★확정(2026-09-09, 아키텍처 검토): 감싸는 객체가 아니라 **맨 배열**이다.
//   처음엔 { questions, showPreviousAnswers? } 객체로 적었는데 실제 스키마·서버는 배열이고
//   DB CHECK 이 `jsonb_typeof = 'array'` 다. 객체로 가면 서버와 안 맞는다.
//   v2 의 showPreviousAnswers 는 별도 컬럼(assignments.self_assessment_options JSONB)으로 나중에 더한다.
Assignment.selfAssessment?: readonly SelfAssessmentQuestion[]   // 1~6개

SelfAssessmentQuestion = { id, prompt, slot?: string, maxLength?: number }

// ★`prompt` 는 **필수**다(구현 기준). 답변 시점의 문항 원문을 함께 저장한다 — 교사가 문항을
//   고치면 id 만 남은 답변은 맥락을 잃는다.
Submission.selfAssessment?: readonly { questionId, prompt, slot?, answer }[]

SubmitType = 'file' | 'text' | 'both' | 'selfAssessment'   // 마지막이 "단독 열기"
```

- `driveFolder` 는 `'selfAssessment'` 일 때 필요 없다 → **선택 필드로 완화**. 타입 검사가 모든 사용처를 잡아 주므로 안전하지만 손대는 파일이 많다(§5).
- 서버: `assignments.self_assessment JSONB`, `submissions.self_assessment JSONB` (070). 학생 답변은 `text_content` 와 같은 표·같은 권한.

### 3.2 문항 — 교사가 쓰고, 추천은 슬롯을 달고 온다 (설계서 §3-2)

`src/domain/rules/selfAssessmentPresets.ts` 에 맥락별 추천 문항을 둔다. 슬롯 이름은 `observationSlots.ts` 의 값을 **그대로** 쓴다(문자열 새로 만들지 않음).

| 슬롯     | 교과 추천 문항 예                                            |
| -------- | ------------------------------------------------------------ |
| 질문     | 이 활동을 하면서 가장 궁금했던 건 무엇이었나요?              |
| 시도     | 여러 방법 중 무엇을 골랐고, 왜 그걸 골랐나요?                |
| 시행착오 | 처음 생각대로 안 됐던 지점이 있나요? 어떻게 바꿨나요?        |
| 산출물   | 이번에 만든 것 중 가장 잘 됐다고 생각하는 부분은 무엇인가요? |
| 피드백   | 선생님이나 친구의 말 중 생각을 바꾸게 한 것이 있나요?        |
| 융합     | 다른 과목에서 배운 것과 이어진 데가 있나요?                  |

담임 맥락은 `HOMEROOM_SLOTS`(학습 태도·인성·관계·학급 역할·변화·아쉬운 점·진로)로 같은 표를 둔다. 직접 쓴 문항은 슬롯을 골라도, 안 골라도 된다(슬롯은 불가침으로 선택).

### 3.3 걷는 방식 — 과제에 얹거나, 단독으로 (설계서 §3-3)

- **과제에 얹기**: 과제 만들기 모달에 "자기평가도 함께 받기" 스위치 → 문항 편집(추천 칩 + 직접 입력). 학생 제출 화면 아래에 문항 블록이 붙는다.
- **단독 열기**: `submitType: 'selfAssessment'`. 파일·글 칸 없이 문항만. 드라이브 폴더 지정 단계를 건너뛴다.
- 학생 식별은 지금 그대로(학년·반·번호·이름 또는 이름만). **새 식별 체계를 만들지 않는다.**

### 3.4 창고로 들어가는 길 — 거울 카드 (설계서 §3-5)

- 출처 `selfAssessment`(라벨 "자기평가서") 추가.
- `selfAssessmentToEvidence(submission, assignment)` → 본문은 `[자기평가: 과제명]` 한 줄 + `문항 → 답변` 줄들. `slots` 는 답한 문항의 슬롯 합집합. `sourceId` 는 `${submission.id}:self` 로 과제물 카드(`submission.id`)와 **별개 카드**가 되게 한다(파일과 성찰을 따로 고를 수 있어야 한다).
- 후보 노출은 담임·교과 **둘 다**(`EVIDENCE_CANDIDATE_SOURCES`).
- 교사가 카드에 손대는 순간 저장되고, 그때 기재 금지 항목 검사가 자동으로 붙는다(학생이 수상·학원을 적을 수 있다 — 설계서 AC3-6). 점수·등급은 애초에 문항이 묻지 않는다.

### 3.5 학기말 종합 — v1 에서는 "앞선 답변 보여주기"를 빼고 간다 (설계서 §3-4 부분 보류)

설계서는 학생 화면에 학기 동안 쓴 자기평가를 띄우는 토글을 뒀다. 그런데 지금 학생 식별은 **번호와 이름을 타이핑하는 것**뿐이라, 남의 번호를 넣으면 **남의 지난 답변이 보인다.** 설문의 PIN 같은 본인 확인이 과제에는 없다.

→ v1 은 토글을 만들지 않는다. 대신 학기말 문항 자체를 "이번 학기 활동 중 기억에 남는 것"처럼 회고형으로 추천 목록에 넣는다(설계서가 "끌 때 좋은 점"으로 든 방식). 앞선 답변 노출은 **본인 확인 수단(PIN 또는 신원 전환)이 생긴 뒤** v2 로. ✅ 설계서 결정 4 를 좁히는 것으로 **오너 승인 완료**(2026-09-08, [ADR-096](../../03-decisions/ADR-096.md) 결정 4).

### 3.6 AI 에게 "학생 본인 말"임을 알린다 (설계서에 없던 보강)

세특은 교사가 관찰한 것을 교사의 언어로 쓰는 기록이다. 지금 프롬프트 조립은 근거를 `- (날짜) 본문` 으로만 나열해 학생 말과 교사 관찰을 구분하지 못한다.

- `DraftPackEvidence` 에 `sourceType?` 추가(`recordDraftPack.ts:35-42`), 조립 줄에 `[학생 자기평가]` 표식(`:170`, `:305`).
- 사용자 턴 끝의 근거 인용 지시 옆에 한 줄: "학생 자기평가는 학생의 진술이다. 관찰된 사실로 바꿔 쓰되 학생 표현을 그대로 옮기지 않는다." ★"근거로 되짚기" 지시의 위치 효과(실측 0/2→2/2)를 깨지 않도록 **그 지시 뒤가 아니라 앞**에 둔다.
- 1층 프롬프트(서버 보관)는 손대지 않는다 — 표식은 근거 팩(사용자 턴) 쪽 일이다.
- 브릿지 `getRecordEvidence` 는 `sourceType` 을 이미 노출하므로 화이트리스트만 맞추면 외부 AI 도 구분한다.

---

## 4. 단계 — 한 세션 = 한 단계

| 단계   | 이름                     | 산출                                                                                                                                      | 게이트                          |
| ------ | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| **P0** | 선행 확인·결정 고정      | S1(학생 번호) **커밋 확인** · D1~D3 오너 확답 · ADR-096 확정 · 방침 문구 초안 · §1.4-a 규칙 4 확인                                        | 문서만                          |
| **P1** | 서버·학생 화면           | 070 마이그레이션 · `create-assignment`·`get-assignment-public`·`submit-assignment` 수정 · `SubmitForm` 문항 블록 · 배포 · **실호출 확인** | landing `build` + 엣지 실호출   |
| **P2** | 교사 앱 — 만들기·보기    | 도메인 2파일 · `AssignmentCreateModal` 스위치+문항 편집 · `AssignmentDetail` 답변 보기 · 모바일 읽기 · 스토어 파싱                        | 게이트 4종                      |
| **P3** | 근거 창고·AI 표식·브릿지 | 출처 추가 · 변환 함수 · 후보 등록 · `DraftPackEvidence.sourceType` · 브릿지 화이트리스트(+attachment) · 시드 오타                         | 게이트 4종 + 브릿지 번들 재생성 |
| **P4** | 문서·실기기·릴리즈       | `/docs` 가이드 · 방침 반영 · 실기기 확인 목록 · KB ingest · 릴리즈 SOP                                                                    | `docs:check` + `build` + SOP    |

P1 과 P2 는 순서를 바꿔도 된다(서버 필드가 없으면 앱은 스위치를 숨기면 된다). P3 은 P2 뒤.

### 4.0 ★적용 순서 — 마이그레이션이 먼저다 (어기면 전체 제출이 죽는다)

```
① 070 마이그레이션 적용 → ② 적용 확인(컬럼 2개) → ③ 엣지 함수 3종 배포 → ④ 랜딩 배포 → ⑤ 실제 링크로 제출 1건
```

**반대로 하면 자기평가와 무관한 평범한 과제 제출까지 전부 500 으로 죽는다.** `submit-assignment` 는
조건 없이 `self_assessment` 칸을 읽고 쓰기 때문이다(자기평가를 안 쓰는 과제도 이 칸을 거친다).
컬럼이 없는 DB 에 함수만 배포되면 모든 제출이 실패한다.

★**④ 랜딩 배포를 빼먹지 말 것**(코드 리뷰 M-5). 옛 학생 화면은 `submitType: 'selfAssessment'` 를
만나면 파일 칸도 글 칸도 돌아보기 칸도 안 그려 **학생이 아무것도 못 낸다.** 상담 기능의 배포
순서(마이그레이션 → 스키마 캐시 → 랜딩 → 앱)와 같은 모양이다.

★테스트는 mock 이라 이걸 **못 잡는다.** 게이트 4종이 초록인 채 실기기에서만 터진다 — 저장소가
이미 겪은 함정이다. ⑤ 를 건너뛰지 말 것.

되돌리기는 **070 파일 맨 아래 주석 블록**에 있다. ⚠️ 별도 `.sql` 파일로 만들지 말 것 —
`supabase/migrations/` 안에 두면 `db push` 가 그것까지 실행한다(2차 리뷰에서 CRITICAL 로 잡혔고,
067 이 같은 함정을 먼저 겪었다).

### 4.1 P1 상세 — 서버가 먼저 받는다

- 070: `assignments.self_assessment JSONB NULL`, `submissions.self_assessment JSONB NULL`. 기존 행은 NULL — 구버전 앱은 모른 채 그대로 돈다.
- `get-assignment-public` 응답에 `selfAssessment`(문항만) 포함. 학생 화면은 문항이 있으면 블록을 그린다.
- `submit-assignment`: `selfAssessment` 필드(JSON 문자열) 수신 → 문항 id 대조 · 개수 ≤ 6 · 답변 ≤ 1,000자 · `submitType === 'selfAssessment'` 면 파일·글 없이도 통과.

**★재제출 규칙 — "안 보낸 칸은 지우지 않는다"** (3차 리뷰에서 정한 계약. 규칙은 `_shared/selfAssessment.ts` 의 `mergeSubmission`·`mergeSelfAssessment` 순수 함수에 있다.)

★**이 규칙을 실제로 돌리는 게이트는 `src/infrastructure/supabase/__tests__/selfAssessmentEdgeMerge.meta.test.ts`**(vitest)다. 그 공유 파일이 import 0건·`Deno.` 전역 0건인 순수 TypeScript라 vitest 가 그대로 가져온다 — **그 조건을 깨면 게이트 밖으로 나간다.** 같은 폴더의 Deno 테스트는 더 넓게 보지만 **게이트가 아니다** — `npm run test:edge` 가 CI 에 없기 때문이다. 못 도는 게 아니라 자동으로 안 도는 것이다(2026-09-09 로컬 deno 2.7.11 로 `npm run test:edge` **37건** 통과 확인 — 그중 `_shared/selfAssessment.test.ts` 가 29건). 기기마다 deno 유무가 갈려 게이트로 삼지 않았다.

⚠️ **미결(오너 판단 필요)** — 지금 Deno 테스트 29건과 vitest 메타 테스트가 **시나리오 대부분에서 겹친다.**
셋 중 하나를 골라야 한다: **(a)** `npm run test:edge` 를 CI 에 넣고 vitest 메타는 이음매 중심으로 줄인다
· **(b)** Deno 쪽 고유 시나리오만 vitest 로 옮기고 Deno 파일을 지운다 · **(c)** 둘 다 둔다(중복 유지).
**지금 상태는 (c)** 다. 슬롭 검토가 "결정하지 않으면 그냥 사라진다"고 짚어 여기 남긴다.

| 이번에 보낸 것                                                                                                                                                                          | 결과                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 파일만                                                                                                                                                                                  | 글·자기평가 답변 **보존**. 지각 여부 다시 잼                                                              |
| 글만                                                                                                                                                                                    | 파일·자기평가 답변 **보존**. 지각 여부 다시 잼                                                            |
| 돌아보기만                                                                                                                                                                              | 파일·글 **보존**. **지각 여부도 그대로** — 제때 낸 제출이 마감 뒤 성찰 한 줄에 지각으로 뒤집히면 안 된다. |
| ⚠️ 단 **자기평가만 받는 과제**(`submit_type === 'selfAssessment'`)는 예외로 **다시 잰다** — 돌아보기가 제출의 전부인데 얼려 두면 마감 전 한 줄로 영원히 "제때 냄"이 된다(코드 리뷰 M-1) |
| 돌아보기 일부                                                                                                                                                                           | 답한 문항만 덮고 **나머지 문항의 옛 답은 보존**(문항 id 기준 병합)                                        |

★왜 "빈 칸 = 지우기"가 아닌가: 이 화면은 전에 낸 글·답을 **다시 보여 주지 않는다**(ADR-096 결정 4 —
번호·이름 타이핑만으로 식별하므로 되보여 주면 남의 답이 보인다). 학생에게 빈 칸은 "이번엔 안 썼다"는
뜻이지 "지워 달라"가 아니다. 빈 칸을 삭제로 읽으면 돌아보기만 내려던 학생이 월요일에 낸 글을 잃는다.

⚠️ **한계 — 학생이 한번 낸 글·답을 스스로 지울 수 없다.** 잘못 낸 학생은 선생님에게 말해야 한다.
지우기가 필요해지면 "전에 낸 글 지우기" 같은 **명시적 장치**로 따로 만든다(빈 문자열 하나에
"안 씀"과 "지워 줘" 두 뜻을 겹치지 않는다). 화면 추가라 디자인 협업 대상이다.

⚠️ 돌아보기만 추가해도 `submitted_at` 은 갱신된다 → 선생님 화면에 "마감 뒤 시각인데 지각 아님"인
행이 보일 수 있다. 교사 화면(P2)에서 "돌아보기 추가됨"을 따로 표시할지 그때 정한다.

- ★엣지 함수는 만들어도 **배포**를 따로 해야 산다. 새 시크릿은 없다. 배포 뒤 실제 링크로 한 번 제출해 표에 들어가는 것까지 본다.
- ★설치본 호환: `submitType` 에 새 값이 오면 v2.5.0 이하 앱은 알 수 없는 값을 본다. 앱 쪽 파서에 폴백(`'text'` 로 표시)을 두고, 서버는 새 값을 **앱 버전과 무관하게** 저장한다.

### 4.2 P2 상세 — 교사 앱

- `src/domain/entities/SelfAssessment.ts`(문항·답변 타입, 검증 순수 함수) · `src/domain/rules/selfAssessmentPresets.ts`(추천 문항, 슬롯은 `observationSlots` 값).
- `Assignment.ts`: `selfAssessment?` · `SubmitType` 확장 · `driveFolder?` 완화. `Submission.selfAssessment?`.
- `AssignmentCreateModal.tsx`: 스위치 → 문항 편집(추천 칩은 슬롯 이름을 칩 앞에 단다). 단독 열기는 제출 방식 선택지에 "자기평가만" 추가 → 드라이브 단계 생략.
- `AssignmentDetail.tsx`: 제출 행 펼치면 문항·답변. 모바일 `ToolAssignmentPage.tsx` 는 읽기만.
- ⚠️ 문항 편집 화면·칩·스위치는 **프론트엔드 디자인 에이전트와 함께** 정한다(단독 결정 금지). 라운드 규칙·`sp-*` 토큰·유리 모드 떠 있는 면 계약 준수.

### 4.3 P3 상세 — 창고와 AI

수정 목록은 §5. 회귀 테스트로 고정할 것:

- 답변이 있는 제출 → 담임·교과 양쪽 후보에 뜬다. 답변이 없는 제출 → 자기평가 카드는 안 뜬다.
- 과제물 카드와 자기평가 카드의 `sourceId` 가 다르다.
- 수상·학원 단어가 든 답변은 저장 시 `excludedFromAi: true`.
- **다른 학생의 답변은 후보에 안 뜬다**(S1 의 테스트를 자기평가 경로에 한 번 더).
- 근거 팩에 `[학생 자기평가]` 표식이 붙고, 지시 문장이 "근거로 되짚기" 앞에 있다.
- 브릿지 `normalizeRecord` 가 `attachment`·`selfAssessment` 를 떨어뜨리지 않는다.

---

## 5. 손대는 파일

### 서버·학생 화면 (P1)

- `supabase/migrations/070_assignment_self_assessment.sql`(되돌리기는 그 파일 **하단 주석 블록**. 별도 `.sql` 로 만들지 말 것)
- **`071_assignment_drive_folder_check.sql` — 아직 안 만들었다(보류).** 070 이 `drive_folder_id` 의
  NOT NULL 을 풀면서 "파일 받는 과제엔 폴더가 있다"는 불변식이 DB 에서 엣지 함수 두 곳으로 이사했다.
  지금은 쓰는 쪽(`create-assignment`)과 읽는 쪽(`submit-assignment` 5-b)이 다 막고 있어 **뚫린 구멍이
  아니라 안 깐 두 번째 겹**이라 보류했다. 넣을 때는 한 줄이면 된다.
  ```sql
  ALTER TABLE assignments ADD CONSTRAINT assignments_drive_folder_required
    CHECK (submit_type = 'selfAssessment' OR drive_folder_id IS NOT NULL);
  ```
  ★번호를 여기 박아 두는 이유: "나중에"라고만 적으면 어느 작업인지 잃는다(저장소가 이미 겪었다).
- `supabase/functions/create-assignment/index.ts` · `get-assignment-public/index.ts` · `submit-assignment/index.ts`
- `landing/src/components/submit/SubmitForm.tsx` · `submitApi.ts` · `SubmitPageContent.tsx`

### 앱 도메인·유스케이스·스토어 (P2)

- 신설 `src/domain/entities/SelfAssessment.ts` · `src/domain/rules/selfAssessmentPresets.ts`
- `src/domain/entities/Assignment.ts`
- `src/usecases/assignment/CreateAssignment.ts` · `GetSubmissions.ts`(S1 결과 위에서) · `src/adapters/stores/useAssignmentStore.ts`
- `src/infrastructure/supabase/*Assignment*`(요청·응답 필드)

### 앱 화면 (P2)

- `src/adapters/components/Tools/Assignment/AssignmentCreateModal.tsx` · `AssignmentDetail.tsx` · `DriveFolderInput.tsx`(생략 분기)
- `src/adapters/components/Homeroom/Assignment/AssignmentTab.tsx`
- `src/mobile/pages/ToolAssignmentPage.tsx`

### 근거 창고·AI (P3)

- `src/domain/entities/RecordEvidence.ts:18-49`(유니온·배열·라벨 3곳)
- `src/usecases/studentRecords/evidenceImport.ts`(`selfAssessmentToEvidence`) · `collectEvidenceCandidates.ts:35-49, 77-93, 142-240`
- `src/adapters/hooks/useEvidenceCandidates.ts`
- `src/domain/services/recordDraftPack.ts:35-42, 170, 305` · `src/adapters/components/RecordDraft/RecordDraftAiPanel.tsx:340-354`
- 브릿지 `E:\github\ssampin-ai-bridge\packages\core\src\entities\recordEvidence.ts` · `packages/mcp/src/recordDraftTools.ts:264-266` → 동봉 번들 `electron/ai-bridge/index.mjs` 재생성(★`.prettierignore` 확인)
- `scripts/seed-record-flow-test-data.mjs:511,517`
- 테스트: `evidenceImport.test.ts` · `collectEvidenceCandidates.test.ts` · `useRecordEvidenceStore.board.test.ts` · `RecordEvidenceBoard.test.tsx` · `recordDraftPack` 테스트

### 문서 (P4)

- `landing/src/app/privacy/page.tsx` 과제 수합 조항(제3조·제11조 두 곳)
- `landing/src/content/docs.ts` — 수업 관리 > 과제수합, 담임 업무 > 생활기록부 초안과 근거 정리 보드
- `docs/02-design/features/record-draft-phase34.design.md`(v1.1 정정은 이 계획과 같이 반영)

---

## 6. 하지 않는 것

- 학생 화면에 앞선 답변 노출(§3.5) · 단말 암호화(§2.1) · 새 학생 식별 체계 · 설문(`/check`) 재사용 · 멀티설문 경로 · 동료평가 · 자기평가 답변의 자동 창고 적재 · 1층 프롬프트 수정 · 인앱 쌤핀 AI 개방(Phase 4).

---

## 7. 수용 기준

- AC-1 교사가 문항을 직접 쓰고, 슬롯 달린 추천을 꺼내 쓸 수 있다. (설계 AC3-1)
- AC-2 과제에 얹어서도, 단독으로도 열 수 있다. 단독은 드라이브 폴더 없이 만들어진다. (AC3-2)
- AC-3 학생이 링크로 들어와 본인 확인 후 제출하면 그 학생에게만 연결된다. **다른 학생·다른 반 같은 번호에는 연결되지 않는다.** (AC3-3 + S1)
- AC-4 제출분은 근거 보드 미분류 열에 거울 카드로만 뜨고, 교사가 손댄 것만 저장된다. (AC3-5)
- AC-5 저장 시 기재 금지 항목이 자동 제외 표시되고, 문항의 슬롯이 카드에 남는다. (AC3-6)
- AC-6 초안 근거 팩에 `[학생 자기평가]` 표식과 "학생 표현을 옮기지 않는다" 지시가 들어간다. 브릿지에서도 출처가 `selfAssessment` 로 보인다.
- AC-7 개인정보 처리방침에 수집 항목·목적·보관 기간이 반영된 뒤에만 릴리즈한다.
- AC-8 v2.5.0 이하 앱에서 새 과제를 열어도 죽지 않는다(알 수 없는 제출 방식 폴백).

---

## 8. 위험

| 위험                                              | 대응                                                                                                |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| S1 미완 상태에서 착수 → 남의 학생에게 답변이 붙음 | P0 에서 S1 완료를 **커밋 해시와 테스트 통과로** 확인. 미완이면 P1~P3 전부 대기(§1.4-a)              |
| 수정 세션과 같은 파일을 동시에 고쳐 한쪽이 지워짐 | §1.4-a 규칙 1 — S1 커밋 전 P1~P3 착수 금지. 착수 시 `git log -- <path>` 로 그쪽 변경을 먼저 읽는다  |
| 엣지 함수 수정만 하고 배포를 잊음                 | P1 완료 조건에 "실제 링크로 제출 1건 + 표 확인" 포함                                                |
| 보관 기간을 못 지킬 길이로 적음                   | 방침 문구 초안 §C — 개월 수가 정해지기 전에는 그 문장을 넣지 않는다. 정하면 만료 정리도 함께 만든다 |
| `driveFolder` 선택화로 타입 에러 다수             | P2 첫 작업으로 `tsc` 돌려 사용처 목록부터 확보                                                      |
| 학생 답변에 다른 학생 실명이 들어옴               | 근거 팩 조립 함수 안의 이름 가리기(기존 장치)를 자기평가 본문에도 태운다 — 주석 계약 금지           |
| 브릿지 번들 재생성 누락                           | P3 게이트에 번들 내 `selfAssessment` 문자열 grep 포함                                               |

---

## 결정은 ADR-096 이 정본이다

결정 7건의 본문은 [docs/03-decisions/ADR-096.md](../../03-decisions/ADR-096.md) 에 있다.

★여기에 요약본을 두지 않는다. 두었다가 **사본이 원본보다 낡아 서로 다른 사실을 말했다** —
요약본은 결정 4 를 "오너 확인 필요"라 적고 있었지만 ADR 본문은 이미 "오너 승인 2026-09-08 ·
채택"이었다(슬롭 검토가 잡음). 결정이 궁금하면 ADR 을 연다.
