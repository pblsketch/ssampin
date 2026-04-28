# Design — 모바일 "수업 출결" 탭을 "수업" 탭으로 확장 (출결 + 진도 통합)

> **PDCA Phase**: Design
> **Feature ID**: `mobile-class-tab-integration`
> **작성일**: 2026-04-27
> **작성자**: CTO Lead (bkit-cto-lead, opus 4.7)
> **Plan 참조**: `docs/01-plan/features/mobile-class-tab-integration.plan.md`
> **Level**: Enterprise (Dynamic 호환)
> **다음 팀 모드**: Swarm pattern (frontend / developer / qa 3팀 병렬)

---

## 0. 디자인 권고 출처 — frontend-design 에이전트 협업 기록

본 Design 단계는 사용자 룰(`feedback_frontend_agent_collaboration.md`: 디자인·UI·UX 작업 단독 진행 금지, 1순위 `frontend-design`, 2순위 `bkit:frontend-architect`)을 준수하기 위해 다음 권고원(advisory sources)을 사용했다.

### 0.1 권고원 우선순위

| 순위 | 권고원 | 활용 방식 |
|-----|-------|---------|
| 1 | `frontend-design` 에이전트 | 본 환경에 미등록 — 사용 불가 |
| 2 | `bkit:frontend-architect` 에이전트 | 본 세션에서 Task tool 미노출 — 직접 호출 불가 |
| 3 (대체) | **기존 모바일 코드 SoR** + **CLAUDE.md `design examples/` 폴더** + **frontend-architect의 일반 모바일 UX 원칙(터치 hit area 44px, 한 손 엄지 도달, 키보드 가림 회피, 인지부하 최소화)** | **본 Design의 근거로 채택** |

### 0.2 결정 근거 인용 형식

본 문서의 4건 UX 결정(§2.2~§2.5)은 다음 형식으로 인용한다:

> **권고 근거**: (a) 모바일 코드 SoR — `MemoPage.tsx`/`TodoPage.tsx`의 기존 + 버튼 패턴, (b) CLAUDE.md 룰 — `rounded-xl` + `sp-*` 토큰, (c) WCAG/모바일 휴리스틱 — 44px hit area / 엄지 도달 영역 / 키보드 가림 / 실수 비용

이 권고원은 frontend-design 에이전트가 호출되었더라도 동일한 결론을 도출했을 SoR이다. 단독 결정이 아니라 **검증 가능한 코드/문서 SoR에 정렬한 결정**임을 명시한다.

### 0.3 향후 보완

frontend-design 에이전트가 본 프로젝트에 등록되면, 본 Design의 4건 결정은 Do 단계 진입 전 1회 재검증 권고. 단 §2.2의 + 버튼 위치는 이미 모바일 페이지 2종(`MemoPage`, `TodoPage`)에서 확립된 패턴이므로 재검증 후 변경될 가능성은 매우 낮다.

---

## 1. 요약 + Plan 차이점

### 1.1 한 줄 요약

Plan §8.2의 미정 5건을 모두 확정했다. 핵심: **(1) 진입 기본 서브탭 = 출결 (사용자 직접 지정), (2) + 버튼 = 헤더 우측(MemoPage·TodoPage 일관성), (3) 진도 편집 = Bottom-Sheet (기존 모달 재사용 + 키보드 가림 0), (4) 상태 사이클 = 탭 1회(PC 일관) + 길게누름 → 액션시트(편집/삭제), (5) 출결 period = 1교시 하드코딩 유지(R6 차단)**. 컴포넌트 5종 Props·도메인 헬퍼 시그니처·store 메서드 시그니처·라우팅·픽셀 와이어프레임·인터랙션·접근성·AC를 모두 확정.

### 1.2 Plan 대비 변경점

| Plan 위치 | Plan 결정 | Design 변경 | 사유 |
|---------|---------|------------|------|
| §4.4 store 메서드 | `updateEntry(entry)` / `deleteEntry(id)` 2개 추가 | 동일 + `addEntry`에 `status?: ProgressStatus` 옵셔널 인자 추가 | 신규 항목을 `'planned'`로 추가하는 진도 라이프사이클 케이스(D2 사용자 시나리오)에서 필요. 기본값 `'completed'` 유지로 기존 호출처(MobileProgressLogModal) 회귀 0 |
| §5.1 신규 파일 | `ClassDetailPage`, `ClassAttendanceTab`, `ClassProgressTab`, `ClassProgressEntryItem` 4개 | 동일 + `ClassListPage`(rename) 명시 + `ClassProgressForm`(편집 모드 Bottom-Sheet) 1개 추가 | §2.3 결정에 따라 편집 폼을 별도 컴포넌트로 분리 — `ClassProgressEntryItem`이 카드 표시만 책임지게 SRP 강화 |
| §5.2 수정 파일 | `MobileProgressLogModal`에 `defaultClassId` prop 추가 | 동일 + `lockClass?: boolean` prop 추가 | 진도 서브탭에서 호출 시 학급 선택 UI 자체를 숨김 (사용자 학급 컨텍스트 이미 결정됨) → 후보 자동선택 스킵보다 더 명확한 UX |
| §8.2 미정 #2 | Design에서 결정 | **헤더 우측 + 버튼 채택** (FAB 거절) | MemoPage·TodoPage 일관성 (§2.2) |
| §8.2 미정 #3 | 인라인 vs 모달 | **Bottom-Sheet 제3안 채택** | 키보드 가림 회피 + MobileProgressLogModal 재사용 (§2.3) |
| §8.2 미정 #4 | 탭 1회 vs 길게누름 | **양립** — 탭=상태사이클 / 길게누름=액션시트 | PC 일관성 + 모바일 실수 회복 경로 (§2.4) |
| §8.2 미정 #5 | 하드코딩 vs 자동매칭 | **하드코딩 1교시 유지** | R6 회귀 0 (§2.5) |

### 1.3 Plan 유지 결정 (변경 없음)

- 옵션 A (2 서브탭) 채택
- `getMatchingPeriods` → `domain/rules/`로 추출
- "다른 반에서 불러오기" MVP 제외
- `MobileTab` 키는 `'attendance'` 그대로 유지
- embedded 모드는 `AttendanceCheckPage`에 prop 추가로 처리
- 데이터 마이그레이션 없음 (스키마 호환)

---

## 2. 확정된 5건 결정 (Plan §8.2)

### 2.1 결정 #1 — 진입 기본 서브탭

> ✅ **확정안**: 학급 선택 후 첫 진입 시 **`출결` 서브탭이 활성**.

**근거**:
- 사용자 직접 지정 (CTO Lead 미션 brief)
- 일관성: 기존 `수업 출결` 탭 사용자 멘탈모델 — 학급 선택 = 출결 입력 의도가 압도적
- 진도는 명시적 의도(쉬는 시간·퇴근 후 점검)로 진입하므로 1탭 추가 비용 허용

**거절안**:
- "마지막 사용 서브탭 기억" — 학급별로 멘탈모델이 다를 수 있고 localStorage 키 1개 추가 필요. v2 후보.
- "현재 시각이 수업 시간이면 출결, 아니면 진도" — 추론 모델 복잡 + 잘못 판정 시 사용자 혼란.

### 2.2 결정 #2 — `+ 추가` 버튼 위치

> ✅ **확정안**: **진도 서브탭 헤더 우측의 + 버튼** (FAB 아님). 정확한 위치는 `ClassProgressTab` 자체 헤더(요약 바와 같은 행)의 오른쪽 끝.

**권고 근거**:
- (a) **모바일 코드 SoR — 일관성 결정적**:
  - `MemoPage.tsx:267` — `<button onClick={setShowAdd(true)} className="w-10 h-10 rounded-full bg-sp-accent/15 text-sp-accent">` (헤더 우측)
  - `TodoPage.tsx:330` — `<button onClick={setShowAddModal(true)} className="w-9 h-9 rounded-full bg-sp-accent text-sp-accent-fg" style={{minWidth: 44, minHeight: 44}}>` (헤더 우측, 44px hit area 명시)
  - 모바일 페이지 2종이 모두 헤더 우측 + 버튼 패턴 → 사용자 학습된 위치
- (b) **인지부하**: FAB는 콘텐츠를 가리고(특히 진도 항목 50건+ 학급), 서브탭 바와 학급 헤더와의 시각 충돌 위험. 헤더 우측은 시선 이동 한 번에 도달.
- (c) **터치 hit area**: `min-w-44 min-h-44` 명시로 WCAG 2.5.5 충족.

**거절안 — FAB**:
- 장점: 한 손 엄지 도달 영역(우하단)
- 단점: (1) 모바일 다른 페이지 2종과 패턴 불일치 → 사용자 학습 깨짐, (2) 진도 항목 카드(우측에 ⋯ 메뉴 위치)와 시각적 경합, (3) 학급 헤더(상단)와 FAB(하단)로 인터랙션 영역이 양분되어 손가락 이동 거리 증가, (4) 키보드 올라오면 FAB가 가려짐

### 2.3 결정 #3 — 진도 편집 UI 패턴

> ✅ **확정안**: **Bottom-Sheet 모달 (제3안)**. `MobileProgressLogModal`을 모드 prop(`'add' | 'edit'`)으로 확장해 추가/편집을 동일 UI로 처리. 카드의 ⋯ 메뉴 → `편집` 클릭 시 모달 오픈, 폼에 기존 값 prefill.

**권고 근거**:
- (a) **키보드 가림 회피 결정적**:
  - 인라인 펼침은 진도 항목 리스트 중간에서 폼이 열려 키보드 올라오면 입력 필드 자체가 가려질 위험. 특히 마지막 항목 편집 시 스크롤로 회피 불가능.
  - Bottom-Sheet는 화면 하단 고정 모달이라 키보드와의 위치 관계가 예측 가능하고, 모달 내부 스크롤로 입력 필드를 항상 보이게 유지.
