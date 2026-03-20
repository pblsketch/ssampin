# 쌤핀 — 과제 수합 탭을 담임업무/수업관리에 통합

## 배경

현재 **과제 수합(Assignment)** 기능은 **쌤도구(Tools)** 안에만 존재합니다.
설문/체크리스트가 담임업무·수업관리에 탭으로 들어가는 것처럼,
과제 수합도 **담임업무**와 **수업관리** 양쪽에 탭으로 추가합니다.

### 현재 구조
- **쌤도구**: `ToolLayout.tsx` → `ToolsGrid.tsx`에서 '과제수합' 클릭 → `AssignmentTool.tsx` → `AssignmentDetail.tsx`
- **담임업무**: `HomeroomPage.tsx` → 탭: 명렬관리, 기록, 설문/체크리스트, 상담예약, 자리배치
- **수업관리**: `ClassManagementPage.tsx` → 탭: 명렬표, 좌석배치, 진도관리

### 핵심 포인트
- `AssignmentCreateModal`은 `useStudentLists()` 훅으로 대상 반을 선택함 (담임반/수업반 모두 지원)
- Assignment 엔티티에 `target.type: 'class' | 'teaching'`으로 소속 구분이 이미 있음
- 담임업무에서는 `target.type === 'class'`인 과제만, 수업관리에서는 해당 수업반 과제만 필터

---

## 설계 결정사항 (코드 리뷰 반영)

### 1. SurveyTab 패턴 채택 (embedded prop 대신 래퍼 컴포넌트)
- `AssignmentTool`에 `embedded` prop을 추가하지 않고, **새 래퍼 컴포넌트**를 생성
- SurveyTab이 이미 list/detail 뷰 전환을 내부 state로 관리하는 검증된 패턴 사용
- 기존 쌤도구 라우팅(`tool-assignment`, `tool-assignment-detail`)을 안전하게 유지

### 2. 로컬 상태로 상세 뷰 관리
- `useAssignmentStore`의 `selectedAssignmentId`(전역)는 사용하지 않음
- 각 탭에서 `assignmentDetailId` 로컬 state로 관리 (SurveyTab 패턴)
- 담임업무/수업관리 양쪽에서 동시 사용 시 상태 충돌 방지

### 3. AssignmentCreateModal에 defaultTarget prop 추가
- 현재 `studentLists[0]`으로 하드코딩 → 탭 컨텍스트에 맞는 기본값 전달
- 담임업무: 담임반 자동 선택, 수업관리: 해당 수업반 자동 선택

### 4. 온라인 전용 기능 UX
- Assignment는 Google Drive 연동 필수 → OfflineNotice로 안내
- 다른 탭(오프라인 가능)과 UX 차이 있으나, 탭 내에서 명확히 표시

### 5. 쌤도구 기존 과제 수합 유지
- 전체 과제를 한눈에 보는 뷰로 유지 → 라우팅 변경 불필요

---

## Phase 1: Homeroom용 AssignmentTab 래퍼 생성

### 파일: `src/adapters/components/Homeroom/Assignment/AssignmentTab.tsx` (신규)

SurveyTab 패턴을 따라:
1. 내부 `view: 'list' | 'detail'` + `selectedAssignmentId` 로컬 state 관리
2. list 뷰: AssignmentTool의 목록 UI 재사용 (필터: `target.type === 'class'`)
3. detail 뷰: AssignmentDetail 렌더링
4. AssignmentCreateModal 호출 시 `defaultTarget`으로 담임반 전달

---

## Phase 2: HomeroomTabBar + HomeroomPage에 탭 추가

### 파일: `src/adapters/components/Homeroom/HomeroomTabBar.tsx`
- `HomeroomTab` 타입에 `'assignment'` 추가
- TABS 배열에 `{ id: 'assignment', icon: '📎', label: '과제 수합' }` 추가

### 파일: `src/adapters/components/Homeroom/HomeroomPage.tsx`
- `activeTab === 'assignment'`일 때 `<AssignmentTab />` 렌더링

---

## Phase 3: ClassManagement용 ClassAssignmentTab 래퍼 생성 + 탭 추가

### 파일: `src/adapters/components/ClassManagement/ClassAssignmentTab.tsx` (신규)
- `classId` prop 받아서 해당 수업반 과제만 필터
- `useTeachingClassStore`에서 classId로 수업반명 조회 → `target.name` 매칭
- list/detail 뷰 전환 로컬 state 관리

### 파일: `src/adapters/components/ClassManagement/ClassManagementPage.tsx`
- TabId에 `'assignment'` 추가
- TABS 배열에 `{ id: 'assignment', label: '과제 수합', icon: 'attach_file' }` 추가
- `activeTab === 'assignment'`일 때 `<ClassAssignmentTab classId={selectedClassId} />` 렌더링

---

## Phase 4: AssignmentCreateModal defaultTarget prop

### 파일: `src/adapters/components/Tools/Assignment/AssignmentCreateModal.tsx`
- `defaultTarget?: StudentListOption` prop 추가
- 초기값: `defaultTarget ?? studentLists[0]`

---

## 검증 방법

- `npx tsc --noEmit` — TypeScript 에러 0개
- 담임업무 > 과제 수합 탭: 담임반 과제만 표시
- 수업관리 > 과제 수합 탭: 선택한 수업반 과제만 표시
- 쌤도구 > 과제 수합: 전체 과제 여전히 표시
- 과제 생성 > 대상 선택: 탭 컨텍스트에 맞는 기본 대상 선택

## 파일 변경 목록

### 신규 파일
| 파일 | 설명 |
|------|------|
| `src/adapters/components/Homeroom/Assignment/AssignmentTab.tsx` | 담임업무용 과제 수합 래퍼 |
| `src/adapters/components/ClassManagement/ClassAssignmentTab.tsx` | 수업관리용 과제 수합 래퍼 |

### 수정 파일
| 파일 | 변경 내용 |
|------|-----------|
| `src/adapters/components/Homeroom/HomeroomTabBar.tsx` | 'assignment' 탭 추가 |
| `src/adapters/components/Homeroom/HomeroomPage.tsx` | AssignmentTab 렌더링 |
| `src/adapters/components/ClassManagement/ClassManagementPage.tsx` | 'assignment' 탭 + ClassAssignmentTab 렌더링 |
| `src/adapters/components/Tools/Assignment/AssignmentCreateModal.tsx` | defaultTarget prop 추가 |
