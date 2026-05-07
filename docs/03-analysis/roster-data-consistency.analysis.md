# 명렬(학생 명단) 데이터 정합성 감사 보고서

> 작성일: 2026-05-07
> 작성자: Claude Code (전면 read-only 코드 감사)
> 범위: 담임 명렬, 수업반 명렬, legacy 학급 명렬, 좌석배치, 도구(자리뽑기·모둠짜기·설문·과제), 출결, 학생기록, export
> 결론: **현재 정상 경로에선 작동하지만, 27+ 군데에 분산된 활성 학생 판정 기준 + 4개 병렬 명단 시스템 + 위험한 일괄 import id 재발급 로직이 시한폭탄으로 잠재**

---

## 1. 한눈에 보는 데이터 모델

명렬을 다루는 **4개 병렬 시스템**이 별도 저장소에 살고 있다.

| # | 엔티티 | 식별자 | 저장 키 / 경로 | 사용처 |
|---|--------|--------|----------------|--------|
| 1 | `Student` (담임반) | `id` (예: `s01`, `s${Date.now()}_${idx}`) | `studentRepository` | 담임 명렬 관리, 좌석배치, 도구, 학생기록, 상담, 설문, 과제 |
| 2 | `TeachingClassStudent` (수업반) | 복합키 `studentKey(s)` = `${grade}-${classNum}-${number}` | `teachingClassRepository` (`TeachingClass.students` 안) | 수업관리(출결·진도·좌석·관찰·설문·과제) |
| 3 | `ClassRoster` (legacy 학급 명렬, 이름만) | `id` UUID | `useClassRosterStore`, 저장 키 `class-rosters` | `ToolGrouping`, `ToolRandom`, `ClassRosterSelector` |
| 4 | `StudentInfo` (과제 대상) | `id` 합성 (담임=Student.id, 수업반=`tc-${tcId}-${grade}-${classNum}-${number}`) | `useStudentLists` (런타임 derived) | 과제 생성/제출 |

**의미**: 같은 "1학년 2반 김철수"가 4번 입력될 수 있고, 한 시스템에서 변경해도 다른 시스템에 자동 전파되지 않는다. 또한 시스템 사이의 **id가 서로 다른 형식**이라 cross-reference가 불가능하다.

---

## 2. 발견 사항 (심각도 순)

### 🔴 H-1. 활성 학생 판정 기준이 27곳 이상에서 4가지로 분산

| 패턴 | 의미 | 사용처 (대표) |
|------|------|---------------|
| **A. `!s.isVacant` 단독** | status 무시 | useStudentLists, useSeatingStore, ExcelExporter×4, HwpxExporter×2, SeatingPdf, birthdaySync, surveyRules×3, AttendanceCheckPage, SurveyWidget, ToolRandom, ToolGrouping, ClassRosterSelector, AttendanceTab, AttendanceMatrixView, ClassRecordSearchView, ClassSeatingTab×4, DashboardStudentRecords, ConsultationCreateModal, ConsultationDetail, SurveyDetail×3, SurveyTab, SurveyStudentDetail×3, RecordsExportModal, GroupShuffleOverlay, GroupSeatingView, ProgressMode×3, ClassRosterTab×2 |
| **B. `!s.isVacant && (!s.status \|\| s.status === 'active')`** | 정확 | useTeachingClassStore(initClassSeating, syncGroupStudents의 활성 키), ClassRecordInputView, ClassRecordStatsView, ObservationTab |
| **C. `!s.isVacant && (s.status ?? 'active') === 'active'`** | B와 동등 | ClassSurveyTab |
| **D. `s.status ? s.status === 'active' : !s.isVacant`** | status 우선 | useStudentStore.activeStudents(), RosterManagementTab.activeCount/vacantCount |
| **E. `isInactiveStatus(student.status) \|\| !!student.isVacant`** | E≡D 등가 (UI 표시용) | RosterManagementTab(렌더), ClassRosterTab(렌더), Homeroom/shared/StudentGrid |

**문제**: 패턴 A(28+ 호출)는 `status='transferred'`(전출)인 학생을 `isVacant=false`이면 활성으로 처리한다.

