# record-evidence-subpage — 계획서 (Plan v1.0)

- 상태: Phase 1 구현 완료 (2026-06-24, main 미커밋)
- 관련 결정: [ADR-014](../../../DECISIONS.md)

## 1. 배경 / 문제

교사가 관리하는 학생 데이터는 앱 곳곳에 흩어져 있다 — 교과 관찰기록(`ObservationRecord`), 담임 누가기록(`StudentRecord`), 과제(`usecases/assignment`), 평가(`usecases/evaluation`·`rubric`·`gradeAnalysis`). 생기부 초안(`RecordDraft`)을 쓸 때 이 근거들을 한곳에 모아 "어느 생기부 유형의 근거인지" 분류해 관리하는 수단이 없었다. 기존 `RecordDraft.basisObservationIds`는 AI가 초안에 인용한 관찰 id를 읽기 전용으로만 보여줄 뿐(RecordDraftView.tsx:524-590), 교사가 직접 근거를 수집/분류/CRUD할 수 없었다.

## 2. 목표

생기부 초안 페이지 안에 '근거 자료' 서브페이지를 만들어:

1. 학생별로 생기부 작성 근거를 조회/등록/수정/삭제(CRUD).
2. 각 근거를 생기부 유형(`RecordArea` 7종: 자율·진로·행특·과목세특·개인세특·동아리·교과학습발달)으로 분류(복수 가능).
3. 흩어진 데이터(관찰기록·누가기록)를 끌어와(import) 근거로 모음.
4. (Phase 2) MCP 연결 AI가 이 근거를 읽어 유형별 초안 작성.

## 3. 원칙

- P1 기존 패턴 미러 — `RecordDraft` 수직 슬라이스 그대로 복제.
- P2 프라이버시 경계 — AI 노출(Phase 2)은 기존 토큰화/deidentify/audit 경로만.
- P3 쓰기 계약 SSOT 불변 — 읽기 도구만 추가, OBSERVATION/RECORD_NOTE 화이트리스트 미변경.
- P4 점진 전달 — 앱 단독 완결(Phase 1) / 브릿지 분리(Phase 2).
- P5 법정기록 보수성 — 근거는 보조 자료, `requiresTeacherReview` 정신 유지.

## 4. 범위

### Phase 1 (이 저장소 — 완료)

- `RecordEvidence` 엔티티 + `RecordEvidenceData` + 검증 헬퍼(`areEvidenceAreasValid`, `normalizeEvidenceAreas`).
- `IRecordEvidenceRepository` / `JsonRecordEvidenceRepository`(저장키 `record-evidence`) / `useRecordEvidenceStore`(load/add/update/remove/getByStudentRef/getByArea) / DI `recordEvidenceRepository`.
- `RecordEvidenceView`(학생 목록 ↔ 선택 학생 근거 master-detail, 유형 탭, 등록/수정/삭제 폼, 끌어오기) + `RecordDraftView` 초안↔근거 자료 모드 토글.
- 끌어오기 출처: 담임=누가기록(`StudentRecord.studentId=Student.id`), 수업반=관찰기록(`ObservationRecord.studentId=studentKey`, classId).

### Phase 2 (별도 저장소 `ssampin-ai-bridge` — 미착수)

- 읽기 전용 도구 `get_record_evidence`(record-evidence.json, 토큰화·deidentify·audit, area 필터) + 번들 재생성.
- `write_record_draft` 가이드에 "근거 우선 기반" 반영.

## 5. 수용 기준

- AC1 학생 선택 후 근거 등록→리스트→수정→삭제 동작.
- AC2 한 근거에 area 1개 이상 분류, 유형 탭으로 조회.
- AC3 재시작(스토어 재load) 후 근거 영속.
- AC4 담임·수업반 양 컨텍스트 동작(studentRef 체계 일치).
- AC5(Phase2) `get_record_evidence` 토큰화 식별자 반환·PII 0.
- AC6(Phase2) AI가 근거 기반 area별 초안 생성, requiresTeacherReview 유지.

## 6. 검증

게이트 4/4 — tsc 0 / lint 0 / vitest 249파일·3164 passed·0 failed / regression 38/38. 신규 단위·라운드트립 테스트 7/7(`useRecordEvidenceStore.test.ts`).
