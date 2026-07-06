# 모바일 읽기 전용 뷰잉·통계 화면 3종 — 설계서

team: mobile-records-stats · 작성: designer · 대상: builder-student, builder-class

## 0. 요약

기존 모바일 앱은 학생 기록·출결을 "오늘 처리"에 최적화된 화면만 갖고 있고(최근 3건 고정,
필터 없음, 통계 없음), 담임/교과 교사가 누적 데이터를 훑어보는 화면이 없다. 이번 설계는
**입력 로직을 하나도 건드리지 않고**(스토어 read-only 구독, domain 재사용만) 3개의 조회
화면을 추가한다. 3화면 모두 읽기 전용(수정/삭제 없음), 집계는 컴포넌트 내 `useMemo`(PC
`ClassRecordStatsView`와 동일 패턴), domain/ 신규 파일 없음(`getAttendanceStats`,
`studentKey`, `filterActive`만 재사용), App.tsx·스토어 수정 없음.

- **S1** 학생 기록 전체 모아보기 — `StudentQuickActionSheet` 기록 탭 → 신규 오버레이 시트
- **S2** 담임 학생 출결 요약·내역 — `StudentQuickActionSheet` 출결 탭 인라인 + 신규 오버레이 시트
- **S3** 수업 학급 출결 통계 — `ClassDetailPage` 출결 탭 내부 세그먼트(신규 최상위 탭 아님)

### 핵심 배치 결정 3건

| #   | 결정                                                                                                       | 근거                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | S1은 기록 탭 안 스크롤 연장이 아니라 **새 풀시트**(`StudentRecordsFullSheet`)로 분리                       | `StudentQuickActionSheet`는 `max-h-[50vh]` 제약의 "빠른 확인/빠른 추가"용 시트다(RecordsSubTab.tsx:56). 월별 그룹핑+카테고리 필터+전체 이력을 그 공간에 넣으면 "새 기록 추가" 폼과 뒤섞인다. 깊은 조회는 전용 풀시트로 분리하는 게 위계상 명확하고, hard constraint 5가 S1에 신규 오버레이 시트를 명시 허용한다.                                                                                     |
| 2   | S2는 기록 탭이 아니라 **출결 탭**(`AttendanceSubTab`) 인라인 요약 + 신규 시트                              | 담임이 "오늘 상태를 바꾸기 전에 최근 결석 빈도"를 확인하는 흐름은 출결 탭 안에서 끊김 없이 이어져야 한다. 기록 탭(S1 진입점)에 넣으면 "전체 모아보기"와 "출결 요약"이 한 화면에서 경쟁한다. 4번째 pill 세그먼트 신설은 이미 3개(출결/기록/연락처)로 찬 헤더 폭을 더 좁힌다. `AttendanceSubTab`은 이미 `info.type==='homeroom'` 분기가 있어(AttendanceSubTab.tsx:86,125) 교과 학생 숨김이 자연스럽다. |
| 3   | S3는 `ClassDetailPage` 4번째 탭이 아니라 **`ClassAttendanceTab` 내부 `SegmentedControl`**로 체크/통계 전환 | 통계는 출결과 같은 도메인의 다른 표현이지 별도 최상위 정보가 아니다. 4탭화는 탭 폭을 25%씩 줄인다. 결정적으로 `ClassAttendanceTab`은 `AttendanceCheckPage`(pages/, 어느 빌더도 미소유)를 감싸는 얇은 래퍼라(ClassAttendanceTab.tsx:17-35) 그 안에서 세그먼트로 분기하면 `AttendanceCheckPage.tsx`를 전혀 건드리지 않는다.                                                                            |

---

## 1. S1 — 학생 기록 전체 모아보기

### 진입 경로

`StudentsPage` → 학생 탭 → `StudentQuickActionSheet` → 서브탭 "기록"(`RecordsSubTab`) →
"전체 기록 보기" 링크 → 신규 풀시트 `StudentRecordsFullSheet`. 담임/교과 학생 모두 동일 진입
(RecordsSubTab은 `studentId`만 받아 type 무관 — RecordsSubTab.tsx:12).

### 390px 와이어프레임

```
┌ StudentQuickActionSheet — 기록 탭(기존) ──┐
│ chevron  최근 기록 (3)        [+ 새 기록] │  기존 그대로
│  (펼치면 최근 3건 카드, 기존 그대로)       │
│ 전체 기록 보기 (24건)                 ›  │  ← 신규 1줄
└────────────────────────────────────────────┘

┌ StudentRecordsFullSheet (신규) ─────────────┐
│              ▬▬                             │
│ 12번 김민준 · 전체 기록 24건            ✕   │
│ [전체 24][출결 8][상담 5][생활 9][기타 2]   │ 가로 스크롤 칩
│ 2026년 7월                                   │
│ ┃ 7/6  [결석] 결석 (질병)                    │
│ ┃      오늘 아침 미열로 결석 연락 받음        │
│ ┃ 7/2  [상담] 학생상담 · 교우관계 상담 진행…  │
│ 2026년 6월                                   │
│ ┃ 6/28 [생활] 칭찬 · 모둠 활동에서 배려…      │
│ ...                          (스크롤 계속)  │
└───────────────────────────────────────────────┘
```

### 컴포넌트 트리

```
RecordsSubTab (수정) → "전체 기록 보기 (N건)" 버튼 → showFullSheet
 └─ {showFullSheet && <StudentRecordsFullSheet studentId studentName onClose />}

StudentRecordsFullSheet (신규)
 ├─ 핸들바 + 헤더(이름·건수·닫기)
 ├─ CategoryFilterChips (인라인)
 └─ MonthGroupedTimeline → RecordRow[] (시트 내부 로컬 렌더, 별도 파일 아님)
```

### 상태/인터랙션

- `selectedCategory: 'all' | RecordCategoryItem['id']`, 기본 `'all'`. 칩에 카운트 배지(전체
  레코드 기준 고정값, 필터 무관).
- 칩 탭 → 아래 타임라인만 클라이언트 재필터(재조회 없음).
- 리스트 아이템 탭 → `expandedIds: Set<string>` 토글(내용 1줄 초과 시에만 펼치기 화살표 —
  StudentRecordReferencePanel.tsx:126 아이디어 차용, 편집 모드 없음/읽기 전용).
- `useBottomSheet()` 호출 + 메타 테스트 등록 필수(§5). 컨테이너 `z-[60]`(§4.5).

### 데이터 소스 · 집계 로직

- `getRecordsByStudentId(studentId, Number.POSITIVE_INFINITY)` — 기본 limit=3 오버라이드
  필수(useMobileStudentRecordsStore.ts:68-73). 결과는 이미 date desc 정렬됨.
