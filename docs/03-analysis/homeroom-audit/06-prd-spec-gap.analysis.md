# 담임 업무 페이지 PRD/SPEC ↔ 구현 갭 분석

**대상**: `src/adapters/components/Homeroom/` + `src/widgets/items/StudentRecords.tsx` + 관련 도메인
**감사 일시**: 2026-05-01
**참조**: `PRD.md` 5.7 (라인 276~334) · `SPEC.md` 4.10 (라인 736~784)
**Match Rate**: **85%** (FR-STMEMO 가중) / **종합 ~80%** (메모리 기준 90% 미달)

---

## A. PRD 5.7 담임 메모장 (FR-STMEMO-01~10) 1:1 매핑

| FR | PRD 인용 (라인) | 구현 위치 | 충족도 | 갭 |
|----|------------------|------------|:------:|-----|
| **01** 좌석배치 학생 데이터 연동 | "좌석배치에 등록된 학생 목록을 자동으로 가져옴" (PRD:325) | `RecordsTab.tsx:29-30` `useStudentStore` 사용. 기록은 `studentId` 외래키로 학생 참조 | ✅ | SPEC:771 "seating.json 학생 데이터 참조" 그대로는 아님. 별도 `useStudentStore`로 이관됨 |
| **02** 학생 → 카테고리 → (선택적 메모) → 저장 3단계 | PRD:326 | `Records/InputMode.tsx:50-100, 1299줄` | ✅ | 출결 카테고리는 SPEC 단일 subcategory가 아닌 `ATTENDANCE_TYPES × ATTENDANCE_REASONS × periods` 3차원 확장 (FR-02 스펙 초과) |
| **03** 카테고리 기본 + 사용자 정의 추가 | PRD:327 | 기본: `RecordCategory.ts:22-47 DEFAULT_RECORD_CATEGORIES`. 사용자 정의: `RecordCategoryManagementModal` + `useStudentRecordsStore.categories` | ✅ | 충족. PRD:298 "보건"이 코드에서는 "건강" 표기 |
| **04** 다중 학생 일괄 기록 | PRD:328 "3명 동시 지각 처리" | `InputMode.tsx:66 selectedStudents: Set<string>` 다중 선택 → 학생별 record 발행 | ⚠️ | **데이터 모델 갭**: SPEC:762 `studentIds: number[]` (1 record N students)였으나 구현은 `StudentRecord.studentId: string` (1 record 1 student). UI 일괄 입력은 됨 |
| **05** 날짜 자동(오늘) + 수동 변경 | PRD:329 | `RecordsTab.tsx:33 todayString()` + `DateNavigator` + `InputMode.tsx:96-100 dateRangeMode` (스펙 초과) | ✅ | 충족 + 초과 (날짜 범위 등록) |
| **06** 학생별 타임라인 | PRD:330 | `Records/SearchMode.tsx (627)` + `StudentTimelineView.tsx (257)` | ✅ | 충족 |
| **07** 출결 통계 자동 집계 | PRD:331 "결석/지각/조퇴 횟수" | `StudentRecord.ts:41 AttendanceStats` + `Records/ProgressMode.tsx (647)` + `RecordStatCards.tsx (59)` | ✅ | 충족. PRD에 없는 `resultAbsent`(결과)와 `praise`(칭찬) 카운터 추가 |
| **08** HWPX/Excel 내보내기 | PRD:332 "생활기록부 자료용" | `Records/RecordsExportModal.tsx (354)` → `HwpxExporter` + `ExcelExporter` + `exportRecordsForSchoolReport` | ✅ | 두 포맷 모두 충족 |
| **09** 대시보드 위젯 | PRD:333 "오늘 기록 N건 또는 최근 기록 미리보기" | `Dashboard/DashboardStudentRecords.tsx (~269)` — 카테고리 탭, `MAX_PREVIEW=3`. **`widgets/items/StudentRecords.tsx`는 4줄 re-export** | ✅ | 충족. (정정: 위젯은 풀-페이지 복제가 아님) |
| **10** 수업 반 선택 (담임 외 수업반) | PRD:284 `[담임] [1-1] [1-2] [1-3]…` 탭 / PRD:286 `"담임 탭에서는 담임반, 다른 탭은 해당 수업반"` | **❌ 미구현**. `HomeroomPage.tsx:30-46`에 학급 선택 탭 없음. `RecordsTab.tsx:29 useStudentStore` 단일 담임반만 사용. `Settings.ts:265 className: string` 단일값 (SPEC:778 `classes: Array` 미반영) | ❌ | **P0**. 별도 `ClassManagement/` 페이지(파일 20개)에서 처리됨 — PRD의 "담임 메모장 안에서 모든 반 관리"가 아니라 별도 메뉴로 분리 |

