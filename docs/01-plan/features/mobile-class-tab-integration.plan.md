# Plan — 모바일 "수업 출결" 탭을 "수업" 탭으로 확장 (출결 + 진도 통합)

> **PDCA Phase**: Plan
> **Feature ID**: `mobile-class-tab-integration`
> **작성일**: 2026-04-27
> **작성자**: CTO Lead (bkit-cto-lead, opus 4.7)
> **Level**: Enterprise (Dynamic 호환)
> **팀 모드**: 팀에이전트 모드 (frontend / developer / qa 3팀 병렬)

---

## 1. 개요 / 배경 / 목표

### 1.1 한 줄 요약

모바일 하단탭 `수업 출결`을 `수업`으로 확장하고, 학급 선택 후 `[출결] [진도]` 두 서브탭을 두어 PC `ClassManagementPage`의 출결과 진도 관리 두 기능을 한 화면에서 자연스럽게 통합한다.

### 1.2 배경 — 왜 지금 통합하나

| 현재 상태 | 문제 |
|----------|------|
| 어제(2026-04-26) 추가된 [`MobileProgressLogModal`](e:/github/ssampin/src/mobile/components/Today/MobileProgressLogModal.tsx)은 `오늘` 탭의 `CurrentClassCard` "수업 중" 분기에서만 호출됨 | 시간대를 벗어나면(쉬는 시간·방과 후·하루 뒤) 진도를 추가할 진입점이 없음 |
| 모바일에 진도 인프라([`useMobileProgressStore`](e:/github/ssampin/src/mobile/stores/useMobileProgressStore.ts), `addEntry`/`updateEntryStatus`)는 깔려 있음 | UI에서 진도 **수정/삭제** 진입점이 전혀 없음 — 잘못 입력한 진도를 수정할 수 없음 |
| `수업 출결` 탭은 학급 리스트 → 출결 체크 한 가지 기능만 노출 | 출결과 진도는 **같은 학급 컨텍스트**라 한 화면에서 합치는 것이 자연스러운데 분리되어 있음 |
| PC `ProgressTab`(1003 LOC)에는 추가/편집/삭제/상태순환/시간표 매칭/오늘 빠른추가/다른 반 불러오기까지 풀 기능 존재 | 모바일과 PC가 같은 도메인 데이터를 다루는데도 모바일에 진도 관리 UI가 없어 비대칭 |

### 1.3 목표

1. **탭 라벨 변경**: 모바일 하단 5번째 탭 `수업 출결` → `수업` (icon: `school` 또는 `co_present` 검토)
2. **학급 선택 후 서브탭 도입**: `[출결] [진도]` 2개 서브탭으로 두 기능을 한 학급 컨텍스트에 통합
3. **출결 회귀 0건**: 기존 `AttendanceCheckPage` 동작은 그대로, 단지 풀스크린이 아닌 서브탭 안에 임베드만 변경
4. **진도 모바일 풀 기능**: 추가 / 상태 순환 / 인라인 편집 / 삭제 / 시간표 매칭 ✦ 표시까지 PC와 데이터 호환
5. **도메인 헬퍼 공유**: `getMatchingPeriods`를 PC `ProgressTab`에서 추출해 `domain/rules/`에 두고 PC와 모바일 양쪽이 import — 단 한 군데서 변경하면 PC·모바일 동시 적용

### 1.4 비목표 (Out of Scope)

| 제외 항목 | 이유 / 대안 |
|----------|------------|
| 명렬 관리 (Roster) | PC 전용. 모바일은 `담임` 탭 학생 관리에서 일부 커버 |
| 좌석배치 (Seating) | PC 전용 화면 — 모바일에서는 시각화·드래그가 불편 |
| 설문/체크리스트 (Survey/Checklist) | 별도 PDCA로 다룰 모바일 응답 화면이 더 가치가 큼 |
| 과제 수합 (Tasks) | PC `TasksTab` 별도 — 모바일은 기존 `더보기-도구-과제` 진입로 유지 |
| **다른 반에서 불러오기** | 모바일 화면 좁음 + UX 위험 → **MVP 제외**, v2 재검토 (§8 위험 참조) |
| Today CurrentClassCard 진도 모달 변경 | 별도 진입점으로 그대로 유지 — 신규 `진도` 서브탭과 모달 컴포넌트만 공유 |

---

## 2. 사용자 시나리오

### 2.1 시나리오 A — 수업 끝나고 복도에서 폰으로 진도 기록

**페르소나**: 김 교사 (중2 영어 담당, 수업 사이 5분 쉬는 시간)

1. 3교시 수업 종료 직후, 복도를 걸으며 폰을 꺼낸다
2. 모바일 쌤핀 → 하단탭 `수업` 누름
3. 학급 리스트에서 "2-3 영어" 선택
4. 자동으로 `[출결]` 서브탭에 진입 (2-3은 이미 출결을 눌러 본 학급)
5. `[진도]` 탭으로 스와이프 → 오른쪽 상단 `+` 버튼
6. 폼이 열리면 **오늘 날짜 + 3교시가 자동 선택됨** (시간표 매칭 ✦ 표시)
7. 단원 "Lesson 4 - My Family", 차시 "본문 듣기 + 단어 빙고" 입력 → `저장`
8. 완료 — 오늘 항목 리스트 맨 위에 표시

