-- ============================================
-- 061: Analytics 롤업(미리 계산) + 현장 인사이트 지표
--
-- 배경 — /admin/analytics 가 느렸던 이유
--   모든 analytics_* 뷰가 app_analytics 전체를 매번 처음부터 집계했다.
--   DateRangePicker 로 "최근 14일"을 골라도 계산은 전체를 하고 나서 잘라냈고,
--   038 의 기간 RPC 들은 (created_at AT TIME ZONE 'Asia/Seoul')::date 로 비교해
--   created_at 색인을 쓰지 못하고 매번 전수 검사를 했다.
--   한 페이지에서 이런 조회가 18개 동시에 돌았다.
--
-- 이 마이그레이션이 하는 일
--   1) 하루 단위로 미리 접어둔 롤업(materialized view) 6개를 만든다.
--   2) pg_cron 으로 30분마다 갱신한다(동시 갱신 → 조회 중단 없음).
--   3) 대시보드용 RPC 를 전부 롤업 위에서 다시 정의한다 → 원본 전수 검사 제거.
--   4) 원본을 직접 봐야 하는 조회는 created_at 범위 비교(sargable)로 바꿔
--      기존 idx_analytics_created 색인을 타게 한다.
--
-- 기존 뷰/함수는 지우지 않는다(레거시 호환). 새 이름은 analytics_rollup_* / *_v2.
-- 보안: 롤업·함수 모두 anon/PUBLIC EXECUTE 회수, service_role 에만 부여.
-- ============================================

-- ── 0) KST 일자 헬퍼 (IMMUTABLE — 한국은 DST 없는 고정 +09:00) ──
CREATE OR REPLACE FUNCTION kst_date(ts timestamptz)
RETURNS date
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$ SELECT ((ts AT TIME ZONE 'UTC') + interval '9 hours')::date $$;

COMMENT ON FUNCTION kst_date(timestamptz) IS
  '타임스탬프를 KST 일자로. IMMUTABLE 이라 색인 표현식·롤업에 쓸 수 있다.';

-- KST 일자 경계를 timestamptz 로 (범위 비교용 — 색인을 탄다)
CREATE OR REPLACE FUNCTION kst_day_start(d date)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$ SELECT (d::timestamp - interval '9 hours') AT TIME ZONE 'UTC' $$;

-- ── 1) 롤업: 기기 × 일자 ──
-- DAU/WAU/MAU, 리텐션, 코호트, 활동일수 등급, 이탈 감지의 공통 뼈대.
DROP MATERIALIZED VIEW IF EXISTS analytics_rollup_device_day CASCADE;
CREATE MATERIALIZED VIEW analytics_rollup_device_day AS
SELECT
  device_id,
  kst_date(created_at) AS d,
  COUNT(*)::bigint     AS events
FROM app_analytics
WHERE device_id IS NOT NULL AND device_id <> ''
GROUP BY device_id, kst_date(created_at);

CREATE UNIQUE INDEX idx_rollup_device_day_pk ON analytics_rollup_device_day (device_id, d);
CREATE INDEX idx_rollup_device_day_d ON analytics_rollup_device_day (d);

-- ── 2) 롤업: 일자 × 이벤트 ──
-- 일별/주간 요약, 이벤트 구성, 오류 건수, 퍼널 단계 수.
DROP MATERIALIZED VIEW IF EXISTS analytics_rollup_event_day CASCADE;
CREATE MATERIALIZED VIEW analytics_rollup_event_day AS
SELECT
  kst_date(created_at)              AS d,
  event,
  COUNT(*)::bigint                  AS events,
  COUNT(DISTINCT device_id)::bigint AS users
FROM app_analytics
GROUP BY kst_date(created_at), event;

CREATE UNIQUE INDEX idx_rollup_event_day_pk ON analytics_rollup_event_day (d, event);
CREATE INDEX idx_rollup_event_day_event ON analytics_rollup_event_day (event, d);

-- ── 3) 롤업: 일자 × 이벤트 × 속성값 ──
-- 도구/화면/기능발견/내보내기/공유 등 "무엇을" 계열 순위를 한 테이블로 처리한다.
DROP MATERIALIZED VIEW IF EXISTS analytics_rollup_prop_day CASCADE;
CREATE MATERIALIZED VIEW analytics_rollup_prop_day AS
SELECT
  kst_date(created_at)              AS d,
  event,
  prop,
  COUNT(*)::bigint                  AS uses,
  COUNT(DISTINCT device_id)::bigint AS users
FROM (
  SELECT
    created_at,
    device_id,
    event,
    CASE event
      WHEN 'tool_use'           THEN properties->>'tool'
      WHEN 'page_view'          THEN properties->>'page'
      WHEN 'feature_discovery'  THEN properties->>'feature'
      WHEN 'export'             THEN properties->>'format'
      WHEN 'share_click'        THEN properties->>'method'
      WHEN 'settings_change'    THEN properties->>'section'
      WHEN 'app_open'           THEN properties->>'launchMode'
      WHEN 'widget_mode_changed' THEN properties->>'mode'
      WHEN 'error'              THEN properties->>'component'
      WHEN 'chatbot_feedback'   THEN properties->>'result'
    END AS prop
  FROM app_analytics
) s
WHERE prop IS NOT NULL AND prop <> ''
GROUP BY kst_date(created_at), event, prop;

CREATE UNIQUE INDEX idx_rollup_prop_day_pk ON analytics_rollup_prop_day (d, event, prop);
CREATE INDEX idx_rollup_prop_day_event ON analytics_rollup_prop_day (event, d);

-- ── 4) 롤업: 기기 × 이벤트 × 속성값 (기간 없음, 최초/최종일 보유) ──
-- 채택률(몇 명이 닿았나) · 재사용률(한 번 쓰고 마나) 계산용.
DROP MATERIALIZED VIEW IF EXISTS analytics_rollup_device_prop CASCADE;
CREATE MATERIALIZED VIEW analytics_rollup_device_prop AS
SELECT
  device_id,
  event,
  prop,
  COUNT(*)::bigint          AS uses,
  MIN(kst_date(created_at)) AS first_date,
  MAX(kst_date(created_at)) AS last_date,
  COUNT(DISTINCT kst_date(created_at))::bigint AS active_days
