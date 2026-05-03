# Homeroom 페이지 프론트엔드 아키텍처 분석

> 분석 대상: `src/adapters/components/Homeroom/` 전체  
> 분석 기준: React 패턴·재사용성·접근성(WCAG 2.1 AA)·TypeScript strict  
> 분석일: 2026-05-01

---

## A. 컴포넌트 분해·재사용성

### [P0] InputMode 인라인 배치 확인 모달 (미추출)

- **위치**: `src/adapters/components/Homeroom/Records/InputMode.tsx:941-1013`
- **현재**: `showBatchConfirm` 조건부 렌더 블록이 InputMode 중앙 컬럼 JSX 안에 82줄짜리 인라인 모달로 박혀 있음. `fixed inset-0 z-50` 오버레이를 JSX 트리 내부에 직접 선언.
- **문제**: 모달이 컴포넌트 트리에 종속돼 focus-trap 없음. Portal로 분리되지 않아 z-index 스택 계층이 불명확.
- **개선안**: `BatchConfirmModal` 컴포넌트로 분리, `src/adapters/components/common/Modal.tsx`의 `<Modal>` 래퍼 적용.

```tsx
// 분리 후 시그니처
interface BatchConfirmModalProps {
  rangeDates: string[];
  selectedDate: string;
  endDate: string;
  selectedStudentCount: number;
  saving: boolean;
  progress: { current: number; total: number } | null;
  onConfirm: () => void;
  onClose: () => void;
}
```

---

### [P0] InputMode 메모 확대 모달 (미추출)

- **위치**: `src/adapters/components/Homeroom/Records/InputMode.tsx:1241-1292`
- **현재**: `showMemoModal` 인라인 모달이 `fixed inset-0 z-50`으로 선언. 컴포넌트 맨 하단 JSX에서 `{/* 메모 확대 모달 (fixed 포지션) */}` 주석과 함께 중복 배치 — JSX 닫는 태그 바깥(`1293`)에 주석이 붙어 있어 구조적으로 혼란.
- **문제**: 동일 파일 내 2개 인라인 모달이 공통 `<Modal>` 없이 각자 backdrop/overlay를 선언.
- **개선안**: `MemoExpandModal` 추출 또는 기존 `<Modal>` 컴포넌트 재사용.

---

### [P0] StudentRecords 위젯 — 본 페이지 비중복 확인

- **위치**: `src/widgets/items/StudentRecords.tsx`
- **현재**: 파일 내용은 4줄 — `DashboardStudentRecords`를 re-export만 함. 위젯 자체는 `src/adapters/components/Dashboard/DashboardStudentRecords.tsx`(269줄)에 구현. 1959줄 위젯이라는 미션 설명은 잘못된 수치로 판명됨 — 실제 파일 크기 4줄.
- **문제**: 없음(정상). `DashboardStudentRecords`는 Records 탭 로직을 재구현하지 않고 `useStudentRecordsStore`·`sortByDateDesc`만 구독하는 경량 뷰.
- **참조**: `src/widgets/items/StudentRecords.tsx:1-4`, `DashboardStudentRecords.tsx:34-50`

---

### [P1] InputMode — 3가지 독립 관심사가 한 파일에 혼재 (1299줄)

- **위치**: `src/adapters/components/Homeroom/Records/InputMode.tsx:1-1299`
- **현재**: 학생 선택 패널(496~637줄), 카테고리+메모 입력 패널(648~922줄), 오늘 기록·이전 기록 우측 패널(1024~1237줄)이 단일 함수 컴포넌트 안에 인라인으로 존재. 3컬럼 리사이즈 로직(121~159줄)도 포함.
- **문제**: 단일 책임 원칙 위반. 15개 이상의 `useState`가 한 스코프에 존재해 리렌더 경계 설정이 불가능.
- **개선안**: 아래 단위로 분리.

| 추출 컴포넌트 | 현재 위치 | 예상 줄 수 |
|---|---|---|
| `StudentSelectorPanel` | 496~637 | ~140 |
| `RecordEntryPanel` | 648~940 | ~290 |
| `TodayRecordPanel` | 1024~1237 | ~210 |
| `useInputModeResize` | 121~159 | 40줄 hook |
| `useInputModeKeyboard` | 415~473 | 60줄 hook |
| `useInputModeBatchSave` | 377~412 | 35줄 hook |

---

### [P1] ConsultationCreateModal — 1431줄 단일 컴포넌트