**핵심 가치**: 시간표 자동 매칭으로 입력 필드 3개(날짜·교시·단원 후보) 자동 채움 → 손가락 탭 5회 이내 진도 1건 기록

### 2.2 시나리오 B — 출결 체크 후 그 자리에서 진도까지 입력

**페르소나**: 이 교사 (수업 시작 직후, 칠판 앞에서 폰 또는 태블릿 사용)

1. 수업 시작 직후 모바일 쌤핀 → `수업` → "1-2 수학" 선택
2. `[출결]` 서브탭에서 결석 1명, 지각 1명 체크 → 자동 저장됨
3. 같은 화면에서 `[진도]` 서브탭으로 전환 → `+ 오늘 진도 빠른 추가`
4. 단원/차시만 입력 → `저장`
5. 한 번의 학급 진입으로 출결 + 진도 두 기록을 모두 마침

**핵심 가치**: 학급 한 번 선택으로 두 기능 처리 — 기존(탭 두 번 진입)보다 클릭 1회 절감 + 컨텍스트 유지

### 2.3 시나리오 C — 과거 진도 항목의 상태 변경 / 오타 수정

**페르소나**: 박 교사 (퇴근 후 카페에서 어제 진도 점검)

1. 모바일 쌤핀 → `수업` → "3-1 사회"
2. `[진도]` 탭 → 어제(4월 26일) 그룹의 4교시 항목 발견
3. 상태 배지 `예정` 탭 → 사이클 `완료`로 변경 (PC와 동일한 planned → completed → skipped → planned 순환)
4. 단원 오타 발견 → 해당 항목 카드 우상단 ⋯ → `편집`
5. 단원 텍스트 인라인 수정 → `저장`
6. 잘못 추가된 항목은 ⋯ → `삭제` → 확인 모달 → 삭제

**핵심 가치**: 모바일에서도 PC `ProgressTab`과 동일한 풀 라이프사이클(추가·수정·삭제·상태) 지원. 이는 어제 모달이 `addEntry`만 노출했던 한계를 메움

---

## 3. UX 설계 — 탭 이름·아이콘·정보 구조

### 3.1 결정 사항 요약

| 항목 | 결정 |
|------|------|
| 하단탭 라벨 | `수업` (현재 `수업 출결`) |
| 하단탭 아이콘 | `co_present` (사람+칠판 메타포, 출결+수업 두 의미 포괄) ※ 차선: `school` |
| 학급 선택 후 화면 | **서브탭 컨테이너** (옵션 A) |
| 서브탭 구성 | `[출결] [진도]` 2개 (기본 진입은 `출결`) |
| 서브탭 내비게이션 | 가로 탭 + 좌우 스와이프 (기존 모바일 탭과 일관) |
| 학급 리스트 | 현재 `AttendanceListPage` 디자인 재사용 (학급 카드 그대로) |

### 3.2 정보 구조 트리

```
[하단탭] 수업 (icon: co_present)
 └─ 학급 리스트 (← 기존 AttendanceListPage UI 재사용)
     ├─ [학급 카드: 2-3 영어]    ← 탭하면 진입
     ├─ [학급 카드: 2-1 영어]
     └─ ...
        └─ 학급 상세 (NEW: ClassDetailPage)
            ├─ 헤더 (← 학급명 · 뒤로 가기)
            ├─ 서브탭 바: [출결] [진도]
            └─ 컨텐츠
                ├─ 출결 서브탭 (← 기존 AttendanceCheckPage 그대로 임베드)
                │   └─ 학생 리스트 + 출결 체크 (변경 없음)
                └─ 진도 서브탭 (NEW: ClassProgressTab)
                    ├─ 진도 요약 바 (완료 N · 미실시 M · 예정 K · 진도율 %)
                    ├─ + 추가 버튼 (오른쪽 상단 floating 또는 헤더)
                    │   └─ MobileProgressLogModal (← 기존 모달 재사용)
                    └─ 날짜 그룹 리스트
                        ├─ [4월 27일 (월)]
                        │   ├─ 1교시 ✦ · Lesson 4 - My Family · [완료]
                        │   │   └─ ⋯ 메뉴 → 편집 / 삭제
                        │   └─ 3교시 ✦ · Lesson 4 - My Family · [예정]
                        └─ [4월 26일 (일)]
                            └─ ...
```

### 3.3 와이어프레임 (ASCII)

