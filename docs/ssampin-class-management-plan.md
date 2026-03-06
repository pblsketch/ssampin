# 수업 관리 (학급 명렬표 + 진도체크) 기능 계획서

> **작성일**: 2026-07-09
> **대상 버전**: v0.4.x
> **피드백 출처**: 준일님 — "'수업 관리' 창을 따로 만들어서 수업 학급 명렬표와 진도체크를 함께 관리"

---

## 1. 개요

### 1.1 문제 정의

현재 쌤핀은 **담임 학급(1개)** 만 관리한다.
`useStudentStore`에 담임 반 학생 35명이 있고, 시간표에는 교사가 여러 학급(2-1, 2-2, 2-3 등)에서 수업하는 정보가 있지만, **수업 학급별 학생 명렬표**와 **진도 관리** 기능은 없다.

교과 교사(담임이 아닌 경우 포함)가 수업하는 학급별로:
- 학생 명렬표를 관리하고
- 수업 진도(날짜별 단원/차시)를 체크하고
- 간단한 출석을 확인하려는 니즈가 있다.

### 1.2 현재 상태

| 항목 | 상태 |
|------|------|
| 담임 학급 | `useStudentStore` — 학생 목록 (id, name, studentNumber, phone, parentPhone, isVacant) |
| 시간표 | `TeacherScheduleData` — 요일×교시→ `{ subject, classroom }` |
| 사이드바 | dashboard/timetable/seating/schedule/student-records/meal/memo/todo/tools/export |
| `ClassRoster` (기존) | `{ id, name, studentNames[], createdAt, updatedAt }` — 룰렛/뽑기용 간단 명부 |
| `useClassRosterStore` | CRUD 스토어 — DI 컨테이너를 거치지 않고 직접 localStorage/electronAPI 호출 |

### 1.3 핵심 원칙

1. **독립 페이지** — 사이드바에 "수업 관리" 메뉴 추가 (기존 메뉴와 동등)
2. **Clean Architecture** — domain 엔티티 + usecases + repository 패턴 준수
3. **담임 학급과 분리** — 수업 학급 명렬표는 `useStudentStore`와 별개
4. **시간표 연동 가능** — 교사 시간표의 학급(classroom)과 매핑 가능하면 좋음 (필수 아님)
5. **가벼운 UX** — 담임 반 관리보다 간소화 (번호+이름만, 상세 기록 불필요)

---

## 2. 기능 상세

### 2.1 데이터 모델

#### 수업 학급 (TeachingClass)

```typescript
// domain/entities/TeachingClass.ts

export interface TeachingClassStudent {
  readonly number: number;   // 번호
  readonly name: string;     // 이름
}

export interface TeachingClass {
  readonly id: string;
  readonly name: string;                          // "2-1", "2-3" 등
  readonly subject: string;                       // 과목명
  readonly students: readonly TeachingClassStudent[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TeachingClassesData {
  readonly classes: readonly TeachingClass[];
}
```

#### 진도 체크 (CurriculumProgress)

```typescript
// domain/entities/CurriculumProgress.ts

export type ProgressStatus = 'planned' | 'completed' | 'skipped';

export interface ProgressEntry {
  readonly id: string;
  readonly classId: string;         // TeachingClass.id
  readonly date: string;            // ISO 8601 (YYYY-MM-DD)
  readonly period: number;          // 교시 (1~7)
  readonly unit: string;            // 단원명
  readonly lesson: string;          // 차시/주제
  readonly status: ProgressStatus;  // 진행 상태
  readonly note: string;            // 비고
}

export interface CurriculumProgressData {
  readonly entries: readonly ProgressEntry[];
}
```

#### 출석 체크 (간단 출석)

```typescript
// domain/entities/Attendance.ts

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

export interface AttendanceRecord {
  readonly classId: string;
  readonly date: string;            // YYYY-MM-DD
  readonly period: number;
  readonly students: readonly {
    readonly number: number;        // 학생 번호
    readonly status: AttendanceStatus;
  }[];
}

export interface AttendanceData {
  readonly records: readonly AttendanceRecord[];
}
```

