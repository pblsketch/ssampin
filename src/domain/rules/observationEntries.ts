/**
 * 관찰 기록 응원(ADR-135) — "무엇을 관찰 기록으로 세는가"의 단일 정본.
 *
 * 잔디·한 바퀴·종·기록 알림이 **모두 이 파일의 판정**을 쓴다. 따로 만들면 잔디의 종과
 * 알림이 다른 학생을 가리킨다.
 *
 * - 담임 누가기록: 갈래가 출결(`attendance`)이 아닌 기록만 센다. 상담(학부모상담 포함)·생활·
 *   기타(가정연락 포함)·선생님이 만든 갈래는 모두 센다.
 * - 수업반 관찰기록: 모두 센다.
 * - '여러 명 기록'도 학생마다 따로 센다(레코드가 학생마다 하나씩이다).
 * - 날짜는 기록에 적힌 `date`(사건 날짜)다. 같은 날짜끼리는 만든 시각, 그다음 id 순서다.
 */

/** 담임반 카드 키. 수업반은 `subject:${classId}`. */
export const HOMEROOM_CARD = 'homeroom';

export function subjectCard(classId: string): string {
  return `subject:${classId}`;
}

/** 담임·수업반 기록을 한 모양으로 모은 것. */
export interface ObservationEntry {
  /** 'homeroom' | `subject:${classId}` */
  readonly card: string;
  /** 담임: `Student.id` / 수업반: `studentKey` */
  readonly ref: string;
  /** 'YYYY-MM-DD' */
  readonly date: string;
  /** 만든 시각(ms). 알 수 없으면 0. */
  readonly createdAt: number;
  readonly id: string;
}

/** 담임 누가기록 가운데 관찰로 세는가 — 출결만 뺀다. */
export function isCountedHomeroomRecord(record: { readonly category: string }): boolean {
  return record.category !== 'attendance';
}

/** ISO 문자열·ms 숫자 어느 쪽이든 ms 로. 못 읽으면 0. */
export function toCreatedAtMs(value: string | number | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string' || value === '') return 0;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? 0 : ms;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function homeroomEntries(
  records: readonly {
    readonly id: string;
    readonly studentId: string;
    readonly category: string;
    readonly date: string;
    readonly createdAt?: string | number;
  }[],
): ObservationEntry[] {
  const out: ObservationEntry[] = [];
  for (const r of records) {
    if (!isCountedHomeroomRecord(r) || !DATE_RE.test(r.date)) continue;
    out.push({
      card: HOMEROOM_CARD,
      ref: r.studentId,
      date: r.date,
      createdAt: toCreatedAtMs(r.createdAt),
      id: r.id,
    });
  }
  return out;
}

export function subjectEntries(
  records: readonly {
    readonly id: string;
    readonly studentId: string;
    readonly classId: string;
    readonly date: string;
    readonly createdAt?: string | number;
  }[],
): ObservationEntry[] {
  const out: ObservationEntry[] = [];
  for (const r of records) {
    if (!DATE_RE.test(r.date)) continue;
    out.push({
      card: subjectCard(r.classId),
      ref: r.studentId,
      date: r.date,
      createdAt: toCreatedAtMs(r.createdAt),
      id: r.id,
    });
  }
  return out;
}

/** 정렬 위치 비교 — (date, createdAt, id). */
export function comparePosition(
  a: { readonly date: string; readonly createdAt: number; readonly id: string },
  b: { readonly date: string; readonly createdAt: number; readonly id: string },
): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

export function sortEntries(entries: readonly ObservationEntry[]): ObservationEntry[] {
  return [...entries].sort(comparePosition);
}

/**
 * 학생별 마지막 관찰 날짜. 오늘보다 뒤 날짜(날짜 잘못 고른 기록)는 그날이 올 때까지 세지 않는다.
 * 키는 `ref` — 한 카드의 기록만 넘겨야 한다.
 */
export function lastObservationDateByRef(
  entries: readonly ObservationEntry[],
  today: string,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const e of entries) {
    if (e.date > today) continue;
    const prev = map.get(e.ref);
    if (prev === undefined || e.date > prev) map.set(e.ref, e.date);
  }
  return map;
}
