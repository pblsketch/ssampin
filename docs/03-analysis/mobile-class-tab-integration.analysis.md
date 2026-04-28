# Gap Analysis — `mobile-class-tab-integration`

> **PDCA Phase**: Check (Analysis)
> **Feature ID**: `mobile-class-tab-integration`
> **측정일**: 2026-04-28
> **검증자**: gap-detector (bkit:gap-detector)
> **입력**: `docs/01-plan/features/mobile-class-tab-integration.plan.md`, `docs/02-design/features/mobile-class-tab-integration.design.md`

---

## 1. 요약

| 항목 | 결과 |
|------|------|
| **Match Rate** | **97.5%** (39/40 weighted) |
| **Gap 총 6건** | Critical 0 / Major 1 / Minor 5 |
| **`npx tsc --noEmit`** | ✅ exit 0 (0 errors) |
| **빌드** | ✅ 이전 Do 단계에서 `npm run build` exit 0 확인 |
| **회귀 위험** | 매우 낮음 (PC ProgressTab·담임출결·Today CurrentClassCard·GDrive sync 모두 0 또는 매우 낮음) |
| **다음 단계 권고** | `/pdca report mobile-class-tab-integration` (≥90%) |

---

## 2. 검증 결과 매트릭스

### 2.1 기능 AC (Plan §9.1 + Design §12.1)

| # | 항목 | 결과 | 근거 |
|---|------|:---:|------|
| 1 | 하단탭 5번째 라벨 `수업` + 아이콘 `co_present` | ✅ | `src/mobile/App.tsx:79` |
| 2 | 학급 카드 탭 → ClassDetailPage 진입 | ✅ | `src/mobile/pages/ClassListPage.tsx:38-46` |
| 3 | `[출결][진도]` 서브탭 노출 + 탭 전환 + 좌우 스와이프 | ✅ | `src/mobile/pages/ClassDetailPage.tsx:71-89, 30-48` |
| 4 | 진입 기본 = 출결 (default 'attendance') | ✅ | `src/mobile/pages/ClassDetailPage.tsx:25` |
| 5 | 출결 서브탭 = AttendanceCheckPage embedded | ✅ | `src/mobile/components/Class/ClassAttendanceTab.tsx:17-27` |
| 6 | 진도 요약 바 (✓N · 미M · 예K · 진도율 %) | ✅ | `src/mobile/components/Class/ClassProgressTab.tsx:160-182` |
| 7 | `+` 버튼 → MobileProgressLogModal (lockClass + defaultClassId) | ✅ | `src/mobile/components/Class/ClassProgressTab.tsx:240-247` |
| 8 | 시간표 매칭 ✦ 표시 (getMatchingPeriods 호출) | ⚠️ | `ClassProgressTab.tsx:104-132` — 호출은 됨, 단 모바일 store에 `getEffectiveTeacherSchedule` 부재로 변동(override) 머지 미적용 (G-001) |
| 9 | 상태 배지 탭 → planned→completed→skipped→planned 사이클 | ✅ | `ClassProgressTab.tsx:13-17, 134-137` |
| 10 | 카드 길게누름(500ms) → 액션시트 + 햅틱 | ✅ | `ClassProgressEntryItem.tsx:42-52` |
| 11 | ⋯ 보조 버튼 → 같은 액션시트 | ✅ | `ClassProgressEntryItem.tsx:106-113` |
| 12 | 액션시트 → 편집 → mode='edit' 모달 + prefill + updateEntry | ✅ | `MobileProgressLogModal.tsx:110-119, 170-179` |
| 13 | 액션시트 → 삭제 → 확인 다이얼로그 → deleteEntry | ✅ | `ClassProgressTab.tsx:271-277, 139-142` |
| 14 | 날짜 그룹화 + `M월 D일 (요일)` 표시 | ✅ | `ClassProgressTab.tsx:21-24, 89-100, 215-217` |

### 2.2 비기능 AC (Plan §9.2 + Design §12.2)