```
┌──────────────────────────────────┐  ← 학급 리스트 (기존 그대로)
│  수업                             │
│  수업반을 선택하세요              │
│ ┌─────────────────────────────┐ │
│ │ 🎓 2-3 영어        →         │ │
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │ 🎓 2-1 영어        →         │ │
│ └─────────────────────────────┘ │
└──────────────────────────────────┘
                ↓ 학급 탭
┌──────────────────────────────────┐  ← 학급 상세 (NEW)
│ ←  2-3 영어                       │
│ ┌────────┬────────┐              │
│ │ 출결   │ 진도   │  ← 서브탭     │
│ └────────┴────────┘              │
│ ─────────────────────             │
│ (출결 서브탭 활성 시)             │
│ ┌─────────────────────────────┐ │
│ │ 학생 1   [출석 ▾]            │ │
│ │ 학생 2   [출석 ▾]            │ │
│ └─────────────────────────────┘ │
└──────────────────────────────────┘

┌──────────────────────────────────┐  ← 진도 서브탭 활성 시
│ ←  2-3 영어                       │
│ ┌────────┬────────┐              │
│ │ 출결   │ 진도   │              │
│ └────────┴────────┘              │
│ ─────────────────────             │
│ ▓▓▓▓▓░░░░░  60% 진도             │
│ ✓ 6  · 미 1 · 예 3                │
│                              [+] │
│ ┌─ 4월 27일 (월) ──────────────┐│
│ │ ✦ 1교시 · Lesson 4 - My Fam │ │
│ │   본문 듣기  [완료]    ⋯    │ │
│ │ ✦ 3교시 · Lesson 4         │ │
│ │   단어 빙고  [예정]    ⋯    │ │
│ └────────────────────────────┘ │
│ ┌─ 4월 26일 (일) ──────────────┐│
│ │   1교시 · Lesson 3   [완료] │ │
│ └────────────────────────────┘ │
└──────────────────────────────────┘
```

### 3.4 옵션 비교 — 권장안 옵션 A 채택

| 옵션 | 구성 | 장점 | 단점 | 채택 여부 |
|------|------|------|------|----------|
| **A (권장)** | `[출결] [진도]` 2 서브탭 | 사용자가 각 기능을 분명히 식별, 기존 출결 UI 회귀 0, 정보밀도 적정 | 출결+진도 한눈 요약 부재 (`오늘` 탭이 일부 보완) | ✅ MVP |
| B | `[개요] [출결] [진도]` 3 서브탭 | 학급 진입 즉시 오늘 요약 + 빠른 입력 가능 | 서브탭 3개는 모바일에서 글자 잘림(`최근진도`가 4자라 fit하나 화면 고정시 압박), 신규 페이지 1개 추가, 진도 통계 중복 | ❌ |
| C | 날짜 단일축 통합 피드 | 출결+진도가 시간순으로 한 리스트에 보임 | 서로 다른 종류 데이터 혼재 — 사용자 스캔 비용 큼, "오늘 출결만 보고 싶다"는 워크플로우 깨짐 | ❌ |

**옵션 B 트레이드오프(200자)**: B의 `개요`는 "오늘 출결 요약 + 최근 진도 + 빠른 입력"을 한눈에 보여주는 가치가 있다. 다만 모바일 `오늘` 탭이 이미 현재 교시 + 전체 진도 요약 카드를 갖고 있어 진입 시점이 다를 뿐 같은 정보를 중복 노출. 또한 서브탭 3개는 화면 가로 폭에서 라벨이 작아져 IA가 흐려진다. v2에서 사용자 지표(개별 서브탭 사용 빈도)를 보고 재검토.

### 3.5 디자인 토큰 / 스타일 일관성

- 서브탭 컴포넌트: 모바일 기존 `glass-card` 스타일 + `rounded-xl` (CLAUDE.md: 직각 금지, `rounded-sp-*` 금지 — Tailwind 기본 키 사용)
- 진도 상태 배지 색상: PC `STATUS_CONFIG`와 동일 — `planned: blue`, `completed: green`, `skipped: amber`
- 헤더 구조: 기존 `AttendanceListPage` 헤더 패턴 (← 뒤로 + 학급명) 재사용
- 시간표 매칭 표시: ✦ 문자 (PC와 동일, 추가 아이콘 없음) — `text-sp-accent` 색상

---

## 4. 도메인 / 스토어 / UseCase 영향도

### 4.1 도메인 레이어 (변경 없음)

| 파일 | 변경 |
|------|------|
| `src/domain/entities/CurriculumProgress.ts` | **변경 없음** — `ProgressEntry` 스키마 그대로 재사용 |
| `src/domain/repositories/ITeachingClassRepository.ts` | **변경 없음** |

### 4.2 도메인 규칙 (헬퍼 추출 — 신규 파일 1개)

| 파일 | 작업 | 시그니처 |
|------|------|----------|
| `src/domain/rules/progressMatching.ts` (NEW) | PC `ProgressTab.getMatchingPeriods` (LOC 136-191) 추출 | `getMatchingPeriods(args: { date: string; classroom: string; subject: string; classSchedule: ClassSchedule; teacherSchedule: TeacherSchedule; weekendDays: boolean }): number[]` |
| `src/adapters/components/ClassManagement/ProgressTab.tsx` | 인라인 함수 → import로 교체 | (변경 LOC 약 60) |
| `src/mobile/components/Class/ClassProgressTab.tsx` (NEW) | 같은 함수 import | — |