- **위치**: `src/adapters/components/Homeroom/Consultation/ConsultationCreateModal.tsx:192-1431`
- **현재**: 상담 일정 생성 전체 흐름을 단일 컴포넌트가 처리. 내부에 순수 유틸 함수 7개(`parseTimeToMinutes`, `minutesToTime`, `computeBreakPresets`, `buildSlotChips`, `computeAvailableRanges`, `presetKey`, `parsePresetKey`)가 컴포넌트 파일에 혼재.
- **문제**: 비즈니스 로직(슬롯 계산)이 UI 레이어에 박혀 있음. 단위 테스트 불가.
- **개선안**:
  - 유틸 7개를 `consultationSlotUtils.ts`로 추출 (domain/rules 또는 adapters/utils)
  - 학부모 상담 슬롯 UI ↔ 학생 상담 슬롯 UI를 `ParentSlotSection`/`StudentSlotSection`으로 분리

---

### [P1] RosterManagementTab — 3개 인라인 모달 (1103줄)

- **위치**: `src/adapters/components/Homeroom/RosterManagementTab.tsx:643`, `719`, `1021`
- **현재**: 상태 변경 확인 모달(643), 대량 가져오기 wizard(719), Excel 내보내기 확인(1021)이 모두 `fixed inset-0 z-50` 인라인.
- **문제**: focus-trap 없음, `<Modal>` 컴포넌트 미사용.
- **개선안**: 3개 모달을 각각 추출, `<Modal>` 적용.

---

### [P2] RecordEditProps — 과도한 props drilling

- **위치**: `src/adapters/components/Homeroom/Records/recordUtils.ts:15-38`
- **현재**: `RecordEditProps` 인터페이스가 18개 필드. `SearchMode` → `StudentTimelineView` / `DefaultRecordListView` → `InlineRecordEditor`까지 3단계 드릴.
- **문제**: 편집 상태 변경 시 3개 컴포넌트 시그니처 모두 수정 필요.
- **개선안**: `useRecordEditState` hook으로 상태와 핸들러를 묶어 Context 또는 단일 객체로 전달.

```ts
// 개선 후
function useRecordEditState() {
  // editingId, editContent 등 18개 상태 + 핸들러 반환
  return { state, handlers };
}
```

---

### [P2] RECORD_COLOR_MAP 위치 — store에 박힌 UI 매핑

- **위치**: `src/adapters/stores/useStudentRecordsStore.ts:15-40` 및 `InlineRecordEditor.tsx:2`, `FilterSummaryStrip.tsx:5`, `recordUtils.ts:1`, `DashboardStudentRecords.tsx:2`
- **현재**: 카테고리 색상 → Tailwind 클래스 매핑이 Zustand store 파일 최상단에 `export const RECORD_COLOR_MAP`으로 선언. 4개 UI 컴포넌트가 store를 직접 import해 상수만 사용.
- **문제**: store 파일이 UI 토큰 역할 겸업. store를 구독하지 않아도 되는 파일이 store에 의존.
- **개선안**: `src/adapters/presenters/recordColorPresenter.ts`로 이동.

---

### [P2] 6개 탭 패턴 일관성 — `role="button"` 오용

- **위치**: `src/adapters/components/Homeroom/Survey/SurveyTab.tsx:183-185`, `src/adapters/components/Homeroom/Consultation/ConsultationTab.tsx:149-151`
- **현재**: `<div role="button" tabIndex={0} ...>`로 카드를 클릭 가능하게 구현.
- **문제**: `<div role="button">`은 `onKeyDown` Enter/Space 처리 없이는 WCAG 2.1 SC 4.1.2 미준수. 실제 `<button>` 대비 기본 포커스 링, 키보드 동작, 접근성 트리 표현 모두 열등.
- **개선안**: `<button>` 요소로 교체.

---

### [P3] SurveyTab 내 COLOR_MAP 중복 정의

- **위치**: `src/adapters/components/Homeroom/Survey/SurveyTab.tsx:20-29`
- **현재**: `SurveyTab`이 자체 `COLOR_MAP` 객체를 8색상으로 정의. `RECORD_COLOR_MAP` 패턴과 유사하지만 별도 정의.
- **문제**: 디자인 시스템 색상 중복.
- **개선안**: 공용 `categoryColorPresenter` 또는 Tailwind `data-*` 매핑으로 통합.

---

## B. React 패턴·hook·상태관리

