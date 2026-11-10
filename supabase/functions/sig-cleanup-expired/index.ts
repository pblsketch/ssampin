/**
 * sig-cleanup-expired — 보관기간이 지난 마감 세션의 서명 이미지를 매일 지운다 (081)
 *
 * 호출자: pg_cron 작업 `cleanup_sigv2_closed_signature_images_daily` 가 pg_net 으로 부른다.
 * 인증: 헤더 `x-sig-cleanup-secret` 이 시크릿 `SIG_CLEANUP_SECRET` 과 같아야 한다
 *       (같은 값이 DB Vault 의 `sig_cleanup_secret` 에 있다). 시크릿이 없으면 무조건 거부한다.
 * 응답: { ok, dueSessions, completedSessions, removedObjects, skippedKeys, failedSessions }
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { errorResponse, internalErrorResponse, jsonResponse } from '../_shared/cors.ts';
import { timingSafeEqual } from '../_shared/hash.ts';
import type { SigV2SignatureEntryPointer } from '../_shared/sigRetention.ts';
import {
  runSigRetentionCleanup,
  type SigRetentionCleanupStore,
} from '../_shared/sigRetentionCleanup.ts';

const BUCKET = 'sigv2-signatures';

function supabaseStore(supabase: SupabaseClient): SigRetentionCleanupStore {
  return {
    async listDueSessionIds(nowIso, limit) {
      const { data, error } = await supabase
        .from('sigv2_sessions')
        .select('id')
        .eq('status', 'closed')
        .not('signature_cleanup_after', 'is', null)
        .lte('signature_cleanup_after', nowIso)
        .is('signature_images_deleted_at', null)
        .order('signature_cleanup_after', { ascending: true })
        .limit(limit)
        .returns<{ id: string }[]>();
      if (error) throw error;
      return (data ?? []).map((row) => row.id);
    },
    async isSessionStillDue(sessionId, nowIso) {
      const { data, error } = await supabase
        .from('sigv2_sessions')
        .select('id')
        .eq('id', sessionId)
        .eq('status', 'closed')
        .lte('signature_cleanup_after', nowIso)
        .is('signature_images_deleted_at', null)
        .maybeSingle<{ id: string }>();
      if (error) throw error;
      return data !== null;
    },
    async listImageEntries(sessionId) {
      const { data, error } = await supabase
        .from('sigv2_entries')
        .select('id, signature_object_key')
        .eq('session_id', sessionId)
        .not('signature_object_key', 'is', null)
        .returns<SigV2SignatureEntryPointer[]>();
      if (error) throw error;
      return data ?? [];
    },
    async removeObjects(keys) {
      const { error } = await supabase.storage.from(BUCKET).remove(keys);
      if (error) throw error;
    },
    async clearEntryImages(entryIds, deletedAtIso) {
      const { error } = await supabase
        .from('sigv2_entries')
        .update({
          signature_object_key: null,
          signature_public_url: null,
          signature_image_deleted_at: deletedAtIso,
        })
        .in('id', entryIds);
      if (error) throw error;
    },
    async markSessionImagesDeleted(sessionId, deletedAtIso) {
      const { error } = await supabase
        .from('sigv2_sessions')
        .update({
          signature_images_deleted_at: deletedAtIso,
          signature_images_deleted_reason: 'retention_expired',
        })
        .eq('id', sessionId)
        .is('signature_images_deleted_at', null);
      if (error) throw error;
    },
  };
}

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return errorResponse('POST 만 허용합니다', 405);
  }

  const expected = Deno.env.get('SIG_CLEANUP_SECRET') ?? '';
  const given = req.headers.get('x-sig-cleanup-secret') ?? '';
  if (expected.length < 32 || !timingSafeEqual(given, expected)) {
    return errorResponse('권한이 없습니다', 401);
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const result = await runSigRetentionCleanup(supabaseStore(supabase), new Date(), (id, err) => {
      console.error('[sig-cleanup-expired] session failed', id, err);
    });
    console.log('[sig-cleanup-expired]', JSON.stringify(result));
    return jsonResponse({ ok: result.failedSessions === 0, ...result });
  } catch (err) {
    return internalErrorResponse('sig-cleanup-expired', err);
  }
});
