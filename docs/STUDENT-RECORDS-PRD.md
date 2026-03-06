# 담임메모 강화 PRD (GitHub 최신 코드 기준)

> 작성일: 2026-03-06
> 기준: github.com/pblsketch/ssampin main 브랜치
> 참고: weenote.kr (위노트) 벤치마크, AI 기능 제외

---

## 📌 현재 구현 상태

### 아키텍처 (클린 아키텍처 4레이어 적용됨)

```
src/
├── domain/              # 엔티티, 규칙, 값객체, 포트
│   ├── entities/StudentRecord.ts, Student.ts
│   ├── rules/studentRecordRules.ts
│   ├── valueObjects/RecordCategory.ts
│   └── repositories/IStudentRecordsRepository.ts
├── usecases/            # 비즈니스 로직
│   └── studentRecords/ManageStudentRecords.ts
├── adapters/            # UI, 스토어, 리포지토리 구현
│   ├── components/StudentRecords/
│   │   ├── StudentRecords.tsx (메인 — 입력/통계/조회 3모드)
│   │   └── RecordCategoryManagementModal.tsx
│   ├── components/Dashboard/DashboardStudentRecords.tsx
│   ├── stores/useStudentRecordsStore.ts, useStudentStore.ts
│   └── repositories/JsonStudentRecordsRepository.ts
├── infrastructure/      # 외부 시스템 어댑터
│   └── export/HwpxExporter.ts, ExcelExporter.ts
└── widgets/items/       # 위젯
    ├── StudentRecords.tsx (DashboardStudentRecords 재사용)
    └── Attendance.tsx (placeholder — TODO)
```

### 구현된 기능

| 기능 | 상태 | 설명 |
|------|------|------|
| **입력 모드** | ✅ 완성 | 학생 다중 선택 + 카테고리 2단 선택 + 메모 입력 |
| **통계 모드** | ✅ 완성 | 이번 주/이번 달/직접 설정/전체 기간별 출결 통계 테이블 |
| **조회 모드** | ✅ 완성 | 학생별/카테고리별 필터 + 날짜별 그룹핑 타임라인 + 수정/삭제 |
| **카테고리 관리** | ✅ 완성 | 출결/상담/생활/기타 기본 + 사용자 정의 추가/삭제 |
| **대시보드 위젯** | ✅ 완성 | 오늘 기록 미리보기 (최근 3건) |
| **출결 2단 선택** | ✅ 완성 | 유형(결석/지각/조퇴/결과) → 사유(질병/인정/기타/생리통/미인정) |
| **출결 위젯** | ⚠️ placeholder | "준비 중입니다" 텍스트만 |

### 현재 데이터 스키마

```typescript
// StudentRecord
interface StudentRecord {
  id: string;
  studentId: string;
  category: string;         // 'attendance' | 'counseling' | 'life' | 'etc'
  subcategory: string;      // '결석 (질병)', '학부모상담' 등
  content: string;          // 메모 내용
  date: string;             // "2026-03-06"
  createdAt: string;        // ISO timestamp
}

// Student
interface Student {
  id: string;               // 's01' ~ 's35'
  name: string;
  studentNumber?: number;
  phone?: string;
  parentPhone?: string;
  isVacant?: boolean;       // 결번 여부
}

// RecordCategoryItem
interface RecordCategoryItem {
  id: string;
  name: string;
  color: string;
  subcategories: readonly string[];
}
```

### 현재 비즈니스 규칙 (studentRecordRules.ts)

- `filterByStudent()` — 학생별 필터
- `filterByCategory()` — 카테고리별 필터
- `filterBySubcategory()` — 서브카테고리별 필터
- `filterByDateRange()` — 기간별 필터
- `getAttendanceStats()` — 출결 통계 (결석/지각/조퇴/결과/칭찬)
- `sortByDateDesc()` — 날짜 내림차순 정렬

---

## 🎯 강화 기능 목록

### 🔴 P0 — 피드백 대응 + 핵심 개선

#### 1. 날짜 선택 기능 (입력 모드)
> 피드백: "출석부 기능에서 날짜를 변경할 수 있으면 좋겠습니다"

**현재 문제**: `InputMode.handleSave()`에서 `todayString()`으로 항상 오늘만 기록
**해결**: 날짜 네비게이터 추가

```
┌──────────────────────────────────────┐
│  ◀  2026년 3월 6일 (목)  ▶  📅 오늘 │
└──────────────────────────────────────┘
```

| 수정 파일 | 변경 내용 |
|----------|----------|
| `StudentRecords.tsx` | `selectedDate` 상태 추가, InputMode에 prop 전달 |
| 신규: `DateNavigator.tsx` | ◀▶ 이동, 캘린더 팝업, 오늘 버튼 |

