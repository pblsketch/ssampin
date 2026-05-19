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
