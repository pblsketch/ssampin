/**
 * 상담 일정 Supabase 클라이언트
 *
 * consultation_schedules, consultation_slots, consultation_bookings 테이블은
 * RLS로 Public read/insert가 열려있으므로 anon key만으로 직접 REST API 호출이 가능하다.
 */

// ── DB row types (snake_case) ──────────────────────────────────────────────

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
  admin_key: string;
  is_archived: boolean;
  created_at: string;
}

interface SlotRow {
  id: string;
  schedule_id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
}

interface BookingRow {
  id: string;
  schedule_id: string;
  slot_id: string;
  student_number: number;
  booker_info_encrypted: string | null;
  method: string;
  memo_encrypted: string | null;
  created_at: string;
}

// ── Public types (camelCase) ───────────────────────────────────────────────

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
  adminKey: string;
  isArchived: boolean;
  createdAt: string;
}

export interface SlotPublic {
  id: string;
  scheduleId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: 'available' | 'booked' | 'blocked';
}

export interface BookingPublic {
  id: string;
  scheduleId: string;
  slotId: string;
  studentNumber: number;
  bookerInfoEncrypted?: string;
  method: 'face' | 'phone' | 'video';
  memoEncrypted?: string;
  createdAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** "HH:MM" → minutes from midnight */
function parseTime(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** minutes from midnight → "HH:MM" */
function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ── Client ────────────────────────────────────────────────────────────────

export class ConsultationSupabaseClient {
  private readonly baseUrl: string;
  private readonly anonKey: string;

  constructor() {
    this.baseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
    this.anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'apikey': this.anonKey,
      'Authorization': `Bearer ${this.anonKey}`,
    };
  }

  /**
   * 상담 일정을 Supabase에 등록하고, 슬롯을 자동 생성한다.
   */
  async createSchedule(params: {
    id: string;
    title: string;
    type: 'parent' | 'student';
    methods: ReadonlyArray<'face' | 'phone' | 'video'>;
    slotMinutes: number;
    dates: ReadonlyArray<{ date: string; startTime: string; endTime: string }>;
    targetClassName: string;
    targetStudents: ReadonlyArray<{ number: number }>;
    message?: string;
    adminKey: string;
  }): Promise<void> {
    const res = await fetch(`${this.baseUrl}/rest/v1/consultation_schedules`, {
      method: 'POST',
      headers: {
        ...this.headers(),
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        id: params.id,
        title: params.title,
        type: params.type,
        methods: params.methods,
        slot_minutes: params.slotMinutes,
        dates: params.dates,
        target_class_name: params.targetClassName,
        target_students: params.targetStudents,
        message: params.message ?? null,
        admin_key: params.adminKey,
        is_archived: false,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to create consultation schedule: ${err}`);
    }

    // 슬롯 자동 생성
    const slots: Array<{
      schedule_id: string;
      date: string;
      start_time: string;
      end_time: string;
      status: string;
    }> = [];

    // slotMinutes 단위로 분할 (학생/학부모 동일)
    for (const d of params.dates) {
      let current = parseTime(d.startTime);
      const end = parseTime(d.endTime);
      while (current + params.slotMinutes <= end) {
        slots.push({
          schedule_id: params.id,
          date: d.date,
          start_time: formatTime(current),
          end_time: formatTime(current + params.slotMinutes),
          status: 'available',
        });
        current += params.slotMinutes;
      }
    }

    if (slots.length === 0) return;

    const slotsRes = await fetch(`${this.baseUrl}/rest/v1/consultation_slots`, {
      method: 'POST',
      headers: {
        ...this.headers(),
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(slots),
    });

    if (!slotsRes.ok) {
      const err = await slotsRes.text();
      throw new Error(`Failed to create consultation slots: ${err}`);
    }
  }

  /**
   * 상담 일정 조회
   */
  async getSchedule(id: string): Promise<SchedulePublic | null> {
    const res = await fetch(
      `${this.baseUrl}/rest/v1/consultation_schedules?id=eq.${id}&select=id,title,type,methods,slot_minutes,dates,target_class_name,target_students,message,admin_key,is_archived,created_at`,
      { headers: this.headers() },
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
      adminKey: row.admin_key,
      isArchived: row.is_archived,
      createdAt: row.created_at,
    };
  }

  /**
   * 슬롯 목록 조회 (날짜·시작시간 순)
   */
  async getSlots(scheduleId: string): Promise<SlotPublic[]> {
    const res = await fetch(
      `${this.baseUrl}/rest/v1/consultation_slots?schedule_id=eq.${scheduleId}&order=date.asc,start_time.asc`,
      { headers: this.headers() },
    );

    if (!res.ok) return [];
    const rows = (await res.json()) as SlotRow[];

    return rows.map((r) => ({
      id: r.id,
      scheduleId: r.schedule_id,
      date: r.date,
      startTime: r.start_time,
      endTime: r.end_time,
      status: r.status as SlotPublic['status'],
    }));
  }

  /**
   * 예약 목록 조회 (학생 번호 순)
   */
  async getBookings(scheduleId: string): Promise<BookingPublic[]> {
    const res = await fetch(
      `${this.baseUrl}/rest/v1/consultation_bookings?schedule_id=eq.${scheduleId}&order=student_number.asc`,
      { headers: this.headers() },
    );

    if (!res.ok) return [];
    const rows = (await res.json()) as BookingRow[];

    return rows.map((r) => ({
      id: r.id,
      scheduleId: r.schedule_id,
      slotId: r.slot_id,
      studentNumber: r.student_number,
      bookerInfoEncrypted: r.booker_info_encrypted ?? undefined,
      method: r.method as BookingPublic['method'],
      memoEncrypted: r.memo_encrypted ?? undefined,
      createdAt: r.created_at,
    }));
  }

  /**
   * 슬롯 예약 — book_consultation_slot RPC 호출
   */
  async bookSlot(params: {
    scheduleId: string;
    slotId: string;
    studentNumber: number;
    bookerInfoEncrypted?: string;
    method: 'face' | 'phone' | 'video';
    memoEncrypted?: string;
  }): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${this.baseUrl}/rest/v1/rpc/book_consultation_slot`, {
      method: 'POST',
      headers: this.headers(),
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
      if (res.status === 409) {
        return { success: false, message: '이미 예약하셨거나 해당 슬롯이 마감되었습니다.' };
      }
      return { success: false, message: '예약에 실패했습니다.' };
    }

    return { success: true, message: '예약이 완료되었습니다.' };
  }

  /**
   * 예약 취소 — 예약 삭제 후 슬롯 상태를 available로 복구
   */
  async cancelBooking(bookingId: string, scheduleId: string): Promise<void> {
    // 예약 정보에서 slotId 확인
    const bookingRes = await fetch(
      `${this.baseUrl}/rest/v1/consultation_bookings?id=eq.${bookingId}&schedule_id=eq.${scheduleId}&select=id,slot_id`,
      { headers: this.headers() },
    );

    if (!bookingRes.ok) {
      throw new Error('Failed to fetch booking for cancellation');
    }

    const bookings = (await bookingRes.json()) as Array<{ id: string; slot_id: string }>;
    if (bookings.length === 0) {
      throw new Error('Booking not found');
    }

    const slotId = bookings[0]!.slot_id;

    // 예약 삭제
    const deleteRes = await fetch(
      `${this.baseUrl}/rest/v1/consultation_bookings?id=eq.${bookingId}`,
      {
        method: 'DELETE',
        headers: {
          ...this.headers(),
          'Prefer': 'return=minimal',
        },
      },
    );

    if (!deleteRes.ok) {
      const err = await deleteRes.text();
      throw new Error(`Failed to delete booking: ${err}`);
    }

    // 슬롯 상태 복구
    const slotRes = await fetch(
      `${this.baseUrl}/rest/v1/consultation_slots?id=eq.${slotId}`,
      {
        method: 'PATCH',
        headers: {
          ...this.headers(),
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ status: 'available' }),
      },
    );

    if (!slotRes.ok) {
      const err = await slotRes.text();
      throw new Error(`Failed to restore slot status: ${err}`);
    }
  }

  /**
   * 슬롯 및 예약 폴링
   */
  startPolling(
    scheduleId: string,
    onUpdate: (slots: SlotPublic[], bookings: BookingPublic[]) => void,
    intervalMs = 30_000,
  ): () => void {
    let timerId: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      try {
        const [slots, bookings] = await Promise.all([
          this.getSlots(scheduleId),
          this.getBookings(scheduleId),
        ]);
        onUpdate(slots, bookings);
      } catch {
        // 폴링 에러 무시
      }
    };

    void poll();
    timerId = setInterval(() => { void poll(); }, intervalMs);

    return () => {
      if (timerId !== null) {
        clearInterval(timerId);
        timerId = null;
      }
    };
  }
}