**합계 (FR 가중 평균, ⚠️=0.5)**: (8 × 1.0 + 1 × 0.5 + 1 × 0.0) / 10 = **85%**

---

## B. PRD:319 "상벌점 v2.0" 미구현 검증

- **PRD 인용**: `PRD.md:319-321` "**상벌점 모드 (v2.0):** 상점/벌점 부여 및 누계 관리, 학교별 상벌점 기준 커스텀 설정"
- **검증**: `grep -r "상점\|벌점\|merit\|demerit\|상벌" src/` → **매치 0건**
- **충족도**: ❌ 미구현
- **결론**: PRD에서 v2.0으로 명시한 미래 기능이라 정상. 현재 v2.0.0 릴리즈됐음에도 미구현 — **PRD 문서 갱신 또는 릴리즈 필요** (P3)

---

## C. SPEC.md 데이터 모델 갭

### C-1. StudentRecord 인터페이스 비교

**SPEC:758-767**:
```ts
interface StudentRecord {
  id: string;
  date: string;
  createdAt: string;
  studentIds: number[];               // 학생 학번 배열 (다중 선택 가능)
  className: string;                  // "1학년 2반"
  categoryGroup: 'attendance' | 'counseling' | 'life' | 'etc';
  categoryId: string;
  memo?: string;
}
```

**구현 (`src/domain/entities/StudentRecord.ts:18-34`)**:
```ts
interface StudentRecord {
  readonly id: string;
  readonly studentId: string;          // ⚠️ 단수 + string (SPEC: studentIds: number[])
  readonly category: string;           // ⚠️ SPEC categoryGroup 명칭 불일치, open string
  readonly subcategory: string;        // ➕ SPEC에 없음
  readonly content: string;            // ⚠️ SPEC: memo? (선택), 구현: required
  readonly date: string;
  readonly createdAt: string;
  readonly method?: CounselingMethod;          // ➕ SPEC에 없음 (P1)
  readonly followUp?: string;                  // ➕ SPEC에 없음 (P1)
  readonly followUpDate?: string;              // ➕ SPEC에 없음
  readonly followUpDone?: boolean;             // ➕ SPEC에 없음
  readonly reportedToNeis?: boolean;           // ➕ SPEC에 없음 (P0)
  readonly documentSubmitted?: boolean;        // ➕ SPEC에 없음 (P0)
  readonly attendancePeriods?: readonly AttendancePeriodEntry[];  // ➕ SPEC에 없음 (P0)
  // ❌ className 필드 없음 (학생 ID로 추론)
  // ❌ categoryGroup 명칭이 category로 변경됨 + closed union이 open string으로 완화
}
```

| 항목 | SPEC | 구현 | 갭 |
|------|------|------|-----|
| ID 학번 표현 | `number[]` 배열 | `string` 단일 | 단수화 + 타입 변경 (P1) |
| 학급 식별 | `className` 필드 | 없음(외래키 기반) | SPEC 누락 (P2) |
| 카테고리 그룹 | closed union | open string | 사용자 정의 카테고리 지원 위해 완화 |
| 메모 | optional `memo` | required `content` | 필드명·옵션성 변경 (P2) |

### C-2. AttendancePeriodEntry, RecordTemplate, CounselingMethod

**SPEC 명시 없음**. 구현된 부가 도메인:
- `StudentRecord.ts:11-16 AttendancePeriodEntry { period, status, reason?, memo? }`
- `domain/entities/RecordTemplate.ts` + `DefaultTemplates.ts` 4종
- `StudentRecord.ts:4 CounselingMethod = 'phone'|'face'|'online'|'visit'|'text'|'other'`

→ 모두 PRD/SPEC 외 추가. 실무 가치 높음. **문서 역업데이트 필요**.

### C-3. Survey / Assignment / Consultation 데이터 모델

`src/domain/entities/{Survey,Assignment,Consultation}.ts` 3개 도메인 entity 모두 존재.
- **PRD/SPEC**: 매치 0건
- **결론**: PRD에 정의되지 않은 도메인 모델 3개 (P0 — PRD 누락 영역)