FROM (
  SELECT
    created_at,
    device_id,
    event,
    CASE event
      WHEN 'tool_use'          THEN properties->>'tool'
      WHEN 'page_view'         THEN properties->>'page'
      WHEN 'feature_discovery' THEN properties->>'feature'
      WHEN 'export'            THEN properties->>'format'
    END AS prop
  FROM app_analytics
  WHERE device_id IS NOT NULL AND device_id <> ''
) s
WHERE prop IS NOT NULL AND prop <> ''
GROUP BY device_id, event, prop;

CREATE UNIQUE INDEX idx_rollup_device_prop_pk ON analytics_rollup_device_prop (device_id, event, prop);
CREATE INDEX idx_rollup_device_prop_event ON analytics_rollup_device_prop (event, prop);
CREATE INDEX idx_rollup_device_prop_last ON analytics_rollup_device_prop (event, last_date);

-- ── 5) 롤업: 일자 × 시각 (학교 현장 리듬) ──
DROP MATERIALIZED VIEW IF EXISTS analytics_rollup_hour_day CASCADE;
CREATE MATERIALIZED VIEW analytics_rollup_hour_day AS
SELECT
  kst_date(created_at) AS d,
  EXTRACT(HOUR FROM ((created_at AT TIME ZONE 'UTC') + interval '9 hours'))::smallint AS hour,
  COUNT(*)::bigint                  AS events,
  COUNT(DISTINCT device_id)::bigint AS users
FROM app_analytics
GROUP BY 1, 2;

CREATE UNIQUE INDEX idx_rollup_hour_day_pk ON analytics_rollup_hour_day (d, hour);

-- ── 6) 롤업: 기기 프로필 (정착·이탈·버전 잔류) ──
-- 기기별 첫날/마지막날/활동일수/총이벤트/최종버전/OS/학교급/지역.
-- 학교명은 담지 않는다 — 집계로 의미가 나오는 건 학교급·지역뿐이다.
DROP MATERIALIZED VIEW IF EXISTS analytics_rollup_device_profile CASCADE;
CREATE MATERIALIZED VIEW analytics_rollup_device_profile AS
WITH base AS (
  SELECT
    device_id,
    MIN(kst_date(created_at)) AS first_date,
    MAX(kst_date(created_at)) AS last_date,
    COUNT(DISTINCT kst_date(created_at))::bigint AS active_days,
    COUNT(*)::bigint AS total_events,
    COUNT(*) FILTER (WHERE event = 'tool_use')::bigint AS tool_uses,
    COUNT(*) FILTER (WHERE event = 'error')::bigint AS error_events,
    BOOL_OR(event = 'onboarding_complete') AS onboarded
  FROM app_analytics
  WHERE device_id IS NOT NULL AND device_id <> ''
  GROUP BY device_id
),
last_version AS (
  SELECT DISTINCT ON (device_id)
    device_id,
    COALESCE(NULLIF(TRIM(app_version), ''), 'unknown') AS app_version,
    COALESCE(NULLIF(TRIM(os_info), ''), 'unknown')     AS os_info
  FROM app_analytics
  WHERE device_id IS NOT NULL AND device_id <> ''
  ORDER BY device_id, created_at DESC
),
school AS (
  SELECT DISTINCT ON (device_id)
    device_id,
    COALESCE(NULLIF(properties->>'level', ''), 'unknown')  AS school_level,
    COALESCE(NULLIF(properties->>'region', ''), 'unknown') AS region
  FROM app_analytics
  WHERE event = 'school_set' AND device_id IS NOT NULL AND device_id <> ''
  ORDER BY device_id, created_at DESC
)
SELECT
  b.device_id,
  b.first_date,
  b.last_date,
  b.active_days,
  b.total_events,
  b.tool_uses,
  b.error_events,
  b.onboarded,
  (b.last_date - b.first_date) AS lifespan_days,
  v.app_version,
  v.os_info,
  COALESCE(s.school_level, 'unknown') AS school_level,
  COALESCE(s.region, 'unknown')       AS region
FROM base b
LEFT JOIN last_version v ON v.device_id = b.device_id
LEFT JOIN school s       ON s.device_id = b.device_id;

CREATE UNIQUE INDEX idx_rollup_device_profile_pk ON analytics_rollup_device_profile (device_id);
CREATE INDEX idx_rollup_device_profile_first ON analytics_rollup_device_profile (first_date);
CREATE INDEX idx_rollup_device_profile_last ON analytics_rollup_device_profile (last_date);

-- ── 7) 롤업: 오류 (일자 × 위치 × 메시지 앞부분) ──
-- stack 은 담지 않는다(용량·개인정보). 메시지는 120자로 자른다.
DROP MATERIALIZED VIEW IF EXISTS analytics_rollup_error_day CASCADE;
CREATE MATERIALIZED VIEW analytics_rollup_error_day AS
SELECT
  kst_date(created_at) AS d,
  COALESCE(NULLIF(properties->>'component', ''), 'unknown') AS component,
  LEFT(COALESCE(NULLIF(properties->>'message', ''), 'unknown'), 120) AS message,
  COUNT(*)::bigint                  AS occurrences,
  COUNT(DISTINCT device_id)::bigint AS users
FROM app_analytics
WHERE event = 'error'
GROUP BY 1, 2, 3;

CREATE UNIQUE INDEX idx_rollup_error_day_pk ON analytics_rollup_error_day (d, component, message);

