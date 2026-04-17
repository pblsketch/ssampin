---
template: plan
version: 1.2
feature: attendance-period-edit
date: 2026-04-17
author: pblsketch
project: ssampin
version_target: v1.10.2
---

# 출결 기록 교시 수정 기능 기획서

> **요약**: 담임 업무 > 기록 탭의 출결 기록(지각/조퇴/결과/결석)을 편집할 때, 교시(period) 를 수정·추가·삭제할 수 있게 한다. 변경 사항은 원본 출결부(`useTeachingClassStore`)에도 양방향으로 반영된다.
>
> **Project**: ssampin (쌤핀)
> **Version**: v1.10.1 → v1.10.2
> **Author**: pblsketch
> **Date**: 2026-04-17
> **Status**: Draft

---

## 1. Overview

### 1.1 Purpose

담임 업무 페이지의 **출결 기록 편집 시 교시를 변경**할 수 있도록 하여, 교사가 출결부를 다시 열지 않고도 기록을 바로잡을 수 있게 한다.

### 1.2 Background

- 사용자 피드백(2026-04-17): "출결 수정 시, 교시 수정 가능하게 해주세요"
- 현재 [InlineRecordEditor.tsx](../../../src/adapters/components/Homeroom/Records/InlineRecordEditor.tsx) 는 **유형/사유/메모**만 편집 — 교시는 편집 불가
- 한편 [StudentRecord.ts:33](../../../src/domain/entities/StudentRecord.ts#L33) 의 `attendancePeriods: { period, status, reason, memo }[]` 필드에는 이미 교시별 상세가 보존되어 있음 → **데이터 구조는 갖춰져 있고 UI만 없는 상태**
- 실제 교시 편집은 현재 "**담임 업무 > 출결 탭**"에서만 가능하며, "기록 탭"에서 편집하려면 탭을 이동해야 하는 불편이 있음

### 1.3 Related Documents

- 피드백 원문: 본 세션 사용자 입력 (2026-04-17)
- StudentRecord 엔티티: [src/domain/entities/StudentRecord.ts](../../../src/domain/entities/StudentRecord.ts)
- 원본 출결부 스토어: [src/adapters/stores/useTeachingClassStore.ts](../../../src/adapters/stores/useTeachingClassStore.ts)
- 현재 편집기: [src/adapters/components/Homeroom/Records/InlineRecordEditor.tsx](../../../src/adapters/components/Homeroom/Records/InlineRecordEditor.tsx)
- 브릿지 로직: [src/adapters/stores/useStudentRecordsStore.ts:313](../../../src/adapters/stores/useStudentRecordsStore.ts#L313)

---

## 2. Goals

### 2.1 Primary Goals

1. **교시 편집** — 기록 탭 편집기에서 교시별 행을 보여주고, 각 행의 교시/유형/사유를 독립 편집.
2. **교시 추가·삭제** — 기존 1행이던 기록을 "1교시 결석(질병) + 3교시 지각(기타)" 처럼 여러 행으로 확장하거나 축소.
3. **양방향 동기화** — 기록 탭의 교시 변경이 `useTeachingClassStore`(반·날짜·교시 단위 저장소)에도 반영되어, 다음 출결 저장 시 덮어써지지 않도록 한다.

### 2.2 Non-Goals

- 출결 탭 UI의 전면 개편 (이번 범위 아님)
- 여러 날짜에 걸친 일괄 교시 편집 (단일 기록 = 단일 날짜 범위 유지)
- NEIS 연동 자동화 (기존 수동 체크 유지)
- 모바일 앱 UI 변경 (데스크톱 우선)

### 2.3 Success Metrics

- 교시 편집 경로가 기록 탭 단일 편집기로 일원화되어 **탭 전환 클릭 0회**로 수정 완료
- 기록 탭에서 교시 변경 → 출결 탭 재진입 시 동일 상태 확인 (E2E 검증)
- 타입 에러 0개, ESLint 경고 0개 유지
- 관련 피드백 재발생률 0%

---

## 3. User Stories

### 3.1 담임 교사 (주 사용 시나리오)

**US-1**: 교사가 "기록 탭"에서 학생의 출결 기록을 수정할 때, 기록된 교시(예: 3교시 지각)를 다른 교시(2교시)로 바꾸고 싶다.

- 현재: 기록 삭제 후 출결 탭에서 재입력 → 3단계
- 개선: 기록 탭의 편집 버튼에서 교시를 직접 바꿔 저장 → 1단계

**US-2**: 담임이 뒤늦게 "1교시에도 지각이 있었다"는 사실을 알았을 때 기존 기록에 교시를 **추가**할 수 있어야 한다.

**US-3**: 잘못 입력된 교시 1건을 **삭제**할 수 있어야 한다(전체 기록 삭제가 아니라 해당 교시만).

**US-4**: 기록 탭에서 교시를 변경하면 출결부(출결 탭에서 보이는 교시별 표)에도 동일하게 반영되어, 두 곳의 데이터가 어긋나지 않아야 한다.

---

## 4. Functional Requirements

### 4.1 Core Features

| ID | 기능 | 설명 |
|----|------|------|
| F-1 | 교시별 행 편집 UI | `attendancePeriods`를 1행씩 렌더링, 각 행마다 `[교시 select][유형 select][사유 select][삭제 ✕]` |
| F-2 | 교시 추가 | "+ 교시 추가" 버튼 → 새 행 삽입 (기본: 사용 가능한 가장 낮은 교시 번호, `결석(질병)`) |
| F-3 | 교시 삭제 | 각 행의 ✕ 버튼 → 해당 행 제거. 모든 행 삭제 시 저장 버튼 비활성화(또는 기록 전체 삭제 확인 모달) |
| F-4 | 교시 중복 방지 | 같은 교시 번호가 2개 이상 선택되면 저장 비활성화 + 붉은 테두리 경고 |
| F-5 | 대표 subcategory 재계산 | 저장 시 `attendancePeriods`에서 `pickRepresentativeAttendance` 로직으로 `subcategory` 문자열 갱신 |
| F-6 | 양방향 동기화 | 저장 시 `useTeachingClassStore.saveDayAttendance` 호출하여 해당 (반, 날짜)의 교시별 출결부 갱신 |
| F-7 | 교시 후보 범위 | 1~7교시 (중학교 기준). 설정에서 다른 값을 쓸 수 있다면 해당 값을 따라감 |

### 4.2 UI Requirements

- 편집 모드 진입 시 기존 `[유형 chip] [사유 chip]` 영역이 **교시별 행 리스트**로 전환
- 행 레이아웃: `[✎ N교시 ▼] [유형 ▼] (사유 ▼) [✕]` — 모바일/compact 모드에서도 1줄 유지
- 행 추가 버튼: `+ 교시 추가` — 기록 색상(빨강)과 동일 톤
- 교시 충돌 시: 해당 행에 빨간 테두리 + "이미 선택된 교시입니다" 헬퍼 텍스트
- 기존 메모/나이스 반영/서류 제출/후속 조치 UI는 그대로 유지

### 4.3 Data Requirements

- `StudentRecord.attendancePeriods`는 편집 가능한 상태로 확장 (현재 `readonly` → 편집 시점엔 로컬 상태로 복제)
- 저장 시 `useTeachingClassStore`의 해당 (반, 날짜)에 대해 `saveDayAttendance(classId, date, recordsByPeriod)` 호출
  - 기존 교시 중 수정 기록과 같은 `studentNumber`인 엔트리를 치환
  - 다른 학생의 엔트리는 **절대 건드리지 않음** (중요)

### 4.4 Behavior Requirements

- 저장 시점 순서:
  1. `attendancePeriods` 정규화(오름차순 정렬, 중복/빈 배열 검증)
  2. `useTeachingClassStore.saveDayAttendance` 호출 — **원본 갱신 우선**
  3. `bridgeHomeroomDayAttendance` 자동 재실행 → 기록 탭 상태 재계산
  4. 성공 토스트 표시
- 실패 처리: 원본 저장 실패 시 기록 탭 변경도 롤백, 에러 토스트

---

## 5. Non-Functional Requirements

### 5.1 Performance

- 저장 응답 < 200ms (로컬 JSON 기준)
- 렌더링: 교시 행 최대 8개 — 가상 스크롤 불필요

### 5.2 Security & Privacy

- 로컬 파일만 다루므로 추가 보안 이슈 없음
- 기존 학생 개인정보 처리 정책 유지

### 5.3 Accessibility

- 모든 select는 키보드 탐색 가능 (Tab/Enter)
- 삭제 버튼 `aria-label="교시 삭제"` 지정
- 에러 헬퍼 텍스트 `role="alert"` 지정

### 5.4 Internationalization

- UI 텍스트 한국어 고정 (프로젝트 전역 정책)

---

## 6. Constraints & Assumptions

### 6.1 Constraints

- **아키텍처**: Clean Architecture 4레이어 의존성 준수 (usecases → domain만)
- 양방향 동기화 구현 시 `useTeachingClassStore` 의 `saveDayAttendance` 를 재사용 — 우회 금지
- 모든 UI 텍스트 한국어

### 6.2 Assumptions

- 1~7교시 범위는 초·중·고 공통으로 충분 (8교시 이상은 미지원)
- 같은 학생·같은 날짜·같은 교시 = 단일 엔트리 (도메인 규칙상)
- 편집 중 다른 사용자가 같은 파일을 수정하는 경쟁 상황은 없음 (단일 사용자 데스크톱 앱)

### 6.3 Out of Scope

- 반 전체 교시 일괄 변경
- 과거 여러 날짜 일괄 편집
- 모바일 앱 편집 UI

---

## 7. Risks & Mitigations

| 위험 | 영향 | 완화책 |
|------|------|--------|
| 양방향 동기화 중 `useTeachingClassStore`의 **다른 학생 엔트리** 손상 | 高 (치명적 데이터 유실) | `saveDayAttendance` 인자 구성 시 기존 `recordsByPeriod`를 먼저 로드 → 편집 대상 학생만 patch. 유닛 테스트로 회귀 보장 |
| 대표 subcategory 재계산 규칙 변경으로 검색/필터 깨짐 | 中 | 기존 `pickRepresentativeAttendance` 재사용, 새 유틸 작성 금지 |
| 교시 중복 저장으로 KEY 충돌 | 中 | 저장 직전 검증 + 버튼 비활성화 |
| 편집 중 무한 `bridgeHomeroomDayAttendance` 루프 | 中 | 저장 완료 후 단 1회만 bridge 호출, `useEffect` 에서 자동 bridge 재호출 금지 |
| 기존 데이터에 `attendancePeriods` 가 없는 레거시 기록 | 低 | 마이그레이션 불필요 — 편집 모드 진입 시 `subcategory` 문자열을 파싱해 1행으로 복원 |

---

## 8. Timeline (Estimate)

| 단계 | 작업 | 예상 시간 |
|------|------|-----------|
| Design | 컴포넌트/상태/동기화 설계 문서화 | 0.5h |
| Do | `InlineRecordEditor` 교시 행 UI 추가 | 1h |
|    | 저장 핸들러: 검증 + 양방향 동기화 | 1.5h |
|    | 레거시 기록 파싱(교시 없는 기록) | 0.5h |
|    | 타입/ESLint/빌드 확인 | 0.5h |
| Check | 시나리오 QA(교시 변경/추가/삭제/충돌/레거시) | 1h |
| Act | 릴리즈 노트 업데이트 (v1.10.2) | 0.5h |
| **합계** | | **≈ 5.5h** |

---

## 9. Resolved Decisions (2026-04-17)

1. ✅ **사유 빈 상태 허용**: 사유 select에 "(없음)" 옵션 추가, `reason` 필드 생략(`undefined`)으로 저장. 표시 시 `{유형}` 만 노출.
2. ✅ **0행 상태 = 저장 비활성화** (A안): 모든 교시 행을 삭제하면 [저장] 버튼 비활성화 + "최소 1개 교시가 필요합니다" 헬퍼 텍스트. 기록 전체 삭제는 기록 카드의 별도 [삭제] 버튼으로만 수행(현재 UX와 일관).
3. ✅ **자동 새로고침 동작은 구현 시점에 확인** — Open Q에서 제거. `useTeachingClassStore.saveDayAttendance` 가 `set()` 로 state를 갱신하는지 구현 첫 단계에서 코드로 확인 후 필요 시 수동 트리거 추가.

---

## 10. Next Steps

1. Design 문서 작성 (`docs/02-design/features/attendance-period-edit.design.md`)
2. `/pdca do` 로 구현 착수
3. 구현 완료 후 `/pdca analyze` 로 Gap 분석
