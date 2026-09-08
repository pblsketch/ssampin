# 학생 번호 무결성 검토 (2026-09-08)

범위: 상담의 결번 수정과 담임·수업반 과제 생성/제출/조회, 모바일 제출 현황, 설문 생성/조회/내보내기, 과제 → 생기부 근거 후보 연결. 로컬 소스 기준 HEAD `44a950ba`. 운영 데이터 조회·변경, 기능 수정, 배포는 하지 않았다.

## 결론

상담과 같은 결번 뒤 번호 밀림이 **담임 과제 생성에 남아 있다**. 별도로 학생 수를 마지막 번호로 취급하는 설문, 다른 반의 같은 번호를 같은 학생으로 취급하는 과제 조회·생기부 근거 후보 연결도 발견했다. 기존 상담 수정만으로 전체가 보호되지는 않는다.

## 우선순위별 발견 사항

### P1-1. 담임 과제는 비활성 학생을 제외한 뒤 번호를 1부터 다시 매긴다 — 실행 재현

- `src/adapters/hooks/useStudentLists.ts:39-48`: `filter(isStudentActive)` 후 `number: index + 1`.
- 입력 1번 재학 / 2번 전출 / 3번 재학 → 과제 대상은 1번 / **2번(원래 3번)**.
- `AssignmentCreateModal.tsx:145-150` → `CreateAssignment.ts:60-66`이 이 명단을 로컬·서버로 전달한다. 담임 과제 탭과 도구의 새 과제 생성에 공통 적용된다.
- 학생 제출 폼은 전달받은 명단의 번호로 이름을 찾는다(`landing/src/components/submit/SubmitForm.tsx:100-118`). 따라서 실제 학번 입력 시 다른 이름 자동 입력·일치 경고·조회 오연결의 원인이 된다. 실제 사용자 제출 피해는 이번 검토에서 확인하지 않았다.
- 수업반 생성은 `s.number`를 보존하므로 이 재번호 부여 결함은 없다.

### P1-2. 설문 응답 번호와 PIN을 실제 명단 대신 1~학생 수로 만든다 — PIN 실행 재현 + 화면 코드 확인

- `SurveyTab.tsx`의 활성 학생 수 → `SurveyCreateModal.tsx:182-185,224-233` → `generateStudentPins(count)`.
- `src/domain/rules/surveyRules.ts:203-214`: PIN 키 1~count.
- `landing/src/components/check/CheckPageContent.tsx:323`: 번호 버튼도 1~targetCount.
- 33번까지 있는 반에서 2명 결번으로 재학생이 31명이면 **32·33번 버튼과 PIN이 없다**. 결번 번호 버튼은 반대로 남는다. 수업반의 불연속 번호도 영향 대상이다.
- 개선 시 실제 허용 학생 번호 목록과 인원수를 분리하고, 생성·복제·재공유·PIN·학생 페이지를 함께 맞춰야 한다. 단순히 최대 번호까지만 늘리면 결번 선택 문제는 남는다.

### P1-3. 과제 조회가 다른 학생이라는 정보가 있어도 마지막에 번호만으로 연결한다 — 실행 재현

- `src/usecases/assignment/GetSubmissions.ts:38-53`: ID → 학년/반/번호 → 번호만 비교로 내려간다.
- 1학년 1반 3번만 제출했는데 1학년 2반 3번에도 같은 제출물이 붙는다. 서로 다른 ID와 반 정보가 명시되어 있어도 재현된다.
- `src/mobile/pages/ToolAssignmentPage.tsx:29,82-83`은 처음부터 번호만 비교한다(코드 확인).
- `src/adapters/stores/useAssignmentStore.ts:513-515` 신규 제출 알림 비교도 번호만 사용한다(코드 확인).
- `CopyMissingList.ts:23-38`은 학년/반/번호를 구분하므로 같은 상황에서 상세의 제출 표시와 미제출 복사 목록이 달라질 수 있다.

### P1-4. 수업반 과제 자료가 다른 학생의 생기부 근거 후보로 뜬다 — 실행 재현

