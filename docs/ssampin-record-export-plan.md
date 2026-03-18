# 쌤핀 상담 기록 내보내기 기능 — 계획서

> 작성일: 2025-07-14
> 대상 레포: ssampin (React + Zustand + Clean Architecture)

---

## 1. 현황 분석

### 1.1 이미 구현된 것 (발견!)

**`exportStudentRecordsToExcel()`** — `ExcelExporter.ts:320-413`
- 이미 완전한 Excel 내보내기 함수가 존재
- Sheet 1: 전체 기록 (날짜, 학생, 카테고리, 서브카테고리, 상담방법, 내용, 후속조치)
- Sheet 2: 출결 통계 (학생별 결석/지각/조퇴/결과/합계)
- Sheet 3: 학생별 요약 (총기록, 출결, 상담, 생활, 최근기록일)
- `period?: { start: string; end: string }` 파라미터로 기간 필터 지원

**`exportStudentRecordsToHwpx()`** — `HwpxExporter.ts:560-660`
- 한글 문서 내보내기도 이미 구현됨
- 표지 (학교명, 학급명, 담임명, 기간)
- 학생별 상담 기록 테이블 + 출결 요약
- 마지막 페이지: 전체 출결 현황표

**`Export.tsx`** — 통합 내보내기 페이지
- `studentRecords` 항목이 이미 EXPORT_ITEMS에 포함
- Excel과 HWPX 형식 모두 연결 완료
- `useStudentRecordsStore`에서 데이터 로드

**`infrastructure/export/index.ts`** — **여기가 문제!**
- `exportStudentRecordsToExcel`이 **re-export되지 않음**
- `exportStudentRecordsToHwpx`도 **re-export되지 않음**
- `Export.tsx`는 직접 import해서 사용 중 (`/* eslint-disable no-restricted-imports */`)

### 1.2 빠져 있는 것

| 영역 | 상태 | 설명 |
|------|------|------|
| **RecordsTab 내보내기 버튼** | ❌ 없음 | RecordsTab에서 직접 내보내기 불가 |
| **카테고리별 필터 내보내기** | ⚠️ 부분 | Excel은 period만, 카테고리 필터 없음 |
| **학생별 필터 내보내기** | ❌ 없음 | 특정 학생만 선택해서 내보내기 불가 |
| **생활기록부 양식** | ❌ 없음 | 교육부 양식에 맞는 출력 없음 |
| **SearchMode 연동** | ❌ 없음 | 검색 결과를 그대로 내보내기 불가 |
| **index.ts re-export** | ❌ 누락 | barrel export에서 누락 |

### 1.3 도메인 구조

```
StudentRecord {
  id, studentId, category, subcategory,
  content, date, createdAt,
  method?: CounselingMethod,    // phone|face|online|visit|text|other
  followUp?, followUpDate?, followUpDone?
}

RecordCategoryItem {
  id, name, color, subcategories[]
}

Categories: attendance, counseling, life, etc (커스텀 추가 가능)
```

### 1.4 기존 인프라 패턴

- **ExcelJS**: `ExcelExporter.ts`에서 사용. `applyHeaderStyle()`, `applyCellStyle()` 유틸 공유
- **HwpxDocument**: `@ubermensch1218/hwpxcore` 라이브러리. `createDoc()`, `saveWithSectionProps()` 패턴
- **파일 저장**: Electron `showSaveDialog` + `writeFile` / 브라우저 Blob 다운로드
- **도메인 규칙**: `studentRecordRules.ts`에 `filterByStudent`, `filterByCategory`, `filterByDateRange`, `sortByDateDesc` 등 이미 구현

---

## 2. 구현 계획

### Phase 1: RecordsTab에 내보내기 버튼 추가 (핵심 — 최소 변경)

**목표**: 기존 `exportStudentRecordsToExcel()`을 RecordsTab에서 호출 가능하게

**변경 파일:**
1. `RecordsTab.tsx` — 내보내기 버튼 + 모달 트리거
2. `RecordsExportModal.tsx` (신규) — 내보내기 옵션 선택 UI

**UI 설계:**
```
[✏️ 입력] [📊 통계] [🔍 조회]     [카테고리 관리] [📥 내보내기]
```
- "내보내기" 버튼을 카테고리 관리 버튼 옆에 배치
- 클릭 시 RecordsExportModal 표시

**RecordsExportModal 옵션:**
- 형식: Excel / HWPX
- 기간: 전체 / 이번 학기 / 이번 달 / 직접 입력
- 포함 카테고리: 전체 / 개별 선택 (출결, 상담, 생활, 기타)
- 학생: 전체 / 개별 선택

### Phase 2: 필터 기반 내보내기 (카테고리 + 학생 필터)

**목표**: `exportStudentRecordsToExcel()`에 카테고리/학생 필터 파라미터 추가

