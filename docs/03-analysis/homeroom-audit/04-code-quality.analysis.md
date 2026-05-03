# 담임 업무 페이지 코드 품질 분석 (04 — Code Quality Audit)

> 분석 시점: 2026-05-01 · 분석 대상: `src/adapters/components/Homeroom/**`, `src/widgets/items/StudentRecords.tsx`, `src/adapters/components/Dashboard/DashboardStudentRecords.tsx`, 도메인 use case (`src/usecases/studentRecords|assignment`), 5개 store (`useStudentRecordsStore`/`useStudentStore`/`useTeachingClassStore`/`useConsultationStore`/`useSurveyStore`/`useAssignmentStore`).
> 미션은 "수정 금지, 진단만". 모든 발견은 파일 경로:줄번호 + 코드 인용.

## 입력 메타 정정

미션 입력의 거대 컴포넌트 Top 1 `src/widgets/items/StudentRecords.tsx (1959)`는 실제 4줄짜리 re-export입니다.

```ts
// src/widgets/items/StudentRecords.tsx (총 4줄)
/**
 * 담임 메모장 위젯 — 기존 DashboardStudentRecords를 그대로 재사용
 */
export { DashboardStudentRecords as StudentRecords } from '@adapters/components/Dashboard/DashboardStudentRecords';
```

- 실 본체는 `src/adapters/components/Dashboard/DashboardStudentRecords.tsx` 269줄.
- 본 보고서는 269줄 본체 + 5줄 re-export 둘 다를 검사 대상으로 처리.
- "1959줄 위젯 = 본 페이지 거의 그대로 재구현" 가설은 **사실이 아니다** (위젯은 269줄 슬림 버전).

거대 컴포넌트 실제 라인 수(검증 완료):

| 파일 | 보고된 라인 | 실측 라인 |
| ---- | ---: | ---: |
| `widgets/items/StudentRecords.tsx` | 1959 | **4 (re-export)** |
| `Homeroom/Consultation/ConsultationCreateModal.tsx` | 1431 | 1431 |
| `Homeroom/Records/InputMode.tsx` | 1299 | 1299 |
| `Homeroom/RosterManagementTab.tsx` | 1103 | 1103 |
| `Homeroom/Consultation/ConsultationDetail.tsx` | 802 | 802 |
| `Homeroom/Records/ProgressMode.tsx` | 647 | 647 |
| `Homeroom/Records/SearchMode.tsx` | 627 | 627 |
| `Homeroom/Survey/SurveyStudentDetail.tsx` | 586 | 586 |
| `Homeroom/Survey/SurveyCreateModal.tsx` | 524 | 524 |
| `Homeroom/Survey/SurveyDetail.tsx` | 419 | 419 |

---

## A. TypeScript 안전성

### [P3] `any`/암묵적 any/`@ts-ignore` 위반 없음
- **위치**: 담임 업무 도메인 전체 (`Homeroom/**`, `widgets/items/StudentRecords.tsx`, 5개 store, `usecases/studentRecords`, `usecases/assignment`)
- **카테고리**: TS
- **현재**: `: any`/`as any`/`<any>`/`@ts-ignore`/`@ts-expect-error`/`@ts-nocheck` Grep 결과 0건.
- **문제**: 없음. CLAUDE.md `any` 금지 규칙 준수 양호.
- **참조**: CLAUDE.md "TypeScript strict, any 금지"

### [P2] non-null assertion 22건 — 빈 배열 보호 가정에 깔린 fragile narrowing
- **위치**: `Homeroom/Consultation/ConsultationCreateModal.tsx:74-127` (16건), `Homeroom/Records/ProgressMode.tsx:279, 280, 325, 326` (4건), `Homeroom/Consultation/ConsultationTab.tsx:1`, `Homeroom/Consultation/ConsultationDetail.tsx:1`
- **카테고리**: TS
- **현재**:
  ```ts
  // ConsultationCreateModal.tsx:74
  const firstStart = parseTimeToMinutes(sorted[0]!.start);
  // ...
  // ConsultationCreateModal.tsx:122
  const lastEnd = parseTimeToMinutes(sorted[sorted.length - 1]!.end);
  ```
  ```ts
  // ProgressMode.tsx:279-280 — `.filter(d => d.student)` 후의 narrowing 한계 우회
  {neisDetail.map(({ student, records: recs }) => (
    <div key={student!.id} className="...">
      <span ...>{student!.name}</span>
  ```
- **문제**:
  - `ConsultationCreateModal.tsx:74`은 line 69 `if (periodTimes.length === 0) return [];` 가드로 안전. 하지만 line 122의 `sorted[sorted.length - 1]!`은 동일 가드 후 안전하나 `!` 사용은 향후 가드 제거 시 silent crash. `Period.find` 등 옵셔널 인덱싱 부분은 noUncheckedIndexedAccess 옵션 활성화 시 모두 컴파일 에러로 노출되어야 함.
  - `ProgressMode.tsx:279`의 `student!`은 `.filter(d => d.student)` 후이지만 TS narrowing이 `student` 옵셔널을 추론 못함. type predicate (`(d): d is { student: Student; records: ... } => !!d.student`)로 풀어쓰면 `!` 제거 가능.
- **개선안**:
  ```ts
  // ProgressMode.tsx:108 type predicate
  })).filter((d): d is { student: Student; records: StudentRecord[] } => !!d.student);
  ```
- **참조**: CLAUDE.md strict, NotImplemented 가이드 (TS strict는 활성됐으나 `noUncheckedIndexedAccess` 미활성)

### [P3] Props interface 분리 양호
- **위치**: 모든 Homeroom 컴포넌트
- **카테고리**: TS
- **현재**: `InputModeProps`, `ConsultationCreateModalProps`, `RosterManagementTab`(props 없음 — 단독), `StudentGridProps<T>` 등 명확한 분리 확인.
- **문제**: 없음.
- **참조**: CLAUDE.md "Props 별도 interface"