- `src/usecases/studentRecords/collectEvidenceCandidates.ts:222-235`: 수업반 제출물은 `sd.studentNumber === st.number`만 확인한다. `classId`, `studentKey`, 과제 대상 반은 확인하지 않는다.
- `src/adapters/hooks/useEvidenceCandidates.ts:47-48,75-76`은 공용 과제 저장소의 현재 제출 목록을 그대로 넘긴다.
- 다른 수업반 과제의 3번 학생 제출 내용을 현재 반 3번 학생의 근거 후보로 반환하는 것을 실행 확인했다.
- 확인 범위는 **후보 반환**이다. 실제 사용자의 생기부 저장 또는 AI 전송이 발생했다고 단정하지 않는다. 학생 자료 귀속에 영향을 주므로 과제 조회와 함께 우선 수정할 대상이다.

### P2-1. 교사 체크 설문 CSV는 결번 뒤 번호를 압축한다 — 실행 재현

- `src/domain/rules/surveyRules.ts:166-171`: 비활성 학생 제외 후 `idx + 1`.
- 입력 1번 / 2번 전출 / 3번 → CSV 번호는 1 / 2. 답 자체는 ID로 찾아 이름과 답이 함께 이동하지는 않지만, 외부에서 학번으로 결합하면 잘못 연결할 수 있다.
- 실제 화면이 이 함수를 사용한다(`SurveyDetail.tsx:102-109`). 담임·수업반 모두 영향 대상이다.
- 같은 파일의 클립보드 포맷도 위치 기반 번호를 사용하지만 현재 호출처는 검색되지 않아 활성 결함 수에는 추가하지 않았다.

## 코드상 추가 위험 (실화면 재현 전)

- **담임 설문 응답자 연결**: `SurveyStudentDetail.tsx:50-51,149-152,159-174`는 담임 저장소를 직접 받고 `s.number ?? idx + 1`을 사용한다. 담임 필드는 `studentNumber`다. 결번 행이 남아 원래 순서가 보존되면 우연히 맞지만, 삭제·불연속 명단·정렬 변경 시 응답자/응답 시간이 틀어질 수 있다.
- **공통 학생 격자**: `Homeroom/shared/StudentGrid.tsx:63-65`는 실제 학번을 무시한다. `Records/SearchMode.tsx:147-155`, `Tools/Timer/PresentationMode.tsx:110-112`도 배열 위치로 표시한다. 표시 오류와 저장 귀속 오류를 구분해 수정할 것.
- **이미 만든 과제**: `CreateAssignment.ts`가 생성 당시 명단을 `target.students`에 저장한다. 생성 이후 전출 처리와 과거 제출 보존은 별도 정책이 필요하다. 이번 검토에서 자동 정정/복구는 수행하지 않았다.

## 정상 확인 및 한계

- 상담 `buildStudentNumberIndex`, `listUnbookedStudents`는 실제 `studentNumber`를 사용한다. 2번 전출 후 3번을 올바르게 조회하는 대조 실행을 통과했다. 신고자의 설치 버전·기존 링크·명렬표 상태가 정상이라는 뜻은 아니다.
- 수업반 과제의 생성 명단은 원래 번호를 보존한다. 하지만 조회 단계의 P1-3 위험은 별개다.
- 담임 누가기록, 교과 관찰·평가의 근거 후보 경로는 `studentId` 또는 `studentKey`+`classId`로 비교한다. 과제의 결함을 이들 전부에 일반화하지 않는다.
- 전 기능 안전 판정이나 운영/설치본 UI 검증은 아니다. 혼합반 설문, 이름만 식별하는 과제, 번호 재사용·명단 재수입은 추가 검증 대상이다.

## 검증 증거

- `node docs/03-analysis/student-number-audit-20260908.cjs`
  - 실제 TypeScript 모듈을 변환해 실행. React 훅 실행기와 저장소만 가상 데이터로 대체한다. 네트워크 호출 없음.
  - 결함 재현 5건(A~E), 상담 대조 1건. 이 스크립트의 성공은 **현재 결함 재현 성공**이며 수정 통과 테스트가 아니다.
