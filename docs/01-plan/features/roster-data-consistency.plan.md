# 명렬 데이터 정합성 회복 Planning Document

> **Summary**: 4개 병렬 명단 시스템과 27+ 군데에 분산된 활성 학생 판정 로직, import 시 id 재발급으로 인한 외부 참조 단절, 무경고 데이터 삭제 등 명렬 데이터의 모든 정합성 부채를 4 Phase에 걸쳐 정리한다. Single source of truth를 도메인 레이어에 확립하고, 사용자 데이터 손실 위험을 0에 가깝게 줄인다.
>
> **Project**: SsamPin
> **Version**: TBD (구현 완료 후 v2.0.4 patch 또는 v2.1.0 minor 결정)
> **Author**: pblsketch
> **Date**: 2026-05-07
> **Status**: Draft
>
> **단일 진실 원천**: [`docs/03-analysis/roster-data-consistency.analysis.md`](../../03-analysis/roster-data-consistency.analysis.md)

---

## 1. 개요

### 1.1 문제

명렬(학생 명단)을 다루는 시스템이 **4개 병렬로 공존**하며, 활성 학생 판정 기준이 **27곳 이상에서 4가지 패턴**으로 분산되어 있다. 정상 경로에서는 작동하지만, 외부 동기화·field 직접 변경·migration 미동기화·일괄 import 등의 경로에서 데이터 정합성이 언제든 깨질 수 있는 시한폭탄 상태.

### 1.2 가시적 사용자 영향 (회귀 시 발생할 시나리오)

1. 전출/휴학 처리한 학생이 자리 뽑기·모둠짜기·과제 명단·설문·생일 일정에는 그대로 남아있음
2. 엑셀로 명렬을 다시 가져왔더니 학생기록·좌석·과제 제출이 모두 사라짐
3. 명렬관리 [-] 버튼 한 번 잘못 눌러서 학생 5명의 모든 정보 영구 삭제
4. 도구의 학급 명렬과 담임 명렬이 따로 살아 사용자가 어디를 수정해야 할지 혼란
5. 학생 번호를 재정렬했더니 상담 대상이 다른 학생으로 바뀜

### 1.3 배경

- **9건의 발견(H-1~H-9)**: 분석 보고서에 P0~P3 우선순위 + 재현 시나리오 + 영향 파일 목록 명시
- **현재 정상 경로는 작동**: 사용자가 명렬관리 화면에서 select로 status를 변경하면 isVacant도 같이 동기화되며, 좌석배치는 sanitize로 자동 정리. 다만 이 안전망 밖의 경로(외부 sync, field 직접 변경, 마이그레이션 누락, 일괄 import)에서 깨진다
- **선결 작업**: native-desktop v2.1.0 RC dogfooding과 시간 겹치므로, 구현 단계에서 release 전략을 별도 결정

### 1.4 결정 사항 (kickoff 완료)

| 결정 | 선택 | 근거 |
|------|------|------|
| 수정 범위 | **P0~P3 전부 (H-1~H-9)** | 동일 도메인 일괄 정리 = 키 마이그레이션 1회로 끝, 추후 회귀 차단 |
| H-1 위치 | **`src/domain/rules/studentActivity.ts` 신설** | 순수 도메인 함수, 테스트 용이, eslint로 직접 isVacant 접근 차단 |
| H-2 전략 | **(이름+학번) 자동 매칭 + 충돌 시 모달** | 외부 참조 자동 보존, 사용자 입력 최소, "교체/추가/병합" 명시 결정은 충돌 시에만 |
| 릴리스 타겟 | **TBD** (Do/Check 완료 후 판단) | native-desktop과의 묶음 여부는 위험도 측정 후 결정 |

---

## 2. 범위

### 2.1 포함 범위 (In Scope)

#### Phase 1 — 도메인 단일화 (P0 H-1 기반)
- [ ] `src/domain/rules/studentActivity.ts` 신설 — `isStudentActive(s) / isStudentInactive(s) / hasInactiveStatus(s)` 단일 판정 함수
- [ ] `Student.ts` / `TeachingClass.ts`에 양방향 `normalizeStudentStatus(s)` 헬퍼 추가 (status↔isVacant 자동 일치)
- [ ] `useStudentStore.load`에 `migrateStudentStatus`(현재 useTeachingClassStore에만 있음) 양방향 마이그레이션 도입
- [ ] eslint custom rule 또는 no-restricted-syntax로 `\.isVacant` 직접 비교 경고 (예외: rules/studentActivity.ts, migration 코드)
- [ ] Vitest 단위 테스트 — 모든 status × isVacant 조합 행렬 검증