- 카테고리 목록/색: `categories` selector(useMobileStudentRecordsStore.ts:16,32) 또는
  `DEFAULT_RECORD_CATEGORIES`(RecordCategory.ts:46-72), id: `attendance|counseling|life|etc`.
  라벨은 `cat.name.split('(')[0]?.trim()`(RecordsSubTab.tsx:102 관례 재사용).
- 표시 라벨: 출결이면 `record.subcategory`, 그 외는 `record.tags?.join(' · ')`
  (RecordsSubTab.tsx:104-112 Q2 규칙 그대로 이식, 신규 로직 아님).
- 월 그룹핑: `record.date.slice(0,7)` 키로 `useMemo` 그룹 → 헤더 `"${y}년 ${m}월"`(컴포넌트
  내부 pure 헬퍼, domain 아님). 그룹 내부는 이미 date desc라 재정렬 불필요.
- 카테고리별 카운트(칩 배지): 전체 레코드를 `category`별 `length` 카운트.

### 정확한 Tailwind 클래스

- 진입 링크: `w-full flex items-center justify-between px-1 py-3 min-h-[44px] text-sp-accent text-sm font-medium`
- 시트 본체: `relative w-full h-[85vh] glass-card rounded-t-2xl pb-safe flex flex-col`
  (§4.5 공통 규격 참고)
- 헤더 닫기 버튼: `p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10`
- 카테고리 칩 바: `flex gap-1.5 px-5 py-3 overflow-x-auto no-scrollbar shrink-0`, 칩 클래스는 §4.1
- 타임라인 영역: `flex-1 overflow-y-auto px-5 py-3 space-y-5`
- 월 그룹 헤더(sticky): `text-sp-muted text-xs font-semibold mb-2 px-1 sticky top-0 bg-sp-card/95 backdrop-blur-sm py-1 -mx-1`
- 레코드 카드: 기존 그대로 `bg-white/5 backdrop-blur-sm border border-white/10 flex rounded-xl overflow-hidden`
  - 좌측 색 바 `w-1 shrink-0 ${CATEGORY_COLORS[cat.color]}`(shared.ts:38-45). 날짜는 월 헤더가
    연-월을 이미 보여주므로 행에는 `M/D`만 표기.

### 빈 상태 / 로딩

- 레코드 0건: `EmptyState mascot text="아직 기록이 없습니다." hint="학생 상세에서 기록을 추가해보세요."`
- 필터 결과 0건: `EmptyState icon="filter_alt_off" text="해당 분류의 기록이 없습니다."`(액션 버튼 생략 — 읽기 전용 화면).
- 로딩: 시트 진입 전 이미 `RecordsSubTab`의 `load()`가 완료돼 있어 별도 스피너 불필요.

### 다크 모드

`bg-black/50`(배경 오버레이), `hover:bg-black/5 dark:hover:bg-white/10`, `bg-sp-card/95`(sticky
헤더) 외 나머지는 sp-\* CSS 변수 자동 대응(별도 `.dark` 분기 불필요).

### 접근성

시트 루트 `role="dialog" aria-modal="true" aria-label="{name} 전체 기록"`. 칩 바
`role="tablist" aria-label="기록 분류 필터"`, 칩 `role="tab" aria-selected`. 펼치기 버튼
`aria-expanded`. 닫기 버튼 `aria-label="닫기"`. 전 요소 `min-h-[44px]`.

---

## 2. S2 — 담임 학생 출결 요약·내역

### 진입 경로

`StudentQuickActionSheet` → 출결 탭(`AttendanceSubTab`) → 기존 편집 UI 아래 신규 "누적 출결"
요약(담임 학생만) → "전체 내역" 버튼 → 신규 시트 `StudentAttendanceHistorySheet`.

**교과(`type:'class'`) 학생은 완전히 숨김.** 근거: `bridgeAttendanceRecord`는
`info.type==='homeroom'`일 때만 호출된다(AttendanceSubTab.tsx:86-95,125-134). 교과 학생의
`studentId`(=`studentKey`, 예 `"2-3-15"`)로는 `category:'attendance'` 레코드가 원천적으로
존재할 수 없다. 데이터가 있을 수 없는 UI를 그려 "왜 항상 0이지?"란 혼란을 만들기보다, 아예
숨기는 편이 낫다(교과 출결 통계는 S3가 학급 단위로 이미 제공).

### 390px 와이어프레임

```
┌ AttendanceSubTab (담임일 때만 추가분) ─────┐
│ 출결 상태 [출석][지각][결석][조퇴][결과]     │ 기존 그대로
│ (사유/메모 폼 — 기존 그대로)                 │
│ ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈  │ 신규 구분선
│ 누적 출결 (전체 기간)                        │
│ 결석 3 · 지각 2 · 조퇴 1 · 결과 0 · 칭찬 4    │
│                         전체 내역 보기(6) › │
└────────────────────────────────────────────────┘

┌ StudentAttendanceHistorySheet (신규) ───────┐
│              ▬▬                             │
│ 12번 김민준 · 출결 내역                 ✕   │
│ [결석 3][지각 2][조퇴 1][결과 0][칭찬 4]    │ 탭=필터, 재탭=해제
│ 2026년 7월                                   │
│ ┃ 7/6  결석 · 질병 — 메모: 조퇴 후 병원 방문  │
│ ┃ 6/20 지각 · 미인정                         │
│ 2026년 3월                                   │
│ ┃ 3/14 칭찬 — 모둠 활동에서 도움을 줌         │
│ ...                          (스크롤 계속)  │
└───────────────────────────────────────────────┘
```

### 컴포넌트 트리

```
AttendanceSubTab (수정) → {info.type==='homeroom' && <AttendanceHistorySummary studentId />}

AttendanceHistorySummary (신규)
 ├─ 요약 스트립(읽기 전용 5개 숫자) + "전체 내역 보기 (N)" 버튼
 └─ {showSheet && <StudentAttendanceHistorySheet studentId studentName onClose />}

StudentAttendanceHistorySheet (신규) — 헤더 + StatFilterChips(인라인) + MonthGroupedTimeline
```

### 상태/인터랙션

- `AttendanceHistorySummary`: 시트 오픈 boolean만.
- 시트: `activeStat: 'absent'|'late'|'earlyLeave'|'resultAbsent'|'praise'|null` 로컬 state.
  같은 칩 재탭 시 해제, 다른 칩 탭 시 교체(desktop `RecordResultSummary`의 클릭형 칩과 동일
  상호작용 개념을 모바일 로컬 state로 재구현 — 그 컴포넌트 자체는 mobile 전용이 아니라 import
  하지 않음).
