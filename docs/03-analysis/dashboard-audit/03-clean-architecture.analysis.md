# 대시보드 + 위젯 모드 Clean Architecture 의존성 감사

**대상**: `e:/github/ssampin` 메인 대시보드(`/`) + 위젯 모드 + 32개 위젯 시스템
**방식**: READ-ONLY (Grep + Read), 코드 수정 없음
**감사 일시**: 2026-05-01
**종합 점수**: **80/100**

---

## A. 의존성 규칙 위반 전수

### A-1. domain 레이어: 위반 0건 ✅

`src/domain/**/*.ts` 전수 검사 결과 외부 import 위반 **0건**.
- `@adapters`, `@usecases`, `@infrastructure`, `react`, `zustand`, `electron`, `date-fns` 모두 import 없음
- 외부 import는 vitest 10건뿐(테스트 전용, 빌드 산출물 미포함)
- 모든 내부 의존은 상대경로로 같은 레이어 안에서만 발생

**결론**: Iron Law "domain은 외부 의존성 없음" 완벽 준수.

### A-2. usecases 레이어: P0 위반 6건

#### [P0] usecases → infrastructure 위반 (6건)
- **위치**:
  - `src/usecases/events/ImportEvents.ts:10` — `import { generateUUID } from '@infrastructure/utils/uuid';`
  - `src/usecases/events/SyncNeisSchedule.ts:14` — `import { generateUUID } from '@infrastructure/utils/uuid';`
  - `src/usecases/events/SyncExternalCalendar.ts:4` — `import { parseICal } from '@infrastructure/calendar/ICalParser';`
  - `src/usecases/bookmark/ManageBookmarks.ts:4` — `import { generateUUID } from '@infrastructure/utils/uuid';`
  - `src/usecases/sticker/ManageStickers.ts:15` — `import { generateUUID } from '@infrastructure/utils/uuid';`
  - `src/usecases/todo/ManageTodos.ts:4` — `import { generateUUID } from '@infrastructure/utils/uuid';`
- **위반 종류**: usecases → infrastructure
- **현재**: `infrastructure/utils/uuid.ts`는 `crypto.randomUUID()` 폴리필(브라우저/Node 표준 API), `infrastructure/calendar/ICalParser.ts`는 외부 라이브러리 없는 순수 파서(RFC 5545 텍스트 파싱)
- **문제**: 두 모듈 모두 본질적으로 **순수 함수**(외부 시스템 어댑터가 아님)인데 단지 `infrastructure/` 폴더에 위치한다는 이유로 의존 방향 위반을 유발
- **개선안**: 두 가지 중 택일
  1. **이동(권장)**: `infrastructure/utils/uuid.ts` → `shared/utils/uuid.ts` (이미 `src/shared/utils/localDate.ts` 존재). `infrastructure/calendar/ICalParser.ts` → `domain/rules/icalParser.ts`
  2. **포트화**: `IUuidGenerator` 포트 + adapters/usecases가 인스턴스 주입받아 사용 (과잉)
- **수정 비용**: 이동 + import 경로 치환 약 13파일

### A-3. adapters → infrastructure: 위반 형태가 두 종류 ⚠️

container.ts 외 파일에서 infrastructure를 직접 import하는 곳이 **44건**(약 30 파일):

#### [P1] uuid 폴리필 직접 import (22건)
- **위치**: `useClassRosterStore.ts:2`, `useConsultationStore.ts:7`, `useEventsStore.ts:16`, `useFormStore.ts:15`, `useMemoStore.ts:12`, `useNoteStore.ts:12`, `useObservationStore.ts:6`, `useSettingsStore.ts:7`, `useStudentRecordsStore.ts:8`, `useSurveyStore.ts:10`, `useTasksSyncStore.ts:4`, `useTeachingClassStore.ts:12`, `useTodoStore.ts:6`, `useToolPresetStore.ts:2`, `Toast.tsx:2`, `useAnalytics.ts:5`, `EventFormModal.tsx:5`, `CategoryManager.tsx:6`, `StickerSheetSplitter.tsx:11`, `StickerUploader.tsx:7`, `SurveyCreateModal.tsx:12`
- **개선안**: A-2와 동일, uuid를 `shared/utils/`로 이동 후 단일 import 경로 정착