### [P0] InputMode activeStudents useMemo — 의존성 누락

- **위치**: `src/adapters/components/Homeroom/Records/RecordsTab.tsx:48`
- **현재**:
```tsx
const activeStudentsList = useMemo(() => activeStudents(), [students]);
```
- **문제**: `activeStudents`는 store에서 꺼낸 함수 참조인데 deps 배열에 없음. `students` 배열만 dep으로 올바르게 전파될 수도 있지만, `activeStudents` 함수 참조가 변경될 경우 메모이제이션이 무효화되지 않음. eslint-plugin-react-hooks `exhaustive-deps` 위반.
- **개선안**: `[students, activeStudents]`로 수정 또는 store에서 `activeStudentsList`를 직접 selector로 제공.

---

### [P0] SearchMode — 편집 상태 직접 관리로 인한 onEditCancel 코드 중복

- **위치**: `src/adapters/components/Homeroom/Records/SearchMode.tsx:576-577`, `607-608`
- **현재**: `onEditCancel` 인라인 함수가 `StudentTimelineView`와 `DefaultRecordListView` 둘 다에 별도로 정의되며 동일한 6개 상태 리셋 로직을 반복.
```tsx
onEditCancel={() => { setEditingId(null); setEditReportedToNeis(false); setEditDocumentSubmitted(false); setEditFollowUp(''); setEditFollowUpDate(''); setEditAttendancePeriods([]); }}
```
- **문제**: 편집 필드 추가 시 두 곳 모두 수정 필요. 인라인 함수 생성으로 매 렌더마다 참조 변경.
- **개선안**: `useCallback`으로 `handleEditCancel`을 단일 선언 후 양쪽에 전달.

---

### [P0] InputMode — useEffect 내 document 전역 keydown 리스너

- **위치**: `src/adapters/components/Homeroom/Records/InputMode.tsx:415-473`
- **현재**: `document.addEventListener('keydown', onKey)`를 useEffect 안에서 등록. 의존성 배열이 `[attendanceType, selectedSub, selectedStudents, handleAttendanceTypeClick, handleAttendanceReasonClick, handleSaveClick, periodCount]` — 8개.
- **문제**: `handleSaveClick`은 `useCallback`이지만 deps가 많아 자주 재생성 → 이벤트 리스너 add/remove 사이클이 잦음. 전역 keydown은 다른 탭에 포커스가 가도 동작하는 전역 오염 위험.
- **개선안**: `useKeyboardShortcut` 커스텀 훅으로 추출. 호출 컴포넌트가 마운트된 동안만 활성화 (현재 동작과 동일하나 encapsulation).

---

### [P1] useStudentRecordsStore 전체 구독 패턴

- **위치**: `src/adapters/components/Homeroom/Records/RecordsTab.tsx:27-28`
- **현재**:
```tsx
const { records, loaded, load, viewMode, setViewMode, categories } =
  useStudentRecordsStore();
```
- **문제**: store 전체를 구독하는 패턴은 Zustand에서 store의 다른 키가 변경돼도 이 컴포넌트가 리렌더됨. `records`는 배열이라 매번 새 참조.
- **개선안**: selector로 분리.
```tsx
const records = useStudentRecordsStore((s) => s.records);
const categories = useStudentRecordsStore((s) => s.categories);
const viewMode = useStudentRecordsStore((s) => s.viewMode);
```

---

### [P1] InputMode 3컬럼 리사이즈 — document 마우스 이벤트 의존성 버그

- **위치**: `src/adapters/components/Homeroom/Records/InputMode.tsx:127-153`
- **현재**: `handleMouseMove`가 `leftPct`, `rightPct`를 클로저로 참조. useEffect deps가 `[leftPct, rightPct]`이므로 드래그 중 매 상태 변경마다 리스너 re-attach.
- **문제**: 빠른 드래그 시 리스너 해제-재등록 사이 mouseup 이벤트 유실 가능성. `document.body.style.cursor`와 `userSelect` 정리도 동일 useEffect 내 cleanup이 아닌 `handleMouseUp` 내에만 존재.
- **개선안**: `leftPct`, `rightPct`를 `useRef`로 추적하거나 `useResizablePanels` hook으로 분리.

---

### [P2] InputMode — 15개 이상 useState 단일 스코프

