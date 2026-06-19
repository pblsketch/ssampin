/**
 * 지필평가 배점 계산 — 도메인 규칙 (순수 함수).
 *
 * 계획서: docs/01-plan/features/exam-score-allocator.plan.md
 *
 * 핵심 불변식 (D1 — 부동소수점 안전):
 * - 배점은 소수점을 허용한다. JS 부동소수점 합산은 `3.5 × 20 = 69.99999…` 같은
 *   드리프트를 일으키므로, 모든 합산/비교를 "센티포인트(×100 정수)"로 수행한다.
 *   (3.5×20=70.0, 0.1×10=1.0 이 정확히 떨어진다)
 * - 엔티티(ExamItem.points)는 number 로 보관하되, 산술은 반드시 이 파일만 통과한다.
 *
 * 외부 의존성 import 금지 — id/시각 생성은 호출자가 주입한다.
 */
import type { ExamItem, ExamPaper, ItemType } from '../entities/ExamPaper';
import { WRITTEN_TYPES, difficultyTierLabel } from '../entities/ExamPaper';

/* ──────────────── 센티포인트 (부동소수점 안전 핵심) ──────────────── */

/** 점수(소수 둘째자리까지) → 센티포인트 정수. 예: 3.5 → 350 */
export function toCents(points: number): number {
  return Math.round(points * 100);
}

/** 센티포인트 정수 → 점수. 예: 350 → 3.5 */
export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

/** 센티포인트 합산 (내부 헬퍼). */
function sumCents(items: readonly ExamItem[]): number {
  return items.reduce((acc, item) => acc + toCents(item.points), 0);
}

/* ──────────────── 합산 · 잔여 ──────────────── */

/** 배점 합계 — 센티 합산 후 환산 (드리프트 0). */
export function sumPoints(items: readonly ExamItem[]): number {
  return fromCents(sumCents(items));
}

/** 잔여 = 만점 − 합계. 초과 시 음수. */
export function remaining(items: readonly ExamItem[], fullScore: number): number {
  return fromCents(toCents(fullScore) - sumCents(items));
}

/** 합계가 만점과 정확히 일치하는지 (센티 정수 비교). */
export function isBalanced(items: readonly ExamItem[], fullScore: number): boolean {
  return sumCents(items) === toCents(fullScore);
}

/* ──────────────── 유형별 집계 ──────────────── */

export interface TypeSubtotals {
  readonly choice: number;
  readonly short: number;
  readonly essay: number;
}

/** 유형별 배점 소계. */
export function subtotalByType(items: readonly ExamItem[]): TypeSubtotals {
  const cents: Record<ItemType, number> = { choice: 0, short: 0, essay: 0 };
  for (const item of items) {
    cents[item.type] += toCents(item.points);
  }
  return {
    choice: fromCents(cents.choice),
    short: fromCents(cents.short),
    essay: fromCents(cents.essay),
  };
}

/** 유형별 문항 수. */
export function itemCountByType(items: readonly ExamItem[]): Record<ItemType, number> {
  const counts: Record<ItemType, number> = { choice: 0, short: 0, essay: 0 };
  for (const item of items) {
    counts[item.type] += 1;
  }
  return counts;
}

/**
 * 서답형 비율(%) = (단답형 + 서술형 배점) / 만점 × 100.
 * 소수 1자리로 반올림한다. 만점이 0이면 0.
 */
export function writtenRatio(items: readonly ExamItem[], fullScore: number): number {
  const fullCents = toCents(fullScore);
  if (fullCents <= 0) return 0;
  const writtenCents = items
    .filter((item) => WRITTEN_TYPES.includes(item.type))
    .reduce((acc, item) => acc + toCents(item.points), 0);
  // 소수 1자리 반올림: (writtenCents / fullCents) × 100 을 0.1 단위로.
  return Math.round((writtenCents / fullCents) * 1000) / 10;
}

/**
 * 서답형 목표 비율 충족 여부. 목표 미설정(undefined)이면 항상 충족으로 본다.
 */