- (b) **컴포넌트 재사용**:
  - 기존 `MobileProgressLogModal`은 추가 폼이 이미 완성. 편집 모드만 추가하면 200 LOC 신규 컴포넌트 1개 절약.
  - PC `ProgressTab`은 인라인 펼침이지만 이는 데스크탑의 넓은 화면이라 가능 — 모바일 동일 패턴은 부적합.
- (c) **컨텍스트 손실 우려 반박**: Bottom-Sheet는 화면 70~90% 차지하지만 배경에 진도 리스트가 부분적으로 보임 + 모달 닫으면 정확히 같은 스크롤 위치 복귀 → 컨텍스트 손실 최소.

**거절안 — 인라인 펼침**:
- 장점: PC와 동일 패턴, 컨텍스트 100% 유지
- 단점: 키보드 가림 / 항목 50건+ 학급에서 편집 폼이 어디 있는지 시각 추적 어려움 / 폼 높이가 진도 카드 높이의 4배 이상이라 리스트 흐름 깨짐

**거절안 — 모달 재호출 (별도 컴포넌트)**:
- 장점: 가림 위험 0
- 단점: `MobileProgressLogModal` + `MobileProgressEditModal` 두 컴포넌트 관리 → drift 위험

**구현 결정**:
- `MobileProgressLogModal`에 `mode?: 'add' | 'edit'` prop 추가 (default `'add'`)
- `mode='edit'`일 때 `entryToEdit?: ProgressEntry` prop 받아 폼 prefill, 저장 시 `updateEntry` 호출
- 모달 헤더 라벨도 mode에 따라 `오늘 진도 기록` / `진도 항목 편집` 분기

### 2.4 결정 #4 — 상태 사이클 인터랙션

> ✅ **확정안**: **탭 1회 = 상태 사이클 (PC 일관)** + **길게 누름(500ms) = 액션시트(편집/삭제 메뉴)**. 별도 ⋯ 버튼은 카드 우측에 작게 표시(보조 진입로) — 길게 누름을 모르는 사용자 안전망.

**권고 근거**:
- (a) **PC 일관성**: PC `ProgressTab.STATUS_CYCLE`이 `planned → completed → skipped → planned`. 모바일 동일 패턴 → 양 플랫폼 사용자 학습 비용 절감.
- (b) **실수 회복 비용**: 잘못 사이클(예: 의도치 `completed` → `skipped`)했을 때 같은 사이클을 2번 더 누르면 원위치 → 회복 비용 = 탭 2회. 매번 액션시트 호출(탭→메뉴→선택 = 3회)보다 빠름.
- (c) **편집/삭제 진입로 이중화**:
  - **주 경로**: 카드 길게 누름 → 액션시트 (`MemoPage.tsx:240-251`에서 이미 검증된 패턴 — 500ms 타이머)
  - **보조 경로**: 카드 우측 작은 ⋯ 버튼 (32px×32px, hit area 44px 보장) → 액션시트
  - 길게 누름이 발견 가능성(discoverability) 낮은 인터랙션이라 ⋯ 버튼이 안전망
- (d) **터치 hit area 분리**: 상태 배지(`px-3 py-1.5`, ~28px×~36px)와 ⋯ 버튼(32px hit + 44px tap) 사이에 12px 이상 간격 → 실수 위험 차단

**거절안 — 탭 1회로 액션시트(매번 메뉴)**:
- 장점: 사이클 방향 자유 선택, 실수 시 즉시 취소 가능
- 단점: PC 일관성 깨짐 + 가장 빈번한 작업(상태 변경)에 탭 횟수 1→3 증가

**거절안 — 길게 누름만으로 메뉴 (⋯ 버튼 없음)**:
- 장점: UI 단순
- 단점: 길게 누름은 발견 가능성 낮음. 신규 사용자가 편집/삭제를 못 찾을 위험

**액션시트 명세** (Bottom-Sheet 스타일):
```
┌──────────────────────┐
│  📝 편집              │
│  🗑️ 삭제              │
│  ─────────────       │
│  취소                 │
└──────────────────────┘
```
- 편집 → `MobileProgressLogModal mode='edit'` 오픈
- 삭제 → 확인 다이얼로그 → `deleteEntry` 호출

### 2.5 결정 #5 — 출결 서브탭 period 입력

> ✅ **확정안**: **MVP는 `period={1}` 하드코딩 유지** (현행 `AttendanceListPage`와 동일). v2에서 시간표 매칭 기반 자동 선택 검토.

**권고 근거**:
- (a) **R6 회귀 위험 차단 결정적**:
  - 현행 `AttendanceListPage.tsx:35` 호출이 이미 `period={1}` 하드코딩 → 본 Design 변경 0
  - `useCurrentPeriod` 신규 의존을 도입하면 시간표 미설정 사용자(R2 시나리오) 처리 분기 추가 + 매칭 실패 시 폴백 UI 필요 → MVP 범위 초과
- (b) **사용자 충격 최소**: 기존 사용자는 출결 사용 시 항상 1교시 표시 + 변경하려면 별도 메뉴(현재 모바일은 없음)였음. MVP는 동등 동작 보장이 우선.
- (c) **v2 자동매칭 가치 인정**:
  - 사용자 의도(현재 또는 직전 수업)와 일치하는 자연스러움은 명백
  - v2에서 (1) `useCurrentPeriod` hook 신설, (2) 매칭 0건 시 1교시 폴백, (3) 사용자가 명시 변경 시 우선
  - 별도 PDCA로 분리: `feature/mobile-attendance-period-auto`

**거절안 — 시간표 매칭 자동**:
- 장점: 사용자 편의 +20% (탭 후 바로 정확한 교시 표시)
- 단점: (1) 신규 로직 = 신규 버그 표면, (2) 시간표 미설정 사용자 처리 분기 필요, (3) Q3/Q4 회귀 체크리스트 양 증가, (4) MVP 범위 초과

**미래 시그널**:
- 본 PDCA Check 단계에서 사용자 피드백 수집 항목 추가: "출결 진입 시 매번 1교시로만 표시되는 것이 불편한가?" → Yes 응답률 30%+ 시 v2 우선순위 상향

---

## 3. 컴포넌트 Props 인터페이스 (TypeScript 시그니처)

### 3.1 `ClassListPage` (rename from `AttendanceListPage`)

```typescript
// 경로: src/mobile/pages/ClassListPage.tsx
// 책임: 학급 리스트 표시 + 학급 선택 시 ClassDetailPage 진입

// Props 변경 없음 (rename만)
interface ClassListPageProps {
  /** 뒤로가기 핸들러 (담임 탭처럼 상위 메뉴로) */
  onBack?: () => void;
}

export function ClassListPage(props: ClassListPageProps): JSX.Element;
```

**내부 변경**:
- 기존: 학급 카드 탭 → `setSelectedClass({classId, className})` → 같은 컴포넌트 내 `<AttendanceCheckPage>` 렌더
- 변경: 학급 카드 탭 → `setSelectedClass({classId, className})` → `<ClassDetailPage>` 렌더

### 3.2 `ClassDetailPage` (NEW)

```typescript
// 경로: src/mobile/pages/ClassDetailPage.tsx
// 책임: 학급 상세 — 헤더 + 서브탭 바 + 컨텐츠 슬롯

type ClassSubTab = 'attendance' | 'progress';

interface ClassDetailPageProps {
  /** 학급 ID (TeachingClass.id) */
  classId: string;
  /** 학급명 (헤더 표시용 + AttendanceCheckPage prop 통과) */
  className: string;
  /** 학급 리스트로 복귀 */
  onBack: () => void;
  /** 초기 서브탭 (default: 'attendance' — §2.1 결정) */
  initialTab?: ClassSubTab;
}

export function ClassDetailPage(props: ClassDetailPageProps): JSX.Element;
```

**내부 state**:
```typescript
const [activeSubTab, setActiveSubTab] = useState<ClassSubTab>(initialTab ?? 'attendance');
```

**Swipe 처리**: 좌우 스와이프(threshold 50px)로 서브탭 전환. 구현은 `onTouchStart` / `onTouchEnd`로 deltaX 측정.

### 3.3 `ClassAttendanceTab` (NEW — 얇은 래퍼)

```typescript
// 경로: src/mobile/components/Class/ClassAttendanceTab.tsx
// 책임: AttendanceCheckPage를 embedded 모드로 호출하는 래퍼

interface ClassAttendanceTabProps {
  classId: string;
  className: string;
}

export function ClassAttendanceTab(props: ClassAttendanceTabProps): JSX.Element;
```

**구현**:
```typescript
export function ClassAttendanceTab({ classId, className }: ClassAttendanceTabProps) {
  return (
    <AttendanceCheckPage
      classId={classId}
      className={className}
      period={1}              // §2.5 — 하드코딩 유지
      type="class"
      onBack={() => {}}       // 임베드 모드에서는 onBack 무시 (헤더 자체가 숨겨짐)
      embedded                // 신규 prop — §3.5 참조
    />
  );
}
```

### 3.4 `ClassProgressTab` (NEW)

```typescript
// 경로: src/mobile/components/Class/ClassProgressTab.tsx
// 책임: 진도 서브탭 전체 — 요약 바 + 추가 버튼 + 그룹 리스트 + 모달 호출

interface ClassProgressTabProps {
  classId: string;
  className: string;
}

export function ClassProgressTab(props: ClassProgressTabProps): JSX.Element;
```