**추출 결정 근거**: 옵션 (a) `domain/rules/`에 추출 vs (b) `mobile/utils/` 사본
- **(a) 채택** 이유: 함수가 (1) 외부 의존 없는 순수 로직, (2) PC + 모바일 동일 도메인 규칙(시간표 ↔ 학급 매칭), (3) Clean Architecture 의존성 규칙상 `domain/`이 `adapters/` 위에 있어 양쪽이 import 가능, (4) PC 진도 매칭 로직 변경 시 모바일도 자동 반영 필요(SoR 단일화)
- **(b) 거절** 이유: 사본은 즉시 drift 위험 — PC에서 단계 4(부분 매칭) 추가 시 모바일이 누락됨

**Clean Architecture 검증**: 헬퍼는 `ClassSchedule`/`TeacherSchedule` 타입과 `isSubjectMatch`/`getDayOfWeek` (이미 `domain/rules/`)만 사용. domain → 외부 import 0 — 의존성 규칙 위반 없음.

### 4.3 UseCase 레이어 (변경 없음)

| 파일 | 변경 |
|------|------|
| `src/usecases/classManagement/ManageCurriculumProgress.ts` | **변경 없음** — `add`/`update`/`delete`/`getAll`/`getByClass` 모두 이미 존재 |

### 4.4 스토어 레이어 (모바일 메서드 보강)

`src/mobile/stores/useMobileProgressStore.ts`에 **2개 메서드 추가**:

```typescript
// 추가 1: updateEntry — 전체 필드 편집 (현재는 updateEntryStatus만 존재)
updateEntry: (entry: ProgressEntry) => Promise<void>;

// 추가 2: deleteEntry — 항목 삭제 (현재 모바일에 없음)
deleteEntry: (id: string) => Promise<void>;
```

**구현 패턴**: 기존 `updateEntryStatus`와 동일하게 `manageProgress.update`/`delete` 호출 + state 업데이트 + `useMobileDriveSyncStore.getState().triggerSaveSync()`. PC `useTeachingClassStore`와 동등 (참고: PC는 `updateProgressEntry`/`deleteProgressEntry` 명칭).

**메서드 명칭 재정렬 검토**: 기존 `updateEntryStatus` 그대로 유지(상태 사이클 핸들러가 사용) + `updateEntry`(전체 편집) 별도 추가. 두 메서드 공존이 PC와도 호환되고 호출 의도를 분명히 드러냄.

### 4.5 영향도 매트릭스 요약

| 레이어 | 변경 파일 수 | 신규 LOC | 회귀 위험 |
|--------|-------------|---------|----------|
| domain | 1 (신규) | ~60 | 매우 낮음 (PC만 import 교체) |
| usecases | 0 | 0 | 없음 |
| adapters (PC) | 1 (인라인 함수 교체) | -55 +10 | 낮음 (함수 동작 1:1 동일) |
| adapters (mobile) | 3-4 (신규 + 수정) | ~400 | 중 (신규 화면) |

---

## 5. 컴포넌트 구조 (어댑터 계층)

### 5.1 신규 파일

| 경로 | 책임 | Props/State |
|------|------|------------|
| `src/mobile/pages/ClassDetailPage.tsx` | 학급 선택 후 서브탭 컨테이너. 헤더(뒤로/학급명) + 서브탭 바 + 컨텐츠 슬롯 | `{ classId, className, onBack }` · 내부 state: `subTab: 'attendance' \| 'progress'` |
| `src/mobile/components/Class/ClassAttendanceTab.tsx` | 출결 서브탭 — 기존 `AttendanceCheckPage`를 임베드 모드로 호출하는 얇은 래퍼 | `{ classId, className }` (period는 내부에서 1로 전달, 또는 사용자 입력 단계 유지) |
| `src/mobile/components/Class/ClassProgressTab.tsx` | 진도 서브탭 풀 기능 — 요약 바 + 그룹 리스트 + 추가/편집/삭제/상태순환 | `{ classId, className }` |
| `src/mobile/components/Class/ClassProgressEntryItem.tsx` | 진도 한 항목 카드 (편집 모드 토글 포함) | `{ entry, onCycle, onEdit, onDelete, isEditing, ... }` |
| `src/domain/rules/progressMatching.ts` | 시간표↔학급 매칭 헬퍼 (§4.2) | 순수 함수 |

### 5.2 수정 파일

| 경로 | 작업 |
|------|------|
| `src/mobile/App.tsx` | (1) `tabs[]`의 `attendance` 라벨 `'수업 출결'` → `'수업'`, 아이콘 `'fact_check'` → `'co_present'`. (2) `attendance` 분기 렌더 `<AttendanceListPage />` → `<ClassListPage />`로 교체 |
| `src/mobile/pages/AttendanceListPage.tsx` | **2단계 전략**: (a) 즉시 `ClassListPage.tsx`로 **rename + 내용 교체** — 학급 선택 후 `<ClassDetailPage>`로 라우팅. (b) `MobileTab` 키는 `'attendance'` 그대로 유지 — localStorage·테스트·기존 외부 링크 호환성 보전. **rename 채택**: 단일 파일이라 git 히스토리 손실 적고, 컴포넌트명이 책임을 정확히 반영 |
| `src/mobile/pages/AttendanceCheckPage.tsx` | (선택) `embedded?: boolean` prop 추가 — true면 자체 헤더 렌더 생략. 기본값 false로 회귀 차단 |
| `src/adapters/components/ClassManagement/ProgressTab.tsx` | 인라인 `getMatchingPeriods` 제거 → `domain/rules/progressMatching.ts` import. 호출부 시그니처 어댑팅 |
| `src/mobile/components/Today/MobileProgressLogModal.tsx` | **공유 컴포넌트로 승격** 검토: (a) 그대로 `Today` 진입점 모달로 두고 진도 탭에서도 호출 (b) `Class/` 폴더로 이동 후 `Today`/`Class` 양쪽 import. 결정: **(a) 위치 유지** — 모달 자체는 단일 책임이고 양쪽에서 재사용만 하면 충분. 단 import 경로 정리만 |