- `useBottomSheet()` + 메타 테스트 등록 필수. `z-[60]`.

### 데이터 소스 · 집계 로직

- 요약 숫자: `getAttendanceStats(records, studentId)` 재사용(studentRecordRules.ts:107-133) →
  `{absent, late, earlyLeave, resultAbsent, praise}`. `records`는
  `useMobileStudentRecordsStore((s)=>s.records)`.
- **기간 칩 없음 — "전체 기간" 고정.** 근거: 학생 1인의 출결 이력은 학급 통계보다 건수가 적어
  기간 세분화 실익이 낮고, 월 그룹 헤더 자체가 최근 탐색을 제공한다. 기간 필터는 건수가 많고
  기간 비교가 유의미한 S3에만 배치.
- 원본 리스트: `records.filter(r => r.studentId===studentId && r.category==='attendance')` +
  칭찬은 `category==='life' && (tags includes '칭찬' || subcategory==='칭찬')`
  (studentRecordRules.ts:126-130과 동일 조건 복제).
- **사유(질병/인정/미인정/기타) 추출**: domain에 export된 헬퍼 없음(`extractAttendanceType`은
  studentRecordRules.ts 내부 비공개). 행 표시 전용으로 로컬 정규식
  `subcategory.match(/\(([^)]+)\)/)?.[1]` 사용 — 집계에는 쓰지 않음, domain 수정 불필요.
- 상태 필터: `activeStat` 설정 시 유형 매핑(`absent→'결석'` 등, 칭찬은 `category==='life'`)으로
  재필터.
- 아이콘/색: `STATUS_CONFIG`(shared.ts:7-36) 재사용. 칭찬은 신규 로컬 상수
  `{icon:'star', color:'text-green-500 bg-green-500/10 border-green-500/40'}`(STATUS_CONFIG는
  `AttendanceStatus` 5종 키로 타입 고정돼 있어 확장하지 않고 시트 파일 내 별도 정의).

### 정확한 Tailwind 클래스

- 구분선: `border-t border-sp-border my-4 pt-4`(기존 `mt-4 space-y-3` 블록 다음 형제로 추가)
- 요약 라벨: `text-sp-muted text-xs font-medium mb-2`
- 요약 스트립: `flex flex-wrap gap-x-3 gap-y-1.5 text-sm`,
  각 항목 `<span className="{color} font-medium">{label} <b className="tabular-nums">{count}</b></span>`
  (색 매핑은 §4.4)
- "전체 내역 보기" 버튼: `w-full flex items-center justify-between mt-3 min-h-[44px] px-1 text-sp-accent text-sm font-medium`
- 시트/칩/타임라인은 §4.5 + §4.1 공통 규격 그대로

### 빈 상태 / 로딩

- 전 카운트 0: 스트립을 "이상 출결 없음 · 칭찬 기록 없음" 1줄 텍스트로 대체, "전체 내역 보기"
  버튼 숨김.
- 시트 내 필터 결과 0건: `EmptyState icon="event_available" text="해당 유형의 기록이 없습니다."`

### 다크 모드

색 페어(`text-red-500 dark:text-red-400` 등)는 표준 Tailwind 컬러라 constraint 1 허용 범위.
나머지는 sp-\* 토큰 자동 대응.

### 접근성

요약 스트립 `aria-label="누적 출결 요약"`. 시트/칩 접근성은 S1과 동일 규칙.

---

## 3. S3 — 수업 학급 출결 통계

### 진입 경로

`ClassDetailPage` → 출결 탭(`ClassAttendanceTab`) → 탭 내부 상단 `SegmentedControl`(체크/통계)
→ "통계" 선택 시 신규 `ClassAttendanceStatsView` 렌더. "체크" 선택 시 기존
`AttendanceCheckPage` embedded(무변경). **신규 오버레이 시트 없음 — 인라인 뷰만.**

### 390px 와이어프레임

```
┌ ClassDetailPage 헤더(기존) ────────────────┐
│ ← 2학년 3반 수학                            │
│ [출결][진도][특기사항]  (기존 최상위 탭)      │
│ [ 출결 체크 | 출결 통계 ]     (신규 세그먼트) │
│ [전체][이번 학기][이번 달][이번 주]  (신규)   │
│ 이번 학기 학급 전체 (연인원)                  │
│ 결석 12 · 지각 5 · 조퇴 2 · 결과 1            │
│ 학생별 출결                    옆으로 스크롤→│
│ ┌──────────┬────┬────┬────┬────┬────┐       │
│ │번호·이름  │출석│결석│지각│조퇴│결과│ <스크롤>│
│ │ 1 김민준 │ 18 │  1 │  0 │  0 │  0 │       │
│ │ 2 이서연 │ 17 │  0 │  2 │  0 │  0 │       │
│ │  ...     │    │    │    │    │    │       │
│ └──────────┴────┴────┴────┴────┴────┘       │
└───────────────────────────────────────────────┘
```

### 컴포넌트 트리

```
ClassAttendanceTab (수정)
 ├─ SegmentedControl(options:[{key:'check',label:'출결 체크'},{key:'stats',label:'출결 통계'}])
 ├─ mode==='check' → <AttendanceCheckPage .../> (무변경)
 └─ mode==='stats' → <ClassAttendanceStatsView classId className />

ClassAttendanceStatsView (신규)
 ├─ PeriodFilterChips(인라인, PC 미러) ├─ ClassSummaryStrip(신규) └─ StudentAttendanceTable(sticky+scroll)
```

### 상태/인터랙션

- `ClassAttendanceTab`에 로컬 `mode:'check'|'stats'`, 기본 `'check'`(기존 동작과 동일해 회귀 없음).
- `ClassAttendanceStatsView` 내부 `filter:'all'|'semester'|'month'|'week'`, 기본 `'all'`.
  **"직접 설정" 칩 제외.** 근거: 네이티브 날짜 인풋 2개를 프리셋 4칩과 한 줄에 두면 358px
  가용폭에서 두 줄로 넘치기 쉽고, 커스텀 범위는 학기말 정산 같은 저빈도 데스크톱 작업에
  가깝다. 필요 시 후속 PDCA에서 별도 시트형 날짜 선택으로 추가.
- 테이블 셀은 **비상호작용(읽기 전용)** — PC의 클릭 드릴인(`RecordDetailModal`)은 제외. 그
  모달은 `adapters/`(데스크톱 레이어) 컴포넌트라 `mobile/`에서 import 불가(레이어 분리),
  신규 상세 모달 도입은 "차트 라이브러리 미도입"과 같은 이유로 이번 스코프 밖(후속 PDCA).

