# 쌤핀(SsamPin) 모바일 PWA — 기능·데이터 아키텍처 조사

> 2026-07-03 조사. `docs/03-analysis/mobile-feature-gap/mobile-feature-gap.analysis.md`의 비교 기준표.

조사 범위: `src/mobile/` 전체, 모바일이 import하는 공용 레이어(`@domain`, `@infrastructure`, `@usecases`, `@adapters`), `vite.mobile.config.ts`, `mobile.html`. 배포: `m.ssampin.com` (Vercel, `dist-mobile/`).

---

## 1. 화면/기능 전수 목록

App은 하단 4탭(`home`/`students`/`schedule`/`more`) + 전체화면 오버레이(출결체크, 온보딩, 서명 라우트)로 구성. `src/mobile/App.tsx`가 단일 라우터 역할(URL 라우팅 없이 `useState`로 탭/서브 전환).

### 홈 탭 (`home`) — `TodayHub.tsx`

Bento 그리드로 카드 렌더. 각 카드는 설정에서 표시/숨김 토글 가능(`useMobileHomeLayoutStore`).

| 기능                           | 진입 경로                   | 주요 파일                                            | 읽기/쓰기                      |
| ------------------------------ | --------------------------- | ---------------------------------------------------- | ------------------------------ |
| 동기화 상태 배너               | home 상단                   | `Today/SyncStatusBanner.tsx`                         | 읽기                           |
| 날짜/학교/교사 헤더            | home                        | `TodayHub.tsx`                                       | 읽기                           |
| 현재 교시 카드                 | home (`currentClass`)       | `Today/CurrentClassCard.tsx` + `useCurrentPeriod.ts` | 읽기                           |
| 담임 출결 요약 카드            | home (`homeroomAttendance`) | `Today/AttendanceSummaryCard.tsx`                    | 읽기 → 탭 시 출결체크 페이지로 |
| 수업 출결 요약 카드(현재 교시) | home (`classAttendance`)    | 동상                                                 | 읽기 → 출결체크 진입           |
| 날씨 카드                      | home (`weather`)            | `Today/WeatherCard.tsx` (weatherapi.com 프록시)      | 읽기(외부 API)                 |
| 급식 카드                      | home (`meal`)               | `Today/MealCard.tsx` + `useMobileMealStore` (NEIS)   | 읽기(외부 API)                 |
| **출결 체크 페이지**(전체화면) | 홈 카드 → 진입, 탭바 숨김   | `pages/AttendanceCheckPage.tsx`                      | **쓰기** (출결 기록 저장)      |

### 학생 탭 (`students`) — SegmentedControl [담임 | 수업]

**담임 세그먼트** → `StudentsPage.tsx`, **수업 세그먼트** → `ClassListPage.tsx`.