-- ── 7b) 롤업: 기기 × 이벤트 (온보딩 퍼널·기기 단위 도달 여부) ──
DROP MATERIALIZED VIEW IF EXISTS analytics_rollup_device_event CASCADE;
CREATE MATERIALIZED VIEW analytics_rollup_device_event AS
SELECT
  device_id,
  event,
  COUNT(*)::bigint          AS uses,
  MIN(kst_date(created_at)) AS first_date,
  MAX(kst_date(created_at)) AS last_date
FROM app_analytics
WHERE device_id IS NOT NULL AND device_id <> ''
GROUP BY device_id, event;

CREATE UNIQUE INDEX idx_rollup_device_event_pk ON analytics_rollup_device_event (device_id, event);
CREATE INDEX idx_rollup_device_event_ev ON analytics_rollup_device_event (event, first_date);

-- ── 7c) 롤업: 일자 × 세션 길이 ──
-- 018 과 같은 방식(기기·일자별 첫 이벤트 ~ 마지막 이벤트 간격)을 쓴다.
-- app_close 의 sessionDuration 은 창을 닫을 때 유실되는 일이 잦아 018 에서 이미 버린 기준이다.
-- 중앙값·90분위는 나중에 다시 합칠 수 없어 일자별로 미리 낸다.
DROP MATERIALIZED VIEW IF EXISTS analytics_rollup_session_day CASCADE;
CREATE MATERIALIZED VIEW analytics_rollup_session_day AS
WITH device_sessions AS (
  SELECT
    device_id,
    kst_date(created_at) AS d,
    EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) AS duration_seconds
  FROM app_analytics
  WHERE device_id IS NOT NULL AND device_id <> ''
  GROUP BY device_id, kst_date(created_at)
  HAVING COUNT(*) >= 2
)
SELECT
  d,
  COUNT(*)::bigint AS sessions,
  ROUND(AVG(duration_seconds))    AS avg_seconds,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_seconds)) AS median_seconds,
  ROUND(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY duration_seconds)) AS p90_seconds,
  ROUND(MAX(duration_seconds))    AS max_seconds
FROM device_sessions
WHERE duration_seconds > 5 AND duration_seconds < 28800
GROUP BY d;

CREATE UNIQUE INDEX idx_rollup_session_day_pk ON analytics_rollup_session_day (d);

-- ── 8) 갱신 ──
-- CONCURRENTLY: 갱신 중에도 대시보드 조회가 막히지 않는다(각 롤업에 UNIQUE 색인 필수).
CREATE TABLE IF NOT EXISTS analytics_rollup_meta (
  id            smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  refreshed_at  timestamptz,
  duration_ms   integer,
  last_error    text,
  CONSTRAINT analytics_rollup_meta_single CHECK (id = 1)
);
INSERT INTO analytics_rollup_meta (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION analytics_refresh_rollups()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t0 timestamptz := clock_timestamp();
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
EXCEPTION WHEN OTHERS THEN
  UPDATE analytics_rollup_meta SET last_error = SQLERRM WHERE id = 1;
  RAISE;
END $$;

-- 운영 실측(777k행/299MB) 롤업별 갱신 소요:
--   hour_day 15.4s · device_day 10.2s · device_profile 10.2s · device_prop 7.3s
--   event_day 5.7s · prop_day 3.6s · device_event 1.5s · session_day 0.6s · error_day 0.04s
--   합계 약 55초. 앱과 같은 DB 를 쓰므로 주기를 30분으로 잡아 부하 비중을 ~3% 로 둔다.
--   더 자주 필요하면 "자주 바뀌는 것(device_day·event_day·session_day·error_day, 약 17초)"만
--   짧은 주기로 떼어내는 방법이 있다 — 대신 화면의 '집계 기준' 표시가 둘로 갈린다.
COMMENT ON FUNCTION analytics_refresh_rollups() IS
  '롤업 9종을 동시 갱신한다. pg_cron 이 30분마다 호출. 실패 시 analytics_rollup_meta.last_error 에 기록.';

-- 집계 기준 시각 조회용 (대시보드 상단에 "언제 기준인지" 표시)
CREATE OR REPLACE FUNCTION analytics_rollup_status()
RETURNS TABLE (refreshed_at timestamptz, duration_ms integer, last_error text, stale_minutes numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    refreshed_at,
    duration_ms,
    last_error,
    ROUND(EXTRACT(EPOCH FROM (now() - refreshed_at)) / 60.0, 1) AS stale_minutes
  FROM analytics_rollup_meta WHERE id = 1;
$$;

-- pg_cron 10분 주기 등록 (034 와 같은 방어적 패턴 — 미활성 시 NOTICE 후 통과)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'analytics_refresh_rollups') THEN
      PERFORM cron.unschedule('analytics_refresh_rollups');
    END IF;
    PERFORM cron.schedule('analytics_refresh_rollups', '*/30 * * * *', 'SELECT analytics_refresh_rollups();');
  ELSE
    RAISE NOTICE 'pg_cron 미활성 — analytics_refresh_rollups() 를 외부 스케줄러(GitHub Actions 등)로 10분마다 호출하세요.';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron 등록 실패(%): 외부 스케줄러로 폴백하세요.', SQLERRM;
END $$;

-- ============================================
-- 9) 대시보드 RPC — 전부 롤업 위에서만 계산한다.
--    p_from / p_to 는 KST 일자. NULL = 전체 기간.
-- ============================================

