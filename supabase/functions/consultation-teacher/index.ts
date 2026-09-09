/**
 * 상담 — 교사용 서버 창구 (ADR-095, 계획서 §6 S2)
 *
 * 지금까지 교사 앱은 anon 열쇠로 표를 직접 읽고 고쳤다. 신분증은 관리 키 하나뿐이었는데,
 * 그 값이 학부모 링크에도 실려 나가서 링크를 받은 사람이 신분증을 갖는 상태였다.
 * 이 함수가 그 문을 대신한다 — 들어오려면 **쌤핀이 발급받은 구글 토큰**이 있어야 한다.
 * 학부모 브라우저는 그 토큰을 만들 수 없으므로, 링크만 가진 사람은 여기서 멈춘다.
 *
 * 호출 규격은 온라인 교무실 8종과 같다: 본문에 `{ action, googleAccessToken, ... }`.
 *
 * action
 *   detail            { scheduleId, adminKey }                  시간대 + 예약을 한 번에
 *   create            { schedule }                              소유자·소금값·관리 키를 서버가 발급
 *   updateSchedule    { scheduleId, adminKey, patch }
 *   setClosed         { scheduleId, adminKey, closed }
 *   setArchived       { scheduleId, adminKey, archived }
 *   setExpiresAt      { scheduleId, adminKey, expiresAt }
 *   replaceSlots      { scheduleId, adminKey, slots }
 *   bulkSlotStatus    { scheduleId, adminKey, slotIds, status }
 *   setSlotBlocked    { scheduleId, adminKey, slotId, blocked }
 *   cancelBooking     { scheduleId, adminKey, bookingId }
 *
 * ★ 학부모·학생이 부르는 경로는 여기 하나도 없다. 예약·변경·취소·설문 응답은 종전
 *   RPC 그대로다(계획서 §5 계약서). 이 함수는 교사 쪽만 옮긴다.
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  corsHeaders,
  jsonResponse,
  errorResponse,
  internalErrorResponse,
} from '../_shared/cors.ts';
import { verifyGoogleIdentityForConsultation } from '../_shared/googleIdentity.ts';
import {
  decideReadAccess,
  decideWriteAccess,
  type AccessDecision,
  type DenialReason,
  type OwnedRow,
} from '../_shared/consultationAccess.ts';

/** 소유자가 없는 옛 일정이 옛 방식으로 열리는 마지막 날(전역 상한). 071 과 같은 값. */
const GLOBAL_LEGACY_DEADLINE = Deno.env.get('CONSULTATION_LEGACY_DEADLINE') ?? '2026-11-30';

const db = () =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

/** 거부 사유별 화면 문구 — 앱은 `reason` 으로 고르고, 이건 예비용이다. */
const DENIAL_TEXT: Record<DenialReason, string> = {
  not_connected: '구글 계정 연결이 필요합니다. 설정에서 구글 계정을 연결해 주세요',
  different_account: '이 일정을 만든 계정과 같은 구글 계정으로 연결해 주세요',
  legacy_closed: '이 일정은 예전 방식으로 열 수 있는 기간이 끝났습니다',
  key_mismatch: '상담 일정의 관리 키가 일치하지 않습니다',
};
const DENIAL_STATUS: Record<DenialReason, number> = {
  not_connected: 401,
  different_account: 403,
  legacy_closed: 403,
  key_mismatch: 403,
};