| # | 항목 | 결과 | 근거 |
|---|------|:---:|------|
| 15 | tsc 0 errors | ✅ | `npx tsc --noEmit` 직접 실행: EXIT=0 |
| 16 | MobileTab 키 'attendance' 그대로 (localStorage 호환) | ✅ | `App.tsx:66, 79, 333` |
| 17 | 모든 신규 prop 옵셔널 (회귀 0) | ✅ | 4종 prop 모두 옵셔널 (`MobileProgressLogModal.tsx:13-37`) |
| 18 | PC ProgressTab 동작 변경 없음 (getMatchingPeriods 1:1 추출) | ✅ | `ProgressTab.tsx:9, 134-151` — 동일 시그니처 wrap |
| 19 | embedded prop default false | ✅ | `AttendanceCheckPage.tsx:23, 42` |
| 20 | 모든 mutation에 triggerSaveSync | ✅ | `useMobileProgressStore.ts:89, 98, 106, 114` (4건 전부) |
| 21 | 모든 UI 텍스트 한국어 | ✅ | 모든 신규 파일 검토 완료 |
| 22 | rounded-sp-* 0건 | ✅ | 신규 5개 파일 grep 0건 |
| 23 | Clean Architecture: domain → 외부 import 0 | ✅ | `progressMatching.ts:1-4` 도메인 내부만 import |
| 24 | hit area 44px+ | ✅ | 5개 신규 파일 모두 `minWidth:44, minHeight:44` 또는 `minHeight:52` 명시 |

### 2.3 Design 5건 결정 (§2)

| # | 결정 | 결과 | 근거 |
|---|------|:---:|------|
| 25 | #1 진입 기본 = 출결 | ✅ | `ClassDetailPage.tsx:25` `initialTab = 'attendance'` |
| 26 | #2 + 버튼 헤더 우측 (MemoPage 패턴) | ✅ | `ClassProgressTab.tsx:185-192` `bg-sp-accent/15 w-10 h-10 rounded-full` |
| 27 | #3 Bottom-Sheet 편집 (mode='edit' 분기) | ✅ | `MobileProgressLogModal.tsx:107-138, 163, 170-179` |
| 28 | #4 탭 사이클 + 길게누름 + ⋯ 이중 진입로 | ✅ | `ClassProgressEntryItem.tsx:42-59, 99-113` |
| 29 | #5 출결 period=1 하드코딩 | ✅ | `ClassAttendanceTab.tsx:20` |

---

## 3. Gap 리스트

### G-001 — Major: 모바일 시간표 매칭이 변동(override)을 반영 못함

- **심각도**: Major
- **위치**: `src/mobile/components/Class/ClassProgressTab.tsx:102-132`
- **기대**: PC ProgressTab과 동등한 ✦ 매칭 — `getEffectiveTeacherSchedule(date, weekendDays)`가 그날 시간표 변동(override)을 머지한 결과를 사용
- **실제**: 모바일 `useMobileScheduleStore`에는 `getEffectiveTeacherSchedule` 메서드/시간표 변동 데이터 자체가 없음. 코드는 `teacherSchedule[dayOfWeek]` baseline만 사용 + `weekendDays = undefined` 하드코딩. 코드 주석(L102-103)에서도 한계를 인지
- **영향**: 시간표 변동이 있는 날(예: 시험일·체육대회)에 모바일 ✦ 표시가 PC와 다를 수 있음. 매칭 0건 시나리오 폴백은 정상이라 데이터 손실 없음
- **수정 제안**: v2 별도 PDCA로 분리 권장 (Plan §8.1 R3과 동일 결정 패턴) — `feature/mobile-schedule-override-sync`로 분리. 본 PDCA 내 처리는 `useMobileScheduleStore`에 `getEffectiveTeacherSchedule` 메서드 추가 + 변동 데이터 sync 인프라 추가가 필요해 별도 큰 작업

### G-002 — Minor: ClassProgressTab이 className prop을 사용하지 않음