-- 9-1) 한눈 요약
-- ★CTE 를 MATERIALIZED 로 고정한다. 그러지 않으면 Postgres 가 인라인해서 같은 집계를
--   여러 번 다시 돈다(운영 실측: 2.2초 → 0.3초). stickiness 는 wau/mau 를 재사용한다.
CREATE OR REPLACE FUNCTION analytics_overview_v2(p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS TABLE (
  total_users bigint, active_users bigint, new_users bigint, returning_users bigint,
  total_events bigint, avg_dau numeric, wau bigint, mau bigint, stickiness numeric,
  onboarded_users bigint, today_users bigint
)
LANGUAGE sql STABLE SECURITY INVOKER
AS $fn$
  WITH b AS MATERIALIZED (
    SELECT COALESCE(p_from, DATE '2000-01-01') AS f,
           COALESCE(p_to,   DATE '9999-12-31') AS t,
           kst_date(now()) AS today
  ),
  act AS MATERIALIZED (
    SELECT dd.device_id, SUM(dd.events) AS ev
    FROM analytics_rollup_device_day dd, b
    WHERE dd.d BETWEEN b.f AND b.t
    GROUP BY dd.device_id
  ),
  dau AS MATERIALIZED (
    SELECT dd.d, COUNT(*)::bigint AS c
    FROM analytics_rollup_device_day dd, b
    WHERE dd.d BETWEEN b.f AND b.t
    GROUP BY dd.d
  ),
  -- 최근 30일 구간을 한 번만 훑어 WAU·MAU 를 동시에 뽑는다.
  win AS MATERIALIZED (
    SELECT
      COUNT(DISTINCT dd.device_id) FILTER (WHERE dd.d > b.today - 7)::bigint AS wau,
      COUNT(DISTINCT dd.device_id)::bigint AS mau
    FROM analytics_rollup_device_day dd, b
    WHERE dd.d > b.today - 30 AND dd.d <= b.today
  ),
  prof AS MATERIALIZED (
    SELECT
      COUNT(*)::bigint AS total_users,
      COUNT(*) FILTER (WHERE p.onboarded)::bigint AS onboarded_users,
      COUNT(*) FILTER (WHERE p.first_date BETWEEN b.f AND b.t)::bigint AS new_users
    FROM analytics_rollup_device_profile p, b
  )
  SELECT
    prof.total_users,
    (SELECT COUNT(*)::bigint FROM act),
    prof.new_users,
    (SELECT COUNT(*)::bigint FROM act a
       JOIN analytics_rollup_device_profile p ON p.device_id = a.device_id, b
      WHERE p.first_date < b.f),
    (SELECT COALESCE(SUM(ev), 0)::bigint FROM act),
    (SELECT ROUND(AVG(c), 1) FROM dau),
    win.wau,
    win.mau,
    ROUND(100.0 * win.wau / NULLIF(win.mau, 0), 1),
    prof.onboarded_users,
    (SELECT COUNT(*)::bigint FROM analytics_rollup_device_day dd, b WHERE dd.d = b.today)
  FROM prof, win;
$fn$;

-- 9-2) 일별 활성 (신규/재방문 분리)
CREATE OR REPLACE FUNCTION analytics_daily_v2(p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS TABLE (d date, dau bigint, new_users bigint, returning_users bigint, events bigint)
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  SELECT
    dd.d,
    COUNT(*)::bigint AS dau,
    COUNT(*) FILTER (WHERE p.first_date = dd.d)::bigint AS new_users,
    COUNT(*) FILTER (WHERE p.first_date < dd.d)::bigint AS returning_users,
    SUM(dd.events)::bigint AS events
  FROM analytics_rollup_device_day dd
  JOIN analytics_rollup_device_profile p ON p.device_id = dd.device_id
  WHERE dd.d BETWEEN COALESCE(p_from, DATE '2000-01-01') AND COALESCE(p_to, DATE '9999-12-31')
  GROUP BY dd.d
  ORDER BY dd.d DESC;
$$;

-- 9-3) 주간 요약
CREATE OR REPLACE FUNCTION analytics_weekly_v2(p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS TABLE (
  week_start date, weekly_active_users bigint, new_users bigint, total_events bigint,
  app_opens bigint, tool_uses bigint, exports bigint, onboarding_completions bigint, errors bigint
)
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  WITH b AS (
    SELECT COALESCE(p_from, DATE '2000-01-01') AS f, COALESCE(p_to, DATE '9999-12-31') AS t
  ),
  wau AS (
    SELECT DATE_TRUNC('week', dd.d)::date AS week_start,
           COUNT(DISTINCT dd.device_id)::bigint AS weekly_active_users,
           SUM(dd.events)::bigint AS total_events
    FROM analytics_rollup_device_day dd, b
    WHERE dd.d BETWEEN b.f AND b.t
    GROUP BY 1
  ),
  newu AS (
    SELECT DATE_TRUNC('week', p.first_date)::date AS week_start, COUNT(*)::bigint AS new_users
    FROM analytics_rollup_device_profile p, b
    WHERE p.first_date BETWEEN b.f AND b.t
    GROUP BY 1
  ),
  ev AS (
    SELECT DATE_TRUNC('week', e.d)::date AS week_start,
           SUM(e.events) FILTER (WHERE e.event = 'app_open')::bigint AS app_opens,
           SUM(e.events) FILTER (WHERE e.event = 'tool_use')::bigint AS tool_uses,
           SUM(e.events) FILTER (WHERE e.event = 'export')::bigint AS exports,
           SUM(e.events) FILTER (WHERE e.event = 'onboarding_complete')::bigint AS onboarding_completions,
           SUM(e.events) FILTER (WHERE e.event = 'error')::bigint AS errors
    FROM analytics_rollup_event_day e, b
    WHERE e.d BETWEEN b.f AND b.t
    GROUP BY 1
  )
  SELECT w.week_start, w.weekly_active_users, COALESCE(n.new_users, 0), w.total_events,
         COALESCE(ev.app_opens, 0), COALESCE(ev.tool_uses, 0), COALESCE(ev.exports, 0),
         COALESCE(ev.onboarding_completions, 0), COALESCE(ev.errors, 0)
  FROM wau w
  LEFT JOIN newu n ON n.week_start = w.week_start
  LEFT JOIN ev ON ev.week_start = w.week_start
  ORDER BY w.week_start DESC;
$$;

-- 9-4) 속성값 순위 (도구·화면·기능발견·내보내기·공유 공용)
-- 사용자 수는 "기간 내 서로 다른 기기 수"라 일별 롤업으로는 정확히 합칠 수 없다.
-- 그래서 여기만 원본을 보되, created_at 범위 비교로 idx_analytics_event_created 색인을 탄다.
-- (느렸던 원인은 원본 조회 자체가 아니라 색인을 못 타던 날짜 변환 비교였다.)
CREATE OR REPLACE FUNCTION analytics_prop_ranking_v2(
  p_event text, p_from date DEFAULT NULL, p_to date DEFAULT NULL, p_limit int DEFAULT 30
)
RETURNS TABLE (prop text, uses bigint, users bigint, uses_per_user numeric)
LANGUAGE sql STABLE SECURITY INVOKER
AS $fn$
  SELECT
    prop,
    COUNT(*)::bigint AS uses,
    COUNT(DISTINCT device_id)::bigint AS users,
    ROUND(COUNT(*)::numeric / NULLIF(COUNT(DISTINCT device_id), 0), 1) AS uses_per_user
  FROM (
    SELECT
      device_id,
      CASE p_event
        WHEN 'tool_use'           THEN properties->>'tool'
        WHEN 'page_view'          THEN properties->>'page'
        WHEN 'feature_discovery'  THEN properties->>'feature'
        WHEN 'export'             THEN properties->>'format'
        WHEN 'share_click'        THEN properties->>'method'
        WHEN 'settings_change'    THEN properties->>'section'
        WHEN 'app_open'           THEN properties->>'launchMode'
        WHEN 'widget_mode_changed' THEN properties->>'mode'
        WHEN 'error'              THEN properties->>'component'
      END AS prop
    FROM app_analytics
    WHERE event = p_event
      AND created_at >= kst_day_start(COALESCE(p_from, DATE '2000-01-01'))
      AND created_at <  kst_day_start(COALESCE(p_to, DATE '9999-12-30') + 1)
  ) s
  WHERE prop IS NOT NULL AND prop <> ''
  GROUP BY prop
  ORDER BY uses DESC
  LIMIT GREATEST(p_limit, 1);
