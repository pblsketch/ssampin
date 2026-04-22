---
template: plan
version: 1.0
feature: seat-empty-position-preserve
date: 2026-04-22
author: pblsketch
project: ssampin
version_target: v1.10.5
---

# 자리 배치 빈자리 위치 보존 기획서

> **요약**: 자리 배치 랜덤 셔플 시 원래 비어 있던 좌석의 위치가 보존되지 않고 "맨 뒤 오른쪽 칸"으로 몰리는 버그를 수정한다. 교실 구조상 1열/5열 맨뒤 등 특정 좌석이 비어 있는 경우에도, 랜덤 배치를 여러 번 돌려도 빈자리 위치가 유지되도록 셔플 알고리즘을 수정한다.
>
> **Project**: ssampin (쌤핀)
> **Version**: v1.10.4 → v1.10.5 (버그 픽스 패치)
> **Author**: pblsketch
> **Date**: 2026-04-22
> **Status**: Draft

---

## 1. Overview

### 1.1 Purpose

현재 랜덤 자리 배치 로직은 학생을 1D 배열 앞쪽부터 채우고 빈자리(null)를 뒤쪽에 밀어넣는다. 그 결과 사용자가 배치한 빈자리 위치와 무관하게 **항상 마지막 행 오른쪽 칸부터 순차적으로** 비게 되어, 교실 구조(창가·기둥·사물함·결석석 등)를 반영해 빈자리를 지정한 의도가 셔플 한 번에 무너진다.

이 문제를 해결하기 위해 "원래 null이었던 좌표는 null을 유지하고, 학생 ID만 non-null 좌표 사이에서 셔플"하는 방식으로 변경한다. 별도의 "빈자리 고정" 신규 기능을 추가하지 않고, 셔플 함수의 동작 자체를 "빈자리 위치 보존" 의미론으로 수정한다.

### 1.2 Background

