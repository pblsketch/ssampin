/**
 * 관찰 기록 '한 바퀴'(ADR-135) — 반 카드마다, 학기마다 구성원 모두를 한 번씩 기록하면 한 바퀴.
 *
 * - **끝난 바퀴는 그대로 둔다.** 저장된 끝 지점(`LapMark`)보다 앞의 기록은 지금 바퀴에 들어가지
 *   않는다. 지난 날짜로 더한 기록·지운 기록·전입생·돌아온 학생이 끝난 바퀴를 되돌리지 않는다.
 * - 지금 바퀴 = 이번 학기(시작일~오늘) 기록 가운데 끝 지점보다 뒤의 기록.
 *   오늘보다 뒤 날짜 기록은 그날이 올 때까지 넣지 않는다(날짜를 잘못 고른 기록 보호).
 * - 훑다가 구성원 모두가 한 번 이상 나오면 그 기록이 새 끝 지점이 된다. 한 번에 여러 바퀴도 된다.
 * - 이 파일은 **계산만** 한다. 새 끝 지점을 저장할지(이 컴퓨터에서 추가한 기록일 때만,
 *   기록이 늘었을 때만)는 호출자가 정한다. 화면은 저장 여부와 상관없이 계산대로 보여 준다.
 */
import type { LapBoundary, LapMark } from '../entities/ObservationLap';
import { comparePosition, sortEntries, type ObservationEntry } from './observationEntries';

export interface LapInput {
  readonly card: string;
  readonly term: string;
  /** 이번 학기 시작일 'YYYY-MM-DD' */
  readonly termStart: string;
  /** 오늘 'YYYY-MM-DD' */
  readonly today: string;
  /** 이 카드의 관찰 기록(날짜 제한 없이 넘겨도 된다) */
  readonly entries: readonly ObservationEntry[];
  /** 지금 구성원(재학 중이고 빠져 있지 않은 학생의 ref) */
  readonly memberRefs: readonly string[];
  /** 저장된 끝 지점. 다른 학기 것이면 무시한다. */
  readonly mark: LapMark | null;
}

export interface LapState {
  /** 지금 바퀴에 기록이 있는 구성원 */
  readonly filledRefs: ReadonlySet<string>;
  /** 지금 바퀴에서 아직 칠하지 않은 구성원 수 */
  readonly remaining: number;
  /** 이번 학기에 끝낸 바퀴 수(저장된 것 + 계산으로 새로 끝난 것) */
  readonly completedLaps: number;
  /** 지금 바퀴에 구성원 기록이 하나라도 있는가 */
  readonly currentLapHasRecords: boolean;
  /** 막 끝난 모습 — 이번 학기에 끝낸 바퀴가 있고 지금 바퀴에 기록이 없다 */
  readonly justFinished: boolean;
  /** 끝 지점 이전에 이번 학기 기록이 있는 학생(막 끝난 모습에서 칠해 보여 줄 학생) */
  readonly recordedBeforeBoundaryRefs: ReadonlySet<string>;
  /**
   * 계산으로 새로 끝난 바퀴가 있으면 그 끝 지점과 누적 바퀴 수. 없으면 null.
   * 저장 여부는 호출자가 정한다.
   */
  readonly newMark: LapMark | null;
  /** newMark 의 끝 지점이 된 기록 id(저장 판단용) */
  readonly newBoundaryRecordId: string | null;
}

function boundaryOf(e: ObservationEntry): LapBoundary {
  return { date: e.date, createdAt: e.createdAt, recordId: e.id };
}

function positionOfBoundary(b: LapBoundary): { date: string; createdAt: number; id: string } {
  return { date: b.date, createdAt: b.createdAt, id: b.recordId };
}

export function compareBoundaries(a: LapBoundary, b: LapBoundary): number {
  return comparePosition(positionOfBoundary(a), positionOfBoundary(b));
}

