# 쌤핀 모바일 앱(src/mobile/) 중복·유사 코드 전수 분석 보고서

분석 범위: `src/mobile/` 전 파일(74개 중 소스 ~65개) 실독 + 데스크톱(`src/adapters`, `src/domain`) 대조. 모든 경로는 절대경로 기준 `e:\github\ssampin\`.

정렬: **위험도 낮은 순(안전 → 주의 → 위험)**. "구조는 유사하나 통합 시 동작이 달라질 수 있는 것"은 모두 위험으로 분류했다.

---

## A. 안전 (100% 동일 / 순수 함수 / 동작 불변)

### A-1. `todayString()` 순수 함수 — 6곳 동일 + 1곳 다른 변종 ⚠️

동일 구현(`YYYY-MM-DD`)이 아래에 그대로 복사되어 있음:

- `src\mobile\stores\useMobileAttendanceStore.ts:18-24`
- `src\mobile\stores\useMobileProgressStore.ts:10-13`
- `src\mobile\pages\AttendanceCheckPage.tsx:70-76`
- `src\mobile\pages\TodoPage.tsx:15-21`
- `src\mobile\pages\StudentsPage.tsx:1559-1561`
- `src\mobile\components\Class\ClassObservationTab.tsx:30-33`
- `src\mobile\components\Today\MobileProgressLogModal.tsx:40-43`

동일성: 위 7개는 로직 100% 동일(한 줄 표현 vs 다줄 표현 차이만 있음).
**위험 요소**: `src\mobile\stores\useMobileMealStore.ts:15-21` 의 `todayString()` 는 **하이픈 없는 `YYYYMMDD`** 를 반환한다(NEIS API 포맷). 이름이 같으므로 무심코 단일 유틸로 합치면 급식 조회가 깨진다 → **MealStore 것은 통합 대상에서 제외**하거나 `todayCompact()` 등 별칭 필요.
통합 제안: `@domain` 또는 `@mobile/utils/date.ts` 에 `todayISO()` 하나로. 위험도: **안전**(6곳), MealStore만 **위험**.

### A-2. `formatDateLabel()` + `DAY_LABELS` — 2곳 완전 동일

- `src\mobile\components\Class\ClassProgressTab.tsx:20-25`
- `src\mobile\components\Class\ClassObservationTab.tsx:23-28`

`const DAY_LABELS = ['일',...,'토']` 와 `formatDateLabel(dateStr)` 가 문자 단위로 동일. 위험도: **안전**.

### A-3. `ActionSheet` 보조 컴포넌트 — 2곳 바이트 단위 동일

- `src\mobile\components\Class\ClassProgressTab.tsx:294-336`
- `src\mobile\components\Class\ClassObservationTab.tsx:402-444`

`useBottomSheet()` + 백드롭 + 드래그핸들 + 편집/삭제/취소 버튼까지 props 시그니처(`onEdit/onDelete/onClose`)와 className 전부 동일. 100% 동일. 위험도: **안전**. → `components/common/ActionSheet.tsx` 로 추출.

### A-4. 로딩 스피너 블록 — 10개 파일 반복

`<div class="flex ... h-32"><span class="material-symbols-outlined ... animate-spin">progress_activity</span></div>` 패턴이 `ClassProgressTab.tsx:145-152`, `ClassObservationTab.tsx:89-96`, `MemoPage.tsx:282-287`, `MobileProgressLogModal`, `App.tsx`, `ClassListPage.tsx`, `SettingsPage.tsx`, `ToolSurveyPage.tsx`(x3), `ToolAssignmentPage.tsx`(x3) 등 총 16회(`progress_activity` grep 기준). 위험도: **안전**(순수 프레젠테이션). → `<Spinner/>` 공용화.

### A-5. 햅틱 진동 헬퍼 — 2곳 동일 로직

- `src\mobile\components\SwipeRow\SwipeRow.tsx:7-13` (`haptic()`)
- `src\mobile\components\Class\ClassProgressEntryItem.tsx:46-49` (인라인 `navigator.vibrate(10)`)

동일 가드(`'vibrate' in navigator`)·동일 값(10ms). 위험도: **안전**. → `utils/haptic.ts`.

---

## B. 주의 (파라미터/데이터 형태만 다름 — 통합 가능하나 제네릭화 필요)

### B-1. Store `load`/`reload` 보일러플레이트 — 12개 스토어

가장 큰 중복. 아래 스토어가 **동일 골격**을 공유:

```
loaded:false
load: async () => { if (get().loaded) return; try { const data = await repo.getX(); if (data) set({X:..., loaded:true}); else set({loaded:true}); } catch { set({loaded:true}); } }
reload: async () => { set({loaded:false}); await get().load(); }
```

- `useMobileStudentStore.ts:16-33` (단순형, `data` 그대로)
- `useMobileScheduleStore.ts:17-34`
- `useMobileSeatingStore.ts:20-37`
- `useMobileTeachingClassStore.ts:17-34` (`data?.classes` 접근)
- `useMobileEventsStore.ts:22-43` (2필드 set)
- `useMobileMemoStore.ts:20-37` (`data?.memos`)
- `useMobileTodoStore.ts:23-40` (`data?.todos` + categories)
- `useMobileObservationStore.ts:36-49` (usecase `.getAll()` 사용, try만)
- `useMobileProgressStore.ts:48-61` (usecase, try만)
- `useMobileAttendanceStore.ts:30-43` (usecase, try만)
- `useMobileAssignmentStore.ts:30-47` (`storage.read`)
- `useMobileSurveyToolStore.ts:47-71` (2필드)

동일성: **구조 동일, 세부 상이**. 크게 두 변종 — (a) `if(get().loaded)` 가드 + `if(data)` 분기형, (b) usecase `.getAll()` 를 쓰며 `else` 분기 없는 형(Observation/Progress/Attendance). `reload`는 12곳 전부 100% 동일.
**주의 포인트**: `useMobileStudentRecordsStore.ts:48-61` 의 load 는 `migrateStudentRecordsOnLoad()`(마이그레이션 부수효과)를 호출하고, `useMobileSettingsStore.ts:77-132` 의 load 는 deviceId 패치·NEIS 파싱 등 대규모 커스텀 로직이 있어 **이 둘은 제네릭 대상 제외**.
통합 제안: `createLoadable(repoFn, mapData)` 팩토리. `reload`는 완전 공유 가능. 위험도: **주의**(데이터 매핑 콜백만 다름; 마이그레이션/Settings 2개 제외 시 안전에 가까움).

### B-2. CRUD + `triggerSaveSync()` 패턴 — 6개 스토어, 25회 호출

`add/update/delete` 가 `낙관적 set` → `repo.save()` → `useMobileDriveSyncStore.getState().triggerSaveSync()` 순서로 반복:

- `useMobileMemoStore.ts:39-60` (add/update/delete, 3회)
- `useMobileTodoStore.ts:42-79` (add/toggle/delete/toggleSubTask, 4회)
- `useMobileEventsStore.ts:45-57` (add/delete, 2회)
- `useMobileProgressStore.ts:76-115` (4회)
- `useMobileObservationStore.ts:58-93` (3회)
- `useMobileStudentRecordsStore.ts:75-119` (4회)
- `useMobileSurveyToolStore.ts:104-109` 은 예외적으로 **동적 import + try/catch** 로 trigger (다른 곳은 정적 import 직접호출)

동일성: **구조 유사, 세부 상이**(엔티티별 필드·저장 payload 다름, Memo는 저장 전 `updatedAt` 갱신, Survey는 동적 import). 위험도: **주의** — 저장 호출 순서/낙관적 업데이트 타이밍이 미묘하게 달라 일괄 추상화 시 회귀 위험. 최소한 `triggerSaveSync()` 호출부만 헬퍼화는 안전.

### B-3. `ClassAttendanceCard` ↔ `HomeroomAttendanceCard` — 거의 동일 카드

- `src\mobile\components\Today\ClassAttendanceCard.tsx:9-43`
- `src\mobile\components\Today\HomeroomAttendanceCard.tsx:10-47`

present/absent/late 계산(`filter(s=>s.status===...)`)·3열 통계 블록·"체크하기" 버튼 className 까지 동일. **차이는 단 하나**: Homeroom 은 `totalStudents>0` 일 때 "전체 N명" 줄(`:18-20`)이 추가. 동일성: **파라미터만 다름**. 위험도: **주의** — prop(`todayRecord` vs `attendanceRecord`) 이름과 전체명 줄만 다르므로 `AttendanceSummaryCard` 하나로 통합 가능, 단 미묘한 prop 이름 통일 필요.

### B-4. present/absent/late(+earlyLeave/classAbsence) 카운팅 — 3곳

- `ClassAttendanceCard.tsx:10-12`, `HomeroomAttendanceCard.tsx:11-13` (3종)
- `AttendanceCheckPage.tsx:344-349` (5종, `values.filter(s=>s==='present')` 형태)
- `StudentsPage.tsx` (status 매핑 사용)

동일성: **구조 유사, 세부 상이**(대상이 `record.students` vs `Map.values()`, 상태 개수 3 vs 5). 위험도: **주의** — 순수 집계 함수 `countByStatus(records)` 로 추출 가능하나 입력 형태가 달라 어댑터 필요.

### B-5. 바텀시트/모달 래퍼 셸 — 7+ 곳 반복

`fixed inset-0 z-50 flex items-end ... bg-black/40 backdrop-blur-sm` + `rounded-t-2xl pb-[env(safe-area-inset-bottom)]` + 드래그핸들(`w-12 h-1 bg-sp-border`) 패턴:

- `ClassProgressTab.tsx` (ActionSheet, ConfirmDelete)
- `ClassObservationTab.tsx` (ObservationSheet:309-321, ActionSheet, ConfirmDelete)
- `components\Students\PraiseMemoSheet.tsx:46-56`
- `pages\MemoPage.tsx:66-67, 149-150` (AddModal/EditModal)
- `pages\TodoPage.tsx:74-75`
- `components\Today\MobileProgressLogModal.tsx:208-214`
- `pages\AttendanceCheckPage.tsx:595-607` (multi-date sheet)

동일성: **구조 유사, 세부 상이**. **위험 요소**: z-index 가 제각각(`z-50` vs PraiseMemoSheet `z-[55]` vs multi-date `z-[80]`), 정렬이 `items-end` vs `items-end sm:items-center` vs `items-center`, 백드롭 투명도 `/40` vs `/60`. 공용 `<BottomSheet>` 로 묶되 **이 세부값들을 prop 으로 보존하지 않으면 레이어 겹침/애니메이션 회귀**. 위험도: **주의~위험**.

### B-6. 빈 상태(Empty State) 블록 — 3곳

아이콘 + 안내문 + "첫 X 추가/작성/기록" 버튼:

- `MemoPage.tsx:288-298` ("첫 메모 작성")
- `ClassProgressTab.tsx:199-209` ("첫 진도 기록")
- `ClassObservationTab.tsx:148-158` ("첫 기록 추가")

동일성: **구조 동일, 라벨만 상이**. 위험도: **주의**(순수 UI, `<EmptyState icon text actionLabel onAction/>` 로 안전 추출 가능).

### B-7. localStorage read/write 헬퍼 — 2 스토어

- `useMobileHomeLayoutStore.ts:19-37` (`readRecord`/`writeRecord`, `Record<string,boolean>`)
- `useMobileSettingsStore.ts:41-56` (`readAutoSyncInterval`/`writeAutoSyncInterval`, number)
- `useMobileDriveSyncStore.ts:10-27` (`getMobileDeviceId`, string + 생성)

동일성: **패턴 동일(try/catch 감싼 localStorage), 타입만 상이**. 위험도: **주의** — 제네릭 `safeLocalStorage<T>` 로 통합 가능하나 각자 파싱/기본값 로직이 달라 큰 이득은 적음.

### B-8. 롱프레스 타이머 로직 — 2곳

- `ClassProgressEntryItem.tsx:39-59` (`startLongPress`/`cancelLongPress`, 500ms + 햅틱 + fired ref)
- `MemoPage.tsx:249-260` (동일 골격, 햅틱·fired 없음)

동일성: **구조 유사, 세부 상이**. 위험도: **주의** — `useLongPress(onLongPress, {ms:500})` 훅으로 통합 권장(현재 `hooks/` 에 없음).

---

## C. 위험 (구조 유사하나 통합 시 동작 변경 위험 — 신중히)

### C-1. `ConfirmDeleteDialog` — 2곳, 구조 동일하나 문구·데이터 결합

- `ClassProgressTab.tsx:344-378` (title "진도 항목 삭제", 본문 `{entry.unit}({entry.period}교시)`)
- `ClassObservationTab.tsx:452-486` (title "기록 삭제", 본문 `{formatDateLabel(record.date)}의 기록`)

셸·버튼·className 은 동일하나 **prop 타입(`entry` vs `record`)과 본문 렌더가 데이터 결합**. 위험도: **위험(경미)** — 제네릭 `<ConfirmDialog title message onConfirm onCancel/>` 로 바꾸면 안전하지만, 현재처럼 엔티티를 통째로 받는 시그니처를 유지하면 안 됨(호출부 수정 필요). 문구가 살짝 달라질 여지 → 회귀 검증 대상.

### C-2. `useMobileDriveSyncStore` ↔ 데스크톱 `useDriveSyncStore` (item 5 핵심)

- 모바일: `src\mobile\stores\useMobileDriveSyncStore.ts` (290줄)
- 데스크톱: `src\adapters\stores\useDriveSyncStore.ts` (503줄)

모바일이 데스크톱 스토어를 **축약 재구현**: `SyncToCloud`/`SyncFromCloud` usecase 는 공유하지만, 모바일은 (a) `SyncResult` 타입을 데스크톱에서 **import**(`useMobileDriveSyncStore.ts:7`), (b) 자체 `getMobileDeviceId()`, (c) `reloadAllStores()`(`:30-88`, 14개 모바일 스토어 동적 import) 를 데스크톱의 `reloadStores`(`useDriveSyncStore.ts:199,277` — `@adapters/hooks/useDriveSync`) 와 **병렬로 별도 구현**, (d) 모바일 전용 에러문구/`INVALID_GRANT` 처리, `triggerSaveSync` 디바운스(5초), `flushSync`.
동일성: **구조 유사, 세부 대폭 상이**. 위험도: **위험** — 인증 만료 처리·디바운스·스토어 리로드 목록이 플랫폼별로 달라 단일화 시 동기화 회귀 직결. **통합 후보로만 표시**, 데스크톱 코드 수정 금지 전제상 공통 코어(usecase 호출부)만 얇게 공유 검토.

### C-3. 모바일 스토어 ↔ 데스크톱 스토어 전반 재구현 (item 5)

모바일 `useMobileTodoStore`(80줄) vs 데스크톱 `useTodoStore`(352줄), 모바일 `useMobileMemoStore`(61줄) vs 데스크톱 `useMemoStore`(287줄) 등. **같은 repository/usecase/entity(@domain)를 재사용**하되 모바일은 기능 축소판(Todo: Google Tasks 연동·아카이브·서브태스크 CRUD·정렬 전부 없음 / Memo: 위치·이미지·그리드정렬 없음).
동일성: **동일 도메인, 기능 집합 상이**. 위험도: **위험** — 겉보기 중복이나 모바일이 의도적으로 기능을 뺀 것. 억지 통합 시 모바일에 원치 않는 데스크톱 부수효과(예: `pendingRemoteOp`, `enqueueRemoteDeletes`) 유입 → **통합 부적합**. 보고서상 "중복이지만 통합 금지" 로 명시.

### C-4. `ATTENDANCE_STATUS_LABEL` 매핑 — 스토어 내 지역 상수

- `src\mobile\stores\useMobileStudentRecordsStore.ts:15-20` (`absent:'결석', late:'지각', earlyLeave:'조퇴', classAbsence:'결과'`)
- `src\mobile\pages\AttendanceCheckPage.tsx:39-68` `STATUS_CONFIG` 의 label 과 **값이 동일**(단, 여기엔 아이콘·색상 포함, present 포함)

동일성: **라벨 값 동일, 구조 상이**. 위험도: **위험(경미)** — 도메인(`@domain/entities/Attendance`)에 이미 유사 상수가 있을 수 있어(데스크톱 `attendanceRules.ts` 존재) 3중 정의 가능성. 단일화하려면 도메인 단일소스 확인 필요 → 무단 통합 시 라벨/색상 결합이 깨질 수 있음.

### C-5. 인라인 세그먼트 탭 vs 공용 `SegmentedControl` (item 2)

공용 컴포넌트 `components\common\SegmentedControl.tsx`(pill 스타일, `role=tablist`)가 있으나:

- `src\mobile\pages\ClassDetailPage.tsx:46-70` 은 **인라인으로** `role="tablist"`+`role="tab"` 하단보더(`border-b-2`) 탭을 직접 구현 (공용 미사용)
- `src\mobile\components\More\SyncStatus.tsx:163-181` 자동동기화 간격 선택을 인라인 pill 버튼으로 구현 (SegmentedControl 미사용)
- `ClassObservationTab.tsx:107-125` 학생 선택 칩, `MobileProgressLogModal` `<select>` 등도 유사 토글 UI

동일성: **기능 유사, 시각 스타일 상이**. 위험도: **위험** — ClassDetailPage 는 "하단 보더 탭"(3개, 스와이프 제거 주석 존재)이고 SegmentedControl 은 "pill". 억지로 공용화하면 **디자인/접근성 속성이 바뀌어 시각 회귀**. "동작 완전 보존" 원칙상 통합 부적합 또는 SegmentedControl 에 variant 추가 필요.

### C-6. 두 개의 Sync 상태 UI — `SyncStatusBanner` vs `More/SyncStatus`

- `src\mobile\components\Today\SyncStatusBanner.tsx` (131줄, 홈 상단 배너: syncing/error/success)
- `src\mobile\components\More\SyncStatus.tsx` (185줄, 더보기 탭 전체 패널: 계정·업/다운로드·충돌·자동동기화)

둘 다 같은 `useMobileDriveSyncStore` 상태(state/progress/error/lastSyncedAt)를 구독해 **syncing 진행바·error 표시**를 각자 그림(진행바 마크업 유사: `SyncStatusBanner:58-63` vs `SyncStatus:101-109`). 동일성: **부분 중복(상태 표시 로직), 목적 상이**. 위험도: **위험** — 용도(배너 vs 설정패널)가 달라 통합보다 "상태→표시" 파생 훅(`useSyncStatusView()`) 공유가 적절. 전면 통합 시 회귀.

---

## 요약 우선순위 표

| #   | 후보                           | 파일 수    | 동일성       | 위험도     | 즉시 통합 권장    |
| --- | ------------------------------ | ---------- | ------------ | ---------- | ----------------- |
| A-1 | `todayString()`                | 7(+1 변종) | 100%(6)      | 안전       | ✅ (Meal 제외)    |
| A-2 | `formatDateLabel`/`DAY_LABELS` | 2          | 100%         | 안전       | ✅                |
| A-3 | `ActionSheet`                  | 2          | 100%         | 안전       | ✅                |
| A-4 | 로딩 스피너                    | 10+        | 100%         | 안전       | ✅                |
| A-5 | 햅틱 헬퍼                      | 2          | 100%         | 안전       | ✅                |
| B-1 | store load/reload              | 12         | 구조동일     | 주의       | ⚠️ (2개 제외)     |
| B-2 | CRUD+triggerSaveSync           | 6          | 구조유사     | 주의       | ⚠️ 부분           |
| B-3 | 출결 요약 카드                 | 2          | 파라미터차   | 주의       | ⚠️                |
| B-4 | 출결 상태 카운팅               | 3          | 구조유사     | 주의       | ⚠️ 어댑터         |
| B-6 | 빈 상태 블록                   | 3          | 라벨차       | 주의       | ✅                |
| B-5 | 바텀시트 셸                    | 7+         | 구조유사     | 주의~위험  | ⚠️ prop 보존 필수 |
| B-7 | localStorage 헬퍼              | 3          | 패턴동일     | 주의       | ⚠️ 이득 적음      |
| B-8 | 롱프레스 타이머                | 2          | 구조유사     | 주의       | ⚠️ 훅화           |
| C-1 | ConfirmDeleteDialog            | 2          | 구조동일     | 위험(경미) | ⚠️ 시그니처 변경  |
| C-2 | 모바일 vs 데스크톱 DriveSync   | 2          | 세부대폭상이 | 위험       | ❌ 코어만         |
| C-3 | 모바일 vs 데스크톱 스토어      | 다수       | 기능축소판   | 위험       | ❌ 통합금지       |
| C-4 | 출결 라벨 상수 3중 정의        | 3          | 값동일       | 위험(경미) | ⚠️ 도메인 확인    |
| C-5 | 인라인 탭 vs SegmentedControl  | 3+         | 스타일상이   | 위험       | ❌/variant        |
| C-6 | SyncStatusBanner vs SyncStatus | 2          | 부분중복     | 위험       | ⚠️ 훅만           |

**핵심 권고**: A 그룹(순수함수·완전동일 컴포넌트) + B-6/B-3 부터 착수하면 동작 보존이 쉽고 즉효. B-1 store 보일러플레이트는 최대 감축 효과(~12파일)지만 `useMobileStudentRecordsStore`(마이그레이션)·`useMobileSettingsStore`(deviceId/NEIS)·`useMobileMealStore`(포맷 상이)를 반드시 제외해야 회귀가 없다. C 그룹은 "중복이나 통합 시 동작 변경" — 데스크톱 수정 금지 전제와 결합해 통합 보류/코어 공유만 검토.