### 데이터 소스 · 집계 로직

- 학급/학생: `useMobileTeachingClassStore.getClass(classId)`(useMobileTeachingClassStore.ts:36-38)
  → `cls.students` → `filterActive`(studentActivity.ts:69-73) → `.sort((a,b)=>a.number-b.number)`
  (PC ClassRecordStatsView.tsx:78-81과 동일).
- 출결 레코드: `useMobileAttendanceStore((s)=>s.records)` → `filter(r => r.classId===classId &&
dateRange)` — **period로 필터하지 않는다**(하루 여러 교시 체크분을 합산해야 학급 누적이
  맞다 — PC ClassRecordStatsView.tsx:94-99와 동일하게 period 무시).
- 기간 범위: PC `getFilterRange`(ClassRecordStatsView.tsx:24-52)를 `ClassAttendanceStatsView.tsx`
  내부에 **로컬 pure 함수로 이식**(이번 주=월요일 시작, 이번 달=1일부터, 학기=3~8월/9~2월).
  `adapters/`를 import할 수 없어(레이어 분리) 복제 필요 — domain/ 신규 파일이 아니라 미export
  컴포넌트 내부 헬퍼이므로 team-plan Rejected 항목과 충돌 없음.
- 학생별 집계: `useMemo`로 `Map<studentKey, Record<AttendanceStatus, number>>`(전원 0 초기화)
  → 필터된 레코드의 `record.students` 순회, `studentKey(sa)`(TeachingClass.ts:22-27, `sa:
StudentAttendance`도 동일 구조라 재사용 가능)로 매칭 → `entry[sa.status]++`(PC
  ClassRecordStatsView.tsx:89-108과 동일 알고리즘).
- 학급 요약(연인원): 위 Map 합산, `absent/late/earlyLeave/classAbsence`만(출석은 표에만 유지).
- 라벨/색: 5종 상태(출석/결석/지각/조퇴/결과) — `adapters/presentation/`는 import 불가하므로
  같은 색 값을 로컬 상수로 재정의(§4.4).

### 390px 폭 검증 (7열 표)

PC 원본 패딩 그대로면(px-4/px-3 + text-sm, ClassRecordStatsView.tsx:277-315): 번호(~46px)+
이름(~74px)+상태 5칸(각 ~52px×5=260px) ≈ **380px** > 콘텐츠 가용폭(390px 화면 − 좌우 px-4
32px = **358px**) → 넘친다. 패딩/폰트를 줄이면(text-xs+min-w-48px) 274~290px로 들어올 수는
있으나, 4글자 이상 이름이나 360px대 기기까지 고려하면 여유가 없어 다시 깨지기 쉽다.

**결정: 번호+이름을 하나의 sticky 열로 병합, 5개 상태 칸은 `overflow-x-auto`로 가로 스크롤.**
표 내용·순서는 PC와 동일(7개 정보 항목 모두 유지)하되 "항상 보이는 식별자"와 "훑어보는 값"을
sticky/scroll로 분리해 좁은 화면 전반에서 안정적으로 동작시킨다. 헤더 우측에 "옆으로 스크롤 →"
텍스트 힌트를 상시 노출(JS overflow 감지 없이 고정 텍스트 — 과설계 방지).

### 정확한 Tailwind 클래스

- `SegmentedControl` 위치: `ClassAttendanceTab` 루트를 `flex flex-col h-full`로, 상단
  `px-4 py-2 border-b border-sp-border shrink-0`에 배치, 하단 `flex-1 overflow-hidden` 슬롯.
- 기간 칩: §4.1 공통 규격(`flex gap-1.5 px-4 py-3 overflow-x-auto no-scrollbar shrink-0`)
- 학급 요약 스트립: `mx-4 mb-3 rounded-xl border border-sp-border bg-sp-card p-3`,
  라벨 `text-tiny text-sp-muted mb-1.5`, 값 줄 `flex flex-wrap gap-x-3 gap-y-1 text-sm`
- 테이블 카드: `mx-4 mb-4 rounded-xl border border-sp-border bg-sp-card overflow-hidden`
  - 타이틀 바 `px-4 py-2.5 border-b border-sp-border flex items-center justify-between`
    (좌측 `text-sm font-semibold text-sp-text flex items-center gap-1.5` + 아이콘
    `how_to_reg`, 우측 `text-tiny text-sp-muted`)
  - 스크롤 컨테이너 `overflow-x-auto`, `<table className="text-xs border-collapse w-full">`
  - sticky 헤더/셀 공통: `sticky left-0 z-10 bg-sp-card border-r border-sp-border`
  - 식별자 헤더/셀: `px-2 py-2.5 text-left font-medium w-[84px]`(헤더: "번호·이름", 셀:
    `<span className="text-sp-muted">{s.number}</span> <span className="text-sp-text font-medium">{s.name}</span>`)
  - 상태 헤더/값 셀: `px-2 py-2.5 text-center font-medium tabular-nums min-w-[48px] ${textColor}`
  - 헤더 행 배경: `bg-black/[0.03] dark:bg-white/[0.03]`(표준 흑백 틴트, sp-\* 알파 아님)
  - 바디 구분선: `divide-y divide-sp-divider`

### 빈 상태 / 로딩

- 학급 미로드: PC 스켈레톤 패턴 이식(`animate-pulse` + 고정 높이 바 3~4개,
  ClassRecordStatsView.tsx:210-219), `!cls` 가드로 판단.
- 활성 학생 0명: `EmptyState icon="group_off" text="등록된 학생이 없습니다."`
- 학생은 있으나 기간 내 레코드 없음: 표는 전원 0으로 정상 렌더(PC와 동일 — "이상 없음" 자체가
  정보이므로 EmptyState로 가리지 않음).

### 다크 모드

`bg-sp-card`, `border-sp-border`, `divide-sp-divider`는 CSS 변수 자동 대응. 상태 텍스트는
`text-{color}-400`(PC ATTENDANCE_TEXT가 라이트/다크 공통으로 쓰는 값 그대로 채택, 별도 `dark:`
불필요). `bg-black/[0.03] dark:bg-white/[0.03]`만 라이트/다크 분기.

### 접근성

`SegmentedControl`은 기존 컴포넌트 재사용(`role="tablist"/"tab"` 자동 포함,
SegmentedControl.tsx:26-53), `ariaLabel="출결 화면 전환"`. 기간 칩 `role="tablist" aria-label="통계
기간"`. 표는 네이티브 `<thead>/<tbody>` + 헤더 셀 `scope="col"`, 식별자 셀 `scope="row"`. 스크롤
힌트 텍스트는 정보이므로 `aria-hidden` 금지.

---