function denied(reason: DenialReason): Response {
  return new Response(JSON.stringify({ error: DENIAL_TEXT[reason], reason }), {
    status: DENIAL_STATUS[reason],
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** hex 난수 — 관리 키·소금값 모두 이걸로 만든다(복사·전달 사고를 줄이려고 hex 로 고정). */
function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

interface ScheduleRow {
  id: string;
  admin_key: string;
  owner_email: string | null;
  legacy_grace_until: string | null;
  crypto_version: number;
  crypto_salt: string | null;
}

const toOwnedRow = (r: ScheduleRow): OwnedRow => ({
  ownerEmail: r.owner_email,
  adminKey: r.admin_key,
  legacyGraceUntil: r.legacy_grace_until,
});

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => null);
    const action: unknown = body?.action;
    const token: unknown = body?.googleAccessToken;

    // 토큰이 아예 없어도 여기서 끝내지 않고 판정 함수에 null 로 넘긴다 —
    // 사유 코드를 한 곳에서만 정하려는 것이다(화면 문구가 갈라지지 않는다).
    const identity =
      typeof token === 'string' && token ? await verifyGoogleIdentityForConsultation(token) : null;
    const email = identity?.email ?? null;

    const supa = db();

    // ── 만들기 — 구글 확인 필수, 소유자·소금값·관리 키는 서버가 정한다 ──────
    //
    // ★ 앱이 본문에 owner_email·crypto_salt·admin_key 를 보내도 **읽지 않는다.**
    //   읽으면 "내가 소유자다"라고 주장하는 것만으로 소유자가 되어, 서버가 검증한
    //   신원으로만 소유권이 생긴다는 원칙이 무너진다.
    if (action === 'create') {
      if (!email) return denied('not_connected');
      const s = body?.schedule;
      if (!s || typeof s !== 'object') return errorResponse('일정 정보가 없습니다', 400);

      const adminKey = randomHex(12);
      const cryptoSalt = randomHex(16);
      const { data, error } = await supa
        .from('consultation_schedules')
        .insert({
          id: s.id,
          title: s.title,
          type: s.type,
          methods: s.methods,
          slot_minutes: s.slotMinutes,
          dates: s.dates,
          target_class_name: s.targetClassName,
          target_students: s.targetStudents,
          message: s.message ?? null,
          admin_key: adminKey,
          is_archived: false,
          expires_at: s.expiresAt ?? null,
          owner_email: email,
          owner_set_at: new Date().toISOString(),
          crypto_version: 2,
          crypto_salt: cryptoSalt,
          legacy_grace_until: null,
        })
        .select('id')
        .single();

      if (error || !data) {
        return internalErrorResponse(
          'consultation-teacher.create',
          error,
          '일정을 만들지 못했습니다',
        );
      }

      const slots = Array.isArray(s.slots) ? s.slots : [];
      if (slots.length > 0) {
        const { error: slotErr } = await supa.from('consultation_slots').insert(
          slots.map((sl: Record<string, unknown>) => ({
            schedule_id: data.id,
            date: sl.date,
            start_time: sl.startTime,
            end_time: sl.endTime,
            status: sl.status ?? 'available',
            blocked_by: sl.blockedBy ?? null,
          })),
        );
        if (slotErr) {
          // 반쪽 일정을 남기지 않는다 — 앱은 이 실패를 받고 로컬 저장·링크 조립을 하지 않는다.
          await supa.from('consultation_schedules').delete().eq('id', data.id);
          return internalErrorResponse(
            'consultation-teacher.create.slots',
            slotErr,
            '시간대를 만들지 못했습니다',
          );
        }
      }

      return jsonResponse({ id: data.id, adminKey, cryptoVersion: 2, cryptoSalt });
    }

    // ── 여기부터는 기존 일정을 다루는 액션 ────────────────────────────────
    const scheduleId = typeof body?.scheduleId === 'string' ? body.scheduleId : '';
    const adminKey = typeof body?.adminKey === 'string' ? body.adminKey : null;
    if (!scheduleId) return errorResponse('일정을 찾을 수 없습니다', 400);

    const { data: row, error: rowErr } = await supa
      .from('consultation_schedules')
      .select('id, admin_key, owner_email, legacy_grace_until, crypto_version, crypto_salt')
      .eq('id', scheduleId)
      .maybeSingle<ScheduleRow>();

    if (rowErr) {
      return internalErrorResponse(
        'consultation-teacher.load',
        rowErr,
        '일정을 불러오지 못했습니다',
      );
    }
    if (!row) return errorResponse('일정을 찾을 수 없습니다', 404);

    const common = {
      row: toOwnedRow(row),
      identityEmail: email,
      providedAdminKey: adminKey,
      now: new Date(),
      globalDeadline: GLOBAL_LEGACY_DEADLINE,
    };
    const decide = (write: boolean): AccessDecision =>
      write ? decideWriteAccess(common) : decideReadAccess(common);

    // ── 명단 — 시간대와 예약을 한 번에 돌려준다 ───────────────────────────
    //
    // 두 번 부르면 구글 확인도 두 번 일어난다. 상세 화면은 30초마다 새로 고치므로
    // 호출을 반으로 줄이는 것이 그대로 부담 절반이다(계획서 §6 S2 완화 2).
    if (action === 'detail') {
      const d = decide(false);
      if (!d.ok) return denied(d.reason);

      const [slotsRes, bookingsRes] = await Promise.all([
        supa
          .from('consultation_slots')
          .select('id, schedule_id, date, start_time, end_time, status, blocked_by')
          .eq('schedule_id', scheduleId)
          .order('date', { ascending: true })
          .order('start_time', { ascending: true }),
        supa
          .from('consultation_bookings')
          .select(
            'id, schedule_id, slot_id, student_number, booker_info_encrypted, method, memo_encrypted, created_at',
          )
          .eq('schedule_id', scheduleId)
          .order('student_number', { ascending: true }),
      ]);

      if (slotsRes.error || bookingsRes.error) {
        return internalErrorResponse(
          'consultation-teacher.detail',
          slotsRes.error ?? bookingsRes.error,
          '명단을 불러오지 못했습니다',
        );
      }

      // ★ 학부모 본인 확인용 토큰(`token` 칸)은 **한 글자도 내보내지 않는다.** 명단에
      //   섞여 나가면 남의 예약을 취소·변경할 수 있게 된다. 위 select 목록에 없다.
      return jsonResponse({
        mode: d.mode,
        cryptoVersion: row.crypto_version,
        cryptoSalt: row.crypto_salt,
        slots: (slotsRes.data ?? []).map((s) => ({
          id: s.id,
          scheduleId: s.schedule_id,
          date: s.date,
          startTime: s.start_time,
          endTime: s.end_time,
          status: s.status,
          ...(s.blocked_by === 'teacher' || s.blocked_by === 'auto'
            ? { blockedBy: s.blocked_by }
            : {}),
        })),
        bookings: (bookingsRes.data ?? []).map((b) => ({
          id: b.id,
          scheduleId: b.schedule_id,
          slotId: b.slot_id,
          studentNumber: b.student_number,
          bookerInfoEncrypted: b.booker_info_encrypted ?? undefined,
          method: b.method,
          memoEncrypted: b.memo_encrypted ?? undefined,
          createdAt: b.created_at,
        })),
      });
    }

    // ── 여기부터 수정 액션 — 전부 같은 판정을 거친다 ──────────────────────
    const w = decide(true);
    if (!w.ok) return denied(w.reason);

    const patchSchedule = async (patch: Record<string, unknown>, label: string) => {
      const { error } = await supa
        .from('consultation_schedules')
        .update(patch)
        .eq('id', scheduleId);
      return error
        ? internalErrorResponse(`consultation-teacher.${label}`, error, '일정을 고치지 못했습니다')
        : jsonResponse({ ok: true });
    };

    if (action === 'updateSchedule') {
      const p = body?.patch ?? {};
      const patch: Record<string, unknown> = {};
      if (p.title !== undefined) patch.title = p.title;
      if (p.type !== undefined) patch.type = p.type;
      if (p.methods !== undefined) patch.methods = p.methods;
      if (p.slotMinutes !== undefined) patch.slot_minutes = p.slotMinutes;
      if (p.dates !== undefined) patch.dates = p.dates;
      if (p.message !== undefined) patch.message = p.message;
      // ★ owner_email·crypto_salt·admin_key 는 여기서 절대 받지 않는다.
      //   받으면 수정 창구가 소유권 이전 창구가 된다.
      if (Object.keys(patch).length === 0) return jsonResponse({ ok: true });
      return await patchSchedule(patch, 'updateSchedule');
    }

    if (action === 'setClosed') {
      return await patchSchedule(
        { closed_at: body?.closed ? new Date().toISOString() : null },
        'setClosed',
      );
    }
    if (action === 'setArchived') {
      return await patchSchedule({ is_archived: Boolean(body?.archived) }, 'setArchived');
    }
    if (action === 'setExpiresAt') {
      const iso = typeof body?.expiresAt === 'string' ? body.expiresAt : null;
      return await patchSchedule({ expires_at: iso }, 'setExpiresAt');
    }

    // ── 시간대 ────────────────────────────────────────────────────────────
    //
    // ★ 시간대는 반드시 `schedule_id` 로 좁혀서 고친다. 앱이 보낸 slotId 목록만 믿고
    //   고치면, 남의 일정 시간대 id 를 끼워 넣어 그 일정을 막을 수 있다.
    if (action === 'replaceSlots') {
      const incoming = Array.isArray(body?.slots) ? body.slots : [];
      const { data: current, error: curErr } = await supa
        .from('consultation_slots')
        .select('id, date, start_time, status')
        .eq('schedule_id', scheduleId);
      if (curErr) {
        return internalErrorResponse(
          'consultation-teacher.replaceSlots.load',
          curErr,
          '시간대를 불러오지 못했습니다',
        );
      }

      const wanted = new Set(
        incoming.map((s: Record<string, string>) => `${s.date}_${s.startTime}`),
      );
      const have = new Map((current ?? []).map((s) => [`${s.date}_${s.start_time}`, s]));

      // 예약이 있는 시간대는 지우지 않는다 — 지우면 학부모의 예약이 함께 사라진다.
      const removable = (current ?? [])
        .filter((s) => s.status !== 'booked' && !wanted.has(`${s.date}_${s.start_time}`))
        .map((s) => s.id);
      if (removable.length > 0) {
        // ★ 지우는 쿼리에도 "예약된 것은 빼고"를 다시 건다.
        //   위에서 읽을 때 비어 있던 시간대에 **읽고 지우는 사이** 학부모 예약이
        //   들어올 수 있다. 상담 수정은 학부모가 예약하는 바로 그 기간에 일어나므로
        //   실제로 생기는 일이고, 조건 없이 지우면 방금 들어온 예약이 함께 사라진다.
        const { error } = await supa
          .from('consultation_slots')
          .delete()
          .eq('schedule_id', scheduleId)
          .neq('status', 'booked')
          .in('id', removable);
        if (error) {
          return internalErrorResponse(
            'consultation-teacher.replaceSlots.delete',
            error,
            '시간대를 고치지 못했습니다',
          );
        }
      }

      const toAdd = incoming
        .filter((s: Record<string, string>) => !have.has(`${s.date}_${s.startTime}`))
        .map((s: Record<string, unknown>) => ({
          schedule_id: scheduleId,
          date: s.date,
          start_time: s.startTime,
          end_time: s.endTime,
          status: s.status ?? 'available',
          blocked_by: s.blockedBy ?? null,
        }));
      if (toAdd.length > 0) {
        const { error } = await supa.from('consultation_slots').insert(toAdd);
        if (error) {
          return internalErrorResponse(
            'consultation-teacher.replaceSlots.insert',
            error,
            '시간대를 고치지 못했습니다',
          );
        }
      }
      return jsonResponse({ ok: true, removed: removable.length, added: toAdd.length });
    }

    if (action === 'bulkSlotStatus') {
      const ids = Array.isArray(body?.slotIds)
        ? body.slotIds.filter((v: unknown) => typeof v === 'string')
        : [];
      const status = body?.status === 'blocked' ? 'blocked' : 'available';
      if (ids.length === 0) return jsonResponse({ ok: true });
      // ★ 예약된 시간대는 건드리지 않는다. 읽고 쓰는 사이에 예약이 들어왔는데
      //   available 로 되돌리면 같은 자리에 예약이 하나 더 들어올 수 있다.
      const { error } = await supa
        .from('consultation_slots')
        .update({ status, blocked_by: status === 'blocked' ? 'auto' : null })
        .eq('schedule_id', scheduleId)
        .neq('status', 'booked')
        .in('id', ids);
      return error
        ? internalErrorResponse(
            'consultation-teacher.bulkSlotStatus',
            error,
            '시간대를 고치지 못했습니다',
          )
        : jsonResponse({ ok: true });
    }

    if (action === 'setSlotBlocked') {
      const slotId = typeof body?.slotId === 'string' ? body.slotId : '';
      if (!slotId) return errorResponse('시간대를 찾을 수 없습니다', 400);
      const blocked = Boolean(body?.blocked);
      // ★ 예약이 들어온 시간대는 막지도 풀지도 않는다(위와 같은 경쟁 상태).
      const { error } = await supa
        .from('consultation_slots')
        .update(
          blocked
            ? { status: 'blocked', blocked_by: 'teacher' }
            : { status: 'available', blocked_by: null },
        )
        .eq('schedule_id', scheduleId)
        .neq('status', 'booked')
        .eq('id', slotId);
      return error
        ? internalErrorResponse(
            'consultation-teacher.setSlotBlocked',
            error,
            '시간대를 고치지 못했습니다',
          )
        : jsonResponse({ ok: true });
    }

    // ── 교사가 예약을 취소한다 / 시간을 옮긴다 ────────────────────────────
    //
    // ★ 표를 직접 지우고 시간대를 되돌리는 방식으로 쓰지 않는다. 두 번의 쓰기가
    //   원자적이지 않아, 지우기는 됐는데 되돌리기가 실패하면 **아무도 예약할 수 없는
    //   유령 시간대**가 남는다. 마이그레이션 059 가 그래서 RPC 를 만들었다.
    //   service_role 로 그 RPC 를 그대로 부른다 — 잠금과 원자성을 물려받는다.
    if (action === 'cancelBooking') {
      const bookingId = typeof body?.bookingId === 'string' ? body.bookingId : '';
      if (!bookingId) return errorResponse('예약을 찾을 수 없습니다', 400);
      const { error } = await supa.rpc('cancel_consultation_booking_by_admin', {
        p_booking_id: bookingId,
        p_schedule_id: scheduleId,
        // 앱이 보낸 키가 아니라 **서버가 들고 있는 키**를 넘긴다. 신원 판정은 위에서 끝났다.
        p_admin_key: row.admin_key,
      });
      if (error) {
        if (error.code === 'P0002') {
          return errorResponse(
            '이미 취소되었거나 찾을 수 없는 예약입니다. 목록을 새로고침해 주세요.',
            404,
          );
        }
        return internalErrorResponse(
          'consultation-teacher.cancelBooking',
          error,
          '예약을 취소하지 못했습니다',
        );
      }
      return jsonResponse({ ok: true });
    }

    if (action === 'rescheduleBooking') {
      const bookingId = typeof body?.bookingId === 'string' ? body.bookingId : '';
      const newSlotId = typeof body?.newSlotId === 'string' ? body.newSlotId : '';
      if (!bookingId || !newSlotId) return errorResponse('예약을 찾을 수 없습니다', 400);
      const { data, error } = await supa.rpc('reschedule_consultation_booking', {
        p_booking_id: bookingId,
        p_new_slot_id: newSlotId,
        p_schedule_id: scheduleId,
      });
      if (error) {
        // 409 는 "그 사이 누가 채갔다"는 뜻이라 내부 오류가 아니다 — 문장으로 알려 준다.
        const conflict = error.code === '23505' || `${error.message}`.includes('409');
        return conflict
          ? jsonResponse({
              success: false,
              message: '선택한 시간대는 이미 예약되었거나 차단되었습니다.',
            })
          : internalErrorResponse(
              'consultation-teacher.rescheduleBooking',
              error,
              '예약 시간을 바꾸지 못했습니다',
            );
      }
      const raw = data as { success?: boolean; message?: string } | null;
      return jsonResponse({
        success: raw?.success ?? true,
        message: raw?.message ?? '예약 시간이 변경되었습니다.',
      });
    }

    return errorResponse('알 수 없는 요청입니다', 400);
  } catch (err) {
    return internalErrorResponse('consultation-teacher', err);
  }
});