| 기능                                     | 진입 경로                 | 주요 파일                                                  | 읽기/쓰기                                                      |
| ---------------------------------------- | ------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------- |
| 담임반 자리배치(좌석) 뷰                 | students→담임→[좌석]      | `students/SeatingView.tsx`                                 | 읽기(좌석 배치는 PC 전용) + 좌석 탭 시 출결 표시               |
| 담임반 명단 뷰                           | students→담임→[명단]      | `students/HomeroomListView.tsx`                            | 읽기 + 스와이프 빠른 출결                                      |
| 학급 선택 탭(담임반+수업반 가로스크롤)   | students→담임 상단        | `StudentsPage.tsx`                                         | 읽기                                                           |
| 날짜 선택기(±1일, 오늘로)                | students→담임             | `StudentsPage.tsx`                                         | 읽기                                                           |
| 스와이프 빠른 출결(지각/결석 + 되돌리기) | 명단 행 스와이프          | `SwipeRow/`, `writeHomeroomStatus`                         | **쓰기** (출결부 period 0 + student-records 브릿지)            |
| 스와이프 → 칭찬 메모                     | 명단 행 스와이프          | `Students/PraiseMemoSheet.tsx`                             | **쓰기** (student-records `life/칭찬` + tags)                  |
| 수업반 명단/좌석 뷰                      | students→담임→수업반 선택 | `students/TeachingListView.tsx`, `TeachingSeatingView.tsx` | 읽기 + 스와이프 출결 쓰기(수업반 period 0)                     |
| **학생 퀵액션 바텀시트**                 | 학생 탭 시                | `students/StudentQuickActionSheet.tsx`                     | 하위 3서브탭                                                   |
| ├ 출결 서브탭                            | 시트 [출결]               | `students/AttendanceSubTab.tsx`                            | **쓰기** (출결 상태/사유/메모)                                 |
| ├ 기록 서브탭                            | 시트 [기록]               | `students/RecordsSubTab.tsx`                               | **쓰기** (student-records 추가; 출결 카테고리 제외)            |
| └ 연락처 서브탭                          | 시트 [연락처]             | `students/ContactSubTab.tsx`                               | 읽기 전용 (`tel:` 링크; 등록은 "데스크톱 쌤핀에서")            |
| **수업 탭(ClassList)**                   | students→수업             | `ClassListPage.tsx`                                        | 읽기 (학급 없으면 "PC 앱에서 수업반 추가 후 동기화")           |
| **학급 상세**(3서브탭)                   | 수업반 카드 탭            | `ClassDetailPage.tsx`                                      | 아래                                                           |
| ├ 출결 서브탭                            | [출결]                    | `Class/ClassAttendanceTab.tsx`                             | **쓰기**                                                       |
| ├ 진도 서브탭                            | [진도]                    | `Class/ClassProgressTab.tsx`                               | **쓰기** (추가/상태사이클/편집/삭제 풀 CRUD, 시간표 매칭 표시) |
| └ 특기사항 서브탭                        | [특기사항]                | `Class/ClassObservationTab.tsx`, `ObservationSheet.tsx`    | **쓰기** (관찰기록 CRUD + 태그)                                |

### 일정 탭 (`schedule`) — SegmentedControl [일정 | 할 일]

| 기능                                         | 진입 경로      | 주요 파일                                    | 읽기/쓰기                              |
| -------------------------------------------- | -------------- | -------------------------------------------- | -------------------------------------- |
| 월간 미니 캘린더 + 이벤트 목록/D-Day         | schedule→일정  | `SchedulePage.tsx`                           | 읽기                                   |
| 일정 추가 모달(제목/날짜/카테고리/종일·시간) | 일정 + FAB     | `SchedulePage.tsx`                           | **쓰기** (events)                      |
| 할 일 목록(미완료/완료 정렬)                 | schedule→할 일 | `TodoPage.tsx`, `todo/TodoItem.tsx`          | 읽기 + 토글/삭제                       |
| 할 일 추가(우선순위/서브태스크)              | 할 일 + FAB    | `todo/AddTodoModal.tsx`, `priorityConfig.ts` | **쓰기** (todos, 서브태스크 토글 포함) |

### 더보기 탭 (`more`) — `MorePage.tsx` + `moreSub` 분기

| 기능                      | 진입 경로              | 주요 파일                    | 읽기/쓰기                                          |
| ------------------------- | ---------------------- | ---------------------------- | -------------------------------------------------- |
| 메모                      | more→메모 (`memo`)     | `MemoPage.tsx`               | **쓰기** (포스트잇 메모 CRUD, 색상, 롱프레스 편집) |
| **쌤도구 개요**           | more→쌤도구 (`tools`)  | `ToolsOverviewPage.tsx`      | 허브                                               |
| 설정                      | more→설정 (`settings`) | `SettingsPage.tsx`           | **쓰기**(기본정보/교시시간) + 로컬(테마/카드표시)  |
| 지인에게 추천(공유)       | more→추천 모달         | `Share/MobileShareModal.tsx` | 액션(공유)                                         |
| 구글 드라이브 동기화 패널 | more 하단              | `More/SyncStatus.tsx`        | 액션(로그인/업다운/자동주기)                       |

#### 쌤도구 — 교실 도구 9종 (`MORE_LAZY_TOOLS` 레지스트리, PC 컴포넌트 `@adapters/components/Tools/*` lazy 재사용)

모두 `{onBack, isFullscreen}` 시그니처, 로컬 상태 도구(동기화 무관):

