# 담임 업무 페이지 — Clean Architecture 의존성 감사

**대상**: `e:/github/ssampin` 담임 업무 페이지 (HomeroomPage + 6개 탭)
**방식**: READ-ONLY (Grep + Read), 코드 수정 없음
**감사 일시**: 2026-05-01
**종합 점수**: **73/100**

---

## A. 의존성 규칙 위반 전수

### A-1. domain → 외부 import 위반 — **0건 (CLEAN)**

`src/domain/`에서 react/zustand/electron/@adapters/@usecases/@infrastructure import 검색 결과 **매치 없음**. domain 레이어는 의존성 규칙을 100% 준수.

### A-2. usecases → adapters 위반 — **0건 (CLEAN)**

`src/usecases/`에서 `@adapters/` import 검색 결과 **매치 없음**.

`ManageStudentRecords.ts`(use case)는 `IStudentRecordsRepository`(domain port)만 의존, `UpdateAttendancePeriods.ts`도 domain rule(`pickRepresentativeAttendance`, `validateAttendancePeriods`)만 호출. 모범 사례.

### A-3. usecases → infrastructure 위반 — **6건 (P1, 본 페이지 직속은 0건)**

본 감사 대상(studentRecords/consultation/survey/assignment) use case는 **위반 0건**. 다만 프로젝트 전체 위반 6건은 통합 부채에 합산 (대시보드 분석 결과와 동일):

| 위치 | import 구문 |
|------|------|
| `src/usecases/bookmark/ManageBookmarks.ts:4` | `import { generateUUID } from '@infrastructure/utils/uuid';` |
| `src/usecases/events/ImportEvents.ts:10` | 동일 |
| `src/usecases/events/SyncNeisSchedule.ts:14` | 동일 |
| `src/usecases/sticker/ManageStickers.ts:15` | 동일 |
| `src/usecases/todo/ManageTodos.ts:4` | 동일 |
| `src/usecases/events/SyncExternalCalendar.ts:4` | `import { parseICal } from '@infrastructure/calendar/ICalParser';` |

### A-4. adapters/components → infrastructure 직접 import (container.ts 외) — **11건 (P0, 본 페이지 9건)**

| # | 파일:줄 | 위반 import |
|---|---------|------|
| 1 | `src/adapters/components/Homeroom/RosterManagementTab.tsx:10` | `import { exportRosterToExcel, parseRosterFromExcel } from '@infrastructure/export/ExcelExporter';` |
| 2 | `src/adapters/components/Homeroom/Consultation/ConsultationCreateModal.tsx:8` | `import { validateCustomCode } from '@infrastructure/supabase/ShortLinkClient';` |
| 3 | `src/adapters/components/Homeroom/Consultation/ConsultationDetail.tsx:16` | `import type { SlotPublic, BookingPublic } from '@infrastructure/supabase/ConsultationSupabaseClient';` |
| 4 | `src/adapters/components/Homeroom/Survey/SurveyCreateModal.tsx:5` | `import { validateCustomCode } from '@infrastructure/supabase/ShortLinkClient';` |
| 5 | `src/adapters/components/Homeroom/Survey/SurveyCreateModal.tsx:11` | `import { hashPin } from '@infrastructure/crypto/pinHash';` |
| 6 | `src/adapters/components/Homeroom/Survey/SurveyCreateModal.tsx:12` | `import { generateUUID } from '@infrastructure/utils/uuid';` |
| 7 | `src/adapters/components/Homeroom/Survey/SurveyStudentDetail.tsx:10` | `import { hashPin } from '@infrastructure/crypto/pinHash';` |
| 8 | `src/adapters/components/Homeroom/Survey/SurveyStudentDetail.tsx:12` | `import type { SurveySupabaseClient, SurveyResponsePublic } from '@infrastructure/supabase/SurveySupabaseClient';` |
| 9 | `src/adapters/components/Homeroom/Records/RecordsExportModal.tsx:11-12` | ExcelExporter, HwpxExporter 직접 import |
| 10 | `src/adapters/components/Homeroom/Records/SearchMode.tsx:17` | `import { exportStudentRecordsToExcel } from '@infrastructure/export/ExcelExporter';` |
| 11 | `src/adapters/stores/useStudentRecordsStore.ts:8` | `import { generateUUID } from '@infrastructure/utils/uuid';` |