### 2.2 저장소 인터페이스

```typescript
// domain/repositories/ITeachingClassRepository.ts

export interface ITeachingClassRepository {
  getClasses(): Promise<TeachingClassesData | null>;
  saveClasses(data: TeachingClassesData): Promise<void>;
  getProgress(): Promise<CurriculumProgressData | null>;
  saveProgress(data: CurriculumProgressData): Promise<void>;
  getAttendance(): Promise<AttendanceData | null>;
  saveAttendance(data: AttendanceData): Promise<void>;
}
```

### 2.3 UI/UX 설계

#### 사이드바 메뉴 추가

```
기존 메뉴:
├── 대시보드
├── 시간표
├── 학급 자리 배치
├── 일정
├── 담임메모
├── 급식
├── 메모
├── 할 일
├── 수업 관리         ← ⭐ 신규 (아이콘: menu_book)
├── 쌤도구
└── 내보내기
```

> 위치: "할 일"과 "쌤도구" 사이. 교과 교사 기능이므로 학급 관련 메뉴 그룹 하단.

#### 메인 레이아웃: 3단 구조

```
┌─────────────────────────────────────────────────────┐
│  📚 수업 관리                        [+ 학급 추가]  │
├──────────┬──────────────────────────────────────────┤
│          │                                          │
│  학급    │  [명렬표]  [진도 관리]  [출석]            │
│  목록    │  ─────────────────────────────────────── │
│          │                                          │
│  ▶ 2-1  │  (탭 내용)                                │
│    2-2   │                                          │
│    2-3   │                                          │
│    2-4   │                                          │
│    2-5   │                                          │
│          │                                          │
│  [설정]  │                                          │
│          │                                          │
└──────────┴──────────────────────────────────────────┘
```

#### 탭 1: 명렬표

```
┌──────────────────────────────────────────────────┐
│  📋 2-1 명렬표                    [편집] [엑셀]   │
├──────────────────────────────────────────────────┤
│  번호   이름                                      │
│  ─────────────                                    │
│  1      김민지                                    │
│  2      이서연                                    │
│  3      박지민                                    │
│  ...                                              │
│  30     서동현                                    │
│                                                  │
│  총 30명                                          │
└──────────────────────────────────────────────────┘
```

- 편집 모드: 번호+이름 직접 편집, 행 추가/삭제
- 엑셀에서 붙여넣기: "번호\t이름" 형식 붙여넣기 지원
- 학생 수 표시

#### 탭 2: 진도 관리

```
┌──────────────────────────────────────────────────┐
│  📊 2-1 진도 관리                 [+ 항목 추가]   │
├──────────────────────────────────────────────────┤
│  날짜        교시   단원          차시    상태     │
│  ──────────────────────────────────────────────  │
│  07/09(수)   3     1. 함수      1/4    ✅ 완료  │
│  07/08(화)   3     1. 함수      1/4    ✅ 완료  │
│  07/07(월)   3     —            —      ⏭️ 건너뜀 │
│  07/04(금)   3     서론         —      ✅ 완료  │
│                                                  │
│  진도율: 4/20 차시 (20%)  █████░░░░░░░░░░░░░░░  │
└──────────────────────────────────────────────────┘
```

- 날짜 + 교시: 시간표에서 해당 학급 수업 교시 자동 채움 (가능하면)
- 단원 + 차시: 자유 텍스트 입력
- 상태: planned(예정) / completed(완료) / skipped(건너뜀)
- 진도율 바: 완료된 항목 / 전체 항목

#### 탭 3: 출석 (간단)

