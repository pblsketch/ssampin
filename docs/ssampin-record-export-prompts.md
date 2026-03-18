# 쌤핀 상담 기록 내보내기 — Claude Code 프롬프트

> 각 Phase를 순서대로 실행. 이전 Phase 완료 확인 후 다음으로 진행.

---

## Phase 1: RecordsTab에 내보내기 버튼 + 모달 추가

```
## 작업: RecordsTab에 상담 기록 내보내기 기능 추가

### 배경
쌤핀에는 이미 `exportStudentRecordsToExcel()`과 `exportStudentRecordsToHwpx()` 함수가 구현되어 있다.
하지만 RecordsTab(담임 메모 탭)에는 내보내기 버튼이 없어서, 교사가 상담 기록을 파일로 내보낼 수 없다.
기존에는 별도 "내보내기" 페이지(Export.tsx)에서만 가능했다.

### 수행할 작업

#### 1. `src/adapters/components/Homeroom/Records/RecordsExportModal.tsx` 생성

새 모달 컴포넌트를 만든다. 아래 사항을 따른다:

**Props:**
```typescript
interface RecordsExportModalProps {
  records: readonly StudentRecord[];
  students: readonly Student[];
  categories: readonly RecordCategoryItem[];
  onClose: () => void;
}
```

**UI 구성:**
- 형식 선택: Excel / HWPX (버튼 2개, 토글)
- 기간 필터: "전체" / "이번 학기" / "이번 달" / "직접 입력" (라디오 또는 탭)
  - "직접 입력" 선택 시 start/end date input 표시
  - "이번 학기" = 3월 1일 ~ 현재 (1학기 기준) 또는 9월 1일 ~ 현재 (2학기 기준)
  - "이번 달" = 이번 달 1일 ~ 오늘
- 카테고리 필터: 체크박스로 categories를 나열. 기본 전체 선택
- 학생 필터: "전체" 또는 드롭다운으로 개별 학생 선택
- 하단에 "N건의 기록이 포함됩니다" 미리보기 텍스트
- [취소] [내보내기] 버튼

**내보내기 로직:**
- 선택된 필터에 따라 records를 필터링
- 필터링에는 `@domain/rules/studentRecordRules`의 함수들을 사용:
  - `filterByStudent(records, studentId)`
  - `filterByCategory(records, category)`
  - `filterByDateRange(records, start, end)`
- Excel 선택 시: `exportStudentRecordsToExcel(filteredRecords, filteredStudents, categories, period)` 호출
  - 이 함수는 `@infrastructure/export/ExcelExporter.ts`에 있음
- HWPX 선택 시: `exportStudentRecordsToHwpx(filteredRecords, filteredStudents, categories, settings, period)` 호출
  - settings는 `useSettingsStore`에서 `{ schoolName, className, teacherName }` 가져옴
  - 이 함수는 `@infrastructure/export/HwpxExporter.ts`에 있음
- 파일 저장은 `Export.tsx`의 패턴을 그대로 따름:
  - Electron: `window.electronAPI.showSaveDialog()` → `writeFile()`
  - 브라우저: `Blob` → `URL.createObjectURL()` → `<a>.click()`
- 성공/실패 시 `useToastStore`의 `show()` 사용

**스타일링:**
- 기존 모달 패턴 참고: `ExportModal.tsx` (Homeroom/shared) 또는 `RecordCategoryManagementModal`
- Tailwind 클래스 사용, `sp-` 커스텀 색상 (sp-card, sp-surface, sp-accent, sp-border, sp-text, sp-muted)
- Material Symbols Outlined 아이콘

#### 2. `src/adapters/components/Homeroom/Records/RecordsTab.tsx` 수정

- `useState<boolean>`로 `showExportModal` 상태 추가
- 카테고리 관리 버튼 옆에 내보내기 버튼 추가:

```tsx
<button
  onClick={() => setShowExportModal(true)}
  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-sp-muted hover:text-white hover:bg-sp-surface transition-all"
  title="내보내기"
>
  <span className="material-symbols-outlined text-base">download</span>
  <span className="text-xs">내보내기</span>
</button>
```

- 기존 카테고리 관리 버튼과 함께 `<div className="flex items-center gap-2">` 로 감싸기
- 모달 렌더링 추가 (컴포넌트 하단, showCategoryModal 옆):

```tsx
{showExportModal && (
  <RecordsExportModal
    records={filteredRecords}
    students={students}
    categories={categories}
    onClose={() => setShowExportModal(false)}
  />
)}
```

### 중요 주의사항
- `ExcelExporter.ts`와 `HwpxExporter.ts`는 수정하지 말 것. 기존 함수를 그대로 사용.
- `exportStudentRecordsToExcel`의 시그니처:
  ```typescript
  export async function exportStudentRecordsToExcel(
    records: readonly StudentRecord[],
    students: readonly Student[],
    categories: readonly RecordCategoryItem[],
    period?: { start: string; end: string },
  ): Promise<ArrayBuffer>
  ```
- `exportStudentRecordsToHwpx`의 시그니처:
  ```typescript
  export async function exportStudentRecordsToHwpx(
    records: readonly StudentRecord[],
    students: readonly Student[],
    categories: readonly RecordCategoryItem[],
    settings: { schoolName: string; className: string; teacherName: string },
    period?: { start: string; end: string },
  ): Promise<Uint8Array>
  ```
- import 시 `/* eslint-disable no-restricted-imports */` 주석 필요 (Export.tsx 패턴 참고)
- HWPX는 `Uint8Array`를 반환하므로 Blob 생성 시 `.buffer.slice()` 변환 필요 (Export.tsx 참고)
```