### 5.3 컴포넌트 호출 트리 (변경 후)

```
App.tsx
 └─ activeTab === 'attendance' 분기
     └─ <ClassListPage />               ← 기존 AttendanceListPage 리네이밍
         └─ selectedClassId 있을 때
             └─ <ClassDetailPage classId className onBack>
                 ├─ 서브탭 'attendance'
                 │   └─ <ClassAttendanceTab classId className>
                 │       └─ <AttendanceCheckPage embedded classId className period type='class' onBack>
                 └─ 서브탭 'progress'
                     └─ <ClassProgressTab classId className>
                         ├─ <ProgressSummaryBar entries />
                         ├─ <button onClick={openAddModal}>+ 추가</button>
                         │   └─ <MobileProgressLogModal />   ← 재사용
                         └─ {grouped.map} <ClassProgressEntryItem entry ... />

Today.tsx (기존 변경 없음)
 └─ <CurrentClassCard>
     └─ <MobileProgressLogModal />     ← 동일 컴포넌트, 진입점만 다름
```

---

## 6. 작업 분해 (WBS) — 팀별 패키지

### 6.1 팀 구성 — 팀에이전트 모드

| 팀 | 에이전트 | 모델 | 담당 범위 |
|----|---------|------|---------|
| **frontend** | `frontend-design` (1순위), `bkit:frontend-architect` (2순위) | sonnet | 모바일 신규 컴포넌트, 서브탭 UI, 진도 서브탭 풀 기능, 라벨/아이콘 변경 |
| **developer** | `bkit:bkend-expert` | sonnet | 스토어 메서드 보강, 도메인 헬퍼 추출, 데이터 무결성 |
| **qa** | `bkit:qa-strategist`, `bkit:gap-detector` | sonnet | tsc · 회귀 · 양방향 sync 검증 · 실기기 체크리스트 |

오케스트레이션: **CTO Lead orchestrates Swarm pattern (Do phase)**. frontend↔developer 의존(스토어 메서드 시그니처)은 Design 단계에서 미리 합의 후 병렬 실행.

### 6.2 frontend 팀 작업 (예상 LOC ~480)

| # | 항목 | 산출물 | 의존성 | 예상 LOC |
|---|------|-------|-------|---------|
| F1 | `App.tsx` 탭 라벨/아이콘 변경 | `tabs[].label`, `tabs[].icon` 수정 | — | ~5 |
| F2 | `AttendanceListPage` → `ClassListPage` rename + 학급 선택 핸들러를 `ClassDetailPage` 라우팅으로 교체 | `src/mobile/pages/ClassListPage.tsx` (renamed) | F1 | ~30 |
| F3 | `ClassDetailPage` 신규 — 헤더 + 서브탭 바 + 컨텐츠 슬롯 + 좌우 스와이프 | `src/mobile/pages/ClassDetailPage.tsx` | F2 | ~120 |
| F4 | `ClassAttendanceTab` 래퍼 — `AttendanceCheckPage`를 embedded 모드로 호출 | `src/mobile/components/Class/ClassAttendanceTab.tsx` | F3 | ~40 |
| F5 | `AttendanceCheckPage`에 `embedded` prop 추가 (자체 헤더 조건부 렌더) | (수정) `src/mobile/pages/AttendanceCheckPage.tsx` | F4 | ~10 |
| F6 | `ClassProgressTab` 신규 — 요약 바, 추가 버튼, 그룹 리스트, 모달 호출 | `src/mobile/components/Class/ClassProgressTab.tsx` | F3, D2, D3 | ~200 |
| F7 | `ClassProgressEntryItem` 신규 — 카드 + 편집 모드 + 액션 메뉴(⋯) | `src/mobile/components/Class/ClassProgressEntryItem.tsx` | F6 | ~150 |
| F8 | `MobileProgressLogModal`에 외부에서 `defaultClassId` 강제 prop 추가 (학급 선택 강제 시 후보 자동 선택 스킵) | (수정) | F6 | ~15 |
| F9 | 디자인 토큰·라운드 정책·디자인 examples 폴더 참고하여 시각 일관성 검증 | (수정 산재) | F2-F8 | ~30 |

### 6.3 developer 팀 작업 (예상 LOC ~120)