### [P2] 출결 신/구 형식 union 안전성 — 옵셔널 필드로 마이그레이션 미완 신호
- **위치**: `src/domain/entities/StudentRecord.ts:33`, 사용처 `recordUtils.ts:180`, `useStudentRecordsStore.ts`, `usecases/studentRecords/UpdateAttendancePeriods.ts`
- **카테고리**: TS / 데이터
- **현재**:
  ```ts
  // StudentRecord.ts:33 — 옵셔널이 신/구 호환의 유일한 신호
  readonly attendancePeriods?: readonly AttendancePeriodEntry[];
  ```
  ```ts
  // recordUtils.ts:180 — 신 형식이 없으면 subcategory 문자열 정규식으로 fallback
  export function getAttendanceTypeFromSubcategory(subcategory: string): string | null {
    const match = subcategory.match(/^(결석|지각|조퇴|결과)/);
    return match ? match[1]! : null;
  }
  ```
- **문제**:
  - 출결 레코드는 두 형식이 공존: (1) 신 — `attendancePeriods` 배열 + 대표 `subcategory`, (2) 구 — `attendancePeriods` 부재, `subcategory`만 (예: "결석 (질병)"). 옵셔널 한 필드로만 식별 → **역사적 신/구 식별 신뢰성이 정규식에 위임**.
  - 타입 시스템상 두 상태가 구분 안됨 (discriminated union 부재). 신 형식만 있는 코드 경로(`InlineRecordEditor`)와 구 형식 fallback 경로(`SearchMode` 정규식 추출)가 동시 존재.
- **개선안**: discriminated union 도입
  ```ts
  type AttendanceRecord =
    | { kind: 'legacy'; subcategory: string }       // 구 형식
    | { kind: 'periods'; attendancePeriods: readonly AttendancePeriodEntry[] };
  ```
  또는 마이그레이션 use case로 일괄 변환 후 옵셔널 제거.
- **참조**: 02-frontend-architecture (Explore 매핑) — "AttendancePeriodEntry vs '생리결석/병결' 구 형식 혼재"

---

## B. 에러 처리

### [P0] `useStudentRecordsStore.load()`/`useConsultationStore.load()`/`useSurveyStore.load()` — 실패 swallow + 사용자 피드백 0
- **위치**: `src/adapters/stores/useStudentRecordsStore.ts:162-173`, `src/adapters/stores/useConsultationStore.ts:28-35`, `src/adapters/stores/useSurveyStore.ts:46-53`
- **카테고리**: 에러
- **현재**:
  ```ts
  // useStudentRecordsStore.ts:162-173
  load: async () => {
    if (get().loaded) return;
    try {
      const [records, categories] = await Promise.all([
        manageRecords.getAll(),
        manageRecords.getCategories(),
      ]);
      set({ records, categories, loaded: true });
    } catch {
      set({ loaded: true });    // ← 에러 swallow, 사용자 인지 불가
    }
  },
  ```
  ```ts
  // useConsultationStore.ts:28-35 — try-catch 자체가 없음
  load: async () => {
    const data = await consultationRepository.load();   // ← 실패 시 unhandled rejection
    if (data) {
      set({ schedules: data.schedules, loaded: true });
    } else {
      set({ loaded: true });
    }
  },
  ```
  ```ts
  // useSurveyStore.ts:46-53 — 동일 패턴
  load: async () => {
    const data = await surveyRepository.load();          // ← 실패 시 unhandled rejection
    ...
  }
  ```
- **문제**:
  - **데이터 손실 위험**: `useStudentRecordsStore.load()`가 디스크 읽기 실패하면 `records: []`로 시작 → 사용자가 신규 기록을 추가하면 빈 배열에 추가되어 **저장 시 기존 데이터를 빈 배열로 덮어씀**. (현재 코드 `addRecord`은 `manageRecords.add(newRecord)` 호출이지만, save 구현이 전체 덮어쓰기 방식이면 catastrophic.)
  - `useTeachingClassStore`는 동일 위험을 인지하고 `loadFailed: true` 플래그 + `if (loadFailed) console.warn(...) return` 가드를 두는 반면(line 149-150, 278, 566, 632), 학생 기록·상담·설문 store에는 이 보호 막이 없음.
  - 사용자가 "내 기록이 사라졌다"고 신고할 때 진단 단서(console)가 없음 — 빈 catch는 디버깅 통로조차 차단.
- **개선안**:
  ```ts
  load: async () => {
    if (get().loaded) return;
    try {
      const [records, categories] = await Promise.all([...]);
      set({ records, categories, loaded: true, loadFailed: false });
    } catch (err) {
      console.error('[StudentRecordsStore] load failed:', err);
      set({ loaded: true, loadFailed: true });
    }
  },
  // addRecord 등 모든 mutation에 loadFailed 가드 추가 (TeachingClassStore 패턴 준수)
  ```
- **참조**: `useTeachingClassStore.ts:149-150` (모범 패턴)

### [P1] `ConsultationCreateModal.tsx:638`/`SurveyCreateModal.tsx:224` — 빈 catch + generic 메시지
- **위치**: `Homeroom/Consultation/ConsultationCreateModal.tsx:638`, `Homeroom/Survey/SurveyCreateModal.tsx:215, 224`
- **카테고리**: 에러
- **현재**:
  ```ts
  // ConsultationCreateModal.tsx:638
  } catch {
    showToast('상담 일정 생성에 실패했습니다', 'error');
  } finally {
    setSaving(false);
  }
  ```
  ```ts
  // SurveyCreateModal.tsx:215-219 — Supabase 업로드 실패는 토스트 + return, 그러나 로컬은 이미 저장됨
  } catch {
    showToast('설문은 저장되었지만 온라인 공유 설정에 실패했습니다', 'error');
    onClose();
    return;
  }
  ```
- **문제**:
  - 네트워크 실패 / Supabase 권한 / 잘못된 데이터 — 모두 동일 메시지로 노출. 사용자가 "재시도하면 될 일"인지 "데이터를 다시 입력해야 하는 일"인지 분간 불가.
  - `ConsultationCreateModal`의 경우 line 598 `createSchedule` (로컬)과 line 618 `consultationSupabaseClient.createSchedule` (네트워크)이 같은 try 블록 안에 있어, **Supabase 실패해도 로컬은 이미 저장된 상태**. 사용자는 "실패했습니다" 토스트만 보고 재시도 → 로컬 중복 일정 생성.
  - 에러 인스턴스를 미참조하므로 Sentry/log 전달도 불가.
- **개선안**: SurveyCreateModal 패턴(로컬+원격 분리 catch)을 ConsultationCreateModal에도 적용. 그리고 `err instanceof NetworkError` / `err instanceof ValidationError` 등으로 메시지 분기. console.error로 진단 보존.
- **참조**: SurveyCreateModal.tsx:203-220 (부분 모범 패턴)