**중요**: `consultationSupabaseClient`, `surveySupabaseClient`, `shortLinkClient`는 **container.ts를 경유하여 import**되고 있어 DI 패턴은 일부 자리에서 살아있음. 그러나 같은 파일에서 `validateCustomCode`(:8)와 `SlotPublic` 타입(:16)은 infrastructure 직접 import. **DI 인스턴스는 통과시키고, 타입/유틸은 직접 import하는 절반의 추상화** 패턴 — 이게 P0의 본질.

### A-5. widgets/items/StudentRecords.tsx — **사실 정정**

```
src/widgets/items/StudentRecords.tsx (4 lines):
  4: export { DashboardStudentRecords as StudentRecords } from '@adapters/components/Dashboard/DashboardStudentRecords';
```

`wc -l`로 확인한 실제 라인 수는 **4**. Explore 매핑 시 "1959" 표기는 **사실과 다름** — re-export 파일.

진짜 큰 파일은 `InputMode.tsx:1299`, `RosterManagementTab.tsx:1103`, `ConsultationCreateModal.tsx:1431`.

---

## B. supabase 클라이언트 의존성

### B-1. Store 레이어는 **이미 DI 추상화** — 대시보드 분석 P0 클레임 정정

미션은 "useConsultationStore가 supabase 직접 호출하는 P0 위반"을 가정했지만 **실제 코드는 DI를 거친다**:

- `useConsultationStore.ts:6` → `import { consultationRepository, shortLinkClient } from '@adapters/di/container';` ✅
- `useSurveyStore.ts:8` → `surveyRepository, shortLinkClient, surveySupabaseClient` (DI 경유) ✅ 단 `:12` `hashPin from @infrastructure/crypto/pinHash` 직접 ❌
- `useAssignmentStore.ts:6-13` → 모두 DI 경유 ✅

**store 레이어 supabase 직접 import: 0건**.

### B-2. 컴포넌트 레이어는 supabase에 누수 — **8개 파일**

DI를 거쳐 받지만 그 인스턴스를 **컴포넌트가 직접 메서드 호출**:

| 위치 | 호출 |
|------|------|
| `Homeroom/Consultation/ConsultationCreateModal.tsx:618` | `await consultationSupabaseClient.createSchedule({...})` |
| `Homeroom/Consultation/ConsultationDetail.tsx:196` | `consultationSupabaseClient.startPolling(...)` |
| `Homeroom/Survey/SurveyCreateModal.tsx:203` | `await surveySupabaseClient.createSurvey({...})` |
| `Homeroom/Survey/SurveyTab.tsx:51` | `shortLinkClient.createShortLink(...)` |
| `Homeroom/Survey/SurveyStudentDetail.tsx:480` | 동일 |
| `Homeroom/Survey/SurveyCreateModal.tsx:88, 477` | `shortLinkClient.isCodeAvailable(...)` |
| `Tools/Assignment/AssignmentCreateModal.tsx:10` | `validateCustomCode` 직접 import |
| `ClassManagement/ClassSurveyTab.tsx` | supabase 클라이언트 호출 |

**문제**:
1. 동일한 "설문 생성 + 숏링크 발급 + PIN 해싱" 비즈니스 흐름이 **store(`useSurveyStore.createSurvey`)와 컴포넌트(`SurveyCreateModal`) 양쪽에 중복**. `SurveyCreateModal.tsx:198-214`는 PIN 해싱 후 `surveySupabaseClient.createSurvey`를 직접 부르고, `useSurveyStore.ts:185`도 같은 메서드를 부른다 → **동일 비즈니스 로직이 두 곳에 분산**.
2. 테스트 시 컴포넌트를 통과시키려면 supabase 모킹 필요 → 단위 테스트 비용 폭발.

**개선안**: 도메인별 RemotePort 추출.
```
src/domain/ports/IRemoteSurveyPort.ts        ← 추상
src/domain/ports/IRemoteConsultationPort.ts
src/domain/ports/IShortLinkPort.ts
src/domain/ports/IPinHasherPort.ts

src/usecases/survey/CreateRemoteSurvey.ts    ← 비즈니스 흐름 응집
src/usecases/consultation/CreateConsultationSchedule.ts
```

**영향 컴포넌트 카운트(본 페이지)**: 7개 (Consultation 2 + Survey 4 + Assignment 1).

---

## C. uuid 폴리필 + iCal 등 잘못된 위치 모듈