### C-4. Settings 스키마 — `classes` 필드

**SPEC:776-784**:
```ts
classes: Array<{
  id: string;
  name: string;
  type: 'homeroom' | 'subject';
  students: Student[];
}>;
```

**구현 `domain/entities/Settings.ts:265`**: `readonly className: string;` (단일 문자열). `classes` 배열 없음.
별도 도메인: `domain/entities/TeachingClass.ts` (수업반 분리 저장).

| 항목 | SPEC | 구현 | 갭 |
|------|------|------|-----|
| 다중 학급 관리 | Settings.classes[] 통합 | TeachingClass 별도 entity + store | 구조 차이, 기능은 가능하나 SPEC 미반영 |
| 학급 type 구분 | 'homeroom' \| 'subject' | TeachingClass.subject 필드 (string)로 우회 | 명시적 type 없음 |

---

## D. PRD에 없는데 구현된 기능

### D-1. 6개 탭 중 PRD 5.7 외 영역

| 탭 | PRD 언급 | SPEC 언급 | 추정 P |
|----|:--------:|:---------:|:------:|
| `roster` 명렬 관리 (RosterManagementTab 1103) | ❌ (PRD 5.7은 좌석배치 학생 데이터 연동 → 좌석배치에서 학생관리) | ❌ | P1 — 별도 기능, 학생 CRUD 본거지 |
| `records` 기록 (1299줄 InputMode) | ✅ 5.7 본문 | ✅ 4.10 | — |
| `survey` 설문/체크리스트 (387) | ❌ | ❌ | P0 — 신규 도메인 |
| `assignment` 과제 수합 (313) | ❌ | ❌ | P0 — 신규 도메인 |
| `consultation` 상담 예약 (330+1431+802) | ❌ | ❌ | P0 — 가장 큰 신규 영역 |
| `seating` 자리배치 임베드 | △ (좌석배치는 PRD 4.3에 있음) | △ | P2 — 임베드 자체는 PRD에 없음 |

### D-2. 본문 추가 필드/기능

| 기능 | 구현 위치 | PRD/SPEC | P |
|------|----------|:---------:|:--:|
| 출결 교시별 세부 (`AttendancePeriodEntry`) | `StudentRecord.ts:11-16` | ❌ | P0 |
| NEIS 보고 추적 (`reportedToNeis`) | `StudentRecord.ts:30` + `ActionDashboard.tsx:34-40` | ❌ | P0 |
| 서류 제출 추적 (`documentSubmitted`) | `StudentRecord.ts:31` | ❌ | P0 |
| Follow-up 추적 (`followUp/Date/Done`) | `StudentRecord.ts:27-29` | ❌ | P0 |
| 상담 방식 (`CounselingMethod` 6종) | `StudentRecord.ts:4` | ❌ | P1 |
| `DefaultTemplates` 4종 | `valueObjects/DefaultTemplates.ts` | ❌ | P1 |
| `ActionDashboard` 미처리 추적 | `ActionDashboard.tsx (260)` | ❌ | P1 |
| `StudentJumpList` 빠른 이동 | `StudentJumpList.tsx (103)` | ❌ | P2 |
| 학생 재적 상태 7종 (`StudentStatus`) | `Student.ts:2-9` | ❌ | P1 |
| 보호자 2명 + 라벨 | `Student.ts:43-51` | ❌ | P2 |
| 날짜 범위 일괄 등록 | `InputMode.tsx:96-100` | ❌ | P2 |
| 출결부 양방향 동기화 (`bridgeHomeroomDayAttendance`) | `useStudentRecordsStore.ts:131,332` | ❌ | P0 |

→ **PRD 문서가 한참 뒤처져 있음**.

---

## E. PRD에 있는데 구현 누락 / 부분 구현

### [P0] FR-STMEMO-10: 수업 반 선택 탭