- **위치**: `src/adapters/components/Homeroom/Records/InputMode.tsx:59-100`
- **현재**: 편집 상태 6개, 선택 상태 4개, 배치 등록 상태 5개가 단일 함수 컴포넌트 최상단에 선언.
- **문제**: 연관 상태 간 일관성 유지가 어렵고 `resetForm` 함수에서 직접 9개 setter를 호출.
- **개선안**: `useRecordFormState`, `useBatchDateState`, `useResizePanelState`로 상태 그룹 분리.

---

### [P2] ProgressMode SortHeader — 컴포넌트를 함수 내부에 정의

- **위치**: `src/adapters/components/Homeroom/Records/ProgressMode.tsx:233-243`
- **현재**:
```tsx
const SortHeader = useCallback(({ label, sortId, className }) => (
  <th ...>
```
- **문제**: `useCallback`으로 감쌌지만 JSX를 반환하는 함수는 React 입장에서 컴포넌트가 아니라 렌더 함수. 매 부모 렌더마다 새 컴포넌트 타입으로 인식될 수 있음. `useCallback` 반환값을 `<SortHeader />` 형태로 쓰면 React가 매 렌더에 unmount/remount 처리.
- **개선안**: 파일 상단에 일반 함수 컴포넌트로 정의.
```tsx
// ProgressMode 함수 외부
function SortHeader({ label, sortId, className, sortKey, sortDir, onSort }: SortHeaderProps) {
  ...
}
```

---

### [P3] SearchMode debounce — clearTimeout 의존성

- **위치**: `src/adapters/components/Homeroom/Records/SearchMode.tsx:68-73`
- **현재**: `timerRef.current`를 직접 `clearTimeout` 호출. 컴포넌트 unmount 시 정리가 없음.
- **문제**: 컴포넌트 언마운트 후 타이머 콜백이 `setDebouncedKeyword`를 호출할 경우 React 상태 업데이트 경고.
- **개선안**: `useEffect` cleanup 추가 또는 `useDebouncedValue` hook 사용.

---

## C. 접근성 (WCAG 2.1 AA)

### [P0] HomeroomTabBar — tabpanel 연결 누락

- **위치**: `src/adapters/components/Homeroom/HomeroomTabBar.tsx:19-37`
- **현재**: `role="tablist"` + `role="tab"` + `aria-selected` 구현됨. 그러나 각 `<button role="tab">`에 `aria-controls`와 대응하는 탭패널에 `role="tabpanel"` + `aria-labelledby`가 없음.
- **문제**: WCAG 2.1 SC 4.1.2 (이름·역할·값). 스크린 리더 사용자가 탭과 컨텐츠 패널의 관계를 알 수 없음. 키보드 화살표 네비게이션도 미구현 (WAI-ARIA Tabs Pattern 요구사항).
- **개선안**:
```tsx
// HomeroomTabBar
<button
  role="tab"
  aria-selected={activeTab === tab.id}
  aria-controls={`homeroom-panel-${tab.id}`}
  id={`homeroom-tab-${tab.id}`}
  ...
/>

// HomeroomPage 탭 컨텐츠
<div
  role="tabpanel"
  id={`homeroom-panel-records`}
  aria-labelledby={`homeroom-tab-records`}
  tabIndex={0}
>
  <RecordsTab ... />
</div>
```

---

### [P0] 모달들 전체 — focus-trap 미적용

- **위치**: 아래 모든 인라인 모달 위치
  - `InputMode.tsx:943` (배치 확인)
  - `InputMode.tsx:1242` (메모 확대)
  - `RosterManagementTab.tsx:643`, `719`, `1021`
  - `ConsultationTab.tsx:82`
  - `SurveyTab.tsx:96`
  - `SurveyStudentDetail.tsx:384`, `524`
  - `ConsultationDetail.tsx:88`
- **현재**: `fixed inset-0 z-50 flex items-center justify-center bg-black/50` 패턴으로 구현. focus-trap-react 적용 흔적 없음.
- **문제**: WCAG 2.1 SC 2.1.2 (키보드 트랩 의도적 구현 필요). 모달 오픈 시 포커스가 모달 안에 갇히지 않아 Tab 키로 배경 요소 접근 가능. 기존 `src/adapters/components/common/Modal.tsx`는 focus-trap 적용됨.
- **개선안**: 모든 인라인 모달을 `<Modal>` 공통 컴포넌트로 대체. ConsultationCreateModal은 이미 `<Modal>` 사용 중(`Modal.tsx` import 확인됨) — 나머지 파일들이 사용하지 않는 것.

---

### [P0] PeriodChipGroup — 토글 버튼 aria-pressed 누락