#### [P2] export 모듈 직접 import (12건)
- **위치**: `Export.tsx:18-31`, `Seating.tsx:9-10`, `TimetableEditor.tsx:22`, `TimetablePage.tsx:37-41`, `RecordsExportModal.tsx:11-12`, `SearchMode.tsx:17`, `RosterManagementTab.tsx:10`, `ObservationExportModal.tsx:5-6`, `UnifiedExportModal.tsx:5-6`, `ClassSeatingTab.tsx:14`, `AttendanceTab.tsx:9`, `Tools/Results/SpreadsheetView.tsx:10`, `ToolRealtimeWall.tsx:63`
- **위반 종류**: 컴포넌트 → infrastructure 직접 import
- **문제**: container.ts 예외 조항이 적용되지 않음. `ExcelExporter`, `HwpxExporter`, `PdfExporter`는 외부 라이브러리(`exceljs`, `@ubermensch1218/hwpxcore`, pdfkit)를 직접 호출하는 진짜 인프라
- **개선안**: `IExportPort` 신설 후 container 등록, 컴포넌트는 hook(`useExporter()`)으로 접근. 또는 `usecases/export/` 신설
- **수정 비용**: 12파일 + 신규 포트 1개

#### [P2] supabase 클라이언트 직접 import (8건)
- **위치**: `ConsultationCreateModal.tsx:8`, `ConsultationDetail.tsx:16`, `SurveyStudentDetail.tsx:10,12`, `SurveyCreateModal.tsx:5,11`, `LiveSessionClient`(5건), `ToolRealtimeWall.tsx:7`, `AssignmentCreateModal.tsx:10`
- **개선안**: 각 도메인(consultation, survey, assignment)에 `IXxxRemotePort` 추가, container에서 주입
- **수정 비용**: 도메인별 포트 4개 + 8 컴포넌트 수정

#### [P2] weather 모듈 직접 import (4건)
- **위치**:
  - `src/adapters/stores/useWeatherStore.ts:2-3`
  - `src/adapters/components/Dashboard/WeatherBar.tsx:4`
  - `src/adapters/components/Dashboard/WeatherForecastPopup.tsx:1`
  - `src/widgets/components/WidgetWeatherBar.tsx:4`
- **개선안**: `IWeatherPort` 신설(`fetchWeather` 시그니처), 타입은 `domain/entities/Weather.ts`로 이동

### A-4. widgets 레이어: P0 위반 3건

#### [P0] widgets → infrastructure (3건)
- **위치**:
  - `src/widgets/items/DDayCounter.tsx:10` — `import { generateUUID } from '@infrastructure/utils/uuid';`
  - `src/widgets/items/ConsultationWidget.tsx:4` — `import type { SlotPublic } from '@infrastructure/supabase/ConsultationSupabaseClient';`
  - `src/widgets/components/WidgetWeatherBar.tsx:4` — `import type { AirQualityGrade } from '@infrastructure/weather';`
- **추가 위치**:
  - `src/widgets/items/ConsultationWidget.tsx:3` — `import { consultationSupabaseClient } from '@adapters/di/container';` 그리고 `getSlots()` 직접 호출(line 35)
- **위반 종류**: widgets(adapters와 동급) → infrastructure
- **문제**: `ConsultationWidget`은 위젯이 직접 외부 Supabase API를 호출. 동기화 정책, 오류 처리, 캐싱 책임이 컴포넌트로 누수
- **개선안**: `useConsultationStore`에 `getSlotProgress(scheduleId)` 추가 후 위젯에서는 store만 사용
- **수정 비용**: 1 store 메서드 추가 + 1 위젯 수정

### A-5. electron/ → src/* 위반: 0건 (의도된 직접 import 6건)
- **위치**: `electron/ipc/board.ts:24-38`, `electron/ipc/realtimeWall.ts:23`, `electron/ipc/realtimeWallLinkPreview.ts:6`
- **현재**: `import { ManageBoard, ... } from '../../src/usecases/board';` 등 상대경로로 src/ 직접 참조
- **분석**: `electron/ipc/board.ts:5-13` 주석에 명시 — "협업 보드 infrastructure는 Node-only 의존성을 가져 renderer 번들에 포함되면 Vite 빌드 실패"
- **위반 종류**: 위반 아님. **electron 메인 프로세스가 별도의 DI 컨테이너 역할**