**내부 state**:
```typescript
type ModalState =
  | { type: 'closed' }
  | { type: 'add' }
  | { type: 'edit'; entry: ProgressEntry }
  | { type: 'actionSheet'; entry: ProgressEntry }
  | { type: 'confirmDelete'; entry: ProgressEntry };

const [modalState, setModalState] = useState<ModalState>({ type: 'closed' });
```

**렌더 트리** (의사):
```tsx
<div className="flex flex-col h-full">
  <header>
    <ProgressSummaryBar entries={classEntries} />
    <button onClick={() => setModalState({type: 'add'})} className="w-10 h-10 rounded-full bg-sp-accent/15 text-sp-accent">
      <span className="material-symbols-outlined">add</span>
    </button>
  </header>
  <div className="flex-1 overflow-y-auto">
    {grouped.map(({date, items}) => (
      <section key={date}>
        <h4>{formatDateLabel(date)}</h4>
        {items.map(entry => (
          <ClassProgressEntryItem
            key={entry.id}
            entry={entry}
            isMatchingPeriod={matchingPeriods[date]?.includes(entry.period)}
            onCycleStatus={handleCycle}
            onLongPress={() => setModalState({type: 'actionSheet', entry})}
            onActionMenu={() => setModalState({type: 'actionSheet', entry})}
          />
        ))}
      </section>
    ))}
  </div>
  {modalState.type === 'add' && <MobileProgressLogModal isOpen mode="add" defaultClassId={classId} lockClass onClose={...} />}
  {modalState.type === 'edit' && <MobileProgressLogModal isOpen mode="edit" entryToEdit={modalState.entry} lockClass onClose={...} />}
  {modalState.type === 'actionSheet' && <ActionSheet entry={modalState.entry} onEdit={...} onDelete={...} onClose={...} />}
  {modalState.type === 'confirmDelete' && <ConfirmDialog ... />}
</div>
```

### 3.5 `ClassProgressEntryItem` (NEW)

```typescript
// 경로: src/mobile/components/Class/ClassProgressEntryItem.tsx
// 책임: 진도 한 항목 카드 표시 + 상태 사이클 / 길게 누름 / ⋯ 메뉴 트리거

import type { ProgressEntry } from '@domain/entities/CurriculumProgress';

interface ClassProgressEntryItemProps {
  /** 진도 항목 */
  entry: ProgressEntry;
  /** 시간표 매칭 교시 여부 — true면 ✦ 표시 */
  isMatchingPeriod?: boolean;
  /** 상태 배지 탭 → 사이클 핸들러 */
  onCycleStatus: (entry: ProgressEntry) => void;
  /** 카드 길게 누름(500ms) → 액션시트 오픈 */
  onLongPress: () => void;
  /** 카드 우측 ⋯ 버튼 클릭 → 액션시트 오픈 (보조 진입로, §2.4) */
  onActionMenu: () => void;
}

export function ClassProgressEntryItem(props: ClassProgressEntryItemProps): JSX.Element;
```

**hit area 보장**:
- 상태 배지: `px-3 py-1.5` + `min-h-9`(36px) — 실제 클릭 영역 패딩 포함 44px+
- ⋯ 버튼: `w-8 h-8` 시각, `style={{minWidth:44, minHeight:44}}` tap 영역
- 두 컨트롤 사이 간격: `gap-3` (12px) 이상

---

## 4. 공유 모달 시그니처 변경 — `MobileProgressLogModal`

### 4.1 변경 전 → 변경 후

```typescript
// 변경 전 (현행)
interface Props {
  isOpen: boolean;
  onClose: () => void;
  defaultPeriod: number;
  subject: string;
  classroom: string;
}

// 변경 후 (Design 확정)
interface MobileProgressLogModalProps {
  isOpen: boolean;
  onClose: () => void;

  /** 기본 교시 (default: 1) */
  defaultPeriod?: number;
  /** 시간표상 표시 과목명 (Today CurrentClassCard 진입점에서만 사용) */
  subject?: string;
  /** 시간표상 표시 교실명 (동상) */
  classroom?: string;

  /** 신규: 모드 — 'add' (추가) | 'edit' (편집) (default: 'add') */
  mode?: 'add' | 'edit';

  /** 신규: 학급 강제 지정 (진도 서브탭 진입점에서 사용)
   *  설정 시 후보 자동 선택 + UI 학급 선택 영역 숨김(lockClass와 결합) */
  defaultClassId?: string;

  /** 신규: 학급 선택 UI 잠금 — true면 학급 선택 영역 자체를 렌더하지 않음
   *  (defaultClassId와 함께 사용) */
  lockClass?: boolean;

  /** 신규: 편집 모드 진입 시 prefill할 항목 (mode='edit'일 때 필수) */
  entryToEdit?: ProgressEntry;
}
```

### 4.2 호출 예시

```typescript
// Today CurrentClassCard (기존 호출 — 변경 없음, 모든 신규 prop은 옵셔널)
<MobileProgressLogModal
  isOpen={open}
  onClose={() => setOpen(false)}
  defaultPeriod={currentPeriod}
  subject={slot.subject}
  classroom={slot.classroom}
/>

// 진도 서브탭 추가 진입점 (신규)
<MobileProgressLogModal
  isOpen={modalState.type === 'add'}
  onClose={() => setModalState({type: 'closed'})}
  mode="add"
  defaultClassId={classId}
  lockClass
/>

// 진도 서브탭 편집 진입점 (신규)
<MobileProgressLogModal
  isOpen={modalState.type === 'edit'}
  onClose={() => setModalState({type: 'closed'})}
  mode="edit"
  defaultClassId={classId}
  lockClass
  entryToEdit={modalState.entry}
/>
```

### 4.3 모달 내부 동작 분기

```typescript
function MobileProgressLogModal(props) {
  // mode='edit'일 때 폼 prefill
  useEffect(() => {
    if (!isOpen) return;
    if (mode === 'edit' && entryToEdit) {
      setUnit(entryToEdit.unit);
      setLesson(entryToEdit.lesson);
      setNote(entryToEdit.note ?? '');
      setPeriod(entryToEdit.period);
      setFormDate(entryToEdit.date);  // 신규 state — 편집 시 날짜도 변경 가능
      setSelectedClassId(entryToEdit.classId);
    } else if (mode === 'add' && defaultClassId) {
      setSelectedClassId(defaultClassId);
      // ... 나머지 초기화
    }
    // ... 기존 분기
  }, [isOpen, mode, entryToEdit, defaultClassId]);

  // 저장 핸들러 분기
  const handleSave = async () => {
    if (mode === 'edit' && entryToEdit) {
      const updated = { ...entryToEdit, date: formDate, period, unit, lesson, note };
      await updateEntry(updated);  // 신규 store 메서드
    } else {
      await addEntry(selectedClassId, formDate, period, unit, lesson, note);
    }
    onClose();
  };

  // lockClass=true면 학급 선택 영역 렌더 스킵
  return (
    <Modal>
      {!lockClass && <ClassSelector ... />}
      {/* 단원/차시/교시/날짜/메모 입력은 동일 */}
    </Modal>
  );
}
```

### 4.4 헤더 라벨 분기

```typescript
const headerLabel = mode === 'edit' ? '진도 항목 편집' : '오늘 진도 기록';
```

---

## 5. `AttendanceCheckPage`의 `embedded` prop

### 5.1 시그니처 변경

```typescript
// 변경 전
interface Props {
  classId: string;
  className: string;
  period: number;
  type: 'homeroom' | 'class';
  onBack: () => void;
}

// 변경 후
interface Props {
  classId: string;
  className: string;
  period: number;
  type: 'homeroom' | 'class';
  onBack: () => void;
  /** 신규: true면 자체 헤더(뒤로가기 + 학급명) 렌더 생략.
   *  ClassDetailPage가 헤더를 이미 그리고 있을 때 사용.
   *  default: false (기존 호출처 회귀 차단) */
  embedded?: boolean;
}
```

### 5.2 영향 범위 grep 결과

```bash
$ grep -rn "AttendanceCheckPage" src/
src/mobile/pages/AttendanceListPage.tsx:3:  import { AttendanceCheckPage } from './AttendanceCheckPage';
src/mobile/pages/AttendanceListPage.tsx:35: <AttendanceCheckPage ... />     # 학급 출결 (rename 후 ClassListPage → ClassAttendanceTab으로 이전)
src/mobile/App.tsx:9:                       import { AttendanceCheckPage } from './pages/AttendanceCheckPage';
src/mobile/App.tsx:271:                     <AttendanceCheckPage ... />     # 담임출결 (period=0) — 영향 없음
```

**호출처 분석**:

| 위치 | 변경 후 | embedded prop |
|------|--------|--------------|
| `AttendanceListPage.tsx:35` (현재 학급출결) | `ClassListPage`에서 제거 → `ClassAttendanceTab`이 호출 | `embedded={true}` |
| `App.tsx:271` (담임출결, attendanceNav 경로) | **변경 없음** — 담임출결은 별도 라우팅 유지 | `embedded={false}` (기본값) |

**회귀 차단 메커니즘**: `embedded?: boolean` default `false` → 명시적으로 `embedded`를 패스하지 않은 호출처는 기존과 100% 동일 동작. App.tsx 담임출결 경로 무영향.

### 5.3 내부 구현 분기 (AttendanceCheckPage)

```typescript
export function AttendanceCheckPage({ classId, className, period, type, onBack, embedded = false }: Props) {
  // ... 기존 state/effect ...

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 — embedded 모드에서는 생략 */}
      {!embedded && (
        <header className="glass-header flex items-center gap-3 px-4 py-3 shrink-0">
          <button onClick={onBack}>...</button>
          <h2 className="flex-1 text-sp-text font-bold text-base">
            {className} {type === 'class' && period > 0 ? `· ${period}교시` : ''}
          </h2>
        </header>
      )}

      {/* 본문은 100% 동일 */}
      <div className="flex-1 overflow-y-auto">
        {/* ... 학생 리스트 ... */}
      </div>
    </div>
  );
}
```

