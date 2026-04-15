# 수업 관리 UX 개선 — 구현 설계서

**작성일**: 2026-04-15 | **버전**: 1.0
**대상 버전**: 1.9.8 → 2.0.0
**결정된 공백**:
- 출결 저장: **(a) groupId 필드 추가 + fallback**
- 그룹 라이프사이클: **자동 정리 (마지막 과목 삭제 시 자연 소멸)**

---

## 0. 결정 요약

| 항목 | 결정 |
|------|------|
| groupId 도입 범위 | TeachingClass, AttendanceRecord |
| 명렬 공유 | groupId 그룹 내 강제 동기화 |
| 좌석 공유 | groupId 그룹 내 강제 동기화 (MVP — 토글은 v2) |
| 출결 저장 | groupId 우선, classId fallback |
| 진도/설문/과제 | 과목별 독립 (현행 유지) |
| 위자드 진입 조건 | `schoolLevel ∈ {elementary, custom}` |
| 전담 교사 기본값 | 체크 해제 + 직접 선택 유도 |
| Phase 1 범위 | classSchedule 폴백만 (명렬 복사는 Phase 2로 연기) |
| 그룹 이탈/병합 UX | v2 이후 |

---

## 1. 데이터 모델 변경

### 1.1 TeachingClass (src/domain/entities/TeachingClass.ts)

```diff
 export interface TeachingClass {
   readonly id: string;
   readonly name: string;
   readonly subject: string;
+  /** 담임 학급 그룹 식별자. 같은 groupId = 같은 교실의 여러 과목 */
+  readonly groupId?: string;
   readonly students: readonly TeachingClassStudent[];
   readonly seating?: TeachingClassSeating;
   readonly order?: number;
   readonly createdAt: string;
   readonly updatedAt: string;
 }
```

### 1.2 AttendanceRecord (src/domain/entities/Attendance.ts)

```diff
 export interface AttendanceRecord {
   readonly classId: string;
+  /** 그룹 출결: 이 값이 있으면 groupId 기준 조회 우선 */
+  readonly groupId?: string;
   readonly date: string;
   readonly period: number;
   readonly students: readonly StudentAttendance[];
 }
```

**조회 규칙**:
```
getAttendanceRecord(classId, date, period):
  1. class = classes.find(c => c.id === classId)
  2. if class.groupId:
       r = records.find(r => r.groupId === class.groupId && r.date === date && r.period === period)
       if r: return r
  3. return records.find(r => r.classId === classId && r.date === date && r.period === period)
```

**저장 규칙**:
```
saveAttendanceRecord(record):
  cls = classes.find(c => c.id === record.classId)
  if cls.groupId:
    record.groupId = cls.groupId   // 자동 주입
  기존 저장 로직 (classId+groupId+date+period 동일키로 upsert)
```

**마이그레이션**: 기존 레코드는 `groupId === undefined` → 기존 동작 유지. 신규 그룹 출결만 groupId 기록.

---

## 2. 스토어 API 변경

### 2.1 useTeachingClassStore.ts

**기존 `addClass` 확장**:
```diff
- addClass: (name: string, subject: string, students: readonly TeachingClassStudent[]) => Promise<void>;
+ addClass: (name: string, subject: string, students: readonly TeachingClassStudent[], groupId?: string) => Promise<void>;
```

**신규 메서드 4개**:
```typescript
/** 여러 과목을 하나의 groupId로 묶어 일괄 생성. 초등 위자드 완료 시 호출 */
addClassGroup: (
  name: string,
  subjects: readonly string[],
  students: readonly TeachingClassStudent[],
) => Promise<{ groupId: string; firstClassId: string }>;

/** 그룹 내 모든 클래스의 students를 동일하게 덮어씀 */
syncGroupStudents: (groupId: string, students: readonly TeachingClassStudent[]) => Promise<void>;

/** 그룹 내 모든 클래스의 seating을 동일하게 덮어씀 */
syncGroupSeating: (groupId: string, seating: TeachingClassSeating) => Promise<void>;

/** 기존 그룹에 과목만 추가 (학생 명렬은 그룹에서 복사) */
addSubjectsToGroup: (groupId: string, subjects: readonly string[]) => Promise<void>;
```

**기존 메서드 동작 변경 (호출부 무변경, 내부만 동기화 추가)**:

- `updateClass(cls)` → cls.groupId가 있고 students/seating이 변경되면 `syncGroupStudents`/`syncGroupSeating` 자동 호출
- `deleteClass(id)` → 삭제 후 그룹 내 클래스가 0개면 해당 groupId의 attendance records 정리
- `initClassSeating`, `randomizeClassSeating`, `swapClassSeats`, `clearClassSeating`, `resizeClassGrid`, `toggleClassPairMode`, `toggleClassOddColumnMode` → 대상 클래스에 groupId가 있으면 그룹 전체에 적용
- `updateStudentStatus` → groupId 있으면 그룹 전체 전파
- `getAttendanceRecord`, `getDayAttendance`, `saveAttendanceRecord`, `saveDayAttendance` → 위 조회/저장 규칙 적용