## 4. 공통 시각 언어 (두 빌더 결과물 통일)

### 4.1 필터/기간 칩 (S1 카테고리, S2 상태, S3 기간 — 3화면 동일 규격)

| 상태     | 클래스                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------ |
| 비활성   | `shrink-0 min-h-[44px] px-3 py-2 rounded-lg text-xs font-medium border border-sp-border text-sp-muted` |
| 활성     | `shrink-0 min-h-[44px] px-3 py-2 rounded-lg text-xs font-medium bg-sp-accent text-sp-accent-fg`        |
| 컨테이너 | `flex gap-1.5 px-4(또는5) py-3 overflow-x-auto no-scrollbar`                                           |

### 4.2 통계 숫자 타이포

카운트 숫자는 항상 `tabular-nums font-medium`(자릿수 변해도 폭 안정). 인라인 요약(S2 요약
스트립·S3 학급 요약)은 `text-sm`, 표 안 셀 숫자는 `text-xs`(밀도 우선).

### 4.3 표/리스트 스타일

카드형 리스트(S1/S2 타임라인): `bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl`

- 좌측 색 바. 표(S3): `rounded-xl border border-sp-border bg-sp-card`, 헤더
  `bg-black/[0.03] dark:bg-white/[0.03]`, 행 구분 `divide-y divide-sp-divider`. 월 그룹 헤더:
  `text-sp-muted text-xs font-semibold`.

### 4.4 상태색 매핑 (전 화면 고정 — STATUS_CONFIG/ATTENDANCE_TEXT 기반)

| 상태              | 아이콘       | 표 텍스트 색      | 인라인 텍스트 색                       | 칩 배경(표준 Tailwind 알파)             |
| ----------------- | ------------ | ----------------- | -------------------------------------- | --------------------------------------- |
| 출석 present      | check_circle | `text-green-400`  | `text-green-500 dark:text-green-400`   | `bg-green-500/10 border-green-500/40`   |
| 결석 absent       | cancel       | `text-red-400`    | `text-red-500 dark:text-red-400`       | `bg-red-500/10 border-red-500/40`       |
| 지각 late         | schedule     | `text-amber-400`  | `text-amber-500 dark:text-amber-400`   | `bg-amber-500/10 border-amber-500/40`   |
| 조퇴 earlyLeave   | exit_to_app  | `text-orange-400` | `text-orange-500 dark:text-orange-400` | `bg-orange-500/10 border-orange-500/40` |
| 결과 classAbsence | event_busy   | `text-purple-400` | `text-purple-500 dark:text-purple-400` | `bg-purple-500/10 border-purple-500/40` |
| 칭찬(S2 전용)     | star         | —                 | `text-green-500 dark:text-green-400`   | `bg-green-500/10 border-green-500/40`   |

카테고리 색(S1)은 기존 `CATEGORY_COLORS`(shared.ts:38-45) 그대로: 출결=red, 상담=blue,
생활=green, 기타=gray.

### 4.5 오버레이 시트 공통 규격 (S1/S2 신규 시트 전용, S3 해당 없음)

컨테이너 `fixed inset-0 z-[60] flex items-end`(기존 `StudentQuickActionSheet`가 raw `z-50`
사용 — 그 위에 겹쳐 뜰 수 있어 한 단계 높임), 배경 `absolute inset-0 bg-black/50`, 시트 본체
`relative w-full h-[85vh] glass-card rounded-t-2xl pb-safe flex flex-col`, 핸들바는 기존
`StudentQuickActionSheet`와 동일(`w-10 h-1 rounded-full bg-sp-border`). 둘 다
`useBottomSheet()` 호출 + `bottomSheetCoverage.meta.test.ts` 등록 필수(§5).

---

## 5. 파일 계획 (겹침 0)

### builder-student 소유 (`src/mobile/pages/students/*`)

| 파일                                | 종류 | 내용                                                                           |
| ----------------------------------- | ---- | ------------------------------------------------------------------------------ |
| `RecordsSubTab.tsx`                 | 수정 | "전체 기록 보기 (N건)" 링크 1줄 + 시트 오픈 state                              |
| `AttendanceSubTab.tsx`              | 수정 | `{info.type==='homeroom' && <AttendanceHistorySummary .../>}` 1줄(구분선 포함) |
| `StudentRecordsFullSheet.tsx`       | 신규 | S1 풀시트(카테고리 필터 + 월별 타임라인)                                       |
| `AttendanceHistorySummary.tsx`      | 신규 | S2 인라인 요약 스트립 + 시트 오픈 트리거                                       |
| `StudentAttendanceHistorySheet.tsx` | 신규 | S2 풀시트(상태 필터 + 월별 타임라인)                                           |

### builder-class 소유 (`src/mobile/components/Class/*` + `ClassDetailPage.tsx`)

| 파일                           | 종류   | 내용                                                                             |
| ------------------------------ | ------ | -------------------------------------------------------------------------------- |
| `ClassAttendanceTab.tsx`       | 수정   | `SegmentedControl`(체크/통계) + `mode` state, `mode==='stats'`일 때 신규 뷰 렌더 |
| `ClassAttendanceStatsView.tsx` | 신규   | S3 전체(기간 칩 + 학급 요약 + sticky 표)                                         |
| `ClassDetailPage.tsx`          | 무변경 | 세그먼트가 탭 내부에 있어 실제 diff 없음 — 소유권만 명시                         |

### 공유 파일(경합 주의 — builder-student만 편집)