### C-1. `@infrastructure/utils/uuid` 직접 import — **31파일 (전체)**

분포(레이어별):
| 레이어 | 건수 | 대표 위치 |
|--------|------|----------|
| `src/usecases/` | **6** | `ManageBookmarks.ts:4`, `ImportEvents.ts:10` 등 (P1: usecases→infrastructure) |
| `src/adapters/stores/` | **13** | `useStudentRecordsStore.ts:8`, `useTeachingClassStore.ts:12`, `useConsultationStore.ts:7`, `useSurveyStore.ts:10` 등 |
| `src/adapters/components/` | **5** | `Homeroom/Survey/SurveyCreateModal.tsx:12`, `common/Toast.tsx:2`, `Forms/CategoryManager.tsx:6`, `Schedule/EventFormModal.tsx:5`, `Tools/Sticker/StickerSheetSplitter.tsx:11` |
| `src/adapters/hooks/` | **1** | `useAnalytics.ts:5` |
| `src/widgets/items/` | **1** | `DDayCounter.tsx:10` |
| `src/mobile/` | **6** | 6개 store/page |
| `src/infrastructure/` | **1** | `analytics/SupabaseAnalyticsAdapter.ts:3` (정당) |

**문제**: `uuid.ts`는 6줄짜리 순수 함수(`crypto.randomUUID` 폴리필). external dependency 없음. 이름은 "infrastructure"지만 본질은 **언어 polyfill** — domain/shared 레이어가 자연스러운 자리.

**개선안**: `src/shared/utils/uuid.ts`로 이동 → 일괄 codemod로 31파일 import 경로 교체. 단일 커밋 mass replace로 해소.

### C-2. `@infrastructure/calendar/ICalParser` — usecases 1건

`SyncExternalCalendar.ts:4`. `parseICal`도 순수 파서로 추정. domain/rules로 이동 가능 후보.

---

## D. Store가 비즈니스 로직 보유

### D-1. **RECORD_COLOR_MAP — Tailwind 클래스가 store에 박힘 (P1 핵심)**

**위치**: `src/adapters/stores/useStudentRecordsStore.ts:14-73` (60줄)

```ts
14: export const RECORD_COLOR_MAP: Record<
15:   string,
16:   { text: string; activeBg: string; inactiveBg: string; tagBg: string }
17: > = {
18:   red: { text: 'text-red-400', activeBg: 'bg-red-500/80 text-white', ... },
...
```

**위반 종류**: View 책임 (Tailwind 클래스 매핑) → State 책임(store)에 침투.

**현재**: store가 export하는 RECORD_COLOR_MAP을 **7개 파일**이 import:
- `useStudentRecordsStore.ts` (자체)
- `Homeroom/Records/recordUtils.ts:1`
- `Homeroom/Records/InlineRecordEditor.tsx:2`
- `Homeroom/Records/FilterSummaryStrip.tsx:5`
- `StudentRecords/RecordCategoryManagementModal.tsx:2`
- `StudentRecords/StudentRecords.tsx:2`
- `Dashboard/DashboardStudentRecords.tsx`

**개선안**:
- 신규 `src/adapters/presenters/recordCategoryPresenter.ts` 생성, RECORD_COLOR_MAP 이동.
- 7개 import 경로 일괄 수정.
- store는 데이터(색상 키 string)만 보관, presenter가 string→Tailwind 변환.

**수정 비용**: 1 신규 파일 + 7 import 경로 변경 + ~10분 codemod.

### D-2. `bridgeHomeroomDayAttendance` (60줄) + `updateAttendanceRecord` (76줄)

**위치**: `useStudentRecordsStore.ts:332-469`

이 두 메서드는:
1. studentNumber 매칭, periodMap 재구성 — 도메인 규칙
2. `pickRepresentativeAttendance` 호출(:343, domain rule) — OK
3. bridge ID 생성(`att-${student.id}-${date}`, :344) — 도메인 규칙
4. `useTeachingClassStore.getState()` 호출(:420) — **store-to-store 결합** ❌
5. attendancePeriods 정규화(:359-371) — 도메인 규칙
6. 후보 교시 산정 + 다른 학생 보존(:430-455) — 비즈니스 규칙

