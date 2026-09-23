-- 077: 서버가 맡은 선생님 구글 토큰 보관 기한 — 6개월 넘게 쓰이지 않으면 지운다 (ADR-136 D4)
--
-- 서버가 선생님 토큰을 맡는 표는 둘이다.
--   teacher_tokens          과제 수합 — 학생 파일을 선생님 드라이브에 올릴 때
--   staffroom_admin_tokens  온라인 교무실 — 부서 자료실(관리자 드라이브)을 열 때
--
-- "쓰인다"의 기준은 updated_at 이다. 앱이 토큰을 다시 올릴 때(과제 수합·교무실 화면을 열 때)와
-- 서버가 토큰을 갱신할 때(학생 제출·자료실 사용) 모두 updated_at 을 새로 적는다. 그래서 6개월 넘게
-- 그대로라는 것은 선생님도 학생도 부서원도 그 기능을 쓰지 않았다는 뜻이다.
--
-- 지운 뒤 다시 쓰려면: 선생님이 과제 수합·교무실 화면을 열면 앱이 토큰을 다시 올린다
-- (useAssignmentStore.pushTeacherToken · useStaffRoomStore.pushAdminToken).
--
-- 연결 해제 때 지우는 것은 delete-google-tokens 함수, 구글에서 폐기된 토큰을 바로 지우는 것은
-- submit-assignment · _shared/staffroomDrive.ts 가 맡는다. 이 작업은 그 둘이 못 잡은 것의 마지막 그물이다.

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION cleanup_stale_google_tokens()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  removed_teacher integer := 0;
  removed_staffroom integer := 0;
BEGIN
  WITH purged AS (
    DELETE FROM teacher_tokens
    WHERE updated_at IS NULL OR updated_at < (now() - INTERVAL '6 months')
    RETURNING 1
  )
  SELECT count(*) INTO removed_teacher FROM purged;

  WITH purged AS (
    DELETE FROM staffroom_admin_tokens
    WHERE updated_at < (now() - INTERVAL '6 months')
    RETURNING 1
  )
  SELECT count(*) INTO removed_staffroom FROM purged;

  RETURN removed_teacher + removed_staffroom;
END;
$$;

COMMENT ON FUNCTION cleanup_stale_google_tokens IS
  'ADR-136 D4: 6개월 넘게 쓰이지 않은(updated_at 기준) 선생님 구글 토큰 사본을 지운다. 과제 수합·온라인 교무실.';

-- 공개 요청(PostgREST RPC)으로 부를 수 없게 한다 — 예약 작업만 부른다.
REVOKE ALL ON FUNCTION cleanup_stale_google_tokens() FROM PUBLIC;
REVOKE ALL ON FUNCTION cleanup_stale_google_tokens() FROM anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'cleanup_stale_google_tokens_daily'
  ) THEN
    PERFORM cron.schedule(
      'cleanup_stale_google_tokens_daily',
      '55 18 * * *',
      $cmd$ SELECT cleanup_stale_google_tokens(); $cmd$
    );
  END IF;
EXCEPTION
  WHEN undefined_function THEN
    RAISE NOTICE 'pg_cron 이 활성화되지 않았습니다. Supabase 프로젝트 설정에서 pg_cron 을 확인하세요.';
  WHEN undefined_table THEN
    RAISE NOTICE 'cron.job 테이블 없음 - pg_cron 권한 확인 필요.';
END $$;