export function meetsWrittenTarget(
  items: readonly ExamItem[],
  fullScore: number,
  targetWrittenRatio: number | undefined,
): boolean {
  if (targetWrittenRatio === undefined) return true;
  return writtenRatio(items, fullScore) >= targetWrittenRatio;
}

/* ──────────────── 균등 배분 (결정론적) ──────────────── */

/**
 * 균등 배분 — 목표 점수(targetPoints)를 count개 문항에 step 단위로 나눈다.
 * step 단위로 떨어지지 않는 나머지는 **앞 문항부터 1 step 씩** 흡수한다(결정론적).
 * 합은 정확히 targetPoints 와 일치한다.
 *
 * 예) distributeEvenly(70, 20, 0.5) → 모두 3.5 (합 70)
 *     distributeEvenly(10, 3, 0.5)  → [3.5, 3.5, 3.0] (합 10)
 */
export function distributeEvenly(targetPoints: number, count: number, step: number): number[] {
  if (count <= 0) return [];
  const stepCents = toCents(step);
  const targetCents = toCents(targetPoints);

  // step 이 유효하지 않으면(0 이하) 센티 단위로 균등 분배 + 나머지 앞 흡수.
  const unitCents = stepCents > 0 ? stepCents : 1;

  const totalUnits = Math.round(targetCents / unitCents);
  const baseUnits = Math.floor(totalUnits / count);
  let remainderUnits = totalUnits - baseUnits * count;

  const result: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const units = baseUnits + (remainderUnits > 0 ? 1 : 0);
    if (remainderUnits > 0) remainderUnits -= 1;
    result.push(fromCents(units * unitCents));
  }
  return result;
}

/* ──────────────── 난이도별 배분 (상·중·하 비율 + 점수 급간) ──────────────── */

/**
 * 비율(가중치)대로 count개를 정수 문항수로 나눈다(최대 나머지 방식).
 * ratio 는 오름차순 난이도(index 0 = 가장 쉬움)의 상대 비중.
 * 합이 0이거나 길이가 0이면 균등 분배로 폴백한다. 합은 정확히 count.
 */
export function countsFromRatio(count: number, ratio: readonly number[]): number[] {
  const n = ratio.length;
  if (n === 0 || count <= 0) return [];
  const sum = ratio.reduce((acc, r) => acc + Math.max(0, r), 0);
  // 비율 합이 0이면 균등 분배.
  const raw =
    sum > 0 ? ratio.map((r) => (Math.max(0, r) / sum) * count) : ratio.map(() => count / n);
  const base = raw.map(Math.floor);
  let rem = count - base.reduce((acc, b) => acc + b, 0);
  // 나머지는 소수부가 큰 칸부터 1씩(동률이면 앞 칸 우선 — 결정론적).
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; rem > 0 && k < order.length; k += 1) {
    const o = order[k];
    if (!o) break;
    base[o.i] = (base[o.i] ?? 0) + 1;
    rem -= 1;
  }
  return base;
}

/** 난이도 한 단계의 배분 결과. */
export interface DifficultyTierPlan {
  /** 오름차순 난이도 단계 (0 = 가장 쉬움). */
  readonly level: number;
  /** 표시 라벨 (하/중/상 또는 난이도 N). */
  readonly label: string;
  /** 이 단계 문항 수. */
  readonly count: number;
  /** 각 문항 배점 (오름차순 — 같은 단계 안에서도 ±1 급간 가능). */
  readonly points: number[];
  /** 이 단계 최소·최대 배점 (점수 급간 표시용). */
  readonly minPoints: number;
  readonly maxPoints: number;
  /** 이 단계 배점 합. */
  readonly subtotal: number;
}

export interface DifficultyAllocation {
  readonly tiers: DifficultyTierPlan[];
  /** 실제 배점 합 (정상 입력이면 total 과 같다). */
  readonly total: number;
  /** 실제 문항 합 (정상 입력이면 count 와 같다). */
  readonly count: number;
}

