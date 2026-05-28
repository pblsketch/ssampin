-- 034: 서명받기 Phase 2C — Storage lifecycle + retention (US-2C-16)
-- - signature-templates: 1년 auto-purge (양식 자체는 일회성 + 재업로드 비용 낮음)
-- - signature-previews: 결과 PDF 합성 완료된 요청은 즉시 정리 가능 (clean-up cron)
-- - signature-results: 요청당 최신 2 버전만 보존 (이전 버전 auto-delete)
-- - signature-images / signature_submissions / signature_compositions: 5년 retention (consent_ip_hash 의 법적 보관 기간)
-- - pg_cron 의존성: Supabase 의 무료 티어에서도 활성화되어 있는 extension. 활성화 실패 시 수동 cron / GitHub Actions 로 폴백 가능.

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ──────────────────────────────────────────────────────────────
-- 1) Helper view: 요청 (request_id) 별 최신 2 버전 외 모든 composition
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW signature_compositions_stale AS
SELECT request_id, version, storage_path, composed_at
FROM (
  SELECT
    request_id,
    version,
    storage_path,
    composed_at,
    ROW_NUMBER() OVER (PARTITION BY request_id ORDER BY version DESC) AS rn
  FROM signature_compositions
) ranked
WHERE rn > 2;

COMMENT ON VIEW signature_compositions_stale IS
  'Phase 2C US-2C-16: 요청당 최신 2 버전을 제외한 합성 PDF 메타. lifecycle worker 가 매일 처리.';

-- ──────────────────────────────────────────────────────────────
-- 2) Cleanup function: stale composition rows + storage objects
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION cleanup_signature_compositions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  removed integer := 0;
  rec RECORD;
BEGIN
  FOR rec IN SELECT request_id, version, storage_path FROM signature_compositions_stale LOOP
    -- storage_path 형식: 'signature-results/{requestId}/v{N}.pdf'
    DELETE FROM storage.objects
    WHERE bucket_id = 'signature-results'
      AND name = regexp_replace(rec.storage_path, '^signature-results/', '');
    DELETE FROM signature_compositions
    WHERE request_id = rec.request_id AND version = rec.version;
    removed := removed + 1;
  END LOOP;
  RETURN removed;
END;
$$;

COMMENT ON FUNCTION cleanup_signature_compositions IS
  'US-2C-16: 요청당 최신 2 버전 외 합성 PDF 를 제거 (DB row + storage object).';

-- ──────────────────────────────────────────────────────────────
-- 3) Cleanup function: signature-templates 1년 경과
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION cleanup_signature_templates_one_year()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  removed integer := 0;
BEGIN
  WITH purged AS (
    DELETE FROM storage.objects
    WHERE bucket_id = 'signature-templates'
      AND created_at < (NOW() - INTERVAL '1 year')
    RETURNING 1
  )
  SELECT COUNT(*) INTO removed FROM purged;
  RETURN removed;
END;
$$;

COMMENT ON FUNCTION cleanup_signature_templates_one_year IS
  'US-2C-16: 1년 경과 PDF 양식 원본 자동 삭제 (재업로드 비용 낮음).';

-- ──────────────────────────────────────────────────────────────
-- 4) Cleanup function: 5년 경과 signature_submissions + 관련 storage
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION cleanup_signature_submissions_five_year()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  removed integer := 0;
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT id, signature_image_path
    FROM signature_submissions
    WHERE submitted_at < (NOW() - INTERVAL '5 years')
  LOOP
    DELETE FROM storage.objects
    WHERE bucket_id = 'signature-images'
      AND name = rec.signature_image_path;
    DELETE FROM signature_submissions WHERE id = rec.id;
    removed := removed + 1;
  END LOOP;
  RETURN removed;
END;
$$;

COMMENT ON FUNCTION cleanup_signature_submissions_five_year IS
  'US-2C-16: 5년 경과 서명 제출 + 이미지 + consent_log 일괄 삭제 (consent_ip_hash 법적 보관 기간).';