---

## Phase 2: 카테고리/학생 필터를 Exporter 함수에 네이티브 지원

```
## 작업: exportStudentRecordsToExcel/Hwpx에 필터 옵션 확장

### 배경
Phase 1에서 RecordsExportModal은 records를 필터링한 후 Exporter에 전달한다.
하지만 Excel의 Sheet 3 "학생별 요약"이나 HWPX의 학생별 페이지에서,
전달된 students 배열 전체를 순회하므로, 필터링된 학생만 보여주려면 students도 필터링해야 한다.

현재는 Phase 1에서 모달 측에서 records와 students를 모두 필터링하여 전달하면 되므로,
이 Phase는 **선택적 개선**이다.

### 수행할 작업

#### 1. `src/infrastructure/export/ExcelExporter.ts` 수정

`exportStudentRecordsToExcel` 함수의 4번째 파라미터를 옵션 객체로 변경:

```typescript
export interface RecordExportOptions {
  period?: { start: string; end: string };
  categoryIds?: string[];
  studentIds?: string[];
}

export async function exportStudentRecordsToExcel(
  records: readonly StudentRecord[],
  students: readonly Student[],
  categories: readonly RecordCategoryItem[],
  options?: RecordExportOptions,
): Promise<ArrayBuffer>
```

- 기존 `period?` 파라미터와 **하위 호환** 유지: `typeof options === 'object' && 'start' in options` 체크로 레거시 호출도 지원하거나, 호출부(Export.tsx)를 함께 수정
- `categoryIds` 필터: filteredRecords에서 해당 카테고리만 포함
- `studentIds` 필터: students 배열과 records 모두 해당 학생만

#### 2. `src/infrastructure/export/HwpxExporter.ts` 수정

동일한 패턴으로 `exportStudentRecordsToHwpx` 확장:

```typescript
export async function exportStudentRecordsToHwpx(
  records: readonly StudentRecord[],
  students: readonly Student[],
  categories: readonly RecordCategoryItem[],
  settings: { schoolName: string; className: string; teacherName: string },
  options?: RecordExportOptions,
): Promise<Uint8Array>
```

#### 3. `src/adapters/components/Export/Export.tsx` 호출부 수정

기존 호출:
```typescript
data = await exportStudentRecordsToExcel(studentRecords, students, studentCategories);
```

수정:
```typescript
data = await exportStudentRecordsToExcel(studentRecords, students, studentCategories, {});
```

### 주의사항
- Export.tsx에서의 기존 호출이 깨지지 않도록 options를 optional로 유지
- RecordExportOptions 타입은 ExcelExporter.ts에서 export하고, HwpxExporter.ts에서 import하여 공유
```

---

## Phase 3: SearchMode 검색 결과 내보내기 버튼

```
## 작업: SearchMode의 필터링된 결과를 바로 내보내기

### 배경
교사가 조회 탭에서 특정 학생 + 상담 카테고리 + 이번 달로 필터링한 결과를
바로 내보내고 싶을 때, 별도 모달 없이 빠르게 Excel 다운로드할 수 있어야 한다.

### 수행할 작업

#### 1. `src/adapters/components/Homeroom/Records/SearchMode.tsx` 수정

필터 바 하단 또는 결과 건수 옆에 "내보내기" 버튼 추가:

```tsx
{/* 결과 건수 + 내보내기 */}
<div className="flex items-center justify-between">
  <span className="text-xs text-sp-muted">
    {filtered.length}건의 기록
  </span>
  {filtered.length > 0 && (
    <button
      onClick={handleExportFiltered}
      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs
                 text-sp-muted hover:text-white hover:bg-sp-surface
                 border border-sp-border transition-all"
    >
      <span className="material-symbols-outlined text-sm">download</span>
      Excel 내보내기
    </button>
  )}