- **위치**: `src/adapters/components/Homeroom/Records/PeriodChipGroup.tsx:103-157`
- **현재**: 교시 선택 버튼들이 `type="button"`만 있고 선택 상태를 CSS 클래스 변경으로만 표현.
- **문제**: WCAG 2.1 SC 4.1.2. 스크린 리더 사용자가 교시 선택 여부를 알 수 없음.
- **개선안**: 각 교시 버튼에 `aria-pressed` 추가.
```tsx
<button
  type="button"
  aria-pressed={selected.has(p)}
  aria-label={`${p}교시 ${selected.has(p) ? '선택됨' : '선택 안됨'}`}
  onClick={() => togglePeriod(p)}
  ...
>
```

---

### [P0] 카테고리 칩 / 서브카테고리 버튼 — 선택 상태 aria 누락

- **위치**: `src/adapters/components/Homeroom/Records/InputMode.tsx:682-749`
- **현재**: 출결 유형 버튼(`결석`/`지각` 등), 사유 버튼들이 선택 시 `✓` 텍스트와 CSS 클래스 변경으로만 상태 표현.
- **문제**: 스크린 리더에서 `✓` 체크마크는 "체크" 또는 유니코드 문자로 읽혀 맥락 없음. `aria-pressed` 또는 radio group 패턴 필요.
- **개선안**:
```tsx
// 출결 유형 (단일 선택) → role="radio" 그룹
<div role="radiogroup" aria-label="출결 유형">
  {ATTENDANCE_TYPES.map((type) => (
    <button
      role="radio"
      aria-checked={attendanceType === type}
      ...
    >
```

---

### [P0] StudentGrid 선택 격자 — 키보드 네비게이션 미구현

- **위치**: `src/adapters/components/Homeroom/shared/StudentGrid.tsx:88-103`
- **현재**: `<div className="grid gap-2" style={{ gridTemplateColumns }}>`로 격자 구성. 각 셀은 `<button>`이나 `<div>`.
- **문제**: WCAG 2.1 SC 2.1.1. 화살표 키로 격자 내 이동, Space/Enter로 선택 불가. WAI-ARIA Grid Pattern 미구현.
- **개선안**: `role="grid"` 컨테이너 + `role="gridcell"` + 방향키 핸들러.
```tsx
<div role="grid" aria-label="학생 선택" ...>
  {/* 행 단위 grouping */}
  <div role="row">
    <div role="gridcell">
      <button aria-selected={isSelected} ...>
```

---

### [P1] window.confirm — 시스템 대화상자 (접근성·UX 모두 문제)

- **위치**: `DefaultRecordListView.tsx:177`, `InputMode.tsx:1202`, `ProgressMode.tsx:311`, `StudentTimelineView.tsx:221`
- **현재**: `if (window.confirm('이 기록을 삭제하시겠습니까?'))` 패턴이 4곳 반복.
- **문제**: `window.confirm`은 OS 네이티브 다이얼로그로 스타일링 불가. Electron 앱에서 메인 프로세스 블로킹 발생 가능. 스크린 리더에서 예고 없이 포커스 이동.
- **개선안**: 공통 `<ConfirmDialog>` 컴포넌트 또는 `useConfirm` hook으로 대체.

---

### [P1] Toast — aria-live polite 적용됨, 그러나 중복 발화 위험

- **위치**: `src/adapters/components/common/Toast.tsx:67`
- **현재**: `role="alert" aria-live="polite"` 적용됨 (양호).
- **문제**: 여러 토스트가 동시 존재 시 스크린 리더가 모두 읽음. 실제로 Homeroom에서 일괄 저장 완료 토스트와 에러 토스트가 동시 표시될 수 있음.
- **개선안**: 토스트 큐에서 최신 1~2개만 `aria-live` 영역에 렌더.

---

### [P1] SurveyTab / ConsultationTab — div[role="button"] 키보드 미지원

- **위치**: `src/adapters/components/Homeroom/Survey/SurveyTab.tsx:183-185`, `src/adapters/components/Homeroom/Consultation/ConsultationTab.tsx:149-151`
- **현재**: `<div role="button" tabIndex={0}>` 사용. `onClick`만 있고 `onKeyDown`(Enter/Space) 핸들러 없음.
- **문제**: WCAG 2.1 SC 2.1.1. 키보드만으로 카드 클릭 불가.
- **개선안**: `<button>` 요소로 교체 (A. 섹션과 동일).