---

## B. DI 컨테이너 일관성

### B-1. container.ts는 정상적으로 단일 조립 지점
- **위치**: `src/adapters/di/container.ts:1-200+`
- **패턴**: `IStoragePort`(infrastructure 환경 감지) → 모든 Repository에 주입 → use case에 주입
- **`container.ts:110-114`**: `isElectron` 분기로 ElectronStorageAdapter / LocalStorageAdapter 자동 선택

### B-2. [P1] use case 인스턴스화 패턴 불일치 (3가지 혼재)

1. **container 내부 인스턴스화** (8건): `AuthenticateGoogle`, `SyncToGoogle`, `SyncFromGoogle`, `ManageCalendarMapping`, `ImportSettingsFromCloud`, `CreateAssignment`, `GetAssignments`, `GetSubmissions`, `DeleteAssignment`, `CopyMissingList` — `container.ts:97-108`에서 import 후 그대로 export
2. **store 내부 클로저 인스턴스화** (8건): `useEventsStore.ts:230-235`, `useTodoStore.ts:46-47`, `useMemoStore.ts:37-38`, `useStudentRecordsStore.ts`, `useSeatingStore.ts:9-12`, `useNeisScheduleStore.ts` — `create()` 내부에서 `new ManageEvents(...)` 호출
3. **모듈 스코프 싱글턴** (1건): `useMealStore.ts:8-9`
   ```ts
   const getMeals = new GetMeals(neisPort);
   const searchSchoolUseCase = new SearchSchool(neisPort);
   ```

- **문제**:
  - 같은 use case가 여러 store에서 import되면 매번 새 인스턴스 생성(메모리 낭비, 캐시 일관성 침해)
  - 패턴 3은 모듈 평가 시점에 인스턴스화 → 테스트에서 mock 주입 불가
  - 패턴 2는 store 마운트 시점마다 인스턴스 생성
- **개선안**: container.ts에 모든 use case 등록 (패턴 1로 통일). store는 `import { manageEvents } from '@adapters/di/container'` 한 줄
- **수정 비용**: 약 30 store에서 instantiation 라인 제거 + container에 30 export 추가

### B-3. Repository 매핑은 완전 ✅
- `domain/repositories/` 31개 인터페이스
- `adapters/repositories/` 31개 Json* 구현체
- `container.ts:60-95`에서 모든 인터페이스 → 구현체 → storage 주입 매핑 완료
- 누락 0건

### B-4. [P2] 위젯 시스템의 store 직접 의존
- 18개 위젯이 store(`useScheduleStore`, `useSettingsStore`, `useDDayStore`, ...) 직접 import
- 4개 위젯은 `@adapters/components/Dashboard/Dashboard*` 단순 re-export(`Events.tsx:4`, `Meal.tsx:4`, `Memo.tsx:4`, `StudentRecords.tsx:4`, `TodayClass.tsx:4`, `TodoWidget.tsx:4`)
- **문제**: 이중 패턴(직접 store 구독 vs 컴포넌트 위임). 새 위젯 추가 시 일관 지침 없음

---

## C. 레이어 책임 경계 침범

### C-1. [P1] 컴포넌트 → domain rule 직접 호출 (의도된 패턴)

대시보드 컴포넌트가 domain rule을 직접 import:
- `DashboardEvents.tsx:6` — `calculateDDay`
- `DashboardEvents.tsx:10` — `isUrlLike`
- `DashboardStudentRecords.tsx:4` — `sortByDateDesc`
- `DashboardTimetable.tsx:4` — `getDayOfWeek, getCurrentPeriod`
- `DashboardTodo.tsx:7-8` — `filterActive, sortTodos, getDayOfWeek`
- 위젯 8건도 동일 패턴(`DDayCounter.tsx:3`, `Bookmarks.tsx:11`, `Seating.tsx:5` 등)

