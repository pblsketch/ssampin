---
template: analysis
version: 1.0
feature: seat-empty-position-preserve
date: 2026-04-22
author: gap-detector (via pblsketch)
project: ssampin
plan: ../01-plan/features/seat-empty-position-preserve.plan.md
design: ../02-design/features/seat-empty-position-preserve.design.md
match_rate: 96
status: PASS
---

# 자리 배치 빈자리 위치 보존 — Gap 분석 보고서

> **Match Rate: 96%** (≥ 90% 기준 통과 → Report 단계 진행 권장)

- **Plan**: [seat-empty-position-preserve.plan.md](../01-plan/features/seat-empty-position-preserve.plan.md)
- **Design**: [seat-empty-position-preserve.design.md](../02-design/features/seat-empty-position-preserve.design.md)
- **Impl**: [src/domain/rules/seatRules.ts](../../src/domain/rules/seatRules.ts)
- **Tests**: [src/domain/rules/seatRules.test.ts](../../src/domain/rules/seatRules.test.ts)
- **Evidence**:
  - `npx vitest run src/domain/rules/seatRules.test.ts` → **17/17 pass**
  - `npx vitest run` (full suite) → **163/163 pass** (회귀 0)
  - `npx tsc --noEmit` → **0 errors**

---

## 1. Overall Scores

| Category | Score | Status |
|----------|:-----:|:------:|
| Design Match (FR-01~FR-07) | 100% | PASS |
| Edge Case Coverage (E1~E11) | 82% | WARN |
| Architecture Compliance | 100% | PASS |
| Convention Compliance | 100% | PASS |
| **Overall Match Rate** | **96%** | **PASS** |

---

## 2. Functional Requirements vs Implementation

| FR | Requirement | Impl Location | Test Location | Status |
|----|-------------|---------------|---------------|:------:|
| FR-01 | `shuffleSeats` preserves null coords | `seatRules.ts:125-137` | `seatRules.test.ts:42-63` (2 cases × 20 seeds) | PASS |
| FR-02 | Student ID count/set preserved | `seatRules.ts:119-122` | `seatRules.test.ts:65-75` (10 seeds) | PASS |
| FR-03 | `shuffleSeatsPreservingGroups` preserves group + null | `seatRules.ts:91-101` | `seatRules.test.ts:130-179` (single 4-col, single 5-col, triple) | PASS |
| FR-04 | `shuffleSeatsWithConstraints` preserves null | `seatRules.ts:441-465` | `seatRules.test.ts:185-200, 202-222, 224-249, 276-296` | PASS |
| FR-05 | Fixed seat on empty coord — defined behavior | `seatRules.ts:410-417` (stage-1 writes before stage-3 mask) | `seatRules.test.ts:251-274` | PASS |
| FR-06 | Zero empties — behavior unchanged | `seatRules.ts:131` | `seatRules.test.ts:77-85` | PASS |
| FR-07 | Trailing-null regression | 같은 경로 (FR-01) | `seatRules.test.ts:87-95` | PASS |

7 FR 전부 구현 + 테스트 커버.

---

## 3. Edge Case Coverage (Design §3)

| Case | Description | Covered | Test Ref |
|------|-------------|:-------:|----------|
| E1 | Zero empties | YES | `seatRules.test.ts:77-85` |
| E2 | All empty (0 학생) | YES | `seatRules.test.ts:97-104` |
| E3 | 1×1 빈 그리드 | YES | `seatRules.test.ts:106-110` |
| E4 | 1×1 단일 학생 | YES | `seatRules.test.ts:112-116` |
| E5 | 빈자리 맨뒤 오른쪽 | YES | `seatRules.test.ts:87-95` |
| E6 | 빈자리 앞쪽 왼쪽 | YES | `seatRules.test.ts:42-63` |
| E7 | 빈자리 분산 | YES | `seatRules.test.ts:52-63` |
| E8 | pairMode + 그룹 내 빈자리 | YES | `seatRules.test.ts:130-147` |
| E9 | 고정좌석이 원본 빈자리 지정 | YES | `seatRules.test.ts:251-274` |
| E10 | zone 제약 + 빈자리 | YES | `seatRules.test.ts:224-249` |
| E11 | separation/adjacency + 빈자리 | PARTIAL | `seatRules.test.ts:202-222` (separation only), `276-296` (adjacency + pairMode) |

