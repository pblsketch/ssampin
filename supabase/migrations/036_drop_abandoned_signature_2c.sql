-- ============================================================
-- 036: 폐기된 "서명받기 Phase 2C" (PDF 오버레이) 백엔드 해체
--
-- 폐기 사유: 커밋 f954edf로 Phase 2C 제거, 신규 035 sigv2_ 스키마로 대체
--
-- 해체 범위 (029 ~ 034 에서 생성된 객체):
--   - pg_cron job 4개           (034)
--   - cleanup 함수 4개          (034)
--   - 모니터링 view 2개         (034)
--   - 테이블 4개                (029, 033)
--   - storage 정책 5개          (029, 030, 031, 033)
--   - storage 객체 + 버킷 4개   (029, 030, 031, 033)
--
-- 주의: sigv2_* 객체는 일절 건드리지 않는다.
-- 전 구문 멱등 (IF EXISTS / EXCEPTION 가드).
-- ============================================================


-- ──────────────────────────────────────────────────────────────
-- STEP 1: pg_cron job 4개 unschedule
--   cron extension 또는 job 미존재 시 NOTICE 출력 후 계속 진행.
-- ──────────────────────────────────────────────────────────────

DO $$
BEGIN
  PERFORM cron.unschedule('cleanup_signature_compositions_daily');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'cron job cleanup_signature_compositions_daily unschedule 건너뜀: %', SQLERRM;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('cleanup_signature_previews_daily');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'cron job cleanup_signature_previews_daily unschedule 건너뜀: %', SQLERRM;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('cleanup_signature_templates_weekly');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'cron job cleanup_signature_templates_weekly unschedule 건너뜀: %', SQLERRM;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('cleanup_signature_submissions_monthly');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'cron job cleanup_signature_submissions_monthly unschedule 건너뜀: %', SQLERRM;
END $$;


-- ──────────────────────────────────────────────────────────────
-- STEP 2: cleanup 함수 4개 DROP
-- ──────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS cleanup_signature_compositions();
DROP FUNCTION IF EXISTS cleanup_signature_templates_one_year();
DROP FUNCTION IF EXISTS cleanup_signature_submissions_five_year();
DROP FUNCTION IF EXISTS cleanup_signature_previews_after_close();


-- ──────────────────────────────────────────────────────────────
-- STEP 3: 모니터링 view 2개 DROP
-- ──────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS signature_compositions_stale;
DROP VIEW IF EXISTS signature_lifecycle_health;


-- ──────────────────────────────────────────────────────────────
-- STEP 4: 테이블 4개 DROP (FK 의존 순서: 자식 → 부모)
--   signature_compositions  → signature_requests (FK)
--   signature_submissions   → signature_requests, signature_participants (FK)
--   signature_participants  → signature_requests (FK)
--   signature_requests      (루트)
--   CASCADE 로 잔여 FK 참조까지 정리.
-- ──────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS signature_compositions  CASCADE;
DROP TABLE IF EXISTS signature_submissions   CASCADE;
DROP TABLE IF EXISTS signature_participants  CASCADE;
DROP TABLE IF EXISTS signature_requests      CASCADE;


-- ──────────────────────────────────────────────────────────────
-- STEP 5: storage 정책 DROP (5개)
--   정책은 테이블 DROP 전에 지워도 되지만, 테이블이 이미 삭제된 후에도
--   storage.objects 위의 정책은 독립적으로 존재할 수 있으므로 여기서 명시 제거.
-- ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "signature_images_service_all"    ON storage.objects;
DROP POLICY IF EXISTS "signature_templates_service_all" ON storage.objects;
DROP POLICY IF EXISTS "signature_previews_service_all"  ON storage.objects;
DROP POLICY IF EXISTS "signature_previews_public_read"  ON storage.objects;
DROP POLICY IF EXISTS "signature_results_service_all"   ON storage.objects;


-- ──────────────────────────────────────────────────────────────
-- STEP 6: storage 버킷 4개 제거
--   순서: objects(파일) 먼저 삭제 → buckets 행 삭제
--   objects 가 남아 있으면 buckets 삭제 실패하므로 반드시 선행.
--   버킷 미존재 시 DELETE 는 0 rows 로 안전하게 통과.
-- ──────────────────────────────────────────────────────────────

-- signature-images
DELETE FROM storage.objects WHERE bucket_id = 'signature-images';
DELETE FROM storage.buckets  WHERE id       = 'signature-images';

-- signature-templates
DELETE FROM storage.objects WHERE bucket_id = 'signature-templates';
DELETE FROM storage.buckets  WHERE id       = 'signature-templates';

-- signature-previews
DELETE FROM storage.objects WHERE bucket_id = 'signature-previews';
DELETE FROM storage.buckets  WHERE id       = 'signature-previews';

-- signature-results
DELETE FROM storage.objects WHERE bucket_id = 'signature-results';
DELETE FROM storage.buckets  WHERE id       = 'signature-results';
