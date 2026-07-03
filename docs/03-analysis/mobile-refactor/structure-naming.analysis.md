보고서는 파일로 저장하지 않았다(읽기 전용 분석이므로 파일 생성 없음). 작성한 7개 항목 전문을 그대로 재전달한다.

---

# 쌤핀 모바일 앱 (`src/mobile/`) 구조·네이밍 전수 분석 보고서

> 읽기 전용 분석. 모든 경로는 절대경로 기준, 근거는 라인 번호 포함. 실제로 읽은 파일에 근거한 내용만 담았다. 저장 파일 없음(파일 미생성).

## 1. 디렉토리 트리 및 각 파일 역할

진입점: `E:\github\ssampin\mobile.html` (line 30 → `/src/mobile/main.tsx`), 빌드 설정 `E:\github\ssampin\vite.mobile.config.ts`.

```
src/mobile/
├── main.tsx                     진입점. isSignatureRoute() 분기로 StudentSignatureApp(lazy) 또는 App 마운트
├── App.tsx                      루트 셸: 탭바 + 세그먼트 + more 서브라우팅 + OAuth 콜백 + 테마
├── __tests__/
│   └── bottomSheetCoverage.meta.test.ts   바텀시트 커버리지 메타 테스트
├── pages/                       화면 단위 (탭/세그먼트/서브뷰)
│   ├── AttendanceCheckPage.tsx            전체화면 출결 체크(탭바 숨김)
│   ├── AttendanceCheckPage.multiDate.test.ts
│   ├── ClassListPage.tsx                  수업(교과) 반 목록 → ClassDetailPage
│   ├── ClassDetailPage.tsx                수업 반 상세(진도/관찰/출결 탭)
│   ├── MemoPage.tsx                       메모 (onBack prop)
│   ├── MorePage.tsx                       더보기 메뉴 허브 (onNavigate)
│   ├── SchedulePage.tsx                   일정(캘린더)
│   ├── SettingsPage.tsx                   설정 (onBack)
│   ├── StudentsPage.tsx                   담임 학생 관리
│   ├── TodoPage.tsx                       할 일
│   ├── ToolAssignmentPage.tsx            쌤도구-과제수합
│   ├── ToolSurveyPage.tsx                쌤도구-설문
│   └── ToolsOverviewPage.tsx            쌤도구 개요 그리드
├── components/
│   ├── Class/     ClassAttendanceTab, ClassObservationTab, ClassProgressTab, ClassProgressEntryItem
│   ├── Today/     TodayHub, CurrentClassCard, ClassAttendanceCard, HomeroomAttendanceCard,
│   │              MealCard, WeatherCard, SyncStatusBanner, MobileProgressLogModal
│   ├── Students/  PraiseMemoSheet, SwipeHintBanner
│   ├── More/      SyncStatus
│   ├── Onboarding/ OnboardingFlow, InstallGuide, NavMigrationCoachmark
│   ├── Settings/  PeriodTimesEditor
│   ├── Share/     MobileShareModal
│   ├── SwipeRow/  SwipeRow, SwipeUndoToast, useSwipeRowStore, useSwipeUndoStore  ← 컴포넌트 폴더에 store 혼재
│   ├── common/    CollapsibleCard, SegmentedControl, Toggle
│   ├── ErrorBoundary.tsx
│   ├── InAppBrowserBanner.tsx
│   └── QuickAddFab.tsx
├── stores/                      Zustand 스토어 (useMobileXxxStore 규칙)
│   ├── useMobileAssignmentStore, useMobileAttendanceStore, useMobileDriveSyncStore,
│   │   useMobileEventsStore, useMobileHomeLayoutStore, useMobileMealStore, useMobileMemoStore,
│   │   useMobileObservationStore, useMobileProgressStore, useMobileScheduleStore,
│   │   useMobileSeatingStore, useMobileSettingsStore, useMobileStudentRecordsStore,
│   │   useMobileStudentStore, useMobileSurveyToolStore, useMobileTeachingClassStore,
│   │   useMobileTodoStore, useMobileUiTriggerStore
│   ├── useBottomSheetStore.ts + .test.ts   ← Mobile 접두어 없음(예외)
├── hooks/       useBottomSheet, useCurrentPeriod, useGoogleAuth, usePKCE, useSyncTrigger
├── contexts/    GoogleAuthContext.tsx
├── di/          container.ts   모바일 전용 DI (IndexedDB 기반, Electron 제외)
└── styles/      mobile.css
```