#### Phase 2 — 호출처 일괄 codemod (P0 H-1 + P1 H-7)
- [ ] `useStudentLists.ts` 두 곳 → `isStudentActive`
- [ ] `useSeatingStore.createSeatingFromStudents` / `sanitizeSeating` → `isStudentActive`
- [ ] `birthdaySync.ts` → `isStudentActive`
- [ ] `surveyRules.ts` 3곳 → `isStudentActive`
- [ ] `ExcelExporter.ts` 4곳, `HwpxExporter.ts` 2곳, `SeatingPdf.ts` 1곳 → `isStudentActive`
- [ ] Survey/Consultation/Records 컴포넌트 일괄 (`SurveyDetail` 3곳, `SurveyTab`, `SurveyStudentDetail` 3곳, `ConsultationDetail`, `RecordsExportModal`, `ProgressMode` 3곳, `DashboardStudentRecords`, `ConsultationCreateModal`)
- [ ] Tools 일괄 (`ToolRandom`, `ToolGrouping` 5곳, `ClassRosterSelector` 2곳)
- [ ] ClassManagement 일괄 (`AttendanceTab`, `AttendanceMatrixView`, `ClassRecordSearchView`, `ClassSeatingTab` 4곳, `ClassRosterTab` 2곳, `ClassSurveyTab`, `ClassRecordInputView`, `ClassRecordStatsView`, `ObservationTab`)
- [ ] Mobile (`AttendanceCheckPage`)
- [ ] Widgets (`SurveyWidget`)
- [ ] Seating (`GroupShuffleOverlay`, `GroupSeatingView`, `StudentGrid`)
- [ ] **메타 테스트**: `__tests__/studentActivityCallSites.test.ts` — grep 기반으로 `\.isVacant` 직접 사용처가 화이트리스트(activity/migration)만 남는지 검증

#### Phase 3 — Import id 보존 (P0 H-2)
- [ ] `src/domain/rules/rosterImportRules.ts`에 `matchExistingStudent(imported, existing)` 추가 — (이름 trim + 학번) 또는 (이름 trim, 학번 미입력 시) 매칭
- [ ] `src/domain/rules/rosterImportPlan.ts` 신설 — `planImport(existing, imported)` → `{ matched: [{existingId, importedFields}], conflicts: [{name, existingNumber, importedNumber}], newOnly: [...] }` 반환
- [ ] `RosterManagementTab.handleBulkApply` 수정 — planImport 호출 → 충돌 0건이면 자동 적용 (기존 id 보존), 충돌 발생 시 ConflictResolveModal 노출
- [ ] `ConflictResolveModal` 신설 — "교체/추가/병합/건너뛰기" per-row 선택 + 일괄 적용 옵션
- [ ] `RosterManagementTab.handleBulkImport`(legacy 단일열 모드) 동일하게 적용 + H-9 부가 정보 보존 옵션 (이미 존재 학생은 phone 등 유지)
- [ ] 엑셀 미리보기 적용 경로 (`previewStudents → newStudents` 매핑) 동일하게 적용
- [ ] 기존 "실행 취소" 토스트 유지

#### Phase 4 — 데이터 손실 차단 (P1 H-3, H-6)
- [ ] `useStudentStore.setStudentCount` 감소 시: 비활성 학생 우선 제거 → 그래도 부족하면 ConfirmModal 노출 ("N명의 학생 데이터가 영구 삭제됩니다")
- [ ] `RosterManagementTab` [-]/[+] 버튼 UX — 비활성 학생부터 제거됨을 미리보기로 안내
- [ ] `ConsultationCreateModal.targetStudents` 저장 형식을 `{ id }` 기반으로 변경 (마이그레이션: number → id 자동 변환)
- [ ] `ConsultationDetail` 등 read-side가 number 또는 id 모두 처리 (하위 호환)

#### Phase 5 — 시스템 통합 / legacy 정리 (P2 H-4, H-5)
- [ ] `useClassRosterStore` 사용처 3개(`ToolGrouping`, `ToolRandom`, `ClassRosterSelector`)에 "담임반/수업반 가져오기" 명시 옵션 추가
- [ ] `ClassRosterSelector`에 "이 학급 명렬은 담임반·수업반과 별개입니다" 안내 배너
- [ ] `Settings`에 "담임반 명렬을 수업반으로 복사" 액션 추가 — 사용자 명시 호출
- [ ] (선택) legacy `class-rosters` 저장된 명단을 담임/수업반으로 마이그레이션하는 일회성 도우미