$fn$;

-- 9-5) 기능 채택·재사용 (한 번 쓰고 마는가, 습관이 되는가)
-- reach   : 그 기능에 한 번이라도 닿은 기기
-- repeat  : 2회 이상 쓴 기기
-- sticky  : 서로 다른 날 3일 이상 쓴 기기 = 습관으로 자리 잡음
CREATE OR REPLACE FUNCTION analytics_adoption_v2(
  p_event text DEFAULT 'tool_use', p_from date DEFAULT NULL, p_to date DEFAULT NULL, p_limit int DEFAULT 30
)
RETURNS TABLE (
  prop text, reach_users bigint, reach_pct numeric,
  repeat_users bigint, repeat_pct numeric,
  once_only_users bigint, once_only_pct numeric,
  sticky_users bigint, sticky_pct numeric, avg_uses numeric
)
LANGUAGE sql STABLE SECURITY INVOKER
AS $fn$
  WITH b AS (
    SELECT COALESCE(p_from, DATE '2000-01-01') AS f, COALESCE(p_to, DATE '9999-12-31') AS t
  ),
  base AS (
    SELECT COUNT(DISTINCT dd.device_id)::numeric AS active
    FROM analytics_rollup_device_day dd, b
    WHERE dd.d BETWEEN b.f AND b.t
  ),
  dp AS (
    SELECT dp.*
    FROM analytics_rollup_device_prop dp, b
    WHERE dp.event = p_event
      AND dp.last_date >= b.f AND dp.first_date <= b.t
  )
  SELECT
    dp.prop,
    COUNT(*)::bigint,
    ROUND(100.0 * COUNT(*) / NULLIF((SELECT active FROM base), 0), 1),
    COUNT(*) FILTER (WHERE dp.uses >= 2)::bigint,
    ROUND(100.0 * COUNT(*) FILTER (WHERE dp.uses >= 2) / NULLIF(COUNT(*), 0), 1),
    COUNT(*) FILTER (WHERE dp.uses = 1)::bigint,
    ROUND(100.0 * COUNT(*) FILTER (WHERE dp.uses = 1) / NULLIF(COUNT(*), 0), 1),
    COUNT(*) FILTER (WHERE dp.active_days >= 3)::bigint,
    ROUND(100.0 * COUNT(*) FILTER (WHERE dp.active_days >= 3) / NULLIF(COUNT(*), 0), 1),
    ROUND(AVG(dp.uses), 1)
  FROM dp
  GROUP BY dp.prop
  ORDER BY COUNT(*) DESC
  LIMIT GREATEST(p_limit, 1);
$fn$;

-- 9-6) 주간 코호트 리텐션 (가로: 가입 후 N주째, 세로: 처음 쓴 주)
CREATE OR REPLACE FUNCTION analytics_cohort_weekly_v2(p_weeks int DEFAULT 12)
RETURNS TABLE (cohort_week date, cohort_size bigint, week_offset int, retained bigint, pct numeric)
LANGUAGE sql STABLE SECURITY INVOKER
AS $fn$
  WITH c AS (
    SELECT device_id, DATE_TRUNC('week', first_date)::date AS cohort_week
    FROM analytics_rollup_device_profile
    WHERE first_date >= DATE_TRUNC('week', kst_date(now()))::date - (GREATEST(p_weeks, 1) * 7)
  ),
  sizes AS (SELECT cohort_week, COUNT(*)::bigint AS cohort_size FROM c GROUP BY cohort_week),
  act AS (
    SELECT DISTINCT c.cohort_week, c.device_id,
           ((DATE_TRUNC('week', dd.d)::date - c.cohort_week) / 7)::int AS week_offset
    FROM c JOIN analytics_rollup_device_day dd ON dd.device_id = c.device_id
  )
  SELECT s.cohort_week, s.cohort_size, a.week_offset,
         COUNT(*)::bigint AS retained,
         ROUND(100.0 * COUNT(*) / NULLIF(s.cohort_size, 0), 1) AS pct
  FROM act a JOIN sizes s ON s.cohort_week = a.cohort_week
  WHERE a.week_offset BETWEEN 0 AND 8
  GROUP BY s.cohort_week, s.cohort_size, a.week_offset
  ORDER BY s.cohort_week DESC, a.week_offset;