### [P1] catch 블록에서 에러 swallow 광범위 (총 ~21건)
- **위치**: 21개 catch 블록 중 swallow + 사용자 피드백 부재 6건:
  - `Homeroom/Consultation/ConsultationCreateModal.tsx:479` (커스텀 코드 검증)
  - `Homeroom/Consultation/ConsultationDetail.tsx:228, 236` (decrypt 실패)
  - `Homeroom/Records/InputMode.tsx:80, 303` (localStorage)
  - `Homeroom/Records/recordUtils.ts:130` (시간 포맷)
- **카테고리**: 에러
- **현재**:
  ```ts
  // ConsultationDetail.tsx:228-238
  if (b.bookerInfoEncrypted) {
    try {
      const info = await decrypt(b.bookerInfoEncrypted, schedule.adminKey);
      infoMap.set(b.id, info);
    } catch {
      infoMap.set(b.id, '(정보 없음)');   // ← decrypt 실패가 진짜 실패인지 admin key mismatch인지 분간 불가
    }
  }
  if (b.memoEncrypted) {
    try {
      const memo = await decrypt(b.memoEncrypted, schedule.adminKey);
      memoMap.set(b.id, memo);
    } catch {
      // ignore                              ← 메모 누락에 대한 단서 없음
    }
  }
  ```
- **문제**:
  - 학부모 상담 예약자 정보 복호화 실패 = **개인정보 기반 보안 이슈** 또는 **잘못된 adminKey** 혹은 **데이터 손상**. 셋 중 하나도 알 수 없음. 무성한 "(정보 없음)" 표시는 운영 환경에서 침묵의 데이터 손상으로 이어짐.
  - localStorage swallow는 localStorage가 막힌 환경(Safari private mode 등)에서 사용자에게 안내 0.
- **개선안**: 최소한 `console.warn('[ConsultationDetail] decrypt failed for booking', b.id, err)`로 진단 단서 보존. 데이터 손상 의심 시 운영 모니터링 가능.

### [P3] 에러 처리 양호한 케이스
- **위치**: `useStudentStore.ts:165-169` `changeStatus` 롤백, `useTeachingClassStore.ts:148-151` `loadFailed` 플래그, `useAssignmentStore.ts:74-89` `loadAssignments` 에러 메시지 + `needsGoogleConnect` 플래그.
- **카테고리**: 에러
- **현재**: 모범 패턴.
- **참조**: 다른 store에 확산 권고.

---

## C. 성능

### [P0] 거의 모든 컴포넌트가 Zustand store 전체 구독 — 셀렉터 미사용으로 무관 변경에도 리렌더
- **위치**: 22개 사용처 (전부)
- **카테고리**: 성능
- **현재**:
  ```ts
  // Records/RecordsTab.tsx:27-30
  const { records, loaded, load, viewMode, setViewMode, categories } = useStudentRecordsStore();
  const { students, load: loadStudents, loaded: studentsLoaded, activeStudents } = useStudentStore();

  // Survey/SurveyTab.tsx:247-248
  const { surveys, loaded, load } = useSurveyStore();
  const { students, load: loadStudents, loaded: studentsLoaded } = useStudentStore();

  // RosterManagementTab.tsx:27-35
  const { students, loaded, load: loadStudents, updateStudents, setStudentCount, updateStudentField, changeStatus } = useStudentStore();

  // InputMode.tsx:51
  const { addRecord, deleteRecord, updateRecord, updateAttendanceRecord } = useStudentRecordsStore();

  // SearchMode.tsx:37-38
  const { periodFilter, setPeriodFilter, deleteRecord, updateRecord, updateAttendanceRecord, toggleFollowUpDone, toggleNeisReport, toggleDocumentSubmitted } = useStudentRecordsStore();
  ```
- **문제**:
  - `useStudentRecordsStore()` (인자 없는 호출)는 **전체 state 구독**. 어떤 필드가 바뀌어도 (기록 추가, 카테고리 추가, viewMode 토글…) 모든 사용처가 리렌더.
  - 특히 `RecordsTab`(InputMode/ProgressMode/SearchMode 부모) → 한 번의 기록 추가에 부모+세 자식 + 학생 격자(StudentGrid) 전체가 리렌더.
  - 모범 사례 (해당 코드베이스에 이미 있음):
    ```ts
    // RosterManagementTab.tsx:57-58 — 셀렉터 사용 패턴 (드물게)
    const settings = useSettingsStore((s) => s.settings);
    const showToast = useToastStore((s) => s.show);

    // InputMode.tsx:54-57
    const className = useSettingsStore((s) => s.settings.className);
    const maxPeriods = useSettingsStore((s) => s.settings.maxPeriods);
    ```
    이미 같은 코드베이스에서 셀렉터 패턴이 존재하나, 담임 업무 store들은 일관되게 미사용.
  - 대시보드 분석에서 P0로 발견된 패턴이 담임 업무에서도 동일.
- **개선안**: 액션은 `useStore.getState().action()` 또는 `useStore(s => s.action)`, 데이터는 selector + shallow:
  ```ts
  import { shallow } from 'zustand/shallow';
  const { records, categories } = useStudentRecordsStore(
    (s) => ({ records: s.records, categories: s.categories }),
    shallow
  );
  const addRecord = useStudentRecordsStore((s) => s.addRecord);
  ```
- **참조**: 대시보드 P0 발견 패턴, Zustand 공식 가이드.

### [P1] `RecordsTab.tsx:48` — `useMemo` deps 누락 (stale closure 위험)
- **위치**: `Homeroom/Records/RecordsTab.tsx:48`
- **카테고리**: 성능 / 에러
- **현재**:
  ```ts
  const activeStudentsList = useMemo(() => activeStudents(), [students]);
  ```
- **문제**: `activeStudents` 함수 reference가 deps에 없음. `useStudentStore`는 매 렌더마다 새 함수 객체를 반환할 수 있어 ESLint react-hooks 룰 위반. `activeStudents` 함수 본문이 store state를 클로저로 잡으면 stale state 위험.
- **개선안**: `activeStudents` 함수 자체가 `students`만 보면 되므로, `useStudentStore((s) => s.students)`로 학생만 구독하고 `useMemo(() => students.filter(...), [students])`로 직접 계산. 또는 store 셀렉터 자체에 `activeStudents` 파생 셀렉터 (`useStudentStore((s) => s.students.filter(...))` + shallow) 패턴.