- `npx vitest run src/domain/rules/consultationRules.test.ts src/domain/rules/studentNumberRules.test.ts src/domain/rules/studentActivity.test.ts --maxWorkers=2`
  - **3파일, 85테스트 통과**, exit 0. Node 모듈 형식 경고 1종. 이 테스트들은 신규 발견 경로의 안전성을 보장하지 않는다.
- 기능 수정이 없는 검토 작업이므로 전체 tsc/lint/test/regression 게이트는 실행하지 않았다. 수정 완료 선언 없음.

## 권장 수정 단위

1. 담임 과제 명단의 실제 번호 보존 + 결번·삭제·불연속 학번 사례 고정.
2. 과제 조회/모바일/알림/근거 후보가 동일한 학생 식별 규칙을 쓰도록 통합. 식별 정보가 충돌하면 번호만으로 추측하지 않기.
3. 설문의 허용 번호 목록·PIN·응답 매칭·내보내기를 일괄 정렬.
4. 기존 과제·설문은 제출 이력과 원래 학생 ID를 대조한 별도 복구안을 만들기. 현재 명단 번호로 과거 데이터를 일괄 덮어쓰지 않기.

---

## 수정 결과 (2026-09-08, 같은 날 후속 세션)

이 문서가 재현한 5건은 **전부 고쳤다**. 결정은 [ADR-097](../03-decisions/ADR-097.md), 작업 기록은
[docs/progress/2026-09.md](../progress/2026-09.md).

### 재현 스크립트의 상태가 바뀌었다 — 꼭 읽을 것

- `student-number-audit-20260908.cjs` 의 **assert 는 한 줄도 바꾸지 않았다.** 수정 전 HEAD `44a950ba` 의 증거로 남긴다.
  (커밋 훅의 prettier 가 줄바꿈만 손봤다 — 판정 내용은 그대로다.)
  이제 이 스크립트는 **첫 assert 에서 실패한다**(1·3번이 나오는데 1·2번을 기대하므로). 그 실패가
  결함이 사라졌다는 뜻이다. **통과하도록 고치지 말 것.**
- `generateStudentPins` 는 시그니처가 `(count)` → `(studentNumbers)` 로 바뀌었다. 옛 호출은
  더 이상 유효하지 않다.
- 수정을 확인하는 짝 스크립트를 새로 뒀다: `student-number-fix-verify-20260908.cjs`.
  같은 로더로 **실제 제품 모듈을 그대로 실행**해 올바른 동작을 확인한다(A·B·B-2·C·D·E·E-2 + 상담 대조).
- 정식 회귀 테스트 30건은 검증 게이트 안에 있다 — `src/domain/rules/studentNumberIntegrity.test.ts`,
  `src/domain/rules/surveyNumberIntegrity.test.ts`,
  `src/usecases/studentRecords/collectEvidenceCandidates.studentBoundary.test.ts`.

### 이 문서에서 "코드상 추가 위험"으로 적었던 것들

- 담임 설문 응답자 연결(`SurveyStudentDetail`) · 공통 격자(`StudentGrid`) · 기록 조회(`SearchMode`) ·
  발표 순서(`PresentationMode`) — **모두 실제 출석번호를 쓰도록 고쳤다.** 발표 순서는 원래 주석이
  "학번(명단 연동 시)"이라 학번이 맞았고, 수업반 경로는 이미 `s.number` 를 쓰고 있어 담임 경로만
  어긋나 있었다.
- **이미 만든 과제**는 그대로다(ADR-097 결정 5). 자동 정정하지 않고 읽기 전용 점검 도구
  `scripts/student-number-audit-existing.mjs` 로 어긋난 항목만 확인한다.

### 아직 안 한 것

- 마이그레이션 `067_survey_student_numbers.sql` **운영 미적용**. 적용 순서는 067 → 앱 배포.
- 실기기(설치본) 확인, 배포 후 학생 `/check` 화면 번호 버튼 실물 확인.
