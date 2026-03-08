# 오늘 수업 진도 위젯 계획서

> **작성일**: 2026-03-07
> **기능**: 대시보드 위젯 1개 추가 (today-progress)
> **근거**: 수업 관리(TeachingClass) 기능 구현 완료, 위젯만 부재

---

## 1. 개요

### 1.1 문제 정의

수업 관리 기능(학급 명렬표 + 진도체크)이 구현되어 있지만, 대시보드에서 "오늘 어떤 학급에서 어떤 진도를 나가야 하는지" 한눈에 볼 수 없다. 교사가 매번 수업 관리 페이지로 이동해야 하는 불편.

### 1.2 현재 상태

- `useTeachingClassStore`: classes, progressEntries 보유
- `useScheduleStore`: teacherSchedule (요일별 교시 → 과목+교실) 보유
- `ProgressEntry`: { classId, date, period, unit, lesson, status('planned'|'completed'|'skipped'), note }
- `TeacherPeriod`: { subject, classroom } (교실명으로 학급 매칭)
- 위젯 시스템: `src/widgets/` (registry.ts + items/)
- 수업 관리 페이지: `class-management` (사이드바 메뉴)

### 1.3 목표

대시보드 위젯 **"📚 오늘 수업 진도"** 추가:
- 오늘 날짜의 교사 시간표에서 수업 목록 추출
- 각 수업의 진도 등록 상태 표시 (완료/예정/미등록)
- 클릭 시 수업 관리 페이지로 이동

---

## 2. 데이터 흐름

```
[useScheduleStore]                    [useTeachingClassStore]
   teacherSchedule                       classes + progressEntries
        ↓                                       ↓
  오늘 요일('월'~'금')               오늘 날짜 + 교시별 진도 조회
  → TeacherPeriod[] 추출                        ↓
        ↓                               ProgressEntry 매칭
        └────────── 교실명으로 학급 매칭 ──────────┘
                           ↓
                   위젯 렌더링 (교시별 진도 상태)
```

### 매칭 로직

1. 현재 요일 → `teacherSchedule['월']` 등에서 `TeacherPeriod[]` 추출
2. 각 `TeacherPeriod.classroom`(예: '2-3')으로 `classes` 배열에서 학급 매칭
3. `progressEntries`에서 `classId + date(오늘) + period` 조건으로 진도 조회
4. 매칭 결과:
   - `ProgressEntry` 있고 `status === 'completed'` → ✅ 완료
   - `ProgressEntry` 있고 `status === 'planned'` → ⏳ 예정
   - `ProgressEntry` 있고 `status === 'skipped'` → ⏭️ 건너뜀
   - `ProgressEntry` 없음 → 📝 미등록

---

## 3. UI 설계

### 와이어프레임

```
┌─────────────────────────────────────┐
│ 📚 오늘 수업 진도                    │
├─────────────────────────────────────┤
│                                     │
│  1교시 │ 2-3반 수학                  │
│         3단원 이차방정식  ✅ 완료     │
│                                     │
│  3교시 │ 1-2반 수학                  │
│         3단원 이차방정식  ⏳ 예정     │
│                                     │
│  5교시 │ 3-1반 수학                  │
│         (미등록)         📝          │
│                                     │
│  ─────────────────────────          │
│  완료 1 / 전체 3                    │
├─────────────────────────────────────┤
│  수업 관리 보기 →                    │
└─────────────────────────────────────┘
```

### 빈 상태

```
┌─────────────────────────────────────┐
│ 📚 오늘 수업 진도                    │
├─────────────────────────────────────┤
│                                     │
│      📚                             │
│   오늘은 수업이 없습니다             │
│                                     │
└─────────────────────────────────────┘
```

### 주말 상태

```
│      🎉                             │
│   오늘은 주말입니다                   │
```

---

## 4. 위젯 정의

```typescript
{
  id: 'today-progress',
  name: '오늘 수업 진도',
  icon: '📚',
  description: '오늘 가르칠 학급별 진도 상태를 확인합니다',
  category: 'class',
  defaultSize: { w: 1, h: 4 },
  minSize: { w: 1, h: 2 },
  availableFor: {
    schoolLevel: ['middle', 'high'],
    role: ['homeroom', 'subject', 'admin'],
  },
  component: TodayProgress,
  navigateTo: 'class-management',
  navigateLabel: '수업 관리 보기',
}
```

- **카테고리**: `class` (학급 카테고리)
- **학교급**: 중/고만 (초등은 담임이 전 과목 담당이라 교사 시간표 방식이 다름)
- **역할**: 전체 (담임/교과/관리자 모두 수업 있음)

---

## 5. 구현 단계

### Phase 1: 위젯 컴포넌트 구현

**`src/widgets/items/TodayProgress.tsx`** 신규 생성 (패턴 B: 자체 구현)

로직:
1. `useScheduleStore(s => s.teacherSchedule)` + `useTeachingClassStore` 로드
2. 오늘 요일 계산: `DAYS_OF_WEEK[new Date().getDay() - 1]` (월=0)
3. `teacherSchedule[오늘요일]`에서 null이 아닌 교시 추출
4. 각 교시의 `classroom`으로 `classes` 매칭 (이름 포함 검색)
5. `progressEntries` 필터: `date === 오늘(YYYY-MM-DD)` && `classId` && `period`
6. 상태 뱃지 렌더링 + 하단 완료 카운트

### Phase 2: 레지스트리 + 프리셋 등록

**`src/widgets/registry.ts`** 수정:
- import 추가 + WIDGET_DEFINITIONS에 정의 추가

**`src/widgets/presets.ts`** 수정:
- `middle-homeroom`, `middle-subject`, `high-homeroom`, `high-subject`에 `'today-progress'` 추가

---

## 6. 파일 변경 목록

### 신규 (1개)

| 파일 | 설명 |
|------|------|
| `src/widgets/items/TodayProgress.tsx` | 오늘 수업 진도 위젯 |

### 수정 (2개)

| 파일 | 변경 내용 |
|------|-----------|
| `src/widgets/registry.ts` | TodayProgress import + WIDGET_DEFINITIONS 추가 |
| `src/widgets/presets.ts` | 중/고 프리셋에 'today-progress' 추가 |

---

## 7. 테스트 시나리오

| # | 시나리오 | 예상 결과 |
|---|---------|-----------|
| 1 | 오늘 수업 3개, 진도 2개 등록 | 3행 표시, 완료/예정/미등록 상태 |
| 2 | 오늘 수업 0개 (공강) | "오늘은 수업이 없습니다" |
| 3 | 주말 (토/일) | "오늘은 주말입니다" |
| 4 | 수업 관리에서 진도 등록 후 | 위젯에 즉시 반영 (Zustand 연동) |
| 5 | 교사 시간표 미설정 | "시간표를 설정해주세요" |
| 6 | 학급 미등록 (classroom만 있고 class 매칭 안 됨) | 교실명만 표시 |
| 7 | 위젯 크기 조절 (1x2 최소) | 축소 시 교시+상태만 표시 |
| 8 | 위젯 클릭 "수업 관리 보기" | class-management 페이지로 이동 |
| 9 | 프리셋 적용 (중등 담임) | today-progress 위젯 포함 |
| 10 | 프리셋 적용 (초등) | today-progress 위젯 미포함 |