### [P1] React.memo 미사용 + 인라인 함수 props — N명 학생 격자 매번 리렌더
- **위치**: `Homeroom/shared/StudentGrid.tsx:99`, `Homeroom/Records/InputMode.tsx` (학생 셀 렌더)
- **카테고리**: 성능
- **현재**:
  ```tsx
  // StudentGrid.tsx:93-101 — StudentCell이 React.memo 미적용 + onClick 인라인
  {displayData.map(({ student, displayNumber }) => (
    <StudentCell
      key={student.id}
      student={student}
      displayNumber={displayNumber}
      gridMode={gridMode}
      onClick={() => handleClick(student)}   // ← 매 렌더 새 함수 → memo 효과 0
    />
  ))}
  ```
- **문제**: 30명 격자에서 학생 1명 선택만 해도 30개 셀 전부 리렌더. 게다가 `gridMode` 객체도 매 렌더 부모에서 새로 생성될 가능성(InputMode line 1180 부근 selection mode 객체).
- **개선안**: `StudentCell`을 `React.memo` + `onClick` prop을 `(student: Student) => void`로 받고 cell 내부에서 `() => onClick(student)`로 처리하면 부모 함수 reference만 안정되면 memo 동작.

### [P2] `ProgressMode.tsx:97-132` — `neisDetail`/`docDetail` 동일 패턴 중복 + Map 매 렌더 재구성
- **위치**: `Homeroom/Records/ProgressMode.tsx:97-132`
- **카테고리**: 성능 / 스멜
- **현재**:
  ```ts
  const neisDetail = useMemo(() => {
    const unreported = records.filter(r => r.category === 'attendance' && !r.reportedToNeis);
    const byStudent = new Map<string, StudentRecord[]>();
    for (const r of unreported) { ... }
    return Array.from(byStudent.entries()).map(([studentId, recs]) => ({...})).filter(d => d.student);
  }, [records, students]);

  const docDetail = useMemo(() => {
    const unsubmitted = records.filter(r => r.category === 'attendance' && !r.documentSubmitted);
    const byStudent = new Map<string, StudentRecord[]>();
    for (const r of unsubmitted) { ... }
    return Array.from(byStudent.entries()).map(([studentId, recs]) => ({...})).filter(d => d.student);
  }, [records, students]);
  ```
- **문제**: 두 useMemo가 동일 그룹화 로직, 다른 술어. 학생 ID 인덱싱 (`students.find(s => s.id === studentId)`)이 학생 N명 × 그룹 M개에서 **O(N×M)**. 학급당 30명 × 결석 10명 그룹화면 큰 문제는 아니나, 학기 전체 데이터 누적 시 worst case 1000건 기록 × 30명 학생 = 30000회 find.
- **개선안**: 헬퍼 추출 + 학생 Map 한 번:
  ```ts
  const studentMap = useMemo(() => new Map(students.map(s => [s.id, s])), [students]);
  function groupByStudent<R extends StudentRecord>(items: R[], studentMap: Map<string, Student>) { ... }
  ```

### [P2] `ConsultationDetail.tsx:219-245` — 폴링 30초마다 모든 booking decrypt 반복
- **위치**: `Homeroom/Consultation/ConsultationDetail.tsx:194-209` (폴링), `218-245` (복호화)
- **카테고리**: 성능
- **현재**:
  ```ts
  // 폴링: 30초마다 새 bookings 수신
  useEffect(() => {
    if (!isOnline) return;
    const stop = consultationSupabaseClient.startPolling(schedule.id, (newSlots, newBookings) => {
      setSlots(newSlots);
      setBookings(newBookings);
    }, 30_000);
    ...
  }, [schedule.id, isOnline]);

  // bookings 변경 시 전체 다시 복호화
  useEffect(() => {
    const decryptAll = async () => {
      const infoMap = new Map<string, string>();
      const memoMap = new Map<string, string>();
      for (const b of bookings) {
        if (b.bookerInfoEncrypted) {
          try {
            const info = await decrypt(b.bookerInfoEncrypted, schedule.adminKey);  // ← 매번 모든 bookings 다시 복호화
  ```
- **문제**: 폴링 시 bookings 배열 reference 새로 와서 (서버 수정 없어도) decrypt가 재실행. AES decrypt N개 × 30초마다 = 학부모 상담 예약 50개면 `100 decrypt/min`. 모바일 디바이스에서는 의미 있음.
- **개선안**: `bookingId → encryptedHash` 캐시. encryptedText가 같으면 decrypt skip.

### [P3] `useMemo`/`useCallback` 사용 양호한 케이스
- ProgressMode, SearchMode 통계 계산은 모두 `useMemo`로 감쌈. InputMode 키보드 핸들러는 `useCallback`으로 감쌈.

---

## D. 메모리 누수·생명주기

### [P3] useEffect cleanup 양호
- **위치**: 모든 검사된 useEffect
- **카테고리**: 메모리
- **현재**: 모달 이벤트(online/offline), 키보드 단축키, mousemove drag, 폴링, debounce 타이머 — 전부 cleanup 동봉.
  - `InputMode.tsx:147-152` mousemove/up cleanup
  - `InputMode.tsx:471-472` keydown cleanup
  - `ConsultationDetail.tsx:206-208` 폴링 stop
  - `SurveyCreateModal.tsx:96` debounce timer clearTimeout
  - `ConsultationCreateModal.tsx:485` debounce timer
  - `ConsultationCreateModal.tsx:456-459` online/offline cleanup
  - `ConsultationDetail.tsx:187-190` online/offline cleanup
  - `SurveyStudentDetail.tsx:55-58` online/offline cleanup
- **문제**: 없음.
- **참조**: 표준 React 패턴 준수.

### [P2] `ConsultationCreateModal` `handleCreate` deps 누락 (`customLinkCode`, `students`) — stale closure
- **위치**: `Homeroom/Consultation/ConsultationCreateModal.tsx:594-643`
- **카테고리**: 메모리 / 성능
- **현재**:
  ```ts
  const handleCreate = useCallback(async () => {
    ...
    const schedule = await createSchedule({
      ...
      targetStudents: students.filter((s) => !s.isVacant)...   // ← students 사용
      customLinkCode: customLinkCode.trim() || undefined,       // ← customLinkCode 사용
    });
    ...
  }, [canSubmit, title, type, methods, slotMinutes, dates, message, createSchedule, showToast, onClose, excludeClassTime, excludedTimes, blockedSlotKeys]);
  // ← students, customLinkCode 누락
  ```
