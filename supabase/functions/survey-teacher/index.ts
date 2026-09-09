/**
 * 설문 — 교사용 서버 창구 (ADR-095, 계획서 §6 S2)
 *
 * 상담과 같은 이유·같은 규격이다. 다만 설문은 두 가지가 다르다.
 *   · 응답을 암호화하지 않는다(평문) → 소금값·암호화 판 칸이 없다.
 *   · 앱이 설문 표를 고치는 경로가 없다(마감·삭제는 로컬에서만 한다) → 수정 액션이 없다.
 *     그래서 071 이 설문 표의 anon 수정·삭제 권한을 비용 없이 회수할 수 있었다.
 *
 * action
 *   create     { survey }                 소유자·관리 키를 서버가 발급
 *   responses  { surveyId, adminKey }     응답 목록
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
  type DenialReason,
  type OwnedRow,
} from '../_shared/consultationAccess.ts';

const GLOBAL_LEGACY_DEADLINE = Deno.env.get('CONSULTATION_LEGACY_DEADLINE') ?? '2026-11-30';

const db = () =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const DENIAL_TEXT: Record<DenialReason, string> = {
  not_connected: '구글 계정 연결이 필요합니다. 설정에서 구글 계정을 연결해 주세요',
  different_account: '이 설문을 만든 계정과 같은 구글 계정으로 연결해 주세요',
  legacy_closed: '이 설문은 예전 방식으로 열 수 있는 기간이 끝났습니다',
  key_mismatch: '설문의 관리 키가 일치하지 않습니다',
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

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

interface SurveyRow {
  id: string;
  admin_key: string;
  owner_email: string | null;
  legacy_grace_until: string | null;
}

const toOwnedRow = (r: SurveyRow): OwnedRow => ({
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

    const identity =
      typeof token === 'string' && token ? await verifyGoogleIdentityForConsultation(token) : null;
    const email = identity?.email ?? null;
    const supa = db();

    // ── 만들기 — 구글 확인 필수 ───────────────────────────────────────────
    //
    // ★ 앱이 본문에 owner_email·admin_key 를 보내도 읽지 않는다. 소유자는 서버가
    //   확인한 이메일로만 정해진다.
    if (action === 'create') {
      if (!email) return denied('not_connected');
      const s = body?.survey;
      if (!s || typeof s !== 'object') return errorResponse('설문 정보가 없습니다', 400);

      const adminKey = randomHex(12);
      const { data, error } = await supa
        .from('surveys')
        .insert({
          id: s.id,
          title: s.title,
          description: s.description ?? null,
          mode: s.mode,
          questions: s.questions,
          due_date: s.dueDate ?? null,
          category_color: s.categoryColor ?? '#000000',
          admin_key: adminKey,
          target_count: s.targetCount,
          student_numbers: Array.isArray(s.targetNumbers) ? s.targetNumbers : null,
          pin_protection: s.pinProtection ?? false,
          pin_hashes: s.studentPinHashes ?? null,
          is_closed: false,
          owner_email: email,
          owner_set_at: new Date().toISOString(),
          legacy_grace_until: null,
        })
        .select('id')
        .single();

      if (error || !data) {
        return internalErrorResponse('survey-teacher.create', error, '설문을 만들지 못했습니다');
      }
      return jsonResponse({ id: data.id, adminKey });
    }

    // ── 응답 목록 ─────────────────────────────────────────────────────────
    const surveyId = typeof body?.surveyId === 'string' ? body.surveyId : '';
    const adminKey = typeof body?.adminKey === 'string' ? body.adminKey : null;
    if (!surveyId) return errorResponse('설문을 찾을 수 없습니다', 400);

    const { data: row, error: rowErr } = await supa
      .from('surveys')
      .select('id, admin_key, owner_email, legacy_grace_until')
      .eq('id', surveyId)
      .maybeSingle<SurveyRow>();

    if (rowErr) {
      return internalErrorResponse('survey-teacher.load', rowErr, '설문을 불러오지 못했습니다');
    }
    if (!row) return errorResponse('설문을 찾을 수 없습니다', 404);

    if (action === 'responses') {
      const d = decideReadAccess({
        row: toOwnedRow(row),
        identityEmail: email,
        providedAdminKey: adminKey,
        now: new Date(),
        globalDeadline: GLOBAL_LEGACY_DEADLINE,
      });
      if (!d.ok) return denied(d.reason);

      const { data, error } = await supa
        .from('survey_responses')
        .select('id, survey_id, student_number, answers, submitted_at')
        .eq('survey_id', surveyId)
        .order('student_number', { ascending: true });

      if (error) {
        return internalErrorResponse(
          'survey-teacher.responses',
          error,
          '응답을 불러오지 못했습니다',
        );
      }

      return jsonResponse({
        mode: d.mode,
        responses: (data ?? []).map((r) => ({
          id: r.id,
          surveyId: r.survey_id,
          studentNumber: r.student_number,
          answers: r.answers,
          submittedAt: r.submitted_at,
        })),
      });
    }

    return errorResponse('알 수 없는 요청입니다', 400);
  } catch (err) {
    return internalErrorResponse('survey-teacher', err);
  }
});
