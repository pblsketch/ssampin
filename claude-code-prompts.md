# 🛠️ 쌤핀 (SsamPin) — Claude Code 개발 프롬프트

> Claude Code에서 순서대로 입력하여 프로젝트를 구축합니다.
> 각 프롬프트는 이전 단계가 완료된 후 실행하세요.
>
> **아키텍처:** Clean Architecture (4레이어)
> ```
> domain/ → usecases/ → adapters/ → infrastructure/
> ```
> **의존성 규칙:** 안쪽 레이어만 import 가능. domain은 아무것도 import 안 함.

---

## 🚀 Phase 0: 프로젝트 초기화

### 프롬프트 0-1: 프로젝트 세팅

```
쌤핀(SsamPin)이라는 교사용 데스크톱 대시보드 앱을 만들 거야.

기술 스택:
- Electron 33+ (데스크톱 앱)
- React 18 + TypeScript strict 모드
- Vite (번들러)
- Tailwind CSS (다크 테마)
- Zustand (상태관리)
- date-fns (날짜 유틸)

프로젝트 구조를 세팅해줘:

1. package.json 생성 (이름: ssampin, 버전: 0.1.0)
2. TypeScript 설정 3개: tsconfig.json(React), tsconfig.node.json(Vite), tsconfig.electron.json(Electron 메인 → dist-electron/)
3. Vite + React + Tailwind 설정
4. Electron 메인 프로세스: electron/main.ts, electron/preload.ts
5. npm 스크립트:
   - dev: vite (브라우저 모드)
   - electron:dev: concurrently로 Vite + Electron 동시 실행
   - build: tsc + vite build + Electron 컴파일
   - electron:build: build + electron-builder
6. electron-builder.yml (Windows NSIS 빌드, appId: com.ssampin.app, productName: 쌤핀)

디렉토리 구조 — 클린 아키텍처 4레이어:
- electron/              → 🔴 Electron 메인 프로세스 (infrastructure 레벨)
- src/
  - domain/              → 🟡 핵심 비즈니스 규칙 (외부 의존성 없음)
    - entities/          → 엔티티 타입 정의
    - valueObjects/      → 값 객체 (PeriodTime, DayOfWeek 등)
    - rules/             → 비즈니스 규칙 순수 함수
    - ports/             → 저장소 추상 인터페이스 (IStoragePort)
    - repositories/      → Repository 인터페이스
  - usecases/            → 🟢 애플리케이션 로직 (domain만 import)
    - schedule/
    - seating/
    - events/
    - memo/
    - todo/
    - studentRecords/
  - adapters/            → 🔵 UI + 변환 계층 (domain + usecases import 가능)
    - components/        → React 컴포넌트 (Layout/, Dashboard/, Timetable/ 등)
    - stores/            → Zustand 스토어
    - hooks/             → React 커스텀 훅
    - repositories/      → Repository 구현체 (Json~Repository)
    - presenters/        → 도메인 데이터 → UI 표시 형식 변환
    - di/                → DI 컨테이너
  - infrastructure/      → 🔴 외부 기술 구현 (모두 import 가능)
    - storage/           → ElectronStorageAdapter, LocalStorageAdapter
    - weather/           → 날씨 API 클라이언트
    - export/            → HWPX/Excel/PDF 내보내기 엔진
- dist/, dist-electron/, release/

의존성 규칙:
- ❌ domain/ → 다른 레이어 import 금지
- ✅ usecases/ → domain/만 import
- ✅ adapters/ → domain/ + usecases/ import
- ✅ infrastructure/ → domain/ (포트 인터페이스) import
- ✅ adapters/di/container.ts → infrastructure/ import (유일한 예외)

모든 의존성 설치까지 완료해줘.
```

### 프롬프트 0-2: Domain 엔티티 + 포트 + IPC + 데이터 추상화

```
Domain 레이어 엔티티, 저장소 포트, Electron IPC, 데이터 추상화를 구현해줘.

=== 🟡 Domain 레이어 (src/domain/) — 외부 의존성 없음 ===

1. src/domain/entities/ — 모든 데이터 모델 타입 정의:
   - Student.ts: Student (id, name)
   - Timetable.ts: ClassScheduleData, TeacherScheduleData, TeacherPeriod, DayOfWeek
   - Seating.ts: SeatingData (rows, cols, seats)
   - SchoolEvent.ts: SchoolEventsData, SchoolEvent, EventCategory
   - Memo.ts: MemosData, Memo
   - Todo.ts: TodosData, Todo
   - StudentRecord.ts: StudentRecordsData, StudentRecord
   - Settings.ts: Settings, PeriodTime, WidgetSettings
   - ShareFile.ts: SsampinShareFile
   - Message.ts: MessageData

2. src/domain/valueObjects/:
   - PeriodTime.ts: 교시 시간 타입 (period, start, end)
   - DayOfWeek.ts: 요일 타입 ('월'|'화'|'수'|'목'|'금')
   - MemoColor.ts: 메모 색상 타입 ('yellow'|'pink'|'green'|'blue')
   - RecordCategory.ts: 학생 기록 카테고리 타입 ('attendance'|'counseling'|'life'|'etc')

3. src/domain/ports/IStoragePort.ts — 저장소 추상 인터페이스:
   - read<T>(filename: string): Promise<T | null>
   - write<T>(filename: string, data: T): Promise<void>

4. src/domain/repositories/ — Repository 인터페이스 (포트):
   - IScheduleRepository.ts: getClassSchedule, saveClassSchedule, getTeacherSchedule, saveTeacherSchedule
   - ISeatingRepository.ts: getSeating, saveSeating
   - IEventsRepository.ts: getEvents, saveEvents
   - IMemoRepository.ts: getMemos, saveMemos
   - ITodoRepository.ts: getTodos, saveTodos
   - ISettingsRepository.ts: getSettings, saveSettings
   - IStudentRecordsRepository.ts: getRecords, saveRecords
   - IMessageRepository.ts: getMessage, saveMessage

=== 🔴 Infrastructure 레이어 (Electron + Storage) ===

5. src/infrastructure/storage/:
   - ElectronStorageAdapter.ts: IStoragePort 구현 → window.electronAPI.readData/writeData
   - LocalStorageAdapter.ts: IStoragePort 구현 → localStorage 폴백 (브라우저 개발용)

6. electron/main.ts:
   - BrowserWindow 생성 (1280x800, contextIsolation: true, nodeIntegration: false)
   - preload.ts 연결
   - 개발 모드: http://localhost:5173 로드
   - 프로덕션: file://dist/index.html 로드
   - IPC 핸들러 등록:
     - data:read (filename) → userData/data/{filename}.json 읽기
     - data:write (filename, data) → JSON 파일 쓰기
     - window:setAlwaysOnTop (flag)
     - window:setWidget (options: {width, height, transparent, opacity, alwaysOnTop})

7. electron/preload.ts:
   - contextBridge.exposeInMainWorld('electronAPI', {...})로 IPC 노출

=== 🔵 Adapters 레이어 (Repository 구현체 + DI) ===

8. src/adapters/repositories/ — Repository 구현체 (domain 인터페이스 구현):
   - JsonScheduleRepository.ts: IStoragePort를 주입받아 class-schedule.json / teacher-schedule.json 읽기/쓰기
   - JsonSeatingRepository.ts
   - JsonEventsRepository.ts
   - JsonMemoRepository.ts
   - JsonTodoRepository.ts
   - JsonSettingsRepository.ts
   - JsonStudentRecordsRepository.ts
   - JsonMessageRepository.ts

9. src/adapters/di/container.ts — DI 컨테이너:
   - isElectron 환경 감지
   - 환경별 IStoragePort 구현체 선택 (Electron → ElectronStorageAdapter, 브라우저 → LocalStorageAdapter)
   - 모든 Repository 인스턴스 생성 및 export

10. window.electronAPI 타입 선언 (별도 global.d.ts)

Electron과 브라우저 모두에서 동작하도록 해줘. any 타입 금지.
의존성 방향: domain(포트/인터페이스) ← infrastructure(구현체) ← adapters/di(조립)
```

