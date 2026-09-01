-- ============================================================
-- 065 — 모바일 웹 기록을 데스크톱 지표와 분리한다 (2026-09-01)
--
-- 배경
--   모바일 웹(m.ssampin.com)은 지금까지 통계 코드가 한 줄도 없어서, 관리자 화면의
--   사용자 수·활성 사용자에 **아예 존재하지 않았다.** 이번에 `mobile_app_open` /
--   `mobile_page_view` / `mobile_action` 세 가지를 보내기 시작한다.
--
-- 이 마이그레이션이 푸는 문제
--   활성 사용자(DAU/WAU/MAU)를 세는 롤업은 **이벤트 이름을 가리지 않는다.** 그대로 두면
--   모바일 사용자가 데스크톱 활성 사용자에 섞여 들어가, 지금까지 쌓아 온 추세선이 그날부터
--   끊긴다. "갑자기 사용자가 늘었다"가 실제 성장인지 계측 변경인지 구분할 수 없게 된다.
--
--   그래서 데스크톱 뼈대 롤업 두 개(`device_day`·`device_profile`)에서 `mobile_%` 를 뺀다.
--   데스크톱 숫자는 **이전과 완전히 같게** 유지되고, 모바일은 아래 전용 함수로 따로 본다.
--
-- ⚠️ 적용 방법 — `supabase db push` 를 쓰지 말 것.
--   아직 운영에 적용되지 않은 마이그레이션(060)이 함께 나간다. Management API 로
--   이 파일만 적용하고 `supabase migration repair` 로 이력을 맞춘다.
--
-- ⚠️ 적용 전까지는 모바일 기록이 데스크톱 활성 사용자에 섞인다.
--   앱 배포(모바일 기록 시작)보다 **이 마이그레이션을 먼저** 적용해야 한다.
-- ============================================================

-- ── 1) 기기 × 일자 — 데스크톱만 ──
DROP MATERIALIZED VIEW IF EXISTS analytics_rollup_device_day CASCADE;
CREATE MATERIALIZED VIEW analytics_rollup_device_day AS
SELECT
  device_id,
  kst_date(created_at) AS d,
  COUNT(*)::bigint     AS events
FROM app_analytics
WHERE device_id IS NOT NULL AND device_id <> ''
  AND event NOT LIKE 'mobile\_%'
GROUP BY device_id, kst_date(created_at);

CREATE UNIQUE INDEX idx_rollup_device_day_pk ON analytics_rollup_device_day (device_id, d);
CREATE INDEX idx_rollup_device_day_d ON analytics_rollup_device_day (d);

-- ── 2) 기기 프로필 — 데스크톱만 ──
-- 061 의 정의를 그대로 두고 WHERE 한 줄만 더한다.
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
    AND event NOT LIKE 'mobile\_%'
  GROUP BY device_id
),
last_version AS (
  SELECT DISTINCT ON (device_id)
    device_id,
    COALESCE(NULLIF(TRIM(app_version), ''), 'unknown') AS app_version,
    COALESCE(NULLIF(TRIM(os_info), ''), 'unknown')     AS os_info
  FROM app_analytics
  WHERE device_id IS NOT NULL AND device_id <> ''
    AND event NOT LIKE 'mobile\_%'
  ORDER BY device_id, created_at DESC
),
-- ★`school` CTE 와 `lifespan_days` 를 빠뜨리면 안 된다.
--   `analytics_school_profile_v2()` 가 `school_level`·`region` 을 읽는다 —
--   빠지면 관리자 화면의 "학교급·지역" 카드가 통째로 오류가 된다(실제로 겪었다).
--   `school_set` 은 모바일 이벤트가 아니므로 여기엔 접두사 필터가 필요 없다.
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

-- ── 3) 모바일 전용 요약 ──
-- 데스크톱과 **같은 표에서** 세되, 함수가 달라 섞이지 않는다.
CREATE OR REPLACE FUNCTION analytics_mobile_overview_v2(
  p_from date DEFAULT NULL, p_to date DEFAULT NULL
)
RETURNS TABLE (
  total_users bigint, active_users bigint, new_users bigint,
  total_events bigint, avg_dau numeric, wau bigint, mau bigint
)
LANGUAGE sql STABLE SECURITY INVOKER
AS $fn$
  WITH b AS (
    SELECT COALESCE(p_from, DATE '2000-01-01') AS f,
           COALESCE(p_to,   DATE '9999-12-31') AS t,
           kst_date(now()) AS today
  ),
  m AS MATERIALIZED (
    SELECT device_id, kst_date(created_at) AS d, COUNT(*)::bigint AS events
    FROM app_analytics
    WHERE device_id IS NOT NULL AND device_id <> ''
      AND event LIKE 'mobile\_%'
    GROUP BY device_id, kst_date(created_at)
  ),
  first_seen AS MATERIALIZED (
    SELECT device_id, MIN(d) AS first_date FROM m GROUP BY device_id
  )
  SELECT
    (SELECT COUNT(*)::bigint FROM first_seen),
    (SELECT COUNT(DISTINCT m.device_id)::bigint FROM m, b WHERE m.d BETWEEN b.f AND b.t),
    (SELECT COUNT(*)::bigint FROM first_seen fs, b WHERE fs.first_date BETWEEN b.f AND b.t),
    (SELECT COALESCE(SUM(m.events), 0)::bigint FROM m, b WHERE m.d BETWEEN b.f AND b.t),
    (SELECT ROUND(AVG(c), 1) FROM (
       SELECT m.d, COUNT(*)::bigint AS c FROM m, b WHERE m.d BETWEEN b.f AND b.t GROUP BY m.d
     ) dau),
    (SELECT COUNT(DISTINCT m.device_id)::bigint FROM m, b WHERE m.d > b.today - 7  AND m.d <= b.today),
    (SELECT COUNT(DISTINCT m.device_id)::bigint FROM m, b WHERE m.d > b.today - 30 AND m.d <= b.today);
$fn$;

-- ── 4) 권한 — 061 과 같게 관리자(service_role) 전용 ──
DO $$
DECLARE obj text;
BEGIN
  FOREACH obj IN ARRAY ARRAY['analytics_rollup_device_day', 'analytics_rollup_device_profile']
  LOOP
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC, anon, authenticated;', obj);
    EXECUTE format('GRANT SELECT ON %I TO service_role;', obj);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION analytics_mobile_overview_v2(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION analytics_mobile_overview_v2(date, date) TO service_role;

-- ★따로 REFRESH 를 부르지 않는다.
--   `CREATE MATERIALIZED VIEW ... AS SELECT` 는 기본이 WITH DATA 라 이미 채워진 채로 만들어진다.
--   여기서 `analytics_refresh_rollups()` 를 부르면 손대지 않은 롤업 7개까지 다시 계산해
--   운영에서 55초를 그냥 쓴다(061 주석의 실측값). 30분 주기 갱신이 알아서 이어받는다.
