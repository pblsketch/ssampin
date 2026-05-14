# tool-randomness-improvement 계획서

> **Summary**: 사용자 피드백 — "랜덤뽑기·조 정하기·동전·룰렛 등에서 초기 결과값이 비슷하게 반복됨". 알고리즘 점검 결과 Fisher-Yates 셔플과 `Math.random()` 사용은 표준 그대로 균등 분포 보장. 그럼에도 체감되는 "다양성 부족"을 해결하기 위해 **(A) crypto.getRandomValues 기반 엔트로피 강화**와 **(B) 직전 결과 회피(anti-repeat) 옵션**을 도입한다. 통계 학습 용도에서 균등성이 깨지지 않도록 anti-repeat 는 도구별 토글로 분리(랜덤뽑기·조 정하기·룰렛은 기본 ON, 동전·주사위는 기본 OFF).
>
> **Project**: 쌤핀 (SsamPin)
> **Version**: (다음 패치 릴리즈에 포함 예정 — v2.0.5 후보)
> **Author**: pblsketch
> **Date**: 2026-05-14
> **Status**: Draft

---

## 1. Overview

### 1.1 Purpose

쌤도구 5종(랜덤뽑기·조 정하기·동전·룰렛·주사위)의 난수 결과에 대한 사용자 체감 다양성을 끌어올린다. 구체적으로:

1. PRNG 엔트로피 소스를 `Math.random()` → `crypto.getRandomValues()` 로 격상해 시드 패턴 의심 제거.
2. 학생 뽑기 류 도구에 "이미 나왔던 결과를 잘 안 뽑는" 회피 메모리(anti-repeat)를 옵션으로 도입.
3. 동전·주사위 같은 통계 학습 시나리오에서는 anti-repeat 기본 OFF — 진짜 균등 난수가 필요한 사용자를 위해.
4. 1만 회 시뮬레이션 분포 검증 테스트로 회귀 방지.

### 1.2 Background