주의점:

- `TodayHub`는 `pages/`가 아니라 `components/Today/TodayHub.tsx`에 있다(App.tsx:8에서 import).
- `SwipeRow/` 폴더에 컴포넌트와 Zustand 스토어(`useSwipeRowStore.ts`, `useSwipeUndoStore.ts`)가 혼재 — stores/ 규칙과 불일치.

## 2. 라우팅 방식

**react-router 미사용. 순수 React `useState` 기반 자체 상태 라우팅.** 근거: `src/mobile/App.tsx`.

세 종류의 진입 분기:

1. **최상위 진입점 분기** (`src/mobile/main.tsx:35`): `isSignatureRoute()` → `true`면 `StudentSignatureApp`(익명 서명 페이지 `/sign/{code}`), 아니면 `GoogleAuthProvider > App`. 유일하게 URL 경로(`/sign/...`)를 실제로 읽는 지점 (`../signature/signatureRoute`, main.tsx:6).
2. **App 내부 탭/뷰 상태** (React state, URL 미반영):
   - `activeTab: MobileTab` = `'home' | 'students' | 'schedule' | 'more'` (App.tsx:74, 84-89). 하단 탭바 4개.
   - `studentsSeg: 'homeroom' | 'teaching'` (App.tsx:75, 91-94) — 학생 탭 내 세그먼트 (담임/수업).
   - `scheduleSeg: 'schedule' | 'todo'` (App.tsx:76, 96-99) — 일정 탭 내 세그먼트 (일정/할 일).
   - `moreSub` (App.tsx:115-131): `'settings' | 'memo' | 'tools' | 'tool-assignment' | 'tool-survey' | 'tool-traffic-light' | 'tool-dice' | 'tool-coin' | 'tool-scoreboard' | 'tool-timer' | 'tool-work-symbols' | 'tool-random' | 'tool-roulette' | 'tool-qrcode' | null` — 더보기 탭의 서브 라우팅. 거대한 삼항 연산자 체인(App.tsx:404-456)으로 렌더.
   - `attendanceNav: AttendanceNav | null` (App.tsx:113, 101-106) — 전체화면 출결 페이지 오버레이(탭바 숨김, App.tsx:277-287).
3. **OAuth 콜백**: URL `?code=` / `?error=` 쿼리만 읽고 `window.history.replaceState({}, '', '/')`로 정리 (App.tsx:207-242). 라우팅 목적 아님.

라우트/뷰 "경로" 네이밍 목록 (URL 아님, 상태 키):

- 탭: `home`, `students`, `schedule`, `more`
- 세그먼트: `homeroom`/`teaching`, `schedule`/`todo`
- more 서브: `settings`, `memo`, `tools`, `tool-assignment`, `tool-survey`, `tool-traffic-light`, `tool-dice`, `tool-coin`, `tool-scoreboard`, `tool-timer`, `tool-work-symbols`, `tool-random`, `tool-roulette`, `tool-qrcode`
- FAB 액션 트리거: `add-event`, `add-todo`, `memo` (App.tsx:290-327; `useMobileUiTriggerStore.requestAction`으로 크로스컴포넌트 전달)

관찰: URL 상태 미동기화 → 딥링크/뒤로가기 불가(각 화면이 `onBack` 콜백으로 자체 관리). 글로벌 스와이프 탭 전환은 제거됨(App.tsx:370-371 주석).

## 3. 네이밍 컨벤션 현황

**스토어 파일**: `useMobileXxxStore.ts` 규칙이 stores/에서 지배적(18개). 예외:

- `src/mobile/stores/useBottomSheetStore.ts` — `Mobile` 접두어 없음.
- `src/mobile/components/SwipeRow/useSwipeRowStore.ts`, `useSwipeUndoStore.ts` — `Mobile` 접두어 없음 + `stores/`가 아닌 `components/` 하위에 위치.

**훅 파일**: `hooks/`는 `useXxx` (접두어 Mobile 없음): `useBottomSheet`, `useCurrentPeriod`, `useGoogleAuth`, `usePKCE`, `useSyncTrigger`. → 스토어(`useMobileXxx`)와 훅(`useXxx`) 네이밍 정책이 서로 다름.

**페이지**: `XxxPage.tsx` 규칙 일관 (단, TodayHub만 Page가 아니고 components/Today에 위치).