**개선안**:
- 신규 use case `BridgeHomeroomDayAttendance` (현재 `UpdateAttendancePeriods.ts`와 같은 디렉터리)
- 입력: `IAttendanceRepository`, `IStudentRecordsRepository`(domain ports)
- store는 use case만 호출 + 결과를 set.

**수정 비용**: 1 신규 use case 파일 + store 트림(~140줄 → ~30줄)

### D-3. `useTeachingClassStore` (674 라인)

`getDayAttendance`(:619), `saveDayAttendance`(:630)는 출결부 자료의 정규화 로직 보유 가능성 높음. `useTeachingClassStore.ts:9-11`이 이미 use case 3종을 import → **부분적 정착**. 잔여 인라인 로직만 점진 이전 권고.

### D-4. `recordUtils.ts` (291 라인) — 위치 적절성

함수 종류: `formatDateKR`, `createDateRange`, `METHOD_OPTIONS`, `getSubcategoryChipClass`, `getCategoryLabelColor`, `getRecordTagClass`, `initEditAttendancePeriods`. 절반은 **presenter**(클래스 반환), 절반은 **컴포넌트 유틸**.

**개선안**:
- presenter성 함수 → `src/adapters/presenters/recordCategoryPresenter.ts`(D-1과 합본)
- 출결 편집 초기화 → 도메인 규칙 후보(`src/domain/rules/attendanceRules.ts`)
- `METHOD_OPTIONS`(상담방법 라벨) → `src/domain/valueObjects/RecordCategory.ts` 또는 별도
- `createDateRange` → `src/domain/rules/dateRangeRules.ts` 또는 shared

---

## E. presenter 활용도

### E-1. presenter 디렉터리 현황

`src/adapters/presenters/`: 5개 (`category`, `timetable`, `period`, `pdfTemplate`, `note`).

**Homeroom 관련 presenter**: **0개**. RecordCategory(색상/라벨), StudentRecord(태그/요약), Consultation(상담 시각화), Survey(진행률) — 모두 컴포넌트가 직접 처리.

### E-2. domain rule 직접 호출 패턴 (P2)

`extractAttendanceType`, `getAttendanceStats`, `filterByDateRange`, `filterByStudent`, `filterByCategory`는 4개 컴포넌트(`StudentRecordReferencePanel.tsx`, `ProgressMode.tsx`, `RecordsExportModal.tsx`, `SearchMode.tsx`)가 직접 호출.

CLAUDE.md상 도메인 rule 직접 호출은 허용(adapters → domain ✅). 다만 결과를 UI 형태로 가공하는 부분은 presenter로 추출하면 컴포넌트 가독성↑.

---

## F. 라우팅 중복 (App.tsx)

```
src/App.tsx:166-171:
  if (page === 'homeroom')        return <PinGuard ...><HomeroomPage /></PinGuard>;
  if (page === 'student-records') return <PinGuard ...><HomeroomPage /></PinGuard>;
```

`Sidebar.tsx:8-9`: PageId 타입에 둘 다 정의.
`Sidebar.tsx:70`: 사이드바 `items` 배열은 `'homeroom'`만 등록.
`Sidebar.tsx:98-99`: 두 PageId 모두 동일하게 `'studentRecords'` feature key로 매핑.
`App.tsx:784`: store subscribe table에 `'student-records'`만 등록(homeroom 없음).

**진단**:
- `'student-records'`는 **레거시 PageId** (구 위젯/딥링크 호환).
- `'homeroom'`은 v2.0 통합 후 **정식 라우트**.
- 사이드바 노출은 `homeroom` 한 개, 둘 다 같은 페이지 컴포넌트 렌더.

**부채 종류**: P3 — dead path 정도.

**잠재 위험**: `App.tsx:784` subscribe 테이블이 `'student-records'`만 등록(homeroom 누락) → 페이지 진입 시 데이터 자동 로드 트리거 누락 가능.

---

## G. 종합 진단

### G-1. 의존성 위반 건수표

| 위반 종류 | 본 감사 대상 | 프로젝트 전체 |
|-----------|------------|--------------|
| domain → 외부 import (P0) | 0 | 0 |
| usecases → adapters (P0) | 0 | 0 |
| usecases → infrastructure (P1) | 0 | 6 |
| adapters/components → infrastructure 직접 (P0) | 9 (본 페이지) | 11+ |
| adapters/stores → infrastructure(uuid 제외) | 1 (`useSurveyStore.ts:12` hashPin) | 약 3 |
| widgets → infrastructure (P0) | 0 | 0 |
| supabase 컴포넌트 직접 호출 (P1) | 7 | 8 |
| **uuid 폴리필 import (위치 부적절)** | 21 | 31 |