**현재는 안 터지는 이유**: `useStudentStore.changeStatus()`가 status 변경 시 `isVacant: status !== 'active'`를 강제 동기화한다(`useStudentStore.ts:149`). 정상 경로로 status를 바꾸면 isVacant도 같이 바뀐다.

**언제 터지는가** (재현 시나리오):
1. **외부 동기화로 데이터가 들어올 때** — 클라우드 동기화·import에서 `status='transferred', isVacant=false` 조합이 들어오면 모든 A형 호출이 학생을 활성으로 본다.
2. **`updateStudentField('status', ...)`를 누군가 직접 호출할 때** — 현재는 RosterManagementTab의 select가 `changeStatus`를 호출하므로 OK. 미래 회귀 가능성 100%.
3. **`useTeachingClassStore.updateStudentStatus`에서 isVacant=isInactive로 강제 — 단일 클래스 분기는 OK이나, 사용자가 수업관리 편집 모드에서 select를 변경할 때**(`ClassRosterTab.tsx:153`의 `updateStudentStatus`)는 isVacant를 `inactive ? true : existing.isVacant`로 설정하고 active 복귀 시에만 false. → **active로 돌렸을 때 isVacant=false로 reset되지만, transferred → suspended 같은 비활성→비활성 전환 시 기존 isVacant(혹시 false였다면)를 안 건드린다**. 코드 확인: `if existing.isVacant` 분기 — `inactive ? true : existing.isVacant` 이므로 `inactive=true`이면 항상 true. 일단 OK. 
4. **migration 누락** — `useTeachingClassStore.migrateStudentStatus`는 `isVacant=true → status='withdrawn'`만 한다. **반대 방향(status 있고 isVacant 없음)은 마이그레이션 없음**. 클라우드 sync로 들어온 데이터에 status만 있고 isVacant는 undefined인 경우, 모든 A형 판정은 `!undefined === true` → 활성으로 간주.
5. **`useStudentStore`에는 마이그레이션 자체가 없음** — `useTeachingClassStore.load()`만 마이그레이션 수행. 담임 명렬은 status·isVacant 불일치를 절대 자동 보정하지 않는다.

**파급효과** (한 학생을 transferred로 변경했고 어떤 경로로든 isVacant=false인 상태일 때):
- ✅ 명렬 관리 화면: 회색 처리 + "전출" 배지
- ❌ 자리 뽑기: 추첨 후보에 포함
- ❌ 모둠 짜기: 모둠에 포함
- ❌ 설문 응답 수: 분모에 포함 (응답률 왜곡)
- ❌ 과제 대상 명단: 포함
- ❌ 좌석배치: 좌석에 그대로 (sanitize 안 됨)
- ❌ 명렬표 엑셀 export: 출력됨
- ❌ 생일 일정 동기화: 일정에 등록됨
- ❌ 출석부(수업반): 대상에 포함 (단, ClassRecordInputView 등 B형 사용처는 OK)

→ **사용자가 보는 증상**: "전출/휴학으로 표시했는데 다른 화면에선 안 빠져요"

---

### 🔴 H-2. 일괄 import 시 학생 id 재발급 → 외부 참조 전부 단절

**위치**: `RosterManagementTab.tsx:107` (handleBulkImport, 단일 열 모드), `RosterManagementTab.tsx:177` (handleBulkApply, 3단계 마법사), `RosterManagementTab.tsx:691` (엑셀 미리보기 적용), `setStudentCount` (`useStudentStore.ts:184`)

```typescript
const newStudents = imported.map((p, idx) => ({
  id: `s${Date.now()}_${idx}`,  // ← 매번 새 id
  name: p.name,
  ...
}));
```

**문제**: 학생기록(`StudentRecord.studentId`), 좌석배치(`seats`의 cell 값), 과제 제출(`Submission.studentId`), 상담 기록 등 **모든 외부 참조가 학생 id를 키로 보관한다**. 같은 학생을 단지 더 정교한 형식(엑셀)으로 다시 가져오기만 해도 id가 재발급되어 모든 참조가 끊긴다.