- **PRD 인용** (PRD:284): `[담임] [1-1] [1-2] [1-3]...` 식 학급 탭바 + (PRD:286) `"담임 탭에서는 담임반 학생 전체, 다른 탭은 해당 수업반 학생"`
- **구현 위치**: `HomeroomPage.tsx:30-46` — 6개 **기능 탭**(roster/records/survey/assignment/consultation/seating)만 존재. **학급 탭바 자체가 없음**.
- **충족도**: ❌
- **갭 상세**:
  - HomeroomPage `RecordsTab`이 항상 담임반(`useStudentStore`) 학생만 보여줌
  - 수업반 학생/기록은 별도 페이지 `src/adapters/components/ClassManagement/` (20개 파일)로 분리 — PRD 의도(한 페이지 내 학급 전환)와 다름
  - `useTeachingClassStore`는 InputMode에서 **출결부 동기화 용도**로만 사용
- **수정안**:
  - 단기(P0): HomeroomPage 상단에 `[담임] [학급1] [학급2]...` 탭 추가
  - 중기: PRD 갱신 — "수업반 관리는 별도 ClassManagement 메뉴" 명시 또는 통합 마이그레이션
  - 장기: SPEC:778 `Settings.classes[]` 통합 모델로 정합성 회복

### [P3] PRD:298 "보건" → 코드 "건강" 명칭 미세 차이

---

## F. 디자인 레퍼런스 (`design examples/ssampin_homeroom_memo_page/code.html`) 갭

| 디자인 요소 | 구현 | 충족도 | 갭 |
|--------------|------|:------:|----|
| 헤더 모드 토글 [입력][진도][조회] | `RecordsTab.tsx:73-86` MODE_TABS — `input/progress/search` 3개 (label "입력/통계/조회") | ⚠️ | "진도" → "통계"로 라벨 변경 (의도적) |
| 학급 탭바 [담임][1-1]…[1-5] | **없음** | ❌ | E-1 항목과 동일 — P0 |
| 좌측 학생 그리드 (5열, aspect-[4/3], 다중 선택) | `Records/StudentGrid.tsx (175)` | ✅ | 충족 |
| "(N명 선택됨)" + "모두 해제" | `InputMode.tsx`에 selectedStudents 카운트 + 해제 액션 | ✅ | 충족 |
| 카테고리 4그룹 칩 (출결/상담/생활/기타) | `RecordCategory.ts:22-47` 4그룹 + `getSubcategoryChipClass` | ✅ | 충족 |
| 출결 칩: 생리결석/병결/무단결석/지각/조퇴/결과 | 디자인 6종 vs 코드 `ATTENDANCE_TYPES = [결석,지각,조퇴,결과]` 4종 + reasons 2단계 | ⚠️ | 디자인은 1단(6종 평면), 구현은 2단계(타입×사유) |
| 메모 textarea | `InputMode.tsx` content textarea | ✅ | 충족 |
| 저장하기 버튼 | `InputMode.tsx` 저장 액션 | ✅ | 충족 |
| 헤더 제목 "👩‍🏫 담임 메모장" | `HomeroomPage.tsx:34` "담임 업무" + `school` Material icon | ⚠️ | 명칭이 "담임 메모장" → "담임 업무"로 확장 |

---

## G. 위젯 vs 본 페이지 정합성

- **사용자 프롬프트의 "1959줄 위젯" 주장은 사실과 다름**. 실제:
  - `src/widgets/items/StudentRecords.tsx`: **4줄 re-export 만**
  - `src/adapters/components/Dashboard/DashboardStudentRecords.tsx`: 약 269줄
- **PRD:333 충족**: `DashboardStudentRecords.tsx:32 MAX_PREVIEW = 3` 최근 3건 미리보기 + 카테고리 탭 + `expanded` 토글
- **DashboardStudentRecords와 본 페이지 역할 분리**: 위젯은 **읽기 전용 미리보기**, 본 페이지는 **CRUD + 통계 + 내보내기**. 적절히 분리됨. **풀-페이지 복제 아님 ✅**.
- **부수 갭**: 위젯도 `students` 기반 담임반만 표시 — FR-STMEMO-10 미충족이 위젯에도 동일 영향

---

## H. v2.0.0 신규 기능 통합 (메모리 참조)

| 기능 | 담임 업무 진입점 | 평가 |
|------|------------------|------|
| 실시간 담벼락 | 진입점 없음 — 담벼락은 별도 메뉴 | ⚠️ 정책: 담임 업무에 담벼락 임베드 안 함. PRD 5.7 정책상 정상 |
| Quick Add | `QuickAdd*Form.tsx` 5종(todo/event/memo/note/bookmark). **학생 기록용 form 없음** | ⚠️ **P1 갭**. Ctrl+Alt+? 단축키로 "오늘 ○○○ 학생 ○○ 기록" 빠른 추가 시나리오 미지원 |
| CommandPalette (Ctrl+K) | `commandRegistry.ts` 등록 — 페이지 이동·도구 실행 위주 | ⚠️ 학생 기록 add 명령 미등록 |