**난이도**: 하 | **예상**: 2~3시간

#### 2. 해당 날짜 기록 미리보기 (입력 모드)

입력 시 선택된 날짜에 이미 입력된 기록을 하단에 표시 → 중복 방지 + 맥락 확인

```
┌──────────────────────────────────────┐
│  📋 3월 4일 기록 (3건)               │
│  🔴 결석(병결) — 박민수              │
│  🟡 지각(질병) — 이지훈              │
│  🔵 학생상담 — 김서연 "교우관계..."   │
└──────────────────────────────────────┘
```

| 수정 파일 | 변경 내용 |
|----------|----------|
| `StudentRecords.tsx` → `InputMode` | 기록 미리보기 영역 추가 |

**난이도**: 하 | **예상**: 1~2시간

#### 3. 상담 방법 필드

현재 `content`(메모)에 자유 기술 → 상담 방법을 별도 필드로 분리

```typescript
// StudentRecord 확장
interface StudentRecord {
  // 기존 필드 +
  method?: 'phone' | 'face' | 'online' | 'visit' | 'text' | 'other';
}
```

UI: 카테고리가 `counseling`일 때 메모 위에 상담 방법 칩 표시

```
📞 전화 | 🤝 대면 | 💻 온라인 | 🏠 가정방문 | 💬 문자
```

| 수정 파일 | 변경 내용 |
|----------|----------|
| `domain/entities/StudentRecord.ts` | `method?` 필드 추가 |
| `StudentRecords.tsx` → `InputMode` | 상담 방법 선택 UI |
| `StudentRecords.tsx` → `SearchMode` | 조회 시 방법 표시 |
| `useStudentRecordsStore.ts` | addRecord에 method 파라미터 |
| `ManageStudentRecords.ts` | add에 method 전달 |

**난이도**: 하 | **예상**: 2~3시간

---

### 🟡 P1 — 실용 강화

#### 4. 학생별 타임라인 뷰

조회 모드에서 학생 선택 시 → 해당 학생의 전체 이력을 시간순 타임라인으로 표시

```
👧 김서연 (7번)
──────────────────
03/04  🔵 학부모상담 (전화) "어머니 — 교우관계 고민"
02/28  🔴 결석(미인정) "연락 안 됨"
02/15  🟢 칭찬 "발표 자신감 향상"
02/10  🔵 학생상담 (대면) "친구 갈등 해결"
──────────────────
📊 총 4건 | 결석 1 | 상담 2 | 칭찬 1
```

**현재 상태**: 조회 모드에서 학생 필터 + 날짜별 그룹핑은 이미 있음 → UI를 타임라인 형태로 리디자인

| 수정 파일 | 변경 내용 |
|----------|----------|
| `StudentRecords.tsx` → `SearchMode` | 학생 선택 시 타임라인 뷰 전환 |

**난이도**: 중 | **예상**: 3~4시간

#### 5. 기록 템플릿

자주 사용하는 기록 유형별 입력 양식

```typescript
interface RecordTemplate {
  id: string;
  name: string;            // "학부모 전화 상담"
  category: string;        // 'counseling'
  subcategory: string;     // '학부모상담'
  method?: string;         // 'phone'
  contentTemplate: string; // "상담 내용:\n합의 사항:\n후속 조치:"
}
```

기본 제공 템플릿:
- 학부모 전화 상담
- 학생 1:1 상담
- 생활지도 기록
- 출결 특이사항

| 파일 | 설명 |
|------|------|
| 신규: `domain/entities/RecordTemplate.ts` | 템플릿 엔티티 |
| 신규: `domain/valueObjects/DefaultTemplates.ts` | 기본 템플릿 |
| `StudentRecords.tsx` → `InputMode` | 템플릿 선택 드롭다운 |

**난이도**: 중 | **예상**: 3~4시간

#### 6. 후속 조치 필드 + 알림 연동

```typescript
interface StudentRecord {
  // 기존 +
  followUp?: string;           // "다음 주 월요일 재상담"
  followUpDate?: string;       // "2026-03-10"
  followUpDone?: boolean;      // 완료 여부
}
```

- 후속 조치 미완료 건 → 대시보드 위젯에 알림 표시
- 일정(Schedule)에 자동 등록 옵션

| 수정 파일 | 변경 내용 |
|----------|----------|
| `domain/entities/StudentRecord.ts` | followUp 필드 추가 |
| `StudentRecords.tsx` → `InputMode` | 후속 조치 입력 영역 |
| `DashboardStudentRecords.tsx` | 미완료 후속 조치 알림 |
| `useStudentRecordsStore.ts` | 후속 조치 필터/완료 토글 |