$fn$;

-- 9-7) 사용 강도 등급 (기간 내 실제 활동한 날 수 기준)
CREATE OR REPLACE FUNCTION analytics_engagement_tiers_v2(p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS TABLE (tier text, tier_order int, devices bigint, pct numeric, avg_events numeric)
LANGUAGE sql STABLE SECURITY INVOKER
AS $fn$
  WITH act AS (
    SELECT dd.device_id, COUNT(*)::int AS days, SUM(dd.events)::bigint AS events
    FROM analytics_rollup_device_day dd
    WHERE dd.d BETWEEN COALESCE(p_from, DATE '2000-01-01') AND COALESCE(p_to, DATE '9999-12-31')
    GROUP BY dd.device_id
  ),
  labeled AS (
    SELECT
      CASE
        WHEN days = 1            THEN '하루만 (맛보기)'
        WHEN days BETWEEN 2 AND 3  THEN '2~3일'
        WHEN days BETWEEN 4 AND 9  THEN '4~9일 (자리 잡는 중)'
        WHEN days BETWEEN 10 AND 19 THEN '10~19일 (꾸준)'
        ELSE '20일+ (거의 매일)'
      END AS tier,
      CASE
        WHEN days = 1 THEN 1
        WHEN days BETWEEN 2 AND 3 THEN 2
        WHEN days BETWEEN 4 AND 9 THEN 3
        WHEN days BETWEEN 10 AND 19 THEN 4
        ELSE 5
      END AS tier_order,
      events
    FROM act
  )
  SELECT tier, tier_order, COUNT(*)::bigint,
         ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0), 1),
         ROUND(AVG(events), 1)
  FROM labeled
  GROUP BY tier, tier_order
  ORDER BY tier_order;
$fn$;

-- 9-8) 이탈 신호 (마지막 활동이 얼마나 지났나 — "정착했다 떠난 분"을 따로 센다)
CREATE OR REPLACE FUNCTION analytics_churn_v2()
RETURNS TABLE (bucket text, bucket_order int, devices bigint, engaged_devices bigint, pct numeric)
LANGUAGE sql STABLE SECURITY INVOKER
AS $fn$
  WITH p AS (
    SELECT (kst_date(now()) - last_date) AS gap, active_days
    FROM analytics_rollup_device_profile
  ),
  labeled AS (
    SELECT
      CASE
        WHEN gap <= 6   THEN '최근 7일 내 활동'
        WHEN gap <= 13  THEN '8~13일 전'
        WHEN gap <= 29  THEN '2~4주 전'
        WHEN gap <= 59  THEN '1~2개월 전'
        ELSE '2개월 이상'
      END AS bucket,
      CASE
        WHEN gap <= 6 THEN 1 WHEN gap <= 13 THEN 2 WHEN gap <= 29 THEN 3
        WHEN gap <= 59 THEN 4 ELSE 5
      END AS bucket_order,
      active_days
    FROM p
  )
  SELECT bucket, bucket_order, COUNT(*)::bigint,
         COUNT(*) FILTER (WHERE active_days >= 5)::bigint,
         ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0), 1)
  FROM labeled
  GROUP BY bucket, bucket_order
  ORDER BY bucket_order;
$fn$;

