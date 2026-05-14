# tool-randomness-improvement 설계서

> **Summary**: [Plan 계획서](../../01-plan/features/tool-randomness-improvement.plan.md) 의 P0 항목을 구현 가능한 단위로 분해. (A) `domain/rules/randomRules.ts` 의 `secureRandom`/`pickWithMemory` 신규 시그니처 + 의사코드, (B) 룰렛의 "회전→각도→인덱스" 결정 순서를 "인덱스→각도" 로 뒤집는 전환 설계, (C) `Settings` 엔티티에 `toolRandomness` 옵셔널 필드 1개 추가로 영속화(별도 localStorage·store 신설 없이 `settingsRepository` 경유 → Google Drive sync 자동 포함), (D) 1만 회 분포 단위 테스트 케이스 목록.
>
> **Project**: 쌤핀 (SsamPin)
> **Version**: v2.0.5 후보 (다음 패치 릴리즈)
> **Author**: pblsketch
> **Date**: 2026-05-14
> **Status**: Draft

---

## 1. Architecture Overview

본 작업은 **domain/rules 순수 함수 확장** + **adapters UI 토글** + **Settings 엔티티 1필드 추가**. infrastructure/usecases 변경 없음.

### 1.1 Layer Touchpoints

```
domain/
  rules/randomRules.ts                ← secureRandom, pickWithMemory, pickIndexWithMemory 추가
  rules/randomRules.test.ts           ← (신규) 분포 + 회피 검증
  rules/groupingRules.ts              ← random 인자 기본값이 secureRandom 으로 자동 승계 (호출 변경 없음)
  entities/Settings.ts                ← toolRandomness 옵셔널 필드 1개 추가

adapters/
  stores/useSettingsStore.ts          ← DEFAULT_SETTINGS 에 toolRandomness 기본값 + helper getter
  components/Tools/
    ToolRandom.tsx                    ← 토글 UI + pickedItems 를 history 로 활용 (이미 state 있음)
    ToolGrouping.tsx                  ← 토글 UI + 직전 배치된 멤버 페어 회피 (기존 history 활용)
    ToolRoulette.tsx                  ← 토글 UI + 결정 순서 전환 (인덱스 먼저 → 회전 각도 역산)
    ToolCoin.tsx                      ← 토글 UI + lastResultRef 추가 (직전 결과 ref)
    ToolDice.tsx                      ← 토글 UI + 직전 results 회피 (history state 이미 존재)
```

### 1.2 Why Settings Entity Extension (not localStorage)

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| `localStorage` 단일 키 | 단순, 추가 인프라 0 | Google Drive sync 누락, 신규 기기에서 초기화 | ❌ |
| 신규 `useToolRandomnessStore` zustand | 도구 독립적 | 새 store + 새 repository + sync registry 등록 필요 (4곳) | ❌ |
| **`Settings.toolRandomness` 옵셔널 필드** | 기존 sync 인프라 무료 활용, store 1곳만 수정 | Settings 엔티티 약간 비대 | ✅ |

