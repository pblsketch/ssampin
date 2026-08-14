const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

function headers(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  };
}

// ─── Public Types ────────────────────────────────────────────────────────────

export interface SchedulePublic {
  id: string;
  title: string;
  type: 'parent' | 'student';
  methods: ReadonlyArray<'face' | 'phone' | 'video'>;
  slotMinutes: number;
  dates: ReadonlyArray<{ date: string; startTime: string; endTime: string }>;
  targetClassName: string;
  targetStudents: ReadonlyArray<{ number: number }>;
  message?: string;
  isArchived: boolean;
  /** 담임이 수동으로 마감한 시각 (ISO). 있으면 마감. */
  closedAt?: string;
  /** 자동 만료 시각 (ISO). 이 시각이 지나면 마감. */
  expiresAt?: string;
}

export interface SlotPublic {
  id: string;
  scheduleId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: 'available' | 'booked' | 'blocked';
}

export interface BookResult {
  success: boolean;
  message: string;
  /** Phase 3 — 학부모 셀프 변경/취소용. 028 이후 신규 booking 부터 발급. */
  token?: string;
  /** 예약된 booking id (성공 시) */
  bookingId?: string;
}

/** 학부모 셀프 페이지(`/booking/[id]/mine`)에서 사용. */
export interface MyBookingPublic {
  readonly id: string;
  readonly scheduleId: string;
  readonly slotId: string;
  readonly studentNumber: number;
  readonly method: 'face' | 'phone' | 'video';
  readonly bookerInfoEncrypted?: string;
  readonly memoEncrypted?: string;
  readonly createdAt: string;
  readonly slot: SlotPublic | null;
}

export interface SimpleRpcResult {
  success: boolean;
  message: string;
}

// ─── Internal Row Types (snake_case) ─────────────────────────────────────────

interface ScheduleRow {
  id: string;
  title: string;
  type: string;
  methods: string[];
  slot_minutes: number;
  dates: unknown;
  target_class_name: string;
  target_students: unknown;
  message: string | null;
  is_archived: boolean;
  closed_at: string | null;
  expires_at: string | null;
}

interface SlotRow {
  id: string;
  schedule_id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
}

// ─── API Functions ────────────────────────────────────────────────────────────

export async function getSchedulePublic(scheduleId: string): Promise<SchedulePublic | null> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/consultation_schedules?id=eq.${scheduleId}&select=id,title,type,methods,slot_minutes,dates,target_class_name,target_students,message,is_archived,closed_at,expires_at`,
      { headers: headers() },
    );

    if (!res.ok) return null;
    const rows = (await res.json()) as ScheduleRow[];
    if (rows.length === 0) return null;

    const row = rows[0]!;
    return {
      id: row.id,
      title: row.title,
      type: row.type as SchedulePublic['type'],
      methods: row.methods as SchedulePublic['methods'],
      slotMinutes: row.slot_minutes,
      dates: row.dates as SchedulePublic['dates'],
      targetClassName: row.target_class_name,
      targetStudents: row.target_students as SchedulePublic['targetStudents'],
      message: row.message ?? undefined,
      isArchived: row.is_archived,
      closedAt: row.closed_at ?? undefined,
      expiresAt: row.expires_at ?? undefined,
    };
  } catch {
    return null;
  }
}

/**
 * 예약 링크가 마감 상태인지 판정한다(앱 서버 RPC 와 동일 규칙).
 * - 보관(isArchived) 또는 수동 마감(closedAt) 또는 자동 만료(expiresAt < now) 중 하나라도 참이면 마감.
 */
export function isScheduleClosed(s: {
  isArchived: boolean;
  closedAt?: string;
  expiresAt?: string;
}): boolean {
  if (s.isArchived) return true;
  if (s.closedAt) return true;
  if (s.expiresAt && new Date(s.expiresAt).getTime() < Date.now()) return true;
  return false;
}

export async function getSlots(scheduleId: string): Promise<SlotPublic[]> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/consultation_slots?schedule_id=eq.${scheduleId}&order=date.asc,start_time.asc&select=id,schedule_id,date,start_time,end_time,status`,
      { headers: headers() },
    );

    if (!res.ok) return [];
    const rows = (await res.json()) as SlotRow[];

    return rows.map((row) => ({
      id: row.id,
      scheduleId: row.schedule_id,
      date: row.date,
      startTime: row.start_time,
      endTime: row.end_time,
      status: row.status as SlotPublic['status'],
    }));
  } catch {
    return [];
  }
}