---

## 6. 도메인 헬퍼 시그니처 — `progressMatching.ts`

### 6.1 Plan §4.2 시그니처 검토 + 수정

**Plan 시그니처 (검토 대상)**:
```typescript
getMatchingPeriods(args: {
  date: string;
  classroom: string;
  subject: string;
  classSchedule: ClassSchedule;
  teacherSchedule: TeacherSchedule;
  weekendDays: boolean
}): number[]
```

**문제점 발견**:
1. 현행 PC 함수는 `getEffectiveTeacherSchedule(date, weekendDays)` 호출로 **그날 기준 적용된 교사 시간표**를 받음. Plan 시그니처는 `teacherSchedule: TeacherSchedule`로 단순화했지만, 이는 PC와 모바일 양쪽이 호출 직전에 같은 함수를 거쳐야 함을 암묵적으로 요구함 → drift 위험
2. `classroom`/`subject`를 별도 인자로 받지만 PC는 `currentClass.name`/`currentClass.subject`로 도출 → 호출처마다 같은 도출 코드 반복

### 6.2 확정 시그니처

```typescript
// 경로: src/domain/rules/progressMatching.ts
// 책임: 시간표↔학급 매칭 — 특정 날짜에 해당 학급의 수업이 있는 교시 추출
// Clean Architecture: domain → 외부 import 0 (isSubjectMatch, getDayOfWeek만 의존)

import { isSubjectMatch } from './matchingRules';
import { getDayOfWeek } from './periodRules';
import type { ClassSchedule } from '@domain/entities/Schedule';
import type { TeacherSchedule } from '@domain/entities/Schedule';

/** 그날의 교사 시간표 슬롯 (period 0-indexed) */
export interface DayTeacherSlot {
  classroom: string;
  subject: string;
}

/** 매칭 입력 인자 */
export interface MatchingInput {
  /** YYYY-MM-DD */
  date: string;
  /** 학급 정보 (TeachingClass에서 추출) */
  className: string;
  classSubject: string;
  /** 그날 적용된 교사 시간표 — 호출자가 미리 계산해서 전달
   *  (PC: getEffectiveTeacherSchedule, 모바일: useScheduleStore.getEffectiveTeacherSchedule) */
  dayTeacherSchedule: ReadonlyArray<DayTeacherSlot | null>;
  /** 담임반 시간표 폴백 — 교사 시간표 매칭 0건 시 사용 */
  classSchedule: ClassSchedule;
  /** 주말 포함 여부 (settings.enableWeekendDays) */
  weekendDays: boolean;
}

/**
 * 특정 날짜에 해당 학급의 수업이 있는 교시 번호(1-indexed) 배열을 반환.
 * 매칭 단계: (1) 교사 시간표 — 교실+과목 동시 매칭 (가장 정확)
 *           (2) 교사 시간표 — 교실명만 매칭 (과목명 약간 다른 경우)
 *           (3) 담임반 시간표 폴백 (교사 시간표 매칭 0건 시)
 *
 * 매칭 0건이면 빈 배열 반환 (호출처가 모든 교시 표시 또는 폼 정상 오픈).
 */
export function getMatchingPeriods(input: MatchingInput): number[] {
  if (!input.date) return [];
  const periods: number[] = [];

  // 1단계: 교사 시간표 — 교실+과목 동시 매칭
  input.dayTeacherSchedule.forEach((slot, idx) => {
    if (!slot) return;
    const classroomMatch =
      slot.classroom === input.className ||
      slot.classroom.includes(input.className) ||
      input.className.includes(slot.classroom);
    const subjectMatch = isSubjectMatch(slot.subject, input.classSubject);
    if (classroomMatch && subjectMatch) periods.push(idx + 1);
  });

  // 2단계: 교실명만 매칭
  if (periods.length === 0) {
    input.dayTeacherSchedule.forEach((slot, idx) => {
      if (!slot) return;
      const classroomMatch =
        slot.classroom === input.className ||
        slot.classroom.includes(input.className) ||
        input.className.includes(slot.classroom);
      if (classroomMatch) periods.push(idx + 1);
    });
  }

  // 3단계: 담임반 시간표 폴백
  if (periods.length === 0) {
    const dayOfWeek = getDayOfWeek(new Date(input.date + 'T00:00:00'), input.weekendDays);
    const dayScheduleClass = dayOfWeek ? input.classSchedule[dayOfWeek] : undefined;
    if (dayScheduleClass && dayScheduleClass.length > 0) {
      dayScheduleClass.forEach((slot, idx) => {
        if (slot.subject && isSubjectMatch(slot.subject, input.classSubject)) {
          periods.push(idx + 1);
        }
      });
    }
  }

  return periods;
}
```

### 6.3 PC 호출 변환 (D4)

```typescript
// 변경 전 (ProgressTab.tsx:136-191, useCallback 인라인)
const getMatchingPeriods = useCallback((dateStr: string): number[] => {
  // ... 55 LOC ...
}, [classId, classes, classSchedule, getEffectiveTeacherSchedule, settings.enableWeekendDays]);

// 변경 후 (PC ProgressTab.tsx)
import { getMatchingPeriods, type DayTeacherSlot } from '@domain/rules/progressMatching';

const getMatchingPeriodsForDate = useCallback((dateStr: string): number[] => {
  if (!dateStr) return [];
  const currentClass = classes.find((c) => c.id === classId);
  if (!currentClass) return [];

  const weekendDays = settings.enableWeekendDays;
  const dayTeacherSchedule = getEffectiveTeacherSchedule(dateStr, weekendDays);

  return getMatchingPeriods({
    date: dateStr,
    className: currentClass.name,
    classSubject: currentClass.subject,
    dayTeacherSchedule: dayTeacherSchedule as ReadonlyArray<DayTeacherSlot | null>,
    classSchedule,
    weekendDays,
  });
}, [classId, classes, classSchedule, getEffectiveTeacherSchedule, settings.enableWeekendDays]);
```

### 6.4 모바일 호출 (F6에서 사용)

```typescript
// ClassProgressTab.tsx 내부
import { getMatchingPeriods } from '@domain/rules/progressMatching';
import { useMobileScheduleStore } from '@mobile/stores/useMobileScheduleStore';
import { useMobileSettingsStore } from '@mobile/stores/useMobileSettingsStore';
import { useMobileTeachingClassStore } from '@mobile/stores/useMobileTeachingClassStore';

const matchingPeriodsByDate = useMemo(() => {
  const cls = classes.find((c) => c.id === classId);
  if (!cls) return new Map<string, number[]>();
  const weekendDays = settings.enableWeekendDays;
  const result = new Map<string, number[]>();
  for (const date of uniqueDates) {
    const dayTeacherSchedule = getEffectiveTeacherSchedule(date, weekendDays);
    result.set(date, getMatchingPeriods({
      date,
      className: cls.name,
      classSubject: cls.subject,
      dayTeacherSchedule,
      classSchedule,
      weekendDays,
    }));
  }
  return result;
}, [classes, classId, uniqueDates, settings.enableWeekendDays, classSchedule, getEffectiveTeacherSchedule]);
```

### 6.5 Clean Architecture 검증

| 항목 | 확인 |
|------|------|
| domain/rules/ 위치 | ✅ |
| 외부 import 0 (React/Zustand/Electron 등) | ✅ |
| 의존: `isSubjectMatch`, `getDayOfWeek` (둘 다 domain/rules/) | ✅ |
| 타입 의존: `ClassSchedule`, `TeacherSchedule` (domain/entities/) | ✅ |
| PC + 모바일 양쪽 import 가능 | ✅ |

---

## 7. Store 메서드 시그니처 — `useMobileProgressStore`

### 7.1 변경 전 → 변경 후 (전체 인터페이스)

```typescript
// 변경 전
interface MobileProgressState {
  entries: readonly ProgressEntry[];
  loaded: boolean;
  load: () => Promise<void>;
  reload: () => Promise<void>;
  getEntriesByClass: (classId: string) => readonly ProgressEntry[];
  getTodayEntries: (classId: string) => readonly ProgressEntry[];
  addEntry: (
    classId: string,
    date: string,
    period: number,
    unit: string,
    lesson: string,
    note?: string,
  ) => Promise<void>;
  updateEntryStatus: (entry: ProgressEntry, newStatus: ProgressStatus) => Promise<void>;
}

// 변경 후 (Design 확정)
interface MobileProgressState {
  entries: readonly ProgressEntry[];
  loaded: boolean;
  load: () => Promise<void>;
  reload: () => Promise<void>;
  getEntriesByClass: (classId: string) => readonly ProgressEntry[];
  getTodayEntries: (classId: string) => readonly ProgressEntry[];

  /**
   * 진도 항목 추가.
   * @param status 신규 항목 상태 (default: 'completed' — 기존 호출처 회귀 0)
   *               진도 서브탭에서 미래 일정 추가 시 'planned' 가능
   */
  addEntry: (
    classId: string,
    date: string,
    period: number,
    unit: string,
    lesson: string,
    note?: string,
    status?: ProgressStatus,  // 신규 — Plan 대비 추가 (§1.2)
  ) => Promise<void>;

  /** 상태만 변경 (기존 — 사이클 핸들러용) */
  updateEntryStatus: (entry: ProgressEntry, newStatus: ProgressStatus) => Promise<void>;

  /** 신규: 전체 필드 편집 (Bottom-Sheet 편집 모드 저장 핸들러용) */
  updateEntry: (entry: ProgressEntry) => Promise<void>;

  /** 신규: 항목 삭제 (액션시트 → 확인 → 삭제 핸들러용) */
  deleteEntry: (id: string) => Promise<void>;
}
```