이미 [`Settings.ts:355-385`](../../../src/domain/entities/Settings.ts#L355) 에 `favoriteTools` / `toolsOrder` / `hiddenTools` / `bookmarkWidgetHiddenGroups` 같은 도구 관련 옵셔널 필드들이 같은 패턴으로 모여 있다. 일관성 확보.

---

## 2. Domain Layer Design (randomRules.ts)

### 2.1 New Signatures

```typescript
// domain/rules/randomRules.ts

/**
 * 암호학적 엔트로피 기반 PRNG (균등 분포 [0, 1))
 * - 브라우저: window.crypto.getRandomValues
 * - Node 19+: globalThis.crypto.getRandomValues
 * - fallback: Math.random (테스트/극단적 환경)
 */
export function secureRandom(): number {
  const c: Crypto | undefined =
    (typeof globalThis !== 'undefined' && (globalThis as { crypto?: Crypto }).crypto) ||
    undefined;
  if (c && typeof c.getRandomValues === 'function') {
    const arr = new Uint32Array(1);
    c.getRandomValues(arr);
    return arr[0]! / 0x100000000; // 2^32
  }
  return Math.random();
}

/** anti-repeat 옵션 */
export interface PickMemoryOptions {
  /** 회피할 직전 결과 (최신순). 기본 빈 배열 */
  readonly history?: readonly string[];
  /** 회피 가중치 (0~1, 기본 0.25 = 평소 빈도의 25%) */
  readonly recentPenalty?: number;
  /** 회피 윈도우 크기 (history 중 최근 N개만 회피, 기본 3) */
  readonly windowSize?: number;
  /** 난수 소스 (기본 secureRandom) */
  readonly random?: () => number;
}

/**
 * 가중치 룰렛 휠로 pool 에서 1개 선택.
 * - history[0..windowSize-1] 항목은 가중치 recentPenalty (기본 0.25)
 * - 나머지는 가중치 1
 * - 누적 가중치 0 (전부 회피 + pool 작음) → 균등 픽 fallback
 */
export function pickWithMemory<T extends string>(
  pool: readonly T[],
  options: PickMemoryOptions = {},
): T | undefined {
  if (pool.length === 0) return undefined;
  const {
    history = [],
    recentPenalty = 0.25,
    windowSize = 3,
    random = secureRandom,
  } = options;

  const recent = new Set(history.slice(0, windowSize));
  const weights = pool.map((item) => (recent.has(item) ? recentPenalty : 1));
  const total = weights.reduce((a, b) => a + b, 0);

  if (total <= 0) {
    // fallback: uniform pick
    return pool[Math.floor(random() * pool.length)];
  }

  let target = random() * total;
  for (let i = 0; i < pool.length; i++) {
    target -= weights[i]!;
    if (target <= 0) return pool[i];
  }
  return pool[pool.length - 1]; // numerical safety
}

/**
 * 인덱스 기반 anti-repeat 픽 (룰렛처럼 인덱스가 의미를 가질 때).
 * - history 는 직전에 뽑힌 "인덱스" 목록 (최신순)
 */
export function pickIndexWithMemory(
  poolSize: number,
  options: Omit<PickMemoryOptions, 'history'> & {
    readonly history?: readonly number[];
  } = {},
): number {
  if (poolSize <= 0) return -1;
  const {
    history = [],
    recentPenalty = 0.25,
    windowSize = 3,
    random = secureRandom,
  } = options;

  const recent = new Set(history.slice(0, windowSize));
  const weights = Array.from({ length: poolSize }, (_, i) =>
    recent.has(i) ? recentPenalty : 1,
  );
  const total = weights.reduce((a, b) => a + b, 0);

  if (total <= 0) return Math.floor(random() * poolSize);

  let target = random() * total;
  for (let i = 0; i < poolSize; i++) {
    target -= weights[i]!;
    if (target <= 0) return i;
  }
  return poolSize - 1;
}
```

### 2.2 Existing Function Updates

```typescript
// 시그니처 호환 — random 기본값만 Math.random → secureRandom
export function shuffleArray<T>(
  arr: readonly T[],
  random: () => number = secureRandom,  // ← 변경
): T[] { /* unchanged body */ }

export function pickRandom<T>(
  arr: readonly T[],
  count: number,
  random: () => number = secureRandom,  // ← 변경
): T[] { /* unchanged body */ }

export function pickRandomExcluding<T>(
  arr: readonly T[],
  exclude: readonly T[],
  count: number,
  random: () => number = secureRandom,  // ← 변경
): T[] { /* unchanged body */ }
```

→ `groupingRules.ts:5` 의 `import { shuffleArray }` 는 변경 없이 자동 승계.

### 2.3 Domain Purity 보장

- `secureRandom` 은 `globalThis.crypto` 만 조회 — 외부 라이브러리 import 0
- 모든 함수가 `random?: () => number` 주입 가능 → 테스트는 seeded PRNG 주입
- CLAUDE.md "domain 은 외부 의존 없음" 규칙 준수 (전역 브라우저/Node API 는 양쪽 표준이라 허용)

---

## 3. Settings Entity Extension

### 3.1 New Field

```typescript
// src/domain/entities/Settings.ts (기존 도구 관련 옵셔널 필드들 뒤에 추가)

/** 쌤도구 난수 옵션 — "골고루 모드" 토글. 미설정 시 도구별 기본값(랜덤뽑기/조정하기/룰렛 ON, 동전/주사위 OFF) */
readonly toolRandomness?: {
  readonly random?: boolean;     // 랜덤뽑기 — 기본 true
  readonly grouping?: boolean;   // 조 정하기 — 기본 true
  readonly roulette?: boolean;   // 룰렛    — 기본 true
  readonly coin?: boolean;       // 동전    — 기본 false
  readonly dice?: boolean;       // 주사위   — 기본 false
};
```

### 3.2 Defaults in useSettingsStore

```typescript
// src/adapters/stores/useSettingsStore.ts
const DEFAULT_TOOL_RANDOMNESS = {
  random: true,
  grouping: true,
  roulette: true,
  coin: false,
  dice: false,
} as const;

// helper (도구가 호출)
export function getToolRandomnessOn(
  settings: Settings | undefined,
  tool: 'random' | 'grouping' | 'roulette' | 'coin' | 'dice',
): boolean {
  return settings?.toolRandomness?.[tool] ?? DEFAULT_TOOL_RANDOMNESS[tool];
}
```

각 도구 컴포넌트에서:
```typescript
const settings = useSettingsStore((s) => s.settings);
const updateSettings = useSettingsStore((s) => s.updateSettings);
const isOn = getToolRandomnessOn(settings, 'random');

const toggleOn = () => {
  updateSettings({
    toolRandomness: { ...settings.toolRandomness, random: !isOn },
  });
};
```

→ `settingsRepository` 가 자동 영속화 + Google Drive 동기화 등록 무료.

---

## 4. Tool UI Integration

### 4.1 Common Toggle Component

```typescript
// adapters/components/Tools/RandomnessToggle.tsx (신규, 약 30줄)
interface Props {
  isOn: boolean;
  onChange: (next: boolean) => void;
  className?: string;
}

export function RandomnessToggle({ isOn, onChange, className }: Props) {
  return (
    <label className={`flex items-center gap-2 text-xs text-sp-muted cursor-pointer ${className ?? ''}`}>
      <span>골고루 모드</span>
      <button
        type="button"
        onClick={() => onChange(!isOn)}
        className={`relative w-8 h-4 rounded-full transition-colors ${isOn ? 'bg-sp-accent' : 'bg-sp-border'}`}
        aria-pressed={isOn}
        aria-label={`골고루 모드 ${isOn ? '켜짐' : '꺼짐'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${isOn ? 'translate-x-4' : 'translate-x-0'}`} />
      </button>
      <span
        className="text-sp-muted/60 cursor-help"
        title="최근에 나온 결과를 잠시 덜 뽑습니다. 확률 학습 용도라면 끄세요."
      >
        ⓘ
      </span>
    </label>
  );
}
```

### 4.2 Per-Tool Wiring

#### ToolRandom (랜덤뽑기) — 기본 ON

- `pickedItems` state 가 이미 있음 → 그대로 `history` 로 활용
- `runSlotAnimation` 의 final pick 자리에서 `isOn ? pickWithMemory(pool, { history: pickedItems }) : pickRandom(pool, 1)[0]`
- `multipleCount` 경로도 동일: N번 반복 호출하면서 결과를 history 에 누적
- Order 모드는 단일 picked 가 아니라 전체 셔플이라 anti-repeat 미적용 (자연스러움)

#### ToolGrouping (조 정하기) — 기본 ON

- 직전 `history[0]` 의 모든 모둠 멤버 쌍(`(a,b)`)을 회피 — 단순 구현
- `assignGroups` 옵션에 `avoidPairs?: readonly [string, string][]` 신규 추가
- 가중치는 모둠 배치 단계에서 적용: 동일 그룹에 이미 들어간 멤버와 history pair 가 일치할 가능성을 줄임 (간단히는 random 인자로 anti-pair-weighted shuffle 주입)
- **단순화 안**: history pair 회피 대신 "직전 배치된 모든 학생을 다시 같은 그룹에 두지 않음" 정도로 약하게 → Design 복잡도 ↓, 효과 충분

#### ToolRoulette (룰렛) — 기본 ON ⭐ **결정 순서 전환**

현재 흐름:
```
spin() {
  rotation += extraRotations + randomOffset  ← Math.random
  setRotation(newRotation)
  // 3.5초 transition
}
handleTransitionEnd() {
  finalAngle = rotation % 360
  idx = floor((360 - finalAngle) / sectionAngle)  ← 인덱스 사후 계산
}
```

신규 흐름:
```
spin() {
  // 1. 인덱스 먼저 결정
  targetIdx = isOn
    ? pickIndexWithMemory(items.length, { history: historyIdx })
    : Math.floor(secureRandom() * items.length)

  // 2. 해당 섹션의 중앙 각도 계산
  sectionAngle = 360 / items.length
  targetSectionMid = -90 + (targetIdx + 0.5) * sectionAngle   // SVG 좌표
  // 포인터가 top(-90)에 있고 wheel 시계방향 회전 → wheel 안에서 포인터는 각도 (360 - finalAngle) % 360
  // targetSectionMid 가 포인터 아래 오려면 finalAngle = (360 - (targetSectionMid - (-90))) % 360
  // = (360 - targetIdx*sectionAngle - sectionAngle/2) % 360 (정규화)

  // 3. 시각화: 7~11바퀴 + 약간의 흔들림 jitter
  const fullSpins = (7 + Math.floor(secureRandom() * 5)) * 360
  const jitter = (secureRandom() - 0.5) * (sectionAngle * 0.6)  // 섹션 내부에서 약간 흔들림
  const targetAngle = computeAngleForIndex(targetIdx) + jitter
  const newRotation = rotation + fullSpins + ((targetAngle - rotation % 360 + 360) % 360)

  setRotation(newRotation)
}
handleTransitionEnd() {
  // 결정된 winnerIdx 를 그대로 사용 (재계산 안 함)
  setWinner(items[winnerIdx])
  setHistoryIdx([winnerIdx, ...prev].slice(0, 10))
}
```

→ winner 가 사전 결정되므로 anti-repeat 와 양립. jitter 로 "섹션 중앙에 정확히 멈춤" 이라는 부자연스러움도 회피.

#### ToolCoin (동전) — 기본 OFF

- `lastResultRef = useRef<'heads' | 'tails' | null>(null)` 신규
- ON 일 때: `isHeads = pickWithMemory(['heads', 'tails'], { history: lastResultRef.current ? [lastResultRef.current] : [], windowSize: 1 }) === 'heads'`
- OFF 일 때: `secureRandom() < 0.5`

#### ToolDice (주사위) — 기본 OFF

- ON + diceCount=1 일 때: `pickIndexWithMemory(6, { history: history.flat().slice(0, 3) }) + 1`
- ON + diceCount≥2 일 때: 각 주사위 독립 (회피 윈도우 의미 약함) — 단순히 `secureRandom` 만 적용
- OFF 일 때: 전부 `Math.floor(secureRandom() * 6) + 1`

---

## 5. Roulette Transition Diagram

```
[BEFORE — 회전 우선]
spin → setRotation(currentRotation + 360*(5+rand*3) + rand*360)
      → CSS transition 3.5s
      → onTransitionEnd 에서 finalAngle 으로부터 idx 역산
      → setWinner(items[idx])
      ⚠ anti-repeat 불가 (회전 후에 인덱스가 정해짐)

[AFTER — 인덱스 우선]
spin → targetIdx = isOn ? pickIndexWithMemory(...) : uniform pick
     → targetAngle = sectionMidAngle(targetIdx) + jitter(±0.3 section)
     → newRotation = current + fullSpins(7..11) + alignDelta(targetAngle)
     → setRotation(newRotation)
     → CSS transition 3.5s
     → onTransitionEnd 에서 그대로 setWinner(items[targetIdx])
     ✓ anti-repeat 적용
     ✓ jitter 로 "정확히 중앙" 부자연스러움 회피
     ✓ 7~11바퀴로 시각 다양성 ↑ (P1-1 자연 흡수)
```

### Edge Cases

| Case | Handling |
|------|----------|
| `items.length === 0` | 기존과 동일 — spin 무시 |
| `items.length === 1` | targetIdx=0, jitter=0 |
| `items.length === 2` | sectionAngle=180, jitter cap 을 60도 이하로 (시각 안정) |
| 잦은 연속 spin | history 가 자동 누적되어 자연 회피 — OK |
| 항목 추가/삭제 직후 historyIdx 의 인덱스가 유효하지 않을 수 있음 | items 변경 시 setHistoryIdx([]) 로 리셋 (이미 setWinnerIndex(null) 자리에 함께) |

---

## 6. Test Plan

### 6.1 randomRules.test.ts (신규)

```typescript
describe('secureRandom', () => {
  test('returns [0, 1)', () => {
    for (let i = 0; i < 1000; i++) {
      const v = secureRandom();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  test('uniform distribution over 10 bins (10,000 samples, max deviation <= 5%)', () => {
    const bins = new Array(10).fill(0);
    const N = 10_000;
    for (let i = 0; i < N; i++) bins[Math.floor(secureRandom() * 10)]++;
    const expected = N / 10;
    const maxDev = Math.max(...bins.map((c) => Math.abs(c - expected))) / expected;
    expect(maxDev).toBeLessThanOrEqual(0.05);
  });
});

describe('pickWithMemory', () => {
  const seeded = (seed: number) => {
    let s = seed;
    return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  };

  test('returns undefined for empty pool', () => {
    expect(pickWithMemory([])).toBeUndefined();
  });

  test('uniform when history empty', () => {
    const pool = ['a', 'b', 'c', 'd'];
    const counts = { a: 0, b: 0, c: 0, d: 0 };
    const random = seeded(42);
    for (let i = 0; i < 4000; i++) {
      counts[pickWithMemory(pool, { random })!]++;
    }
    Object.values(counts).forEach((c) => {
      expect(Math.abs(c - 1000) / 1000).toBeLessThanOrEqual(0.08);
    });
  });

  test('reduces history items to ~recentPenalty rate', () => {
    const pool = ['a', 'b', 'c', 'd'];
    const counts = { a: 0, b: 0, c: 0, d: 0 };
    const random = seeded(7);
    for (let i = 0; i < 4000; i++) {
      counts[pickWithMemory(pool, { history: ['a'], recentPenalty: 0.25, random })!]++;
    }
    // a: 가중치 0.25, b/c/d: 가중치 1 → 기대치 a≈250/3250*4000=308, others≈1230
    expect(counts.a).toBeLessThan(500);
    expect(counts.a).toBeGreaterThan(150);
  });

  test('falls back to uniform when all weights zero (history covers pool, recentPenalty=0)', () => {
    const pool = ['a', 'b'];
    const result = pickWithMemory(pool, { history: ['a', 'b'], recentPenalty: 0, windowSize: 2 });
    expect(['a', 'b']).toContain(result);
  });
});

describe('pickIndexWithMemory', () => {
  test('returns -1 for empty pool', () => {
    expect(pickIndexWithMemory(0)).toBe(-1);
  });

  test('reduces history indices', () => {
    const counts = new Array(4).fill(0);
    const random = seeded(13);
    for (let i = 0; i < 4000; i++) {
      counts[pickIndexWithMemory(4, { history: [0], recentPenalty: 0.25, random })]++;
    }
    expect(counts[0]).toBeLessThan(counts[1]);
    expect(counts[0]).toBeLessThan(counts[2]);
  });
});

describe('shuffleArray default uses secureRandom (smoke)', () => {
  test('returns same elements', () => {
    const arr = [1, 2, 3, 4, 5];
    const shuffled = shuffleArray(arr);
    expect(shuffled.sort()).toEqual(arr);
  });
});
```

### 6.2 Manual RG Checklist

| RG | Tool | Steps | Pass Criteria |
|----|------|-------|---------------|
| RG-01 | 랜덤뽑기 | ON 모드로 같은 풀에서 10회 연속 뽑기 | 직전 뽑힌 학생이 다음 회에 즉시 나오는 빈도 감소 (체감) |
| RG-02 | 랜덤뽑기 | OFF 모드로 10회 | 클러스터 발생 가능, 균등 분포 |
| RG-03 | 조 정하기 | "다시 편성" 5회 연속 | 같은 멤버 조합이 반복되지 않음 |
| RG-04 | 룰렛 | ON 모드로 5회 spin | 직전 결과 동일 항목이 즉시 안 나옴, 회전이 자연스러움(중앙 정중앙 X) |
| RG-05 | 룰렛 | 항목 추가/삭제 후 spin | 인덱스 리셋되어 정상 동작 |
| RG-06 | 동전 | OFF 기본 + 100회 던지기 | 통계 약 50:50 (균등) |
| RG-07 | 동전 | ON 으로 토글 후 10회 | 직전 결과 회피 체감 |
| RG-08 | 주사위 | OFF 기본 + 100회 | 6면 분포 거의 균등 |
| RG-09 | 영속화 | 토글 변경 → 앱 재시작 | 직전 상태 유지 |
| RG-10 | Google Drive sync | 토글 변경 → 다른 기기 | 동기화 후 동일 토글 상태 |

### 6.3 Existing Test Stability

- `groupingRules.test.ts` / `randomRules` 관련 기존 도메인 테스트 — `shuffleArray` 호출이 random 인자 미주입 시 `secureRandom` 으로 자동 전환되지만, 행동(셔플 결과의 통계적 성질)은 동일하므로 회귀 없음
- regression-check #5 (rate limit 리팩토링 반영) 영향 없음

---

## 7. Implementation Order (Do 단계 가이드)

```
1. domain/rules/randomRules.ts      — secureRandom + pickWithMemory + pickIndexWithMemory + 기본값 변경
2. domain/rules/randomRules.test.ts — 분포 + 회피 + fallback 테스트
3. domain/entities/Settings.ts      — toolRandomness 옵셔널 필드 추가
4. adapters/stores/useSettingsStore.ts — DEFAULT_TOOL_RANDOMNESS + getToolRandomnessOn 헬퍼
5. adapters/components/Tools/RandomnessToggle.tsx — 공용 토글 컴포넌트
6. ToolRandom.tsx                   — 토글 + pickWithMemory 적용 (single/multiple)
7. ToolGrouping.tsx                 — 토글 + (단순 안: 직전 배치 멤버 회피)
8. ToolRoulette.tsx                 — 토글 + 결정 순서 전환 (가장 큰 변경)
9. ToolCoin.tsx                     — 토글 + lastResultRef
10. ToolDice.tsx                    — 토글 + history 활용
11. `npm run typecheck && npm run lint && npm run test` — 그린 확인
12. 빌드 + 5개 도구 수동 RG (RG-01~RG-10)
```

예상 작업 시간: 2.5~3.5시간 (룰렛 전환이 절반 차지).

---

## 8. Risks & Mitigations (Plan §5 보강)

| Risk | Status from Plan | Resolution in Design |
|------|------------------|----------------------|
| crypto.getRandomValues Electron 호환 | Medium / Low | `secureRandom` 내 fallback to Math.random 으로 안전망. Electron renderer 는 `window.crypto`, main 프로세스는 Node 19+(`globalThis.crypto`) — package.json node 요구사항 점검 후 fallback 보장 |
| 룰렛 회전/결과 불일치 | High / Low | "인덱스 → 각도" 전환 다이어그램 + jitter 로 시각 안정 + 항목 변경 시 historyIdx 리셋 |
| 영속화 인프라 비대 | Medium / Low | Settings 엔티티 1필드 추가로 해결, store 신설 X |
| 통계 테스트 flaky | Medium / Medium | secureRandom 별도 통계 테스트(허용 5%) + pickWithMemory 는 seeded PRNG (결정론) |
| 도메인 외부 의존 | (신규) | `globalThis.crypto` 는 브라우저/Node 양쪽 표준 — fallback 포함하면 안전. 시그니처 주입 패턴 유지 |
| Grouping anti-pair 복잡도 | (신규) | Design 에서 "직전 배치된 모든 학생을 같은 그룹에 두지 않음" 단순화. 효과 충분, 구현 단순 |

---

## 9. Open Questions

| # | Question | Default Answer (Design 확정) |
|---|----------|------------------------------|
| Q1 | grouping anti-repeat 단순화 안 채택? | **Yes** — 직전 history[0] 의 그룹 동일 멤버 쌍 회피만. 가중치 적용은 멤버별 random 시드에 noise 주입 |
| Q2 | 룰렛 jitter 범위 | sectionAngle * 0.6 (섹션의 60% 안에서 흔들림, 경계는 안 침범) |
| Q3 | pickWithMemory windowSize default | 3 (직전 3회 회피) |
| Q4 | recentPenalty default | 0.25 (평소 빈도의 25%) |
| Q5 | 토글 영속화 위치 | `Settings.toolRandomness` 옵셔널 5필드 |
| Q6 | RandomnessToggle 공용 컴포넌트화? | Yes — 5곳 중복 회피 |

---

## 10. Next Steps

1. [x] Design 작성
2. [ ] 사용자 승인 + Open Questions Q1~Q6 confirm
3. [ ] `/pdca do tool-randomness-improvement` — 구현 진행 (구현 순서는 §7 참고)
4. [ ] `/pdca analyze` — Match Rate ≥ 90% 목표
5. [ ] `/pdca report` → 다음 패치 릴리즈에 묶음

---

## Version History

| Date | Author | Changes |
|------|--------|---------|
| 2026-05-14 | pblsketch | Initial design — Plan §2.1 의 P0-A/B/C/D 모두 구현 단위로 분해. 룰렛 결정 순서 전환 다이어그램 + 영속화는 Settings 엔티티 확장으로 결정 |