**난이도**: 중 | **예상**: 4~5시간

#### 7. 검색 강화

현재: 학생 필터 + 카테고리 필터 + 기간 필터
추가:
- **키워드 검색** — content 필드에서 텍스트 검색
- **서브카테고리 필터** — 카테고리 선택 후 세부 항목 필터
- **복합 필터** — AND 조건 조합

| 수정 파일 | 변경 내용 |
|----------|----------|
| `StudentRecords.tsx` → `SearchMode` | 키워드 검색 입력 + 서브카테고리 드롭다운 |
| `domain/rules/studentRecordRules.ts` | `filterByKeyword()` 추가 |

**난이도**: 중 | **예상**: 2~3시간

#### 8. 통계 강화

현재: 학생별 출결(결석/지각/조퇴/결과/칭찬) 테이블
추가:
- **카테고리별 전체 통계** 요약 카드 (상단)
- **월별 추이 차트** (선택 사항 — 라이브러리 필요)
- **결석 주의 학생** 하이라이트 (결석 3회 이상)

```
┌─────────────────────────────────────────┐
│  📊 이번 달 요약                         │
│  총 기록 47건 | 출결 15 | 상담 12 | 생활 8 | 기타 12 │
│                                         │
│  ⚠️ 주의 학생: 박민수(결석3), 이지훈(지각4)│
└─────────────────────────────────────────┘
```

| 수정 파일 | 변경 내용 |
|----------|----------|
| `StudentRecords.tsx` → `ProgressMode` | 요약 카드 + 주의 학생 영역 |
| `domain/rules/studentRecordRules.ts` | `getCategorySummary()`, `getWarningStudents()` 추가 |

**난이도**: 중 | **예상**: 3~4시간

---

### 🟢 P2 — 출력/내보내기

#### 9. 담임메모 내보내기 (Excel)

학생별 기록을 Excel로 내보내기:
- 시트1: 전체 기록 (날짜, 학생, 카테고리, 내용)
- 시트2: 출결 통계 (학생별 결석/지각/조퇴 집계)
- 시트3: 학생별 타임라인

| 파일 | 설명 |
|------|------|
| `infrastructure/export/ExcelExporter.ts` | `exportStudentRecordsToExcel()` 추가 |
| `adapters/components/Export/Export.tsx` | 내보내기 항목에 '담임메모' 추가 |

**난이도**: 중 | **예상**: 4~5시간

#### 10. 담임메모 내보내기 (HWPX)

나이스 업로드용 / 생활기록부 참고용 한글 문서:
- 학생별 상담 기록 요약
- 출결 현황표
- 비전자문서 색인목록 (감사 대비)

| 파일 | 설명 |
|------|------|
| `infrastructure/export/HwpxExporter.ts` | `exportStudentRecordsToHwpx()` 추가 |

**난이도**: 상 | **예상**: 5~6시간

#### 11. 위젯 통합 (출결 위젯 → 담임메모 위젯 흡수)

출결 위젯(Attendance.tsx)을 삭제하고, 담임메모 위젯에 탭 UI를 추가하여 통합.

```
┌─ 담임메모 위젯 ─────────────┐
│ 📋 오늘 기록 (5건)          │
│ [출결] [상담] [생활] [전체]  │
│                             │
│ 출결 탭:                    │
│ 출석 28 / 결석 1 / 지각 1    │
│ ⚠️ 박민수 결석(병결)         │
│                             │
│ 전체 탭:                    │
│ 🔴 결석(병결) — 박민수       │
│ 🔵 학생상담 — 김서연         │
│ 🟢 칭찬 — 정하은             │
└─────────────────────────────┘
```

| 수정 파일 | 변경 내용 |
|----------|----------|
| `adapters/components/Dashboard/DashboardStudentRecords.tsx` | 탭 UI 추가, 출결 탭에 통계 표시 |
| `widgets/items/Attendance.tsx` | **삭제** |
| `widgets/registry.ts` | Attendance 위젯 등록 제거 |

**난이도**: 중 | **예상**: 3시간

---

## 📊 전체 일정 요약

### Phase 1 — MVP (P0) — 약 1주

| # | 기능 | 시간 |
|---|------|------|
| 1 | 날짜 선택 기능 | 2~3h |
| 2 | 해당 날짜 기록 미리보기 | 1~2h |
| 3 | 상담 방법 필드 | 2~3h |
| | **소계** | **5~8h** |

### Phase 2 — 실용 강화 (P1) — 약 2~3주

