-- 078: Analytics 롤업 증분 갱신 (2026-09-30)
--
-- 증상: Supabase 가 "Disk IO Budget 이 바닥난다"는 경고 메일을 5번 보냈다(마지막 2026-09-30).
--   컴퓨트는 Nano(메모리 0.5GB, 디스크 기준 5MB/s·250 IOPS)다.
--
-- 원인(운영 실측, 2026-09-08 재시작 뒤 22일 누적):
--   analytics_refresh_rollups() 가 매시 구체화 뷰 9종을 원본(app_analytics 92만 행) 전체로 다시 만들었다.
--   - pg_stat_statements 기준 DB 가 디스크에서 읽은 블록의 약 60% 가 이 함수 한 줄이다.
--   - 정렬·중복 제거가 work_mem(4MB)을 넘쳐 임시 파일로 흘렀다: 22일간 temp 170GB(하루 약 7.7GB).
--   - 한 번에 130~280초. 2026-09-30 13:05 KST 회차는 "job startup timeout" 으로 시작조차 못 했다.
--   ※ 디스크 예산을 깎는 것은 이것만이 아니다. 메모리가 모자라 스왑·페이지 재적재가 롤업과 무관하게
--     상시 초당 4~8MB 를 읽는다. 이 마이그레이션은 롤업 몫만 줄인다(ADR-140 참고).
--
-- 처치: 구체화 뷰 → 일반 표로 바꾸고, "새로 들어온 행이 닿은 날짜·기기"만 다시 계산한다.
--   - 새 행은 app_analytics.id(IDENTITY ALWAYS, 단조 증가)로 가린다. created_at 은 앱이 보낸 값이라
--     오프라인으로 쌓였다가 늦게 들어오는 행이 있다(운영 실측: 2026-05-28 날짜 행이 9월 말에 들어옴).
--     그래서 "최근 N일만 다시 계산"은 틀린다 — 새 행이 가리키는 날짜를 그대로 다시 계산한다.
--   - 날짜 단위 6종(device_day·event_day·prop_day·hour_day·error_day·session_day):
--     닿은 날짜의 행을 지우고 그 날짜만 created_at 범위(idx_analytics_created)로 다시 집계한다.
--   - 기기 단위 3종(device_prop·device_event·device_profile, 기간 없음):
--     닿은 기기의 행을 지우고 그 기기만(idx_analytics_device) 전체 기간으로 다시 집계한다.
--   - 집계식은 운영 pg_matviews 정의(061 + 065 의 모바일 분리 반영)를 그대로 옮겼다.
--     표 이름·컬럼·색인을 그대로 두므로 *_v2 RPC 14개는 고치지 않는다.
--   - 경계: 직전 갱신이 본 max(id) 에서 1000 행을 겹쳐 다시 본다. 번호는 받았지만 아직 커밋 안 된
--     행이 뒤늦게 보이는 경우를 덮기 위해서다(다시 계산은 멱등이라 겹쳐도 결과가 같다).
--   - 원본 행 삭제는 반영하지 않는다(현재 원본을 지우는 정기 작업은 없다). 필요하면
--     analytics_rebuild_rollups() 로 전체를 다시 만든다.
--   - pg_cron 주기는 오너 결정(2026-09-09) 그대로 '5 1-21 * * *'. 명령도 그대로다.

-- ── 0) 어디까지 계산했는지 ──
ALTER TABLE analytics_rollup_meta ADD COLUMN IF NOT EXISTS last_id bigint;

COMMENT ON COLUMN analytics_rollup_meta.last_id IS
  '직전 갱신이 반영한 app_analytics.id 최댓값. NULL 이면 다음 갱신이 전체를 다시 만든다.';

-- ── 1) 구체화 뷰 → 일반 표 (이름·내용·색인 유지) ──
DO $$
DECLARE
  n text;