| moreSub 키           | 이름      | 파일               |
| -------------------- | --------- | ------------------ |
| `tool-traffic-light` | 신호등    | `ToolTrafficLight` |
| `tool-dice`          | 주사위    | `ToolDice`         |
| `tool-coin`          | 동전      | `ToolCoin`         |
| `tool-scoreboard`    | 점수판    | `ToolScoreboard`   |
| `tool-timer`         | 타이머    | `ToolTimer`        |
| `tool-work-symbols`  | 활동 기호 | `ToolWorkSymbols`  |
| `tool-random`        | 랜덤뽑기  | `ToolRandom`       |
| `tool-roulette`      | 룰렛      | `ToolRoulette`     |
| `tool-qrcode`        | QR코드    | `ToolQRCode`       |

#### 쌤도구 — 관리 도구 2종

| moreSub 키        | 기능                | 파일                                                                   | 읽기/쓰기                                                                      |
| ----------------- | ------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `tool-assignment` | 과제 수합(제출현황) | `ToolAssignmentPage.tsx` + `useMobileAssignmentStore`                  | 읽기 (Supabase 실시간 제출조회; 과제 생성은 PC)                                |
| `tool-survey`     | 설문/체크리스트     | `ToolSurveyPage.tsx`, `survey/SurveyDetail.tsx`, `TeacherCheckRow.tsx` | 학생 응답=읽기(Supabase); **교사 체크 모드=쓰기**(`setLocalEntry` → localData) |

### 탭에 없는 화면

- **온보딩**(`OnboardingFlow.tsx`) — 최초 방문 시 전체화면, `localStorage: onboarding-completed`
- **학생 서명 공개 페이지**(`/sign/{code}`) — `main.tsx`에서 진입점 분기, `StudentSignatureApp` lazy, App 본체 미마운트
- **전역 QuickAddFab** — 일정추가/할일추가/메모 3액션(더보기 탭 제외)
- **NavMigrationCoachmark** — 하단탭 6→4 재편 안내

---

## 2. 데이터 아키텍처

### 저장소 (모바일 DI 컨테이너 `src/mobile/di/container.ts`)

- **로컬 저장소: IndexedDB** — `IndexedDBStorageAdapter`(`@infrastructure/storage`). 데스크톱의 Electron/파일시스템 어댑터 대신 사용. 모든 `Json*Repository`(schedule/seating/events/memo/todo/settings/studentRecords/message/student/seatConstraints/teachingClass/bookmark/dday/driveSync/observation)가 이 storage 위에 얹힘 — **데스크톱과 동일한 도메인 리포지토리 코드 재사용**, 저장 백엔드만 IndexedDB.
- **Zustand 스토어**는 모바일 전용 `useMobile*Store` 래퍼(총 20개+). 도메인 엔티티/유스케이스는 공용 레이어 재사용.
- 특기: `bookmarkRepository`·`ddayRepository`·`seatConstraintsRepository`는 **DI에 이미 등록돼 있으나** 북마크는 UI가 전혀 없음(2026-07-03 grep 확인 — `bookmark` 참조가 container.ts 1곳뿐).

### 데스크톱과의 데이터 공유 = Google Drive 동기화 (Supabase 저장 아님)

- **동기화 매체: 사용자 Google Drive**의 앱 폴더(`getOrCreateSyncFolder`, scope `drive.file`). 파일별 JSON + SHA-256 체크섬 매니페스트 방식(`SyncToCloud`/`SyncFromCloud`, `@usecases/sync`).
- **양방향**. `useMobileDriveSyncStore`:
  - `syncFromCloud()` (다운로드): 앱 마운트 시·앱 복귀(`visibilitychange visible`)·수동. 완료 후 `reloadAllStores()`로 14개 모바일 스토어 일괄 reload.
  - `syncToCloud()` (업로드): `triggerSaveSync()`(5초 debounce)·`flushSync()`(백그라운드 전환/`pagehide` 즉시)·`online` 복구·자동주기(설정 1/5/10/30분).
  - 충돌 처리: 리모트가 마지막 동기화 이후 변경되면 업로드 스킵(다음 다운로드로 수신), `resolveConflict('local'|'remote')`.