#### Phase 6 — 그룹 분리 옵션 + 부가 정보 보존 (P3 H-8, H-9)
- [ ] `TeachingClass.studentSyncMode?: 'shared' | 'independent'` 추가 — 같은 groupId여도 과목별 다른 명단 허용
- [ ] `useTeachingClassStore.syncGroupStudents` 분기 — `independent` 모드는 단일 클래스만 업데이트
- [ ] `ClassRosterTab`에 "이 과목은 다른 명단 사용" 토글
- [ ] H-9: 단일열 일괄 입력 시 이름 매칭된 학생은 phone/parentPhone/birthDate 보존 (Phase 3과 함께 자동 처리)

### 2.2 제외 범위 (Out of Scope)

- **NEIS Schedule 관련 파일** — 다른 세션 진행 중, 절대 건드리지 말 것 (사용자 명시 지시 2026-05-06). `src/adapters/components/ClassManagement/AddClassModal/StepStudentRoster.tsx`도 NEIS import 인접이므로 변경 시 별도 확인.
- 학생 사진/이미지/QR 등 미디어 데이터 동기화
- 명렬 변경 이력(audit log) — 별도 PDCA 후보
- Google Drive sync에서 명렬 충돌 해결 — 별도 PDCA `first-sync-confirmation` 영역
- 과제 시스템(`Assignment.targetStudents`) 자체 리팩터 — 본 PDCA에서는 useStudentLists 판정만 통일하고 외부 참조 형식은 유지

---

## 3. 요구사항

### 3.1 기능 요구사항 (Functional Requirements)

| ID | 요구사항 | 우선순위 | Phase | 상태 |
|----|----------|----------|-------|------|
| FR-01 | `isStudentActive(s)` 단일 판정 함수 — status 우선, 없으면 isVacant 폴백 | Must | 1 | Pending |
| FR-02 | `useStudentStore.load`에 status↔isVacant 양방향 자동 마이그레이션 | Must | 1 | Pending |
| FR-03 | 코드베이스 전수 codemod — 27+ 호출 모두 isStudentActive로 교체 | Must | 2 | Pending |
| FR-04 | 메타 테스트 — 미래 회귀 시 즉시 경고 | Must | 2 | Pending |
| FR-05 | Import 시 (이름+학번) 매칭으로 기존 id 보존 | Must | 3 | Pending |
| FR-06 | 충돌 발생 시 per-row "교체/추가/병합/건너뛰기" 모달 | Must | 3 | Pending |
| FR-07 | `setStudentCount` 감소 시 비활성 학생 우선 제거 + 활성 학생 삭제는 확인 모달 | Should | 4 | Pending |
| FR-08 | 상담 대상 저장 형식을 id 기반으로 변경 + number 폴백 마이그레이션 | Should | 4 | Pending |
| FR-09 | "담임반→수업반 명단 복사" 액션 (Settings) | Should | 5 | Pending |
| FR-10 | `useClassRosterStore` 사용처에 명단 출처 안내 배너 | Could | 5 | Pending |
| FR-11 | `TeachingClass.studentSyncMode` (shared/independent) 옵션 | Could | 6 | Pending |
| FR-12 | 일괄 입력 시 이름 매칭된 학생의 부가 정보 보존 | Could | 6 | Pending |

### 3.2 비기능 요구사항 (Non-Functional Requirements)

| ID | 요구사항 | 측정 기준 |
|----|----------|-----------|
| NFR-01 | TypeScript strict 통과, `npx tsc --noEmit` 에러 0 | CI |
| NFR-02 | Vitest 모든 단위 테스트 통과 | CI |
| NFR-03 | 기존 사용자 데이터 100% 호환 (마이그레이션 자동 수행) | QA 시나리오 |
| NFR-04 | Import 충돌 모달 응답 시간 < 500ms (1000명 기준) | 수동 측정 |
| NFR-05 | codemod 후 unintended UI 변화 0건 | 수동 회귀 |
| NFR-06 | 도메인 레이어 외부 의존 0 (Clean Architecture 의존성 규칙 유지) | tsc + 코드 리뷰 |

### 3.3 제약사항 (Constraints)