- **분석**: `adapters → domain` import는 **허용된 의존성 방향**. 다만 use case 레이어가 단순 CRUD 패스스루(`ManageTodos.add(todo) → repo.save()`)에 머물러 비즈니스 규칙 합성/오케스트레이션이 불충분
- **권장**: 신규 기능 추가 시 "이 로직이 한 페이지/위젯 전용인가?"를 묻고, **여러 곳에서 합성되는 로직은 use case로 격상** 정책 추가

### C-2. [P1] presenters/는 부분적으로만 활용

- `src/adapters/presenters/`: 7개 파일 (`categoryPresenter`, `notePresenter`, `pdfTemplatePresenter`, `periodPresenter`, `timetablePresenter`)
- **사용도**:
  - `timetablePresenter`: 위젯 3개(`ClassTimetable.tsx:4`, `WeeklyTimetable.tsx:4`, `DashboardTimetable.tsx:8`)
  - `categoryPresenter`: `MiniCalendar.tsx:3`, `DashboardEvents.tsx:8`
- **부재 사례**:
  - `DashboardEvents.tsx`는 `calculateDDay`, `formatMMDD`, color/category 매핑을 컴포넌트에서 인라인 처리 (line 156~)
  - `DashboardTodo.tsx`는 `TimelineEntry` 변환을 컴포넌트에서 직접 (line 56~80)
  - `useStudentRecordsStore.ts:14-73`에는 **`RECORD_COLOR_MAP` Tailwind 클래스 매핑이 store에 박혀 있음** — 명백한 presenter 책임이 store에 누수
- **수정 비용**: 3 presenter 추가 + 5 컴포넌트 + 2 store 정리

### C-3. [P2] store가 비즈니스 로직 일부 보유
- `useEventsStore.ts:138-203` — Excel 버퍼 → ShareFile 변환 (88줄)
  - 카테고리 색상 할당 알고리즘, ID 매핑이 store에 위치
  - **개선안**: `usecases/events/ImportEventsFromExcel`로 이동
- `useEventsStore.ts:206-228` — Google sync 헬퍼 함수가 store 모듈 스코프
  - **개선안**: 이미 `SyncToGoogle` use case 존재. 그쪽으로 통합

### C-4. electron/main.ts → src/* import: 위반 없음 ✅
`electron/` 코드 전수 검사에서 `@adapters`, `@infrastructure`, `@usecases`, `@widgets` 별칭 import **0건**.

---

## D. 위젯 시스템 아키텍처

### D-1. [P1] `src/widgets/`의 레이어 위치 모호
- **현재 위치**: `src/widgets/`(`src/adapters/`와 형제)
- **tsconfig.json:24**: `"@widgets/*": ["src/widgets/*"]` 별도 alias
- **실제 의존성**:
  - `useDashboardConfig.ts:1`: `import { create } from 'zustand';` ← Zustand 사용
  - `useDashboardConfig.ts:5`: `import { useSettingsStore } from '@adapters/stores/...'` ← adapters 의존
  - `types.ts:1`: `import type { ComponentType } from 'react';` ← React 의존
  - 32개 위젯이 store 직접 구독 + presenter 호출
- **레이어 분류**: **사실상 adapters 레이어 일부**(React + Zustand 의존)
- **권장**: 현 위치 유지 + CLAUDE.md에 위치 정당성 한 줄 추가

### D-2. [P2] availableFor 필터링 로직이 사용되지 않음 (dead config)
- `types.ts:19-22`: `availableFor: { schoolLevel, role }` 필드 정의
- `registry.ts:37-40` 등 32개 위젯 정의에 `availableFor` 채워져 있음
- **검색 결과**: `Grep "availableFor"` → registry.ts와 types.ts 외 **0건**
- `WidgetSettingsPanel.tsx`(설정 UI)와 `useDashboardConfig.ts`(저장)에서 **`availableFor` 필터링 호출 없음**
- **결론**: 학교급/역할별 위젯 가시성 필터링이 의도되어 있으나 미구현
- **수정 비용**: 미사용 코드 → 사용 시 신규 rule 1개 + UI 호출 1건