---

## 📌 Phase 1: 핵심 레이아웃

### 프롬프트 1-1: 사이드바 + 라우팅

```
앱의 기본 레이아웃을 만들어줘.

=== 🔵 Adapters 레이어 (src/adapters/components/) ===
`
1. src/App.tsx:
   - DI 컨테이너 초기화 (adapters/di/container.ts)
   - currentPage 상태 관리 (useState)
   - Sidebar + 메인 콘텐츠 영역 레이아웃
   - currentPage에 따라 컴포넌트 switch 렌더링

2. src/adapters/components/Layout/Sidebar.tsx:
   - 좌측 고정 사이드바 (너비 80px)
   - 상단: 📌 쌤핀 로고/텍스트
   - 메뉴 아이콘 + 라벨 (세로 정렬):
     🏠 대시보드, 📅 시간표, 🪑 좌석배치, 📋 일정, 📝 메모, ✅ 할일, ⚙️ 설정
   - 현재 페이지 아이콘은 파란색 배경(#3b82f6) 하이라이트
   - 하단: 버전 표시 "v0.1.0"

디자인:
- 다크 테마: 사이드바 배경 #131a2b, 메인 배경 #0a0e17
- 폰트: Noto Sans KR (Google Fonts CDN으로 index.html에 추가)
- Tailwind 커스텀 컬러 토큰:
  sp-bg: #0a0e17, sp-surface: #131a2b, sp-card: #1a2332
  sp-border: #2a3548, sp-accent: #3b82f6, sp-highlight: #f59e0b
  sp-text: #e2e8f0, sp-muted: #94a3b8

각 페이지는 일단 "{페이지명} 준비 중..." placeholder 텍스트만 표시해줘.

컴포넌트는 adapters 레이어에 속합니다.
domain/usecases를 직접 import하지 않고, adapters/stores를 통해 접근합니다.
```

---

## 📌 Phase 2: 대시보드

### 프롬프트 2-1: 시계 + 날씨 + 메시지

```
대시보드의 상단 영역을 만들어줘.

=== 🔵 Adapters 레이어 ===

1. src/adapters/hooks/useClock.ts:
   → React 커스텀 훅 (adapters 레이어)
   - 1초 간격 현재 시간 반환 훅
   - { date, time, dayOfWeek } 반환

2. src/adapters/components/Dashboard/Clock.tsx:
   - "M월 D일 (요일)" 큰 텍스트 (text-5xl, font-bold, 흰색)
   - "HH:MM" 시간 (text-7xl, font-bold)
   - 1초마다 갱신

3. src/adapters/components/Dashboard/WeatherBar.tsx:
   - 시계 아래에 한 줄로: 날씨 아이콘 + "최저~최고°C" + 💧습도% + 미세먼지 등급
   - MVP: 하드코딩 placeholder 데이터 (API 연동은 나중에)
   - 스타일: text-sm, sp-muted 색상

4. src/adapters/components/Dashboard/MessageBanner.tsx:
   - 틸/에메랄드 반투명 배경 배너 (#059669/20%)
   - 메시지 텍스트 표시
   - 클릭 시 인라인 편집 모드 (input으로 전환)
   - Enter로 저장, Esc로 취소
   - 빈 상태면 "클릭하여 메시지를 입력하세요..." placeholder
   - Zustand store 연동 (useMessageStore)

5. src/adapters/stores/useMessageStore.ts:
   → Zustand 스토어 (adapters 레이어)
   - message 상태
   - setMessage 액션 → container.messageRepo를 통해 저장/로드
   - DI 컨테이너의 IMessageRepository를 통해 데이터 접근

6. src/adapters/components/Dashboard/Dashboard.tsx:
   - 위 컴포넌트들 조합
   - 상단: Clock + WeatherBar + MessageBanner
   - 하단은 아직 placeholder

의존성 흐름: Component → Store → Repository(container) → IStoragePort
```

### 프롬프트 2-2: 대시보드 시간표 위젯

```
대시보드에 "오늘의 시간표" 카드를 만들어줘.

=== 🟡 Domain 레이어 — 비즈니스 규칙 ===

1. src/domain/rules/periodRules.ts:
   → 순수 함수, 외부 의존성 없음 (domain 레이어)
   - getCurrentPeriod(periodTimes: PeriodTime[], now: Date): number | null
     → 현재 교시 번호 반환 (null이면 수업시간 아님)
   - getDayOfWeek(date: Date): '월'|'화'|'수'|'목'|'금' | null
     → 주말이면 null 반환
   - parseMinutes(timeStr: string): number
     → "08:50" → 530 변환

=== 🟢 Use Cases 레이어 ===

2. src/usecases/schedule/GetCurrentPeriod.ts:
   → domain/rules/periodRules를 활용, ISettingsRepository에 의존
   - execute(now: Date): Promise<number | null>
   - 주말 체크 + getCurrentPeriod 호출

=== 🔵 Adapters 레이어 ===

3. src/adapters/stores/useScheduleStore.ts:
   → Zustand 스토어 (adapters 레이어)
   - classSchedule, teacherSchedule 상태
   - container.scheduleRepo를 통해 자동 저장/로드
   - 초기 데이터: 샘플 시간표 (월~금, 6교시)

4. src/adapters/stores/useSettingsStore.ts:
   → Zustand 스토어 (adapters 레이어)
   - settings 상태 (학교정보, 교시시간, 좌석설정 등)
   - 기본 교시 시간: 1교시 8:50~9:30 ... 6교시 13:40~14:20, 점심 12:00~12:50
   - container.settingsRepo 연동

5. src/adapters/components/Dashboard/DashboardTimetable.tsx:
   → React 컴포넌트 (adapters 레이어)
   - 카드 컨테이너 (sp-card 배경, rounded-xl, p-4)
   - 제목: "📅 오늘의 시간표" + [학급][교사] 토글 탭
   - 오늘 요일의 시간표를 세로 리스트로 표시
   - 각 행: "N교시  과목명  시작~종료"
   - 현재 교시 행은 amber/yellow 배경 하이라이트 (#f59e0b/20%, 좌측 보더 amber)
   - 주말이면 "주말입니다 🎉" 메시지
   - 과목별 컬러코딩: 국어=yellow, 영어=green, 수학=blue, 과학=purple, 사회=orange, 체육=red, 음악=pink, 미술=indigo, 창체=teal
   - 현재 교시 판정은 스토어 → GetCurrentPeriod 유스케이스 → domain/rules 순서로 호출

의존성 흐름:
  DashboardTimetable → useScheduleStore/useSettingsStore → container → Repository → IStoragePort
  useScheduleStore 내부에서 GetCurrentPeriod(usecase) → periodRules(domain) 호출
```

### 프롬프트 2-3: 대시보드 일정 + 할일 + 메모 위젯

```
대시보드의 나머지 카드 위젯들을 만들어줘.

=== 🟢 Use Cases 레이어 ===

1. src/usecases/events/ManageEvents.ts:
   → 일정 CRUD 유스케이스 (domain만 import)
   - addEvent, updateEvent, deleteEvent
   - IEventsRepository 의존

2. src/usecases/todo/ManageTodos.ts:
   → 투두 CRUD + 완료 처리 유스케이스
   - addTodo, toggleTodo, deleteTodo
   - ITodoRepository 의존

3. src/usecases/memo/ManageMemos.ts:
   → 메모 CRUD + 위치 업데이트 유스케이스
   - addMemo, updateMemo, deleteMemo, updatePosition
   - IMemoRepository 의존

=== 🔵 Adapters 레이어 ===

4. src/adapters/stores/useEventsStore.ts:
   → Zustand 스토어 (adapters 레이어)
   - categories 배열 (기본: 학교, 학급, 부서, 나무학교, 기타)
   - events 배열
   - notificationSettings
   - CRUD 액션 → ManageEvents 유스케이스 호출 + container.eventsRepo 연동

5. src/adapters/components/Dashboard/DashboardEvents.tsx:
   - "📋 이번 주 일정" 카드
   - 이번 주~다음 주 일정을 날짜순 리스트로 표시
   - 각 항목: 카테고리 컬러 dot + 날짜 + 제목 + [카테고리명]
   - D-Day 이벤트는 📌 D-N 형식으로 표시
   - 최대 6개 표시, 나머지는 "+N개 더보기"

6. src/adapters/stores/useTodoStore.ts:
   → Zustand 스토어 (adapters 레이어)
   - todos 배열, CRUD + toggle 액션
   - ManageTodos 유스케이스 호출 + container.todoRepo 연동

7. src/adapters/components/Dashboard/DashboardTodo.tsx:
   - "✅ 오늘 할 일" 카드
   - 체크박스 + 텍스트 리스트
   - 완료 항목: 취소선 + 흐림 처리
   - 하단: "N/M 완료" 진행률 텍스트
   - 최대 5개 표시

8. src/adapters/stores/useMemoStore.ts:
   → Zustand 스토어 (adapters 레이어)
   - memos 배열, CRUD 액션
   - ManageMemos 유스케이스 호출 + container.memoRepo 연동

9. src/adapters/components/Dashboard/DashboardMemo.tsx:
   - "📝 메모" 카드 (대시보드 미니 버전)
   - 2~3개 포스트잇 카드 미리보기 (노랑, 분홍, 연두 배경)
   - 각 메모: 작은 카드에 텍스트 1~2줄만 표시
   - 클릭 시 메모 페이지로 이동

10. Dashboard.tsx 업데이트:
    - 3열 그리드: DashboardTimetable | DashboardSeatingMini | DashboardEvents
    - 2열 그리드: DashboardMemo | DashboardTodo
    - 좌석 미니뷰는 placeholder로 남겨둬
    - 반응형: lg 이상 3열, md 2열, sm 1열

의존성 흐름:
  Component → Store(adapters) → UseCase(usecases) → Repository Interface(domain) → 구현체(adapters/repos) → IStoragePort → Storage Adapter(infrastructure)
```

### 프롬프트 2-4: 행사 팝업 알림

```
앱 실행 시 행사 알림 팝업을 만들어줘.

=== 🟡 Domain 레이어 ===

1. src/domain/rules/ddayRules.ts:
   → 순수 함수, 외부 의존성 없음
   - calculateDDay(eventDate: string, today: Date): number
   - isAlertTarget(event, today): boolean → D-0, D-1, D-3 판정

=== 🟢 Use Cases 레이어 ===

2. src/usecases/events/CheckEventAlerts.ts:
   → 오늘 날짜 기준 알림 대상 일정 반환
   - execute(today: Date): Promise<SchoolEvent[]>
   - ddayRules 활용 + IEventsRepository 의존

=== 🔵 Adapters 레이어 ===

3. src/adapters/components/Dashboard/EventPopup.tsx:
   - 모달 오버레이 (배경 어둡게)
   - 중앙 팝업 카드 (sp-card 배경, w-[450px], rounded-2xl)
   - 제목: "🔔 오늘 행사 알림!"
   - 오늘 날짜 표시
   - 알림 대상 이벤트 리스트 (카테고리 dot + 제목 + 시간/장소)
   - D-Day 리마인더: D-1, D-3인 이벤트 표시
   - 버튼: "다시 알림 (1시간 후)" outline + "확인" blue solid
   - "확인" 클릭 시 닫힘
   - localStorage에 오늘 날짜 플래그 저장 → 같은 날 재표시 안 함
   - 다음 날이면 플래그 리셋
   - CheckEventAlerts 유스케이스를 스토어를 통해 호출

4. Dashboard.tsx에서 앱 실행 시 조건부 렌더링:
   - 오늘 알림 대상 이벤트가 있고, 오늘 아직 확인 안 했으면 팝업 표시
```

---

## 📌 Phase 3: 시간표 페이지

### 프롬프트 3-1: 시간표 전체 화면

```
시간표 전체 페이지를 만들어줘.

=== 🟢 Use Cases 레이어 ===

1. src/usecases/schedule/UpdateClassSchedule.ts:
   → 학급 시간표 수정 + 저장 유스케이스
   - execute(schedule: ClassScheduleData): Promise<void>
   - IScheduleRepository 의존

2. src/usecases/schedule/UpdateTeacherSchedule.ts:
   → 교사 시간표 수정 + 저장 유스케이스

=== 🔵 Adapters 레이어 ===

3. src/adapters/presenters/timetablePresenter.ts:
   → 도메인 데이터 → UI 표시 형식 변환 (adapters 레이어)
   - 과목별 컬러 매핑
   - 현재 교시/오늘 요일 하이라이트 정보 계산

4. src/adapters/components/Timetable/Timetable.tsx:
   - 상단: "📅 시간표" 제목 + [학급 시간표][교사 시간표] 토글 + "📥 내보내기" 버튼
   - 메인: 5열(월~금) × N행(교시) 주간 시간표 그리드

   학급 시간표:
   - 헤더: 교시 | 시간 | 월 | 화 | 수 | 목 | 금
   - 각 셀: 과목명 (과목별 배경색 + rounded-lg)
   - 점심시간 행: 회색 배경, "12:00~12:50 점심시간" 전체 span
   - 오늘 요일 열: 미묘한 파란 배경 틴트
   - 현재 교시 행: amber/yellow 보더 + 글로우 효과
   - 빈 셀: 회색 대시 "-"

   교사 시간표:
   - 동일 구조 + 과목명 아래 학급명 표시 (예: "국어\n2-3")
   - 내 수업: 강조, 다른 선생님 수업: 흐리게

   하단: "1학년 2반 | 담임: 김준일 | 2026학년도 1학기" 정보

5. src/adapters/components/Timetable/TimetableEditor.tsx:
   - "편집" 버튼 클릭 시 각 셀이 input으로 변환
   - 학급: 과목명 입력
   - 교사: 과목명 + 학급명 입력
   - "저장" 클릭 시 store → UpdateClassSchedule/UpdateTeacherSchedule 유스케이스 호출
   - "취소" 클릭 시 변경 사항 버리기

CSS Grid 사용. 셀 간격 4px. 각 셀 최소 높이 60px.

의존성: Component → useScheduleStore(adapters) → UpdateSchedule(usecases) → IScheduleRepository(domain)
```

---

## 📌 Phase 4: 좌석 배치도

### 프롬프트 4-1: 좌석 배치 + 드래그앤드롭

```
좌석 배치도 페이지를 만들어줘.

=== 🟡 Domain 레이어 ===

1. src/domain/rules/seatRules.ts:
   → 순수 함수, 외부 의존성 없음
   - validateSeatPosition(seating: SeatingData, row: number, col: number): boolean
   - shuffleSeats(seats: (Student|null)[][]): (Student|null)[][] → 학생 랜덤 재배치 (순수 함수)

=== 🟢 Use Cases 레이어 ===

2. src/usecases/seating/SwapSeats.ts:
   → 두 좌석 교환 + 저장
   - execute(row1, col1, row2, col2): Promise<SeatingData>
   - seatRules 검증 + ISeatingRepository 의존

3. src/usecases/seating/RandomizeSeats.ts:
   → 좌석 랜덤 배치 + 저장
   - seatRules.shuffleSeats 활용 + ISeatingRepository 의존

4. src/usecases/seating/UpdateSeating.ts:
   → 좌석 편집(학생 정보 수정) + 저장
   - execute(row, col, student: Student | null): Promise<SeatingData>
   - ISeatingRepository 의존

=== 🔵 Adapters 레이어 ===

5. src/adapters/stores/useSeatingStore.ts:
   → Zustand 스토어 (adapters 레이어)
   - seating 상태 (rows, cols, seats 2D 배열)
   - swapSeats → SwapSeats 유스케이스 호출
   - updateStudent → UpdateSeating 유스케이스 호출
   - randomize → RandomizeSeats 유스케이스 호출
   - container.seatingRepo 연동
   - 초기 데이터: 6×6, 샘플 한국 학생 이름 35명 + 빈자리 1개

6. src/adapters/components/Seating/Seating.tsx:
   - 상단: "🪑 좌석 배치도" + 부제 "1학년 2반 (35명)"
   - 우측 버튼: "🔀 자리 바꾸기", "✏️ 편집", "📥 내보내기"
   - 교탁: 상단 중앙 넓은 직사각형 "[ 교 탁 ]"
   - 좌석 그리드: CSS Grid, N열 × M행
   - 각 좌석 카드:
     - sp-card 배경, rounded-lg, border sp-border
     - 좌상단: 학번 (작은 텍스트)
     - 중앙: 이름 (큰 텍스트)
     - 빈 좌석: 점선 border, "빈 자리" 흐린 텍스트
   - 드래그앤드롭:
     - HTML5 Drag and Drop API 사용
     - 좌석 카드에 draggable
     - 드래그 시작: 반투명 + 파란 테두리
     - 드롭 대상: 배경 하이라이트
     - 드롭 완료: 두 좌석 교환 (swapSeats → SwapSeats 유스케이스)
   - 하단: "총 35명 | 6열 × 6행 | 빈 자리: 1개"
   - 안내: "학생을 드래그하여 자리를 변경할 수 있습니다"

   편집 모드:
   - 각 좌석 카드가 학번/이름 input으로 변환
   - 저장/취소 버튼

의존성: Component → useSeatingStore(adapters) → SwapSeats/RandomizeSeats(usecases) → seatRules(domain) + ISeatingRepository(domain)
```

---

## 📌 Phase 5: 일정 관리

### 프롬프트 5-1: 일정 관리 페이지

```
일정 관리 페이지를 만들어줘.

=== 🟡 Domain 레이어 ===

1. src/domain/rules/eventRules.ts:
   → 순수 함수, 외부 의존성 없음
   - filterByCategory(events: SchoolEvent[], categoryId: string): SchoolEvent[]
   - sortByDate(events: SchoolEvent[]): SchoolEvent[]
   - isRecurring(event: SchoolEvent, targetDate: Date): boolean

=== 🟢 Use Cases 레이어 ===

2. src/usecases/events/ManageEvents.ts (Phase 2에서 생성, 확장):
   - addEvent, updateEvent, deleteEvent, getEventsByMonth, getEventsByDate
   - addCategory, deleteCategory
   - IEventsRepository 의존

=== 🔵 Adapters 레이어 ===

3. src/adapters/components/Schedule/Schedule.tsx:
   - 상단: "📋 일정 관리" + "+ 일정 추가" 파란 버튼
   - 카테고리 탭: 전체 | 🔵학교 | 🟢학급 | 🟡부서 | 🟣나무학교 | ⚪기타 + "+ 카테고리 추가"
   - 각 카테고리 탭 옆에 컬러 dot 표시
   - 활성 탭: 파란 배경

   Split 레이아웃:
   좌측 (60%): 월별 캘린더 뷰
   - "◀ 2026년 3월 ▶" 월 네비게이션
   - 일~토 요일 헤더
   - 날짜 셀에 이벤트 유무 표시 (컬러 dot)
   - 오늘 날짜: 파란 원 배경
   - 날짜 클릭 시 해당 날짜 일정 필터링

   우측 (40%): 이벤트 리스트
   - 선택한 월의 일정을 날짜순으로 표시
   - 각 이벤트 카드: 카테고리 컬러 dot + 날짜(요일) + 제목 + 시간/장소
   - D-Day 이벤트는 "D-N" 빨간 배지
   - 호버 시 편집/삭제 아이콘

4. 일정 추가 모달:
   - 날짜 (date picker)
   - 제목 (text input)
   - 카테고리 (select dropdown, 카테고리 목록에서)
   - 시간 (optional, time input)
   - 장소 (optional, text input)
   - D-Day 표시 (checkbox)
   - 알림 설정: 다중 선택 (정시, 5분 전, 30분 전, 1시간 전, 1일 전, 3일 전)
   - 반복 (optional): 매주/매월/매년
   - "추가" 버튼 → store → ManageEvents.addEvent 유스케이스 호출

5. 카테고리 추가 모달:
   - 카테고리명 (text input)
   - 색상 선택 (color picker 또는 프리셋 8색)
   - "추가" 버튼

의존성: Component → useEventsStore(adapters) → ManageEvents(usecases) → eventRules(domain) + IEventsRepository(domain)
```

---

## 📌 Phase 5.5: 담임 메모장

### 프롬프트 5.5-1: 담임 메모장 (학생 기록 관리)

```
담임 메모장 페이지를 만들어줘. 학생별 출결/상담/생활 기록을 관리하는 기능이야.

사이드바에 👩‍🏫 담임메모 항목 추가 (일정과 메모 사이).

=== 🟡 Domain 레이어 ===

1. src/domain/rules/studentRecordRules.ts:
   → 순수 함수, 외부 의존성 없음
   - filterByStudent(records: StudentRecord[], studentId: string): StudentRecord[]
   - filterByCategory(records: StudentRecord[], categoryGroup: string): StudentRecord[]
   - filterByDateRange(records: StudentRecord[], start: Date, end: Date): StudentRecord[]
   - getAttendanceStats(records: StudentRecord[], studentId: string): AttendanceStats

=== 🟢 Use Cases 레이어 ===

2. src/usecases/studentRecords/ManageStudentRecords.ts:
   - addRecord, updateRecord, deleteRecord
   - getRecordsByStudent, getRecordsByDate, getStats
   - IStudentRecordsRepository 의존
   - studentRecordRules 활용

=== 🔵 Adapters 레이어 ===

3. src/adapters/stores/useStudentRecordsStore.ts:
   → Zustand 스토어 (adapters 레이어)
   - categories: 4개 그룹 (attendance, counseling, life, etc)
     - attendance: 생리결석, 병결, 무단결석, 지각, 조퇴, 결과
     - counseling: 학부모상담, 학생상담, 교우관계
     - life: 보건, 생활지도, 학습, 칭찬
     - etc: 진로, 가정연락, 기타
   - records: StudentRecord[]
   - CRUD 액션 → ManageStudentRecords 유스케이스 호출 + container.studentRecordsRepo 연동

4. Settings 확장 (useSettingsStore):
   - classes: [{ id, name, type: 'homeroom'|'subject', students: Student[] }]
   - 담임반은 seating.json의 학생 데이터와 자동 연동
   - 수업반은 별도로 학생 등록

5. src/adapters/components/StudentRecords/StudentRecords.tsx:

   상단:
   - 수업 반 선택 탭: [담임] [1-1] [1-2] ... (settings.classes에서)
   - 모드 탭: [✏️ 입력] [📊 진도] [🔍 조회]

   입력 모드:
   - 학생 선택 격자 (5열, 학번+이름 버튼, 다중 선택 가능)
   - 선택된 학생: 파란 배경 하이라이트
   - 카테고리 선택: 태그 칩(chip) 그룹별로 배치
     - 출결: 생리결석, 병결, 무단결석, 지각, 조퇴, 결과 (각각 다른 색)
     - 상담/관계: 학부모상담, 학생상담, 교우관계
     - 생활/학습: 보건, 생활지도, 학습, 칭찬
     - 기타: 진로, 가정연락, 기타
   - 선택된 카테고리: 진한 배경 하이라이트
   - 메모 textarea (선택사항): "추가 메모가 있으면 입력하세요..."
   - 안내 텍스트: "💡 카테고리만 선택해도 바로 저장할 수 있어요"
   - "저장하기" 파란 버튼 → 학생×카테고리 기록 생성, 날짜 자동(오늘)

   조회 모드:
   - 필터: 학생 선택(드롭다운) + 카테고리 필터 + 기간 필터 (이번 주/이번 달/전체)
   - 기록 타임라인: 날짜별 그룹, 각 기록에 카테고리 태그 칩 + 학생 이름 + 메모
   - 편집/삭제 버튼 (호버 시)
   - 통계 요약 카드: 학생별 출결 현황 (결석 N, 지각 N, 조퇴 N, 칭찬 N)

6. src/adapters/components/Dashboard/DashboardStudentRecords.tsx:
   - "👩‍🏫 오늘 기록" 카드
   - 오늘 기록 건수 + 최근 기록 2~3개 미리보기

다크 테마. 카테고리 칩은 그룹별로 다른 색 계열:
- 출결: red/orange 계열
- 상담: blue 계열
- 생활: green 계열
- 기타: gray 계열
```

---

## 📌 Phase 6: 메모 + 할일

### 프롬프트 6-1: 포스트잇 메모 페이지

```
포스트잇 메모 페이지를 만들어줘.

=== 🔵 Adapters 레이어 (기존 ManageMemos 유스케이스 활용) ===

1. src/adapters/components/Memo/Memo.tsx:
   - 상단: "📝 메모" + 색상 선택 (4개 원: 노랑, 분홍, 연두, 하늘) + "새 메모" 버튼
   - 캔버스 영역 (전체 높이, overflow hidden)
   - 메모 카드들이 자유 위치에 배치

   각 MemoCard:
   - 크기: ~180×140px
   - 배경: 선택한 색상 (yellow: #fef08a, pink: #fda4af, green: #86efac, blue: #93c5fd)
   - 헤더: 색상 변경 dot 4개 + 삭제 X 버튼 (작은 아이콘)
   - 본문: 텍스트 (여러 줄, overflow hidden)
   - 더블클릭: textarea로 전환 (편집 모드)
   - 드래그: mousedown + mousemove로 자유 위치 이동
     - 편집 중에는 드래그 비활성화
   - 위치(x, y)는 store → ManageMemos.updatePosition 유스케이스로 저장

   새 메모 추가 시:
   - 선택한 색상으로
   - 캔버스 빈 공간에 자동 배치 (랜덤 오프셋)

의존성: Memo.tsx → useMemoStore(adapters) → ManageMemos(usecases) → IMemoRepository(domain)
```

### 프롬프트 6-2: 투두리스트 페이지

```
투두리스트 페이지를 만들어줘.

=== 🟡 Domain 레이어 ===

1. src/domain/rules/todoRules.ts:
   → 순수 함수, 외부 의존성 없음
   - sortTodos(todos: Todo[]): Todo[] → 미완료 위, 완료 아래
   - filterByDateRange(todos: Todo[], range: 'today'|'week'|'all'): Todo[]
   - groupByDate(todos: Todo[]): Record<string, Todo[]>
   - isOverdue(todo: Todo, today: Date): boolean

=== 🔵 Adapters 레이어 (기존 ManageTodos 유스케이스 활용) ===

2. src/adapters/components/Todo/Todo.tsx:
   - 상단: "✅ 할 일" + 날짜 필터 탭 (전체, 오늘, 이번 주)
   - 상단 우측: 진행률 바 (완료/전체, 프로그레스 바 + 퍼센트)

   추가 폼:
   - 날짜 선택 (date input) + 텍스트 입력 + Enter로 추가
   - 또는 "추가" 버튼

   투두 리스트:
   - 각 항목: 체크박스 + 텍스트 + 날짜 라벨 + 삭제 버튼(호버 시)
   - 완료 체크 시: 취소선 + opacity-50, 리스트 하단으로 이동 (todoRules.sortTodos 활용)
   - 미완료 항목이 위, 완료 항목이 아래
   - 지난 날짜의 미완료 항목: 빨간 날짜 라벨 (overdue, todoRules.isOverdue 활용)

   날짜별 그룹핑 (todoRules.groupByDate 활용):
   - "오늘", "내일", "이번 주", "지난 할 일" 섹션 구분
   - 각 섹션 접기/펼치기

의존성: Todo.tsx → useTodoStore(adapters) → ManageTodos(usecases) → todoRules(domain) + ITodoRepository(domain)
```

---

## 📌 Phase 7: 설정

### 프롬프트 7-1: 설정 페이지

```
설정 페이지를 만들어줘.

=== 🔵 Adapters 레이어 ===

src/adapters/components/Settings/Settings.tsx:
- 세로 스크롤 레이아웃, 섹션별 카드

섹션 1 - "학교/학급 정보":
- 학교명, 학급명, 교사명, 담당 과목 text input

섹션 2 - "교시 시간 설정":
- 편집 가능한 테이블: 교시 | 시작 시간 | 종료 시간
- 각 행: period number + time input (start) + time input (end)
- 점심시간 별도 행 (회색 배경)
- "+ 교시 추가" 버튼, 삭제 버튼

섹션 3 - "좌석 설정":
- 행 수: number stepper (1~10)
- 열 수: number stepper (1~10)

섹션 4 - "위젯 설정":
- 기본 투명도: range slider (0~100%, 현재 값 표시)
- 항상 위에 표시: toggle switch
- 시작 시 위젯 모드: toggle switch

섹션 5 - "시스템":
- 시작 시 자동 실행: toggle switch
- 알림 소리: toggle switch
- 방해 금지 시간: time input (시작~종료)

섹션 6 - "일정 카테고리 관리":
- 카테고리 리스트 (컬러 원 + 이름 + 기본여부 + 삭제 버튼)
- 기본 카테고리는 삭제 불가 (삭제 버튼 비활성화)
- "+ 카테고리 추가" 버튼 → 이름 + 색상 입력

하단: "저장" 파란 버튼 + "초기화" outline 빨간 버튼 (확인 다이얼로그)

모든 설정은 useSettingsStore → container.settingsRepo로 저장.
toggle switch는 Tailwind로 커스텀 구현 (파란색 active).
```

---

## 📌 Phase 8: 위젯 모드

### 프롬프트 8-1: 위젯 모드 구현

```
위젯 모드를 구현해줘.

=== 🔴 Infrastructure 레이어 (Electron) ===

1. electron/main.ts 수정:
   - 풀 앱 윈도우 / 위젯 윈도우 전환 기능
   - 위젯 윈도우:
     - frameless (frame: false)
     - transparent (transparent: true)
     - alwaysOnTop: true
     - 크기: 설정의 widget.size (기본 380×650)
     - 최소 크기: 280×350
     - resizable: true
     - 위치: 설정의 widget.position (없으면 화면 우상단)
     - 위치/크기 변경 시 자동 저장
   - IPC: window:toggleWidget, window:setOpacity(value)

=== 🔵 Adapters 레이어 ===

2. src/adapters/components/Widget/Widget.tsx:
   - 프레임리스 위젯 UI
   - 상단: "📌 쌤핀" 작은 텍스트 + 확장 버튼 (더블클릭으로 풀 앱 전환)
   - 드래그 영역: 상단 바를 잡고 위젯 이동 (-webkit-app-region: drag)

   콘텐츠 (세로 스택, 섹션 구분선):
   - 날짜/시간/날씨 (Clock + WeatherBar 컴팩트 버전)
   - 오늘의 메시지 (한 줄 배너)
   - 시간표 (컴팩트 리스트, 현재 교시 amber 하이라이트)
   - 일정 (컬러 dot + 날짜 + 제목, 3~4개)
   - 할 일 (체크박스 리스트, 진행률)
   - 메모 미리보기 (2개 미니 포스트잇)

   반응형 콘텐츠:
   - 위젯 높이 < 500px: 시간표 + 일정만
   - 위젯 높이 500~600px: + 할일
   - 위젯 높이 > 600px: 모든 섹션 표시
   - ResizeObserver로 위젯 크기 감지

   우클릭 컨텍스트 메뉴:
   - "📌 항상 위에 표시" (토글, 체크마크)
   - "🔲 전체 화면으로 전환"
   - "🎨 투명도 조절" + 인라인 슬라이더 (0~100%)
   - "⚙️ 설정"
   - "❌ 닫기"

   배경 투명도:
   - Electron BrowserWindow의 opacity 또는 CSS backdrop 활용
   - 슬라이더로 실시간 조절
   - 설정값 자동 저장

3. App.tsx 수정:
   - URL 파라미터 또는 IPC로 위젯/풀앱 모드 판별
   - 위젯 모드면 Widget 컴포넌트 렌더링
   - 풀앱 모드면 기존 Sidebar + 페이지 렌더링
```

---

## 📌 Phase 8.5: 일정 공유

### 프롬프트 8.5-1: 일정 공유 (파일 내보내기/가져오기)

```
일정을 다른 선생님과 파일로 공유하는 기능을 만들어줘.

=== 🟡 Domain 레이어 ===

.ssampin 파일 포맷 (JSON 기반) — domain/entities/ShareFile.ts에 이미 정의:
- meta: { version, type: 'events', createdAt, createdBy, schoolName, description }
- categories: [{ id, name, color }]
- events: [{ date, title, time, location, categoryId, dday, alerts, recurrence }]

1. src/domain/rules/shareRules.ts:
   → 순수 함수, 외부 의존성 없음
   - validateShareFile(data: unknown): SsampinShareFile | null → 유효성 검증
   - detectDuplicates(existing: SchoolEvent[], incoming: SchoolEvent[]): DuplicateInfo[]
   - autoMapCategories(myCategories: EventCategory[], fileCategories: EventCategory[]): CategoryMapping[]

=== 🟢 Use Cases 레이어 ===

2. src/usecases/events/ExportEvents.ts:
   - execute(categoryIds: string[], dateRange?): SsampinShareFile → 선택한 일정을 공유 파일로 변환
   - IEventsRepository + ISettingsRepository 의존

3. src/usecases/events/ImportEvents.ts:
   - execute(shareFile: SsampinShareFile, mappings: CategoryMapping[]): ImportResult
   - 중복 감지 (shareRules.detectDuplicates), 카테고리 매핑 적용
   - IEventsRepository 의존

=== 🔵 Adapters 레이어 ===

4. 일정 관리 페이지에 "📤 일정 공유" / "📥 일정 가져오기" 버튼 추가:

   내보내기 (공유하기) 모달:
   - 카테고리 선택 (체크박스, 예: 나무학교만)
   - 기간 선택: 전체 / 이번 학기 / 특정 월 선택
   - 설명 입력 (optional)
   - 미리보기: 선택된 일정 N개 표시
   - "내보내기" 클릭 → ExportEvents 유스케이스 호출 → 파일 저장 대화상자
   - 파일명 자동 제안: "나무학교_2026_일정.ssampin"

   가져오기 (받기) 모달:
   - 파일 선택 대화상자 (.ssampin 필터)
   - 가져오기 미리보기:
     - 파일 메타 정보 표시 (작성자, 날짜, 설명)
     - 포함된 일정 목록 (스크롤 리스트)
     - 카테고리 매핑: 파일의 카테고리 → 내 카테고리 (자동 매칭, 드롭다운으로 변경 가능, 없으면 "새로 생성" 옵션)
     - 중복 감지: 같은 날짜+제목이면 "중복" 표시 + 덮어쓰기/건너뛰기 선택
   - "가져오기" 클릭 → ImportEvents 유스케이스 호출
   - 결과 요약: "N개 추가, M개 건너뜀"

=== 🔴 Infrastructure 레이어 (Electron) ===

5. 파일 연결 (Electron):
   - electron-builder.yml에 fileAssociations 설정 (.ssampin 확장자)
   - .ssampin 더블클릭 → 쌤핀 실행/포커스 → 가져오기 모달 자동 표시
   - electron/main.ts: app.on('open-file') + process.argv에서 파일 경로 감지
   - second-instance 이벤트로 이미 실행 중일 때도 처리

6. IPC 채널:
   - share:export (data: SsampinShareFile) → dialog.showSaveDialog + 파일 쓰기
   - share:import () → dialog.showOpenDialog + 파일 읽기 + 파싱
   - share:openWith (filePath) → Main→Renderer로 파일 내용 전달
```

---

## 📌 Phase 9: 내보내기

### 프롬프트 9-1: 내보내기 기능

```
내보내기 기능을 만들어줘.

=== 🔵 Adapters 레이어 ===

1. src/adapters/components/Export/Export.tsx:
   - 2단계 UI:
     Step 1: 항목 선택 (체크박스)
     - ☐ 학급 시간표
     - ☐ 교사 시간표
     - ☐ 좌석 배치도
     - ☐ 학교 일정
     Step 2: 포맷 선택
     - [HWPX] [Excel] [PDF] 카드 형태 버튼 (아이콘 + 설명)
   - "내보내기" 버튼 → 파일 저장 다이얼로그 → 생성 → 완료 토스트

=== 🔴 Infrastructure 레이어 ===

2. src/infrastructure/export/:
   - HwpxExporter.ts: 시간표 → 테이블, 좌석배치 → 테이블 (HWPX 형식)
   - ExcelExporter.ts: exceljs로 워크시트 생성, 셀 스타일(배경색, 테두리, 정렬)
   - PdfExporter.ts: printToPDF API 활용

3. electron/ipc/export.ts:
   - IPC 핸들러: export:hwpx, export:excel, export:pdf
   - 파일 저장 대화상자 + 생성 + 저장

=== 🔵 Adapters 레이어 ===

4. src/adapters/components/common/Toast.tsx:
   - 우하단 슬라이드 인
   - "✅ 파일이 저장되었습니다" + "파일 열기" 링크
   - 3초 후 자동 사라짐

의존성: Export.tsx(adapters) → stores(adapters) → Exporter(infrastructure) + IPC(electron)
```

---

## 📌 Phase 10: 마무리

### 프롬프트 10-1: 온보딩 + 시스템 트레이

```
첫 실행 온보딩과 시스템 트레이를 만들어줘.

=== 🔵 Adapters 레이어 ===

1. src/adapters/components/Onboarding/Onboarding.tsx:
   - settings.json이 없으면 온보딩 표시
   - 4단계:
     Step 1: 환영 화면 ("쌤핀에 오신 것을 환영합니다!" + 시작하기 버튼)
     Step 2: 학교 정보 (학교명, 학년/반, 교사명, 담당 과목)
     Step 3: 교시 시간 설정 (프리셋: 6교시/7교시 + 직접 입력)
     Step 4: 완료 (체크마크 + "대시보드로 이동")
   - 스텝 인디케이터 (● ○ ○ ○)
   - "다음" / "이전" 버튼
   - 완료 시 useSettingsStore → container.settingsRepo로 저장

=== 🔴 Infrastructure 레이어 (Electron) ===

2. 시스템 트레이 (electron/main.ts):
   - 트레이 아이콘 (📌 핀 아이콘)
   - 우클릭 메뉴:
     - "쌤핀 열기"
     - "위젯 모드"
     - "---"
     - "설정"
     - "종료"
   - 창 닫기(X) 시 트레이로 최소화 (완전 종료 아님)
   - 트레이 더블클릭 시 창 표시

3. 시작 프로그램 등록:
   - 설정의 launchOnStartup이 true면 Electron app.setLoginItemSettings() 호출
```

### 프롬프트 10-2: 빌드 + 테스트

```
빌드 설정을 마무리하고 테스트해줘.

1. electron-builder.yml 최종 확인:
   - appId: com.ssampin.app
   - productName: 쌤핀
   - Windows NSIS 인스톨러
   - 아이콘 설정 (build/icon.ico 필요)
   - publish: github
   - fileAssociations: [{ ext: "ssampin", name: "SsamPin 일정 파일" }]

2. package.json scripts 최종 정리

3. README.md 작성:
   - 프로젝트 소개
   - 클린 아키텍처 구조 다이어그램
   - 스크린샷 (목업 이미지 활용)
   - 설치 방법
   - 개발 환경 설정
   - 기술 스택
   - 라이선스

4. tsconfig.json에 path alias 확인:
   - @domain/* → src/domain/*
   - @usecases/* → src/usecases/*
   - @adapters/* → src/adapters/*
   - @infrastructure/* → src/infrastructure/*

5. ESLint import 규칙 설정 (권장):
   - @domain/ → 다른 레이어 import 금지
   - @usecases/ → @domain/만 import 허용
   - @adapters/ → @domain/ + @usecases/ import 허용
   - @infrastructure/ → @domain/ import 허용

6. 개발 모드에서 전체 기능 테스트:
   - npm run dev로 브라우저 모드 동작 확인
   - 모든 페이지 네비게이션
   - 데이터 입력/저장/로드 (DI 컨테이너 → Repository → Storage 흐름)
   - 시간표 현재 교시 하이라이트 (periodRules → GetCurrentPeriod → Store → Component)
   - 좌석 드래그앤드롭 (seatRules → SwapSeats → Store → Component)
   - 일정 CRUD
   - 메모 드래그/편집
   - 투두 체크/삭제
   - 설정 저장

7. TypeScript 에러 0개 확인 (npx tsc --noEmit)

의존성 규칙 최종 체크:
✅ domain/ → 어디에도 의존하지 않음 (순수 타입 + 순수 함수)
✅ usecases/ → domain/만 import
✅ adapters/ → domain/ + usecases/ import
✅ infrastructure/ → domain/ports import
✅ adapters/di/container.ts → infrastructure/ import (유일한 예외, 의존성 조립)
```