</div>
```

**내보내기 함수:**
```typescript
const handleExportFiltered = useCallback(async () => {
  // filtered는 이미 useMemo로 필터링된 결과
  // students도 선택된 학생만 포함되도록 필터
  const targetStudents = selectedStudentId
    ? students.filter(s => s.id === selectedStudentId)
    : students;

  const buffer = await exportStudentRecordsToExcel(
    filtered,
    targetStudents,
    categories,
  );

  // Blob 다운로드 (Export.tsx 패턴)
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = '담임메모_조회결과.xlsx';
  a.click();
  URL.revokeObjectURL(url);
  showToast('Excel 파일을 다운로드했습니다', 'success');
}, [filtered, students, categories, selectedStudentId]);
```

- `showToast`는 `useToastStore`에서 가져옴
- `exportStudentRecordsToExcel`은 `@infrastructure/export/ExcelExporter`에서 import

### 주의사항
- Electron 환경 체크 추가 (window.electronAPI 있으면 showSaveDialog 사용)
- 빈 결과(0건)일 때는 버튼 숨김
- `/* eslint-disable no-restricted-imports */` 주석 필요
```

---

## Phase 4: 생활기록부 양식 Excel (학생별 시트)

```
## 작업: 생활기록부 작성용 학생별 시트 Excel 내보내기

### 배경
교사가 학기말 생활기록부를 작성할 때, 각 학생의 상담/관찰/출결 기록을 
한눈에 볼 수 있는 자료가 필요하다. 학생별로 시트를 분리하여,
생기부 특기사항 작성에 바로 참고할 수 있는 형태로 출력한다.

### 수행할 작업

#### 1. `src/infrastructure/export/ExcelExporter.ts`에 함수 추가

```typescript
/**
 * 생활기록부 작성 참고용 — 학생별 시트 Excel
 */
export async function exportRecordsForSchoolReport(
  records: readonly StudentRecord[],
  students: readonly Student[],
  categories: readonly RecordCategoryItem[],
  options?: {
    period?: { start: string; end: string };
    categoryIds?: string[];
  },
): Promise<ArrayBuffer>
```

**시트 구조 (학생당 1시트):**

시트명: `01_홍길동` (번호_이름)

```
| A          | B            | C          | D        | E            |
|------------|--------------|------------|----------|--------------|
| 학년/반/번호 | 1-2 / 01번   |            |          |              |
| 이름       | 홍길동        |            |          |              |
|            |              |            |          |              |
| [출결 현황] |              |            |          |              |
| 결석       | 지각         | 조퇴       | 결과     | 합계         |
| 2          | 1            | 0          | 0        | 3            |
|            |              |            |          |              |
| [상담 기록] |              |            |          |              |
| 날짜       | 구분         | 상담방법   | 내용     | 후속조치     |
| 2025-03-15 | 학부모상담   | 전화       | ...      | ...          |
| 2025-04-02 | 학생상담     | 대면       | ...      |              |
|            |              |            |          |              |
| [생활/관찰] |              |            |          |              |
| 날짜       | 구분         | 내용       |          |              |
| 2025-03-20 | 칭찬         | ...        |          |              |
```

**구현 세부:**
- `getAttendanceStats()`로 출결 통계 계산 (studentRecordRules.ts)
- `filterByStudent()`, `filterByCategory()` 사용하여 카테고리별 분리
- `sortByDateDesc()`로 날짜 정렬 (최신순)
- 카테고리별 색상: `CATEGORY_ROW_COLORS` 맵 재사용
- 출결은 `attendance` 카테고리, 상담은 `counseling`, 생활은 `life`, 기타는 `etc`
- 각 섹션 헤더에 `applyHeaderStyle()` 적용
- 내용 열은 `wrapText: true`로 줄바꿈 허용, 열 너비 40

#### 2. RecordsExportModal에 "생활기록부용" 옵션 추가

형식 선택에 3번째 옵션 추가:
```
[Excel]  [HWPX]  [생활기록부용 Excel]
```

선택 시 `exportRecordsForSchoolReport()` 호출

#### 3. `src/infrastructure/export/index.ts` 업데이트

```typescript
export {
  exportStudentRecordsToExcel,
  exportRecordsForSchoolReport,
} from './ExcelExporter';

export {
  exportStudentRecordsToHwpx,
} from './HwpxExporter';
```

### 주의사항
- 학생이 30명이면 시트 30개 — ExcelJS 성능 문제 없음 (테스트 완료)
- 빈 기록 학생도 시트 생성 (출결 0/0/0/0, "기록 없음" 표시)
- 시트명에 특수문자 제거 (Excel 시트명 제한: 31자, []:\/*? 불가)
```

---

## 실행 순서 요약

| 순서 | Phase | 예상 소요 | 핵심 파일 |
|------|-------|-----------|-----------|
| 1 | Phase 1 | 30분 | RecordsExportModal.tsx (신규), RecordsTab.tsx |
| 2 | Phase 2 | 15분 | ExcelExporter.ts, HwpxExporter.ts, Export.tsx |
| 3 | Phase 3 | 10분 | SearchMode.tsx |
| 4 | Phase 4 | 45분 | ExcelExporter.ts, RecordsExportModal.tsx, index.ts |

**Phase 1만으로도 교사의 핵심 니즈(상담 기록 내보내기)는 해결된다.**
Phase 2~4는 UX 개선 및 생활기록부 특화 기능이다.