- **문제**: `customLinkCode`는 사용자가 마지막 순간 변경 가능 → stale 값으로 저장될 위험. 학생 결번 변경이 일정 생성 직전 일어나면 stale.
- **개선안**: deps에 `customLinkCode`, `students` 추가. ESLint `react-hooks/exhaustive-deps` 규칙 활성화 권고.

### [P2] `RosterManagementTab.tsx:148-156` — `handleColumnTypeChange` deps에 미사용 `useFirstRowAsHeader`
- **위치**: `Homeroom/RosterManagementTab.tsx:148-156, 197`
- **카테고리**: 메모리 / 스멜
- **현재**:
  ```ts
  const handleColumnTypeChange = useCallback((colIdx: number, type: ColumnType) => {
    setColumnMappings((prev) => {
      const next = prev.map((m, i) => (i === colIdx ? { ...m, type } : m));
      if (parseResult) {
        setValidationResult(validateRows(parseResult.rows, next));
      }
      return next;
    });
  }, [parseResult, useFirstRowAsHeader]);  // ← useFirstRowAsHeader 함수 본문에서 안 씀

  const handleBulkApply = useCallback(async () => {
    ...
  }, [parseResult, useFirstRowAsHeader, columnMappings, ...]);  // ← 동일
  ```
- **문제**: 함수 본문이 `useFirstRowAsHeader`를 참조하지 않는데 deps에 있음. 핸들러가 불필요하게 매 토글마다 재생성됨.

---

## E. 보안·입력 검증

### [P0] `ConsultationDetail.tsx:218-245` — 학부모 개인정보 복호화 실패 시 침묵
- **위치**: `Homeroom/Consultation/ConsultationDetail.tsx:228, 236`
- **카테고리**: 보안 / 에러
- **현재**: B 섹션 동일 코드. decrypt 실패 시 `infoMap.set(b.id, '(정보 없음)')` 또는 `// ignore`.
- **문제**:
  - 학부모 상담 booking은 학부모 이름·연락처를 AES 암호화하여 Supabase에 저장. 복호화는 `schedule.adminKey`로 수행. 실패 case는 (1) 잘못된 adminKey, (2) 데이터 손상, (3) 잘못된 IV 등.
  - "(정보 없음)" 표시는 *데이터가 없는 것*과 *읽지 못하는 것*이 구분 안됨 — 교사가 잘못된 어드민 키를 가진 상태(예: 다른 디바이스에서 새 schedule 생성 후 동기화 누락)에서 학부모 정보를 모두 잃은 것처럼 보임.
- **개선안**: 진단 로그 + 상태 구분 + 사용자 안내:
  ```ts
  catch (err) {
    console.error('[ConsultationDetail] decrypt failed', { bookingId: b.id, err });
    infoMap.set(b.id, b.bookerInfoEncrypted ? '⚠ 복호화 실패' : '(정보 없음)');
  }
  ```

### [P1] `RosterManagementTab.tsx` — 학생 이름·전화·생년월일 server-side validation 부재
- **위치**: `Homeroom/RosterManagementTab.tsx:419-491`, 도메인 `domain/rules/rosterImportRules.ts:240-296`
- **카테고리**: 보안
- **현재**:
  ```ts
  // RosterManagementTab.tsx:419-422 — onBlur로 trim 후 그대로 저장
  onBlur={(e) => {
    const newName = e.target.value.trim();
    if (newName && newName !== student.name) {
      void updateStudentField(student.id, 'name', newName);
    }
  }}
  ```
  ```ts
  // rosterImportRules.ts:240 — Excel/clipboard import는 검증되나 직접 편집은 trim만
  ```
- **문제**:
  - 직접 편집 경로는 `validateRows` 미통과. 200자 이상 이름, HTML 태그 포함 이름, 잘못된 전화번호 형식이 그대로 저장 가능.
  - 학생 이름 → 출결부 → Excel 내보내기 → HwpxExporter 등 데이터 흐름. 부적절한 입력이 데이터 파이프라인 끝까지 그대로 전파.
  - Electron이라 XSS 위협 자체는 낮음 (React가 텍스트 escape). 단, 한글 자모 분리·zero-width space·tab 문자 등은 Excel 열 정렬 손상 가능.
- **개선안**: domain rule 추가 — `validateStudentField(field: 'name'|'phone'|..., value: string)`. updateStudentField 호출 전 검증.

### [P3] `ConsultationCreateModal`/`SurveyCreateModal` — Supabase 저장 데이터는 AES 암호화
- **위치**: `Homeroom/Consultation/ConsultationCreateModal.tsx:618-633`, `decrypt` 사용
- **카테고리**: 보안
- **현재**: `bookerInfoEncrypted`/`memoEncrypted` 필드로 저장. PIN protection 옵션은 `hashPin` (SurveyCreateModal.tsx:198) bcrypt scrypt 등.
- **문제**: 없음. 보안 디자인 양호.

### [P3] `dangerouslySetInnerHTML` 사용 0개
- **위치**: 담임 업무 전체
- **카테고리**: 보안
- **현재**: Grep 결과 0건.
- **문제**: 없음.

### [P3] localStorage 사용 — 신뢰성 데이터 0개
- **위치**: `InputMode.tsx:74` (LAST_PERIODS_KEY), `SearchMode.tsx:43` (가이드 dismissed), `ConsultationDetail.tsx:169` (캘린더 추가 표시)
- **카테고리**: 보안
- **현재**: UX preference만 저장 (마지막 선택 교시·dismissed flag). 학생 데이터·기록은 storage adapter 경유.
- **문제**: 없음.

### [P3] PinGuard 위젯 모드 적용 양호
- **위치**: `widgets/components/WidgetCard.tsx:84` + `widgets/items/StudentRecords.tsx`
- **카테고리**: 보안
- **현재**:
  ```ts
  // widgets/items/itemRegistry 또는 정의에서 'student-records' → 'studentRecords' 매핑
  // WidgetCard.tsx:82-86
  if (pinFeature) {
    return <DashboardPinGuard feature={pinFeature}>{...}</DashboardPinGuard>;
  }
  ```