**컴포넌트 폴더 분류 기준 — 혼합 축**:

- 기능/화면 도메인 축: `Today/`, `Class/`, `Students/`, `Onboarding/`, `Settings/`, `Share/`, `More/`
- UI 패턴 축: `SwipeRow/`, `common/`
- 미분류(루트 직속): `ErrorBoundary.tsx`, `InAppBrowserBanner.tsx`, `QuickAddFab.tsx`
- 비일관성: 담임 학생 화면은 `pages/StudentsPage.tsx`인데 관련 컴포넌트 폴더는 `components/Students/`; 수업 반은 `pages/ClassListPage.tsx`+`components/Class/`. "Today" 도메인은 페이지가 아니라 `components/Today/TodayHub.tsx`가 실질 페이지 역할.
- `More/`에는 `SyncStatus.tsx` 하나뿐이고 MorePage 자체는 `pages/`에 있음(폴더 경계 모호).

## 4. API / 외부 호출

모바일은 직접 fetch를 거의 하지 않고 `@infrastructure/*` 어댑터 + `di/container`를 경유한다.

**Supabase Edge Functions** (`src/infrastructure/supabase/AssignmentSupabaseClient.ts`):

- 베이스: `${VITE_SUPABASE_URL}/functions/v1/{fn}` (AssignmentSupabaseClient.ts:57), 헤더 `apikey`+`Authorization: Bearer` (63-64).
- 모바일이 실제 사용: `get-submissions` (`useMobileAssignmentStore.ts:65` → `getSubmissions`). 클라이언트에 정의된 다른 함수: `create-assignment`(83), `delete-assignment`(98), `save-teacher-token`(185).
- OAuth 교환: `oauth-exchange` Edge Function — `src/infrastructure/google/GoogleOAuthBrowserClient.ts:45` (`${supabaseUrl}/functions/v1/oauth-exchange`, 호출 74). client_secret은 서버에서만(vite.mobile.config.ts:154-160 주석).

**Supabase REST (PostgREST)** — 설문 (`src/infrastructure/supabase/SurveySupabaseClient.ts`):

- `${baseUrl}/rest/v1/surveys` (line 93, 125), `${baseUrl}/rest/v1/survey_responses` (160, 191, 220). anon key 직접 호출(RLS public). 모바일 사용처: `useMobileSurveyToolStore.ts` (import SurveyResponsePublic, line 8).

**저장소 `supabase/functions/` 전체 목록** (배포됨): `create-assignment`, `delete-assignment`, `get-assignment-public`, `get-submissions`, `oauth-exchange`, `save-teacher-token`, `sig-*`(서명 세션 8종: close/delete-session/delete-signatures/get-public/publish/reopen/status/submit), `ssampin-chat`, `ssampin-embed`, `ssampin-escalate`, `submit-assignment`. → 모바일 교사앱이 직접 쓰는 것: `get-submissions`, `oauth-exchange` (+설문은 REST). `sig-*`는 `StudentSignatureApp`(익명 서명 경로) 쪽.

**Google APIs** (`src/infrastructure/google/`):

- OAuth: `accounts.google.com/o/oauth2/v2/auth`, `oauth2.googleapis.com/revoke`, `googleapis.com/oauth2/v2/userinfo` (GoogleOAuthBrowserClient.ts:13-15). 스코프 `drive.file`, `userinfo.email` (33-34).
- Drive Sync: `googleapis.com/drive/v3` + `upload/drive/v3` (DriveSyncAdapter.ts:14-15). 모바일 동기화는 `DriveSyncAdapter`만 사용(di/container.ts:28,87). **Google Tasks/Calendar/Slides API는 모바일 미사용** — `GoogleCalendarApiClient`, `GoogleSlidesApiClient` 존재하나 모바일 import 없음(grep 결과 mobile에서 참조 없음).

**NEIS (급식)**: `NeisApiClient` (di/container.ts:78, `neisPort`). 베이스 `open.neis.go.kr/hub`(Electron) / `/neis-api/hub`(웹 프록시, NeisApiClient.ts:52). vite 프록시 `/neis-api → open.neis.go.kr` (vite.mobile.config.ts:141-145). 모바일 사용: `useMobileMealStore.ts:4,7,31` (`GetMeals(neisPort)`, `NEIS_API_KEY`).