- **동기화 도메인 단일 소스**: `src/usecases/sync/syncRegistry.ts`의 `SYNC_REGISTRY` 30개 도메인. 업로드는 **IndexedDB의 모든 SYNC_FILES 키를 체크섬 비교** — 모바일에서 값이 바뀐 키만 실제 업로드.

### 로그인/인증 — Google OAuth (PKCE, Web application 클라이언트)

- `useGoogleAuth.ts` + `GoogleOAuthBrowserClient`(`@infrastructure/google`). 스코프: `drive.file` + `userinfo.email`.
- **PKCE**(S256). 브라우저는 `code_challenge`만 생성, **client_secret은 번들에 없음** — code↔token 교환은 Supabase Edge Function `oauth-exchange`가 수행. 토큰은 IndexedDB(`google-tokens`), 만료 5분 전 자동 refresh.
- 인앱 브라우저(카카오톡 등) 감지 시 로그인 차단 + 외부 브라우저 안내(`InAppBrowserBanner`).
- device ID는 모바일 전용 `mobile-{uuid}`(localStorage) — PC settings 다운로드로 인한 오염 방지.

### 모바일→데스크톱 역동기화(쓰기) 도메인 — `triggerSaveSync()` 호출 스토어 9개

| 스토어                         | 쓰기 내용                      | 대상 파일           |
| ------------------------------ | ------------------------------ | ------------------- |
| `useMobileEventsStore`         | addEvent 등                    | events              |
| `useMobileAttendanceStore`     | saveRecord                     | attendance          |
| `useMobileProgressStore`       | 진도 CRUD 4곳                  | curriculum-progress |
| `useMobileMemoStore`           | 메모 CRUD 3곳                  | memos               |
| `useMobileObservationStore`    | 특기사항 CRUD 3곳              | observations        |
| `useMobileSettingsStore`       | updateSettings                 | settings            |
| `useMobileSurveyToolStore`     | 교사 체크 setLocalEntry만      | surveys(localData)  |
| `useMobileStudentRecordsStore` | 기록 추가/삭제/출결 브릿지 4곳 | student-records     |
| `useMobileTodoStore`           | todo CRUD 4곳                  | todos               |

**읽기 전용(역동기화 없음) 스토어**: `useMobileStudentStore`(students), `useMobileTeachingClassStore`(teaching-classes), `useMobileSeatingStore`(seating), `useMobileScheduleStore`(시간표), `useMobileMealStore`(NEIS 조회), `useMobileAssignmentStore`(과제 목록 read + 제출현황 Supabase 조회), `useMobileHomeLayoutStore`(로컬 UI). → **명단·수업반·좌석배치·시간표는 모바일에서 편집 불가, PC에서만 생성 후 다운로드**.

### 실시간 조회용 Supabase (동기화와 별개)