---

### [P2] InlineRecordEditor textarea — aria-label 없음

- **위치**: `src/adapters/components/Homeroom/Records/InlineRecordEditor.tsx:205-213`
- **현재**: `<textarea placeholder="메모 (선택)" ...>` — label 연결 없음.
- **문제**: WCAG 2.1 SC 1.3.1. `placeholder`는 레이블 대체재로 인정 안됨.
- **개선안**: `<label>` 연결 또는 `aria-label="메모 (선택사항)"` 추가.

---

### [P2] StudentTimelineView — time 시맨틱 태그 미사용

- **위치**: `src/adapters/components/Homeroom/Records/StudentTimelineView.tsx:54-260`
- **현재**: 날짜를 `<p>` 또는 `<span>`으로 렌더.
- **문제**: WCAG 2.1 SC 1.3.1. 날짜/시간 정보는 `<time datetime="2026-05-01">` 시맨틱 태그로 표시해야 기계 판독 가능.
- **개선안**: `<time dateTime={record.date}>{formatDateKR(record.date)}</time>`

---

### [P2] ProgressMode 정렬 테이블 — scope 누락

- **위치**: `src/adapters/components/Homeroom/Records/ProgressMode.tsx:459-496`
- **현재**: `<table>` 사용되나 `<th>` 요소에 `scope="col"` 없음.
- **문제**: WCAG 2.1 SC 1.3.1. 스크린 리더가 헤더-데이터 관계를 명확히 연결 못함.
- **개선안**: `<th scope="col">` 추가.

---

### [P2] focus-visible 일관성 — 일부 버튼 focus 링 부재

- **위치**: `src/adapters/components/Homeroom/Records/InputMode.tsx` 전반 버튼들
- **현재**: 대부분의 버튼이 `focus:outline-none focus:ring-1 focus:ring-sp-accent`를 가짐. 그러나 `clearAll` 버튼(`text-xs text-sp-accent`)과 일부 아이콘 버튼은 focus 스타일 없음.
- **문제**: WCAG 2.1 SC 2.4.7.
- **개선안**: `focus-visible:ring-2 focus-visible:ring-sp-accent focus-visible:ring-offset-1` 유틸리티 일관 적용.

---

## D. TypeScript strict 준수

### [P1] RecordEditProps — 선택적 필드와 필수 필드 혼재

- **위치**: `src/adapters/components/Homeroom/Records/recordUtils.ts:15-38`
- **현재**: `editAttendancePeriods?: readonly AttendancePeriodEntry[]`, `setEditAttendancePeriods?: (next: AttendancePeriodEntry[]) => void`, `regularPeriodCount?: number`가 선택적 — 그러나 `StudentTimelineView`에서는 항상 전달됨.
- **문제**: 사용처에서 `!`(non-null assertion) 없이 접근 시 `undefined` 참조 런타임 오류 가능.
- **개선안**: 출결 편집 전용 props를 별도 interface `AttendanceEditProps`로 분리하고 overload 또는 discriminated union 적용.

---

### [P1] InlineRecordEditor — `!text-detail !px-2 !py-0.5` Tailwind important 오용

- **위치**: `src/adapters/components/Homeroom/Records/InlineRecordEditor.tsx:150-154`, `172-173`, `191`
- **현재**: `getSubcategoryChipClass(...) + (compact ? ' !text-detail !px-2 !py-0.5' : '')`
- **문제**: `!important` 접두사를 문자열 연결로 추가. Tailwind JIT가 이를 별도 클래스로 처리하므로 `compact` 모드 재사용 시 specificity 충돌. 타입 안전하지 않은 문자열 조합.
- **개선안**: `compact` prop을 `getSubcategoryChipClass`에 전달하거나 `cva`(class-variance-authority) 패턴 사용.

---

### [P2] ProgressMode statsRows — 반환 타입 추론 의존

- **위치**: `src/adapters/components/Homeroom/Records/ProgressMode.tsx:173-222`
- **현재**: `statsRows`의 타입이 useMemo 반환값 추론에 의존. 복잡한 구조(`{ student, stats, counselingCount, lifeCount, totalRecords, idx, attendanceTotal, neisReported, docSubmitted, methodCounts, subCounts }`)가 명시적 타입 없이 사용.
- **문제**: 필드 추가/변경 시 타입 오류가 늦게 발견됨.
- **개선안**: `interface StatsRow` 명시적 정의.

