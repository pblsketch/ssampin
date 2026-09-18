-- 076: Analytics 롤업 갱신 복구 + 관리자 "지금 갱신" (2026-09-18)
--
-- 증상: 관리자 대시보드의 "집계 기준"이 2026-09-15 21:05(UTC) 뒤로 멈췄다.
-- 원인(운영 cron.job_run_details 실측): pg_cron 잡은 매시 돌았지만 9/15 부터 전부
--   "canceling statement due to statement timeout" 으로 실패했다. 원본(app_analytics)이 늘어
--   REFRESH 9종이 151초(2026-09-18 실측)까지 길어졌고, 세션 기본 statement_timeout 2분을 넘겼다.
--
-- 함수에 SET statement_timeout 을 거는 것으로는 안 된다(운영에서 한 번 실패로 확인):
--   PostgreSQL 은 statement_timeout 을 "클라이언트가 보낸 문장" 단위로 잰다. 함수의 SET 절은
--   이미 시작된 호출 문장(SELECT analytics_refresh_rollups())의 타이머를 바꾸지 못한다.
--   그래서 부르는 쪽이 **앞 문장에서** SET 한 뒤 부른다. 여러 문장을 한 번에 보내면
--   문장마다 타이머가 따로 돌므로 "SET ...; SELECT ...;" 한 줄이면 된다(151초 성공으로 확인).
--
-- last_error 가 계속 비어 있던 이유:
--   061 의 EXCEPTION WHEN OTHERS 는 시간 초과(query_canceled)를 잡지 못한다(PL/pgSQL 규칙).
--   잡더라도 RAISE 로 다시 던지면 기록 UPDATE 까지 함께 되돌려진다.
--
-- 처치:
--   1) analytics_refresh_rollups(): 시간 초과까지 잡아 last_error 를 남기고 다시 던지지 않는다
--      (그래야 기록이 남는다). 그래서 cron.job_run_details 는 실패도 succeeded 로 보인다 —
--      실패 확인은 analytics_rollup_meta.last_error 로 한다.
--      정기 갱신과 수동 갱신이 겹치면 뒤에 온 쪽은 advisory lock 을 못 잡고 그냥 빠진다.
--   2) pg_cron 잡: 주기는 오너 결정(2026-09-09) 그대로 '5 1-21 * * *'(UTC) — KST 07~09시
--      출근 피크를 건너뛴다(9/8 DB 먹통 재발 방지). 명령만 SET 을 앞에 붙인 형태로 바꾼다.
--   3) analytics_request_refresh(): 관리자 화면 "지금 갱신" 버튼용. 갱신을 직접 돌리지 않고
--      다음 1분에 한 번 도는 pg_cron 잡을 예약하고 곧바로 돌아온다. 갱신이 2~3분 걸려
--      HTTP 요청(REST·Vercel 함수)으로는 끝까지 기다릴 수 없기 때문이다.
--      예약 식을 "월·일·시·분"까지 박아 두므로, 자기 해제가 어떤 이유로 실패해도
--      1년에 한 번보다 자주 돌 수 없다(반복 갱신으로 DB 를 짓누르는 사고를 구조로 막는다).
--      ※ 이 잡은 스스로를 지우므로 cron.job_run_details 에는 성공해도 "failed / job canceled" 로
--        남는다. 자기 해제가 갱신과 한 트랜잭션이라 커밋 뒤에야 pg_cron 이 잡이 사라진 걸 보고
--        연결을 끊기 때문이다(2026-09-18 운영 실측: 커밋 04:28:25.29 → 취소 기록 04:28:25.54,
--        데이터는 반영됨). 성공 여부는 analytics_rollup_meta 로 본다.
--
-- 갱신 소요 추이(운영): 55초(2026-08) → 118초(09-15) → 151초(09-18 03:50) → 325초(09-18 04:23).
--   10분 한도에 다가가면 이 마이그레이션으로는 못 버틴다 — 컴퓨트 승격이나 증분 롤업을 검토할 것.
--   4) 1차 작업 중 만들었다가 쓰지 않게 된 analytics_force_refresh() 를 지운다.

