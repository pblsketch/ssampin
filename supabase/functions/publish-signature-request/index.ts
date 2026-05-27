import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  corsHeaders,
  errorResponse,
  internalErrorResponse,
  jsonResponse,
} from '../_shared/cors.ts';
import { checkRateLimit, clientIpFrom } from '../_shared/rateLimit.ts';

interface PublishParticipantPayload {
  readonly clientId: string;
  readonly displayName: string;
  readonly role: string;
  readonly studentNumber?: number;
  readonly className?: string;
  readonly requiredSignatureKinds: readonly string[];
  readonly uniqueLinkToken?: string;
  readonly pin?: string;
}

interface PublishBody {
  readonly title?: string;
  readonly description?: string;
  readonly templateKind?: string;
  readonly templateSource?: { type?: string; url?: string };
  readonly mapping?: unknown;
  readonly access?: { uniqueLinksEnabled?: boolean; pinEnabled?: boolean };
  readonly participants?: readonly PublishParticipantPayload[];
  readonly teacherId?: string;
}

const ALLOWED_TEMPLATE_KINDS = new Set([
  'general-register',
  'training-register',
  'absence-form',
  'notice-form',
  'custom',
]);

const ALLOWED_ROLES = new Set(['teacher', 'student', 'parent', 'guardian', 'staff', 'custom']);

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
    const body = (await req.json()) as PublishBody;

    if (!body.title || body.title.trim().length === 0) {
      return errorResponse('title이 필요합니다.', 400);
    }
    if (body.title.trim().length > 200) {
      return errorResponse('title이 너무 깁니다.', 400);
    }
    if (!body.templateKind || !ALLOWED_TEMPLATE_KINDS.has(body.templateKind)) {
      return errorResponse('지원하지 않는 templateKind입니다.', 400);
    }
    if (!body.templateSource?.type || !body.templateSource.url) {
      return errorResponse('templateSource가 누락되었습니다.', 400);
    }
    if (!Array.isArray(body.participants) || body.participants.length === 0) {
      return errorResponse('participants가 비어 있습니다.', 400);
    }
    if (body.participants.length > 500) {
      return errorResponse('명단 인원이 너무 많습니다.', 400);
    }
    if (!body.access || typeof body.access.uniqueLinksEnabled !== 'boolean') {
      return errorResponse('access 옵션이 누락되었습니다.', 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const clientIP = clientIpFrom(req);
    const isLimited = await checkRateLimit(supabase, 'publish-signature-request', [
      { identifier: clientIP, windowMs: 3_600_000, max: 30 },
    ]);
    if (isLimited) {
      return errorResponse('요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', 429);
    }

    const requestId = crypto.randomUUID();
    const adminKey = crypto.randomUUID();
    const teacherId = body.teacherId?.trim() || `anon-${await sha256Hex(clientIP)}`;
    const access = {
      uniqueLinksEnabled: Boolean(body.access.uniqueLinksEnabled),
      pinEnabled: Boolean(body.access.pinEnabled),
    };

    const { error: insertRequestError } = await supabase.from('signature_requests').insert({
      id: requestId,
      teacher_id: teacherId,
      admin_key: adminKey,
      title: body.title.trim(),
      description: body.description?.trim() || null,
      template_kind: body.templateKind,
      template_source: body.templateSource,
      mapping: body.mapping ?? { textFields: [], signatureSlots: [] },
      access,
      scope: { legalEffect: 'none', automaticReminders: false, strongIdentityRequired: false },
      status: 'active',
    });

    if (insertRequestError) {
      return internalErrorResponse('publish-signature-request request', insertRequestError);
    }

    const participantRows: Array<{
      id: string;
      clientId: string;
      displayName: string;
      studentNumber?: number;
    }> = [];

    for (const participant of body.participants) {
      const trimmedName = participant.displayName?.trim() ?? '';
      if (!trimmedName) {
        return errorResponse('명단에 빈 이름이 포함되었습니다.', 400);
      }
      const role = ALLOWED_ROLES.has(participant.role) ? participant.role : 'staff';
      const tokenHash = participant.uniqueLinkToken
        ? await sha256Hex(participant.uniqueLinkToken)
        : null;
      const pinHash =
        access.pinEnabled && participant.pin ? await sha256Hex(participant.pin) : null;
      const participantId = crypto.randomUUID();

      const { error: insertParticipantError } = await supabase
        .from('signature_participants')
        .insert({
          id: participantId,
          request_id: requestId,
          display_name: trimmedName,
          role,
          student_number: participant.studentNumber ?? null,
          class_name: participant.className ?? null,
          required_signature_kinds: participant.requiredSignatureKinds ?? ['recipient'],
          unique_link_token_hash: tokenHash,
          pin_hash: pinHash,
        });
      if (insertParticipantError) {
        return internalErrorResponse(
          'publish-signature-request participant',
          insertParticipantError,
        );
      }
      participantRows.push({
        id: participantId,
        clientId: participant.clientId,
        displayName: trimmedName,
        studentNumber: participant.studentNumber,
      });
    }

    return jsonResponse({
      requestId,
      adminKey,
      participants: participantRows,
    });
  } catch (err) {
    return internalErrorResponse('publish-signature-request', err);
  }
});
