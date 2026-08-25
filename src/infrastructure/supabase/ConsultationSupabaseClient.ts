/**
 * 상담 일정 Supabase 클라이언트
 *
 * consultation_schedules, consultation_slots, consultation_bookings 테이블은
 * RLS로 Public read/insert가 열려있으므로 anon key만으로 직접 REST API 호출이 가능하다.
 *
 * ⚠️ 위 "Public read" 는 정리 대상이다(계획서 P0-3). 서버에서 익명 SELECT 를 회수하면
 *    구버전 앱은 401/403 을 받으므로, 실패를 빈 값으로 삼키지 말고 업데이트를 안내한다.
 */

import { throwIfPermissionError } from './supabaseAccessError';

// ── DB row types (snake_case) ──────────────────────────────────────────────

// ScheduleRow 는 getSchedule() 과 함께 삭제했다 (2026-08-14, 마이그레이션 044 참조).
// 유일한 사용처였고, admin_key 필드를 갖고 있어 남겨두면 오해를 준다.

interface SlotRow {
  id: string;
  schedule_id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  blocked_by?: string | null;
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
  closedAt?: string;
  expiresAt?: string;
  createdAt: string;
}

export interface SlotPublic {
  id: string;
  scheduleId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: 'available' | 'booked' | 'blocked';
  /**
   * 차단 주체. status === 'blocked' 일 때만 의미가 있다.
   * 'teacher' 는 자동 재계산이 손대지 않는다(ADR-060).
   */
  blockedBy?: 'teacher' | 'auto';
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

