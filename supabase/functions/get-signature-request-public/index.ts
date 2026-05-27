import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  corsHeaders,
  errorResponse,
  internalErrorResponse,
  jsonResponse,
} from '../_shared/cors.ts';
import { checkRateLimit, clientIpFrom } from '../_shared/rateLimit.ts';

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return errorResponse('POST only', 405);
  }

  try {
    const { requestId, token } = await req.json();
    if (!requestId || typeof requestId !== 'string') {
      return errorResponse('requestId is required', 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const clientIP = clientIpFrom(req);
    const isLimited = await checkRateLimit(supabase, 'get-signature-request-public', [
      { identifier: clientIP, windowMs: 3_600_000, max: 120 },
      { identifier: `${requestId}:${clientIP}`, windowMs: 3_600_000, max: 120 },
    ]);
    if (isLimited) {
      return errorResponse('요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', 429);
    }

    const { data: request, error: requestError } = await supabase
      .from('signature_requests')
      .select('id,title,description,status,access,due_at')
      .eq('id', requestId)
      .in('status', ['active', 'closed'])
      .single();

    if (requestError || !request) {
      return errorResponse('서명 요청을 찾을 수 없습니다.', 404);
    }

    let participantQuery = supabase
      .from('signature_participants')
      .select('id,display_name,required_signature_kinds')
      .eq('request_id', requestId)
      .order('student_number', { ascending: true, nullsFirst: false })
      .order('display_name', { ascending: true });

    let resolvedParticipantId: string | undefined;
    if (token && typeof token === 'string') {
      const tokenHash = await sha256Hex(token);
      participantQuery = participantQuery.eq('unique_link_token_hash', tokenHash);
    }

    const { data: participants, error: participantError } = await participantQuery;
    if (participantError) {
      return internalErrorResponse('get-signature-request-public participants', participantError);
    }
    if (token && participants?.length === 0) {
      return errorResponse('개인 링크가 유효하지 않습니다.', 403);
    }
    if (token && participants?.[0]?.id) {
      resolvedParticipantId = participants[0].id;
    }

    return jsonResponse({
      id: request.id,
      title: request.title,
      description: request.description,
      status: request.status,
      dueAt: request.due_at,
      pinEnabled: Boolean((request.access as { pinEnabled?: boolean } | null)?.pinEnabled),
      uniqueLinksEnabled: Boolean(
        (request.access as { uniqueLinksEnabled?: boolean } | null)?.uniqueLinksEnabled,
      ),
      participants: (participants ?? []).map((participant) => ({
        id: participant.id,
        displayName: participant.display_name,
        requiredSignatureKinds: participant.required_signature_kinds ?? ['recipient'],
      })),
      resolvedParticipantId,
    });
  } catch (err) {
    return internalErrorResponse('get-signature-request-public', err);
  }
});
