/**
 * 상담 일정 Supabase 클라이언트
 *
 * consultation_schedules, consultation_slots, consultation_bookings 테이블은
 * RLS로 Public read/insert가 열려있으므로 anon key만으로 직접 REST API 호출이 가능하다.
 *
 * ⚠️ 위 "Public read" 는 정리 대상이다(계획서 P0-3). 서버에서 익명 SELECT 를 회수하면
 *    구버전 앱은 401/403 을 받으므로, 실패를 빈 값으로 삼키지 말고 업데이트를 안내한다.
 */

import { throwIfConsultationDenied } from './supabaseAccessError';

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

// BookingRow 는 예약 목록을 표에서 직접 읽던 시절의 타입이다. 지금은 교사 창구가
// camelCase 로 돌려주므로(ADR-095) 필요 없어져 지웠다.

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

  // ── 교사용 서버 창구 (ADR-095) ──────────────────────────────────────────
  //
  // 명단 조회와 일정 수정은 이제 anon 열쇠로 표를 직접 건드리지 않고 엣지 함수를 거친다.
  // 신분증은 관리 키가 아니라 **구글 계정 확인**이다. 토큰을 여기서 직접 만들지 않고
  // 게터로 받는 이유는, 이 클래스가 구글 인증 구현을 알지 못하게 하려는 것이다
  // (데스크톱과 모바일이 서로 다른 방식으로 토큰을 만든다).

  private googleTokenGetter: (() => Promise<string | null>) | null = null;

  /** 앱 조립 지점(di/container)이 한 번 꽂아 준다. */
  setGoogleTokenGetter(getter: () => Promise<string | null>): void {
    this.googleTokenGetter = getter;
  }

  private async googleToken(): Promise<string | null> {
    if (!this.googleTokenGetter) return null;
    try {
      return await this.googleTokenGetter();
    } catch {
      // 토큰을 못 만드는 것도 "연결 안 됨"이다 — 서버가 not_connected 로 답하게 둔다.
      // 여기서 예외를 올리면 사유가 아니라 알 수 없는 오류로 보인다.
      return null;
    }
  }

  /**
   * 엣지 함수 호출. 실패는 **삼키지 않는다** — 사유를 담아 throw 한다.
   *
   * 빈 배열로 돌려주면 화면에 "예약 없음"으로 보여 선생님이 자료가 사라졌다고 믿는다
   * (설문 쪽에서 실제로 있었던 신고다). 권한 문제는 반드시 눈에 보이게 실패시킨다.
   */
  private async callEdge<T>(
    fnName: 'consultation-teacher',
    body: Record<string, unknown>,
    context: string,
  ): Promise<T> {
    this.ensureConfigured();
    const token = await this.googleToken();
    const res = await fetch(`${this.baseUrl}/functions/v1/${fnName}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ ...body, googleAccessToken: token ?? '' }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throwIfConsultationDenied(res.status, context, text);
      throw new Error(`${context}을(를) 처리하지 못했습니다: ${text.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }

  /**
   * 상담 일정을 서버에 만든다 — **관리 키와 소금값은 서버가 발급한다.**
   *
   * 예전에는 앱이 관리 키를 만들어 보냈다. 그러면 "누가 만들었는가"를 서버가 알 수 없고,
   * 그 키가 곧 신분증이라 링크를 받은 사람이 신분증을 갖게 된다(ADR-095).
   * 지금은 서버가 구글 계정을 확인해 소유자를 박고, 키·소금값을 만들어 돌려준다.
   *
   * ★ 부르는 쪽은 **이 함수가 성공한 뒤에** 로컬 저장과 공유 링크 조립을 해야 한다.
   *   먼저 저장하면 서버가 실패했을 때 열리지 않는 반쪽 일정이 남는다.
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
    /** 예약 화면에 보여 줄 상담 주제 선택지. 비면 직접 적는 칸만 보인다. */
    topicOptions?: readonly string[];
    /** 자동 만료 시각 (ISO). undefined = 자동 만료 없음 */
    expiresAt?: string;
    blockedSlots?: ReadonlyArray<{ date: string; startTime: string }>;
  }): Promise<{ adminKey: string; cryptoVersion: number; cryptoSalt: string }> {
    // 시간대 쪼개기는 그대로 앱에서 한다 — 화면이 미리 보여 주는 것과 같은 계산이라
    // 서버로 옮기면 두 벌이 된다. 서버는 받은 목록을 그대로 넣는다.
    const slots: Array<{
      date: string;
      startTime: string;
      endTime: string;
      status: string;
      blockedBy: string | null;
    }> = [];
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
          date: d.date,
          startTime: startTimeStr,
          endTime: formatTime(current + params.slotMinutes),
          status: isBlocked ? 'blocked' : 'available',
          blockedBy: isBlocked ? 'teacher' : null,
        });
        current += params.slotMinutes;
      }
    }

    const res = await this.callEdge<{
      id: string;
      adminKey: string;
      cryptoVersion: number;
      cryptoSalt: string;
    }>(
      'consultation-teacher',
      {
        action: 'create',
        schedule: {
          id: params.id,
          title: params.title,
          type: params.type,
          methods: params.methods,
          slotMinutes: params.slotMinutes,
          dates: params.dates,
          targetClassName: params.targetClassName,
          targetStudents: params.targetStudents,
          message: params.message ?? null,
          topicOptions: params.topicOptions ?? [],
          expiresAt: params.expiresAt ?? null,
          slots,
        },
      },
      '상담 일정 만들기',
    );
    return {
      adminKey: res.adminKey,
      cryptoVersion: res.cryptoVersion,
      cryptoSalt: res.cryptoSalt,
    };
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
   * 명단 — 시간대와 예약을 **한 번의 호출로** 받는다.
   *
   * 두 번 부르면 구글 계정 확인도 두 번 일어난다. 상세 화면은 30초마다 새로 고치므로
   * 호출을 반으로 줄이는 것이 그대로 부담 절반이다.
   *
   * 실패는 빈 배열이 아니라 예외다. 거부를 빈 목록으로 삼키면 화면이 "예약 없음"으로
   * 보이고, 선생님은 자료가 사라졌다고 판단한다.
   */
  async getDetail(
    scheduleId: string,
    adminKey: string,
  ): Promise<{
    slots: SlotPublic[];
    bookings: BookingPublic[];
    cryptoVersion: number;
    cryptoSalt: string | null;
  }> {
    return await this.callEdge<{
      slots: SlotPublic[];
      bookings: BookingPublic[];
      cryptoVersion: number;
      cryptoSalt: string | null;
    }>('consultation-teacher', { action: 'detail', scheduleId, adminKey }, '예약 목록');
  }

  /**
   * 예약 목록 조회 (학생 번호 순)
   *
   * 옛 조회 RPC(get_consultation_bookings)를 직접 부르던 자리다. 그 RPC 는 관리 키만
   * 대조했고, 그 키가 학부모 링크에 실려 나갔다. 지금은 교사 창구를 거친다(ADR-095).
   */
  async getBookings(scheduleId: string, adminKey: string): Promise<BookingPublic[]> {
    const { bookings } = await this.getDetail(scheduleId, adminKey);
    return bookings;
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
   * 교사가 예약을 취소한다.
   *
   * 지우기와 시간대 되돌리기를 앱이 따로 하지 않는다 — 하나만 성공하면 아무도 예약할 수
   * 없는 유령 시간대가 남는다(마이그레이션 059 가 고친 문제다). 서버가 그 RPC 를 그대로
   * 부르고, 앱은 교사 창구만 거친다(ADR-095).
   */
  async cancelBooking(bookingId: string, scheduleId: string, adminKey: string): Promise<void> {
    await this.callEdge<{ ok: true }>(
      'consultation-teacher',
      { action: 'cancelBooking', scheduleId, adminKey, bookingId },
      '예약 정보',
    );
  }

  /**
   * 일정 메타 부분 갱신 (title/type/methods/slotMinutes/dates/message).
   * 슬롯 재생성은 `replaceSlots`로 별도 호출한다 (예약 있는 슬롯 보존을 위해 분리).
   */
  async updateSchedule(
    id: string,
    adminKey: string,
    patch: {
      title?: string;
      type?: 'parent' | 'student';
      methods?: ReadonlyArray<'face' | 'phone' | 'video'>;
      slotMinutes?: number;
      dates?: ReadonlyArray<{ date: string; startTime: string; endTime: string }>;
      message?: string;
      topicOptions?: readonly string[];
    },
  ): Promise<void> {
    if (Object.keys(patch).length === 0) return;
    await this.callEdge<{ ok: true }>(
      'consultation-teacher',
      { action: 'updateSchedule', scheduleId: id, adminKey, patch },
      '상담 일정',
    );
  }

  /**
   * 예약 마감/재개.
   * closed=true 면 현재 시각으로 마감, false 면 재개한다.
   * 마감되면 학부모 예약 페이지가 마감 화면을 표시하고 서버 RPC 도 새 예약을 거부한다.
   */
  async setClosed(id: string, adminKey: string, closed: boolean): Promise<void> {
    await this.callEdge<{ ok: true }>(
      'consultation-teacher',
      { action: 'setClosed', scheduleId: id, adminKey, closed },
      '상담 일정',
    );
  }

  /** 보관/보관 해제 */
  async setArchived(id: string, adminKey: string, archived: boolean): Promise<void> {
    await this.callEdge<{ ok: true }>(
      'consultation-teacher',
      { action: 'setArchived', scheduleId: id, adminKey, archived },
      '상담 일정',
    );
  }

  /** 자동 만료 시각 변경. null 이면 자동 만료 해제. */
  async setExpiresAt(id: string, adminKey: string, iso: string | null): Promise<void> {
    await this.callEdge<{ ok: true }>(
      'consultation-teacher',
      { action: 'setExpiresAt', scheduleId: id, adminKey, expiresAt: iso },
      '상담 일정',
    );
  }

  /**
   * 시간대 재생성.
   *
   * 어떤 시간대를 남기고 지울지는 **서버가 정한다** — 예약이 있는 시간대는 지우지 않고,
   * 반드시 이 일정 것만 손댄다. 앱이 지울 목록을 계산해 보내면, 남의 일정 시간대 id 를
   * 끼워 넣어 그 일정을 막을 수 있다.
   */
  async replaceSlots(
    scheduleId: string,
    adminKey: string,
    params: {
      dates: ReadonlyArray<{ date: string; startTime: string; endTime: string }>;
      slotMinutes: number;
      blockedSlots?: ReadonlyArray<{ date: string; startTime: string }>;
    },
  ): Promise<void> {
    const blockedSet = new Set((params.blockedSlots ?? []).map((b) => `${b.date}_${b.startTime}`));
    const slots: Array<{
      date: string;
      startTime: string;
      endTime: string;
      status: string;
      blockedBy: string | null;
    }> = [];
    for (const d of params.dates) {
      let current = parseTime(d.startTime);
      const end = parseTime(d.endTime);
      while (current + params.slotMinutes <= end) {
        const startTimeStr = formatTime(current);
        const isBlocked = blockedSet.has(`${d.date}_${startTimeStr}`);
        slots.push({
          date: d.date,
          startTime: startTimeStr,
          endTime: formatTime(current + params.slotMinutes),
          status: isBlocked ? 'blocked' : 'available',
          blockedBy: isBlocked ? 'teacher' : null,
        });
        current += params.slotMinutes;
      }
    }
    await this.callEdge<{ ok: true }>(
      'consultation-teacher',
      { action: 'replaceSlots', scheduleId, adminKey, slots },
      '상담 시간대',
    );
  }

  /**
   * 교사(관리자)가 예약 시간을 옮긴다.
   *
   * 동시에 같은 자리를 노리는 요청을 서버 RPC 의 잠금이 막는다(FOR UPDATE).
   * 앱은 교사 창구를 거치고, 서버가 그 RPC 를 그대로 부른다.
   */
  async rescheduleBooking(params: {
    bookingId: string;
    newSlotId: string;
    scheduleId: string;
    adminKey: string;
  }): Promise<{ success: boolean; message: string }> {
    return await this.callEdge<{ success: boolean; message: string }>(
      'consultation-teacher',
      {
        action: 'rescheduleBooking',
        scheduleId: params.scheduleId,
        adminKey: params.adminKey,
        bookingId: params.bookingId,
        newSlotId: params.newSlotId,
      },
      '예약 시간 변경',
    );
  }

  /**
   * 슬롯 상태 배치 변경 — **일정표 자동 동기화 전용**.
   *
   * 여기서 거는 차단은 전부 `blocked_by='auto'` 다. 교사가 직접 막은 슬롯은
   * 이 경로로 들어오면 안 된다(호출자인 recomputeSlotAvailability 가 걸러낸다).
   * 해제 시에는 blocked_by 도 함께 NULL 로 되돌려 상태가 어긋나지 않게 한다.
   */
  async bulkUpdateSlotStatus(
    scheduleId: string,
    adminKey: string,
    slotIds: readonly string[],
    status: 'available' | 'blocked',
  ): Promise<void> {
    if (slotIds.length === 0) return;
    await this.callEdge<{ ok: true }>(
      'consultation-teacher',
      { action: 'bulkSlotStatus', scheduleId, adminKey, slotIds: [...slotIds], status },
      '상담 시간대',
    );
  }

  /**
   * 교사가 슬롯을 직접 막거나 푼다 (상담 상세 화면의 차단/해제 버튼).
   *
   * `bulkUpdateSlotStatus` 와 달리 `blocked_by='teacher'` 를 남기므로
   * 이후 자동 재계산이 이 슬롯을 건드리지 않는다(ADR-060).
   */
  async setSlotBlockedByTeacher(
    scheduleId: string,
    adminKey: string,
    slotId: string,
    blocked: boolean,
  ): Promise<void> {
    await this.callEdge<{ ok: true }>(
      'consultation-teacher',
      { action: 'setSlotBlocked', scheduleId, adminKey, slotId, blocked },
      '상담 시간대',
    );
  }

  /**
   * 슬롯 및 예약 폴링.
   *
   * ★ 실패를 삼키지 않는다. 예전에는 `catch {}` 로 조용히 넘겼는데, 그러면 서버가
   *   거부해도 화면은 마지막에 성공한 명단을 그대로 보여 준다 — 선생님은 지금 보이는
   *   것이 최신이라고 믿는다. 지금은 `onError` 로 올려서 화면이 사유를 말하게 한다.
   *
   * ★ 거부된 뒤에는 폴링을 **멈춘다.** 30초마다 같은 거부를 다시 받는 것은 서버와
   *   구글 확인 호출만 축낸다. 사용자가 다시 열거나 새로 고칠 때 다시 시작한다.
   */
  startPolling(
    scheduleId: string,
    adminKey: string,
    onUpdate: (slots: SlotPublic[], bookings: BookingPublic[]) => void,
    intervalMs = 30_000,
    onError?: (e: unknown) => void,
  ): () => void {
    let timerId: ReturnType<typeof setInterval> | null = null;

    const stop = () => {
      if (timerId !== null) {
        clearInterval(timerId);
        timerId = null;
      }
    };

    const poll = async () => {
      try {
        const { slots, bookings } = await this.getDetail(scheduleId, adminKey);
        onUpdate(slots, bookings);
      } catch (e) {
        stop();
        onError?.(e);
      }
    };

    void poll();
    timerId = setInterval(() => {
      void poll();
    }, intervalMs);

    return stop;
  }
}