**날씨/대기질**: `src/infrastructure/weather/index.ts` — WeatherAPI.com. 베이스 `api.weatherapi.com`(Electron) / `/weather-api`(웹, weather/index.ts:75), 대기질 `air_quality`(37,91). vite 프록시 `/weather-api → api.weatherapi.com` (vite.mobile.config.ts:146-150). 모바일 사용: `components/Today/WeatherCard.tsx:2-3` (`fetchWeather`, `WeatherData`, `AirQualityGrade`).

**KakaoTalk 공유**: `mobile.html:29`가 kakao SDK 로드, `components/Share/MobileShareModal.tsx:24,62-78` (`window.Kakao.Share.sendDefault`). 타입은 `src/types/kakao.d.ts`.

## 5. `src/mobile`이 공용 레이어(`src/`)에서 import하는 것 전수

경로 alias(`@domain` 등, 섹션 6)로만 크로스 레이어 참조. `from '../'`(상대경로 상위) 참조는 **`main.tsx`의 3건뿐**: `../index.css`(main.tsx:7), `../signature/signatureRoute`(main.tsx:6), `../student/StudentSignatureApp`(main.tsx:15 dynamic). 나머지는 전부 alias.

**`@domain/` (도메인 레이어 — 가장 광범위한 의존)**:

- ports: `IStoragePort`, `INeisPort`, `IGoogleAuthPort`(+`GoogleAuthTokens`), `IDriveSyncPort` (container.ts:5-6,20-21; useGoogleAuth.ts:2)
- repositories 인터페이스 17종: `IScheduleRepository`~`IObservationRepository` (container.ts:7-23)
- entities: `Attendance`(+ATTENDANCE_REASONS), `TeachingClass`(+studentKey), `Observation`(+DEFAULT_OBSERVATION_TAGS), `CurriculumProgress`, `Timetable`(TeacherScheduleData/TeacherPeriod/ClassScheduleData), `Assignment`(+Submission), `SchoolEvent`(+DEFAULT_CATEGORIES), `Meal`(+NEIS_API_KEY), `Memo`, `Todo`, `Student`, `StudentRecord`, `Seating`, `Survey`, **`Settings`**(useMobileSettingsStore.ts:3)
- valueObjects: `PeriodTime`, `DayOfWeek`, `MemoColor`(+MEMO_COLORS), `MemoFontSize`, `RecordCategory`
- rules: `periodRules`(getCurrentPeriod/getDayOfWeek/parseMinutes), `studentActivity`(isStudentActive), `progressMatching`, `matchingRules`(isSubjectMatch), `timetableRules`(createEmptyTeacherSchedule)

**`@usecases/`**: `classManagement/ManageAttendance`, `ManageObservations`, `ManageCurriculumProgress`; `sync/SyncToCloud`, `sync/SyncFromCloud`; `meal/GetMeals`; `studentRecords/ManageStudentRecords`, `MigrateStudentRecordsSubcatToTags` (각 store 파일).

**`@infrastructure/`**: `storage/IndexedDBStorageAdapter`(+readAuth/writeAuth/deleteAuth), `neis/NeisApiClient`, `google/GoogleOAuthBrowserClient`, `google/DriveSyncAdapter`, `supabase/AssignmentSupabaseClient`, `supabase/SurveySupabaseClient`(+SurveyResponsePublic 타입), `browser/detectInAppBrowser`, `utils/uuid`(generateUUID), `weather`(fetchWeather/WeatherData/AirQualityGrade).

**`@adapters/` (데스크톱 공용 어댑터에 직접 의존 — 리팩토링 주의 지점)**:

- `@adapters/repositories/Json*Repository` 17종 (container.ts:30-44) — 데스크톱과 동일 Json 리포지토리 재사용
- `@adapters/stores/useDriveSyncStore` — 타입 `SyncResult`만 (useMobileDriveSyncStore.ts:7)
- `@adapters/stores/useSettingsStore` — 값 사용 (StudentsPage.tsx:11) **← 데스크톱 Zustand 스토어를 모바일 페이지가 직접 사용**
- `@adapters/components/common/MultiDatePicker` (AttendanceCheckPage.tsx:18)
- `@adapters/components/common/SyncResultSummary` (More/SyncStatus.tsx:4)
- `@adapters/components/Tools/*` — 9개 쌤도구 컴포넌트 lazy import: ToolTrafficLight, ToolDice, ToolCoin, ToolScoreboard, ToolTimer, ToolWorkSymbols, ToolRandom, ToolRoulette, ToolQRCode (App.tsx:21-51)