export interface DifficultyAllocationInput {
  /** 이 블록(예: 객관식)의 총 배점. */
  readonly total: number;
  /** 이 블록의 총 문항 수. */
  readonly count: number;
  /** 배점간격 (한 급간 폭). */
  readonly step: number;
  /** 오름차순 난이도 문항수 비율 (예: 하·중·상 = [25,50,25]). */
  readonly ratio: readonly number[];
}

/**
 * 난이도별 배점 배분.
 *
 * 규칙:
 * - 문항수는 ratio(상·중·하 비율)대로 나눈다(균등 아님). → countsFromRatio
 * - 배점은 난이도가 한 단계 오를수록 step 만큼 오르는 "점수 급간"을 이룬다.
 *   (가장 쉬운 단계 = 최저 배점, 가장 어려운 단계 = 최고 배점)
 * - 합은 정확히 total 과 일치한다(센티/스텝 정수 연산으로 드리프트 0).
 *   total 이 step 의 배수가 아니면 가장 가까운 step 배수로 맞추고 남는 차이는
 *   가장 어려운 문항부터 한 급간씩 더 준다.
 *
 * 예) total=100, count=20, step=1, ratio=[25,50,25]
 *     → 하 4점×5, 중 5점×10, 상 6점×5 (합 100, 문항 20)
 */
export function allocateByDifficulty(input: DifficultyAllocationInput): DifficultyAllocation {
  const { total, count, step, ratio } = input;
  const stepCents = toCents(step) > 0 ? toCents(step) : 1;
  const totalUnits = Math.round(toCents(total) / stepCents); // step 단위 총량

  // 비율→문항수, 0인 단계는 제외하고 레벨을 다시 매긴다(오름차순 유지).
  const rawCounts = countsFromRatio(count, ratio);
  const counts: number[] = [];
  for (const c of rawCounts) if (c > 0) counts.push(c);
  const n = counts.length;
  if (n === 0 || count <= 0) {
    return { tiers: [], total: 0, count: 0 };
  }

  // 각 단계에 level(0..n-1)을 부여 → 같은 단계는 같은 배점, 단계가 오르면 +1 급간.
  const weighted = counts.reduce((acc, c, i) => acc + i * c, 0); // Σ(level×문항수)
  const baseUnits = Math.floor((totalUnits - weighted) / count);
  let rem = totalUnits - (baseUnits * count + weighted); // 0..count-1 (남는 급간)

  // 문항별 급간 수 (앞=쉬움, 뒤=어려움). 같은 단계는 baseUnits+level 로 동일.
  const itemUnits: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const c = counts[i] ?? 0;
    for (let j = 0; j < c; j += 1) {
      itemUnits.push(baseUnits + i);
    }
  }
  // 남는 급간은 가장 어려운 문항(배열 끝)부터 한 급간씩 더 준다 → 합 정확.
  for (let k = 0; rem > 0 && k < itemUnits.length; k += 1) {
    const idx = itemUnits.length - 1 - k;
    itemUnits[idx] = (itemUnits[idx] ?? 0) + 1;
    rem -= 1;
  }

  // 단계별로 묶어 결과 생성.
  const tiers: DifficultyTierPlan[] = [];
  let cursor = 0;
  for (let i = 0; i < n; i += 1) {
    const c = counts[i] ?? 0;
    const points: number[] = [];
    for (let j = 0; j < c; j += 1) {
      points.push(fromCents((itemUnits[cursor] ?? 0) * stepCents));
      cursor += 1;
    }
    points.sort((a, b) => a - b);
    const subtotalCents = points.reduce((acc, p) => acc + toCents(p), 0);
    tiers.push({
      level: i,
      label: difficultyTierLabel(i, n),
      count: c,
      points,
      minPoints: points[0] ?? 0,
      maxPoints: points[points.length - 1] ?? 0,
      subtotal: fromCents(subtotalCents),
    });
  }

  return {
    tiers,
    total: fromCents(tiers.reduce((acc, t) => acc + toCents(t.subtotal), 0)),
    count: counts.reduce((acc, c) => acc + c, 0),
  };
}