### G-2. 레이어별 건강도 점수 (담임 업무 페이지)

| 레이어 | 점수 | 근거 |
|--------|-----|------|
| domain | **97/100** | 외부 의존 0, rule 모듈화 양호 |
| usecases | **70/100** | `ManageStudentRecords` 정착, 단 `consultation/`, `survey/` 디렉터리 부재 |
| adapters/stores | **65/100** | RECORD_COLOR_MAP(view 책임) + bridge/updateAttendance(140줄). store-to-store 결합 |
| adapters/components | **55/100** | infra 직접 import 9건, supabase 메서드 직접 호출 7건, presenter 부재 |
| infrastructure | **80/100** | supabase/utils/export 분리 양호. uuid.ts 위치 부적절 |
| **종합** | **73/100** | clean architecture 골격은 살아있으나 컴포넌트 레이어 침범 |

### G-3. 가장 시급한 리팩토링 5건

| 우선순위 | 리팩토링 | 효과 | 비용 |
|---------|---------|------|------|
| 1 (P0) | **uuid.ts 위치 이동** (`@infrastructure/utils/uuid` → `@shared/utils/uuid`) | usecases→infra 6건 + adapters→infra 25건 단일 codemod로 해소 | 1 파일 이동 + sed 31파일 |
| 2 (P0) | **컴포넌트 supabase 직접 호출 7건 → use case 추출** | 컴포넌트 외부 I/O 비결합 → 단위 테스트 가능. store/component 이중경로 제거 | use case 4~5종 + 도메인 포트 |
| 3 (P1) | **RECORD_COLOR_MAP을 presenter로 이동** + recordUtils 분해 | 디자인 시스템 v3.2 정합. store 책임 슬림 | 1 신규 presenter + 7개 함수 분배 |
| 4 (P1) | **`bridgeHomeroomDayAttendance` + `updateAttendanceRecord`를 use case로 추출** | store-to-store 결합 제거. 비즈니스 트랜잭션 경계 명확화 | 신규 use case 1~2개 |
| 5 (P0) | **타입 import만 infra에서 가져오는 패턴 정리** — `SlotPublic`/`BookingPublic`/`SurveyResponsePublic`은 domain entity 승격 | 컴포넌트가 infrastructure 타입에 결합되는 마지막 통로 차단 | 3 파일 + 도메인 타입 재배치 |

### G-4. 통합 부채 (대시보드 분석과 합산)

| 항목 | 본 감사 단독 | 대시보드 분석과 합 | 비고 |
|------|------------|------------------|------|
| uuid 31파일 일괄 치환 | 21 (담임/공통) | 31 (전체) | 단일 codemod |
| supabase 8건 (대시보드 분석 P0) | 7 (담임 페이지) | 7~8 | 본 감사가 클레임 검증·세분 |
| **store-level supabase 직접 import** (대시보드 분석 클레임) | **0건** (반박) | 0건 | useConsultationStore는 이미 DI 경유. 대시보드 분석이 잘못 식별 |

### G-5. 디렉터리 구조 개선안

```
신규/이동:
  src/shared/utils/uuid.ts                     ← infrastructure/utils/uuid.ts에서 이동
  src/domain/ports/IRemoteSurveyPort.ts        ← 신규 (Supabase 추상)
  src/domain/ports/IRemoteConsultationPort.ts  ← 신규
  src/domain/ports/IShortLinkPort.ts           ← 신규
  src/domain/ports/IPinHasherPort.ts           ← 신규
  src/usecases/survey/CreateRemoteSurvey.ts    ← 신규
  src/usecases/consultation/CreateConsultationSchedule.ts ← 신규
  src/usecases/consultation/PollBookings.ts    ← 신규
  src/usecases/studentRecords/BridgeHomeroomDayAttendance.ts ← 신규
  src/adapters/presenters/recordCategoryPresenter.ts ← 신규
  src/adapters/presenters/consultationPresenter.ts ← 신규
  src/adapters/presenters/surveyPresenter.ts   ← 신규

도메인 entity 승격:
  Consultation.ts에 SlotPublic/BookingPublic 추가
  Survey.ts에 SurveyResponsePublic 추가
```
