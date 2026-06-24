-- 040: sigv2 signature image retention phase 1
-- - closed session retention metadata
-- - image-only cleanup for closed sessions
-- - DB guard against close/submit races

ALTER TABLE sigv2_sessions
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS signature_retention_days INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS signature_cleanup_after TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS signature_images_deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS signature_images_deleted_reason TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sigv2_sessions_signature_retention_days_check'
  ) THEN
    ALTER TABLE sigv2_sessions
      ADD CONSTRAINT sigv2_sessions_signature_retention_days_check
      CHECK (signature_retention_days BETWEEN 1 AND 365);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sigv2_sessions_signature_images_deleted_reason_check'
  ) THEN
    ALTER TABLE sigv2_sessions
      ADD CONSTRAINT sigv2_sessions_signature_images_deleted_reason_check
      CHECK (
        signature_images_deleted_reason IS NULL
        OR signature_images_deleted_reason IN ('retention_expired', 'manual')
      );
  END IF;
END $$;

COMMENT ON COLUMN sigv2_sessions.closed_at IS
  'sigv2: 교사가 세션을 마감한 시각. NULL 이면 아직 서버 기준 마감되지 않음.';
COMMENT ON COLUMN sigv2_sessions.signature_retention_days IS
  'sigv2: 세션 마감 후 서명 이미지 보관 일수. 기본 30일, 1~365일.';
COMMENT ON COLUMN sigv2_sessions.signature_cleanup_after IS
  'sigv2: 서명 이미지 자동삭제 가능 시각. closed_at + signature_retention_days.';
COMMENT ON COLUMN sigv2_sessions.signature_images_deleted_at IS
  'sigv2: 서명 이미지가 storage 에서 삭제되고 entries 이미지 포인터가 정리된 시각.';
COMMENT ON COLUMN sigv2_sessions.signature_images_deleted_reason IS
  'sigv2: 서명 이미지 삭제 사유. retention_expired 또는 manual.';

CREATE INDEX IF NOT EXISTS idx_sigv2_sessions_signature_cleanup_due
  ON sigv2_sessions (signature_cleanup_after)
  WHERE status = 'closed'
    AND signature_cleanup_after IS NOT NULL
    AND signature_images_deleted_at IS NULL;

ALTER TABLE sigv2_entries
  ALTER COLUMN signature_object_key DROP NOT NULL,
  ALTER COLUMN signature_public_url DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS signature_image_deleted_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sigv2_entries_signature_image_fields_pair_check'
  ) THEN
    ALTER TABLE sigv2_entries
      ADD CONSTRAINT sigv2_entries_signature_image_fields_pair_check
      CHECK (
        (signature_object_key IS NOT NULL AND signature_public_url IS NOT NULL)
        OR (signature_object_key IS NULL AND signature_public_url IS NULL)
      );
  END IF;
END $$;

COMMENT ON COLUMN sigv2_entries.signature_image_deleted_at IS
  'sigv2: 서명 이미지만 삭제된 시각. 행은 서명 완료 현황 보존을 위해 유지된다.';

CREATE OR REPLACE FUNCTION sigv2_assert_entry_images_allowed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parent_status TEXT;
BEGIN
  -- 이미지 포인터를 새로 쓰는 경우에는 부모 세션을 잠가 close/submit race 를 직렬화한다.
  IF NEW.signature_object_key IS NOT NULL OR NEW.signature_public_url IS NOT NULL THEN
    SELECT status
      INTO parent_status
    FROM sigv2_sessions
    WHERE id = NEW.session_id
    FOR UPDATE;

    IF parent_status IS NULL THEN
      RAISE EXCEPTION 'sigv2 parent session not found'
        USING ERRCODE = '23503';
    END IF;

    IF parent_status <> 'active' THEN
      RAISE EXCEPTION 'sigv2 entries with signature images require active session'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sigv2_entries_images_allowed_guard ON sigv2_entries;
CREATE TRIGGER sigv2_entries_images_allowed_guard
  BEFORE INSERT OR UPDATE OF signature_object_key, signature_public_url
  ON sigv2_entries
  FOR EACH ROW
  EXECUTE FUNCTION sigv2_assert_entry_images_allowed();

COMMENT ON FUNCTION sigv2_assert_entry_images_allowed IS
  'sigv2: 서명 이미지 포인터가 있는 entry insert/update 는 active 세션에서만 허용하고 부모 row lock 으로 close/submit race 를 막는다.';

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION cleanup_sigv2_closed_signature_images()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  sess RECORD;
  cleared_total INTEGER := 0;
  cleared_for_session INTEGER := 0;
BEGIN
  FOR sess IN
    SELECT id
    FROM sigv2_sessions
    WHERE status = 'closed'
      AND signature_cleanup_after IS NOT NULL
      AND signature_cleanup_after <= now()
      AND signature_images_deleted_at IS NULL
  LOOP
    WITH candidate_entries AS (
      SELECT id, signature_object_key
      FROM sigv2_entries
      WHERE session_id = sess.id
        AND signature_object_key IS NOT NULL
        AND signature_public_url IS NOT NULL
        AND signature_object_key LIKE sess.id::text || '/%'
    ),
    deleted_objects AS (
      DELETE FROM storage.objects o
      USING candidate_entries c
      WHERE o.bucket_id = 'sigv2-signatures'
        AND o.name = c.signature_object_key
      RETURNING o.name
    ),
    cleared_entries AS (
      UPDATE sigv2_entries e
      SET
        signature_object_key = NULL,
        signature_public_url = NULL,
        signature_image_deleted_at = now()
      WHERE e.id IN (SELECT id FROM candidate_entries)
        AND NOT EXISTS (
          SELECT 1
          FROM storage.objects o
          WHERE o.bucket_id = 'sigv2-signatures'
            AND o.name = e.signature_object_key
        )
      RETURNING e.id
    )
    SELECT count(*) INTO cleared_for_session FROM cleared_entries;

    cleared_total := cleared_total + cleared_for_session;

    IF NOT EXISTS (
      SELECT 1
      FROM sigv2_entries
      WHERE session_id = sess.id
        AND signature_object_key IS NOT NULL
    ) THEN
      UPDATE sigv2_sessions
      SET
        signature_images_deleted_at = COALESCE(signature_images_deleted_at, now()),
        signature_images_deleted_reason = COALESCE(
          signature_images_deleted_reason,
          'retention_expired'
        )
      WHERE id = sess.id;
    END IF;
  END LOOP;

  RETURN cleared_total;
END;
$$;

COMMENT ON FUNCTION cleanup_sigv2_closed_signature_images IS
  'sigv2: 마감 후 보관기간이 지난 세션의 서명 이미지만 삭제하고 entries 행은 보존한다. active 세션은 절대 대상이 아니다.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'cleanup_sigv2_closed_signature_images_daily'
  ) THEN
    PERFORM cron.schedule(
      'cleanup_sigv2_closed_signature_images_daily',
      '45 18 * * *',
      $cmd$ SELECT cleanup_sigv2_closed_signature_images(); $cmd$
    );
  END IF;
EXCEPTION
  WHEN undefined_function THEN
    RAISE NOTICE 'pg_cron 이 활성화되지 않았습니다. Supabase 프로젝트 설정에서 pg_cron 을 확인하세요.';
  WHEN undefined_table THEN
    RAISE NOTICE 'cron.job 테이블 없음 - pg_cron 권한 확인 필요.';
END $$;