| # | 항목 | 산출물 | 의존성 | 예상 LOC |
|---|------|-------|-------|---------|
| D1 | 도메인 헬퍼 `progressMatching.ts` 신규 — PC `getMatchingPeriods` 추출 | `src/domain/rules/progressMatching.ts` | — | ~70 |
| D2 | `useMobileProgressStore`에 `updateEntry(entry)` 메서드 추가 | (수정) `src/mobile/stores/useMobileProgressStore.ts` | — | ~12 |
| D3 | `useMobileProgressStore`에 `deleteEntry(id)` 메서드 추가 | (수정) | — | ~12 |
| D4 | PC `ProgressTab` 인라인 헬퍼 → `progressMatching` import로 교체 (호출부 시그니처 매핑) | (수정) `src/adapters/components/ClassManagement/ProgressTab.tsx` | D1 | -55 +10 |
| D5 | `useMobileProgressStore` 타입 검증 — `triggerSaveSync` 호출이 양쪽 신규 메서드에 모두 적용되는지 확인 | (검증만) | D2, D3 | — |
| D6 | 데이터 무결성 검증 — `ManageCurriculumProgress.update`/`delete`가 sync 등록 파일과 일치하는지 확인 (`syncRegistry.ts`) | (검증) | — | — |

### 6.4 qa 팀 작업

| # | 항목 | 산출물 | 의존성 |
|---|------|-------|-------|
| Q1 | `npx tsc --noEmit` 0 errors 검증 | 콘솔 출력 첨부 | F1-F9, D1-D6 |
| Q2 | `npm run build` 통과 | 빌드 로그 | Q1 |
| Q3 | 회귀 항목: PC `ClassManagementPage` → 진도 관리 탭의 모든 기능(추가/수정/삭제/상태순환/오늘빠른추가/다른반불러오기/시간표매칭✦) 동작 불변 | 수동 체크리스트 | D4 |
| Q4 | 회귀 항목: 모바일 출결 — 학급 선택 → 출결 체크 → 자동 저장 → 사이드바 통계 반영까지 기존과 동일 | 수동 체크리스트 | F4, F5 |
| Q5 | GDrive 양방향 sync 검증: (a) 모바일에서 진도 추가 → 로그아웃/재로그인 → PC에서 같은 항목 표시, (b) PC에서 추가 → 모바일 reload → 표시, (c) 모바일에서 편집 → PC에 반영, (d) 모바일에서 삭제 → PC에 반영 | 시나리오 4개 결과 | F6, D2, D3 |
| Q6 | 실기기 체크리스트 (Android 한 대, iOS 사파리 한 대 권장): 좌우 스와이프, 키보드 올라올 때 입력 필드 가림 현상, 인라인 편집 폼 키보드 스크롤, ⋯ 메뉴 탭 영역 | 디바이스별 체크 | F3-F8 |
| Q7 | 진도 항목 50건+ 학급에서 모바일 스크롤 끊김 측정 | FPS 또는 체감 보고 | F6 |
| Q8 | 시간표가 비어 있는 사용자에서 진도 추가 폴백 — 매칭 교시 0이어도 폼이 열리고 수동 입력 가능한지 | 시나리오 결과 | F6, D1 |
| Q9 | gap-detector 호출하여 본 Plan vs 구현 코드 Match Rate 측정 (Check phase에서 다시 계산) | analysis.md | Q1-Q8 |
| Q10 | 한국어 UI 텍스트 검토 — `수업`/`출결`/`진도`/`예정`/`완료`/`미실시` 문구 일관성 | 텍스트 리스트 | F1-F9 |

---

## 7. 데이터 호환성 / 마이그레이션

### 7.1 스키마 호환성

| 항목 | 모바일 | PC | 호환 |
|------|--------|-----|------|
| `ProgressEntry` 필드 | `id, classId, date, period, unit, lesson, status, note` | 동일 | ✅ |
| GDrive sync 파일 | `class-management.json` 내부 `progressEntries` | 동일 | ✅ |
| sync registry 등록 | 기존 `syncRegistry.ts`에서 이미 등록됨 | 동일 | ✅ |

**마이그레이션 필요 여부**: **없음**. 신규 화면이 기존 데이터를 읽기/쓰기만 함. 어떤 사용자라도 PC v2.0.0에서 진도 입력 후 모바일을 업데이트하면 즉시 표시됨.

### 7.2 동시 편집 충돌 시나리오

| 시나리오 | 현재 정책 | 본 작업 영향 |
|---------|---------|-------------|
| 모바일 + PC 동시에 같은 항목 편집 | last-write-wins (전체 `progressEntries` 배열 덮어쓰기) | **변경 없음** — 모바일 편집/삭제 추가는 sync 트리거 횟수만 늘어남 |
| 모바일에서 추가 + PC에서 다른 항목 추가 | 둘 다 살아남는 경우 vs 한쪽만 살아남는 경우 | 기존 동작 그대로 — `triggerSaveSync` debounce 윈도우 안에서 한쪽만 살아남을 가능성. 본 작업 책임 외(별도 PDCA 후보) |

**기록**: 동시 편집 정책 강화는 본 작업 비목표. v2 후보로 `gdrive-sync` 메모리 등록 권고.

---

## 8. 위험 / 미정 사항

### 8.1 위험 매트릭스