- **심각도**: Minor
- **위치**: `src/mobile/components/Class/ClassProgressTab.tsx:42`
- **기대**: Design §3.4 props에 `className` 명시
- **실제**: `function ClassProgressTab({ classId }: ClassProgressTabProps)` — `className` destructure 누락. 상위(`ClassDetailPage`)에서 전달하지만 무시됨. 기능 영향은 없음 (`classes.find((c) => c.id === classId)`로 cls 자체를 찾아 사용)
- **수정 제안**: Props에서 `className`을 optional로 변경하거나, destructure 후 `cls.name` 대신 `className` 활용해 1회 lookup 절감

### G-003 — Minor: ClassListPage onBack prop 정의/사용 누락

- **심각도**: Minor
- **위치**: `src/mobile/pages/ClassListPage.tsx:17`
- **기대**: Design §3.1 시그니처에 `onBack?: () => void`
- **실제**: `export function ClassListPage()` — Props 인터페이스 자체가 정의되지 않음. App.tsx에서 호출 시 prop 없이 호출. 모바일 라우팅이 하단탭 기반이라 실용적 영향 0이지만 Design 시그니처 미일치
- **수정 제안**: Design 시그니처 그대로 추가하거나 Design을 현실에 맞게 수정. 둘 다 회귀 0

### G-004 — Minor: addEntry status 옵셔널 인자 추가는 됐지만 호출처에서 미사용

- **심각도**: Minor
- **위치**: `src/mobile/components/Today/MobileProgressLogModal.tsx:181-188`
- **기대**: Design §1.2 + §7.1 — `addEntry`에 `status?` 옵셔널 추가 이유는 "진도 서브탭에서 미래 일정을 'planned'로 추가"
- **실제**: 시그니처는 추가됐으나(`useMobileProgressStore.ts:33-34, 76`), 어디에서도 status를 명시 전달하지 않아 모든 신규 항목이 `'completed'`로 생성됨. 사용자가 미래 날짜+미래 교시를 '예정'으로 추가하려면 추가 후 상태 배지를 탭해야 함 (사이클: completed→skipped→planned 2회)
- **수정 제안**: 추가 모드에서 미래 날짜 입력 시 자동으로 status='planned' 추론하거나, UX 명세를 갱신해 "신규는 항상 완료, 예정은 추가 후 사이클" 패턴을 명시

### G-005 — Minor: ClassListPage 헤더 디자인이 Design §9.1과 미세하게 다름

- **심각도**: Minor
- **위치**: `src/mobile/pages/ClassListPage.tsx:51-54`
- **기대**: `glass-header` 토큰 사용
- **실제**: `<header className="px-4 py-3 border-b border-sp-border/30">` — `glass-header` 클래스 미사용. 시각적 일관성은 유사하나 토큰 일관성 면에서 다름
- **수정 제안**: 다른 모바일 페이지 헤더(`SchedulePage`, `MemoPage` 등)와 비교 후 일관 패턴으로 통일

### G-006 — Minor: 액션시트 진입 시 onLongPress와 onActionMenu가 동일 동작

- **심각도**: Minor
- **위치**: `src/mobile/components/Class/ClassProgressTab.tsx:225-226`
- **기대**: Design §3.4 의사코드는 두 prop 모두 액션시트를 열되, 의미적 분기 여지
- **실제**: 두 핸들러가 정확히 동일한 액션 — 사실상 한 핸들러로 통합 가능
- **수정 제안**: Design §2.4의 "이중 진입로" 의도(둘 다 같은 메뉴 도달)는 충족. 별도 분기 의도가 아니라면 그대로 두어도 무방. 단순 코드 단순화 기회

---

## 4. 빌드/타입체크 결과

### 4.1 `npx tsc --noEmit` 실측

```
EXIT=0 (0 errors, 0 warnings)
```

### 4.2 정적 분석 — 시그니처 호환성