export async function checkAlreadyBooked(
  scheduleId: string,
  studentNumber: number,
): Promise<boolean> {
  try {
    // 예전에는 consultation_bookings 를 직접 조회했는데, 필터를 뺀 요청으로
    // 전 행이 열람 가능했다(2026-08-14 실측 256행). 이 화면에 필요한 건
    // "이미 예약했나" 여부뿐이라 boolean 만 돌려주는 RPC 로 바꿨다 — 마이그레이션 046.
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/has_consultation_booking`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        p_schedule_id: scheduleId,
        p_student_number: studentNumber,
      }),
    });
    if (!res.ok) return false;
    return (await res.json()) === true;
  } catch {
    return false;
  }
}

export async function bookSlot(params: {
  scheduleId: string;
  slotId: string;
  studentNumber: number;
  bookerInfoEncrypted?: string;
  method: 'face' | 'phone' | 'video';
  memoEncrypted?: string;
}): Promise<BookResult> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/book_consultation_slot`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        p_schedule_id: params.scheduleId,
        p_slot_id: params.slotId,
        p_student_number: params.studentNumber,
        p_booker_info: params.bookerInfoEncrypted ?? null,
        p_method: params.method,
        p_memo: params.memoEncrypted ?? null,
      }),
    });

    if (!res.ok) {
      return { success: false, message: '예약 요청에 실패했습니다. 다시 시도해주세요.' };
    }

    const result = (await res.json()) as {
      success: boolean;
      bookingId?: string;
      token?: string;
      error?: string;
    };

    if (result.success) {
      return {
        success: true,
        message: '예약이 완료되었습니다!',
        token: result.token,
        bookingId: result.bookingId,
      };
    }

    if (result.error === 'already_booked') {
      return {
        success: false,
        message: '해당 시간은 이미 예약되었습니다. 다른 시간을 선택해주세요.',
      };
    }

    if (result.error === 'student_already_booked') {
      return { success: false, message: '이미 예약하셨습니다. 중복 예약은 불가합니다.' };
    }

    return { success: false, message: '예약에 실패했습니다. 다시 시도해주세요.' };
  } catch {
    return { success: false, message: '네트워크 오류가 발생했습니다. 다시 시도해주세요.' };
  }
}

// ─── Phase 3 — 학부모 셀프 변경/취소 ─────────────────────────────────────────

/** token 으로 본인 예약 + 슬롯 정보 조회. */
export async function getMyBooking(token: string): Promise<MyBookingPublic | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_consultation_booking_by_token`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ p_token: token }),
    });
    if (!res.ok) return null;
    const raw = (await res.json()) as {
      success: boolean;
      error?: string;
      booking?: {
        id: string;
        scheduleId: string;
        slotId: string;
        studentNumber: number;
        method: string;
        bookerInfoEncrypted: string | null;
        memoEncrypted: string | null;
        createdAt: string;
      };
      slot?: {
        id: string;
        scheduleId: string;
        date: string;
        startTime: string;
        endTime: string;
        status: string;
      } | null;
    };
    if (!raw.success || !raw.booking) return null;
    const b = raw.booking;
    const slot = raw.slot
      ? {
          id: raw.slot.id,
          scheduleId: raw.slot.scheduleId,
          date: raw.slot.date,
          startTime: raw.slot.startTime,
          endTime: raw.slot.endTime,
          status: raw.slot.status as SlotPublic['status'],
        }
      : null;
    return {
      id: b.id,
      scheduleId: b.scheduleId,
      slotId: b.slotId,
      studentNumber: b.studentNumber,
      method: b.method as MyBookingPublic['method'],
      bookerInfoEncrypted: b.bookerInfoEncrypted ?? undefined,
      memoEncrypted: b.memoEncrypted ?? undefined,
      createdAt: b.createdAt,
      slot,
    };
  } catch {
    return null;
  }
}

/** token 으로 예약 시간 변경. */
export async function rescheduleMyBooking(
  token: string,
  newSlotId: string,
): Promise<SimpleRpcResult> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/reschedule_consultation_booking_by_token`,
      {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ p_token: token, p_new_slot_id: newSlotId }),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { success: false, message: text || '예약 시간 변경에 실패했습니다.' };
    }
    const raw = (await res.json()) as { success?: boolean; message?: string };
    return {
      success: raw.success ?? false,
      message: raw.message ?? '예약 시간 변경에 실패했습니다.',
    };
  } catch {
    return { success: false, message: '네트워크 오류가 발생했습니다.' };
  }
}

/** token 으로 예약 취소. */
export async function cancelMyBooking(token: string): Promise<SimpleRpcResult> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/cancel_consultation_booking_by_token`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ p_token: token }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { success: false, message: text || '예약 취소에 실패했습니다.' };
    }
    const raw = (await res.json()) as { success?: boolean; message?: string };
    return {
      success: raw.success ?? false,
      message: raw.message ?? '예약 취소에 실패했습니다.',
    };
  } catch {
    return { success: false, message: '네트워크 오류가 발생했습니다.' };
  }
}

/** Phase 3 — localStorage 에 booking token 저장/조회. */
export const BOOKING_TOKEN_STORAGE_PREFIX = 'ssampin_booking_token_';

export function saveBookingToken(scheduleId: string, token: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${BOOKING_TOKEN_STORAGE_PREFIX}${scheduleId}`, token);
  } catch {
    // localStorage 차단 환경 — 무시
  }
}

export function readBookingToken(scheduleId: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(`${BOOKING_TOKEN_STORAGE_PREFIX}${scheduleId}`);
  } catch {
    return null;
  }
}

export function clearBookingToken(scheduleId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(`${BOOKING_TOKEN_STORAGE_PREFIX}${scheduleId}`);
  } catch {
    // ignore
  }
}

// ─── AES-GCM Encryption Helper ───────────────────────────────────────────────

async function deriveKey(password: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveKey',
  ]);
  const salt = enc.encode('ssampin-consultation-v1');
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encrypt(plaintext: string, key: string): Promise<string> {
  const derivedKey = await deriveKey(key);
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    derivedKey,
    enc.encode(plaintext),
  );
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
}
