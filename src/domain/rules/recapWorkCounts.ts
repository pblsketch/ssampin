/**
 * 한 주 정리·학기 돌아보기의 **관찰 밖 숫자 한 줄**(수업·끝낸 할 일·상담) 계산.
 *
 * - 선생님 자신이 한 일의 합계만 센다(ADR-134 허용 범위). 학생 이름·할 일 제목·예약자 정보는 다루지 않는다.
 * - **0인 항목은 줄에서 뺀다.** "상담 0건"은 벌주기로 읽힌다(관찰 2·3차의 "0일·0명" 규칙과 같은 까닭).
 * - 할 일은 완료 시각(`completedAt`)으로만 센다. 이 칸이 생기기 전에 끝낸 일과, 이 컴퓨터가 완료 시각을
 *   기록하기 시작한 날보다 앞선 시각(구글 할 일이 준 옛 시각 등)은 세지 않는다 — 화면의
 *   "M월 D일부터 센 수예요" 안내와 숫자가 맞아야 한다.
 * - 상담은 서버에서 받은 예약을 **칸 날짜**로 센다. 일정 하나라도 못 가져오면 상담 항목을 통째로 뺀다
 *   (`combineConsultationCount` — 일부만 더한 수는 실제보다 적어 보인다). 단, 서버가 **영영** 열어 주지
 *   않는 일정(다른 계정의 일정·기간이 끝난 옛 일정 등)은 그 일정만 빼고 센다 — 선생님도 볼 수 없는 일정이다.
 */
import type { ProgressEntry } from '@domain/entities/CurriculumProgress';
import type { ConsultationSchedule } from '@domain/entities/Consultation';
import type { Todo } from '@domain/entities/Todo';
import { formatLocal } from './schoolCalendarDays';

/** 'YYYY-MM-DD' 양 끝 포함 기간. */
export interface DateRange {
  readonly start: string;
  readonly end: string;
}

function inRange(date: string, range: DateRange): boolean {
  return date >= range.start && date <= range.end;
}

/** 기간을 오늘까지로 자른다 — 오늘 뒤는 세지 않는다. 기간이 통째로 미래면 null. */
export function clampRangeToToday(range: DateRange, today: string): DateRange | null {
  if (range.start > today) return null;
  return range.end > today ? { start: range.start, end: today } : range;
}

/** ISO 시각 → 로컬 'YYYY-MM-DD'. 읽을 수 없으면 null. */
function localDateOf(iso: string): string | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : formatLocal(d);
}

/** 기간 안에 '완료'로 적은 진도 차시 수. 보관한 반도 센다(반을 따지지 않는다). */
export function countCompletedLessons(entries: readonly ProgressEntry[], range: DateRange): number {
  let n = 0;
  for (const e of entries) if (e.status === 'completed' && inRange(e.date, range)) n += 1;
  return n;
}

/** 반별 완료 차시(0인 반은 없음). */
export function completedLessonsByClass(
  entries: readonly ProgressEntry[],
  range: DateRange,
): ReadonlyMap<string, number> {
  const map = new Map<string, number>();
  for (const e of entries) {
    if (e.status !== 'completed' || !inRange(e.date, range)) continue;
    map.set(e.classId, (map.get(e.classId) ?? 0) + 1);
  }
  return map;
}

/**
 * 기간 안에 끝낸 할 일 수.
 * @param trackingSince 이 컴퓨터가 완료 시각을 기록하기 시작한 날. 이보다 앞선 완료 시각은 세지 않는다.
 *   null(읽을 수 없음)이면 거르지 않는다 — 거를 기준이 없다.
 */
export function countCompletedTodos(
  todos: readonly Todo[],
  range: DateRange,
  trackingSince: string | null,
): number {
  let n = 0;
  for (const t of todos) {
    if (!t.completed || t.completedAt === undefined) continue;
    const day = localDateOf(t.completedAt);
    if (day === null || !inRange(day, range)) continue;
    if (trackingSince !== null && day < trackingSince) continue;
    n += 1;
  }
  return n;
}

/** 상담 가능 날짜 가운데 기간 안의 날짜가 하나라도 있는 일정 — 서버에 물을 대상. 보관한 일정도 든다. */
export function schedulesInRange(
  schedules: readonly ConsultationSchedule[],
  range: DateRange,
): ConsultationSchedule[] {
  return schedules.filter((s) => s.dates.some((d) => inRange(d.date, range)));
}

