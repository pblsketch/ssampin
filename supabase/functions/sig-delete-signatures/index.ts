/**
 * sig-delete-signatures — 교사용 서명 이미지 전용 삭제
 *
 * 요청: POST { sessionId, adminKey }
 * 응답: { ok, status, removedStorageObjects, signatureImagesDeletedAt }
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  corsHeaders,
  jsonResponse,
  errorResponse,
  internalErrorResponse,
} from '../_shared/cors.ts';
import { timingSafeEqual } from '../_shared/hash.ts';
import { checkRateLimit, clientIpFrom } from '../_shared/rateLimit.ts';
import { canDeleteSignatureImages, planSignatureImageDeletion } from '../_shared/sigRetention.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ADMIN_KEY_PATTERN = /^[0-9a-f]{64}$/i;

interface SigDeleteSessionRow {
  id: string;
  admin_key: string;
  status: 'draft' | 'active' | 'closed';
  signature_images_deleted_at: string | null;
}

interface SigDeleteEntryRow {
  id: string;
  signature_object_key: string | null;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return errorResponse('요청 본문이 올바른 JSON이 아닙니다', 400);
    }

    const { sessionId, adminKey } = body as {
      sessionId?: unknown;
      adminKey?: unknown;
    };

    if (!sessionId || typeof sessionId !== 'string' || !UUID_PATTERN.test(sessionId)) {
      return errorResponse('sessionId 형식이 올바르지 않습니다', 400);
    }
    if (!adminKey || typeof adminKey !== 'string' || !ADMIN_KEY_PATTERN.test(adminKey)) {
      return errorResponse('adminKey 형식이 올바르지 않습니다', 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const clientIP = clientIpFrom(req);
    const isLimited = await checkRateLimit(supabase, 'sig-delete-signatures', [
      { identifier: clientIP, windowMs: 60_000, max: 10 },
    ]);
    if (isLimited) {
      return errorResponse('잠시 후 다시 시도해 주세요. 요청이 너무 많습니다.', 429);
    }

    const { data: session, error: sessionError } = await supabase
      .from('sigv2_sessions')
      .select('id, admin_key, status, signature_images_deleted_at')
      .eq('id', sessionId)
      .single<SigDeleteSessionRow>();

    if (sessionError || !session) {
      return errorResponse('세션을 찾을 수 없습니다', 404);
    }

    if (!timingSafeEqual(adminKey, session.admin_key)) {
      return errorResponse('관리 키가 올바르지 않습니다', 403);
    }

    if (!canDeleteSignatureImages(session.status)) {
      return errorResponse('세션을 마감한 뒤에만 서명 이미지를 삭제할 수 있습니다', 409);
    }

    const { data: entries, error: entriesError } = await supabase
      .from('sigv2_entries')
      .select('id, signature_object_key')
      .eq('session_id', sessionId)
      .not('signature_object_key', 'is', null)
      .returns<SigDeleteEntryRow[]>();

    if (entriesError) {
      return internalErrorResponse(
        'sig-delete-signatures',
        entriesError,
        '서명 이미지 목록을 확인하지 못했습니다',
      );
    }

    const deletionPlan = planSignatureImageDeletion(sessionId, entries ?? []);
    if (deletionPlan.skippedKeys.length > 0) {
      return errorResponse('서명 이미지 경로가 세션과 일치하지 않아 삭제를 중단했습니다', 409);
    }

    if (deletionPlan.keys.length > 0) {
      const { error: removeError } = await supabase.storage
        .from('sigv2-signatures')
        .remove(deletionPlan.keys);

      if (removeError) {
        return internalErrorResponse(
          'sig-delete-signatures',
          removeError,
          '서명 이미지 삭제 중 오류가 발생했습니다',
        );
      }
    }

    const deletedAt = new Date().toISOString();

    if (deletionPlan.entryIds.length > 0) {
      const { error: updateEntriesError } = await supabase
        .from('sigv2_entries')
        .update({
          signature_object_key: null,
          signature_public_url: null,
          signature_image_deleted_at: deletedAt,
        })
        .in('id', deletionPlan.entryIds);

      if (updateEntriesError) {
        return internalErrorResponse(
          'sig-delete-signatures',
          updateEntriesError,
          '서명 이미지 삭제 기록을 저장하지 못했습니다',
        );
      }
    }

    const { data: updatedSession, error: updateSessionError } = await supabase
      .from('sigv2_sessions')
      .update({
        signature_images_deleted_at: session.signature_images_deleted_at ?? deletedAt,
        signature_images_deleted_reason: 'manual',
      })
      .eq('id', sessionId)
      .select('status, signature_images_deleted_at')
      .single<{ status: string; signature_images_deleted_at: string | null }>();

    if (updateSessionError || !updatedSession) {
      return internalErrorResponse(
        'sig-delete-signatures',
        updateSessionError,
        '서명 이미지 삭제 상태를 저장하지 못했습니다',
      );
    }

    return jsonResponse({
      ok: true,
      status: updatedSession.status,
      removedStorageObjects: deletionPlan.keys.length,
      signatureImagesDeletedAt: updatedSession.signature_images_deleted_at ?? deletedAt,
    });
  } catch (err) {
    return internalErrorResponse('sig-delete-signatures', err);
  }
});