**명시 경고는 있다**: "기존 명단이 모두 교체됩니다"라는 빨간 안내 + "실행 취소" 토스트. 그러나:
- 학생기록·과제 제출·좌석은 토스트가 없으면 영구 손실 (또는 "fk가 끊긴 채" 데이터만 남음)
- 좌석은 `useSeatingStore.subscribe`가 `syncFromRoster`를 호출해 모르는 id를 모두 null로 비워버림 (`useSeatingStore.ts:443-447`) — **사용자가 보면 "학생을 더 추가했는데 좌석이 다 비워졌어요"**

**시한 정도**: 사용자가 "학기 중에 결번 한 명 추가하려고 엑셀 다시 가져왔는데 학생기록·좌석·과제 제출이 다 사라졌어요" 클레임이 들어올 가능성이 매우 높다.

---

### 🟠 H-3. `setStudentCount` 감소 = 무경고 영구 데이터 삭제

**위치**: `useStudentStore.ts:191-196`, `RosterManagementTab.tsx:260-273`

```typescript
} else if (clamped < students.length) {
  const sorted = [...students].sort((a, b) => (a.studentNumber ?? 0) - (b.studentNumber ?? 0));
  newStudents = sorted.slice(0, clamped);  // ← 끝번호 학생을 잘라버림
}
```

UI는 명렬 관리 헤더의 `[-]` 버튼 한 번 = -1명. 확인 모달 없음, 실행 취소 없음. 잘려나간 학생의 **이름·연락처·보호자·생년월일·상태·학생기록 참조 id가 영구 삭제**된다.

**추가 위험**: 결번이 중간에 있는 경우(예: 1·2·3·5·6·7·8·9·10·11번, 4번이 결번) `[-]`을 누르면 11번이 잘림. 4번이 보존되지만 11번 학생의 모든 데이터 손실. 직관적이지 않다.

---

### 🟠 H-4. legacy `useClassRosterStore` (학급 명렬, 이름만) 잔존

**위치**: `useClassRosterStore.ts`, 사용처 = `ToolGrouping.tsx`, `ToolRandom.tsx`, `ClassRosterSelector.tsx`

3개의 도구가 **담임반·수업반과 별개의 "학급 명렬"** 시스템을 사용한다. 사용자가 도구에서 직접 명렬을 만들면 그건 어디에도 연동되지 않는 외딴 데이터. 이름 문자열만 저장되어 결번·상태·연락처 등의 메타정보가 없다.

**사용자 혼란 시나리오**:
- 담임 명렬을 갱신했는데 "자리 뽑기"의 학급 명렬에는 반영 안 됨
- "자리 뽑기"에서 만든 학급 명렬은 좌석배치에 쓸 수 없음
- "내 학급이 어디에 사는지" 사용자가 모름

**판단**: 도구 전용 ad-hoc 명단(예: 학년 단위 통합)을 위한 의도적 분리일 수도 있으나, 명렬 모델이 4개 공존하는 건 과도하다.

---

### 🟠 H-5. 담임 명렬과 수업반 명렬 사이 자동 동기화 부재

같은 학생(예: 담임이 자기 반 수학 수업도 함)이 `Student`로 한 번, `TeachingClassStudent`로 한 번 입력되어야 한다. 한쪽 변경이 다른 쪽에 전파되지 않는다.

식별자 체계가 다르므로(`Student.id` vs `studentKey`) 자동 매칭도 불가능. 적어도 "담임반 명렬을 수업반에 복사하기" 같은 명시적 동기화 액션이 있어야 한다.

---

### 🟡 H-6. `ConsultationCreateModal.targetStudents`는 `studentNumber`만 저장 (id 아님)

**위치**: `ConsultationCreateModal.tsx:613`

```typescript
targetStudents: students.filter((s) => !s.isVacant).map((s) => ({ number: s.studentNumber ?? 0 }))
```

학생 번호가 바뀌면(편집/일괄 import) 상담 대상이 다른 학생으로 매핑된다. 학생 번호 재정렬 시 무성한 데이터 오염 가능.

---

### 🟡 H-7. `useStudentLists` (과제 대상 derived)는 status 완전 무시

**위치**: `useStudentLists.ts:37, 53`

```typescript
const activeStudents = students.filter((s) => !s.isVacant);  // status 무시
const activeStudentsInClass = tc.students.filter((s) => !s.isVacant);  // status 무시
```

H-1의 가장 가시적 사례. 과제 생성 시 비활성 학생이 대상에 포함될 수 있다.

---