**변경 파일:**
1. `ExcelExporter.ts` — `exportStudentRecordsToExcel()` 시그니처 확장
2. `HwpxExporter.ts` — `exportStudentRecordsToHwpx()` 시그니처 확장

**파라미터 확장:**
```typescript
interface RecordExportOptions {
  period?: { start: string; end: string };
  categoryIds?: string[];      // 신규: 선택된 카테고리만
  studentIds?: string[];       // 신규: 선택된 학생만
}
```

### Phase 3: SearchMode 검색 결과 내보내기

**목표**: SearchMode에서 현재 필터링된 결과를 바로 내보내기

**변경 파일:**
1. `SearchMode.tsx` — 결과 수 옆에 "내보내기" 버튼 추가
2. `ExportModal.tsx` (Homeroom/shared) 재사용 또는 ExcelExporter 직접 호출

**워크플로우:**
```
조회 탭 → 필터 적용 → [📥 현재 결과 내보내기] → Excel 다운로드
```

### Phase 4: 생활기록부 양식 (교사 요청 기반)

**목표**: 학교생활기록부 양식에 맞는 학생별 시트 Excel 출력

**신규 함수:**
```typescript
// ExcelExporter.ts
export async function exportRecordsForSchoolReport(
  records: readonly StudentRecord[],
  students: readonly Student[],
  categories: readonly RecordCategoryItem[],
  options?: RecordExportOptions,
): Promise<ArrayBuffer>
```

**시트 구조:**
- 학생별 개별 시트 (시트명: "01_홍길동")
- 생활기록부 양식 헤더 (학년/반/번호/이름)
- 카테고리별 그룹핑 (출결 → 상담 → 생활)
- 날짜순 정렬
- 하단에 출결 통계 요약

---

## 3. 우선순위 및 일정

| Phase | 난이도 | 영향도 | 비고 |
|-------|--------|--------|------|
| Phase 1 | ★☆☆ | ★★★ | **즉시 해결**. 기존 코드 활용, UI만 추가 |
| Phase 2 | ★★☆ | ★★★ | 필터 파라미터 추가. 기존 함수 확장 |
| Phase 3 | ★☆☆ | ★★☆ | SearchMode에 버튼 1개 + 기존 ExportModal 재사용 |
| Phase 4 | ★★★ | ★★☆ | 생활기록부 양식 리서치 필요. 학교마다 다를 수 있음 |

**추천 순서: Phase 1 → Phase 2 → Phase 3 → Phase 4**

---

## 4. 기술 세부사항

### 4.1 index.ts 수정 (즉시)

```typescript
// src/infrastructure/export/index.ts 에 추가
export { exportStudentRecordsToExcel } from './ExcelExporter';
export { exportStudentRecordsToHwpx } from './HwpxExporter';
```

### 4.2 RecordsExportModal 설계

```
┌─────────────────────────────────────┐
│  📥 상담 기록 내보내기               │
├─────────────────────────────────────┤
│                                     │
│  형식:  [Excel ▼]  [HWPX]          │
│                                     │
│  기간:  [전체] [이번 학기] [직접 입력]│
│         2025-03-01 ~ 2025-07-14     │
│                                     │
│  카테고리:                          │
│    ☑ 출결  ☑ 상담  ☑ 생활  ☑ 기타  │
│                                     │
│  학생:  [전체] / [개별 선택 ▼]      │
│                                     │
│  미리보기: 152건의 기록              │
│                                     │
├─────────────────────────────────────┤
│               [취소]  [내보내기]     │
└─────────────────────────────────────┘
```

### 4.3 파일 다운로드 패턴 (기존 Export.tsx에서 복사)

```typescript
// Electron
if (window.electronAPI) {
  const filePath = await window.electronAPI.showSaveDialog({ ... });
  if (filePath) {
    await window.electronAPI.writeFile(filePath, buffer);
  }
}
// 브라우저
else {
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName; a.click();
  URL.revokeObjectURL(url);
}
```

### 4.4 기존 규칙 함수 활용

```typescript
import {
  filterByStudent,
  filterByCategory,
  filterByDateRange,
  sortByDateDesc,
} from '@domain/rules/studentRecordRules';
```

---

## 5. 리스크 및 고려사항

1. **대용량 데이터**: 1년치 30명 × 일일 1건 = ~6,000건. ExcelJS는 문제 없음
2. **카테고리 ID vs 이름**: 사용자 정의 카테고리는 UUID. categoryMap 변환 필요
3. **HWPX 의존성**: `@ubermensch1218/hwpxcore` + `Skeleton.hwpx` 필요. Electron에서만 안정적
4. **생활기록부 양식**: 학교/시도교육청마다 양식이 다름. 범용적 설계 필요
5. **export/index.ts 누락**: 기존 코드에서 `exportStudentRecordsToExcel`가 barrel export 안 됨 — Export.tsx가 직접 import로 우회 중