-- ── 1) 갱신 함수 ──
CREATE OR REPLACE FUNCTION analytics_refresh_rollups()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t0 timestamptz := clock_timestamp();
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('analytics_refresh_rollups')) THEN
    RAISE NOTICE 'analytics_refresh_rollups: 다른 갱신이 진행 중이라 건너뜀';
    RETURN;
  END IF;

  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics_rollup_device_day;
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics_rollup_event_day;
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics_rollup_prop_day;
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics_rollup_device_prop;
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics_rollup_hour_day;
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics_rollup_device_profile;
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics_rollup_error_day;
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics_rollup_device_event;
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics_rollup_session_day;

    UPDATE analytics_rollup_meta
       SET refreshed_at = now(),
           duration_ms  = (EXTRACT(EPOCH FROM (clock_timestamp() - t0)) * 1000)::integer,
           last_error   = NULL
     WHERE id = 1;
  EXCEPTION WHEN OTHERS OR query_canceled THEN
    UPDATE analytics_rollup_meta SET last_error = SQLERRM WHERE id = 1;
    RAISE WARNING 'analytics_refresh_rollups 실패: %', SQLERRM;
  END;
END $$;

COMMENT ON FUNCTION analytics_refresh_rollups() IS
  '롤업 9종을 동시 갱신한다. 부르는 쪽이 앞 문장에서 statement_timeout 을 늘려야 한다(기본 2분에 끊긴다). 실패는 다시 던지지 않고 analytics_rollup_meta.last_error 에만 남긴다.';

-- ── 2) 정기 갱신: 주기는 그대로, 명령만 교체 ──
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'analytics_refresh_rollups') THEN
      PERFORM cron.unschedule('analytics_refresh_rollups');
    END IF;
    PERFORM cron.schedule(
      'analytics_refresh_rollups',
      '5 1-21 * * *',
      $cmd$SET statement_timeout = '10min'; SELECT analytics_refresh_rollups();$cmd$
    );
  ELSE
    RAISE NOTICE 'pg_cron 미활성 — analytics_refresh_rollups() 를 외부 스케줄러로 매시 호출하세요.';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron 등록 실패(%): 외부 스케줄러로 폴백하세요.', SQLERRM;
END $$;

-- ── 3) 관리자 수동 갱신 예약 ──
-- 반환값: 'queued'(예약함) | 'running'(이미 도는 중이라 예약 안 함)
CREATE OR REPLACE FUNCTION analytics_request_refresh()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  run_at timestamp;
BEGIN
  -- 이번 요청 뒤의 결과만 보이게 지난 실패 기록을 비운다. 화면은 이 값이 다시 차면 실패로 본다.
  UPDATE analytics_rollup_meta SET last_error = NULL WHERE id = 1;

  IF EXISTS (
    SELECT 1 FROM cron.job_run_details
     WHERE status IN ('starting', 'running')
       AND command LIKE '%analytics_refresh_rollups()%'
       AND start_time > now() - interval '15 minutes'
  ) THEN
    RETURN 'running';
  END IF;

  -- 아직 안 돈 예약이 있으면 지우고 새로 잡는다 — 여러 번 눌러도 한 번만 돈다.
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'analytics_refresh_manual';

  -- pg_cron 은 cron.timezone 기준으로 식을 읽는다. 50초 이후면 한 분 더 미뤄 놓치지 않게 한다.
  run_at := date_trunc('minute', now() AT TIME ZONE COALESCE(current_setting('cron.timezone', true), 'GMT'))
            + CASE WHEN EXTRACT(SECOND FROM now()) >= 50 THEN interval '2 minutes' ELSE interval '1 minute' END;

  PERFORM cron.schedule(
    'analytics_refresh_manual',
    format('%s %s %s %s *',
           EXTRACT(MINUTE FROM run_at)::int, EXTRACT(HOUR FROM run_at)::int,
           EXTRACT(DAY FROM run_at)::int, EXTRACT(MONTH FROM run_at)::int),
    $cmd$SELECT cron.unschedule('analytics_refresh_manual'); SET statement_timeout = '10min'; SELECT analytics_refresh_rollups();$cmd$
  );
  RETURN 'queued';
END $$;

COMMENT ON FUNCTION analytics_request_refresh() IS
  '관리자 "지금 갱신" 버튼용. 다음 1분에 한 번 도는 pg_cron 잡을 예약하고 곧바로 돌아온다. 결과는 analytics_rollup_status 로 확인.';

REVOKE ALL ON FUNCTION analytics_request_refresh() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION analytics_request_refresh() TO service_role;

-- ── 4) 1차 작업 잔재 정리 ──
DROP FUNCTION IF EXISTS analytics_force_refresh();