- 사용자 피드백(2026-05-14): "초기 결과값이 비슷하게 반복됨. 난수 다양성 강화 희망."
- 점검 결과 (이 세션):
  - [randomRules.ts](../../../src/domain/rules/randomRules.ts) — Fisher-Yates 표준 구현, bias 없음
  - [groupingRules.ts:277](../../../src/domain/rules/groupingRules.ts#L277) — `shuffleArray` 재사용
  - [ToolCoin.tsx:41](../../../src/adapters/components/Tools/ToolCoin.tsx#L41) — `Math.random() < 0.5`
  - [ToolRoulette.tsx:190-192](../../../src/adapters/components/Tools/ToolRoulette.tsx#L190-L192) — `Math.random()` × 2
  - [ToolDice.tsx:238](../../../src/adapters/components/Tools/ToolDice.tsx#L238) — `Math.floor(Math.random() * 6) + 1`
- V8 의 `Math.random()` 은 xorshift128+ 기반으로 통계적 균등 분포가 보장된 PRNG. **알고리즘 결함은 없음**. 사용자 체감의 원인은 (1) Gambler's Fallacy (균등 난수의 자연스러운 클러스터를 "반복"으로 인식), (2) 시각적 다양성 부족(룰렛 회전수·슬롯 step 수), (3) 동일 세션 내 결정론적 PRNG 시퀀스 인 것으로 추정.

### 1.3 Related Documents

- 사용자 피드백 출처: 본 PDCA 세션 (시작 메시지)
- 점검 결과 요약: 본 문서 §1.2
- 도메인 레이어 가이드: [`CLAUDE.md`](../../../CLAUDE.md) §아키텍처

---

## 2. Scope

### 2.1 In Scope — P0 (다음 패치 릴리즈 게이트)

- [ ] **P0-A — `crypto.getRandomValues` 기반 PRNG 도입** (도메인 레이어 순수성 유지)
  - `domain/rules/randomRules.ts` 에 `secureRandom(): number` 추가 (`crypto.getRandomValues(new Uint32Array(1))[0] / 2**32`)
  - 기존 `shuffleArray`/`pickRandom` 의 `random` 기본값을 `secureRandom` 으로 교체 (signature 호환)
  - `Math.random()` 직접 호출 5개 위치(코인·룰렛·주사위·랜덤뽑기 슬롯 애니메이션·그룹화 leader pick) 전부 `secureRandom()` 으로 교체
  - 도메인 레이어가 `crypto` 전역에 의존하면 안 되므로 **주입 가능 패턴 유지** — 기본값만 secureRandom, 테스트는 seeded random 주입 가능

- [ ] **P0-B — anti-repeat (회피 메모리) 헬퍼 추가**
  - `domain/rules/randomRules.ts` 에 `pickWithMemory<T>(pool, history, options)` 신규
  - 가중치 모델: 직전 N회(기본 N=3) 결과의 가중치를 `recentPenalty`(기본 0.25) 로 낮춤
  - 단순 가중치 룰렛 휠 알고리즘 — pool 전부 가중치 1, history 항목만 0.25, 가중치 누적 후 균등 난수로 인덱스 선택
  - pool 크기가 history 보다 작거나 같으면 (모두 회피하면 뽑을 게 없음) 자동 fallback → 균등 픽
  - 입력 불변(history는 호출자가 관리)

- [ ] **P0-C — 5개 도구 UI 통합**
  - [ToolRandom.tsx](../../../src/adapters/components/Tools/ToolRandom.tsx) — "골고루 모드" 토글 추가, 기본 **ON**. `pickedItems` 를 anti-repeat history 로 활용(이미 있는 상태)
  - [ToolGrouping.tsx](../../../src/adapters/components/Tools/ToolGrouping.tsx) — "지난 편성 회피" 토글, 기본 **ON**. `history` state 의 직전 모둠 배치 이름들을 가중치 다운(다시 편성 시 같은 멤버 조합 회피)
  - [ToolRoulette.tsx](../../../src/adapters/components/Tools/ToolRoulette.tsx) — "골고루 모드" 토글, 기본 **ON**. `history` state 의 직전 N회 항목을 회피해서 인덱스 선택 후, 그 인덱스에 시각적으로 도달하도록 회전 각도 역산
  - [ToolCoin.tsx](../../../src/adapters/components/Tools/ToolCoin.tsx) — "골고루 모드" 토글, 기본 **OFF**. 통계 학습 시나리오 보호
  - [ToolDice.tsx](../../../src/adapters/components/Tools/ToolDice.tsx) — "골고루 모드" 토글, 기본 **OFF**. 통계 학습 시나리오 보호
  - 토글 상태는 도구별 설정에 영속(예: `localStorage` 또는 기존 `useToolSettingsStore`가 있다면 그쪽). 영속화 방식은 Design 단계에서 확정

- [ ] **P0-D — 통계 검증 단위 테스트**
  - `domain/rules/randomRules.test.ts` (또는 신규)
  - `secureRandom` 1만 회 호출 시 10분위 균등성 검증 (chi-square 또는 max deviation ≤ 5%)
  - `pickWithMemory` 회피 동작 검증: history 항목이 평균 빈도의 `recentPenalty` 만큼만 나오는지
  - 회피 모드 OFF 시 균등 분포 유지 확인

### 2.2 In Scope — P1 (선택 후속)

- [ ] **P1-1 — 시각적 다양성 강화** (체감 보강)
  - 룰렛 회전수 `5 + Math.random()*3` → `7 + secureRandom()*4` (5~8 → 7~11바퀴)
  - 랜덤뽑기 슬롯 애니메이션 totalSteps 30 → 40, 속도 곡선 미세 조정
  - 사용자 체감은 코드 변경량 대비 효과가 큰 영역

- [ ] **P1-2 — 사용자에게 가시화** (선택)
  - 토글 옆에 `?` 툴팁: "골고루 모드: 최근 N회 뽑힌 결과를 잠시 덜 뽑습니다. 확률 학습 용도라면 끄세요."
  - Settings 페이지에 "쌤도구 난수" 섹션 추가는 과한 변경 — 일단 도구 내부 토글로 충분

### 2.3 In Scope — P2 (백로그)

- [ ] 통계 가시화 도구 — 동전/주사위에 "1만 번 던지면?" 시뮬레이션 버튼 (확률 교육 활용)
- [ ] 결과 영속성 — 학생 뽑기 history 를 세션 종료 후에도 1일간 유지 옵션 (오늘 안에 같은 학생 다시 뽑기 더 강하게 회피)

### 2.4 Out of Scope

- 좌석배치 추첨(ToolSeatPicker) 의 컨페티 애니메이션 `Math.random()` 5건 — 시각 효과 전용, 결과에 영향 없음
- Word Cloud / Multi Survey / Realtime Wall / Survey / Poll 의 `Math.random()` — UI 식별자/위치 생성용, 결과 추첨 아님
- Interactive Slides 의 OverlayConfigDrawer — UI 시드용
- Timer/PresentationMode — 결과 추첨 아님
- 도메인 레이어에 `crypto` 직접 의존 — 주입 가능 패턴으로 회피

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | `randomRules.ts` 에 `secureRandom()` 이 존재하고, 기본 random 소스로 사용된다 | P0 | Pending |
| FR-02 | `Math.random()` 직접 호출이 5개 도구의 **결과 추첨** 경로에서 모두 `secureRandom()` 으로 대체된다 (시각 효과 경로는 제외 가능) | P0 | Pending |
| FR-03 | `pickWithMemory(pool, history, options)` 가 도메인 레이어에 추가되고, 회피 동작이 단위 테스트로 검증된다 | P0 | Pending |
| FR-04 | 5개 도구에 "골고루 모드" 토글이 있고, 도구별 기본값(랜덤뽑기·조·룰렛 ON / 동전·주사위 OFF)이 적용된다 | P0 | Pending |
| FR-05 | 토글 상태가 영속화되어 앱 재실행 후에도 유지된다 | P0 | Pending |
| FR-06 | OFF 모드에서 `secureRandom` 기반 균등 분포가 1만 회 시뮬레이션에서 검증된다 (max deviation ≤ 5%) | P0 | Pending |
| FR-07 | ON 모드에서 직전 N회 결과가 평균 빈도의 `recentPenalty` 만큼 줄어드는 것이 검증된다 | P0 | Pending |
| FR-08 | 룰렛 회전수·슬롯 step 수 조정으로 시각적 다양성이 강화된다 | P1 | Pending |
| FR-09 | 토글 옆 툴팁이 "골고루 모드"의 의미와 OFF 권장 시나리오를 안내한다 | P1 | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement |
|----------|----------|-------------|
| 회귀 없음 | `npm run typecheck && npm run lint && npm run test && npm run regression-check` 그린 | CI |
| 도메인 순수성 | `domain/rules/` 가 `crypto` 전역에 직접 의존하지 않고 주입 가능 (테스트 시 seeded random 으로 교체 가능) | 코드 리뷰 |
| 통계 균등성 | `secureRandom` 1만 회 호출의 10분위 max deviation ≤ 5% | 단위 테스트 |
| 사용자 체감 | "초기 결과 반복" 보고 재발 시 토글 ON 상태로 검증 | 사용자 RG |

---

## 4. Success Criteria

### 4.1 Definition of Done

- **P0 완료** = FR-01 ~ FR-07 충족 + 단위 테스트 그린 + 5개 도구 수동 RG 통과 (각 도구 토글 ON/OFF 동작, 영속화 동작)
- **P1 완료** = FR-08 ~ FR-09 (선택, P0 와 함께 또는 별도 PR)
- 전체: `/pdca analyze tool-randomness-improvement` Match Rate ≥ 90% → `/pdca report`

### 4.2 Quality Criteria

- [ ] Lint·typecheck·test·regression 그린
- [ ] 빌드(앱) 성공
- [ ] 1만 회 시뮬레이션 분포 단위 테스트 통과
- [ ] 5개 도구 토글 동작 + 영속화 수동 RG 통과
- [ ] 사용자 직접 체감 확인 — "이제 골고루 나오는 것 같다"

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| anti-repeat 가 통계 학습 시나리오를 깨뜨림 (예: 확률 단원 수업에서 동전 던지기) | High | Medium | 동전·주사위는 기본 OFF + 토글 옆 툴팁으로 명시 안내. ON 모드라도 균등성은 큰 N에서 회복(가중치만 조정) |
| `crypto.getRandomValues` 가 Electron 메인/렌더러 양쪽에서 동작하는지 환경 차이 | Medium | Low | 도메인 레이어는 주입 패턴 — 호출자가 환경에 맞는 source 주입. 데스크톱 렌더러는 `window.crypto`, Node 환경(테스트)은 `globalThis.crypto.getRandomValues` (Node 19+). package.json 의 node 버전 확인 필요 |
| 도구별 토글 영속화로 IPC/Storage 인터페이스 늘어남 | Medium | Low | 단순 boolean 5개 — 기존 `useToolSettingsStore`나 `localStorage` 1키 묶음(`tool-randomness-toggles`)으로 처리. Design 단계에서 확정 |
| 룰렛 회전 각도 역산 시 시각/결과 불일치 | High | Low | 현재 룰렛은 회전 후 각도→인덱스. anti-repeat 적용 시에는 **인덱스 먼저 결정 → 그 섹션 중앙으로 멈추도록 각도 계산** 으로 뒤집어야 함 — Design 단계에서 명시 |
| `pickWithMemory` history 가 클라이언트별로 다른 상태를 갖아 동기화 안 됨 | Low | Low | 의도된 동작 — 도구별/세션별 로컬 메모리. 영속화 X (P2 옵션) |
| 1만 회 시뮬레이션 테스트가 flaky | Medium | Medium | seeded PRNG 주입으로 결정론적 테스트 + secureRandom 별도 통계 테스트(허용 오차 5%). chi-square 대신 단순 max deviation |

---

## 6. Architecture Considerations

> 본 작업은 **domain/rules 순수 함수 확장** + **adapters/components UI 토글** + **도구별 상태 관리**. infrastructure/usecases 변경 없음.

### 6.1 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| PRNG 소스 | (a) Math.random 유지 / (b) crypto.getRandomValues / (c) 별도 시드 PRNG 구현(splitmix64 등) | **(b)** | 브라우저·Node 양쪽 표준 API, 추가 의존 0. (c) 는 시드 관리 부담 |
| 도메인 의존 | crypto 전역 import / 주입 가능 | **주입 가능 + 기본값 secureRandom** | CLAUDE.md "domain 은 외부 의존 없음" 규칙 준수. 테스트도 쉬워짐 |
| anti-repeat 알고리즘 | (a) 가중치 룰렛 / (b) 직전 결과 hard-exclude / (c) shuffle 셀렉션 후 직전 결과면 재셔플 | **(a) 가중치 룰렛** | (b) 는 pool 작을 때 항상 같은 N+1번째 후보로 편향, (c) 는 무한 루프 위험. 가중치는 부드러운 회피 |
| 토글 영속화 | localStorage / useToolSettingsStore (없으면 신설) / IPC 동기화 | **`localStorage` 단일 키 1차** | 5개 boolean 묶음, IPC 불필요. 추후 클라우드 동기화 필요 시 store 로 격상 |
| 룰렛 결정 순서 | 회전→각도→인덱스(현재) / **인덱스→각도** | **인덱스 먼저 결정** (anti-repeat 적용 위해) | 회전 후 각도 mapping 으로는 회피 불가. anti-repeat 와 양립하려면 인덱스 결정 → 시각화 |

### 6.2 Clean Architecture Approach

변경 위치:

```
domain/rules/randomRules.ts          ← secureRandom, pickWithMemory 추가
domain/rules/randomRules.test.ts     ← (신규) 분포 검증 + anti-repeat 검증
domain/rules/groupingRules.ts        ← shuffleArray 호출만 — random 인자는 secureRandom 자동
adapters/components/Tools/
  ToolRandom.tsx                     ← 토글 + history 활용
  ToolGrouping.tsx                   ← 토글 + history (이미 history state 있음)
  ToolRoulette.tsx                   ← 토글 + 인덱스 우선 결정 패턴으로 전환
  ToolCoin.tsx                       ← 토글 (기본 OFF) + 직전 결과 회피
  ToolDice.tsx                       ← 토글 (기본 OFF) + 직전 결과 회피
adapters/stores/useToolRandomnessSettingsStore.ts  ← (신규 or 기존 store 확장)
```

domain 은 그대로 외부 의존 없음 — `secureRandom` 도 `() => number` 시그니처로 주입 가능.

---

## 7. Convention Prerequisites

### 7.1 Existing Project Conventions

- [x] CLAUDE.md 4레이어 의존성 규칙 — domain 은 외부 의존 X
- [x] strict TypeScript, `any` 금지
- [x] CI 하드 게이트: typecheck·lint·test·regression
- [x] 도메인 단위 테스트는 도메인 폴더 내 `.test.ts`

### 7.2 Conventions to Define

| Category | To Define | Priority |
|----------|-----------|----------|
| PRNG 주입 패턴 | "도메인 순수 함수가 randomness 필요 시 `random?: () => number` 인자 + 기본값 `secureRandom`" 명문화 | P0 (Design) |
| 도구 설정 영속화 | 도구별 boolean 토글의 영속 방식(localStorage 키 네임스페이스 또는 store) | P0 (Design) |
| 통계 테스트 허용 오차 | "max deviation ≤ 5% (1만 회 기준)" 같은 명시값 | P0 (Design) |

---

## 8. Next Steps

1. [x] 본 계획 작성
2. [ ] 사용자 승인 (P0 범위 + 도구별 토글 기본값 확정)
3. [ ] `/pdca design tool-randomness-improvement` — Design 문서:
   - `secureRandom`/`pickWithMemory` 시그니처 + 가중치 알고리즘 의사코드
   - 룰렛 "인덱스 먼저" 전환 다이어그램
   - 토글 영속화 방식 최종 결정 (localStorage 키 vs store)
   - 단위 테스트 케이스 목록
4. [ ] `/pdca do tool-randomness-improvement` — 구현 (예상 작업 시간 2~3시간)
5. [ ] `/pdca analyze` → ≥ 90% → `/pdca report`
6. [ ] 다음 패치 릴리즈(v2.0.5 후보)에 묶음

---

## Version History

| Date | Author | Changes |
|------|--------|---------|
| 2026-05-14 | pblsketch | Initial draft — 사용자 피드백 점검 + B+A 조합 방향 확정 후 작성 |