export function computeLap(input: LapInput): LapState {
  const members = new Set(input.memberRefs);
  const mark =
    input.mark !== null && input.mark.term === input.term && input.mark.card === input.card
      ? input.mark
      : null;

  const inTerm = sortEntries(
    input.entries.filter(
      (e) => e.card === input.card && e.date >= input.termStart && e.date <= input.today,
    ),
  );

  const storedBoundary = mark?.boundary ?? null;
  const afterStored =
    storedBoundary === null
      ? inTerm
      : inTerm.filter((e) => comparePosition(e, positionOfBoundary(storedBoundary)) > 0);

  let completions = 0;
  let lastBoundaryEntry: ObservationEntry | null = null;
  let seen = new Set<string>();
  // 지금 바퀴의 '구성원' 기록 수. 빠진 학생·구성원 아닌 학생의 기록으로는 막 끝난 모습을
  // 거두지 않는다 — 성공 직후 빈 판을 내밀지 않기 위해서다(spec §5).
  let recordsSinceBoundary = 0;
  for (const e of afterStored) {
    if (members.has(e.ref)) {
      recordsSinceBoundary++;
      seen.add(e.ref);
    }
    if (members.size > 0 && seen.size === members.size) {
      completions++;
      lastBoundaryEntry = e;
      seen = new Set<string>();
      recordsSinceBoundary = 0;
    }
  }

  const completedLaps = (mark?.completed ?? 0) + completions;
  const effectiveBoundary: LapBoundary | null =
    lastBoundaryEntry !== null ? boundaryOf(lastBoundaryEntry) : storedBoundary;

  const recordedBeforeBoundaryRefs = new Set<string>();
  if (effectiveBoundary !== null) {
    const pos = positionOfBoundary(effectiveBoundary);
    for (const e of inTerm) {
      if (comparePosition(e, pos) <= 0) recordedBeforeBoundaryRefs.add(e.ref);
    }
  }

  const newMark: LapMark | null =
    lastBoundaryEntry !== null
      ? {
          card: input.card,
          term: input.term,
          completed: completedLaps,
          boundary: boundaryOf(lastBoundaryEntry),
        }
      : null;

  return {
    filledRefs: seen,
    remaining: members.size === 0 ? 0 : members.size - seen.size,
    completedLaps,
    currentLapHasRecords: recordsSinceBoundary > 0,
    justFinished: completedLaps > 0 && recordsSinceBoundary === 0,
    recordedBeforeBoundaryRefs,
    newMark,
    newBoundaryRecordId: lastBoundaryEntry?.id ?? null,
  };
}

/**
 * 같은 (card, term) 두 끝 지점을 합친다 — 끝 지점은 **더 뒤**, 바퀴 수는 **더 큰 값**.
 * 그래서 이미 응원한 (card, term, 바퀴 수)가 다시 쓰이지 않는다.
 */
export function mergeLapMark(a: LapMark, b: LapMark): LapMark {
  const cmp = compareBoundaries(a.boundary, b.boundary);
  const later = cmp >= 0 ? a : b;
  return { ...later, completed: Math.max(a.completed, b.completed) };
}

function markKey(m: Pick<LapMark, 'card' | 'term'>): string {
  return `${m.card}\u0000${m.term}`;
}

/** 두 목록을 (card, term)마다 `mergeLapMark` 로 합친다. 동기화 병합용. */
export function mergeLapMarkLists(
  a: readonly LapMark[] | undefined,
  b: readonly LapMark[] | undefined,
): LapMark[] {
  const map = new Map<string, LapMark>();
  // 파일이 깨져 목록이 아닌 값이 와도 병합이 멈추지 않게 한다.
  const listA: readonly unknown[] = Array.isArray(a) ? a : [];
  const listB: readonly unknown[] = Array.isArray(b) ? b : [];
  for (const m of [...listA, ...listB]) {
    if (!isValidLapMark(m)) continue;
    const key = markKey(m);
    const prev = map.get(key);
    map.set(key, prev === undefined ? m : mergeLapMark(prev, m));
  }
  return [...map.values()];
}

/**
 * 새 끝 지점을 목록에 넣는다 — 끝 지점은 **뒤로만**, 바퀴 수는 **큰 쪽으로만** 바뀐다.
 * 바뀌지 않았으면 `changed: false`.
 */
export function upsertLapMark(
  list: readonly LapMark[],
  next: LapMark,
): { readonly marks: LapMark[]; readonly changed: boolean } {
  const key = markKey(next);
  const prev = list.find((m) => markKey(m) === key);
  if (prev !== undefined) {
    const cmp = compareBoundaries(next.boundary, prev.boundary);
    // 끝 지점이 앞이거나 같고 바퀴 수도 크지 않으면 바꿀 것이 없다.
    // (앞이지만 바퀴 수가 크면 끝 지점은 그대로 두고 바퀴 수만 올린다 — mergeLapMark 와 같은 규칙.)
    if (cmp <= 0 && next.completed <= prev.completed) {
      return { marks: [...list], changed: false };
    }
  }
  const merged = prev === undefined ? next : mergeLapMark(prev, next);
  return { marks: [...list.filter((m) => markKey(m) !== key), merged], changed: true };
}

export function findLapMark(list: readonly LapMark[], card: string, term: string): LapMark | null {
  return list.find((m) => m.card === card && m.term === term) ?? null;
}

/** 파일에서 읽은 값이 끝 지점 모양인가 — 깨진 항목은 조용히 버린다. */
export function isValidLapMark(value: unknown): value is LapMark {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Record<string, unknown>;
  const b = m['boundary'] as Record<string, unknown> | undefined;
  return (
    typeof m['card'] === 'string' &&
    typeof m['term'] === 'string' &&
    typeof m['completed'] === 'number' &&
    Number.isFinite(m['completed']) &&
    (m['completed'] as number) >= 1 &&
    typeof b === 'object' &&
    b !== null &&
    typeof b['date'] === 'string' &&
    typeof b['createdAt'] === 'number' &&
    typeof b['recordId'] === 'string'
  );
}