- NEIS 관련 파일 절대 변경 금지 (다른 세션 진행 중)
- 디자인·UI·UX 작업 발생 시 frontend-design 또는 bkit:frontend-architect 에이전트와 반드시 협업 (CLAUDE.md memory 규칙)
- 직각 금지 + `rounded-sp-*` 사용 금지 — Tailwind 기본 키만 사용 (라운드 정책)
- 기존 디자인 시스템 v3.2 토큰(`sp-*`) 준수, 신규 토큰 도입 금지
- domain/ 레이어는 외부 의존성 0 유지

---

## 4. 우선순위 / 단계

### Phase 1: 도메인 단일화 (예상 0.5일)
**목표**: 활성 학생 판정의 단일 진실 원천 확립.
- 신설 1 + 헬퍼 추가 2 + 마이그레이션 1 + 테스트
- 산출물: `studentActivity.ts`, 양방향 마이그레이션, 단위 테스트

### Phase 2: 호출처 codemod (예상 1일)
**목표**: 27+ 호출 일괄 교체 + 메타 테스트로 회귀 차단.
- Python/Node 스크립트로 일괄 치환 가능 (단순 규칙)
- 메타 테스트가 화이트리스트 외 위반 즉시 감지
- 산출물: ~30 파일 수정, `studentActivityCallSites.test.ts`

### Phase 3: Import id 보존 (예상 1.5일)
**목표**: 사용자 데이터 손실 위험 0.
- planImport 도메인 로직 + ConflictResolveModal UI
- frontend-design 에이전트 협업 필수 (모달 디자인)
- 산출물: `rosterImportPlan.ts`, `ConflictResolveModal.tsx`, RosterManagementTab 3 경로 수정

### Phase 4: 데이터 손실 차단 (예상 0.5일)
**목표**: setStudentCount 안전화 + 상담 외부 참조 무결성.
- ConfirmModal 추가, 비활성 우선 제거 로직
- ConsultationCreateModal 마이그레이션
- 산출물: useStudentStore 수정, ConsultationCreateModal/Detail 수정

### Phase 5: 시스템 통합 (예상 1일)
**목표**: legacy 명렬 시스템 명료화 + 담임↔수업반 동기화 액션.
- 안내 배너, "복사" 액션, (선택) legacy 마이그레이션 도우미
- 산출물: ClassRosterSelector 배너, Settings 복사 액션

### Phase 6: 그룹 분리 옵션 (예상 1일)
**목표**: 그룹 students 강제 통일 해제 옵션.
- TeachingClass 스키마 확장, syncGroupStudents 분기
- 산출물: studentSyncMode 토글, ClassRosterTab UI

**총 예상**: 5.5일 (1주). 각 Phase별 commit 분리, 각 Phase 종료 시 사용자 검증 받음.

---

## 5. 위험 요소 / 대응

| 위험 | 영향 | 가능성 | 대응 |
|------|------|--------|------|
| codemod 일괄 치환에서 누락된 호출이 회귀 일으킴 | 높음 | 중 | 메타 테스트 + tsc + 수동 회귀 시나리오 8건 |
| ConflictResolveModal UI 복잡도 폭증 | 중 | 중 | "충돌 0건이면 모달 안 뜸" 정책으로 일반 케이스 단순화 |
| 마이그레이션 후 일부 학생의 status가 의도와 다름 | 높음 | 낮음 | dry-run 로깅 + 사용자에게 마이그레이션 결과 토스트 |
| native-desktop v2.1.0 RC와 충돌 | 중 | 중 | 별도 브랜치 `feature/roster-data-consistency`에서 진행, RC와 격리 |
| ConsultationCreateModal targetStudents 형식 변경이 외부에 영향 | 중 | 낮음 | number/id 폴백 양쪽 read 지원, 신규 저장만 id |
| 기존 `useClassRosterStore` 사용 학급 명렬 데이터 손실 | 높음 | 낮음 | legacy 데이터는 그대로 유지, 마이그레이션은 사용자 명시 호출만 |
| Phase 6 그룹 분리 옵션이 출결/진도 기존 그룹 분기와 충돌 | 중 | 중 | studentSyncMode='independent'는 students만 영향, attendance/progress의 groupId 의미는 유지 |

---

## 6. 영향 파일 (윤곽)

### 신설
- `src/domain/rules/studentActivity.ts`
- `src/domain/rules/rosterImportPlan.ts`
- `src/adapters/components/Homeroom/RosterImport/ConflictResolveModal.tsx`
- `src/domain/rules/__tests__/studentActivity.test.ts`
- `src/domain/rules/__tests__/rosterImportPlan.test.ts`
- `__tests__/studentActivityCallSites.test.ts` (메타 테스트)