/** 난이도 한 단계의 "단일 배점 + 문항수" (직접 입력 칸 채우기용). */
export interface DifficultyRow {
  readonly points: number;
  readonly count: number;
}

/**
 * 난이도별 "단일 배점 + 문항수"를 제안한다(직접 입력 칸 자동 채우기용).
 * 오름차순 난이도(하→중→상) 순서로 반환. 배점은 한 단계 오를수록 step 만큼 오르는
 * 연속값(하=base, 중=base+step, 상=base+2step), 문항수는 비율대로 나눈다.
 * 단일값이라 합이 total 과 ± 약간 어긋날 수 있다(사용자가 칸을 보고 조정).
 */
export function suggestDifficultyRows(input: DifficultyAllocationInput): DifficultyRow[] {
  const { total, count, step, ratio } = input;
  const counts = countsFromRatio(count, ratio);
  if (counts.length === 0 || count <= 0) return [];
  const stepCents = toCents(step) > 0 ? toCents(step) : 1;
  const totalUnits = Math.round(toCents(total) / stepCents);
  const weighted = counts.reduce((acc, c, i) => acc + i * c, 0);
  const baseUnits = Math.floor((totalUnits - weighted) / count);
  return counts.map((c, i) => {
    const units = Math.max(1, baseUnits + i); // 최소 1급간(배점 0 방지)
    return { points: fromCents(units * stepCents), count: c };
  });
}

/**
 * 난이도 배분 결과를 ExamItem 배열로 펼친다(시험지에 실제로 넣을 문항들).
 * 번호는 startNumber 부터 1씩, 난이도 라벨을 difficulty 에 매핑('하'|'중'|'상'만).
 * id 는 호출자가 주입(도메인은 id 생성 안 함).
 */
export function itemsFromAllocation(
  allocation: DifficultyAllocation,
  type: ItemType,
  startNumber: number,
  makeId: () => string,
): ExamItem[] {
  const items: ExamItem[] = [];
  let number = startNumber;
  for (const tier of allocation.tiers) {
    const difficulty =
      tier.label === '상' || tier.label === '중' || tier.label === '하' ? tier.label : undefined;
    for (const points of tier.points) {
      items.push({ id: makeId(), number, type, points, difficulty });
      number += 1;
    }
  }
  return items;
}

/* ──────────────── 검증 ──────────────── */

export interface ExamValidationIssue {
  /** 사용자에게 그대로 보여줄 한국어 메시지. */
  readonly message: string;
}

/**
 * 배점 설계 검증. 빈 배열이면 유효.
 * - 만점 > 0
 * - 각 배점 > 0 (유한수)
 * - 문항 번호 중복 없음
 * - 합계 = 만점 (문항이 1개 이상일 때)
 */
export function validatePaper(
  paper: Pick<ExamPaper, 'fullScore' | 'items'>,
): ExamValidationIssue[] {
  const issues: ExamValidationIssue[] = [];

  if (toCents(paper.fullScore) <= 0) {
    issues.push({ message: '만점은 0보다 커야 합니다.' });
  }

  paper.items.forEach((item) => {
    if (!Number.isFinite(item.points) || toCents(item.points) <= 0) {
      issues.push({ message: `${item.number}번 문항의 배점은 0보다 커야 합니다.` });
    }
  });

  const seen = new Set<number>();
  const duplicated = new Set<number>();
  for (const item of paper.items) {
    if (seen.has(item.number)) duplicated.add(item.number);
    seen.add(item.number);
  }
  if (duplicated.size > 0) {
    const list = [...duplicated].sort((a, b) => a - b).join(', ');
    issues.push({ message: `문항 번호가 중복됩니다: ${list}` });
  }

  if (paper.items.length > 0 && !isBalanced(paper.items, paper.fullScore)) {
    const diff = remaining(paper.items, paper.fullScore);
    issues.push({
      message:
        diff > 0
          ? `배점 합계가 만점보다 ${diff}점 부족합니다.`
          : `배점 합계가 만점보다 ${-diff}점 초과합니다.`,
    });
  }

  return issues;
}