- **문제**: 없음. 위젯 모드에서 학생 기록은 잠금 처리.

---

## F. 코드 스멜

### [P0] 거대 컴포넌트 9건 — 분해 권고
- **위치**:
  - `Homeroom/Consultation/ConsultationCreateModal.tsx` 1431줄 (스텝 위저드 3 + 학생/학부모 로직)
  - `Homeroom/Records/InputMode.tsx` 1299줄 (좌/중/우 3컬럼 + 키보드 단축키 + 범위 모드 + 모달 3개)
  - `Homeroom/RosterManagementTab.tsx` 1103줄 (table + 마법사 + 상태 모달 + 미리보기)
  - `Homeroom/Consultation/ConsultationDetail.tsx` 802줄
  - `Homeroom/Records/ProgressMode.tsx` 647줄
  - `Homeroom/Records/SearchMode.tsx` 627줄
  - `Homeroom/Survey/SurveyStudentDetail.tsx` 586줄
  - `Homeroom/Survey/SurveyCreateModal.tsx` 524줄
  - `Homeroom/Survey/SurveyDetail.tsx` 419줄
- **카테고리**: 스멜
- **개선안**:
  - `ConsultationCreateModal`: Step 1/2/3 컴포넌트 분리, `computeBreakPresets`/`computeAvailableRanges` 등 순수 로직은 `domain/rules/consultationSlotRules.ts`로 이동.
  - `InputMode`: 좌(StudentSelectionPanel)/중(InputForm)/우(TodayHistoryPanel) 컴포넌트 분리, 키보드 단축키 훅 (`useInputModeShortcuts`) 분리.
  - `RosterManagementTab`: BulkImportWizard, RosterTable, StatusChangeModal 분리.

### [P1] 동일 함수 중복 — `toDateInputString` vs `todayString` vs `formatDateKR`
- **위치**: `Homeroom/Records/ProgressMode.tsx:20-22`, `Dashboard/DashboardStudentRecords.tsx:6-9`, `Homeroom/Records/recordUtils.ts:74` (`todayString`)
- **카테고리**: 스멜 / 일관성
- **현재**:
  ```ts
  // ProgressMode.tsx:20-22
  function toDateInputString(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  // DashboardStudentRecords.tsx:6-9
  function todayString(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  // recordUtils.ts:74 — 동일 로직 export
  ```
- **문제**: 동일 로직 3개 파일 정의. 한 곳에서 timezone 버그 수정해도 다른 곳에 적용 안됨.
- **개선안**: `recordUtils.ts` 또는 더 상위 `utils/dateFormat.ts`로 통합. (CLAUDE.md 기준 date-fns 사용도 가능 — `format(d, 'yyyy-MM-dd')`.)

### [P1] online/offline listener 중복 — `useOnlineStatus` 훅 미추출
- **위치**: `ConsultationCreateModal.tsx:451-460`, `ConsultationDetail.tsx:181-191`, `Survey/SurveyStudentDetail.tsx:50-59`
- **카테고리**: 스멜 (DRY)
- **현재**: 3곳에서 동일 패턴 반복.
  ```ts
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => { ... };
  }, []);
  ```
- **개선안**: `adapters/hooks/useOnlineStatus.ts` 추출. 단일 훅으로 3개 호출 사이트 ~30줄 절감.

### [P1] window.confirm 5건 — 비표준 UX 안티패턴
- **위치**: `Homeroom/Records/DefaultRecordListView.tsx:177`, `Homeroom/Records/InputMode.tsx:1202`, `Homeroom/Records/ProgressMode.tsx:311`, `Homeroom/Records/StudentTimelineView.tsx:221`
- **카테고리**: 스멜 / 일관성
- **현재**:
  ```tsx
  onClick={() => { if (window.confirm('이 기록을 삭제하시겠습니까?')) void deleteRecord(record.id); }}
  ```
- **문제**:
  - 코드베이스에 ConfirmModal/Modal 컴포넌트가 이미 있는데(예: `RosterManagementTab.tsx:1019` "상태 변경 사유 입력 모달 (window.prompt 대체)"), 삭제 confirm은 `window.confirm` 사용.
  - 디자인 시스템 일관성 깨짐. Linux/macOS에서 OS-native 모달이 떠 디자인 컨텍스트 이탈.
- **개선안**: `common/ConfirmModal` 도입 + 4건 일괄 교체.

### [P2] 인라인 fontSize 4건 — Tailwind 컨벤션 위반
- **위치**: `RosterManagementTab.tsx:654, 970, 1099`, `ConsultationCreateModal.tsx:1320`
- **카테고리**: 스멜
- **현재**:
  ```tsx
  <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>close</span>
  <span style={{ fontSize: '16px' }}>🎂</span>
  ```
- **문제**: CLAUDE.md "Tailwind CSS 유틸리티 클래스 사용 (인라인 스타일 지양)" 위반. 동적 width(`width: ${pct}%`)은 정당하지만 고정 fontSize는 `text-xl`/`text-base` 등으로 가능.
- **개선안**: `text-[20px]` arbitrary 또는 `text-xl` 표준 토큰. (단, MEMORY 기록 "v1 60 → v3.2 90/100" 에서 text-[Npx] codemod 라운드 종결됐다는 점을 고려할 때 표준 토큰 권고.)
- **참조**: 사용자 메모 P 라운드 (codemod 종결 후 `text-[Npx]` 449→66).

### [P2] console.log/warn/error 3건 잔존
- **위치**:
  - `Homeroom/Records/InputMode.tsx:1129` `console.error('[InputMode] 출결 기록 저장 실패', err);`
  - `Homeroom/Records/SearchMode.tsx:246` `console.error('[handleEditSave] 출결 기록 저장 실패', err);`
  - `useStudentRecordsStore.ts:459` `console.warn('[updateAttendanceRecord] 원본 출결부 동기화 실패', err);`
- **카테고리**: 스멜
- **현재**: 모두 진단용 prefix를 가진 의도적 로그.
- **문제**: 컨벤션상 production 빌드에서 console 잔존 의도 여부 불명. 일관된 logger (가령 `infrastructure/logger`)로 대체 가능.
- **개선안**: 의도된 잔존이면 OK. 아니면 production strip vite 플러그인 또는 logger 추상.

