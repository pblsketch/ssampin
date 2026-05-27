import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  corsHeaders,
  errorResponse,
  internalErrorResponse,
  jsonResponse,
} from '../_shared/cors.ts';
import { checkRateLimit, clientIpFrom } from '../_shared/rateLimit.ts';

const MAX_SIGNATURE_BYTES = 1024 * 1024;
const SIGNATURE_BUCKET = 'signature-images';

interface SubmitSignatureBody {
  readonly requestId?: string;
  readonly participantId?: string;
  readonly token?: string;
  readonly pin?: string;
  readonly signatureKind?: string;
  readonly signerName?: string;
  readonly signatureImageDataUrl?: string;
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function parseSignatureDataUrl(dataUrl: string): { mimeType: string; bytes: Uint8Array } | null {
  const match = dataUrl.match(/^data:(image\/png|image\/webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!match?.[1] || !match?.[2]) return null;
  let binary: string;
  try {
    binary = atob(match[2]);
  } catch {
    return null;
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return { mimeType: match[1], bytes };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return errorResponse('POST only', 405);
  }

  try {
    const body = (await req.json()) as SubmitSignatureBody;
    const {
      requestId,
      participantId,
      token,
      pin,
      signatureKind,
      signerName,
      signatureImageDataUrl,
    } = body;

    if (!requestId || !signatureKind || !signerName || !signatureImageDataUrl) {
      return errorResponse('필수 필드가 누락되었습니다.', 400);
    }
    if (!participantId && !token) {
      return errorResponse('participantId 또는 token이 필요합니다.', 400);
    }
    if (signerName.trim().length > 100) {
      return errorResponse('이름이 너무 깁니다.', 400);
    }

    const parsedImage = parseSignatureDataUrl(signatureImageDataUrl);
    if (!parsedImage) {
      return errorResponse('서명 이미지는 PNG 또는 WebP base64 data URL이어야 합니다.', 400);
    }
    if (parsedImage.bytes.byteLength > MAX_SIGNATURE_BYTES) {
      return errorResponse('서명 이미지가 너무 큽니다.', 413);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const clientIP = clientIpFrom(req);
    const isLimited = await checkRateLimit(supabase, 'submit-signature', [
      { identifier: clientIP, windowMs: 3_600_000, max: 60 },
      { identifier: `${requestId}:${clientIP}`, windowMs: 3_600_000, max: 30 },
    ]);
    if (isLimited) {
      return errorResponse('요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', 429);
    }

    const { data: request, error: requestError } = await supabase
      .from('signature_requests')
      .select('id,status,access')
      .eq('id', requestId)
      .eq('status', 'active')
      .single();

    if (requestError || !request) {
      return errorResponse('서명 요청이 열려 있지 않습니다.', 404);
    }

    let participantQuery = supabase
      .from('signature_participants')
      .select('id,required_signature_kinds,unique_link_token_hash,pin_hash')
      .eq('request_id', requestId)
      .limit(1);

    if (token) {
      participantQuery = participantQuery.eq('unique_link_token_hash', await sha256Hex(token));
    } else {
      participantQuery = participantQuery.eq('id', participantId);
    }

    const { data: participants, error: participantError } = await participantQuery;
    const participant = participants?.[0];
    if (participantError || !participant) {
      return errorResponse('서명 대상자를 확인할 수 없습니다.', 403);
    }

    const requiredKinds = (participant.required_signature_kinds ?? ['recipient']) as string[];
    if (!requiredKinds.includes(signatureKind)) {
      return errorResponse('이 대상자에게 필요한 서명 종류가 아닙니다.', 400);
    }

    const pinEnabled = Boolean((request.access as { pinEnabled?: boolean } | null)?.pinEnabled);
    if (pinEnabled) {
      if (!pin || !participant.pin_hash) {
        return errorResponse('PIN이 필요합니다.', 403);
      }
      const pinHash = await sha256Hex(pin);
      if (pinHash !== participant.pin_hash) {
        return errorResponse('PIN이 일치하지 않습니다.', 403);
      }
    }

    const submissionId = crypto.randomUUID();
    const extension = parsedImage.mimeType === 'image/webp' ? 'webp' : 'png';
    const storagePath = `${requestId}/${participant.id}/${signatureKind}-${submissionId}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from(SIGNATURE_BUCKET)
      .upload(storagePath, parsedImage.bytes, {
        contentType: parsedImage.mimeType,
        upsert: true,
      });
    if (uploadError) {
      return internalErrorResponse('submit-signature storage', uploadError);
    }

    const ipHash = await sha256Hex(clientIP);
    const userAgentHash = await sha256Hex(req.headers.get('user-agent') ?? 'unknown');
    const { error: upsertError } = await supabase.from('signature_submissions').upsert(
      {
        id: submissionId,
        request_id: requestId,
        participant_id: participant.id,
        signature_kind: signatureKind,
        signer_name: signerName.trim(),
        signature_image_path: storagePath,
        signature_image_mime: parsedImage.mimeType,
        signature_image_size_bytes: parsedImage.bytes.byteLength,
        submitted_at: new Date().toISOString(),
        ip_hash: ipHash,
        user_agent_hash: userAgentHash,
      },
      { onConflict: 'request_id,participant_id,signature_kind' },
    );

    if (upsertError) {
      return internalErrorResponse('submit-signature upsert', upsertError);
    }

    return jsonResponse({ submissionId });
  } catch (err) {
    return internalErrorResponse('submit-signature', err);
  }
});