**구현 패턴 (공통 헬퍼)**:
```typescript
function applyToGroup<T>(
  classes: readonly TeachingClass[],
  classId: string,
  updater: (cls: TeachingClass) => TeachingClass,
): TeachingClass[] {
  const target = classes.find((c) => c.id === classId);
  if (!target) return [...classes];
  if (!target.groupId) return classes.map((c) => (c.id === classId ? updater(c) : c));
  return classes.map((c) => (c.groupId === target.groupId ? updater(c) : c));
}
```

### 2.2 useSettingsStore.ts
변경 없음. `schoolLevel`, `teacherName` 기존 API 활용.

---

## 3. 컴포넌트 구조

```
src/adapters/components/ClassManagement/
├── ClassManagementPage.tsx       # 🔧 AddClassModal 분리, schoolLevel 분기
├── AddClassModal/
│   ├── index.tsx                 # 🆕 모달 셸 + schoolLevel 분기
│   ├── LegacyAddClassModal.tsx   # 🆕 기존 2탭 UI (중등 + Phase 1 폴백)
│   ├── ElementaryWizard.tsx      # 🆕 3단계 위자드 컨테이너
│   ├── StepClassInfo.tsx         # 🆕 Step 1: 학급명
│   ├── StepSubjectSelect.tsx     # 🆕 Step 2: 과목 선택
│   ├── StepStudentRoster.tsx     # 🆕 Step 3: 학생 명렬
│   └── AddSubjectsToGroup.tsx    # 🆕 기존 그룹에 과목 추가 플로우
├── ClassRosterTab.tsx            # 🔧 groupId 있으면 syncGroupStudents 호출
└── ClassSeatingTab.tsx           # 🔧 groupId 있으면 syncGroupSeating 호출
```

### 3.1 AddClassModal/index.tsx (분기 로직)

```typescript
export function AddClassModal({ onClose }: { onClose: () => void }) {
  const schoolLevel = useSettingsStore((s) => s.settings.schoolLevel);
  const existingGroups = useTeachingClassStore((s) =>
    s.classes.filter((c) => c.groupId).map((c) => c.groupId!)
  );
  const hasExistingGroup = new Set(existingGroups).size > 0;

  const useWizard = schoolLevel === 'elementary' || schoolLevel === 'custom';

  const [mode, setMode] = useState<'new' | 'addToGroup'>(
    hasExistingGroup && useWizard ? 'new' : 'new'
  );

  if (useWizard) {
    if (hasExistingGroup && mode === 'addToGroup') {
      return <AddSubjectsToGroup onClose={onClose} onSwitchNew={() => setMode('new')} />;
    }
    return (
      <ElementaryWizard
        onClose={onClose}
        showSwitchToAddGroup={hasExistingGroup}
        onSwitchAddGroup={() => setMode('addToGroup')}
      />
    );
  }
  return <LegacyAddClassModal onClose={onClose} />;
}
```

### 3.2 StepSubjectSelect.tsx — 과목 추출 + 전담 판별

```typescript
// classSchedule 우선, 없으면 teacherSchedule 폴백
const { classSchedule, teacherSchedule } = useScheduleStore();
const teacherName = useSettingsStore((s) => s.settings.teacherName);

const extractedSubjects = useMemo(() => {
  const source = isNonEmpty(classSchedule) ? classSchedule : teacherSchedule;
  if (!source) return [];

  const map = new Map<string, {
    subject: string;
    weeklyPeriods: number;
    teachers: Set<string>;
    isSpecialist: boolean;
  }>();

  const days = ['월', '화', '수', '목', '금'];
  for (const day of days) {
    const periods = source[day];
    if (!periods) continue;
    periods.forEach((slot) => {
      if (!slot?.subject) return;
      const entry = map.get(slot.subject) ?? {
        subject: slot.subject,
        weeklyPeriods: 0,
        teachers: new Set<string>(),
        isSpecialist: false,
      };
      entry.weeklyPeriods++;
      if ('teacher' in slot && slot.teacher) entry.teachers.add(slot.teacher);
      map.set(slot.subject, entry);
    });
  }

  // 전담 판별: teacherName 있을 때만. teacherName이 없으면 isSpecialist=false 유지
  if (teacherName) {
    map.forEach((entry) => {
      if (entry.teachers.size === 0) return;
      entry.isSpecialist = !entry.teachers.has(teacherName);
    });
  }
  return [...map.values()];
}, [classSchedule, teacherSchedule, teacherName]);

// 기본 선택: 전담이 아닌 과목만. teacherName 미설정 시 전부 해제.
const defaultSelected = useMemo(() => {
  if (!teacherName) return new Set<string>();
  return new Set(extractedSubjects.filter((s) => !s.isSpecialist).map((s) => s.subject));
}, [extractedSubjects, teacherName]);
```