| ID | 위험 | 영향 | 발생가능성 | 완화 |
|----|------|-----|----------|------|
| R1 | "다른 반에서 불러오기" 미구현 시 사용자 불편 | 중 | 중 | **MVP 제외**, 모바일 사용 빈도 데이터 수집 후 v2 결정. 임시: PC에서 불러오기 후 sync로 자동 반영 |
| R2 | 시간표가 비어 있는 사용자(시간표 미설정 교사)는 매칭 교시 0개 → ✦ 표시 미동작 | 낮음 | 낮음 | 폼은 정상 오픈, 교시 수동 선택. PC와 동일 폴백 동작 |
| R3 | 진도 항목 50건+ 학급에서 모바일 스크롤 성능 | 중 | 중 | MVP는 단순 렌더, Q7로 측정. 임계 초과 시 일자별 페이징 또는 react-virtuoso 도입 검토 |
| R4 | 탭 라벨 `수업` ↔ 노션 가이드/AI 챗봇 KB 비동기화 | 중 | 높음 | 릴리즈 8단계 워크플로우의 3·4단계(챗봇 재임베딩 + 노션 갱신)에서 **반드시 같이 변경**. MEMORY.md `Release Workflow` 참고 |
| R5 | PWA 캐시로 사용자에게 새 탭 라벨이 안 보임 | 낮음 | 중 | Vite SW의 autoUpdate 동작 확인. 모바일 PWA는 이미 autoUpdate 모드 |
| R6 | `embedded` prop 도입 시 기존 `AttendanceCheckPage` 호출처 회귀 | 낮음 | 낮음 | 기본값 `false`로 회귀 차단. 호출처 grep으로 변경 영역 검증 |
| R7 | 도메인 헬퍼 추출 시 PC `getMatchingPeriods` 미세 동작 변화 | 높음 | 낮음 | Q3 회귀 항목으로 전 시나리오 재현. 함수 시그니처를 매개변수 패치만 변경하고 로직은 1:1 이식 |
| R8 | `MobileProgressLogModal`이 진도 탭에서 호출될 때 `subject`/`classroom`을 시간표가 아닌 학급 정보 그대로 전달해야 함 | 중 | 중 | F8에서 `defaultClassId` 강제 prop 추가, 후보 자동 선택 스킵 |

### 8.2 미정 사항 (Plan 단계 결정 보류 → Design 단계에서 확정)

1. **서브탭 진입 시 기본값**: 사용자가 학급 선택 후 처음 진입하면 출결? 진도? — Design에서 사용자 인터뷰 또는 Today 탭 진입 시점과의 일관성 기준으로 결정
2. **+ 버튼 위치**: 헤더 우측 vs floating 액션 버튼(FAB) — Design에서 디자인 examples 참고
3. **편집 UI 패턴**: 인라인 펼침 vs 모달 재호출 — PC는 인라인, 모바일도 인라인 권장하나 좁은 화면에서 키보드 올라오면 가려질 수 있음. Design에서 와이어프레임 확정
4. **상태 사이클 인터랙션**: 탭 1회로 사이클 vs 길게 눌러 메뉴 — PC는 탭 1회. 모바일도 동일 권장하나 실수 위험 있음. Design 단계 결정
5. **출결 서브탭에서 period 입력 단계**: 기존 `AttendanceCheckPage`는 `period` prop 필수. embedded 모드에서 사용자가 교시를 어떻게 고르는가? 현재 `AttendanceListPage`는 `period={1}` 하드코딩 → 같은 한계 유지 vs 서브탭 안에서 교시 선택기 추가 — **MVP는 하드코딩 유지**(기존 동작 회귀 0), v2에서 시간표 매칭으로 자동화

---

## 9. 성공 지표 (Acceptance Criteria)

### 9.1 기능 체크리스트

- [ ] 모바일 하단탭 5번째 라벨이 `수업`으로 표시됨 (아이콘 `co_present`)
- [ ] `수업` 탭 진입 → 학급 리스트 노출 (등록된 수업반 모두)
- [ ] 학급 카드 탭 → `ClassDetailPage` 진입, 헤더에 학급명 + 뒤로가기
- [ ] `[출결] [진도]` 서브탭 노출, 좌우 스와이프 또는 탭으로 전환 가능
- [ ] 출결 서브탭 진입 시 기존 `AttendanceCheckPage`와 **시각·동작 모두 회귀 0건** (자체 헤더만 숨김)
- [ ] 진도 서브탭에 진도 요약 바(✓N · 미M · 예K · 진도율 %) 표시
- [ ] `+` 버튼 → `MobileProgressLogModal` 오픈, 학급은 `defaultClassId`로 강제 선택, 사용자는 단원/차시/교시/날짜만 입력
- [ ] 시간표 매칭 ✦ 표시 — 학급+과목+오늘 날짜의 매칭 교시에 ✦가 보이고, 선택 안 된 교시는 ✦ 없음
- [ ] 진도 항목 카드의 상태 배지 탭 → `planned` → `completed` → `skipped` → `planned` 사이클
- [ ] 진도 항목 ⋯ 메뉴 → `편집` → 인라인 폼 → 단원/차시/메모/날짜/교시 모두 수정 → 저장
- [ ] 진도 항목 ⋯ 메뉴 → `삭제` → 확인 다이얼로그 → 항목 제거
- [ ] 날짜 그룹화 — 같은 날짜끼리 묶이고, 그룹 헤더에 날짜+요일 표시(예: `4월 27일 (월)`)