---

## I. 자리뽑기 학생 노출 금지 정책 (메모리)

- **메모리 정책 원문**: `자리뽑기 setup/picking/complete 어디에도 학생 존재 암시 금지` (2026-04-21)
- **검증 범위**: `자리뽑기 = ToolSeatPicker.tsx` (Tools 메뉴, **담임 업무 페이지 외부**)
- **담임 업무의 `seating` 탭**: `HomeroomPage.tsx:43 <Seating embedded />` — 이는 **자리뽑기가 아니라 좌석배치(seating) 임베드**. 학생 노출은 정상 의도이며 정책 적용 대상 아님
- **충족도**: ✅ 정책 위반 없음

---

## Match Rate 산정

### FR-STMEMO 가중 평균 (10개)
- 만점(✅): 8개 = 8.0
- 부분(⚠️=0.5): 1개 = 0.5
- 미충족(❌): 1개 = 0
- **합계: 8.5 / 10 = 85%**

### 메모리 기준 (90% 합격선)
- **85% < 90% → 합격선 아래**. 주된 원인: FR-STMEMO-10 학급 탭 부재 (P0) + FR-STMEMO-04 데이터 모델 단수화 SPEC 불일치

### 종합 점수

| 카테고리 | 점수 |
|----------|:----:|
| FR 충족 (PRD 기준) | 85% |
| 디자인 일치 (design examples) | 90% (학급 탭 부재 외 거의 일치) |
| SPEC 데이터 모델 일치 | 60% (StudentRecord 모델 ~50% 변경, Settings.classes 미반영, Survey/Assignment/Consultation 도메인 신설은 SPEC 외) |
| 아키텍처 (Clean Architecture 준수) | 95% (Store 책임 누수 1건) |
| **종합** | **~80%** |

---

## Top 10 갭 우선순위

| # | P | 항목 | 영향 | 위치 |
|---|:-:|------|------|------|
| 1 | P0 | **FR-STMEMO-10 수업 반 선택 탭 부재** | 담임 외 수업반 관리 분리, PRD 핵심 시나리오 미지원 | `HomeroomPage.tsx:30-46` 탭바 없음 |
| 2 | P0 | **PRD/SPEC에 Survey/Assignment/Consultation 도메인 미정의** | 6탭 중 3탭(2700+ 줄)이 미문서화 영역 | `domain/entities/{Survey,Assignment,Consultation}.ts` |
| 3 | P0 | **NEIS·Document·FollowUp·AttendancePeriods 추적 필드 PRD 미반영** | 핵심 실무 기능이 문서에 없음 | `StudentRecord.ts:27-33` |
| 4 | P0 | **Store 비즈니스 로직 누수** (`bridgeHomeroomDayAttendance` `updateAttendanceRecord` `RECORD_COLOR_MAP`) | Clean Arch 위반 | `useStudentRecordsStore.ts:15,131,332,394` |
| 5 | P1 | **StudentRecord.studentIds: number[] (SPEC) ↔ studentId: string (구현) 불일치** | SPEC 데이터 모델 1대N→1대1 변경 | `StudentRecord.ts:20` vs `SPEC.md:762` |
| 6 | P1 | **상벌점 v2.0 (PRD:319) 미구현** | v2.0.0 릴리즈됐으나 PRD v2.0 기능 미구현 | 코드 0매치 |
| 7 | P1 | **Settings.classes[] 미반영, 단일 className 유지** | SPEC:778 다중 학급 통합 모델 미구현 | `Settings.ts:265` |
| 8 | P1 | **Quick Add에 학생 기록 form 없음** | v2.0.0 시그니처 기능 활용 누락 | `common/QuickAdd/*` 5종 form만 |
| 9 | P2 | **PRD "보건" ↔ 코드 "건강" 표기 불일치** | 사소 — 1줄 수정 | `RecordCategory.ts:39` |
| 10 | P2 | **HomeroomPage 라우트 중복** (`'homeroom'` + `'student-records'` 둘 다 매핑) | 마이그레이션 잔재 | `App.tsx:166-171` |