**빈 상태 폴백 칩**:
```typescript
const FALLBACK_SUBJECTS = ['국어','수학','사회','과학','영어','도덕','체육','음악','미술','실과','창의적 체험활동'];
```

### 3.3 StepStudentRoster.tsx — 3가지 입력 모드

- **번호순**: 30칸 빈 입력란, `status !== 'active'`인 학생은 `isVacant: true`로 저장 가능
- **붙여넣기**: 정규식으로 `^\s*(\d+)?\s*(.+)$` 파싱
- **나중에**: `students: []` 전달 → roster 탭에서 추후 추가

완료 시 `addClassGroup(className, selectedSubjects, students)` 호출.

### 3.4 LegacyAddClassModal.tsx (Phase 1 핵심)

기존 `ClassManagementPage.tsx`의 인라인 모달을 추출 + **classSchedule 폴백만 추가**:

```diff
- const { teacherSchedule } = useScheduleStore();
+ const { teacherSchedule, classSchedule } = useScheduleStore();
+ const usedFallback = !isNonEmpty(teacherSchedule) && isNonEmpty(classSchedule);
+ const source = usedFallback ? classSchedule : teacherSchedule;

- if (!teacherSchedule) return [];
+ if (!source) return [];
  const days = ['월','화','수','목','금','토'];
  for (const day of days) {
-   const periods = teacherSchedule[day];
+   const periods = source[day];
```

- classSchedule의 `ClassPeriod`는 `classroom` 필드가 없으므로 학급명은 settings의 기본 학급명 또는 사용자 입력으로 대체
- 폴백 사용 시 배너: "교사 시간표가 비어있어 학급 시간표에서 불러왔습니다"

---

## 4. Tab 연동 변경

### 4.1 ClassRosterTab.tsx

`updateClass`로 students 저장할 때 groupId 있으면 그룹 전체 동기화.
→ store의 `updateClass`에서 자동 처리하므로 **컴포넌트 코드 무변경**.

UI에 배지 추가: "이 학급은 `<학급명>` 그룹에 속합니다. 변경사항은 <N>개 과목에 공유됩니다."

### 4.2 ClassSeatingTab.tsx

위와 동일. store 레벨에서 처리되므로 UI만 배지 표시.

### 4.3 AttendanceTab.tsx

`saveAttendanceRecord`, `getAttendanceRecord` store 내부 로직이 groupId 처리.
→ **컴포넌트 코드 무변경**. 그룹 출결임을 표시하는 라벨만 추가:
"조회 출결은 이 학급의 모든 과목에 공유됩니다."

### 4.4 ProgressTab, ClassSurveyTab, ClassAssignmentTab
**변경 없음**. 이 데이터들은 classId 기준으로 계속 독립 관리.

---

## 5. 구현 Phase

### Phase 1 — classSchedule 폴백 (즉시, ~1일)

**범위**:
- `AddClassModal` 분리 + `LegacyAddClassModal` 추출
- `classSchedule` 폴백 로직
- 폴백 사용 시 안내 배너

**영향 파일**:
- `src/adapters/components/ClassManagement/ClassManagementPage.tsx` (모달 분리만)
- `src/adapters/components/ClassManagement/AddClassModal/index.tsx` (신규)
- `src/adapters/components/ClassManagement/AddClassModal/LegacyAddClassModal.tsx` (신규)

**검증**: 초등 교사가 "시간표에서 선택" 탭에서 학급 시간표 기반으로 (학급+과목) 조합을 볼 수 있음.

**금지 사항**: groupId 도입 없음. Phase 2와 충돌하는 명렬 복사 버튼 추가 없음.

### Phase 2 — groupId 핵심 (중기, ~3일)

**범위**:
- `TeachingClass.groupId`, `AttendanceRecord.groupId` 필드 추가
- 스토어 신규 메서드 4개 + 기존 메서드의 그룹 전파 로직
- `ElementaryWizard` 3단계 위자드 (Step 1~3)
- `schoolLevel` 분기 (elementary | custom → 위자드)