```
┌──────────────────────────────────────────────────┐
│  📝 2-1 출석 체크        [날짜: 07/09]  [교시: 3] │
├──────────────────────────────────────────────────┤
│  번호  이름     출석                              │
│  ───────────────────                              │
│  1     김민지   ✅                                │
│  2     이서연   ✅                                │
│  3     박지민   ❌ 결석                           │
│  4     최예은   ⏰ 지각                           │
│  ...                                              │
│                                                  │
│  출석 28 / 결석 1 / 지각 1 / 사유결 0             │
│                                        [💾 저장]  │
└──────────────────────────────────────────────────┘
```

- 기본값: 전원 출석 (✅)
- 클릭으로 토글: 출석 → 결석 → 지각 → 사유결석 → 출석
- 날짜 + 교시 선택
- 이전 출석 기록 조회 가능

### 2.4 시간표 연동

`TeacherScheduleData`에서 학급 목록 추출:

```typescript
// 교사 시간표에서 고유 학급(classroom) 목록 추출
function extractClassrooms(schedule: TeacherScheduleData): string[] {
  const classrooms = new Set<string>();
  for (const periods of Object.values(schedule)) {
    for (const period of periods) {
      if (period?.classroom) classrooms.add(period.classroom);
    }
  }
  return Array.from(classrooms).sort();
}
```

- 학급 추가 시 시간표의 학급명 자동 제안
- 진도 항목 추가 시 해당 학급의 수업 요일/교시 자동 채움

---

## 3. 구현 단계

### Phase 1: 도메인 + 인프라 (데이터 골격)

1. `domain/entities/TeachingClass.ts` — 엔티티 타입
2. `domain/entities/CurriculumProgress.ts` — 진도 엔티티
3. `domain/entities/Attendance.ts` — 출석 엔티티
4. `domain/repositories/ITeachingClassRepository.ts` — 포트
5. `adapters/repositories/JsonTeachingClassRepository.ts` — JSON 저장소
6. `usecases/classManagement/ManageTeachingClasses.ts` — CRUD 유스케이스
7. `usecases/classManagement/ManageCurriculumProgress.ts` — 진도 유스케이스
8. `usecases/classManagement/ManageAttendance.ts` — 출석 유스케이스
9. `adapters/stores/useTeachingClassStore.ts` — Zustand 스토어
10. `adapters/di/container.ts` — DI 등록

### Phase 2: UI — 학급 목록 + 명렬표

1. `adapters/components/ClassManagement/ClassManagementPage.tsx` — 메인 페이지
2. `adapters/components/ClassManagement/ClassList.tsx` — 좌측 학급 목록
3. `adapters/components/ClassManagement/ClassRosterTab.tsx` — 명렬표 탭
4. `adapters/components/ClassManagement/AddClassModal.tsx` — 학급 추가 모달
5. 사이드바(`Sidebar.tsx`) + `App.tsx` — 메뉴 + 라우팅 추가

### Phase 3: UI — 진도 관리

1. `adapters/components/ClassManagement/ProgressTab.tsx` — 진도 관리 탭
2. `adapters/components/ClassManagement/ProgressEntryRow.tsx` — 진도 항목 행

### Phase 4: UI — 출석 체크

1. `adapters/components/ClassManagement/AttendanceTab.tsx` — 출석 체크 탭

---

## 4. 파일 변경 목록

### 신규 파일 (14개)

| 파일 | 레이어 | 설명 |
|------|--------|------|
| `src/domain/entities/TeachingClass.ts` | domain | 수업 학급 엔티티 |
| `src/domain/entities/CurriculumProgress.ts` | domain | 진도 체크 엔티티 |
| `src/domain/entities/Attendance.ts` | domain | 출석 엔티티 |
| `src/domain/repositories/ITeachingClassRepository.ts` | domain | 저장소 포트 |
| `src/usecases/classManagement/ManageTeachingClasses.ts` | usecases | 학급 CRUD |
| `src/usecases/classManagement/ManageCurriculumProgress.ts` | usecases | 진도 CRUD |
| `src/usecases/classManagement/ManageAttendance.ts` | usecases | 출석 CRUD |
| `src/adapters/repositories/JsonTeachingClassRepository.ts` | adapters | JSON 저장소 구현 |
| `src/adapters/stores/useTeachingClassStore.ts` | adapters | Zustand 스토어 |
| `src/adapters/components/ClassManagement/ClassManagementPage.tsx` | adapters | 메인 페이지 |
| `src/adapters/components/ClassManagement/ClassList.tsx` | adapters | 학급 목록 |
| `src/adapters/components/ClassManagement/ClassRosterTab.tsx` | adapters | 명렬표 탭 |
| `src/adapters/components/ClassManagement/ProgressTab.tsx` | adapters | 진도 관리 탭 |
| `src/adapters/components/ClassManagement/AttendanceTab.tsx` | adapters | 출석 체크 탭 |