| 파일                                                    | 내용                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/mobile/__tests__/bottomSheetCoverage.meta.test.ts` | `SHEETS_TO_REGISTER`에 2건 추가: `['src/mobile/pages/students/StudentRecordsFullSheet.tsx','StudentRecordsFullSheet']`, `['src/mobile/pages/students/StudentAttendanceHistorySheet.tsx','StudentAttendanceHistorySheet']`. S3는 신규 시트가 없어 builder-class는 이 파일을 건드리지 않는다. |

두 빌더 모두 domain/, App.tsx, 스토어 파일은 읽기 전용 import만 하고 수정하지 않는다.

---

## 6. 후속 R — 학급 단위 조회 2종

team: mobile-records-stats(후속) · 대상: builder-attendance, builder-records. §4 공통 시각
언어 그대로 재사용, 신규 색·칩·표 규격 없음. **신규 오버레이 시트 0건**(풀스크린/세그먼트
전환만) — `bottomSheetCoverage.meta.test.ts`는 두 빌더 모두 건드리지 않는다.

### 핵심 배치 결정

| #   | 결정                                                                                | 근거                                                                                                                                                                                                                                                                             |
| --- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 담임 출결 "체크" 모드는 `AttendanceCheckPage`를 **embedded 없이(prop 무변경)** 렌더 | S3는 `embedded`로 감싸 자체 헤더(여러 날·완료)를 죽였지만 교과는 TodayHub→전체화면 대체 경로가 남아 있어 무방했다. 담임은 진입로가 이 화면 하나뿐이라 embedded면 "여러 날 일괄 적용"(FR-09)·완료 버튼이 영구 소실(회귀). 체크 모드는 무변경, 헤더는 통계 모드에만 별도로 그린다. |
| 2   | 담임 학급 전체 기록은 오버레이 시트가 아니라 **풀스크린 페이지**                    | 카테고리 필터+주의 학생+월별 타임라인은 전교생 대상이라 S1보다 밀도가 높아 85vh 시트는 이중 스크롤이 된다. `ClassListPage`의 "탭 내부 로컬 state 전체화면" 선례(43-51행)를 따름 — 하단 탭바는 계속 보임(App.tsx 레벨 전환 아님).                                                 |
| 3   | 교과 "전체" 관찰은 새 화면이 아니라 `ClassObservationTab` **세그먼트 전환**         | 이미 있는 학생별 목록의 표현 모드만 바꾼다 — 신규 최상위 진입로 불필요, 담임 쪽과 대칭.                                                                                                                                                                                          |

### 6.1 Feature A — 담임 '우리 반' 출결 통계

**진입 경로**: 홈 → "담임 출결하기" 카드(`TodayHub`) → `attendanceNav`(`type:'homeroom'`) → App.tsx가 신규 `HomeroomAttendanceView` 렌더 → 상단 `[출결 체크|출결 통계]` 세그먼트(기본 "체크" — 기존과 동일 첫 화면). "통계" 선택 시 `HomeroomAttendanceStatsView` 렌더.

**390px 와이어프레임** — 체크 모드는 세그먼트 바만 얹고 아래는 기존 `AttendanceCheckPage` 그대로(← 담임 출결/여러 날/완료/카운터/명단, prop 무변경이라 생략). 통계 모드:

```
┌ HomeroomAttendanceStatsView (신규) ─────────────┐
│ [ 출결 체크 | 출결 통계 ]                        │
│ ← 담임 출결 통계 · 1학년 2반                      │
│ [전체][이번 학기][이번 달][이번 주]               │
│ 이번 학기 우리 반 전체 (연인원)                   │
│ 결석 5 · 지각 3 · 조퇴 1 · 결과 0                 │
│ 학생별 출결                     옆으로 스크롤→   │
│ ┌──────────┬────┬────┬────┬────┬────┐           │
│ │번호·이름  │출석│결석│지각│조퇴│결과│ <스크롤>   │
│ │ 1 김민준 │ 18 │  1 │  0 │  0 │  0 │           │
│ └──────────┴────┴────┴────┴────┴────┘           │
└─────────────────────────────────────────────────────┘
```

**컴포넌트 트리**

```
App.tsx: attendanceNav.type==='homeroom' → <HomeroomAttendanceView classId className onBack />
         (type==='class' 분기는 기존 AttendanceCheckPage 그대로 — 무변경)
HomeroomAttendanceView (신규, pages/) — SegmentedControl(체크/통계), mode 기본 'check'
 ├─ mode==='check' → <AttendanceCheckPage classId className period={0} type="homeroom" onBack /> (prop 무변경)
 └─ mode==='stats' → <HomeroomAttendanceStatsView classId className onBack /> (onBack 그대로 relay)
HomeroomAttendanceStatsView (신규, pages/) — 자체 헤더(← + "담임 출결 통계" + className, AttendanceCheckPage 비embedded 헤더 스타일 복제) + <AttendanceStatsTable .../>
ClassAttendanceStatsView (기존, 리팩터) → <AttendanceStatsTable .../> 소비, 렌더 byte-identical
AttendanceStatsTable (신규 공용, components/common/) — 기간 칩+요약 카드+sticky 표(순수 프레젠테이션)
```

**AttendanceStatsTable 추출 prop 인터페이스**

```ts
export type AttendancePeriodFilter = 'all' | 'semester' | 'month' | 'week';
export interface AttendanceStatsRow {
  readonly key: string; // studentKey(교과) | student.id(담임)
  readonly number: number; // 표시 번호(담임은 studentNumber ?? 0)
  readonly name: string;
  readonly counts: Readonly<Record<AttendanceStatus, number>>;
}
export interface AttendanceStatsSummary {
  readonly absent: number;
  readonly late: number;
  readonly earlyLeave: number;
  readonly classAbsence: number;
}
export interface AttendanceStatsTableProps {
  readonly filter: AttendancePeriodFilter;
  readonly onFilterChange: (filter: AttendancePeriodFilter) => void;
  readonly summary: AttendanceStatsSummary;
  readonly rows: readonly AttendanceStatsRow[];
  readonly scopeLabel: string; // "학급 전체"|"우리 반 전체" — 문구=`${기간라벨} ${scopeLabel} (연인원)`
  readonly tableAriaLabel: string; // 예: "2학년 3반 학생별 출결 통계"
}
// 함께 export: PERIOD_FILTERS, getFilterRange(filter), ATT_STATUSES — ClassAttendanceStatsView.tsx:16-58을 그대로 이동(값 변경 없음).
```

**상태/인터랙션**: `HomeroomAttendanceView`는 `mode:'check'|'stats'` 기본 `'check'`(회귀 0), 두 모드 모두 뒤로가기는 항상 홈으로. `HomeroomAttendanceStatsView`는 `filter` 기본 `'all'`, "직접 설정" 칩 없음(§3 근거 동일). 표 셀 비상호작용.

**데이터 소스 · 집계 로직**

- 학생: `useMobileStudentStore((s)=>s.students)` → `filterActive` → `.sort((a,b)=>(a.studentNumber??0)-(b.studentNumber??0))`. grade/classNum이 없어 `studentKey` 대신 **`student.id`를 row key**로 사용(번호 미배정 학생 충돌 방지).
- 출결 레코드: `useMobileAttendanceStore((s)=>s.records)` → `filter(r => r.classId===classId && dateRange)`(period 필터 없음 — 담임은 항상 period 0). `classId`는 prop 그대로 전달(=TodayHub의 `settings.className`) — 재계산 없이 체크 모드가 저장한 키와 항상 일치.
- 집계: `Map<student.id, Record<AttendanceStatus, number>>`(전원 0) → `record.students` 순회, `students.find(s => s.studentNumber === sa.number)` 매칭(AttendanceCheckPage.tsx:220-221 bridge 로직과 동일) → `entry[sa.status]++`. 기간 범위는 이동된 `getFilterRange` 재사용.
- `rows`: `students.map(s => ({ key: s.id, number: s.studentNumber ?? 0, name: s.name, counts: stats.get(s.id)! }))`.

**정확한 Tailwind 클래스**: 세그먼트 바 `px-4 py-2 border-b border-sp-border shrink-0`(ClassAttendanceTab과 동일). 통계 헤더 `glass-header flex items-center gap-3 px-4 shrink-0`, style `{minHeight:'var(--header-height)', paddingTop:'env(safe-area-inset-top)'}`(AttendanceCheckPage 비embedded 헤더 스타일 의도적 복제). 기간 칩/요약/표는 `AttendanceStatsTable` 내부 — §3(S3) 클래스와 완전히 동일.

**빈 상태/로딩 · 다크 모드 · 접근성**: `!studentsLoaded` → S3와 동일 스켈레톤, 활성 학생 0명 → `EmptyState icon="group_off" text="등록된 학생이 없습니다."`, 기간 내 레코드 없음은 표 전원 0 정상 렌더. 다크는 §4.4/§4.5와 완전히 동일(신규 색 없음). 세그먼트는 `SegmentedControl` 재사용(`role=tablist/tab` 자동), 통계 헤더 뒤로가기 버튼에 `aria-label="뒤로가기"` 명시.

### 6.2 Feature B — 학급 전체 기록 모아보기

#### 6.2.1 담임 — `HomeroomRecordsOverviewPage`

**진입 경로**: `StudentsPage` 헤더(담임 선택 시), 좌석/명단 토글 **왼쪽**에 신규 아이콘 버튼 `history_edu`("반 전체 기록 보기") → `showRecordsOverview` state → 풀스크린 전환(ClassListPage의 "탭 내부 로컬 state 전체화면" 패턴과 동일, 하단 탭바는 계속 보임).

**390px 와이어프레임**

```
┌ HomeroomRecordsOverviewPage (신규 풀스크린) ────┐
│ ← 반 전체 기록 · 32건                            │
│ 출결 12 · 상담 5 · 생활 9 · 기타 6      (비대화형)│
│ ⚠ 결석·지각 잦음: 김민준(결석3), 이서연(지각5) 탭→필터│
│ [전체32][출결12][상담5][생활9][기타6]  카테고리 칩│
│ (필터 중) 학생: 김민준 ✕                          │
│ 2026년 7월                                        │
│ ┃ 12번 김민준 · 7/6  [결석] 결석 (질병)            │
│ ┃ 3번  이서연 · 7/2  [상담] 교우관계 상담 진행…     │
│ ...                             (스크롤 계속)     │
└──────────────────────────────────────────────────────┘
```

**컴포넌트 트리**

```
StudentsPage (수정) → 헤더 아이콘(homeroom일 때만) → showRecordsOverview
 └─ {showRecordsOverview && <HomeroomRecordsOverviewPage onClose={() => setShowRecordsOverview(false)} />}