- **신규 5개 파일 import 경로**: 전부 `@domain/`, `@mobile/`, `@adapters/` alias 사용 — `tsconfig.json` paths와 일치
- **MobileProgressLogModal**: 신규 4 prop 전부 옵셔널 → Today CurrentClassCard 호출(5개 prop만 전달) 호환
- **AttendanceCheckPage**: `embedded` default false → App.tsx attendanceNav 호출 호환
- **addEntry**: 7번째 인자(status) optional default `'completed'` → 기존 6-arg 호출 호환
- **타입 일치**: `useMobileScheduleStore.teacherSchedule[dayOfWeek]` 반환 `readonly (TeacherPeriod | null)[]`이 `ReadonlyArray<DayTeacherSlot | null>`(DayTeacherSlot = TeacherPeriod alias)와 일치

---

## 5. 회귀 위험 평가

| 영역 | 위험도 | 근거 |
|------|:---:|------|
| **PC ProgressTab** | 매우 낮음 | `getMatchingPeriods` wrapper 시그니처 100% 동일(`readonly number[]` 반환). 호출처 5곳(L163, L394, L398, L459, L574) 변경 없음 |
| **모바일 담임출결** | 0 | App.tsx attendanceNav 경로(L269-278) — `embedded` prop 미전달 → default false → 자체 헤더 정상 렌더 |
| **Today CurrentClassCard** | 0 | `MobileProgressLogModal` 호출 시 추가된 4개 신규 prop 미전달 → 기존 동작 100% 유지. `addEntry`도 6-arg 호출 → status='completed' 기본값 |
| **GDrive sync** | 매우 낮음 | 4종 mutation 전부 `triggerSaveSync` 호출. syncRegistry의 `curriculum-progress` 도메인 활용 — Design와 일치 |
| **localStorage** | 0 | MobileTab 키 `'attendance'` 그대로 |

---

## 6. 권고 다음 단계

**Match Rate 97.5% (≥90%)** → `/pdca report mobile-class-tab-integration`

권고 사항:
- **G-001 (Major)**: 보고서에 "v2 별도 PDCA 권고 (Plan §8.1 R3 패턴)"로 명시. `feature/mobile-schedule-override-sync`로 분리
- **G-002~G-006**: release 후 마이너 정리 라운드 또는 보고서 후속 항목으로 기록
- **릴리즈 워크플로우 8단계**(Plan §9.3, R4):
  - 챗봇 KB 갱신: `scripts/ingest-chatbot-qa.mjs`에 새 `수업` 탭 + 진도 모바일 풀 기능 Q&A 추가
  - 노션 사용자 가이드: `수업` 탭 챕터 신설
  - `public/release-notes.json`: 새 버전 항목 추가
  - 버전 텍스트 7곳 갱신

---

## 부록 A. 검증 파일 위치

- Plan: `docs/01-plan/features/mobile-class-tab-integration.plan.md`
- Design: `docs/02-design/features/mobile-class-tab-integration.design.md`
- 신규 컴포넌트:
  - `src/domain/rules/progressMatching.ts`
  - `src/mobile/pages/ClassListPage.tsx`
  - `src/mobile/pages/ClassDetailPage.tsx`
  - `src/mobile/components/Class/ClassAttendanceTab.tsx`
  - `src/mobile/components/Class/ClassProgressTab.tsx`
  - `src/mobile/components/Class/ClassProgressEntryItem.tsx`
- 수정 컴포넌트:
  - `src/mobile/App.tsx`
  - `src/mobile/pages/AttendanceCheckPage.tsx`
  - `src/mobile/components/Today/MobileProgressLogModal.tsx`
  - `src/mobile/stores/useMobileProgressStore.ts`
  - `src/adapters/components/ClassManagement/ProgressTab.tsx`
- 도메인 의존:
  - `src/domain/rules/matchingRules.ts` (`isSubjectMatch`)
  - `src/domain/rules/periodRules.ts` (`getDayOfWeek`)
  - `src/domain/entities/CurriculumProgress.ts` (`ProgressEntry`)
- UseCase 의존: `src/usecases/classManagement/ManageCurriculumProgress.ts`
- Sync 등록: `src/usecases/sync/syncRegistry.ts`