### 수정 파일 (4개)

| 파일 | 변경 내용 |
|------|-----------|
| `src/domain/entities/index.ts` | 새 엔티티 re-export |
| `src/adapters/di/container.ts` | teachingClassRepository DI 등록 |
| `src/adapters/components/Layout/Sidebar.tsx` | "수업 관리" 메뉴 추가 (PageId + NAV_ITEMS) |
| `src/App.tsx` | class-management 라우팅 추가 |

---

## 5. 테스트 시나리오

| # | 시나리오 | 예상 결과 |
|---|---------|-----------|
| 1 | 수업 관리 페이지 진입 | 빈 상태 안내 + "학급 추가" 버튼 |
| 2 | 학급 추가 (이름: 2-1, 과목: 수학) | 좌측 목록에 2-1 표시 |
| 3 | 학생 명렬표 입력 (번호+이름 30명) | 테이블로 표시 |
| 4 | 엑셀에서 붙여넣기 (탭 구분) | 자동 파싱하여 명렬표 채움 |
| 5 | 진도 항목 추가 | 날짜/교시/단원/차시 입력 → 목록에 표시 |
| 6 | 진도 상태 변경 (완료→건너뜀) | 상태 업데이트 + 진도율 변경 |
| 7 | 출석 체크 (전원 출석 → 2명 결석) | 출석 통계 업데이트 |
| 8 | 학급 삭제 | 확인 모달 → 학급+진도+출석 전체 삭제 |
| 9 | 학급 5개 추가 → 전환 | 좌측 목록에서 클릭으로 학급 전환 |
| 10 | 앱 재시작 후 데이터 유지 | 저장된 데이터 정상 로드 |
| 11 | 시간표에 2-1 수업 있을 때 학급 추가 | 학급명 자동 제안 |
| 12 | 사이드바에서 수업 관리 메뉴 클릭 | 페이지 정상 이동 |

---

## 6. 리스크 및 대안

| 리스크 | 대안 |
|--------|------|
| 학급 수가 많아질 때 성능 | JSON 파일 분리 (teaching-classes.json, progress.json, attendance.json) |
| 기존 ClassRoster와 중복 | ClassRoster는 뽑기/룰렛 도구용으로 유지, TeachingClass는 수업 관리 전용 |
| 시간표 연동 복잡도 | Phase 1에서는 수동 입력, Phase 2에서 시간표 연동 (선택적) |
| PIN 보호 필요성 | 출석/성적 정보 민감 → PIN 보호 대상에 추가 가능 (후속 작업) |

---

## 부록: 데이터 저장 구조

```
data/
├── teaching-classes.json    ← 학급 목록 + 학생 명렬표
├── curriculum-progress.json ← 진도 체크 데이터
├── attendance.json          ← 출석 데이터
└── ...
```

### teaching-classes.json 예시

```json
{
  "classes": [
    {
      "id": "cls-001",
      "name": "2-1",
      "subject": "수학",
      "students": [
        { "number": 1, "name": "김민지" },
        { "number": 2, "name": "이서연" }
      ],
      "createdAt": "2026-07-09T00:00:00.000Z",
      "updatedAt": "2026-07-09T00:00:00.000Z"
    }
  ]
}
```
