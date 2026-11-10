-- 081: 서명 이미지 보관기간 자동 삭제를 Storage API 경로로 옮긴다
--
-- 왜: 040 의 cleanup_sigv2_closed_signature_images() 는 `DELETE FROM storage.objects` 로 지웠다.
--   Supabase 가 storage 표 직접 삭제를 막아(storage.protect_delete, 42501) 첫 만료분이 생긴
--   2026-07-24 부터 매일 실패했고, 함수 전체가 되돌려져 보관기간이 지난 서명 이미지가 그대로 남았다.
--   막히기 전이었어도 표의 행만 지울 뿐 실제 파일은 저장소에 남는 방식이었다.
-- 무엇을: 실제 삭제는 Edge Function `sig-cleanup-expired` 가 Storage API 로 한다.
--   크론은 같은 이름·같은 시각(매일 18:45 UTC = 03:45 KST)으로 그 함수를 pg_net 으로 부르기만 한다.
--
-- ★ 적용 전 준비 (비밀값은 이 파일에 두지 않는다):
--   1) Edge Function 시크릿 SIG_CLEANUP_SECRET = <무작위 64자 hex>
--   2) select vault.create_secret('<같은 값>', 'sig_cleanup_secret');
--      select vault.create_secret('https://<ref>.supabase.co', 'project_url');
--   3) sig-cleanup-expired 배포 (verify_jwt = false — 관문은 함수 안의 시크릿 비교)
--   준비가 빠지면 요청 함수가 NOTICE 만 남기고 아무것도 보내지 않는다.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'cleanup_sigv2_closed_signature_images_daily'
  ) THEN
    PERFORM cron.unschedule('cleanup_sigv2_closed_signature_images_daily');
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.cleanup_sigv2_closed_signature_images();

CREATE OR REPLACE FUNCTION public.sig_request_retention_cleanup()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  base_url TEXT;
  secret TEXT;
BEGIN
  SELECT decrypted_secret INTO base_url
  FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO secret
  FROM vault.decrypted_secrets WHERE name = 'sig_cleanup_secret';

  IF base_url IS NULL OR secret IS NULL THEN
    RAISE NOTICE 'sig_request_retention_cleanup: vault 의 project_url 또는 sig_cleanup_secret 이 없습니다';
    RETURN NULL;
  END IF;

  RETURN net.http_post(
    url := rtrim(base_url, '/') || '/functions/v1/sig-cleanup-expired',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sig-cleanup-secret', secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
END;
$$;

COMMENT ON FUNCTION public.sig_request_retention_cleanup IS
  'sigv2: 보관기간 만료 서명 이미지 정리를 Edge Function sig-cleanup-expired 에 요청한다(pg_net 요청 id 반환). 크론 전용.';

-- public 스키마 함수는 PostgREST RPC 로 노출되므로 크론(postgres) 외에는 못 부르게 한다.
REVOKE ALL ON FUNCTION public.sig_request_retention_cleanup() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sig_request_retention_cleanup() FROM anon, authenticated;

SELECT cron.schedule(
  'cleanup_sigv2_closed_signature_images_daily',
  '45 18 * * *',
  $cmd$ SELECT public.sig_request_retention_cleanup(); $cmd$
);