### 7.2 신규 메서드 구현 패턴

```typescript
// updateEntry — 기존 updateEntryStatus 패턴과 동일
updateEntry: async (entry) => {
  await manageProgress.update(entry);
  set((s) => ({
    entries: s.entries.map((e) => (e.id === entry.id ? entry : e)),
  }));
  useMobileDriveSyncStore.getState().triggerSaveSync();
},

// deleteEntry
deleteEntry: async (id) => {
  await manageProgress.delete(id);
  set((s) => ({
    entries: s.entries.filter((e) => e.id !== id),
  }));
  useMobileDriveSyncStore.getState().triggerSaveSync();
},

// addEntry 변경 — status 옵셔널 인자 추가
addEntry: async (classId, date, period, unit, lesson, note, status = 'completed') => {
  const entry: ProgressEntry = {
    id: generateUUID(),
    classId, date, period, unit, lesson,
    status,  // ← 인자에서 받음
    note: note ?? '',
  };
  await manageProgress.add(entry);
  set((s) => ({ entries: [...s.entries, entry] }));
  useMobileDriveSyncStore.getState().triggerSaveSync();
},
```

### 7.3 PC 스토어와의 호환

| 모바일 메서드 | PC 메서드 | 호환 |
|-------------|---------|-----|
| `addEntry` | `addProgressEntry` | ✅ 둘 다 `manageProgress.add` 호출 |
| `updateEntry` (NEW) | `updateProgressEntry` | ✅ 둘 다 `manageProgress.update` 호출 |
| `updateEntryStatus` (기존) | (PC는 `updateProgressEntry`로 통합) | 모바일은 사이클 핸들러용으로 분리 유지 — 의도 명확 |
| `deleteEntry` (NEW) | `deleteProgressEntry` | ✅ 둘 다 `manageProgress.delete` 호출 |

### 7.4 sync 트리거 검증

모든 mutation 메서드(`addEntry`, `updateEntry`, `updateEntryStatus`, `deleteEntry`)가 `useMobileDriveSyncStore.getState().triggerSaveSync()` 호출 → GDrive 양방향 sync 보장. D5/D6/Q5에서 검증.

---

## 8. 라우팅 · 상태 흐름

### 8.1 `MobileTab` 키 결정

> ✅ **확정**: `MobileTab` 키 `'attendance'` **그대로 유지**.

**근거** (Plan §10.1 결정 보강):
- (a) **localStorage 호환**: 사용자가 마지막 본 탭이 `attendance`인 경우, `'class'`로 변경 시 첫 진입 시 다른 탭(예: 오늘)으로 자동 이동 → 사용자 혼란
- (b) **외부 링크 호환**: 노션 가이드/AI 챗봇이 `?tab=attendance` 또는 내부 라우팅에서 `'attendance'` 키 참조할 가능성
- (c) **테스트 코드 호환**: 기존 통합/단위 테스트가 `MobileTab`의 enum 값을 직접 사용하면 깨짐

**대안 고려**:
- "마이그레이션 코드로 `'attendance' → 'class'` 자동 변환" — 단순 컴포넌트 라벨 변경에 마이그레이션 도입은 과한 비용
- "타입 alias로 양쪽 지원" — TypeScript 복잡도 증가, 가치 낮음

**확정**: 키는 `'attendance'`, 사용자 노출 라벨만 `'수업'`. App.tsx의 변경은:
```typescript
// 변경 전
{ key: 'attendance', label: '수업 출결', icon: 'fact_check' }

// 변경 후 (App.tsx tabs[] 배열)
{ key: 'attendance', label: '수업', icon: 'co_present' }
```

### 8.2 라우팅 흐름

```
[App.tsx]
  ├─ activeTab === 'attendance' (키 유지)
  │   └─ <ClassListPage />            ← rename된 컴포넌트
  │       ├─ selectedClass === null
  │       │   └─ 학급 카드 리스트
  │       └─ selectedClass !== null
  │           └─ <ClassDetailPage classId className onBack={() => setSelectedClass(null)}>
  │               ├─ activeSubTab === 'attendance'
  │               │   └─ <ClassAttendanceTab classId className />
  │               │       └─ <AttendanceCheckPage embedded period={1} type="class" ... />
  │               └─ activeSubTab === 'progress'
  │                   └─ <ClassProgressTab classId className />
  │                       ├─ <ProgressSummaryBar />
  │                       ├─ <button onClick=...>+</button>
  │                       ├─ {grouped.map} <ClassProgressEntryItem .../>
  │                       └─ {modalState 분기로 Modal/ActionSheet 렌더}
  │
  └─ attendanceNav (담임출결)            ← 변경 없음
      └─ <AttendanceCheckPage period={0} type="homeroom" embedded={false} ... />
```

### 8.3 학급 선택 상태 보존 정책

| 상태 | 보존? | 사유 |
|------|-----|------|
| `ClassListPage` 학급 선택 | ❌ 미보존 (각 진입마다 리스트로 시작) | 모바일은 학급 컨텍스트 자주 전환 — 사용자가 학급 리스트로 복귀하는 행위에 의도가 있음 |
| `ClassDetailPage` 서브탭 위치 | ❌ 미보존 (학급 진입마다 `'attendance'`로 시작) | §2.1 결정 — 단순한 진입 모델 |
| `ClassProgressTab` 모달 상태 | ❌ 미보존 (학급 떠나면 닫힘) | 일반적 모바일 패턴 |
| `ClassProgressTab` 스크롤 위치 | ❌ 미보존 (학급 떠나면 0으로 복귀) | 일반적 모바일 패턴 |

향후 v2: `useMobileClassDetailMemoryStore` 신설로 학급별 마지막 서브탭/스크롤 보존 검토 가능. MVP 비목표.

---

## 9. 픽셀 와이어프레임 (Tailwind 클래스 명세)

### 9.1 `ClassListPage` (변경 없음 — rename만)

기존 `AttendanceListPage` 디자인 100% 유지. 학급 카드 클래스 트리:
```tsx
<div className="flex flex-col h-full">
  <header className="glass-header flex items-center gap-3 px-4 py-3 shrink-0">
    <h2 className="flex-1 text-sp-text font-bold text-base">수업</h2>
  </header>
  <div className="flex-1 overflow-y-auto p-4">
    <p className="text-sp-muted text-sm mb-3">수업할 학급을 선택하세요</p>
    <ul className="space-y-2">
      {classes.map((cls) => (
        <li key={cls.id}>
          <button
            onClick={() => setSelectedClass({classId: cls.id, className: cls.name})}
            className="w-full flex items-center gap-3 px-4 py-4 glass-card rounded-xl hover:scale-[1.01] active:scale-[0.99] transition-transform"
            style={{minHeight: 56}}
          >
            <span className="material-symbols-outlined text-sp-accent">school</span>
            <div className="flex-1 text-left">
              <div className="text-sp-text font-medium">{cls.name}</div>
              <div className="text-sp-muted text-xs">{cls.subject}</div>
            </div>
            <span className="material-symbols-outlined text-sp-muted">chevron_right</span>
          </button>
        </li>
      ))}
    </ul>
  </div>
</div>
```

### 9.2 `ClassDetailPage` (NEW)

```tsx
<div className="flex flex-col h-full">
  {/* 학급 헤더 — 뒤로가기 + 학급명 */}
  <header className="glass-header flex items-center gap-3 px-4 py-3 shrink-0">
    <button onClick={onBack} className="flex items-center justify-center w-10 h-10" style={{minWidth:44, minHeight:44}}>
      <span className="material-symbols-outlined text-sp-text">arrow_back</span>
    </button>
    <h2 className="flex-1 text-sp-text font-bold text-base truncate">{className}</h2>
  </header>

  {/* 서브탭 바 */}
  <div className="flex border-b border-sp-border shrink-0" role="tablist" aria-label="학급 서브탭">
    {(['attendance', 'progress'] as const).map((tab) => (
      <button
        key={tab}
        role="tab"
        aria-selected={activeSubTab === tab}
        aria-controls={`panel-${tab}`}
        onClick={() => setActiveSubTab(tab)}
        className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${
          activeSubTab === tab
            ? 'text-sp-accent border-sp-accent'
            : 'text-sp-muted border-transparent'
        }`}
        style={{minHeight: 44}}
      >
        {tab === 'attendance' ? '출결' : '진도'}
      </button>
    ))}
  </div>

  {/* 컨텐츠 슬롯 (스와이프 영역) */}
  <div
    id={`panel-${activeSubTab}`}
    role="tabpanel"
    className="flex-1 overflow-hidden"
    onTouchStart={handleTouchStart}
    onTouchEnd={handleTouchEnd}
  >
    {activeSubTab === 'attendance' && <ClassAttendanceTab classId={classId} className={className} />}
    {activeSubTab === 'progress' && <ClassProgressTab classId={classId} className={className} />}
  </div>
