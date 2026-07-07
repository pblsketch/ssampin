/**
 * 쌤핀 AI 챗봇 — 에스컬레이션 (이메일 전달)
 *
 * 버그 신고, 기능 제안, 기타 문의를 개발자에게 이메일로 전달합니다.
 * 이메일 전송: Resend API 사용
 *
 * 필요한 환경변수:
 *   RESEND_API_KEY        — Resend API 키 (없으면 이메일 발송만 skip, 에스컬레이션은 DB 에 저장됨)
 *   ESCALATE_NOTIFY_EMAIL — 에스컬레이션 알림을 받을 개발자 이메일 (없으면 이메일 발송 skip + 로그)
 *
 * security-hardening P1-4 (감사 M-7): IP 기반 rate limit + 개발자 이메일 하드코딩 제거.
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkRateLimit, clientIpFrom } from '../_shared/rateLimit.ts';

// ── 타입 정의 ──────────────────────────────────────────────

interface EscalateImage {
  mimeType: string;
  data: string; // base64 (no data: URL prefix)
}

interface EscalateRequest {
  sessionId: string;
  type: 'bug' | 'feature' | 'other';
  message: string;
  email?: string;
  appVersion?: string;
  appSettings?: string;
  images?: EscalateImage[];
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
const TYPE_LABELS: Record<string, string> = {
  bug: '버그 신고',
  feature: '기능 제안',
  other: '기타 문의',
};

/** Resend API로 이메일 전송 */
async function sendEscalationEmail(params: {
  type: string;
  message: string;
  userEmail?: string;
  appVersion?: string;
  conversationContext: ConversationRow[];
}): Promise<boolean> {
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  // 개발자 알림 이메일은 환경변수로만 받는다 (하드코딩 금지 — 감사 M-7).
  // 하위 호환: 기존 DEVELOPER_EMAIL 도 인정.
  const developerEmail = Deno.env.get('ESCALATE_NOTIFY_EMAIL') ?? Deno.env.get('DEVELOPER_EMAIL');

  if (!resendApiKey) {
    console.warn(
      'RESEND_API_KEY가 설정되지 않아 이메일을 보내지 못했습니다 (에스컬레이션은 DB 에 저장됨)',
    );
    return false;
  }

  if (!developerEmail) {
    console.warn(
      'ESCALATE_NOTIFY_EMAIL 이 설정되지 않아 알림 이메일을 보내지 못했습니다 (에스컬레이션은 DB 에 저장됨)',
    );
    return false;
  }

  const emoji = TYPE_EMOJIS[params.type] ?? '💬';
  const label = TYPE_LABELS[params.type] ?? '기타 문의';

  const conversationHtml = params.conversationContext
    .map(
      (msg) =>
        `<p><strong>${msg.role === 'user' ? '👤 사용자' : '🤖 AI'}:</strong> ${escapeHtml(msg.content)}</p>`,
    )
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
        Authorization: `Bearer ${resendApiKey}`,
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

// 클라이언트(imageUtils.ts/HelpEscalationForm.tsx)와 동일한 제한 — 서버측 방어.
const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_IMAGE_MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

interface StorageUploadClient {
  storage: {
    from(bucket: string): {
      upload(
        path: string,
        body: Uint8Array,
        options: { contentType: string; upsert: boolean },
      ): Promise<{ error: { message: string } | null }>;
    };
  };
}

/**
 * 첨부 스크린샷을 escalation-screenshots 버킷에 업로드하고 저장된 경로들을 반환한다.
 * 개별 이미지가 실패(형식/용량 초과, 업로드 오류)해도 나머지는 계속 시도 — 첨부 문제로
 * 텍스트 신고 자체가 유실되지 않도록 한다.
 * (supabase 는 createClient() 의 제네릭 추론이 호출부마다 달라 unknown 으로 받아 좁은
 *  구조적 타입으로 캐스트한다 — _shared/rateLimit.ts 의 기존 패턴과 동일.)
 */
async function uploadEscalationImages(
  supabaseClient: unknown,
  sessionId: string,
  images: EscalateImage[],
): Promise<string[]> {
  const supabase = supabaseClient as StorageUploadClient;
  const paths: string[] = [];

  for (const img of images.slice(0, MAX_IMAGES)) {
    const ext = ALLOWED_IMAGE_MIME_TO_EXT[img.mimeType];
    if (!ext) {
      console.warn('[ssampin-escalate] 지원하지 않는 이미지 형식 건너뜀:', img.mimeType);
      continue;
    }

    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(img.data), (c) => c.charCodeAt(0));
    } catch {
      console.warn('[ssampin-escalate] 이미지 base64 디코딩 실패, 건너뜀');
      continue;
    }

    if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) {
      console.warn('[ssampin-escalate] 이미지 용량 초과/비어있음, 건너뜀:', bytes.byteLength);
      continue;
    }

    const path = `${sessionId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from('escalation-screenshots')
      .upload(path, bytes, { contentType: img.mimeType, upsert: false });

    if (error) {
      console.error('[ssampin-escalate] 이미지 업로드 실패:', error);
      continue;
    }
    paths.push(path);
  }

  return paths;
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
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Rate limit — IP 당 시간당 5회, 세션 당 시간당 5회 (메일/테이블 폭주 차단)
    const clientIP = clientIpFrom(req);
    const isLimited = await checkRateLimit(supabase, 'escalate', [
      { identifier: clientIP, windowMs: 3_600_000, max: 5 },
      { identifier: body.sessionId, windowMs: 3_600_000, max: 5 },
    ]);
    if (isLimited) {
      return jsonResponse(
        { ok: false, message: '잠시 후 다시 시도해 주세요. 너무 많은 요청이 감지되었어요.' },
        429,
      );
    }

    // 최근 대화 맥락 조회
    const { data: recentConversations } = await supabase
      .from('ssampin_conversations')
      .select('role, content, created_at')
      .eq('session_id', body.sessionId)
      .order('created_at', { ascending: false })
      .limit(10);

    const conversationContext = ((recentConversations ?? []) as ConversationRow[]).reverse();

    // 첨부 스크린샷 업로드 (있는 경우만) — 실패해도 텍스트 신고는 계속 진행
    const imagePaths =
      body.images && body.images.length > 0
        ? await uploadEscalationImages(supabase, body.sessionId, body.images)
        : [];

    // 에스컬레이션 저장
    const { error: insertError } = await supabase.from('ssampin_escalations').insert({
      session_id: body.sessionId,
      type: body.type,
      summary: body.message.slice(0, 200),
      user_email: body.email ?? null,
      user_message: body.message,
      conversation_context: conversationContext,
      email_sent: false,
      image_paths: imagePaths.length > 0 ? imagePaths : null,
    });

    if (insertError) {
      // 내부 식별자(테이블/제약 이름)는 로그에만, 클라이언트에는 일반 메시지.
      console.error('[ssampin-escalate] DB 저장 실패:', insertError);
      return jsonResponse(
        { ok: false, message: '전달 중 오류가 발생했어요. 나중에 다시 시도해 주세요.' },
        500,
      );
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
    return jsonResponse(
      {
        ok: false,
        message: '전달 중 오류가 발생했어요. 나중에 다시 시도해 주세요.',
      } satisfies EscalateResponse,
      500,
    );
  }
});