  private ensureConfigured(): void {
    if (!this.baseUrl || !this.anonKey) {
      throw new Error('Supabase is not configured');
    }
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      apikey: this.anonKey,
      Authorization: `Bearer ${this.anonKey}`,
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
    /** 자동 만료 시각 (ISO). undefined = 자동 만료 없음 */
    expiresAt?: string;
    blockedSlots?: ReadonlyArray<{ date: string; startTime: string }>;
  }): Promise<void> {
    this.ensureConfigured();
    const res = await fetch(`${this.baseUrl}/rest/v1/consultation_schedules`, {
      method: 'POST',
      headers: {
        ...this.headers(),
        Prefer: 'return=minimal',
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
        expires_at: params.expiresAt ?? null,
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
      blocked_by: string | null;
    }> = [];

    // slotMinutes 단위로 분할 (학생/학부모 동일)
    const blockedSet = new Set((params.blockedSlots ?? []).map((b) => `${b.date}_${b.startTime}`));
    for (const d of params.dates) {
      let current = parseTime(d.startTime);
      const end = parseTime(d.endTime);
      while (current + params.slotMinutes <= end) {
        const startTimeStr = formatTime(current);
        // 여기서 막히는 슬롯은 교사가 생성 화면에서 직접 고른 것이다 →
        // 'teacher' 로 표시해 자동 재계산이 되돌리지 못하게 한다(ADR-060).
        const isBlocked = blockedSet.has(`${d.date}_${startTimeStr}`);
        slots.push({
          schedule_id: params.id,
          date: d.date,
          start_time: startTimeStr,
          end_time: formatTime(current + params.slotMinutes),
          status: isBlocked ? 'blocked' : 'available',
          blocked_by: isBlocked ? 'teacher' : null,
        });
        current += params.slotMinutes;
      }
    }

    if (slots.length === 0) return;

    const slotsRes = await fetch(`${this.baseUrl}/rest/v1/consultation_slots`, {
      method: 'POST',
      headers: {
        ...this.headers(),
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(slots),
    });

    if (!slotsRes.ok) {
      const err = await slotsRes.text();
      throw new Error(`Failed to create consultation slots: ${err}`);
    }
  }

  /*
   * getSchedule() 은 2026-08-14 에 삭제했다.
   *
   * 호출부가 없는 죽은 코드였고, select 목록에 admin_key 가 들어 있었다.
   * 마이그레이션 044 에서 anon 역할의 admin_key 컬럼 SELECT 권한을 회수했으므로
   * 되살리면 조용히 실패한다. 교사 앱은 adminKey 를 로컬 Consultation 엔티티에
   * 이미 보관하므로(ConsultationDetail.tsx 의 공유 링크·복호화 경로) 서버에서
   * 다시 받아올 이유가 없다.
   */

  /**
   * 슬롯 목록 조회 (날짜·시작시간 순)
   */
  async getSlots(scheduleId: string): Promise<SlotPublic[]> {
    this.ensureConfigured();
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
      // 마이그레이션 048 이전 행이나 차단이 아닌 행은 null → undefined 로 정규화
      ...(r.blocked_by === 'teacher' || r.blocked_by === 'auto' ? { blockedBy: r.blocked_by } : {}),
    }));
  }

  /**
   * 예약 목록 조회 (학생 번호 순)
   *
   * 예전에는 consultation_bookings 를 직접 조회했다. PostgREST 는 클라이언트가 보낸
   * 필터를 신뢰할 뿐이라 필터를 뺀 요청으로 전 행이 나왔다(2026-08-14 실측 256행).
   * 지금은 adminKey 를 함께 보내 **그 일정의 예약만** 받는다 — 마이그레이션 046.
   */
  async getBookings(scheduleId: string, adminKey: string): Promise<BookingPublic[]> {
    this.ensureConfigured();
    const res = await fetch(`${this.baseUrl}/rest/v1/rpc/get_consultation_bookings`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ p_schedule_id: scheduleId, p_admin_key: adminKey }),
    });

    // 실패를 빈 목록으로 삼키면 화면에 "예약 없음"으로 보여 선생님이 자료가
    // 사라졌다고 판단한다. 설문 쪽(getResponses)은 같은 이유로 이미 throw 한다
    // — 2026-05-14 사용자 신고 사례. 상담에도 같은 규칙을 적용한다.
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throwIfPermissionError(res.status, '예약 목록', body);
      console.error(
        `[ConsultationSupabaseClient.getBookings] HTTP ${res.status} ${res.statusText} | scheduleId=${scheduleId} | body=${body.slice(0, 200)}`,
      );
      throw new Error(`Supabase getBookings failed: ${res.status} ${res.statusText}`);
    }
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
    this.ensureConfigured();
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
   *
   * 예전에는 세 번에 나눠 했다: slot_id 조회(RPC) → 예약 DELETE(테이블) → 슬롯 PATCH.
   * 두 가지 문제가 있었다.
   *   1) 원자적이지 않다. DELETE 는 됐는데 PATCH 가 실패하면 예약은 사라졌는데 슬롯은
   *      'booked' 로 남아, 아무도 예약할 수 없는 유령 슬롯이 된다.
   *   2) DELETE 의 WHERE 가 id 를 읽는다. PostgreSQL 은 WHERE 가 읽는 컬럼에도
   *      SELECT 권한을 요구하므로, 060 에서 consultation_bookings 의 SELECT 를
   *      회수하면 이 경로가 그대로 깨진다.
   * 지금은 RPC 한 번으로 끝낸다 — 마이그레이션 059.
   */
  async cancelBooking(bookingId: string, scheduleId: string, adminKey: string): Promise<void> {
    this.ensureConfigured();
    const res = await fetch(`${this.baseUrl}/rest/v1/rpc/cancel_consultation_booking_by_admin`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        p_booking_id: bookingId,
        p_schedule_id: scheduleId,
        p_admin_key: adminKey,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throwIfPermissionError(res.status, '예약 정보', body);
      // P0002(예약 없음) 을 PostgREST 가 404 로 매핑한다. 이미 취소된 예약을 한 번 더
      // 누른 경우가 대부분이라, 원문 JSON 대신 사람이 읽을 문장을 준다.
      if (res.status === 404) {
        throw new Error('이미 취소되었거나 찾을 수 없는 예약입니다. 목록을 새로고침해 주세요.');
      }
      throw new Error(`Failed to cancel booking: ${body.slice(0, 200)}`);
    }
  }

  /**
   * 일정 메타 부분 갱신 (title/type/methods/slotMinutes/dates/message).
   * 슬롯 재생성은 `replaceSlots`로 별도 호출한다 (예약 있는 슬롯 보존을 위해 분리).
   */
  async updateSchedule(
    id: string,
    patch: {
      title?: string;
      type?: 'parent' | 'student';
      methods?: ReadonlyArray<'face' | 'phone' | 'video'>;
      slotMinutes?: number;
      dates?: ReadonlyArray<{ date: string; startTime: string; endTime: string }>;
      message?: string;
    },
  ): Promise<void> {
    this.ensureConfigured();

    const body: Record<string, unknown> = {};
    if (patch.title !== undefined) body['title'] = patch.title;
    if (patch.type !== undefined) body['type'] = patch.type;
    if (patch.methods !== undefined) body['methods'] = patch.methods;
    if (patch.slotMinutes !== undefined) body['slot_minutes'] = patch.slotMinutes;
    if (patch.dates !== undefined) body['dates'] = patch.dates;
    if (patch.message !== undefined) body['message'] = patch.message;

    if (Object.keys(body).length === 0) return;

    const res = await fetch(`${this.baseUrl}/rest/v1/consultation_schedules?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        ...this.headers(),
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to update consultation schedule: ${err}`);
    }
  }

  /**
   * 예약 마감/재개 — closed_at PATCH.
   * closed=true 면 현재 시각으로 마감, false 면 NULL 로 재개한다.
   * 마감되면 학부모 예약 페이지가 마감 화면을 표시하고 서버 RPC 도 새 예약을 거부한다.
   */
  async setClosed(id: string, closed: boolean): Promise<void> {
    this.ensureConfigured();
    const res = await fetch(`${this.baseUrl}/rest/v1/consultation_schedules?id=eq.${id}`, {
      method: 'PATCH',
      headers: { ...this.headers(), Prefer: 'return=minimal' },
      body: JSON.stringify({ closed_at: closed ? new Date().toISOString() : null }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to update consultation closed state: ${err}`);
    }
  }

  /**
   * 보관/보관 해제 — is_archived PATCH.
   * (기존 archiveSchedule 이 로컬만 갱신하던 버그를 이 메서드로 서버까지 반영한다.)
   */
  async setArchived(id: string, archived: boolean): Promise<void> {
    this.ensureConfigured();
    const res = await fetch(`${this.baseUrl}/rest/v1/consultation_schedules?id=eq.${id}`, {
      method: 'PATCH',
      headers: { ...this.headers(), Prefer: 'return=minimal' },
      body: JSON.stringify({ is_archived: archived }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to update consultation archived state: ${err}`);
    }
  }

  /**
   * 자동 만료 시각 변경 — expires_at PATCH. null 이면 자동 만료 해제.
   */
  async setExpiresAt(id: string, iso: string | null): Promise<void> {
    this.ensureConfigured();
    const res = await fetch(`${this.baseUrl}/rest/v1/consultation_schedules?id=eq.${id}`, {
      method: 'PATCH',
      headers: { ...this.headers(), Prefer: 'return=minimal' },
      body: JSON.stringify({ expires_at: iso }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to update consultation expiry: ${err}`);
    }
  }

  /**
   * 슬롯 재생성.
   *
   * 알고리즘:
   *  1) 현재 슬롯 조회
   *  2) 새 dates × slotMinutes 로 (date_startTime) 키 집합 계산
   *  3) 현재 슬롯 중 새 키 집합에 없고 status !== 'booked' 인 것만 DELETE
   *     (예약 있는 슬롯은 반드시 보존 — caller 가 사전 영향 분석으로 처리해야 함)
   *  4) 새 키 집합에 있으나 현재 없는 슬롯만 INSERT
   *  5) blockedSlots 키에 해당하는 신규 슬롯은 status='blocked' 로
   */
  async replaceSlots(
    scheduleId: string,
    params: {
      dates: ReadonlyArray<{ date: string; startTime: string; endTime: string }>;
      slotMinutes: number;
      blockedSlots?: ReadonlyArray<{ date: string; startTime: string }>;
    },
  ): Promise<void> {
    this.ensureConfigured();

    // 1) 현재 슬롯
    const currentSlots = await this.getSlots(scheduleId);
    const currentByKey = new Map<string, SlotPublic>();
    for (const s of currentSlots) currentByKey.set(`${s.date}_${s.startTime}`, s);

    // 2) 새 키 집합
    const blockedSet = new Set((params.blockedSlots ?? []).map((b) => `${b.date}_${b.startTime}`));
    const desired: Array<{
      date: string;
      startTime: string;
      endTime: string;
      blocked: boolean;
    }> = [];
    for (const d of params.dates) {
      let cursor = parseTime(d.startTime);
      const end = parseTime(d.endTime);
      while (cursor + params.slotMinutes <= end) {
        const startStr = formatTime(cursor);
        desired.push({
          date: d.date,
          startTime: startStr,
          endTime: formatTime(cursor + params.slotMinutes),
          blocked: blockedSet.has(`${d.date}_${startStr}`),
        });
        cursor += params.slotMinutes;
      }
    }
    const desiredKeys = new Set(desired.map((d) => `${d.date}_${d.startTime}`));

    // 3) 삭제 대상: 새 키 집합에 없고 booked 도 아닌 슬롯
    const toDelete = currentSlots.filter(
      (s) => !desiredKeys.has(`${s.date}_${s.startTime}`) && s.status !== 'booked',
    );
    if (toDelete.length > 0) {
      const ids = toDelete.map((s) => s.id).join(',');
      const delRes = await fetch(`${this.baseUrl}/rest/v1/consultation_slots?id=in.(${ids})`, {
        method: 'DELETE',
        headers: { ...this.headers(), Prefer: 'return=minimal' },
      });
      if (!delRes.ok) {
        const err = await delRes.text();
        throw new Error(`Failed to delete obsolete slots: ${err}`);
      }
    }

    // 4) 추가 대상: 새 키 집합에 있으나 현재 없는 슬롯
    const toInsert = desired
      .filter((d) => !currentByKey.has(`${d.date}_${d.startTime}`))
      .map((d) => ({
        schedule_id: scheduleId,
        date: d.date,
        start_time: d.startTime,
        end_time: d.endTime,
        status: d.blocked ? 'blocked' : 'available',
        // 편집 화면에서 교사가 고른 차단 → 자동 재계산이 손대지 않도록 'teacher'
        blocked_by: d.blocked ? 'teacher' : null,
      }));
    if (toInsert.length > 0) {
      const insRes = await fetch(`${this.baseUrl}/rest/v1/consultation_slots`, {
        method: 'POST',
        headers: { ...this.headers(), Prefer: 'return=minimal' },
        body: JSON.stringify(toInsert),
      });
      if (!insRes.ok) {
        const err = await insRes.text();
        throw new Error(`Failed to insert new slots: ${err}`);
      }
    }
  }

  /**
   * 예약 재배정 — atomic RPC.
   *
   * `reschedule_consultation_booking(p_booking_id, p_new_slot_id, p_schedule_id)`
   * 함수가 FOR UPDATE 잠금으로 동시 race 를 차단한다.
   * SQL: supabase/sql/2026-05-19__reschedule_rpc.sql
   */
  async rescheduleBooking(params: {
    bookingId: string;
    newSlotId: string;
    scheduleId: string;
  }): Promise<{ success: boolean; message: string }> {
    this.ensureConfigured();
    const res = await fetch(`${this.baseUrl}/rest/v1/rpc/reschedule_consultation_booking`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        p_booking_id: params.bookingId,
        p_new_slot_id: params.newSlotId,
        p_schedule_id: params.scheduleId,
      }),
    });

    if (!res.ok) {
      if (res.status === 409) {
        return {
          success: false,
          message: '선택한 시간대는 이미 예약되었거나 차단되었습니다.',
        };
      }
      const text = await res.text().catch(() => '');
      return {
        success: false,
        message: text || '예약 시간 변경에 실패했습니다.',
      };
    }

    const raw = (await res.json().catch(() => null)) as {
      success?: boolean;
      message?: string;
    } | null;
    if (raw && typeof raw === 'object') {
      return {
        success: raw.success ?? true,
        message: raw.message ?? '예약 시간이 변경되었습니다.',
      };
    }
    return { success: true, message: '예약 시간이 변경되었습니다.' };
  }

  /**
   * 슬롯 상태 배치 변경 — **일정표 자동 동기화 전용**.
   *
   * 여기서 거는 차단은 전부 `blocked_by='auto'` 다. 교사가 직접 막은 슬롯은
   * 이 경로로 들어오면 안 된다(호출자인 recomputeSlotAvailability 가 걸러낸다).
   * 해제 시에는 blocked_by 도 함께 NULL 로 되돌려 상태가 어긋나지 않게 한다.
   */
  async bulkUpdateSlotStatus(
    slotIds: readonly string[],
    status: 'available' | 'blocked',
  ): Promise<void> {
    this.ensureConfigured();
    if (slotIds.length === 0) return;
    const ids = slotIds.join(',');
    const res = await fetch(`${this.baseUrl}/rest/v1/consultation_slots?id=in.(${ids})`, {
      method: 'PATCH',
      headers: { ...this.headers(), Prefer: 'return=minimal' },
      body: JSON.stringify({ status, blocked_by: status === 'blocked' ? 'auto' : null }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to bulk update slot status: ${err}`);
    }
  }

  /**
   * 교사가 슬롯을 직접 막거나 푼다 (상담 상세 화면의 차단/해제 버튼).
   *
   * `bulkUpdateSlotStatus` 와 달리 `blocked_by='teacher'` 를 남기므로
   * 이후 자동 재계산이 이 슬롯을 건드리지 않는다(ADR-060).
   *
   * 예약이 있는 슬롯은 호출자가 막아야 한다(이 메서드는 status 를 덮어쓴다).
   */
  async setSlotBlockedByTeacher(slotId: string, blocked: boolean): Promise<void> {
    this.ensureConfigured();
    const res = await fetch(`${this.baseUrl}/rest/v1/consultation_slots?id=eq.${slotId}`, {
      method: 'PATCH',
      headers: { ...this.headers(), Prefer: 'return=minimal' },
      body: JSON.stringify(
        blocked
          ? { status: 'blocked', blocked_by: 'teacher' }
          : { status: 'available', blocked_by: null },
      ),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to update slot block state: ${err}`);
    }
  }

  /**
   * 슬롯 및 예약 폴링
   */
  startPolling(
    scheduleId: string,
    adminKey: string,
    onUpdate: (slots: SlotPublic[], bookings: BookingPublic[]) => void,
    intervalMs = 30_000,
  ): () => void {
    let timerId: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      try {
        const [slots, bookings] = await Promise.all([
          this.getSlots(scheduleId),
          this.getBookings(scheduleId, adminKey),
        ]);
        onUpdate(slots, bookings);
      } catch {
        // 폴링 에러 무시
      }
    };

    void poll();
    timerId = setInterval(() => {
      void poll();
    }, intervalMs);

    return () => {
      if (timerId !== null) {
        clearInterval(timerId);
        timerId = null;
      }
    };
  }
}