-- ──────────────────────────────────────────────────────────────
-- 5) Cleanup function: signature-previews — 합성 1회 완료된 요청의 preview 즉시 정리 가능
--    (요청이 closed 상태이면서 최신 composition 이 존재하면 preview 는 더 이상 학생 hot-path 에서 필요 없음)
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION cleanup_signature_previews_after_close()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  removed integer := 0;
BEGIN
  WITH closed_with_result AS (
    SELECT r.id::text AS request_id
    FROM signature_requests r
    JOIN signature_compositions c ON c.request_id = r.id
    WHERE r.status = 'closed'
      AND r.updated_at < (NOW() - INTERVAL '7 days')
  ),
  purged AS (
    DELETE FROM storage.objects
    WHERE bucket_id = 'signature-previews'
      AND split_part(name, '/', 1) IN (SELECT request_id FROM closed_with_result)
    RETURNING 1
  )
  SELECT COUNT(*) INTO removed FROM purged;
  RETURN removed;
END;
$$;

COMMENT ON FUNCTION cleanup_signature_previews_after_close IS
  'US-2C-16: 마감되고 7일 경과 + 합성 결과 보유한 요청의 preview PNG 즉시 정리.';

-- ──────────────────────────────────────────────────────────────
-- 6) pg_cron schedules
--    실행 시각은 KST 03:00 ~ 03:30 사이로 분산 (Supabase 부하 분산).
-- ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- 매일 03:00 KST (=18:00 UTC) — 합성 PDF 최신 2 버전 외 정리
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup_signature_compositions_daily') THEN
    PERFORM cron.schedule(
      'cleanup_signature_compositions_daily',
      '0 18 * * *',
      $cmd$ SELECT cleanup_signature_compositions(); $cmd$
    );
  END IF;

  -- 매일 03:10 KST — preview PNG 정리 (마감 + 7일 경과)
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup_signature_previews_daily') THEN
    PERFORM cron.schedule(
      'cleanup_signature_previews_daily',
      '10 18 * * *',
      $cmd$ SELECT cleanup_signature_previews_after_close(); $cmd$
    );
  END IF;

  -- 매주 일요일 03:20 KST — 1년 경과 템플릿 정리 (대량 → 주간)
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup_signature_templates_weekly') THEN
    PERFORM cron.schedule(
      'cleanup_signature_templates_weekly',
      '20 18 * * 0',
      $cmd$ SELECT cleanup_signature_templates_one_year(); $cmd$
    );
  END IF;

  -- 매월 1일 03:30 KST — 5년 경과 제출 + 이미지 정리 (희소 → 월간)
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup_signature_submissions_monthly') THEN
    PERFORM cron.schedule(
      'cleanup_signature_submissions_monthly',
      '30 18 1 * *',
      $cmd$ SELECT cleanup_signature_submissions_five_year(); $cmd$
    );
  END IF;
EXCEPTION
  WHEN undefined_function THEN
    RAISE NOTICE 'pg_cron 이 활성화되지 않았습니다 — Supabase 프로젝트 설정에서 활성화 후 본 마이그레이션 재실행 또는 외부 cron 으로 폴백하세요.';
  WHEN undefined_table THEN
    RAISE NOTICE 'cron.job 테이블 없음 — pg_cron 권한 확인 필요.';
END $$;

-- ──────────────────────────────────────────────────────────────
-- 7) 운영 모니터링 view: cron job 최근 실패율
-- ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'job_run_details' AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'cron')) THEN
    EXECUTE $view$
      CREATE OR REPLACE VIEW signature_lifecycle_health AS
      SELECT
        jobname,
        COUNT(*) FILTER (WHERE status = 'failed') AS failures_last_30d,
        COUNT(*) AS runs_last_30d,
        ROUND(
          100.0 * COUNT(*) FILTER (WHERE status = 'failed') / NULLIF(COUNT(*), 0),
          2
        ) AS failure_rate_pct
      FROM cron.job_run_details
      WHERE jobname LIKE 'cleanup_signature%'
        AND start_time > NOW() - INTERVAL '30 days'
      GROUP BY jobname
    $view$;
    COMMENT ON VIEW signature_lifecycle_health IS
      'US-2C-16: 서명받기 lifecycle pg_cron 작업의 최근 30일 실패율 모니터링.';
  END IF;
END $$;