**영향 파일**:
- `src/domain/entities/TeachingClass.ts`
- `src/domain/entities/Attendance.ts`
- `src/adapters/stores/useTeachingClassStore.ts`
- `src/adapters/components/ClassManagement/AddClassModal/ElementaryWizard.tsx` (신규)
- `src/adapters/components/ClassManagement/AddClassModal/StepClassInfo.tsx` (신규)
- `src/adapters/components/ClassManagement/AddClassModal/StepSubjectSelect.tsx` (신규)
- `src/adapters/components/ClassManagement/AddClassModal/StepStudentRoster.tsx` (신규)
- `src/adapters/components/ClassManagement/ClassRosterTab.tsx` (배지만)
- `src/adapters/components/ClassManagement/ClassSeatingTab.tsx` (배지만)
- `src/adapters/components/ClassManagement/AttendanceTab.tsx` (안내만)

**검증 기준**:
- 초등 위자드 완료 시 선택한 과목 수만큼 TeachingClass 생성 + 동일 groupId
- 한 과목의 명렬 편집 → 전 과목에 반영
- 한 과목의 좌석 편집 → 전 과목에 반영
- 조회(period=0) 출결 저장 → 다른 과목에서 조회 시 동일 데이터 조회됨
- 중등(`schoolLevel=middle|high`) 사용자는 위자드 안 보임, 기존 UI 유지

### Phase 3 — 편의 기능 (후기, ~2일)

**범위**:
- 전담 교사 자동 구분 (teacherName 기반)
- "시간표에 없는 과목 추가" 입력란
- 빠른 추가 칩 (시간표 빈 경우)
- `AddSubjectsToGroup.tsx` — 기존 그룹에 과목만 추가

**영향 파일**: Step 2/3 세부 UI + `AddSubjectsToGroup.tsx` (신규)

**검증 기준**: 3.2절의 추출 로직이 `teacherName` 유무에 따라 올바르게 동작.

---

## 6. 엣지 케이스 처리표

| 케이스 | 처리 |
|--------|------|
| classSchedule·teacherSchedule 모두 빈 (초등) | Step 2에서 빠른 추가 칩 + 시간표 링크 |
| teacherName 미설정 | 전담 구분 불가 안내 + 전체 해제 시작 |
| 초등이지만 전담교사(교과 전담) | 중등 플로우로 폴백 가능하도록 위자드 안에 "중등 스타일로 전환" 링크 |
| 같은 학급명+과목 이미 존재 | Step 2 체크리스트에서 "이미 등록됨" 비활성 표시 |
| 과목 15개 초과 | 스크롤 + 상단 고정 선택 카운트 배지 |
| 그룹 내 마지막 과목 삭제 | 자연 소멸. 해당 groupId의 attendance records 정리 (deleteClass 내부에서 처리) |
| groupId 있는 클래스의 students 수동 편집 | store가 자동으로 그룹 전체 동기화 |
| AttendanceRecord에 groupId 없는 기존 데이터 | classId fallback으로 계속 조회 가능 (마이그레이션 불필요) |
| custom schoolLevel이 실제론 중등 | Step 1 하단 "중등 교과교사이신가요? 간단 모드" 링크로 Legacy로 전환 |
| 좌석에서 비활성 학생 studentKey | 기존 로직 그대로 유지 (updateStudentStatus에서 null 처리) |

---

## 7. 타입체크·테스트 체크리스트

**Phase 2 완료 시점 필수**:
- [ ] `npx tsc --noEmit` 에러 0개
- [ ] 기존 TeachingClass JSON 파일 로드 시 groupId 없어도 정상 동작
- [ ] 기존 AttendanceRecord JSON 파일 로드 시 groupId 없어도 정상 동작
- [ ] 중등 설정(`schoolLevel=middle`)으로 앱 실행 시 UI 변경 없음 확인
- [ ] 초등 설정으로 위자드 → 5과목 선택 → 28명 입력 → 5개 TeachingClass + 동일 groupId 확인
- [ ] 한 클래스 roster 편집 후 다른 4개 클래스에도 반영 확인
- [ ] 조회 출결(period=0) 저장 후 다른 과목에서 동일 조회 확인
- [ ] 1교시 출결(groupId 있지만 수업 중) 저장 시 classId 기준도 정상 조회 (과목별 수업 중 출결 수정 여지)
- [ ] 한 클래스 삭제 → 나머지 그룹 유지
- [ ] 그룹 마지막 클래스 삭제 → groupId 완전 소멸, 관련 attendance records 제거

---

## 8. 비고

- **좌석 공유 토글 없음 (MVP)**: 과목별 좌석 독립 니즈가 나오면 v2에서 `seatingMode: 'shared' | 'independent'` 필드 추가 검토.
- **그룹 이탈/병합 없음 (MVP)**: 학급 교체 등 특수 시나리오는 v2 이후 `AddSubjectsToGroup`과 유사한 별도 플로우로 처리.
- **마이그레이션 스크립트 불필요**: 기존 데이터는 groupId undefined로 남고 기존 동작 유지. 신규 생성분만 groupId 부여.

---

**설계 완료**. Phase 1부터 구현 착수 가능.
