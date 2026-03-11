const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

function headers(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
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
      `${SUPABASE_URL}/rest/v1/consultation_schedules?id=eq.${scheduleId}&select=id,title,type,methods,slot_minutes,dates,target_class_name,target_students,message,is_archived`,
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
    };
  } catch {
    return null;
  }
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
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/consultation_bookings?schedule_id=eq.${scheduleId}&student_number=eq.${studentNumber}&select=id`,
      { headers: headers() },
    );
    if (!res.ok) return false;
    const rows = (await res.json()) as Array<{ id: string }>;
    return rows.length > 0;
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
        p_memo: null,
      }),
    });

    if (!res.ok) {
      return { success: false, message: '예약 요청에 실패했습니다. 다시 시도해주세요.' };
    }

    const result = (await res.json()) as { success: boolean; bookingId?: string; error?: string };

    if (result.success) {
      return { success: true, message: '예약이 완료되었습니다!' };
    }

    if (result.error === 'already_booked') {
      return { success: false, message: '해당 시간은 이미 예약되었습니다. 다른 시간을 선택해주세요.' };
    }

    if (result.error === 'student_already_booked') {
      return { success: false, message: '이미 예약하셨습니다. 중복 예약은 불가합니다.' };
    }

    return { success: false, message: '예약에 실패했습니다. 다시 시도해주세요.' };
  } catch {
    return { success: false, message: '네트워크 오류가 발생했습니다. 다시 시도해주세요.' };
  }
}

// ─── AES-GCM Encryption Helper ───────────────────────────────────────────────

async function deriveKey(password: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
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