-- 9-9) 학교 현장 리듬 (요일 × 시간대)
CREATE OR REPLACE FUNCTION analytics_rhythm_v2(p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS TABLE (dow smallint, hour smallint, events bigint, avg_users numeric, day_count bigint)
LANGUAGE sql STABLE SECURITY INVOKER
AS $fn$
  SELECT
    EXTRACT(DOW FROM h.d)::smallint AS dow,
    h.hour,
    SUM(h.events)::bigint,
    ROUND(AVG(h.users), 1),
    COUNT(DISTINCT h.d)::bigint
  FROM analytics_rollup_hour_day h
  WHERE h.d BETWEEN COALESCE(p_from, DATE '2000-01-01') AND COALESCE(p_to, DATE '9999-12-31')
  GROUP BY 1, 2
  ORDER BY 1, 2;
$fn$;

-- 9-10) 온보딩 퍼널 (기간 내 처음 온 기기가 어디까지 갔나)
-- 분모는 "기간 내 첫 실행 기기". 단계는 기기 기준 도달 여부(시점 무관 — 나중에 설정해도 도달로 본다).
-- ★단계마다 UNION ALL 로 조인을 다시 돌면 8번 반복된다(운영 실측: 2.2초).
--   기기별 도달 플래그를 한 번에 만들고, 단계별로는 그 플래그만 센다.
CREATE OR REPLACE FUNCTION analytics_onboarding_funnel_v2(p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS TABLE (step text, step_order int, devices bigint, pct numeric, drop_from_prev numeric)
LANGUAGE sql STABLE SECURITY INVOKER
AS $fn$
  WITH cohort AS MATERIALIZED (
    SELECT device_id, active_days
    FROM analytics_rollup_device_profile
    WHERE first_date BETWEEN COALESCE(p_from, DATE '2000-01-01') AND COALESCE(p_to, DATE '9999-12-31')
  ),
  flags AS MATERIALIZED (
    SELECT
      c.device_id,
      MAX(c.active_days) AS active_days,
      BOOL_OR(de.event = 'onboarding_roles_selected') AS f_roles,
      BOOL_OR(de.event = 'onboarding_widget_preset')  AS f_preset,
      BOOL_OR(de.event = 'onboarding_complete')       AS f_done,
      BOOL_OR(de.event = 'school_set')                AS f_school,
      BOOL_OR(de.event = 'class_set')                 AS f_class,
      BOOL_OR(de.event = 'tool_use')                  AS f_tool
    FROM cohort c
    LEFT JOIN analytics_rollup_device_event de ON de.device_id = c.device_id
    GROUP BY c.device_id
  ),
  steps AS (
    SELECT '1. 앱 첫 실행' AS step, 1 AS step_order, COUNT(*)::bigint AS devices FROM flags
    UNION ALL SELECT '2. 역할 선택',   2, COUNT(*) FILTER (WHERE f_roles)::bigint  FROM flags
    UNION ALL SELECT '3. 위젯 고르기', 3, COUNT(*) FILTER (WHERE f_preset)::bigint FROM flags
    UNION ALL SELECT '4. 온보딩 완료', 4, COUNT(*) FILTER (WHERE f_done)::bigint   FROM flags
    UNION ALL SELECT '5. 학교 입력',   5, COUNT(*) FILTER (WHERE f_school)::bigint FROM flags
    UNION ALL SELECT '6. 학급 입력',   6, COUNT(*) FILTER (WHERE f_class)::bigint  FROM flags
    UNION ALL SELECT '7. 도구 첫 사용', 7, COUNT(*) FILTER (WHERE f_tool)::bigint  FROM flags
    UNION ALL SELECT '8. 이틀째 재방문', 8, COUNT(*) FILTER (WHERE active_days >= 2)::bigint FROM flags
  )
  SELECT
    s.step, s.step_order, s.devices,
    ROUND(100.0 * s.devices / NULLIF(MAX(s.devices) FILTER (WHERE s.step_order = 1) OVER (), 0), 1),
    ROUND(100.0 * (LAG(s.devices) OVER (ORDER BY s.step_order) - s.devices)
          / NULLIF(LAG(s.devices) OVER (ORDER BY s.step_order), 0), 1)
  FROM steps s
  ORDER BY s.step_order;
$fn$;

-- 9-11) 오류 요약 (어디서 몇 명이 막혔나)
-- '몇 명'은 기간 내 서로 다른 기기 수라 일별 롤업으로 합칠 수 없다(하루 최대치가 아니다).
-- error 이벤트는 드물어 idx_analytics_event_created 범위 스캔이 값싸므로 원본에서 정확히 센다.
CREATE OR REPLACE FUNCTION analytics_error_summary_v2(
  p_from date DEFAULT NULL, p_to date DEFAULT NULL, p_limit int DEFAULT 15
)
RETURNS TABLE (component text, message text, occurrences bigint, users bigint, last_date date)
LANGUAGE sql STABLE SECURITY INVOKER
AS $fn$
  SELECT
    COALESCE(NULLIF(properties->>'component', ''), 'unknown') AS component,
    LEFT(COALESCE(NULLIF(properties->>'message', ''), 'unknown'), 120) AS message,
    COUNT(*)::bigint AS occurrences,
    COUNT(DISTINCT device_id)::bigint AS users,
    MAX(kst_date(created_at)) AS last_date
  FROM app_analytics
  WHERE event = 'error'
    AND created_at >= kst_day_start(COALESCE(p_from, DATE '2000-01-01'))
    AND created_at <  kst_day_start(COALESCE(p_to, DATE '9999-12-30') + 1)
  GROUP BY 1, 2
  ORDER BY 3 DESC
  LIMIT GREATEST(p_limit, 1);
$fn$;

-- 9-12) 오류 발생률 추이 (활성 사용자 대비 오류를 겪은 사용자 비율)
CREATE OR REPLACE FUNCTION analytics_error_rate_v2(p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS TABLE (d date, error_events bigint, affected_users bigint, active_users bigint, affected_pct numeric)
LANGUAGE sql STABLE SECURITY INVOKER
AS $fn$
  WITH b AS (
    SELECT COALESCE(p_from, DATE '2000-01-01') AS f, COALESCE(p_to, DATE '9999-12-31') AS t
  ),
  act AS (
    SELECT dd.d, COUNT(*)::bigint AS active_users
    FROM analytics_rollup_device_day dd, b
    WHERE dd.d BETWEEN b.f AND b.t GROUP BY dd.d
  ),
  err AS (
    SELECT e.d, e.events AS error_events, e.users AS affected_users
    FROM analytics_rollup_event_day e, b
    WHERE e.event = 'error' AND e.d BETWEEN b.f AND b.t
  )
  SELECT a.d, COALESCE(er.error_events, 0), COALESCE(er.affected_users, 0), a.active_users,
         ROUND(100.0 * COALESCE(er.affected_users, 0) / NULLIF(a.active_users, 0), 1)
  FROM act a LEFT JOIN err er ON er.d = a.d
  ORDER BY a.d DESC;
$fn$;

-- 버전 정렬 키 — 문자 비교로는 v2.4.10 이 v2.4.9 보다 낮게 온다.
-- 숫자 조각만 뽑아 0 으로 채워 붙인다("2.4.10" → "000002.000004.000010").
CREATE OR REPLACE FUNCTION version_sort_key(v text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT string_agg(lpad(part, 6, '0'), '.' ORDER BY ord)
  FROM unnest(string_to_array(regexp_replace(COALESCE(v, ''), '[^0-9.]', '', 'g'), '.'))
       WITH ORDINALITY AS u(part, ord)
  WHERE part ~ '^[0-9]+$';
$$;

-- 9-13) 버전 잔류 (지금 각 선생님이 실제로 쓰고 있는 버전 — 마지막 접속 기준)
CREATE OR REPLACE FUNCTION analytics_version_adoption_v2(p_active_days int DEFAULT 30)
RETURNS TABLE (app_version text, users bigint, pct numeric, last_seen date, is_current boolean)
LANGUAGE sql STABLE SECURITY INVOKER
AS $fn$
  WITH recent AS (
    SELECT app_version, device_id, last_date
    FROM analytics_rollup_device_profile
    WHERE last_date >= kst_date(now()) - GREATEST(p_active_days, 1)
  ),
  latest AS (
    SELECT app_version AS v FROM recent WHERE app_version <> 'unknown'
    ORDER BY version_sort_key(app_version) DESC NULLS LAST
    LIMIT 1
  )
  SELECT r.app_version, COUNT(*)::bigint,
         ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0), 1),
         MAX(r.last_date),
         BOOL_OR(r.app_version = (SELECT v FROM latest))
  FROM recent r
  GROUP BY r.app_version
  ORDER BY COUNT(*) DESC;