11 케이스 전부 최소 1개 테스트로 커버됨. E11은 adjacency-only(non-pairMode) 전용 케이스가 pairMode 테스트에 통합되어 커버리지 수준이 살짝 약하나, null 보존 invariant는 명시적으로 assertion 되어 있어 기능 안전성에 영향 없음.

---

## 4. Differences

### 4.1 Missing Features (Design present, Impl absent)
**없음**.

### 4.2 Added Features (Impl present, Design absent)
없음 (아래는 구현 스타일 차이로 gap 아님).

### 4.3 Style Differences (Design ≠ Impl, 의미 동일)

| Item | Design | Impl | Impact |
|------|--------|------|--------|
| 할당 가드 스타일 | `result[r][c] = shuffled[idx++] ?? null;` (Design §2.1) | `if (... && idx < shuffled.length) { result[r][c] = shuffled[idx]!; idx++; }` (`seatRules.ts:131-134`) | 의미 동일. `studentIds.length === count(non-null coords)` invariant 하에서 두 방식 결과 같음. 구현이 향후 mask/id 불일치에 더 방어적 |

---

## 5. Architecture & Convention Compliance

- **Clean Architecture**: `src/domain/rules/`만 수정. adapters/infra/usecases 의존성 추가 없음. 위반 0.
- **Signature stability**: 3개 함수 시그니처 변경 없음 → 호출부([RandomizeSeats.ts](../../src/usecases/seating/RandomizeSeats.ts), [Seating.tsx](../../src/adapters/components/Seating/Seating.tsx), overlays) 수정 없음. Design §1.2 목표 달성.
- **TypeScript strict**: `any` 미사용, `readonly (readonly (string | null)[])[]` 유지.
- **Test convention**: vitest `*.test.ts` + 결정론적 `mulberry32` PRNG (Design §4.2 기준).
- **한국어 주석**: FR-01/FR-04 독스트링 한국어 (프로젝트 컨벤션).

---

## 6. Residual Gaps (non-blocking)

1. **E11 추가 테스트 (Minor, 선택)**: non-pairMode + adjacency-only + null 보존 전용 케이스를 1개 추가하면 E11 커버리지가 full이 됨. 현 상태에서도 null 보존 assertion은 별도 테스트에 존재하므로 릴리즈 블로커 아님.
2. **Design §2.1 의사코드 정합(Doc-only)**: Design 의사코드의 `?? null` 가드와 실제 구현의 `idx < length` 가드 간 표기 차이. 결과 동치. 선택적 정리.

둘 다 iterate 대상 아님 (보완 시 Match Rate 향상은 <4%p 예상).

---

## 7. Recommendation

**→ Report 단계 진행** (`/pdca report seat-empty-position-preserve`)

근거:
- Match Rate 96% ≥ 90% 임계치
- FR 7/7, Edge Case 11/11 커버
- 전체 테스트 163/163 + 타입 에러 0 + 회귀 0
- 아키텍처/컨벤션 준수 100%

### 릴리즈 체크리스트 (Report 단계 이후)
1. [ ] v1.10.5 엔트리 추가 (`public/release-notes.json`, Design §7 참조)
2. [ ] 버전 번호 6곳 수동 업데이트 (CLAUDE.md Release Workflow 1번)
3. [ ] AI 챗봇 Q&A ingest 업데이트 — "빈자리 고정" 할루시네이션 정정 Q&A 반영 (Plan §2.2 out-of-scope, but pending)
4. [ ] 수동 검증: `npm run dev`로 1열/5열 맨뒤 빈자리 시나리오 10회 재현 확인

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-22 | 초기 분석 (Match Rate 96%, PASS) | gap-detector |