BEGIN
  FOREACH n IN ARRAY ARRAY[
    'analytics_rollup_device_day', 'analytics_rollup_event_day', 'analytics_rollup_prop_day',
    'analytics_rollup_device_prop', 'analytics_rollup_hour_day', 'analytics_rollup_device_profile',
    'analytics_rollup_error_day', 'analytics_rollup_device_event', 'analytics_rollup_session_day'
  ] LOOP
    IF EXISTS (SELECT 1 FROM pg_matviews WHERE schemaname = 'public' AND matviewname = n) THEN
      EXECUTE format('CREATE TABLE %I AS SELECT * FROM %I', n || '_tmp078', n);
      EXECUTE format('DROP MATERIALIZED VIEW %I', n);
      EXECUTE format('ALTER TABLE %I RENAME TO %I', n || '_tmp078', n);
    END IF;
    -- 새 표에는 Supabase 기본 권한(anon·authenticated ALL)이 붙는다 — 061 과 같게 되돌린다.
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC, anon, authenticated', n);
    EXECUTE format('GRANT SELECT ON %I TO service_role', n);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', n);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rollup_device_day_pk ON analytics_rollup_device_day (device_id, d);
CREATE INDEX IF NOT EXISTS idx_rollup_device_day_d ON analytics_rollup_device_day (d);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rollup_event_day_pk ON analytics_rollup_event_day (d, event);
CREATE INDEX IF NOT EXISTS idx_rollup_event_day_event ON analytics_rollup_event_day (event, d);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rollup_prop_day_pk ON analytics_rollup_prop_day (d, event, prop);
CREATE INDEX IF NOT EXISTS idx_rollup_prop_day_event ON analytics_rollup_prop_day (event, d);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rollup_device_prop_pk ON analytics_rollup_device_prop (device_id, event, prop);
CREATE INDEX IF NOT EXISTS idx_rollup_device_prop_event ON analytics_rollup_device_prop (event, prop);
CREATE INDEX IF NOT EXISTS idx_rollup_device_prop_last ON analytics_rollup_device_prop (event, last_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rollup_hour_day_pk ON analytics_rollup_hour_day (d, hour);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rollup_device_profile_pk ON analytics_rollup_device_profile (device_id);
CREATE INDEX IF NOT EXISTS idx_rollup_device_profile_first ON analytics_rollup_device_profile (first_date);
CREATE INDEX IF NOT EXISTS idx_rollup_device_profile_last ON analytics_rollup_device_profile (last_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rollup_error_day_pk ON analytics_rollup_error_day (d, component, message);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rollup_device_event_pk ON analytics_rollup_device_event (device_id, event);
CREATE INDEX IF NOT EXISTS idx_rollup_device_event_ev ON analytics_rollup_device_event (event, first_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rollup_session_day_pk ON analytics_rollup_session_day (d);

-- 표로 옮긴 내용은 직전 REFRESH 시점 것이다. 최근 2만 행(운영 기준 2~3일치)이 닿은 날짜·기기를
-- 첫 갱신에서 다시 계산해 그 사이 들어온 행을 채운다.
UPDATE analytics_rollup_meta
   SET last_id = GREATEST((SELECT COALESCE(MAX(id), 0) FROM app_analytics) - 20000, 0)
 WHERE id = 1 AND last_id IS NULL;

-- ── 2) 증분 갱신 ──
CREATE OR REPLACE FUNCTION analytics_refresh_rollups()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t0     timestamptz := clock_timestamp();
  v_last bigint;
  v_from bigint;
  v_max  bigint;
  v_days date[];
  v_devs text[];
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('analytics_refresh_rollups')) THEN
    RAISE NOTICE 'analytics_refresh_rollups: 다른 갱신이 진행 중이라 건너뜀';
    RETURN;
  END IF;

  BEGIN
    SELECT last_id INTO v_last FROM analytics_rollup_meta WHERE id = 1;
    SELECT MAX(id) INTO v_max FROM app_analytics;
    -- last_id 가 NULL 이면 처음부터(= 전체 재생성).
    v_from := CASE WHEN v_last IS NULL THEN 0 ELSE GREATEST(v_last - 1000, 0) END;

    SELECT COALESCE(array_agg(DISTINCT kst_date(created_at)), '{}'),
           COALESCE(array_agg(DISTINCT device_id) FILTER (WHERE device_id IS NOT NULL AND device_id <> ''), '{}')
      INTO v_days, v_devs
      FROM app_analytics
     WHERE id > v_from AND id <= COALESCE(v_max, 0);

    -- ── 날짜 단위: 닿은 날짜만 ──
    IF cardinality(v_days) > 0 THEN
      DELETE FROM analytics_rollup_device_day WHERE d = ANY (v_days);
      INSERT INTO analytics_rollup_device_day (device_id, d, events)
      SELECT a.device_id, kst_date(a.created_at), COUNT(*)
        FROM unnest(v_days) AS dd(d)
        JOIN app_analytics a
          ON a.created_at >= kst_day_start(dd.d) AND a.created_at < kst_day_start(dd.d + 1)
       WHERE a.device_id IS NOT NULL AND a.device_id <> '' AND a.event NOT LIKE 'mobile\_%'
       GROUP BY a.device_id, kst_date(a.created_at);

      DELETE FROM analytics_rollup_event_day WHERE d = ANY (v_days);
      INSERT INTO analytics_rollup_event_day (d, event, events, users)
      SELECT kst_date(a.created_at), a.event, COUNT(*), COUNT(DISTINCT a.device_id)
        FROM unnest(v_days) AS dd(d)
        JOIN app_analytics a
          ON a.created_at >= kst_day_start(dd.d) AND a.created_at < kst_day_start(dd.d + 1)
       GROUP BY kst_date(a.created_at), a.event;

      DELETE FROM analytics_rollup_prop_day WHERE d = ANY (v_days);
      INSERT INTO analytics_rollup_prop_day (d, event, prop, uses, users)
      SELECT kst_date(s.created_at), s.event, s.prop, COUNT(*), COUNT(DISTINCT s.device_id)
        FROM (
          SELECT a.created_at, a.device_id, a.event,
                 CASE a.event
                   WHEN 'tool_use'            THEN a.properties->>'tool'
                   WHEN 'page_view'           THEN a.properties->>'page'
                   WHEN 'feature_discovery'   THEN a.properties->>'feature'
                   WHEN 'export'              THEN a.properties->>'format'
                   WHEN 'share_click'         THEN a.properties->>'method'
                   WHEN 'settings_change'     THEN a.properties->>'section'
                   WHEN 'app_open'            THEN a.properties->>'launchMode'
                   WHEN 'widget_mode_changed' THEN a.properties->>'mode'
                   WHEN 'error'               THEN a.properties->>'component'
                   WHEN 'chatbot_feedback'    THEN a.properties->>'result'
                 END AS prop
            FROM unnest(v_days) AS dd(d)
            JOIN app_analytics a
              ON a.created_at >= kst_day_start(dd.d) AND a.created_at < kst_day_start(dd.d + 1)
        ) s
       WHERE s.prop IS NOT NULL AND s.prop <> ''
       GROUP BY kst_date(s.created_at), s.event, s.prop;

      DELETE FROM analytics_rollup_hour_day WHERE d = ANY (v_days);
      INSERT INTO analytics_rollup_hour_day (d, hour, events, users)
      SELECT kst_date(a.created_at),
             EXTRACT(HOUR FROM ((a.created_at AT TIME ZONE 'UTC') + interval '9 hours'))::smallint,
             COUNT(*), COUNT(DISTINCT a.device_id)
        FROM unnest(v_days) AS dd(d)
        JOIN app_analytics a
          ON a.created_at >= kst_day_start(dd.d) AND a.created_at < kst_day_start(dd.d + 1)
       GROUP BY 1, 2;

      DELETE FROM analytics_rollup_error_day WHERE d = ANY (v_days);
      INSERT INTO analytics_rollup_error_day (d, component, message, occurrences, users)
      SELECT kst_date(a.created_at),
             COALESCE(NULLIF(a.properties->>'component', ''), 'unknown'),
             LEFT(COALESCE(NULLIF(a.properties->>'message', ''), 'unknown'), 120),
             COUNT(*), COUNT(DISTINCT a.device_id)
        FROM unnest(v_days) AS dd(d)
        JOIN app_analytics a
          ON a.created_at >= kst_day_start(dd.d) AND a.created_at < kst_day_start(dd.d + 1)
       WHERE a.event = 'error'
       GROUP BY 1, 2, 3;

      DELETE FROM analytics_rollup_session_day WHERE d = ANY (v_days);
      INSERT INTO analytics_rollup_session_day (d, sessions, avg_seconds, median_seconds, p90_seconds, max_seconds)
      SELECT ds.d,
             COUNT(*),
             ROUND(AVG(ds.duration_seconds)),
             ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ds.duration_seconds::double precision)),
             ROUND(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY ds.duration_seconds::double precision)),
             ROUND(MAX(ds.duration_seconds))
        FROM (
          SELECT a.device_id,
                 kst_date(a.created_at) AS d,
                 EXTRACT(EPOCH FROM (MAX(a.created_at) - MIN(a.created_at))) AS duration_seconds
            FROM unnest(v_days) AS dd(d)
            JOIN app_analytics a
              ON a.created_at >= kst_day_start(dd.d) AND a.created_at < kst_day_start(dd.d + 1)
           WHERE a.device_id IS NOT NULL AND a.device_id <> ''
           GROUP BY a.device_id, kst_date(a.created_at)
          HAVING COUNT(*) >= 2
        ) ds
       WHERE ds.duration_seconds > 5 AND ds.duration_seconds < 28800
       GROUP BY ds.d;
    END IF;

    -- ── 기기 단위(기간 없음): 닿은 기기만, 그 기기의 전체 기간으로 ──
    IF cardinality(v_devs) > 0 THEN
      DELETE FROM analytics_rollup_device_prop WHERE device_id = ANY (v_devs);
      INSERT INTO analytics_rollup_device_prop (device_id, event, prop, uses, first_date, last_date, active_days)
      SELECT s.device_id, s.event, s.prop, COUNT(*),
             MIN(kst_date(s.created_at)), MAX(kst_date(s.created_at)),
             COUNT(DISTINCT kst_date(s.created_at))
        FROM (
          SELECT a.created_at, a.device_id, a.event,
                 CASE a.event
                   WHEN 'tool_use'          THEN a.properties->>'tool'
                   WHEN 'page_view'         THEN a.properties->>'page'
                   WHEN 'feature_discovery' THEN a.properties->>'feature'
                   WHEN 'export'            THEN a.properties->>'format'
                 END AS prop
            FROM app_analytics a
           WHERE a.device_id = ANY (v_devs)
        ) s
       WHERE s.prop IS NOT NULL AND s.prop <> ''
       GROUP BY s.device_id, s.event, s.prop;

      DELETE FROM analytics_rollup_device_event WHERE device_id = ANY (v_devs);
      INSERT INTO analytics_rollup_device_event (device_id, event, uses, first_date, last_date)
      SELECT a.device_id, a.event, COUNT(*), MIN(kst_date(a.created_at)), MAX(kst_date(a.created_at))
        FROM app_analytics a
       WHERE a.device_id = ANY (v_devs)
       GROUP BY a.device_id, a.event;

      DELETE FROM analytics_rollup_device_profile WHERE device_id = ANY (v_devs);
      INSERT INTO analytics_rollup_device_profile (
        device_id, first_date, last_date, active_days, total_events, tool_uses, error_events,
        onboarded, lifespan_days, app_version, os_info, school_level, region)
      WITH base AS (
        SELECT a.device_id,
               MIN(kst_date(a.created_at)) AS first_date,
               MAX(kst_date(a.created_at)) AS last_date,
               COUNT(DISTINCT kst_date(a.created_at)) AS active_days,
               COUNT(*) AS total_events,
               COUNT(*) FILTER (WHERE a.event = 'tool_use') AS tool_uses,
               COUNT(*) FILTER (WHERE a.event = 'error') AS error_events,
               BOOL_OR(a.event = 'onboarding_complete') AS onboarded
          FROM app_analytics a
         WHERE a.device_id = ANY (v_devs) AND a.event NOT LIKE 'mobile\_%'
         GROUP BY a.device_id
      ),
      last_version AS (
        SELECT DISTINCT ON (a.device_id)
               a.device_id,
               COALESCE(NULLIF(TRIM(a.app_version), ''), 'unknown') AS app_version,
               COALESCE(NULLIF(TRIM(a.os_info), ''), 'unknown')     AS os_info
          FROM app_analytics a
         WHERE a.device_id = ANY (v_devs) AND a.event NOT LIKE 'mobile\_%'
         ORDER BY a.device_id, a.created_at DESC
      ),
      school AS (
        SELECT DISTINCT ON (a.device_id)
               a.device_id,
               COALESCE(NULLIF(a.properties->>'level', ''), 'unknown')  AS school_level,
               COALESCE(NULLIF(a.properties->>'region', ''), 'unknown') AS region
          FROM app_analytics a
         WHERE a.device_id = ANY (v_devs) AND a.event = 'school_set'
         ORDER BY a.device_id, a.created_at DESC
      )
      SELECT b.device_id, b.first_date, b.last_date, b.active_days, b.total_events, b.tool_uses,
             b.error_events, b.onboarded, (b.last_date - b.first_date),
             v.app_version, v.os_info,
             COALESCE(s.school_level, 'unknown'), COALESCE(s.region, 'unknown')
        FROM base b
        LEFT JOIN last_version v ON v.device_id = b.device_id
        LEFT JOIN school s       ON s.device_id = b.device_id;
    END IF;

    UPDATE analytics_rollup_meta
       SET refreshed_at = now(),
           duration_ms  = (EXTRACT(EPOCH FROM (clock_timestamp() - t0)) * 1000)::integer,
           last_error   = NULL,
           last_id      = COALESCE(v_max, last_id)
     WHERE id = 1;
  EXCEPTION WHEN OTHERS OR query_canceled THEN
    UPDATE analytics_rollup_meta SET last_error = SQLERRM WHERE id = 1;
    RAISE WARNING 'analytics_refresh_rollups 실패: %', SQLERRM;
  END;
END $$;

COMMENT ON FUNCTION analytics_refresh_rollups() IS
  '롤업 9종 증분 갱신(078). 직전 last_id 뒤로 들어온 행이 닿은 날짜·기기만 다시 계산한다. 부르는 쪽이 앞 문장에서 statement_timeout 을 늘린다. 실패는 다시 던지지 않고 analytics_rollup_meta.last_error 에만 남긴다.';

-- ── 3) 전체 재생성(수동) ──
-- 원본 행을 지웠거나 집계식을 바꿨을 때만 쓴다. 옛 REFRESH 와 같은 무게이므로 한산할 때 부를 것:
--   SET statement_timeout = '15min'; SELECT analytics_rebuild_rollups();
CREATE OR REPLACE FUNCTION analytics_rebuild_rollups()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE analytics_rollup_meta SET last_id = NULL WHERE id = 1;
  PERFORM analytics_refresh_rollups();
END $$;

COMMENT ON FUNCTION analytics_rebuild_rollups() IS
  '롤업 9종 전체 재생성. last_id 를 비우고 analytics_refresh_rollups() 를 부른다. 무거우니 한산할 때만.';

REVOKE ALL ON FUNCTION analytics_rebuild_rollups() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION analytics_rebuild_rollups() TO service_role;