| # | 기능 | 시간 |
|---|------|------|
| 4 | 학생별 타임라인 뷰 | 3~4h |
| 5 | 기록 템플릿 | 3~4h |
| 6 | 후속 조치 + 알림 | 4~5h |
| 7 | 검색 강화 | 2~3h |
| 8 | 통계 강화 | 3~4h |
| | **소계** | **15~20h** |

### Phase 3 — 출력 (P2) — 약 1~2주

| # | 기능 | 시간 |
|---|------|------|
| 9 | Excel 내보내기 | 4~5h |
| 10 | HWPX 내보내기 | 5~6h |
| 11 | 출결 위젯 활성화 | 2h |
| | **소계** | **11~13h** |

### 전체: 약 31~41시간 (4~5주)

---

## 📁 파일 변경 총정리

### 신규 생성 (6개)

| 파일 | 설명 |
|------|------|
| `adapters/components/StudentRecords/DateNavigator.tsx` | 날짜 네비게이터 |
| `domain/entities/RecordTemplate.ts` | 기록 템플릿 엔티티 |
| `domain/valueObjects/DefaultTemplates.ts` | 기본 템플릿 정의 |
| `domain/rules/studentRecordRules.ts` → 함수 추가 | `filterByKeyword`, `getCategorySummary`, `getWarningStudents` |
| `infrastructure/export/ExcelExporter.ts` → 함수 추가 | `exportStudentRecordsToExcel` |
| `infrastructure/export/HwpxExporter.ts` → 함수 추가 | `exportStudentRecordsToHwpx` |

### 수정 (8개)

| 파일 | 변경 |
|------|------|
| `domain/entities/StudentRecord.ts` | `method?`, `followUp?`, `followUpDate?`, `followUpDone?` 필드 추가 |
| `adapters/components/StudentRecords/StudentRecords.tsx` | 날짜 선택, 미리보기, 상담 방법, 템플릿, 타임라인 뷰, 검색/통계 강화 |
| `adapters/stores/useStudentRecordsStore.ts` | addRecord 파라미터 확장, 후속 조치 관련 액션 |
| `usecases/studentRecords/ManageStudentRecords.ts` | add/update에 신규 필드 전달 |
| `adapters/components/Dashboard/DashboardStudentRecords.tsx` | 후속 조치 알림 표시 |
| `adapters/components/Export/Export.tsx` | '담임메모' 내보내기 항목 추가 |
| `widgets/items/Attendance.tsx` | placeholder → 실데이터 |
| `domain/rules/studentRecordRules.ts` | 신규 필터/통계 함수 |

### 하위 호환

- `method`, `followUp`, `followUpDate`, `followUpDone` 모두 **optional** → 기존 데이터 깨짐 없음
- `student-records.json` 마이그레이션 불필요

---

## 💡 Phase 1 Claude Code 프롬프트

```
담임 메모장(StudentRecords)에 날짜 선택 기능을 추가해줘.

현재 문제:
- src/adapters/components/StudentRecords/StudentRecords.tsx의
  InputMode → handleSave에서 todayString()으로 항상 오늘 날짜만 기록됨

요구사항:

1. DateNavigator 컴포넌트 생성
   - 위치: src/adapters/components/StudentRecords/DateNavigator.tsx
   - ◀ ▶ 버튼으로 하루씩 이동
   - date input 클릭 시 캘린더 팝업
   - [오늘] 버튼 (오늘이 아닐 때만 표시)
   - 오늘이 아닌 날짜는 text-sp-accent로 강조

2. StudentRecords 컴포넌트 수정
   - selectedDate 상태 추가 (기본값: todayString())
   - DateNavigator를 모드 탭 아래, InputMode 위에 배치
   - InputMode의 handleSave에서 todayString() → selectedDate 사용

3. 선택 날짜 기록 미리보기
   - InputMode 하단 (저장 버튼 위)에 해당 날짜 기존 기록 표시
   - 기존 기록이 있으면 "📋 N월 N일 기록 (N건)" + 리스트
   - 기존 기록이 없으면 "이 날짜에 기록이 없습니다"

4. 상담 방법 필드 추가
   - StudentRecord에 method?: 'phone'|'face'|'online'|'visit'|'text'|'other' 추가
   - category가 'counseling'일 때만 표시
   - 메모 입력 위에 칩 선택: 📞전화 🤝대면 💻온라인 🏠방문 💬문자
   - addRecord에 method 파라미터 전달
   - 조회 모드에서 방법 아이콘 표시

기존 sp-card, sp-surface, sp-accent 등 디자인 토큰 유지.
Zustand 스토어 패턴 유지. 클린 아키텍처 레이어 준수.
```
