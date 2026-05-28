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

interface ConsentLogEntry {
  readonly id?: string;
  readonly label?: string;
  readonly checked?: boolean;
  readonly at?: string;
}

interface SubmitSignatureBody {
  readonly requestId?: string;
  readonly participantId?: string;
  readonly token?: string;
  readonly pin?: string;
  readonly signatureKind?: string;
  readonly signerName?: string;
  readonly signatureImageDataUrl?: string;
  /** Phase 2C US-2C-11: 4행 동의 표 결과. 모두 checked=true 여야 제출 허용. */
  readonly consentLog?: readonly ConsentLogEntry[];
}

const REQUIRED_CONSENT_IDS = new Set([
  'legal_effect_disclaimer',
  'hash_storage',
  'result_pdf_share',
  'retention_period',
]);

function validateConsentLog(log: readonly ConsentLogEntry[] | undefined): string | null {
  if (!log || !Array.isArray(log)) return '동의 항목 4개 모두 체크 후 제출해 주세요.';
  if (log.length < 4) return '동의 항목 4개 모두 체크 후 제출해 주세요.';
  const seenIds = new Set<string>();
  for (const entry of log) {
    if (!entry || typeof entry.id !== 'string' || !REQUIRED_CONSENT_IDS.has(entry.id)) {
      return '동의 항목 형식이 잘못되었습니다.';
    }
    if (entry.checked !== true) return '동의 항목 4개 모두 체크 후 제출해 주세요.';
    if (typeof entry.label !== 'string' || entry.label.length === 0) {
      return '동의 항목 레이블 누락.';
    }
    if (typeof entry.at !== 'string' || entry.at.length === 0) {
      return '동의 시각 정보 누락.';
    }
    seenIds.add(entry.id);
  }
  if (seenIds.size !== 4) return '필수 동의 항목이 모두 포함되지 않았습니다.';
  return null;
}

import { sha256Hex } from '../_shared/hash.ts';

function parseSignatureDataUrl(dataUrl: string): { mimeType: string; bytes: Uint8Array } | null {
  // UltraQA Q2: WebP 는 pdf-lib (compose-signed-pdf) 가 embed 못함 → 결과 PDF 에서 빈 박스로
  // 나타나는 silent 결함 발생. submit 단계에서 PNG 만 허용해 깊이 방어.
  const match = dataUrl.match(/^data:(image\/png);base64,([A-Za-z0-9+/=]+)$/);
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
      consentLog,
    } = body;

    if (!requestId || !signatureKind || !signerName || !signatureImageDataUrl) {
      return errorResponse('필수 필드가 누락되었습니다.', 400);
    }

    // Phase 2C US-2C-11: 4행 동의 표 검증 (raw IP 저장 X — 해시만)
    const consentError = validateConsentLog(consentLog);
    if (consentError) {
      return errorResponse(consentError, 400);
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
      // 호환: 기존 DB token hash 는 pepper 미적용 — auto pepper 가 일치 안 됨.
      participantQuery = participantQuery.eq(
        'unique_link_token_hash',
        await sha256Hex(token, 'no-pepper'),
      );
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
      // 호환: 기존 DB PIN hash 는 pepper 미적용.
      const pinHash = await sha256Hex(pin, 'no-pepper');
      if (pinHash !== participant.pin_hash) {
        return errorResponse('PIN이 일치하지 않습니다.', 403);
      }
    }

    const submissionId = crypto.randomUUID();
    // UltraQA Q2: parseSignatureDataUrl 이 PNG only 만 통과시키므로 확장자 분기 dead — 'png' 고정.
    const storagePath = `${requestId}/${participant.id}/${signatureKind}-${submissionId}.png`;
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
    // Phase 2C US-2C-11: consent_ip_hash 는 동의 시점 IP SHA-256. raw IP 비저장 — 제1 원칙.
    const consentIpHash = await sha256Hex(clientIP);
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
        consent_log: consentLog,
        consent_ip_hash: consentIpHash,
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