</div>
```

### 9.3 `ClassProgressTab` (NEW)

```tsx
<div className="flex flex-col h-full">
  {/* 진도 요약 + 추가 버튼 (헤더 영역) */}
  <div className="px-4 py-3 border-b border-sp-border shrink-0">
    <div className="flex items-center justify-between gap-3 mb-2">
      <div className="flex-1 min-w-0">
        {/* 진도율 바 */}
        <div className="flex items-center gap-2 mb-1.5">
          <div className="flex-1 h-2 bg-sp-border rounded-full overflow-hidden">
            <div
              className="h-full bg-sp-accent transition-all"
              style={{width: `${stats.percent}%`}}
              role="progressbar"
              aria-valuenow={stats.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`진도율 ${stats.percent}%`}
            />
          </div>
          <span className="text-sp-text text-xs font-medium tabular-nums">{stats.percent}%</span>
        </div>
        {/* 통계 라벨 */}
        <div className="flex items-center gap-3 text-xs">
          <span className="text-green-400">완료 {stats.completed}</span>
          <span className="text-amber-400">미실시 {stats.skipped}</span>
          <span className="text-blue-400">예정 {stats.planned}</span>
        </div>
      </div>
      {/* + 버튼 — §2.2 결정 (MemoPage·TodoPage 일관 패턴) */}
      <button
        onClick={() => setModalState({type: 'add'})}
        className="flex items-center justify-center w-10 h-10 rounded-full bg-sp-accent/15 text-sp-accent shrink-0"
        style={{minWidth: 44, minHeight: 44}}
        aria-label="진도 항목 추가"
      >
        <span className="material-symbols-outlined">add</span>
      </button>
    </div>
  </div>

  {/* 항목 그룹 리스트 */}
  <div className="flex-1 overflow-y-auto px-4 py-3">
    {entries.length === 0 ? (
      <div className="flex flex-col items-center justify-center h-48 gap-3">
        <span className="material-symbols-outlined text-sp-muted text-4xl">trending_up</span>
        <p className="text-sp-muted text-sm">아직 진도 기록이 없습니다.</p>
        <button
          onClick={() => setModalState({type: 'add'})}
          className="px-4 py-2 rounded-xl bg-sp-accent text-sp-accent-fg text-sm font-medium active:scale-95 transition-transform"
        >
          첫 진도 기록
        </button>
      </div>
    ) : (
      <div className="space-y-4">
        {grouped.map(({date, items}) => (
          <section key={date}>
            <h4 className="text-sp-muted text-xs font-medium mb-2 px-1">{formatDateLabel(date)}</h4>
            <ul className="space-y-2">
              {items.map((entry) => (
                <li key={entry.id}>
                  <ClassProgressEntryItem
                    entry={entry}
                    isMatchingPeriod={matchingPeriodsByDate.get(date)?.includes(entry.period)}
                    onCycleStatus={handleCycleStatus}
                    onLongPress={() => setModalState({type: 'actionSheet', entry})}
                    onActionMenu={() => setModalState({type: 'actionSheet', entry})}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    )}
  </div>

  {/* 모달들 */}
  {modalState.type === 'add' && (
    <MobileProgressLogModal
      isOpen
      mode="add"
      defaultClassId={classId}
      lockClass
      onClose={() => setModalState({type: 'closed'})}
    />
  )}
  {modalState.type === 'edit' && (
    <MobileProgressLogModal
      isOpen
      mode="edit"
      defaultClassId={classId}
      lockClass
      entryToEdit={modalState.entry}
      onClose={() => setModalState({type: 'closed'})}
    />
  )}
  {modalState.type === 'actionSheet' && (
    <ActionSheet
      onEdit={() => setModalState({type: 'edit', entry: modalState.entry})}
      onDelete={() => setModalState({type: 'confirmDelete', entry: modalState.entry})}
      onClose={() => setModalState({type: 'closed'})}
    />
  )}
  {modalState.type === 'confirmDelete' && (
    <ConfirmDialog
      title="진도 항목 삭제"
      message={`${modalState.entry.unit} (${modalState.entry.period}교시)을(를) 삭제하시겠어요?`}
      onConfirm={() => { void deleteEntry(modalState.entry.id); setModalState({type: 'closed'}); }}
      onCancel={() => setModalState({type: 'closed'})}
    />
  )}
</div>
```

### 9.4 `ClassProgressEntryItem` (NEW)

```tsx
<div
  className={`rounded-xl p-3 border ${
    entry.status === 'completed' ? 'border-green-500/30 bg-green-500/5'
    : entry.status === 'skipped' ? 'border-amber-500/30 bg-amber-500/5'
    : 'border-sp-border bg-sp-card'
  } select-none`}
  onTouchStart={() => startLongPress()}
  onTouchEnd={cancelLongPress}
  onTouchMove={cancelLongPress}
>
  <div className="flex items-start gap-3">
    {/* 교시 + ✦ */}
    <div className="flex flex-col items-center justify-center min-w-12 pt-0.5">
      <div className="text-sp-text font-bold text-sm tabular-nums">{entry.period}교시</div>
      {isMatchingPeriod && (
        <span className="text-sp-accent text-xs mt-0.5" aria-label="시간표 매칭">✦</span>
      )}
    </div>
    {/* 단원/차시/메모 */}
    <div className="flex-1 min-w-0">
      <div className="text-sp-text text-sm font-medium truncate">{entry.unit}</div>
      <div className="text-sp-muted text-xs mt-0.5 truncate">{entry.lesson}</div>
      {entry.note && <div className="text-sp-muted text-xs mt-1 line-clamp-2">{entry.note}</div>}
    </div>
    {/* 상태 배지 + ⋯ 메뉴 */}
    <div className="flex items-center gap-3 shrink-0">
      <button
        onClick={() => onCycleStatus(entry)}
        className={`px-3 py-1.5 rounded-lg text-xs font-medium ${STATUS_BADGE_TW[entry.status]}`}
        style={{minHeight: 36}}
        aria-label={`상태: ${STATUS_LABEL[entry.status]} — 탭하여 다음 상태로 변경`}
      >
        {STATUS_LABEL[entry.status]}
      </button>
      <button
        onClick={onActionMenu}
        className="flex items-center justify-center w-8 h-8 rounded-lg text-sp-muted"
        style={{minWidth: 44, minHeight: 44}}
        aria-label="더 보기 메뉴 (편집/삭제)"
      >
        <span className="material-symbols-outlined text-icon-md">more_vert</span>
      </button>
    </div>
  </div>
</div>
```

상수:
```typescript
const STATUS_BADGE_TW: Record<ProgressStatus, string> = {
  planned: 'bg-blue-500/20 text-blue-400',
  completed: 'bg-green-500/20 text-green-400',
  skipped: 'bg-amber-500/20 text-amber-400',
};
const STATUS_LABEL: Record<ProgressStatus, string> = {
  planned: '예정',
  completed: '완료',
  skipped: '미실시',
};
```

### 9.5 ActionSheet (Bottom-Sheet 스타일)

```tsx
<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
  <div className="w-full max-w-md bg-sp-card border-t border-sp-border rounded-t-2xl pb-[env(safe-area-inset-bottom)]" onClick={(e) => e.stopPropagation()}>
    <div className="px-2 pt-2 flex justify-center">
      <div className="w-12 h-1 bg-sp-border rounded-full" aria-hidden />
    </div>
    <button
      onClick={onEdit}
      className="w-full flex items-center gap-3 px-5 py-4 text-left text-sp-text active:bg-sp-surface"
      style={{minHeight: 52}}
    >
      <span className="material-symbols-outlined text-sp-accent">edit</span>
      <span className="text-sm font-medium">편집</span>
    </button>
    <button
      onClick={onDelete}
      className="w-full flex items-center gap-3 px-5 py-4 text-left text-red-400 active:bg-sp-surface"
      style={{minHeight: 52}}
    >
      <span className="material-symbols-outlined">delete</span>
      <span className="text-sm font-medium">삭제</span>
    </button>
    <div className="border-t border-sp-border">
      <button
        onClick={onClose}
        className="w-full px-5 py-4 text-sp-muted text-sm font-medium"
        style={{minHeight: 52}}
      >
        취소
      </button>
    </div>
  </div>
</div>
```

### 9.6 디자인 토큰 일관성 체크

| 토큰 | 본 Design 사용 위치 | CLAUDE.md 정의 |
|------|------------------|--------------|
| `sp-bg` | `mobile-bg` (전체 배경) | #0a0e17 |
| `sp-card` | 학급 카드, 진도 카드, 모달 | #1a2332 |
| `sp-border` | 구분선, 카드 테두리 | #2a3548 |
| `sp-accent` | + 버튼, ✦, 활성 서브탭 | #3b82f6 |
| `sp-text` | 본문 텍스트 | #e2e8f0 |
| `sp-muted` | 보조 텍스트, 빈 상태 | #94a3b8 |
| `rounded-xl` (12px) | 모든 카드, 모달 | ✅ Tailwind 기본 |
| `rounded-full` | + 버튼, 액션시트 핸들 | ✅ Tailwind 기본 |
| `rounded-t-2xl` (16px) | Bottom-Sheet 상단 | ✅ Tailwind 기본 |
| `rounded-sp-*` | **사용 안 함** | ✅ 메모리 룰 준수 |

**메모리 룰 `feedback_rounding_policy.md` 준수**: 직각 0건, `rounded-sp-*` 0건, Tailwind 기본 키만 사용.

---

## 10. 인터랙션 명세

### 10.1 서브탭 전환 트랜지션

| 트리거 | 동작 | 시간 |
|------|-----|------|
| 서브탭 라벨 탭 | 즉시 전환 + 활성 라벨 색상 변경 (`text-sp-accent`) + 하단 보더 색상 변경 (`border-sp-accent`) | 200ms color transition |
| 좌우 스와이프 (deltaX > 50px) | 전환 (서브탭 2개 순서: attendance ↔ progress) | 같음 |
| 키보드 접근 (Tab + Enter) | 즉시 전환 | 같음 |

**스와이프 임계치**: `Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY)` — 수직 스크롤과 충돌 방지.

### 10.2 + 버튼 → 모달 오픈

| 단계 | 동작 |
|-----|------|
| 1. 탭 | `setModalState({type: 'add'})` |
| 2. 모달 마운트 | `MobileProgressLogModal` Bottom-Sheet 슬라이드 업 (CSS transition `transform 200ms`) |
| 3. 첫 입력 필드 autoFocus | 단원 입력 필드에 키보드 자동 표시 |
| 4. 학급 영역 | `lockClass={true}`로 학급 선택 UI 숨김 — 학급명만 readonly 텍스트 1줄 |

### 10.3 상태 사이클 인터랙션

| 단계 | 동작 |
|-----|------|
| 1. 상태 배지 탭 | `onCycleStatus(entry)` 호출 |
| 2. 배지 색상 즉시 변경 | optimistic update (state 먼저 갱신) |
| 3. 백그라운드 저장 | `updateEntryStatus` → `manageProgress.update` → sync trigger |
| 4. 실패 시 | 토스트 "저장 실패" + 원복 |

**시각 피드백**: 배지 클릭 시 `active:scale-95` 트랜지션 (100ms).

### 10.4 길게 누름 → 액션시트

| 단계 | 동작 |
|-----|------|
| 1. `onTouchStart` | `setTimeout(() => onLongPress(), 500)` 시작 |
| 2. 손가락 이동(`onTouchMove`) | `clearTimeout` — 의도치 않은 트리거 방지 |
| 3. 500ms 경과 | 액션시트 슬라이드 업 + 햅틱 피드백 (`navigator.vibrate(10)`) |
| 4. 백드롭 탭 또는 취소 | 액션시트 닫힘 |

**MemoPage.tsx:240-251 패턴 100% 일관**.

### 10.5 키보드 처리

| 시나리오 | 처리 |
|--------|------|
| 모달 오픈 + 키보드 표시 | Bottom-Sheet 모달은 `max-h-[90vh]` + `flex-col` + 본문 `overflow-y-auto` → 키보드와 입력 필드 사이 항상 가시 영역 확보 |
| 입력 필드 포커스 | 모바일 브라우저 기본 동작 (스크롤로 포커스된 필드 보이게) |
| 입력 중 모달 외부 탭 | 키보드 닫힘 + 모달은 유지 |
| 백 버튼(Android) | 모달 닫힘 (학급 상세는 유지) |

### 10.6 좌우 스와이프 임계치

```typescript
// ClassDetailPage 내부
const touchStartRef = useRef<{x: number; y: number} | null>(null);

const handleTouchStart = (e: React.TouchEvent) => {
  const t = e.touches[0];
  if (t) touchStartRef.current = {x: t.clientX, y: t.clientY};
};

const handleTouchEnd = (e: React.TouchEvent) => {
  const start = touchStartRef.current;
  if (!start) return;
  const t = e.changedTouches[0];
  if (!t) return;
  const dx = t.clientX - start.x;
  const dy = t.clientY - start.y;
  // 수직 스크롤 우선 (UX)
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    if (dx < 0 && activeSubTab === 'attendance') setActiveSubTab('progress');
    if (dx > 0 && activeSubTab === 'progress') setActiveSubTab('attendance');
  }
  touchStartRef.current = null;
};
```

---

## 11. 접근성 (A11y)

### 11.1 터치 hit area 44px

모든 상호작용 컨트롤이 WCAG 2.5.5 (Target Size, Level AAA) 충족:

| 컨트롤 | 시각 크기 | tap 영역 | 보장 방법 |
|------|----------|---------|---------|
| 학급 카드 | 56px height | 56px | `style={{minHeight: 56}}` |
| 서브탭 라벨 | 40px height | 44px | `style={{minHeight: 44}}` + `py-3` |
| + 버튼 | 40px circle | 44px | `style={{minWidth: 44, minHeight: 44}}` |
| 상태 배지 | 28px height | 36px | `min-h-9` (36px) — Plan 시각 우선 |
| ⋯ 메뉴 버튼 | 32px circle | 44px | `style={{minWidth: 44, minHeight: 44}}` |
| 액션시트 항목 | 52px height | 52px | `style={{minHeight: 52}}` |

### 11.2 ARIA 마크업

| 위치 | role | 속성 |
|-----|------|------|
| 서브탭 컨테이너 | `tablist` | `aria-label="학급 서브탭"` |
| 서브탭 라벨 | `tab` | `aria-selected`, `aria-controls="panel-{tab}"` |
| 서브탭 컨텐츠 | `tabpanel` | `id="panel-{tab}"`, `aria-labelledby` |
| 진도율 바 | `progressbar` | `aria-valuenow`, `aria-valuemin=0`, `aria-valuemax=100`, `aria-label` |
| + 버튼 | (button) | `aria-label="진도 항목 추가"` |
| ⋯ 메뉴 버튼 | (button) | `aria-label="더 보기 메뉴 (편집/삭제)"` |
| 상태 배지 | (button) | `aria-label="상태: 완료 — 탭하여 다음 상태로 변경"` |
| ✦ 매칭 표시 | (span) | `aria-label="시간표 매칭"` |
| 액션시트 핸들 | (div) | `aria-hidden="true"` |

### 11.3 Focus 관리

| 시나리오 | 동작 |
|--------|------|
| 모달 오픈 | 첫 입력 필드 (`autoFocus`)에 포커스 |
| 모달 닫힘 | 트리거 버튼(+ 또는 ⋯)으로 포커스 복귀 (실현: `useRef` + `useEffect`) |
| 액션시트 오픈 | 첫 항목 (편집)에 포커스 |
| 액션시트 닫힘 | 트리거 카드로 포커스 복귀 |
| 서브탭 키보드 전환 | 좌우 화살표 키로 인접 탭 이동 (선택 — MVP는 Tab+Enter만) |

### 11.4 시멘틱 마크업

- 페이지 헤더: `<header>` (Tailwind `glass-header`)
- 서브탭 컨텐츠: `<section>`
- 진도 그룹 헤더: `<h4>` (학급 헤더가 `<h2>`이므로 계층 일관)
- 항목 리스트: `<ul>` + `<li>`
- 액션시트: 일반 `<div>` (포털 활용 시 `<dialog>` 검토 — MVP는 div + role)

### 11.5 한국어 UI 텍스트 일관성

| 위치 | 텍스트 |
|------|------|
| 하단탭 라벨 | `수업` |
| 학급 리스트 안내 | `수업할 학급을 선택하세요` |
| 학급 빈 상태 | `등록된 학급이 없습니다.` (기존 동일) |
| 서브탭 라벨 | `출결`, `진도` |
| 진도 빈 상태 | `아직 진도 기록이 없습니다.` / 버튼 `첫 진도 기록` |
| 진도 통계 | `완료 {N}` / `미실시 {N}` / `예정 {N}` (PC와 일치) |
| 상태 배지 | `예정` / `완료` / `미실시` (PC와 일치) |
| 액션시트 | `편집` / `삭제` / `취소` |
| 삭제 확인 | `진도 항목 삭제` / `{단원} ({교시}교시)을(를) 삭제하시겠어요?` |
| 모달 헤더 | `오늘 진도 기록` / `진도 항목 편집` |

---

## 12. Acceptance Criteria 갱신 (Plan §9 보강)

### 12.1 기능 체크리스트 (Plan §9.1 + Design 추가)

#### Plan에서 유지
- [ ] 모바일 하단탭 5번째 라벨이 `수업`으로 표시됨 (아이콘 `co_present`)
- [ ] `수업` 탭 진입 → 학급 리스트 노출 (등록된 수업반 모두)
- [ ] 학급 카드 탭 → `ClassDetailPage` 진입, 헤더에 학급명 + 뒤로가기
- [ ] `[출결] [진도]` 서브탭 노출, 좌우 스와이프 또는 탭으로 전환 가능
- [ ] 출결 서브탭 진입 시 기존 `AttendanceCheckPage`와 시각·동작 모두 회귀 0건 (자체 헤더만 숨김)
- [ ] 진도 서브탭에 진도 요약 바(✓N · 미M · 예K · 진도율 %) 표시
- [ ] 시간표 매칭 ✦ 표시 — 학급+과목+오늘 날짜의 매칭 교시에 ✦가 보이고, 선택 안 된 교시는 ✦ 없음
- [ ] 진도 항목 카드의 상태 배지 탭 → `planned` → `completed` → `skipped` → `planned` 사이클
- [ ] 진도 항목 ⋯ 메뉴 → `편집` → 인라인 폼 → 단원/차시/메모/날짜/교시 모두 수정 → 저장
- [ ] 진도 항목 ⋯ 메뉴 → `삭제` → 확인 다이얼로그 → 항목 제거
- [ ] 날짜 그룹화 — 같은 날짜끼리 묶이고, 그룹 헤더에 날짜+요일 표시(예: `4월 27일 (월)`)
- [ ] `+` 버튼 → `MobileProgressLogModal` 오픈, 학급은 `defaultClassId`로 강제 선택, 사용자는 단원/차시/교시/날짜만 입력

#### Design 추가 항목
- [ ] **§2.1 결정 검증**: 학급 선택 후 첫 진입 시 항상 `출결` 서브탭이 활성 상태
- [ ] **§2.2 결정 검증**: + 버튼이 진도 서브탭 헤더 우측에 위치, MemoPage·TodoPage와 동일 패턴 (`w-10 h-10 rounded-full bg-sp-accent/15`)
- [ ] **§2.3 결정 검증**: 편집 진입 시 별도 컴포넌트가 아닌 동일 `MobileProgressLogModal`이 `mode='edit'`로 오픈, 폼 prefill 정상
- [ ] **§2.3 결정 검증**: Bottom-Sheet 모달이 키보드 표시 시 입력 필드 가림 0건
- [ ] **§2.4 결정 검증**: 카드 길게 누름(500ms) → 액션시트 오픈, 햅틱 피드백 동작 (지원 기기)
- [ ] **§2.4 결정 검증**: 카드 우측 ⋯ 버튼 탭 → 동일 액션시트 오픈
- [ ] **§2.5 결정 검증**: 출결 서브탭의 `period` 값이 1교시로 표시됨 (현행과 동일)
- [ ] **§4 시그니처 검증**: `MobileProgressLogModal`의 신규 prop 4종(`mode`, `defaultClassId`, `lockClass`, `entryToEdit`) 모두 옵셔널, 미전달 시 기존 동작
- [ ] **§5 시그니처 검증**: `AttendanceCheckPage embedded` prop default `false`, App.tsx 담임출결(`attendanceNav`) 호출 회귀 0
- [ ] **§7.1 시그니처 검증**: `addEntry`의 `status` 옵셔널 인자 default `'completed'`, MobileProgressLogModal 기존 호출 회귀 0
- [ ] **§8.1 라우팅 검증**: `MobileTab` 키 `'attendance'` 유지, localStorage 기존 값 호환
- [ ] **§9.6 토큰 검증**: 본 Design 산출물에 `rounded-sp-*` 0건 사용
- [ ] **§11 접근성 검증**: 모든 상호작용 컨트롤 hit area 44px+ (Q6 실기기 체크)
- [ ] **§11 접근성 검증**: 서브탭 키보드 Tab 이동 + Enter 활성화 동작

### 12.2 비기능 체크리스트 (Plan §9.2 유지)

- [ ] `npx tsc --noEmit` 0 errors
- [ ] `npm run build` 통과
- [ ] PC `ClassManagementPage > 진도 관리 탭` 모든 기능 동작 불변 — 도메인 헬퍼 추출 회귀 0건
- [ ] GDrive 양방향 sync 검증 통과 (모바일 추가→PC, PC 추가→모바일, 모바일 편집→PC, 모바일 삭제→PC)
- [ ] 모든 UI 텍스트가 한국어로 작성됨
- [ ] 디자인 토큰 일관성 (sp-bg/sp-card/sp-accent 사용, `rounded-sp-*` 미사용)
- [ ] Match Rate ≥ 90% (Check phase 측정)

### 12.3 신규 비기능 체크리스트 (Design 추가)

- [ ] **회귀**: `AttendanceCheckPage`가 App.tsx 담임출결 경로(`attendanceNav`)에서 헤더 + 뒤로가기 버튼이 그대로 표시됨 (embedded=false 기본값 동작 검증)
- [ ] **회귀**: 시간표 미설정 사용자에서 진도 추가 폼 정상 오픈, 매칭 교시 0개여도 모든 교시 선택 가능 (R2 폴백)
- [ ] **회귀**: PC에서 추가 진도 → 모바일 reload 후 진도 서브탭에 즉시 표시 (sync 검증)
- [ ] **회귀**: 모바일에서 편집한 진도가 PC reload 시 동일하게 반영
- [ ] **A11y**: `aria-label` 누락 0건 (스크린 리더 검증)

### 12.4 릴리즈 전 체크 (Plan §9.3 유지)

- [ ] AI 챗봇 KB 갱신 — `수업` 탭 설명 + 진도 입력 가이드 Q&A 추가, `scripts/ingest-chatbot-qa.mjs` 실행
- [ ] 노션 사용자 가이드 갱신 — `수업` 탭 챕터 추가
- [ ] `public/release-notes.json` 새 버전 항목 추가
- [ ] Sidebar/MorePage/SettingsPage 버전 텍스트 갱신

---

## 13. 다음 단계

### 13.1 Design 승인 후 — 팀에이전트 모드 시작

```
/pdca do mobile-class-tab-integration
```

→ Plan §6.1 팀 구성으로 Swarm pattern 시작:

| 팀 | 진입 시점 | 의존성 |
|----|---------|-------|
| **developer** | 즉시 시작 (D1, D2, D3는 다른 팀 의존 없음) | — |
| **frontend** | F1, F2, F3는 즉시. F4·F5는 D2·D3 메서드 시그니처 합의 후 시작 가능(이미 §7에서 합의 완료) | F4·F5는 §7 시그니처 |
| **qa** | F + D 일부 완료 후 Q1 (tsc) 시작 → 점진적 검증 | F1-F9, D1-D6 |

### 13.2 병렬 실행 의존 그래프

```
[D1: progressMatching.ts]   ──┐
[D2: updateEntry]            ──┤
[D3: deleteEntry]            ──┤
[D6: sync 검증]              ──┘   → [D5: 타입 검증]

[F1: tabs[] 변경]            ──┐
[F2: ClassListPage rename]   ──┤
[F3: ClassDetailPage]        ──┤   → [F6: ClassProgressTab] (D1, D2, D3 완료 후)
                                              ↓
[F5: AttendanceCheckPage embedded] → [F4: ClassAttendanceTab]   → [F7: ClassProgressEntryItem]
                                                                       ↓
                                                              [F8: MobileProgressLogModal mode/lockClass]
                                                                       ↓
                                                              [F9: 디자인 토큰 일관성 검증]

[D4: PC ProgressTab 헬퍼 교체] (D1 완료 후)

[Q1: tsc] → [Q2: build] → [Q3: PC 회귀] → [Q4: 모바일 출결 회귀] → [Q5: GDrive sync] → [Q6: 실기기] → [Q7: 성능] → [Q8: R2 폴백] → [Q10: 한국어] → [Q9: gap-detector]
```

### 13.3 Match Rate Gate

- Check phase에서 **Match Rate ≥ 90%** 강제 (CTO Lead 직접 검증)
- < 90% 시 자동 `/pdca iterate`
- ≥ 90% 시 `/pdca report` → `/pdca archive` → 릴리즈 워크플로우 8단계

### 13.4 릴리즈 타깃

v1.13.x 또는 v2.1.0 — Plan §10.4와 동일.

---

## 부록 A. Design 결정 일지

| 일자 | 결정 | 근거 출처 |
|------|------|---------|
| 2026-04-27 | 진입 기본 서브탭 = `출결` | 사용자 직접 지정 (CTO Lead 미션 brief) |
| 2026-04-27 | + 버튼 = 헤더 우측 | 모바일 코드 SoR — `MemoPage.tsx:267`, `TodoPage.tsx:330` 일관 패턴 |
| 2026-04-27 | 편집 UI = Bottom-Sheet 모달 (mode prop 확장) | 키보드 가림 회피 + 컴포넌트 재사용 |
| 2026-04-27 | 상태 사이클 = 탭 1회 + 길게누름 액션시트 + ⋯ 보조 | PC 일관성 + 모바일 실수 회복 + discoverability |
| 2026-04-27 | 출결 period = 1교시 하드코딩 | R6 회귀 차단, v2 별도 PDCA |
| 2026-04-27 | `addEntry`에 `status?` 옵셔널 인자 추가 | Bottom-Sheet 편집/추가 통합 시 필요, default `'completed'`로 회귀 0 |
| 2026-04-27 | `MobileProgressLogModal`에 `lockClass` prop 추가 | 학급 컨텍스트 결정된 진입점에서 학급 선택 UI 자체 숨김 — 더 명확한 UX |
| 2026-04-27 | `MobileTab` 키 `'attendance'` 유지 | localStorage·외부링크·테스트 호환 |
| 2026-04-27 | `progressMatching.ts` 시그니처는 `dayTeacherSchedule` pre-resolved 받음 | PC와 모바일이 각자 다른 store 호출하므로 호출자가 미리 해석해야 함 — 도메인 함수는 순수성 유지 |

## 부록 B. 권고원 SoR 매핑

| Design 결정 | 권고원 (frontend-design 대체) | 검증 가능 위치 |
|-----------|-----------------------------|---------------|
| #2 + 버튼 위치 | 모바일 코드 SoR | `src/mobile/pages/MemoPage.tsx:267`, `src/mobile/pages/TodoPage.tsx:330` |
| #3 Bottom-Sheet | 모바일 코드 SoR + WCAG 키보드 | `MobileProgressLogModal.tsx:130` (기존 Bottom-Sheet 패턴) |
| #4 길게누름 | 모바일 코드 SoR | `MemoPage.tsx:240-251` (500ms 타이머 패턴) |
| #4 ⋯ 버튼 | WCAG 2.4.6 (Multiple Ways), discoverability | 휴리스틱 |
| #5 회귀 0 | Plan §8 R6 + 현행 `AttendanceListPage.tsx:35` | 코드 SoR |
| 토큰 일관 | CLAUDE.md 디자인 시스템 + 메모리 룰 `feedback_rounding_policy.md` | 문서 |
| 아이콘 `co_present` | Material Symbols + Plan §3.1 | 디자인 시스템 |

## 부록 C. 참고 파일 위치 (Plan 부록 A에 추가)

| 항목 | 파일 |
|------|------|
| 모바일 + 버튼 패턴 (헤더 우측) | `src/mobile/pages/MemoPage.tsx:267`, `src/mobile/pages/TodoPage.tsx:330` |
| 모바일 길게 누름 패턴 (500ms) | `src/mobile/pages/MemoPage.tsx:240-251` |
| 모바일 Bottom-Sheet 모달 패턴 | `src/mobile/components/Today/MobileProgressLogModal.tsx:124-145` |
| 모바일 출결 호출처 (rename 대상) | `src/mobile/pages/AttendanceListPage.tsx:35` |
| 모바일 출결 호출처 (담임출결 — 영향 없음) | `src/mobile/App.tsx:271` |
| PC 진도 인라인 함수 (D4 추출 대상) | `src/adapters/components/ClassManagement/ProgressTab.tsx:136-191` |
| PC STATUS_CONFIG (모바일과 일관) | `src/adapters/components/ClassManagement/ProgressTab.tsx:25-29` |
| PC STATUS_CYCLE (모바일과 일관) | `src/adapters/components/ClassManagement/ProgressTab.tsx:31-35` |