### D-3. [P3] component: ComponentType은 React 정착
- `types.ts:23`: `readonly component: ComponentType;`
- 위젯이 React 컴포넌트라는 사실 자체가 위젯 시스템 설계에 박혀 있음
- **결론**: 의도된 결합. 변경 권장 없음

---

## E. 데이터 동기화 + IPC 경계

### E-1. [P1] Widget.tsx의 store load 호출 패턴 — 중앙화 부족
- **위치**: `src/adapters/components/Widget/Widget.tsx:84-92`
  ```tsx
  useEffect(() => {
    void loadSchedule();
    void useSettingsStore.getState().load();
    void loadTodos();
    void loadEvents();
    void loadMemos();
    void loadMessage();
    loadConfig();
  }, [loadSchedule, loadTodos, loadEvents, loadMemos, loadMessage, loadConfig]);
  ```
- **문제**: 7개 store load를 컴포넌트가 직접 오케스트레이션. 위젯 추가/제거 시 매번 이 useEffect 수정 필요
- **이중 마운트 비효율**: `Bookmarks.tsx:31`, `DashboardTodo.tsx:44-48`, `MemoFocus.tsx:30-32` 등 위젯 자체에서 또 load 호출
- **개선안**:
  1. `useDashboardBootstrap()` hook 신설하여 모든 visible 위젯의 의존성을 `WIDGET_DEFINITIONS`에서 추출 후 자동 load
  2. registry에 `requiredStores: string[]` 필드 추가하여 명시적 선언
- **수정 비용**: 신규 hook 1개 + Widget.tsx/Dashboard.tsx 정리

### E-2. [P1] data:changed IPC 구독이 컴포넌트 산재
`grep "onDataChanged"` 결과:
- `DashboardTimetable.tsx:51-70` — schedule + settings 직접 구독, store.setState 직접 호출
- `Widget.tsx:5건` (헤더 위젯·시계 등)
- `WidgetContextMenu.tsx:5건`

문제:
- IPC 채널 `onDataChanged`의 `filename` 문자열을 컴포넌트가 직접 매칭(`DashboardTimetable.tsx:57-60`: `filename === 'teacher-schedule' || filename === 'class-schedule' || filename === 'settings'`)
- `useScheduleStore.setState({ loaded: false })` 같은 store 내부 상태를 컴포넌트가 직접 변경 (캡슐화 위반)
- syncRegistry 패턴(usecases/sync/syncRegistry.ts)이 이미 fileName→reload 매핑을 단일화했지만, `onDataChanged` 구독은 syncRegistry를 사용하지 않고 컴포넌트가 자체 매칭

- **개선안**: `useDataChangeSubscription(fileNames: string[], onChange)` hook을 `adapters/hooks/`에 추가, 내부적으로 syncRegistry 재활용
- **수정 비용**: 신규 hook + 3 컴포넌트 정리

### E-3. preload.ts contextBridge 패턴 일관 ✅
- **위치**: `electron/preload.ts:12-` `contextBridge.exposeInMainWorld('electronAPI', {...})`
- 모든 IPC가 `window.electronAPI.xxx()` 단일 진입점
- 컴포넌트는 `window.electronAPI?.toggleWidget()` 형태로 optional chaining 일관 사용

### E-4. IStoragePort 추상화 동작 ✅
- **위치**: `container.ts:110-114` `isElectron ? new ElectronStorageAdapter() : new LocalStorageAdapter()`
- 환경 자동 감지 + 31개 Repository 모두 동일 IStoragePort 인터페이스 사용

---

## F. 종합 진단

### 의존성 위반 건수 표

| 위반 종류 | 건수 | 심각도 | 비고 |
|-----------|------|--------|------|
| domain → 외부 | **0** | — | 완벽 준수 ✅ |
| usecases → infrastructure | **6** | P0 | uuid·iCal 폴리필 (실질적으론 순수 함수) |
| usecases → adapters | **0** | — | 완벽 준수 ✅ |
| adapters → infrastructure (직접 import, container 외) | **44** | 혼재 | uuid 22(P1) + export 12(P2) + supabase 8(P2) + weather 4(P2) |
| widgets → infrastructure | **3** | P0 | uuid 1 + supabase 2 |
| widgets → adapters/di/container 직접 사용 | **1** | P1 | ConsultationWidget |
| electron → src 별칭 | **0** | — | 상대경로 6건은 domain만 참조 ✅ |