HomeroomRecordsOverviewPage (신규, pages/) — 자체 스토어 구독(prop은 onClose만)
 ├─ 헤더(← + "반 전체 기록" + 건수)
 ├─ 요약 digest(비대화형: getCategorySummary) + 주의 학생 줄(getWarningStudents, 이름 탭 가능)
 ├─ CategoryFilterChips(S1 패턴) + {studentFilter && 활성 필터 칩(✕ 해제)}
 └─ MonthGroupedTimeline → RecordRow[](학생 배지+날짜+분류+내용, 파일 내 로컬 서브컴포넌트)
```

**상태/인터랙션**: `selectedCategory:'all'|string` 기본 `'all'`(S1과 동일), `studentFilter:string|null`(student.id) 기본 `null` — 타임라인 행의 학생 배지 또는 주의 학생 줄 이름 탭 시 설정, ✕/재탭 시 해제, 카테고리와 AND 결합. **"학생별 섹션 그룹핑" 대신 "탭-투-필터" 선택**: 30명 안팎 학급에서 학생별 헤더를 전부 펼치면 스크롤이 2배 이상 길어지고 기록 적은 학생은 빈 섹션만 남는다. 플랫 타임라인+배지 탭이 "전체 조망"과 "한 명만 보기"를 스크롤 1개로 해결하며 S1/S3의 기존 탭-필터 문법을 재사용한다.

**데이터 소스 · 집계 로직**

- 학생: `useMobileStudentStore((s)=>s.students)` → `filterActive` → 번호순(§6.1과 동일). `activeIds = new Set(...)`.
- 레코드: `useMobileStudentRecordsStore((s)=>s.records)` → `filter(r => activeIds.has(r.studentId))`(StudentRecord엔 classId가 없어 studentId 매칭만으로 담임 범위가 이미 확정).
- 요약 digest: `getCategorySummary(homeroomRecords)`(studentRecordRules.ts:167). 주의 학생: `getWarningStudents(homeroomRecords, activeStudents)`(studentRecordRules.ts:191, 기본 임계값 그대로) → 0건이면 줄 미렌더.
- 카테고리 필터 칩(건수 포함): `categories`(store) 순회 + 카테고리별 `filter().length`(S1과 동일 로직). 타임라인: 두 필터 적용 → `sortByDateDesc`(studentRecordRules.ts:138) → `date.slice(0,7)` 월 그룹핑(S1의 `groupRecordsByMonth`와 동일 로직 재구현 — 파일 소유자가 달라 공유 모듈로 뽑지 않음, 5줄 복제는 허용 범위). 표시 라벨: 출결은 `subcategory`, 그 외 `tags?.join(' · ')`.

**정확한 Tailwind 클래스**: 헤더 아이콘 버튼 `flex items-center justify-center rounded-lg text-sp-muted hover:text-sp-text active:bg-black/5 dark:active:bg-white/10`, style `{minWidth:44,minHeight:44}`, `aria-label="반 전체 기록 보기"`. 요약 digest 줄 `text-sp-muted text-xs flex flex-wrap gap-x-3`. 주의 학생 줄 `text-amber-600 dark:text-amber-400 text-xs flex items-center gap-1 flex-wrap`, 이름 버튼 `underline underline-offset-2 min-h-[32px] px-0.5`(RecordsSubTab 세부카테고리 칩과 동일 32px 예외). 카테고리/필터 칩은 §4.1 그대로. 타임라인 카드는 §4.3 그대로(`CATEGORY_COLORS` 좌측 바). 학생 배지 `text-xs font-medium text-sp-accent`(행 전체가 버튼 — StudentRecordsFullSheet RecordRow와 동일 패턴).

**빈 상태/로딩 · 다크 모드 · 접근성**: `!studentsLoaded||!recordsLoaded` → S3 스켈레톤. 활성 학생 0명 → `EmptyState icon="group_off"`. 레코드 0건 → `EmptyState mascot text="아직 기록이 없습니다." hint="학생 상세에서 기록을 추가해보세요."`(S1과 동일 문구). 필터 결과 0건 → `EmptyState icon="filter_alt_off" text="해당 조건의 기록이 없습니다."` 다크는 `active:bg-black/5 dark:active:bg-white/10`, `text-amber-600 dark:text-amber-400` 외 sp-\* 자동 대응. 헤더 아이콘 `aria-label` 필수, 카테고리 칩 `role="tablist"/"tab"`, 필터 해제 버튼 `aria-label="학생 필터 해제"`, 타임라인 행 `aria-label="{number}번 {name} 학생으로 필터"`.

#### 6.2.2 교과 — `ClassObservationTab` 전체 세그먼트

**진입 경로**: `ClassDetailPage` → 특기사항 탭(`ClassObservationTab`) → 탭 최상단 신규 `[학생별|전체]` 세그먼트("학생별" 기본, 기존과 100% 동일). "전체" 선택 시 학급 전체 관찰 기록을 월별로 나열.

**390px 와이어프레임** — 학생별 모드는 세그먼트 바만 얹고 나머지는 기존 그대로(생략). 전체 모드:

```
┌ 전체 모드 ──────────────────────────────────────┐
│ [ 학생별 | 전체 ]                                │
│ 2026년 7월                                       │
│ ┃ 12번 김민준 · 7/5  수업 중 적극 발표 [학습태도] │
│ ┃ 3번  이서연 · 7/3  과제 제출 잦게 늦음 [특이사항]│
│ ...                              (스크롤 계속)   │
└─────────────────────────────────────────────────────┘
```

**컴포넌트 트리**

```
ClassObservationTab (수정)
 ├─ SegmentedControl(학생별/전체) — viewMode 기본 'student'
 ├─ viewMode==='student' → 기존 JSX 전체(무변경, 조건부 렌더만)
 └─ viewMode==='all' → ClassWideObservationList(파일 내 로컬 서브컴포넌트)
      └─ 행 탭 → setSelectedStudentKey(key) + setViewMode('student')