- **사용자 피드백(2026-04-22)**: "교실 빈자리가 1열, 5열 맨뒤인 상황인데, 자리 배치를 하면 자동으로 4,5열로 고정이 되어버리네요 ㅠㅠ"
- **챗봇 할루시네이션 선행 조사(2026-04-22)**: 자체 챗봇이 "설정 > 좌석 관계 설정 > 고정 좌석에서 빈자리를 선택해 고정"이라 안내했으나 해당 UI/기능은 존재하지 않음. `FixedSeatConstraint.studentId`가 필수 값이어서 빈자리 자체를 고정 대상으로 지정할 수 없음.
- **근본 원인**: [seatRules.ts:108-139](../../../src/domain/rules/seatRules.ts#L108-L139) `shuffleSeats` 함수가 `[...studentIds, ...emptyCount만큼의 null]` 형태로 평탄화된 배열을 만들어 다시 행/열로 쪼개기 때문에, 원본 빈자리 좌표가 사라진다.
- **짝꿍 모드도 동일 버그**: [seatRules.ts:67-102](../../../src/domain/rules/seatRules.ts#L67-L102) `shuffleSeatsPreservingGroups`도 그룹 내부를 순회하며 학생을 앞쪽부터 채워 동일 증상 발생.

### 1.3 Related Documents

- 버그 재현 세션: 2026-04-22 대화 ("교실 빈자리가 1열, 5열 맨뒤…")
- 관련 도메인: [src/domain/rules/seatRules.ts](../../../src/domain/rules/seatRules.ts)
- 관련 엔티티: [src/domain/entities/Seating.ts](../../../src/domain/entities/Seating.ts)
- 관련 usecase: [src/usecases/seating/RandomizeSeats.ts](../../../src/usecases/seating/RandomizeSeats.ts)
- 관련 UI: [src/adapters/components/Seating/Seating.tsx](../../../src/adapters/components/Seating/Seating.tsx)
- 짝꿍 모드 오버레이: [src/adapters/components/Seating/ShuffleOverlay.tsx](../../../src/adapters/components/Seating/ShuffleOverlay.tsx), [src/adapters/components/Seating/GroupShuffleOverlay.tsx](../../../src/adapters/components/Seating/GroupShuffleOverlay.tsx)

---

## 2. Scope

### 2.1 In Scope

- [ ] `shuffleSeats` 함수 수정: 원본 `seats`에서 `null` 좌표 집합을 기억해 그대로 유지, 학생 ID만 Fisher-Yates 셔플 후 non-null 좌표에만 재배치
- [ ] `shuffleSeatsPreservingGroups` 함수 수정: 짝꿍 그룹 구조 + 빈자리 좌표 동시 보존
- [ ] `shuffleSeatsWithConstraints` 경로 검증: 제약(고정/영역/분리/인접) 있을 때도 빈자리 위치가 보존되도록 확인 및 필요 시 수정
- [ ] 단위 테스트 신규 작성: `src/domain/rules/seatRules.test.ts`
  - 빈자리 위치 보존 (기본 셔플)
  - 빈자리 위치 보존 + 짝꿍 모드
  - 빈자리 위치 보존 + 제약 조건 조합
  - 빈자리 수 변화 없음 (count 보존)
  - 학생 수 변화 없음 (count 보존)
  - 결정론적 테스트: seedRandom 주입으로 재현 가능
- [ ] 타입 체크 0 에러, 기존 테스트(`npm test`) 영향 없음

### 2.2 Out of Scope

- **신규 "빈자리 고정" UI/기능 추가**: 본 수정만으로 빈자리 위치가 자연스럽게 유지되므로 별도 UI 불필요
- **챗봇 지식베이스 정정(Q&A ingest)**: 본 기능 수정과 별건으로, 릴리즈 후 `scripts/ingest-chatbot-qa.mjs`에 "빈자리 고정" 관련 올바른 안내를 반영하는 후속 작업 (본 PDCA 범위 외)
- **자리 뽑기 도구(ToolSeatPicker) 로직**: 해당 도구는 자체 배정 로직을 가지며, 빈자리는 이미 `totalFixedSeatCount <= availableSeats` 검증으로 다루고 있음. 본 버그와 직접 관련 없음
- **그룹(모둠) 모드의 학생 재분배 로직**: `layout: 'group'`일 때의 그룹 재배치는 별도 로직이며 빈자리 개념 자체가 다르므로 별건

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | 요구사항 | 우선순위 | 상태 |
|----|---------|---------|------|
| FR-01 | `shuffleSeats`는 원본에서 `null`이었던 좌표를 결과에서도 `null`로 유지한다 | Critical | Pending |
| FR-02 | `shuffleSeats`는 학생 ID의 총 개수를 보존한다 (중복/누락 없음) | Critical | Pending |
| FR-03 | `shuffleSeatsPreservingGroups`는 짝꿍 그룹 구조를 유지하면서 빈자리 좌표도 보존한다 | High | Pending |
| FR-04 | `shuffleSeatsWithConstraints`는 제약 조건 해결 과정에서도 빈자리 좌표를 보존한다 | High | Pending |
| FR-05 | 고정 좌석(`FixedSeatConstraint`)이 원래 빈자리였던 좌표를 지정하는 경우가 없도록 가드 또는 허용 동작이 명시된다 | Medium | Pending |
| FR-06 | 학생 수와 좌석 수가 동일한 경우(빈자리 0) 기존 동작과 완전히 동일하다 | Critical | Pending |
| FR-07 | 빈자리가 모두 행의 맨 뒤에 있던 기존 케이스에서도 회귀 없이 동작한다 | High | Pending |

### 3.2 Non-Functional Requirements

| 카테고리 | 기준 | 측정 방법 |
|---------|------|---------|
| 성능 | 셔플 시간 회귀 없음 (기존 대비 ±5%) | 수동 벤치(30×6 좌석, 1000회) |
| 결정론성 | `random` 주입 시 동일 입력 → 동일 출력 | 단위 테스트 |
| 타입 안전 | `any` 미사용, `noUncheckedIndexedAccess` 호환 | `npx tsc --noEmit` |
| 하위 호환 | 저장된 `SeatingData` 스키마 변경 없음 | 기존 JSON 그대로 로드 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] FR-01 ~ FR-07 모두 구현 완료
- [ ] `src/domain/rules/seatRules.test.ts` 테스트 전부 통과
- [ ] `npx tsc --noEmit` 에러 0개
- [ ] `npm run build` 성공
- [ ] 수동 검증: `npm run dev`로 빈자리가 중간/왼쪽 열에 있는 좌석 배치 상태에서 `자리배치 > 랜덤 배치` 10회 연속 수행 → 빈자리 위치 동일
- [ ] PDCA `analyze` Match Rate ≥ 90%

### 4.2 Quality Criteria

- [ ] Clean Architecture 의존성 규칙 위반 없음 (domain 내부만 수정, adapters/usecases 수정 없음 기대)
- [ ] 순수 함수 유지 (부수효과 없음)
- [ ] 기존 export 시그니처 유지 (호출부 수정 불필요)

---

## 5. Risks and Mitigation

| 리스크 | 영향 | 가능성 | 완화 방안 |
|-------|------|-------|---------|
| 제약 경로(`shuffleSeatsWithConstraints`) 내부에서 zone·fixed·free 재조합 시 빈자리가 다시 뒤로 밀릴 수 있음 | High | Medium | `shuffleSeatsWithConstraints`에 별도 테스트 케이스 추가, 필요 시 non-null 좌표 마스크를 별도 전달 |
| `FixedSeatConstraint`가 원래 빈자리 좌표를 지정하는 경우, 해당 빈자리는 학생으로 채워져야 하는가 vs 무효 처리해야 하는가 결정 필요 | Medium | Low | 현 구현은 좌표 기반이라 지정된 자리에 학생이 앉도록 허용(기존 유지). 테스트로 명시 |
| `shuffleSeatsPreservingGroups` 수정 후 짝꿍 그룹 경계에 빈자리가 있을 때 그룹 크기 불변 조건 위반 가능 | Medium | Medium | 그룹 내 빈자리가 있으면 그 위치에만 null을 유지하고 남은 학생만 순서대로 채우도록 변경, 테스트 추가 |
| 기존 회귀: 학생이 정확히 좌석 수와 같을 때 동작 변경이 발생하면 대규모 회귀 | Critical | Low | 빈자리 0 조건 분기는 변경 없음 보장, 테스트로 고정 |

---

## 6. Architecture Considerations

### 6.1 Project Level Selection

| Level | 특성 | 권장 | 선택 |
|-------|-----|-----|:---:|
| **Starter** | 단순 구조 | 정적 사이트 | ☐ |
| **Dynamic** | 기능 모듈·BaaS | 풀스택 웹앱 | ☑ |
| **Enterprise** | 엄격 레이어·DI·마이크로서비스 | 대규모 시스템 | ☐ |

도메인 규칙 함수 2~3개 수정 + 테스트 추가 수준. UI/스토어/리포지토리 수정 없음.

### 6.2 Key Architectural Decisions

| 결정 | 옵션 | 선택 | 근거 |
|-----|-----|-----|-----|
| 빈자리 표현 | (A) 원본 seats의 null 좌표를 마스크로 사용 / (B) 별도 `emptyPositions` 파라미터 도입 | **(A) 원본 seats 마스크** | 시그니처 변경 없음, 호출부 무수정 |
| 수정 범위 | (A) `shuffleSeats`만 / (B) `shuffleSeats` + `shuffleSeatsPreservingGroups` / (C) B + `shuffleSeatsWithConstraints` | **(C) 3함수 모두** | 제약 경로도 같은 결함이 전파되므로 일관성 보장 |
| 테스트 전략 | (A) 통합 테스트만 / (B) 순수 함수 단위 테스트 | **(B) 단위 테스트** | 순수 함수 + `random` 주입으로 결정론 확보 가능, 빠르고 신뢰도 높음 |
| 이전 버전 호환 | (A) 플래그로 on/off / (B) 바로 교체 | **(B) 바로 교체** | 기존 동작은 버그이며 사용자에게 부정적. 플래그 불필요 |

### 6.3 Clean Architecture Approach

```
선택 레벨: Dynamic (Clean Architecture 4-layer)

영향 레이어:
┌─────────────────────────────────────────────┐
│ infrastructure/  변경 없음                   │
│ ┌─────────────────────────────────────────┐ │
│ │ adapters/  변경 없음 (호출부 시그니처 유지) │ │
│ │ ┌─────────────────────────────────────┐ │ │
│ │ │ usecases/  변경 없음                  │ │ │
│ │ │ ┌─────────────────────────────────┐ │ │ │
│ │ │ │ domain/rules/seatRules.ts    ✏️ │ │ │ │
│ │ │ │   - shuffleSeats             ✏️ │ │ │ │
│ │ │ │   - shuffleSeatsPreservingGroups ✏️│ │ │
│ │ │ │   - shuffleSeatsWithConstraints ✏️ │ │ │
│ │ │ │ domain/rules/seatRules.test.ts ✨ │ │ │ │
│ │ │ └─────────────────────────────────┘ │ │ │
│ │ └─────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

---

## 7. Convention Prerequisites

### 7.1 Existing Project Conventions

- [x] Clean Architecture 4-layer 준수
- [x] TypeScript strict, `any` 금지
- [x] 순수 함수 `random: () => number` 주입 패턴 (이미 존재)
- [x] `formTemplateRules.test.ts` 등 `*.test.ts` 네이밍 및 Jest/Vitest 구동 환경 존재

### 7.2 Conventions to Define/Verify

| 카테고리 | 현 상태 | 정의할 내용 | 우선순위 |
|---------|--------|-----------|:-------:|
| **테스트 프레임워크** | 기존 `*.test.ts` 파일 존재 | `seatRules.test.ts`도 동일 러너 사용 | High |
| **시드 랜덤 유틸** | 미존재로 보임 | 테스트 내부에서 mulberry32 등 PRNG 인라인 정의 | Medium |

### 7.3 Environment Variables Needed

불필요 (순수 도메인 로직).

### 7.4 Pipeline Integration

9-phase 파이프라인 미적용, PDCA 플로우(plan → design → do → analyze) 사용.

---

## 8. Next Steps

1. [ ] 설계 문서 작성 (`/pdca design seat-empty-position-preserve`)
   - 함수별 Before/After 시그니처·의사코드
   - 테스트 케이스 리스트 (FR-01 ~ FR-07 매핑)
   - 엣지 케이스(전부 빈자리 / 학생 0명 / 1×1 그리드 등) 처리 방침
2. [ ] TDD 구현 (`/pdca do seat-empty-position-preserve`)
   - 실패 테스트 작성 → 최소 구현 → 리팩터링
3. [ ] Gap 분석 (`/pdca analyze seat-empty-position-preserve`)
4. [ ] 릴리즈 노트 추가 (v1.10.5 패치, `public/release-notes.json` + 8단계 릴리즈 워크플로우)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-22 | 초기 Plan 작성 (자리 배치 빈자리 위치 보존 버그 수정) | pblsketch |