/** 서버가 준 일정 하나의 칸·예약(필요한 칸만). */
export interface ConsultationDetailLike {
  readonly slots: readonly {
    readonly id: string;
    readonly date: string;
    readonly status: 'available' | 'booked' | 'blocked';
  }[];
  readonly bookings: readonly { readonly slotId: string }[];
}

/** 예약 가운데 예약된 칸의 날짜가 기간 안인 것의 수(학부모·학생 합계). 막아 둔 칸에 남은 예약은 세지 않는다. */
export function countConsultationBookings(
  details: readonly ConsultationDetailLike[],
  range: DateRange,
): number {
  let n = 0;
  for (const detail of details) {
    const slotDate = new Map(
      detail.slots.filter((s) => s.status !== 'blocked').map((s) => [s.id, s.date]),
    );
    for (const b of detail.bookings) {
      const date = slotDate.get(b.slotId);
      if (date !== undefined && inRange(date, range)) n += 1;
    }
  }
  return n;
}

/** 서버가 이 계정에는 영영 열어 주지 않는 일정 — 상담 수에서 그 일정만 뺀다(ADR-138). */
export const CONSULTATION_UNREADABLE = 'unreadable';

/** 일정 하나의 답: 받은 칸·예약, 잠깐 실패(null), 영영 열 수 없음. */
export type ConsultationDetailResult =
  | ConsultationDetailLike
  | null
  | typeof CONSULTATION_UNREADABLE;

/**
 * 일정마다 받은 답을 합친다 — **잠깐 실패(null)가 하나라도 있으면 null**(상담 항목을 뺀다). 성공한 일정만
 * 더한 수는 실제보다 적어 보인다. 영영 열 수 없는 일정은 그 일정만 빼고 센다. 물을 일정이 없으면 0.
 */
export function combineConsultationCount(
  details: readonly ConsultationDetailResult[],
  range: DateRange,
): number | null {
  if (details.some((d) => d === null)) return null;
  const readable = details.filter(
    (d): d is ConsultationDetailLike => d !== null && d !== CONSULTATION_UNREADABLE,
  );
  return countConsultationBookings(readable, range);
}

/**
 * 그 학기의 '끝낸 할 일'이 학기 중간부터 센 수인가 — 학기가 기록 시작일보다 먼저 시작했거나,
 * 기록 시작일을 읽을 수 없으면 그렇다.
 */
export function isPartialTodoTerm(termStart: string, trackingSince: string | null): boolean {
  return trackingSince === null || termStart < trackingSince;
}

export type WorkCountKind = 'lessons' | 'todos' | 'consultations';

export interface WorkCountItem {
  readonly kind: WorkCountKind;
  readonly count: number;
}

export interface WorkCounts {
  readonly lessons: number;
  readonly todos: number;
  /** null = 가져오지 못했거나 아직 오지 않음 → 항목을 적지 않는다 */
  readonly consultations: number | null;
}

/** 줄에 적을 항목(수업·끝낸 할 일·상담 순서, 0·null 은 뺀다). 비면 줄이 없다. */
export function workCountItems(counts: WorkCounts): WorkCountItem[] {
  const out: WorkCountItem[] = [];
  if (counts.lessons > 0) out.push({ kind: 'lessons', count: counts.lessons });
  if (counts.todos > 0) out.push({ kind: 'todos', count: counts.todos });
  if (counts.consultations !== null && counts.consultations > 0) {
    out.push({ kind: 'consultations', count: counts.consultations });
  }
  return out;
}

/** 그림에 넣을 항목 — 학기 중간부터 센 학기면 끝낸 할 일을 뺀다(설명 없이 퍼지는 그림이라서). */
export function pngWorkCountItems(counts: WorkCounts, partialTodoTerm: boolean): WorkCountItem[] {
  return workCountItems(partialTodoTerm ? { ...counts, todos: 0 } : counts);
}

const LABEL: Record<WorkCountKind, (n: number) => string> = {
  lessons: (n) => `수업 ${n}차시`,
  todos: (n) => `끝낸 할 일 ${n}개`,
  consultations: (n) => `상담 ${n}건`,
};

/** "수업 18차시 · 끝낸 할 일 9개 · 상담 3건" — 항목이 없으면 null. */
export function workCountLine(items: readonly WorkCountItem[]): string | null {
  if (items.length === 0) return null;
  return items.map((i) => LABEL[i.kind](i.count)).join(' · ');
}