### 핵심 수정
- `src/domain/entities/Student.ts` (헬퍼)
- `src/domain/entities/TeachingClass.ts` (헬퍼)
- `src/domain/rules/rosterImportRules.ts` (matchExistingStudent)
- `src/adapters/stores/useStudentStore.ts` (마이그레이션, setStudentCount 안전화)
- `src/adapters/stores/useTeachingClassStore.ts` (양방향 마이그레이션, syncGroupStudents 분기)
- `src/adapters/stores/useSeatingStore.ts` (isStudentActive 사용)
- `src/adapters/components/Homeroom/RosterManagementTab.tsx` (3 import 경로, [-]/[+] 안전화)
- `src/adapters/components/Homeroom/Consultation/ConsultationCreateModal.tsx` (id 기반 저장)
- `src/adapters/components/Homeroom/Consultation/ConsultationDetail.tsx` (id/number 폴백)

### Codemod 일괄 (~30 파일, 화이트리스트 명시)
- 분석 보고서 H-1 표 참조, 패턴 A 모든 호출처

### 안내/UX 추가
- `src/adapters/components/Tools/ClassRosterSelector.tsx` (배너)
- `src/adapters/components/Settings/*` (담임→수업반 복사 액션, 위치 미정)
- `src/adapters/components/ClassManagement/ClassRosterTab.tsx` (studentSyncMode 토글)

### 절대 건드리지 않음
- `src/adapters/components/ClassManagement/AddClassModal/StepStudentRoster.tsx` (NEIS 인접)
- 일정/스케줄 관련 NEIS 파일 일체

---

## 7. 검증 시나리오 (Phase별 사용자 QA)

### Phase 1+2 검증 (도메인 + codemod)
1. status='transferred' & isVacant=false 인 가짜 데이터를 localStorage에 직접 주입
2. 자리뽑기 → 그 학생이 빠져있는지 확인
3. 모둠짜기 → 빠져있는지 확인
4. 명렬표 엑셀 → 안 들어 있는지 확인
5. 생일 일정 동기화 → 등록 안 됐는지 확인
6. 담임 명렬 화면 새로고침 → 마이그레이션 토스트 + isVacant=true 강제 동기화 확인

### Phase 3 검증 (Import id 보존)
1. 학생 30명 등록 → 학생기록 일부 입력, 좌석 배치
2. 같은 학생 30명을 엑셀로 다시 가져오기 → 충돌 0건, 자동 적용, 학생기록·좌석 보존됨
3. 1명만 이름 변경한 엑셀 가져오기 → 1건 충돌 모달, "교체" 선택 시 그 학생만 새 id, 나머지 보존
4. 학번 1번이 결번이고 나머지 추가한 엑셀 → 결번 유지, 신규 학생 추가, 기존 보존

### Phase 4 검증 (데이터 손실 차단)
1. 30명 등록 → [-] 5번 클릭 → 비활성 학생 우선 제거 미리보기, 그래도 부족하면 confirm 모달
2. 상담 생성 → 학생 번호 변경 → 상담 대상이 같은 학생을 가리키는지 확인

### Phase 5+6 검증 (시스템 통합)
1. 도구의 "학급 명렬"에 명단 작성 → 담임 명렬과 별개임을 안내 배너로 확인
2. Settings → "담임반→수업반 복사" → 수업반에 같은 학생 자동 등록
3. ClassRosterTab → "다른 명단 사용" 토글 → 그룹 내 다른 과목과 명단 분리됨

---

## 8. 후속 작업 (이번 PDCA 외)

- 명렬 변경 이력(audit log) — 별도 PDCA
- Google Drive sync에서 명렬 충돌 해결 — `first-sync-confirmation` 확장
- 과제 시스템 `Assignment.targetStudents` 외부 참조 형식 통일 — 별도 PDCA
- 학생 통합 검색 (담임반 + 수업반 + 학급 명렬 횡단)

---

## 9. 참고 문서

- 분석 보고서 (단일 진실 원천): [`docs/03-analysis/roster-data-consistency.analysis.md`](../../03-analysis/roster-data-consistency.analysis.md)
- CLAUDE.md (프로젝트 규칙)
- MEMORY.md (사용자 피드백, 라운드 정책, frontend 협업 규칙, NEIS 회피)
- 기존 homeroom audit: `docs/04-report/homeroom-audit.report.md` (참고용, 본 PDCA와 일부 영역 겹침)