**`@config/`**: `siteUrl`(SITE_URL) — MobileShareModal.tsx:3.

**`@mobile/` (자기 참조, alias 경유)**: 여러 store/hook이 `@mobile/di/container`, `@mobile/stores/*`, `@mobile/hooks/*`를 참조(상대경로와 혼용 — 예: App.tsx는 `./` 상대경로, stores는 `@mobile/` alias). → 내부 참조 스타일 비일관.

## 6. 배럴(index.ts) / 경로 alias

- **배럴 없음**: `Glob src/mobile/**/index.ts` = 결과 0. 모든 import는 개별 파일 직접 지정.
- **경로 alias 정의**:
  - `vite.mobile.config.ts:126-137`: `@config @domain @usecases @adapters @infrastructure @mobile @widgets @shared` (8개). **주의: vite.mobile.config에는 `@student` alias 없음** — main.tsx는 `@student` 대신 상대경로 `../student/...`(line 15) 사용.
  - `tsconfig.json:22-32`: 위 8개 + `@student/*` (총 9개). tsconfig와 vite 설정 간 `@student` 불일치.
- 폰트/외부: mobile.html에서 Noto Sans KR, Material Symbols, Pretendard(jsdelivr), Kakao SDK CDN 로드.

## 7. 데스크톱 세션이 수정 중인 4개 파일에 대한 모바일 의존 여부

| 파일                                          | 모바일 import 여부                        | 근거                                                                                                                                                                                                                         |
| --------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/domain/entities/Settings.ts`             | **의존함 (직접 import)**                  | `src/mobile/stores/useMobileSettingsStore.ts:3` `import type { Settings } from '@domain/entities/Settings'`. 타입 전용 import.                                                                                               |
| `src/global.d.ts`                             | **직접 import 없음 / 선언 글로벌 미사용** | mobile 내 `__APP_VERSION__`(global.d.ts:1072 선언) 참조 0건. `window.Kakao`는 `src/global.d.ts`가 아니라 `src/types/kakao.d.ts`에 선언. 앰비언트 파일이라 명시 import 자체가 없음 → 모바일이 global.d.ts의 심볼을 쓰지 않음. |
| `src/adapters/di/container.ts`                | **의존 안 함**                            | 모바일은 자체 DI `src/mobile/di/container.ts` 사용. `@adapters/di/container` 참조 0건(grep).                                                                                                                                 |
| `src/adapters/components/Tools/ToolsGrid.tsx` | **의존 안 함**                            | 모바일은 `ToolsGrid`가 아니라 개별 Tool 컴포넌트(ToolTrafficLight 등 9종, App.tsx:21-51)를 lazy import. `ToolsGrid` 참조 0건. 모바일 자체 `pages/ToolsOverviewPage.tsx`가 그리드 역할.                                       |

**결론(충돌 위험)**: 4개 중 실제 충돌 위험은 `src/domain/entities/Settings.ts` 하나. `Settings` 타입의 필드/시그니처가 바뀌면 `useMobileSettingsStore.ts`(및 이를 쓰는 SettingsPage, PeriodTimesEditor)가 영향받는다. 나머지 3개(global.d.ts, adapters/di/container, ToolsGrid)는 모바일이 직접 의존하지 않아 리팩토링 병행 안전.

### 추가 리팩토링 유의점 요약

- 자체 상태 라우팅이 App.tsx 한 파일(약 500줄)에 집중, `moreSub` 삼항 체인(App.tsx:404-456)이 확장 부담.
- 스토어/훅 네이밍 이원화(`useMobileXxxStore` vs `useXxx`), `SwipeRow/` 내 store 위치 이탈, `useBottomSheetStore` 접두어 누락.
- 데스크톱 `@adapters`(useSettingsStore, Json\*Repository, Tool 컴포넌트, MultiDatePicker, SyncResultSummary)에 강하게 결합 — 공용 레이어 변경 시 모바일 회귀 테스트 필요.
- vite.mobile.config와 tsconfig의 `@student` alias 불일치.

---

파일 저장 경로: 없음(읽기 전용 분석 작업이므로 보고서를 파일로 기록하지 않았고, 위 메시지 본문이 산출물 전문이다).