### [P3] 매직 넘버 일부
- **위치**: `RosterManagementTab.tsx:269` `disabled={students.length >= 50}` (학생 50명 상한), `useStudentStore.ts:173` `Math.min(50, count)` (동일), `InputMode.tsx:118` `rangeDates.length > 30` (30일 범위 상한), `ConsultationCreateModal.tsx:48` `30 * 24 * 60 * 60 * 1000` (30일 만료).
- **카테고리**: 스멜
- **현재**: 분산된 매직 넘버.
- **문제**: 50, 30 같은 비즈니스 룰이 코드 여러 곳에 박혀 있음.
- **개선안**: `domain/constants.ts`에 `MAX_STUDENTS_PER_CLASS = 50`, `MAX_DATE_RANGE_DAYS = 30` 등.

### [P3] 죽은 코드 가능성 — `studentView` 토글 (default/roster) 사용 여부
- **위치**: `InputMode.tsx:93` `useState<'default' | 'roster'>('default')`
- **카테고리**: 스멜
- **현재**: state는 정의됐으나 분석 범위에서 토글 UI를 보았으나 실제 분기 로직은 line 1100+ 에서 양쪽 분기 존재.
- **문제**: 추가 분석 필요. 본 분석 범위에서 활성 사용 확인됨 (line 510-519 토글 버튼). 죽은 코드 아님.

---

## G. 일관성

### [P0] 도메인 테스트 0개
- **위치**:
  - `src/usecases/studentRecords/*.test.*` → 없음
  - `src/usecases/assignment/*.test.*` → 없음
  - `src/adapters/stores/useStudentRecordsStore.test.ts` → 없음
  - `src/adapters/stores/useStudentStore.test.ts` → 없음
  - `src/adapters/stores/useTeachingClassStore.test.ts` → 없음
  - `src/adapters/stores/useConsultationStore.test.ts` → 없음
  - `src/adapters/stores/useSurveyStore.test.ts` → 없음
  - `src/adapters/stores/useAssignmentStore.test.ts` → 없음
  - `src/domain/rules/studentRecordRules.test.ts` → 없음
  - `src/domain/rules/rosterImportRules.test.ts` → 없음
  - `src/domain/rules/attendanceRules.test.ts` → 없음
- **카테고리**: 일관성
- **현재**: 도메인 규칙 파일은 6개 (`studentRecordRules`, `rosterImportRules`, `attendanceRules`…), use case는 ~10개, store는 7개. 모두 테스트 부재.
- **문제**:
  - 같은 코드베이스가 다른 도메인은 테스트 보유: `seatRules.test.ts`, `bookmarkRules.test.ts`, `realtimeWallRules.test.ts`, `realtimeWallRules.padlet.test.ts`, `realtimeWallRules.v2.test.ts`, `formTemplateRules.test.ts`, `notebookRules.test.ts`, `timetableOverrideRules.test.ts`, `toolResultAggregation.test.ts`, `toolResultSerialization.test.ts`.
  - **담임 업무는 학생 개인정보 + 출결 NEIS 보고 등 회귀 위험 가장 높은 도메인인데 테스트 0**.
  - 신/구 출결 마이그레이션 (A섹션 P2) 같은 critical 로직도 무테스트 → 회귀 시 즉시 데이터 손상 risk.
- **개선안**: 우선순위 1. `studentRecordRules` (filterByStudent/filterByDateRange/getAttendanceStats/getCategorySummary), 2. `rosterImportRules` (parseClipboardText/validateRows/toImportStudents), 3. `useStudentRecordsStore.bridgeHomeroomDayAttendance`/`updateAttendanceRecord` (출결부 ↔ 기록 양방향 동기화).

### [P2] import 순서 일관성 양호
- **위치**: 모든 검사 파일
- **카테고리**: 일관성
- **현재**: domain → usecases → adapters → infrastructure 그룹 패턴 대체로 준수. eslint `no-restricted-imports` 룰이 활성됐고 (`RosterManagementTab.tsx:9-11` `/* eslint-disable */`로 의도적 인프라 import 표시), 의존성 방향은 명확.

### [P3] 한국어 텍스트 inline 일관성 양호
- **위치**: 전체
- **카테고리**: 일관성
- **현재**: CLAUDE.md "모든 UI 텍스트는 한국어" 준수. inline literal 사용은 i18n 미도입 상태에서는 문제 없음.

### [P2] 6개 탭 구현 패턴 비대칭
- **위치**: HomeroomPage 6 탭
- **카테고리**: 일관성
- **현재**:
  - `RecordsTab` 137줄, 자식 3 모드(InputMode 1299, ProgressMode 647, SearchMode 627) 분기 — **분리 패턴**
  - `ConsultationTab` 330줄, 직접 렌더 + Detail/CreateModal 외부 — **혼합 패턴**
  - `SurveyTab` 387줄, 동일 — 혼합 패턴
  - `AssignmentTab` 313줄 — 혼합 패턴
  - `RosterManagementTab` 1103줄 — **모놀리스**
  - `HomeroomPage.tsx` 47줄 — 라우터만
- **문제**: 같은 페이지 안에서 tab → mode → component 깊이/분리가 제각각. 신규 개발자 학습 비용↑.
- **개선안**: RecordsTab이 가장 잘 분리됨. 다른 탭들도 sub-mode 패턴 통일 권고.

---

## H. 데이터 정합성

### [P0] 학생 status 변경/삭제 시 연관 데이터 cascade·orphan 정리 부재
- **위치**: `useStudentStore.ts:139-170` `changeStatus`, `useStudentStore.ts:172-...` `setStudentCount` (학생 수 감소 시 학생 제거)
- **카테고리**: 데이터
- **현재**:
  ```ts
  // changeStatus: 159-169
  await studentRepository.saveStudents(newStudents);
  // 생일 동기화는 처리 (line 162-164)
  // 그러나 studentRecords / consultations / surveys / assignments 처리 없음
  ```
  ```ts
  // setStudentCount: 학생 수 감소 시 students 배열에서 제거하지만,
  // 그 학생의 studentRecords[] 정리 로직 없음
  ```