$fn$;

-- 9-14) 학교급 · 지역 분포 (학교명은 담지 않는다)
CREATE OR REPLACE FUNCTION analytics_school_profile_v2()
RETURNS TABLE (dimension text, label text, users bigint, pct numeric)
LANGUAGE sql STABLE SECURITY INVOKER
AS $fn$
  WITH known AS (
    SELECT school_level, region FROM analytics_rollup_device_profile
    WHERE school_level <> 'unknown' OR region <> 'unknown'
  )
  SELECT 'level', school_level, COUNT(*)::bigint,
         ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0), 1)
  FROM known WHERE school_level <> 'unknown' GROUP BY school_level
  UNION ALL
  SELECT 'region', region, COUNT(*)::bigint,
         ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0), 1)
  FROM known WHERE region <> 'unknown' GROUP BY region
  ORDER BY 1, 3 DESC;
$fn$;

-- 9-15) 세션 길이 (기간)
CREATE OR REPLACE FUNCTION analytics_session_v2(p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS TABLE (d date, sessions bigint, avg_seconds numeric, median_seconds numeric, p90_seconds numeric, max_seconds numeric)
LANGUAGE sql STABLE SECURITY INVOKER
AS $fn$
  SELECT s.d, s.sessions, s.avg_seconds, s.median_seconds, s.p90_seconds, s.max_seconds
  FROM analytics_rollup_session_day s
  WHERE s.d BETWEEN COALESCE(p_from, DATE '2000-01-01') AND COALESCE(p_to, DATE '9999-12-31')
  ORDER BY s.d DESC;
$fn$;

-- 9-16) 이벤트 구성 (앱 안에서 무슨 일이 얼마나 일어나나)
-- 횟수는 롤업 합계로 정확·저렴. 사용자 수만 원본에서 정확히 센다(범위 비교라 색인을 탄다).
-- ★사용자 수를 event IN (…) 상관 서브쿼리로 뽑으면 항목 수만큼 반복 실행된다
--   (운영 실측: 1.5초). 기간 전체를 event 로 한 번에 묶은 뒤 해시 조인한다.
CREATE OR REPLACE FUNCTION analytics_event_breakdown_v2(
  p_from date DEFAULT NULL, p_to date DEFAULT NULL, p_limit int DEFAULT 40
)
RETURNS TABLE (event text, events bigint, users bigint)
LANGUAGE sql STABLE SECURITY INVOKER
AS $fn$
  WITH cnt AS MATERIALIZED (
    SELECT e.event, SUM(e.events)::bigint AS events
    FROM analytics_rollup_event_day e
    WHERE e.d BETWEEN COALESCE(p_from, DATE '2000-01-01') AND COALESCE(p_to, DATE '9999-12-31')
    GROUP BY e.event
    ORDER BY 2 DESC
    LIMIT GREATEST(p_limit, 1)
  ),
  u AS MATERIALIZED (
    SELECT a.event, COUNT(DISTINCT a.device_id)::bigint AS users
    FROM app_analytics a
    WHERE a.created_at >= kst_day_start(COALESCE(p_from, DATE '2000-01-01'))
      AND a.created_at <  kst_day_start(COALESCE(p_to, DATE '9999-12-30') + 1)
    GROUP BY a.event
  )
  SELECT c.event, c.events, COALESCE(u.users, 0)
  FROM cnt c LEFT JOIN u ON u.event = c.event
  ORDER BY c.events DESC;
$fn$;

-- ============================================
-- 10) 권한 — 롤업·함수는 관리자(service_role) 전용.
--     롤업은 materialized view 라 RLS 가 걸리지 않는다. 명시적으로 회수한다.
-- ============================================
DO $$
DECLARE
  obj text;
  fn  record;
BEGIN
  FOREACH obj IN ARRAY ARRAY[
    'analytics_rollup_device_day',
    'analytics_rollup_event_day',
    'analytics_rollup_prop_day',
    'analytics_rollup_device_prop',
    'analytics_rollup_hour_day',
    'analytics_rollup_device_profile',
    'analytics_rollup_error_day',
    'analytics_rollup_device_event',
    'analytics_rollup_session_day',
    'analytics_rollup_meta'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC, anon, authenticated;', obj);
    EXECUTE format('GRANT SELECT ON %I TO service_role;', obj);
  END LOOP;

  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'analytics_overview_v2', 'analytics_daily_v2', 'analytics_weekly_v2',
        'analytics_prop_ranking_v2', 'analytics_adoption_v2', 'analytics_cohort_weekly_v2',
        'analytics_engagement_tiers_v2', 'analytics_churn_v2', 'analytics_rhythm_v2',
        'analytics_onboarding_funnel_v2', 'analytics_error_summary_v2', 'analytics_error_rate_v2',
        'analytics_version_adoption_v2', 'analytics_school_profile_v2', 'analytics_session_v2',
        'analytics_event_breakdown_v2', 'analytics_rollup_status', 'analytics_refresh_rollups'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated;', fn.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role;', fn.sig);
  END LOOP;
END $$;

-- kst_date / kst_day_start 는 순수 계산 함수 — 롤업 정의가 참조하므로 실행 권한만 열어둔다.
GRANT EXECUTE ON FUNCTION kst_date(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION kst_day_start(date) TO service_role;
GRANT EXECUTE ON FUNCTION version_sort_key(text) TO service_role;

-- PostgREST 스키마 캐시 리로드 (새 RPC 즉시 인식)
NOTIFY pgrst, 'reload schema';