### 레이어별 건강도 (100점 만점)

| 레이어 | 점수 | 근거 |
|--------|------|------|
| **domain/** | 100 | 외부 의존 0, 31 entities + 31 repositories + 14 ports + 24 rules 모두 순수 |
| **usecases/** | 78 | 50개 use case 잘 분리. 6건 infrastructure 직접 import. CRUD 패스스루 비중 높음 |
| **adapters/** | 70 | DI 정상, 프레젠터 활용 부족, store 비즈니스 로직 누수, use case 인스턴스화 3가지 혼재, 컴포넌트 → infrastructure 32건 |
| **infrastructure/** | 92 | 포트 인터페이스 구현 완전. 단 uuid·ICalParser 위치 부적절 |
| **widgets/** | 65 | 32개 위젯 일관 패턴 부족(직접 store 8건 / Dashboard re-export 6건 / 둘 다 18건). availableFor dead. ConsultationWidget 인프라 직접 호출 |

**종합 점수**: **80/100**

### 가장 시급한 리팩토링 5건

1. **[P0] uuid 폴리필을 shared/utils로 이동** — `infrastructure/utils/uuid.ts` → `shared/utils/uuid.ts`. 영향 31파일 일괄 import 경로 치환. 1시간 작업으로 P0 위반 6건 + adapters 위반 22건 해소. **가장 큰 ROI**
2. **[P0] iCal 파서를 domain/rules로 이동** — `infrastructure/calendar/ICalParser.ts` → `domain/rules/icalParser.ts`. 영향 1파일
3. **[P1] Use case 인스턴스화를 container.ts로 통일** — store 30개의 `new XxxUseCase(...)` 패턴 제거, container에서 단일 인스턴스 export
4. **[P1] ConsultationWidget의 supabase 직접 호출 제거** — `useConsultationStore.getSlotProgress(scheduleId)` 메서드 추가. 1 store + 1 위젯
5. **[P1] data:changed IPC 구독을 hook으로 추출 + syncRegistry 재활용** — `useDataChangeSubscription(fileNames, onChange)` 신설

### 추가 권장 (P2/P3)
- export 모듈을 `IExportPort` 포트로 추상화 (12 컴포넌트)
- supabase 클라이언트를 도메인별 RemotePort로 추상화 (8 컴포넌트)
- weather 타입을 `domain/entities/Weather.ts`로 이동 (4파일)
- `useStudentRecordsStore.ts:14-73` RECORD_COLOR_MAP을 presenter로 이전
- `widgets/availableFor`를 `domain/rules/widgetRules.ts` + UI 필터링으로 활성화 또는 dead config 제거

---

## 핵심 파일 경로 색인

핵심 파일:
- `src/adapters/di/container.ts` — DI 단일 조립 지점
- `src/widgets/registry.ts` — 32 위젯 정의
- `src/widgets/useDashboardConfig.ts` — 위젯 설정 store
- `src/widgets/types.ts` — `availableFor` 미사용 필드
- `src/usecases/sync/syncRegistry.ts` — 단일 소스 동기화 (좋은 패턴)
- `electron/preload.ts` — IPC contextBridge
- `electron/ipc/board.ts:5-13` — main 프로세스 sub-DI 정당화 주석
- `tsconfig.json:21-30` — `@widgets/*`, `@shared/*` 추가 alias 정의

위반 파일(P0):
- `src/usecases/events/ImportEvents.ts:10`
- `src/usecases/events/SyncNeisSchedule.ts:14`
- `src/usecases/events/SyncExternalCalendar.ts:4`
- `src/usecases/bookmark/ManageBookmarks.ts:4`
- `src/usecases/sticker/ManageStickers.ts:15`
- `src/usecases/todo/ManageTodos.ts:4`
- `src/widgets/items/ConsultationWidget.tsx:3-4`
- `src/widgets/items/DDayCounter.tsx:10`
- `src/widgets/components/WidgetWeatherBar.tsx:4`
