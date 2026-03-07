/**
 * 쌤핀 AI 챗봇 — 에스컬레이션 (이메일 전달)
 *
 * 버그 신고, 기능 제안, 기타 문의를 개발자에게 이메일로 전달합니다.
 * 이메일 전송: Resend API 사용
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── 타입 정의 ──────────────────────────────────────────────

interface EscalateRequest {
  sessionId: string;
  type: 'bug' | 'feature' | 'other';
  message: string;
  email?: string;
  appVersion?: string;
  appSettings?: string;
}

interface EscalateResponse {
  ok: boolean;
  message: string;
}

interface ConversationRow {
  role: string;
  content: string;
  created_at: string;
}

// ── CORS ──────────────────────────────────────────────────

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ── 헬퍼 ──────────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

const TYPE_EMOJIS: Record<string, string> = { bug: '🐛', feature: '💡', other: '💬' };
const TYPE_LABELS: Record<string, string> = { bug: '버그 신고', feature: '기능 제안', other: '기타 문의' };

/** Resend API로 이메일 전송 */
async function sendEscalationEmail(params: {
  type: string;
  message: string;
  userEmail?: string;
  appVersion?: string;
  conversationContext: ConversationRow[];
}): Promise<boolean> {
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const developerEmail = Deno.env.get('DEVELOPER_EMAIL') ?? 'wnsdlf1212@gmail.com';

  if (!resendApiKey) {
    console.warn('RESEND_API_KEY가 설정되지 않아 이메일을 보내지 못했습니다');
    return false;
  }

  const emoji = TYPE_EMOJIS[params.type] ?? '💬';
  const label = TYPE_LABELS[params.type] ?? '기타 문의';

  const conversationHtml = params.conversationContext
    .map((msg) => `<p><strong>${msg.role === 'user' ? '👤 사용자' : '🤖 AI'}:</strong> ${escapeHtml(msg.content)}</p>`)
    .join('');

  const html = `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="utf-8"></head>
<body style="font-family: 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif;">
  <h2>${emoji} 쌤핀 ${label}</h2>
  <hr/>
  <h3>📝 내용</h3>
  <p>${escapeHtml(params.message)}</p>
  ${params.userEmail ? `<p><strong>회신 이메일:</strong> ${escapeHtml(params.userEmail)}</p>` : ''}
  ${params.appVersion ? `<p><strong>앱 버전:</strong> ${escapeHtml(params.appVersion)}</p>` : ''}
  <h3>💬 대화 맥락</h3>
  ${conversationHtml || '<p>(대화 맥락 없음)</p>'}
  <hr/>
  <p style="color: #999; font-size: 12px;">쌤핀 AI 챗봇에서 자동 전달됨</p>
</body>
</html>`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: 'SsamPin Bot <onboarding@resend.dev>',
        to: [developerEmail],
        subject: `${emoji} [쌤핀] ${label}: ${params.message.slice(0, 50)}`,
        html,
      }),
    });

    return response.ok;
  } catch (error) {
    console.error('이메일 전송 실패:', error);
    return false;
  }
}

/** HTML 이스케이프 (XSS 방지) */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── 메인 핸들러 ───────────────────────────────────────────

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const body = (await req.json()) as EscalateRequest;

    // 검증
    if (!body.sessionId || !body.type || !body.message) {
      return jsonResponse({ ok: false, message: '필수 항목이 누락되었습니다' }, 400);
    }

    if (!['bug', 'feature', 'other'].includes(body.type)) {
      return jsonResponse({ ok: false, message: '유효하지 않은 유형입니다' }, 400);
    }

    if (body.message.length > 2000) {
      return jsonResponse({ ok: false, message: '메시지는 2000자 이내로 입력해 주세요' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 최근 대화 맥락 조회
    const { data: recentConversations } = await supabase
      .from('ssampin_conversations')
      .select('role, content, created_at')
      .eq('session_id', body.sessionId)
      .order('created_at', { ascending: false })
      .limit(10);

    const conversationContext = ((recentConversations ?? []) as ConversationRow[]).reverse();

    // 에스컬레이션 저장
    const { error: insertError } = await supabase.from('ssampin_escalations').insert({
      session_id: body.sessionId,
      type: body.type,
      summary: body.message.slice(0, 200),
      user_email: body.email ?? null,
      user_message: body.message,
      conversation_context: conversationContext,
      email_sent: false,
    });

    if (insertError) {
      throw new Error(`DB 저장 실패: ${insertError.message}`);
    }

    // 이메일 전송
    const emailSent = await sendEscalationEmail({
      type: body.type,
      message: body.message,
      userEmail: body.email,
      appVersion: body.appVersion,
      conversationContext,
    });

    // 이메일 전송 결과 업데이트
    if (emailSent) {
      await supabase
        .from('ssampin_escalations')
        .update({ email_sent: true })
        .eq('session_id', body.sessionId)
        .order('created_at', { ascending: false })
        .limit(1);
    }

    const label = TYPE_LABELS[body.type] ?? '문의';

    return jsonResponse({
      ok: true,
      message: `${label}가 개발자에게 전달되었어요! 빠르게 확인하겠습니다 🙏`,
    } satisfies EscalateResponse);

  } catch (error) {
    console.error('Escalate error:', error);
    return jsonResponse({
      ok: false,
      message: '전달 중 오류가 발생했어요. 나중에 다시 시도해 주세요.',
    } satisfies EscalateResponse, 500);
  }
});