### 9.2 비기능 체크리스트

- [ ] `npx tsc --noEmit` 0 errors
- [ ] `npm run build` 통과
- [ ] PC `ClassManagementPage > 진도 관리 탭` 모든 기능(추가/편집/삭제/상태순환/오늘빠른추가/다른반불러오기) 동작 불변 — 도메인 헬퍼 추출 회귀 0건
- [ ] GDrive 양방향 sync 검증 통과 (모바일 추가→PC, PC 추가→모바일, 모바일 편집→PC, 모바일 삭제→PC)
- [ ] 모든 UI 텍스트가 한국어로 작성됨
- [ ] 디자인 토큰 일관성 (sp-bg/sp-card/sp-accent 사용, `rounded-sp-*` 미사용)
- [ ] Match Rate ≥ 90% (Check phase 측정)

### 9.3 릴리즈 전 추가 체크 (8단계 워크플로우)

- [ ] AI 챗봇 KB 갱신 — `수업` 탭 설명 + 진도 입력 가이드 Q&A 추가, `scripts/ingest-chatbot-qa.mjs` 실행
- [ ] 노션 사용자 가이드 갱신 — `수업` 탭 챕터 추가
- [ ] `public/release-notes.json` 새 버전 항목 추가
- [ ] Sidebar/MorePage/SettingsPage 버전 텍스트 갱신

---

## 10. 다음 단계

### 10.1 Plan 승인 후

```
/pdca design mobile-class-tab-integration
```

Design 단계에서 확정할 항목:
- §8.2 미정 사항 5건 결정
- 컴포넌트별 Props 인터페이스 타입 시그니처
- 와이어프레임 → 픽셀 디자인 (`design examples/`와 일관성)
- 라우팅 트리 최종형 (`MobileTab` 키 유지/변경 여부)
- `progressMatching.ts` 함수 시그니처 최종형 (이미 §4.2에 명시했지만 sig 검토)

### 10.2 Design 승인 후

```
/pdca team mobile-class-tab-integration
```

팀에이전트 모드 시작 — frontend / developer / qa 3팀 병렬 (Swarm pattern). CTO Lead가 작업 분배 + Match Rate 90% 게이트 강제.

### 10.3 검증 후

```
/pdca analyze mobile-class-tab-integration   # Match Rate 측정
/pdca iterate mobile-class-tab-integration   # < 90%면 자동 개선
/pdca report mobile-class-tab-integration    # ≥ 90%면 보고서 생성
```

### 10.4 릴리즈

v1.13.x 또는 v2.1.0에 포함 — `Release Workflow` 8단계 전부 수행.

---

## 부록 A. 참고 코드 위치

| 항목 | 파일 |
|------|------|
| PC 진도 관리 풀 기능 | `src/adapters/components/ClassManagement/ProgressTab.tsx` (1003 LOC) |
| PC `getMatchingPeriods` 인라인 함수 | `src/adapters/components/ClassManagement/ProgressTab.tsx:136-191` |
| 모바일 진도 스토어 | `src/mobile/stores/useMobileProgressStore.ts` |
| 모바일 진도 모달 (어제 추가) | `src/mobile/components/Today/MobileProgressLogModal.tsx` |
| 모바일 출결 리스트 (현재 `수업 출결` 탭) | `src/mobile/pages/AttendanceListPage.tsx` |
| 모바일 출결 체크 페이지 | `src/mobile/pages/AttendanceCheckPage.tsx` |
| 모바일 탭 정의 | `src/mobile/App.tsx:74-81` |
| 진도 도메인 엔티티 | `src/domain/entities/CurriculumProgress.ts` |
| 진도 UseCase | `src/usecases/classManagement/ManageCurriculumProgress.ts` |
| 시간표 매칭 보조 (이미 domain) | `src/domain/rules/matchingRules.ts` (`isSubjectMatch`), `src/domain/rules/periodRules.ts` (`getDayOfWeek`) |
| GDrive sync 등록 | `src/adapters/sync/syncRegistry.ts` (`class-management` 도메인) |

## 부록 B. 결정 일지

| 일자 | 결정 | 근거 |
|------|------|------|
| 2026-04-27 | 옵션 A (2 서브탭) 채택 | 정보밀도·회귀 안전성·라벨 가독성 |
| 2026-04-27 | `getMatchingPeriods` → `domain/rules/`로 추출 | SoR 단일화, drift 방지 |
| 2026-04-27 | "다른 반에서 불러오기" MVP 제외 | 좁은 화면 UX 위험 + 사용자 데이터 수집 후 v2 |
| 2026-04-27 | `MobileTab` 키는 `'attendance'` 유지 | localStorage·외부 링크 호환 |
| 2026-04-27 | embedded 모드는 `AttendanceCheckPage`에 prop 추가로 처리 | 회귀 차단 + 단일 컴포넌트 유지 |