---

### [P3] RosterManagementTab — previewStudents 인라인 타입

- **위치**: `src/adapters/components/Homeroom/RosterManagementTab.tsx:48`
- **현재**:
```tsx
const [previewStudents, setPreviewStudents] = useState<Array<{
  name: string; studentNumber: number; phone: string;
  parentPhone: string; parentPhoneLabel?: string;
  parentPhone2?: string; parentPhone2Label?: string;
  birthDate?: string; isVacant: boolean
}> | null>(null);
```
- **문제**: 인라인 인터페이스가 useState 타입에 박혀 재사용 불가.
- **개선안**: `interface ImportPreviewStudent` 별도 정의.

---

## E. 책임 분리

### [P1] SearchMode — infrastructure import 직접 사용

- **위치**: `src/adapters/components/Homeroom/Records/SearchMode.tsx:16-18`
- **현재**:
```tsx
/* eslint-disable no-restricted-imports */
import { exportStudentRecordsToExcel } from '@infrastructure/export/ExcelExporter';
/* eslint-enable no-restricted-imports */
```
- **문제**: `adapters/` 레이어가 `infrastructure/`를 직접 import — Clean Architecture 의존성 규칙 위반. `eslint-disable` 주석으로 억지로 우회 중. `RosterManagementTab.tsx:10-11`에도 동일 패턴.
- **개선안**: `adapters/repositories` 또는 DI 컨테이너를 통해 export 기능 주입.

---

### [P1] ConsultationCreateModal — domain 로직이 컴포넌트에 직접 구현

- **위치**: `src/adapters/components/Homeroom/Consultation/ConsultationCreateModal.tsx:145-188`
- **현재**: `computeAvailableRanges`(분 단위 boolean 배열로 가용 슬롯 계산)가 UI 파일에 구현. 이 함수는 순수하며 테스트 가능한 비즈니스 로직.
- **문제**: domain/rules 또는 usecases 레이어에 있어야 할 로직이 adapters UI에 박혀 있음.
- **개선안**: `src/domain/rules/consultationSlotRules.ts`로 이동.

---

### [P2] recordUtils.ts — RECORD_COLOR_MAP 직접 import

- **위치**: `src/adapters/components/Homeroom/Records/recordUtils.ts:1`
- **현재**: `import { RECORD_COLOR_MAP } from '@adapters/stores/useStudentRecordsStore'`
- **문제**: 공유 유틸이 store에 직접 의존. store가 변경되면 모든 유틸 사용처가 영향받음.
- **참조**: A 섹션의 RECORD_COLOR_MAP 위치 이슈와 동일 근본 원인.

---

### [P2] domain rule 직접 호출 vs use case 경유

- **위치**: `src/adapters/components/Homeroom/Records/SearchMode.tsx:7-15`, `ProgressMode.tsx:3-9`
- **현재**: `filterByStudent`, `filterByDateRange`, `getAttendanceStats`, `getWarningStudents` 등 domain rule을 adapters 컴포넌트에서 직접 import.
- **문제**: 일관성 관점에서는 use case 경유가 원칙이나, 이 함수들은 순수 필터/통계 함수(부작용 없음). Clean Architecture의 "adapters → domain" 직접 의존은 허용됨.
- **결론**: 현재 패턴은 의존성 규칙 관점에서 허용. 단, 복잡한 필터 조합(SearchMode 7개 필터 체이닝)은 `GetFilteredRecords` use case로 추출하면 테스트 격리 용이.

---

## F. 라우팅·중복 처리

### [P1] 'homeroom' + 'student-records' 이중 라우트

- **위치**: `src/App.tsx:166-171`
- **현재**:
```tsx
if (page === 'homeroom') {
  return <PinGuard feature="studentRecords"><HomeroomPage /></PinGuard>;
}
if (page === 'student-records') {
  return <PinGuard feature="studentRecords"><HomeroomPage /></PinGuard>;
}
```
- **현재 의도**: `'student-records'`는 구버전 라우트(하위 호환). `RecordsTab.tsx:137`에도 `export { RecordsTab as StudentRecords }` 하위 호환 export 존재.
- **문제**: deprecated alias가 언제까지 유지되는지 주석 없음. 위젯의 `navigateTo: 'homeroom'`과 어떤 라우트가 canonical인지 불명확.
- **개선안**: `'student-records'` 라우트에 deprecated 주석 추가. 중기적으로 제거 계획 명시.

---