- **문제**:
  - 학생 A를 `transferred`로 변경 → studentRecords에 A의 기록 그대로 남음.
  - `RecordsTab.tsx:48`은 `activeStudents()`로만 필터하므로 UI에서는 사라지나, **Excel 내보내기·SearchMode·ProgressMode**는 raw `records`에 직접 접근하면 transferred 학생 기록도 잡힐 수 있음 (RecordsTab은 line 51-53에서 `studentIds` Set으로 필터하므로 OK이지만, 다른 사용처는 보장 없음).
  - 학생 수 감소 시 학생 제거 → studentId references는 살아있음 → orphan record. `addRecord` 등 유효성 검증 없음.
  - `consultations`/`surveys`도 학생 번호(`studentNumber`) 기반이라 학생 수 변경 시 정합성 손상 (예: 30번 학생이 사라지고 새 30번이 들어오면 이전 booking이 새 학생에 연결).
- **개선안**:
  - 학생 status 변경 시 `studentRecords` 처리 정책 결정 (보존 vs 자동 archive).
  - `setStudentCount` 감소 시 orphan 정리 또는 차단.
  - studentNumber 기반 외부 reference (consultations/surveys/assignments)는 학생 ID로 마이그레이션 권고.

### [P2] NEIS 동기화 — `reportedToNeis`/`documentSubmitted`는 boolean flag일 뿐, 실제 NEIS 시스템 동기화 검증 없음
- **위치**: `useStudentRecordsStore.ts:218-236` `toggleNeisReport`/`toggleDocumentSubmitted`, `domain/entities/StudentRecord.ts:30-31`
- **카테고리**: 데이터
- **현재**: 사용자가 토글하는 단순 boolean. 실제 NEIS 시스템과 OAuth/API 연동 없음.
- **문제**: 필드 이름이 "reportedToNeis"라 마치 자동 동기화처럼 들리지만 실제는 사용자 메모 수준의 체크박스. ProgressMode `unreportedCount`는 단순 flag count.
- **개선안**: 필드 이름을 `markedAsReportedByTeacher` 등으로 명확화하거나, 또는 NEIS 외부 연동 로드맵 명시. (담임 업무 PRD/SPEC 확인 필요.)

### [P2] `bridgeHomeroomDayAttendance` — TeachingClassStore와 StudentRecordsStore 양방향 동기화 정합성
- **위치**: `useStudentRecordsStore.ts` `bridgeHomeroomDayAttendance` 메서드 (정의 위치 추가 분석 필요), `usecases/studentRecords/UpdateAttendancePeriods.ts`
- **카테고리**: 데이터
- **현재**: InputMode line 299에서 `await bridgeHomeroomDayAttendance({...})` 호출. 출결부(TeachingClassStore)와 기록(StudentRecordsStore) 양쪽에 같은 사실을 저장.
- **문제**:
  - 한쪽 저장 성공 + 한쪽 실패 (네트워크/에러)면 데이터 divergence.
  - `useStudentRecordsStore.ts:459` console.warn 한 줄 외 사용자 노출 없음 — 사용자는 자신이 저장했다고 믿지만 출결부에는 반영 안된 상태 가능.
- **개선안**: 트랜잭션 패턴 또는 명시적 "출결부와 기록 사이 불일치" 진단 도구.
- **참조**: 02-frontend-architecture analysis 'attendance bridge' 우려.

### [P3] 출결 신/구 형식 (A 섹션 P2) — 데이터 정합성으로도 분류 가능
- 본 항목은 A 섹션 [P2]에서 다룸.

---

## 정량 요약

| 카테고리 | P0 | P1 | P2 | P3 | 합계 |
| --- | ---: | ---: | ---: | ---: | ---: |
| A. TS 안전성 | 0 | 0 | 2 | 2 | 4 |
| B. 에러 처리 | 1 | 2 | 0 | 1 | 4 |
| C. 성능 | 1 | 2 | 2 | 1 | 6 |
| D. 메모리 | 0 | 0 | 2 | 1 | 3 |
| E. 보안·검증 | 1 | 1 | 0 | 3 | 5 |
| F. 코드 스멜 | 1 | 3 | 2 | 2 | 8 |
| G. 일관성 | 1 | 0 | 2 | 1 | 4 |
| H. 데이터 정합 | 1 | 0 | 2 | 0 | 3 |
| **합계** | **6** | **8** | **12** | **11** | **37** |

---

## Top 10 우선순위 픽스

1. **[P0/G] 담임 업무 도메인 테스트 0건** — `studentRecordRules`/`rosterImportRules`/`useStudentRecordsStore.bridgeHomeroomDayAttendance` 우선 작성. 회귀 위험 가장 높은 도메인이 무방어 상태.
2. **[P0/H] 학생 status·count 변경 시 cascade 정책 결정** — `useStudentStore.ts:139-170, 172-...`. orphan studentRecords/consultations/surveys 정리 또는 보존 정책 명시.
3. **[P0/B] `useStudentRecordsStore.load()`/`useConsultationStore.load()`/`useSurveyStore.load()` swallow 제거** — `loadFailed` 플래그 + console.error + mutation 가드. `useTeachingClassStore.ts:148-151` 패턴 차용.
4. **[P0/C] Zustand store 전체 구독 → 셀렉터 + shallow** — 22개 사용처 일괄. 대시보드 분석에서 P0로 발견됐던 동일 패턴이 담임 업무에도 동일 강도로 존재.
5. **[P0/F] 거대 컴포넌트 9건 분해** — 우선 ConsultationCreateModal(1431) → 3 step 컴포넌트 + domain rule 분리, InputMode(1299) → 좌중우 패널 + useShortcuts hook 분리.
6. **[P0/E] ConsultationDetail decrypt 실패 진단 로그 추가** — `Homeroom/Consultation/ConsultationDetail.tsx:228, 236`. 학부모 개인정보 손실 vs 잘못된 adminKey 구분.
7. **[P1/B] ConsultationCreateModal 로컬+원격 부분 실패 처리** — `Homeroom/Consultation/ConsultationCreateModal.tsx:594-643`. 로컬은 저장됐고 원격만 실패한 케이스 분기. SurveyCreateModal 패턴 차용.
8. **[P1/F] window.confirm 4건 → ConfirmModal 교체** — DefaultRecordListView/InputMode/ProgressMode/StudentTimelineView 일괄.
9. **[P1/F] online/offline + toDateInputString 중복 제거** — `useOnlineStatus` 훅 1개 + `recordUtils.todayString` 일원화. ~50줄 절감.
10. **[P1/C] `RecordsTab.tsx:48` `useMemo` deps 누락 + StudentGrid React.memo 미적용** — 학생 격자 매 렌더 30+회 셀 재생성 회피.