- `AssignmentSupabaseClient`(과제 제출현황), `SurveySupabaseClient`(설문 학생응답) — 학생이 공개폼으로 제출한 데이터를 실시간 조회만. env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`(production 누락 시 빌드 실패 가드).

---

## 3. 플랫폼 제약 (PWA)

### PWA라서 불가능/우회한 것

- **파일 시스템 직접 접근 불가** → IndexedDB 사용. `vite.mobile.config.ts`에서 `optimizeDeps.exclude: ['electron']`.
- **client_secret 보관 불가** → Edge Function 위임.
- **"항상 위/윈도우 제어/시스템 트레이" 등 데스크톱 창 기능 없음**.
- **햅틱 제약**: `navigator.vibrate(10)`, iOS Safari 미지원은 조용히 무시.
- **인앱 브라우저에서 OAuth 차단** → 외부 브라우저 유도 배너.
- **시간표 변동(override) 머지 미지원**: `ClassProgressTab.tsx` 주석 — "모바일은 변동 머지 미지원이라 baseline만", `enableWeekendDays` 없음, `ClassSchedule`(우리반 시간표) 없어 3단계 폴백 비활성.
- **Service Worker 자동 갱신 수동 처리**: `mobile.html` — `controllerchange` 리스너로 새 SW 활성화 시 1회 reload.

### 모바일 전용으로 이미 구현된 것

- **PWA 설치**(manifest standalone/portrait, InstallGuide), 폰트 런타임 캐싱
- **스와이프 제스처**(빠른 출결 + 되돌리기 토스트; 글로벌 탭 전환 스와이프는 2026-05-14 사용자 요청으로 제거)
- **QuickAddFab**(전역 빠른 추가, 바텀시트 열림 시 자동 fade-out)
- **롱프레스**(메모 편집 500ms), 바텀시트 UX(safe-area 대응)
- **테마** system/light/dark, **홈 카드 표시 커스터마이즈**, **급식 전용 학교 코드**, **자동 동기화 주기**
- **전화 연락** `tel:` 딥링크, **카카오 공유 SDK**

---

## 4. 의도적으로 축소한 흔적 (코드 근거)

"모바일은 데스크톱의 축소판, 편집은 PC에서" 의도가 드러나는 지점:

1. `SettingsPage.tsx:257` — "그 외 상세 설정(시간표·좌석배치 등)은 데스크톱 앱에서 변경할 수 있습니다."
2. `ClassListPage.tsx:77` — 수업반 없을 때 "PC 앱에서 수업반을 추가한 후 동기화하세요".
3. `ToolAssignmentPage.tsx:151` — "PC 앱에서 과제를 생성한 후 동기화하세요" (모바일은 제출현황 조회만).
4. `ToolSurveyPage.tsx:64` — "PC 앱에서 설문을 생성한 후 동기화하세요" (모바일은 현황 조회 + 교사 체크만).
5. `students/ContactSubTab.tsx:46` — "데스크톱 쌤핀에서 연락처를 등록해주세요" (모바일은 조회+통화만).
6. `Today/MobileProgressLogModal.tsx:258` — "데스크톱에서 학급을 먼저 등록하세요".
7. `ClassProgressTab.tsx:100~110` — 진도-시간표 매칭 로직 의도적 단순화(변동 머지 미지원, ClassSchedule 부재).
8. `useMobileSettingsStore.ts:84` — "모바일은 항상 mobile- 접두사 deviceId를 사용 (PC settings 다운로드로 인한 오염 방지)".
9. 온보딩/동기화 안내(`OnboardingFlow.tsx:311~316`, `SyncStatus.tsx:82~85`) — "PC를 먼저 설정하세요…" — **PC = 1차 데이터 소스, 모바일 = 교실용 뷰+경량 입력** 포지셔닝.
10. PWA manifest description(`vite.mobile.config.ts:59`) — "교사용 모바일 대시보드 — 시간표, 출결, 메모를 교실에서도".

### 기능 격차 판단용 요약 (데스크톱 대비)

- **동기화 레지스트리 30개 도메인 중** 모바일이 UI를 갖춘 것: settings, teaching-classes(읽기), students(읽기), seating(읽기), events, memos, todos, student-records, attendance, curriculum-progress, surveys(조회+교사체크), assignments(조회), observations, manual-meals(급식).
- **모바일에 UI가 없는 데스크톱 도메인**: bookmarks, consultations(상담), note-\*(노트), stickers(이모티콘), rubrics(수행평가 채점), record-drafts(생기부 초안), seat-constraints/timetable-overrides(편집), observation-attachments(첨부 바이너리). → 이 데이터들은 Drive 동기화로 모바일 IndexedDB에 이미 내려와 있어도 **화면이 없어 접근 불가** — UI만 추가하면 데이터는 확보 가능.

**실현 가능성 관점 핵심**: 데이터 계층(도메인 엔티티·리포지토리·유스케이스·Drive 동기화)은 데스크톱과 공유되고 이미 30개 도메인 전체가 동기화 파이프라인을 통과한다. 대부분의 데스크톱 기능을 모바일에 추가하는 것은 **UI 레이어 신규 작성 문제**이지 데이터 파이프라인 문제가 아니다. 제약이 실재하는 영역은 (a) 파일시스템/Electron 의존 기능, (b) 시간표 변동 머지 등 의도적으로 뺀 계산 로직, (c) 서버 비밀키가 필요한 연동뿐.