```

**상태/인터랙션**: `viewMode:'student'|'all'` 기본 `'student'` — 학생별 모드 JSX/로직/모달은 조건 한 겹으로만 감싸 회귀 0. '전체'는 읽기 전용(`more_vert` 수정/삭제 없음) — 행 탭 시 해당 학생의 학생별 화면으로 점프해 기존 편집 흐름을 이용, 신규 편집 UI 없음. '전체'에서는 "+ 추가" 버튼도 숨김(어느 학생 것인지 맥락 없음).

**데이터 소스 · 집계 로직**: `records.filter(r => r.classId === classId)`(학생 필터 없이 학급 전체) → `.sort((a,b)=>b.date.localeCompare(a.date))`(기존 studentRecords useMemo와 동일 비교식). 월 그룹핑은 6.2.1과 동일 로직 재구현(파일 간 공유 없음 — 겹침 0 유지). 학생 표시명은 이미 계산된 `activeStudents`로 `Map<studentKey, TeachingClassStudent>` 구성 후 `record.studentId` 조회.

**정확한 Tailwind 클래스**: 세그먼트 바는 기존 "학생 선택" 칩 위에 `px-4 py-2 border-b border-sp-border shrink-0` 래퍼 추가(ClassAttendanceTab과 동일 패턴). 전체 모드 카드는 §4.3 그대로(좌측 바는 카테고리 축이 없어 단색 `bg-sp-accent`). 태그 칩은 기존 `ObservationRecordCard`의 `px-2 py-0.5 rounded-full bg-sp-surface border border-sp-border text-sp-muted text-xs` 그대로 재사용(시각 일치 목적).

**빈 상태/로딩 · 다크 모드 · 접근성**: 기존 최상단 `!loaded` 가드가 두 모드 모두 커버 — 추가 분기 불필요. 활성 학생 0명 → `EmptyState icon="group_off"`. 학급 전체 기록 0건 → `EmptyState icon="sticky_note_2" text="아직 특기사항 기록이 없습니다."`(액션 버튼 생략 — 읽기 전용). 다크 신규 색 없음. 세그먼트 재사용, 전체 모드 행 버튼 `aria-label="{number}번 {name} 학생별 보기로 전환"`, 태그 칩은 정보 표시용이라 `aria-hidden` 아님.

### 6.3 파일 계획 (겹침 0)

#### builder-attendance 소유

| 파일                                                       | 종류 | 내용                                                                                              |
| ---------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------- |
| `src/mobile/components/common/AttendanceStatsTable.tsx`    | 신규 | 공용 프레젠테이션(기간 칩+요약+sticky 표) + `PERIOD_FILTERS`/`getFilterRange`/`ATT_STATUSES` 이동 |
| `src/mobile/components/Class/ClassAttendanceStatsView.tsx` | 수정 | `AttendanceStatsTable` 소비로 리팩터, 렌더 결과 byte-identical                                    |
| `src/mobile/pages/HomeroomAttendanceView.tsx`              | 신규 | 체크/통계 세그먼트 래퍼                                                                           |
| `src/mobile/pages/HomeroomAttendanceStatsView.tsx`         | 신규 | 담임 출결 통계 집계 + 자체 헤더 + `AttendanceStatsTable`                                          |
| `src/mobile/App.tsx`                                       | 수정 | import 1줄 + `attendanceNav.type==='homeroom'` 렌더 분기만 교체. `type==='class'` 분기는 무변경   |

#### builder-records 소유

| 파일                                                  | 종류 | 내용                                                                                      |
| ----------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------- |
| `src/mobile/pages/StudentsPage.tsx`                   | 수정 | 헤더 아이콘 버튼 1개(담임 선택 시만) + `showRecordsOverview` state + 조건부 전체화면 렌더 |
| `src/mobile/pages/HomeroomRecordsOverviewPage.tsx`    | 신규 | 요약+카테고리 필터+학생 필터+월별 타임라인                                                |
| `src/mobile/components/Class/ClassObservationTab.tsx` | 수정 | `[학생별\|전체]` 세그먼트 추가, 학생별 모드는 조건부 래핑만(무변경)                       |

두 목록 사이 겹치는 파일 없음. `App.tsx`는 builder-attendance만 수정(§6.1의 render-swap 1건).
`bottomSheetCoverage.meta.test.ts`는 이번 스코프에 신규 시트가 없어 어느 빌더도 건드리지
않는다.
