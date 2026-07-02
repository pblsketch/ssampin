/**
 * 상담 예약 도메인 규칙 (순수 함수).
 *
 * - React/Zustand/fetch/Electron 등 외부 의존 절대 금지.
 * - 부수효과 없음. 테스트 가능한 입력 → 출력 함수만 정의한다.
 */

import type {
  ConsultationBooking,
  ConsultationDate,
  ConsultationSchedule,
  ConsultationSlot,
  ScheduleUpdateImpact,
  ScheduleUpdatePatch,
} from '../entities/Consultation';
import type { SchoolEvent } from '../entities/SchoolEvent';
import type { TimetableOverride } from '../entities/Timetable';

/** "HH:MM" → 분 */
function parseTime(hhmm: string): number {
  const parts = hhmm.split(':');
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

/** 분 → "HH:MM" */
function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0');
  const m = (minutes % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * 일정 + slotMinutes 로부터 (date, startTime) 키 집합을 생성한다.
 * 빈 시간대(예: end <= start)는 무시한다.
 */
function buildSlotKeys(dates: readonly ConsultationDate[], slotMinutes: number): Set<string> {
  const keys = new Set<string>();
  if (slotMinutes <= 0) return keys;

  for (const d of dates) {
    const start = parseTime(d.startTime);
    const end = parseTime(d.endTime);
    if (end <= start) continue;

    let cursor = start;
    while (cursor + slotMinutes <= end) {
      keys.add(`${d.date}_${formatTime(cursor)}`);
      cursor += slotMinutes;
    }
  }
  return keys;
}

/**
 * 일정 패치 시 영향받는 예약을 사전 계산한다.
 *
 * 호출 측이 슬롯·예약을 주입해야 한다(domain 레이어는 DB 접근 불가).
 *
 * 판정 우선순위:
 *  1. 새 슬롯 키 집합에 없음 → 'slot_removed'
 *  2. patch.blockedSlots 에 포함 → 'slot_blocked'
 *  3. patch.methods 가 명시되었고 booking.method 가 거기 없음 → 'method_unsupported'
 *  4. 그 외 → preserved
 */
export function analyzeScheduleUpdateImpact(
  current: ConsultationSchedule,
  patch: ScheduleUpdatePatch,
  slots: readonly ConsultationSlot[],
  bookings: readonly ConsultationBooking[],
): ScheduleUpdateImpact {
  const nextDates = patch.dates ?? current.dates;
  const nextSlotMinutes = patch.slotMinutes ?? current.slotMinutes;
  const nextMethods = patch.methods;

  const nextKeys = buildSlotKeys(nextDates, nextSlotMinutes);
  const blockedKeys = new Set((patch.blockedSlots ?? []).map((b) => `${b.date}_${b.startTime}`));

  const slotById = new Map<string, ConsultationSlot>();
  for (const s of slots) slotById.set(s.id, s);

  const preserved: ConsultationBooking[] = [];
  const affected: {
    booking: ConsultationBooking;
    reason: 'slot_removed' | 'slot_blocked' | 'method_unsupported';
  }[] = [];

  for (const booking of bookings) {
    const slot = slotById.get(booking.slotId);
    if (!slot) {
      // 슬롯 메타 자체를 찾을 수 없으면 보수적으로 slot_removed 로 분류
      affected.push({ booking, reason: 'slot_removed' });
      continue;
    }
    const key = `${slot.date}_${slot.startTime}`;
    if (!nextKeys.has(key)) {
      affected.push({ booking, reason: 'slot_removed' });
      continue;
    }
    if (blockedKeys.has(key)) {
      affected.push({ booking, reason: 'slot_blocked' });
      continue;
    }
    if (nextMethods && !nextMethods.includes(booking.method)) {
      affected.push({ booking, reason: 'method_unsupported' });
      continue;
    }
    preserved.push(booking);
  }

  return { preserved, affected };
}

/**
 * 단일 슬롯이 시간표·일정표의 busy 구간과 1분이라도 겹치는지 판정한다.
 *
 * Phase 2 의 `recomputeSlotAvailability` 가 사용한다. Phase 1 에서는 호출자가 없어도 export 만 유지.
 */
export function isSlotBlockedByTimetable(
  slot: { readonly date: string; readonly startTime: string; readonly endTime: string },
  busyPeriods: readonly {
    readonly date: string;
    readonly startTime: string;
    readonly endTime: string;
  }[],
): boolean {
  const slotStart = parseTime(slot.startTime);
  const slotEnd = parseTime(slot.endTime);
  if (slotEnd <= slotStart) return false;

  for (const busy of busyPeriods) {
    if (busy.date !== slot.date) continue;
    const busyStart = parseTime(busy.startTime);
    const busyEnd = parseTime(busy.endTime);
    if (busyEnd <= busyStart) continue;
    if (slotStart < busyEnd && busyStart < slotEnd) return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────
// Phase 2 — 일정표 ↔ 슬롯 가용성 동기화 입력 빌더
// ─────────────────────────────────────────────────────────────────────

export interface BusyPeriod {
  readonly date: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly source: 'event' | 'override';
  readonly sourceId: string;
}

/**
 * SchoolEvent 의 시간 범위를 우선순위에 따라 결정한다.
 *   1) startTime + endTime (HH:mm)
 *   2) time ("HH:mm - HH:mm" 형식)
 *   3) period — resolvePeriodTime 으로 변환. period 가 'allDay' 면 전일.
 *      periodEnd 가 있으면 periodEnd 의 end 시각까지.
 *
 * 매칭 안 되면 null (busy 로 잡지 않음).
 */
export function resolveEventTimeRange(
  ev: SchoolEvent,
  resolvePeriodTime: (period: string) => { start: string; end: string } | null,
): { start: string; end: string } | null {
  if (ev.startTime && ev.endTime) {
    return { start: ev.startTime, end: ev.endTime };
  }
  if (ev.time && ev.time.includes('-')) {
    const parts = ev.time.split('-').map((s) => s.trim());
    const s = parts[0];
    const e = parts[1];
    if (s && e && /^\d{1,2}:\d{2}$/.test(s) && /^\d{1,2}:\d{2}$/.test(e)) {
      return { start: s, end: e };
    }
  }
  if (ev.period) {
    if (ev.period === 'allDay') return { start: '00:00', end: '23:59' };
    const start = resolvePeriodTime(ev.period);
    if (!start) return null;
    if (ev.periodEnd) {
      const end = resolvePeriodTime(ev.periodEnd);
      if (end) return { start: start.start, end: end.end };
    }
    return start;
  }
  return null;
}

/**
 * 다일 행사(endDate 가 있는 경우)는 단순 inclusive 일자 확장.
 * recurrence(매주/매달 반복) 는 별도 PDCA 로 분리 — 지금은 단일 또는 endDate 만 처리.
 */
export function expandEventDates(ev: SchoolEvent, allowed: ReadonlySet<string>): string[] {
  const result: string[] = [];
  if (allowed.has(ev.date)) result.push(ev.date);

  if (ev.endDate && ev.endDate !== ev.date) {
    // ev.date ~ ev.endDate inclusive (최대 31일까지만 — 무한 루프 방지)
    const start = new Date(ev.date);
    const end = new Date(ev.endDate);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      const cursor = new Date(start);
      cursor.setDate(cursor.getDate() + 1);
      let safety = 0;
      while (cursor <= end && safety < 31) {
        const iso = cursor.toISOString().slice(0, 10);
        if (allowed.has(iso)) result.push(iso);
        cursor.setDate(cursor.getDate() + 1);
        safety += 1;
      }
    }
  }
  return result;
}

/**
 * 상담 일정 동기화의 입력 — busy 구간 배열.
 *
 * 입력 소스:
 *   - SchoolEvent (학교 행사·휴가·외부 일정 — `useEventsStore.events`)
 *   - TimetableOverride (수업 시간표 임시 변경 — `useScheduleStore.overrides`)
 *
 * 정책:
 *   - SchoolEvent 는 resolveEventTimeRange 로 시간 범위 결정 (시간 없으면 무시)
 *   - TimetableOverride.kind === 'cancel' 은 휴강 → busy 아님 (가용으로 둠)
 *     swap / substitute / custom 은 수업이 있는 시간이므로 busy
 *   - targetDates 외 일자는 모두 무시 (성능)
 *
 * 외부 의존 0. resolvePeriodTime 은 호출자가 주입한다.
 */
export function buildBusyPeriods(params: {
  readonly events: readonly SchoolEvent[];
  readonly overrides: readonly TimetableOverride[];
  readonly targetDates: readonly string[];
  readonly resolvePeriodTime: (period: string) => { start: string; end: string } | null;
}): readonly BusyPeriod[] {
  const allowed = new Set(params.targetDates);
  const result: BusyPeriod[] = [];

  // 1) SchoolEvent
  for (const ev of params.events) {
    const dates = expandEventDates(ev, allowed);
    if (dates.length === 0) continue;
    const range = resolveEventTimeRange(ev, params.resolvePeriodTime);
    if (!range) continue;
    for (const d of dates) {
      result.push({
        date: d,
        startTime: range.start,
        endTime: range.end,
        source: 'event',
        sourceId: ev.id,
      });
    }
  }

  // 2) TimetableOverride (cancel 제외)
  for (const ov of params.overrides) {
    if (!allowed.has(ov.date)) continue;
    if (ov.kind === 'cancel') continue;
    const range = params.resolvePeriodTime(String(ov.period));
    if (!range) continue;
    result.push({
      date: ov.date,
      startTime: range.start,
      endTime: range.end,
      source: 'override',
      sourceId: ov.id,
    });
  }

  return result;
}

/**
 * PeriodTime[] 에서 period 번호 → 시간 범위 변환 헬퍼.
 * domain 레이어에서 store 의존 없이 함수 생성용. 호출자가 useSettingsStore 에서 받아서 주입.
 */
export function makePeriodResolver(
  periodTimes: readonly { period: number; start: string; end: string }[],
): (period: string) => { start: string; end: string } | null {
  const map = new Map<string, { start: string; end: string }>();
  for (const pt of periodTimes) {
    map.set(String(pt.period), { start: pt.start, end: pt.end });
  }
  return (period) => map.get(period) ?? null;
}

/**
 * 상담 일정의 기본 자동 만료 시각을 계산한다.
 *
 * 정책: 마지막 상담일 **다음날 00:00 (KST, UTC+9)** 의 ISO 문자열.
 * 이 시각이 지나면 예약 링크가 자동으로 마감된다(= 마지막 상담일까지는 예약 가능).
 * 상담 날짜가 없으면 undefined (자동 만료 없음).
 */
export function computeDefaultConsultationExpiry(
  dates: readonly ConsultationDate[],
): string | undefined {
  if (dates.length === 0) return undefined;
  const lastDate = [...dates].sort((a, b) => b.date.localeCompare(a.date))[0]!.date;
  const [y, m, d] = lastDate.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  // Date.UTC(y, m-1, d) = 해당일 00:00 UTC.
  // 마지막 상담일 다음날 00:00 KST = 해당일 00:00 UTC + 15h
  //   (KST 자정은 UTC보다 9h 이르고, "다음날"이라 +24h → 합 +15h)
  const kstNextMidnightMs = Date.UTC(y, m - 1, d) + 15 * 60 * 60 * 1000;
  return new Date(kstNextMidnightMs).toISOString();
}

/** 예약 링크 상태. open=예약 진행 중, closed=수동 마감, expired=자동 만료, archived=보관. */
export type ConsultationLinkStatus = 'open' | 'closed' | 'expired' | 'archived';

/**
 * 상담 일정의 예약 링크 상태를 판정한다(교사 UI 뱃지·학부모 마감 판정 공용).
 * 우선순위: 보관 > 수동 마감 > 자동 만료 > 진행 중.
 * @param now 비교 기준 시각(ms). 테스트에서 주입 가능. 기본값은 현재 시각.
 */
export function getConsultationLinkStatus(
  s: { readonly isArchived: boolean; readonly closedAt?: string; readonly expiresAt?: string },
  now: number = Date.now(),
): ConsultationLinkStatus {
  if (s.isArchived) return 'archived';
  if (s.closedAt) return 'closed';
  if (s.expiresAt && new Date(s.expiresAt).getTime() < now) return 'expired';
  return 'open';
}

/** open 이 아닌 모든 상태(보관·마감·만료)에서 true. 학부모 예약이 불가한 상태. */
export function isConsultationLinkClosed(
  s: { readonly isArchived: boolean; readonly closedAt?: string; readonly expiresAt?: string },
  now: number = Date.now(),
): boolean {
  return getConsultationLinkStatus(s, now) !== 'open';
}

/**
 * expiresAt ISO → date input 용 "YYYY-MM-DD" (KST 기준).
 * 예: "2026-06-04T00:00:00+09:00"(=…T15:00Z) → "2026-06-04".
 */
export function expiryIsoToKstDateString(iso: string): string {
  const kstMs = new Date(iso).getTime() + 9 * 60 * 60 * 1000;
  return new Date(kstMs).toISOString().slice(0, 10);
}

/**
 * date input "YYYY-MM-DD" → expiresAt ISO (해당일 00:00 KST).
 * `expiryIsoToKstDateString` 의 역함수. 이 시각이 지나면 예약이 마감된다.
 */
export function kstDateStringToExpiryIso(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return '';
  // 'YYYY-MM-DD' 00:00 KST = 해당일 00:00 UTC - 9h
  const utcMs = Date.UTC(y, m - 1, d) - 9 * 60 * 60 * 1000;
  return new Date(utcMs).toISOString();
}