### 🟡 H-8. 수업반 그룹 students 강제 통일

**위치**: `useTeachingClassStore.syncGroupStudents` (`useTeachingClassStore.ts:194`)

같은 groupId에 속한 모든 과목의 students 배열이 강제 통일된다. 사용자가 과목별 다른 명단(예: 영어=수준별 분반)을 원할 때 우회 불가. 의도된 동작인지 PRD 검증 필요.

---

### 🟢 H-9. RosterManagementTab 구버전(단일열) 일괄 입력은 부가 정보 강제 초기화

**위치**: `RosterManagementTab.tsx:106-113`

```typescript
const newStudents = names.map((name, idx) => ({
  id: `s${Date.now()}_${idx}`,
  name,
  studentNumber: idx + 1,
  phone: '',           // ← 강제 초기화
  parentPhone: '',     // ← 강제 초기화
  isVacant: false,
}));
```

이름 갱신만 하려고 단순 일괄 입력하면 모든 부가 정보(연락처·보호자·생년월일·상태)가 사라진다. H-2와 함께 발생.

---

## 3. 수업반 좌석배치 별도 식별 체계 (참고용 정상)

`TeachingClass.seating.seats[r][c] = studentKey(student)` (= `${grade}-${classNum}-${number}` 또는 `String(number)`) → 학생 변경 시 `useTeachingClassStore.syncGroupStudents`가 비활성 학생 좌석을 null로 정리. 이는 정상.

다만 `TeachingClassStudent`의 `number`가 바뀌면 좌석에서 그 학생을 잃는다. (number는 `studentKey`의 핵심 부분)

---

## 4. 정상 작동 부분 (보존해야 할 것)

- `useSeatingStore.sanitizeSeating`은 결번/존재하지 않는 학생을 자동 정리하고 신규 학생을 빈 자리에 배치한다 — 정합성 자가 회복 메커니즘. 보존.
- `useStudentStore.changeStatus` 정상 경로는 status·isVacant·statusChangedAt 동기화 + 생일 일정 자동 sync — 모범 사례.
- `useTeachingClassStore.migrateStudentStatus` 기동 시 isVacant→status 단방향 마이그레이션 수행 — 보존, 다만 양방향으로 확장 필요.

---

## 5. 권장 우선순위

| 우선순위 | 항목 | 영향 |
|----------|------|------|
| P0 | H-1 활성 학생 판정 통일 (`isStudentActive(s)` 단일 함수로 강제) + 양방향 status↔isVacant 마이그레이션 | 27+ 호출 일관성, 미래 회귀 차단 |
| P0 | H-2 import 시 기존 id 보존 (이름/번호 매칭으로 same-as detection) 또는 명시적 "교체 vs 추가" 모달 | 학생기록·좌석·과제 보호 |
| P1 | H-3 `setStudentCount` 감소 시 확인 모달 + 비활성 학생부터 잘라내기 | 무경고 데이터 손실 차단 |
| P1 | H-7 `useStudentLists` 판정을 H-1 통일 함수로 교체 | 과제 대상 정확성 |
| P1 | H-6 `ConsultationCreateModal` 대상 저장을 id 기반으로 변경 | 상담 데이터 무결성 |
| P2 | H-4 legacy `useClassRosterStore` 정리 또는 명확한 분리 안내 | UX 명료성 |
| P2 | H-5 담임↔수업반 명단 복사 액션 도입 | 사용자 편의 |
| P3 | H-8 그룹 내 과목별 다른 명단 허용 옵션 | 분반 케이스 |
| P3 | H-9 단일열 일괄 입력 시 부가 정보 보존 옵션 | 데이터 보존 |

---

## 6. 비고

- 본 보고서는 **NEIS Schedule 관련 파일은 검사 대상에서 제외**했음 (사용자 다중 세션 작업 중인 영역으로 명시 지시됨, 2026-05-06 메모리).
- `StepStudentRoster.tsx` (AddClassModal)는 NEIS와 무관한 학급 만들기 위자드 단계지만, NEIS import 경로와 인접하므로 P0 수정 시 충돌 여부 별도 확인 필요.
- 본 보고서는 read-only 정적 분석. 실제 이슈 재현을 위한 QA 시나리오는 `/pdca design` 단계에서 작성 예정.