### [P2] Sidebar 진입점 일관성

- **위치**: `src/App.tsx:166-171`
- **현재**: 사이드바에서 `'homeroom'`으로 진입, 위젯에서도 `navigateTo: 'homeroom'` 사용 — 일관됨.
- **결론**: canonical route는 `'homeroom'`. `'student-records'`는 deprecated alias.

---

## G. 위젯 시스템 통합

### [P0] widgets/items/StudentRecords.tsx — 4줄 re-export (오해 해소)

- **위치**: `src/widgets/items/StudentRecords.tsx:1-4`
- **현재**:
```tsx
export { DashboardStudentRecords as StudentRecords } from '@adapters/components/Dashboard/DashboardStudentRecords';
```
- **분석**: 위젯 파일 자체는 4줄. 실제 구현은 `DashboardStudentRecords.tsx`(~269줄). 본 페이지 Records 탭 로직을 재구현하지 않음 — 중복 없음.
- **결론**: 미션 설명의 "1959줄 위젯" 수치는 부정확. 현재 구조는 올바름.

---

### [P2] DashboardStudentRecords — 중복 유틸 함수 정의

- **위치**: `src/adapters/components/Dashboard/DashboardStudentRecords.tsx:6-14`
- **현재**: `todayString()`, `formatDateKR()` 함수가 위젯 파일 내부에 정의됨. 동일 함수가 `Records/recordUtils.ts`에도 존재(`todayString`, `formatDateKR`).
- **문제**: 날짜 포맷 로직 2중 관리.
- **개선안**: `recordUtils.ts`의 함수를 export하고 위젯에서 import.

---

## 종합 점수 / Top 10 우선순위 픽스

### 컴포넌트 품질 점수 (100점 기준)

| 평가 항목 | 가중치 | 현재 점수 | 비고 |
|---|---|---|---|
| 컴포넌트 크기 / 단일 책임 | 20 | 8 | InputMode 1299줄, ConsultationCreateModal 1431줄 |
| 재사용성 / 추상화 | 20 | 13 | StudentGrid, ExportModal 분리됨. Modal 미통합 |
| React 패턴 / hook | 20 | 13 | useCallback/useMemo 활용되나 의존성 버그 존재 |
| 접근성 (WCAG 2.1 AA) | 25 | 9 | focus-trap 전무, aria-pressed/role 누락 다수 |
| TypeScript strict | 15 | 12 | any 없음, 인터페이스 분리 미흡 |
| **합계** | 100 | **55** | |

---

### Top 10 우선순위 픽스

| 순위 | 분류 | 파일 | 핵심 작업 |
|---|---|---|---|
| 1 | A·C | `InputMode.tsx:941-1013`, `1241-1292` | 2개 인라인 모달 → `<Modal>` 컴포넌트 추출 |
| 2 | C | `RosterManagementTab.tsx:643,719,1021`, `ConsultationTab.tsx:82`, `SurveyTab.tsx:96`, `SurveyStudentDetail.tsx:384,524`, `ConsultationDetail.tsx:88` | 7개 모달 focus-trap 적용 (`<Modal>` 교체) |
| 3 | C | `HomeroomTabBar.tsx` + `HomeroomPage.tsx` | `aria-controls` + `role="tabpanel"` + 화살표 키 네비게이션 |
| 4 | C | `PeriodChipGroup.tsx:103-157` | 교시 버튼 `aria-pressed` 추가 |
| 5 | C | `InputMode.tsx:682-749` | 출결 유형 칩 `role="radiogroup"` + `aria-checked` |
| 6 | A | `InputMode.tsx` | `StudentSelectorPanel`, `RecordEntryPanel`, `TodayRecordPanel`으로 분해 |
| 7 | C·A | `SurveyTab.tsx:183`, `ConsultationTab.tsx:149` | `<div role="button">` → `<button>` 교체 |
| 8 | B | `RecordsTab.tsx:27-28` | `useStudentRecordsStore` selector 분리 |
| 9 | E | `SearchMode.tsx:16-18`, `RosterManagementTab.tsx:10-11` | infrastructure 직접 import → DI 주입으로 교체 |
| 10 | A | `useStudentRecordsStore.ts:15` | `RECORD_COLOR_MAP` → `recordColorPresenter.ts` 이동 |

---

*분석 범위: Homeroom 탭 전체 28개 파일 직접 검토 (Read/Grep 도구 사용). 추측 없이 코드 근거 기반.*
