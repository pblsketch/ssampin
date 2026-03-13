-- 013_fix_analytics_views.sql
-- 세션 시간 뷰: 이상치 필터링 추가 (8시간 = 28800초 상한)

CREATE OR REPLACE VIEW analytics_session_duration AS
SELECT
  DATE(created_at AT TIME ZONE 'Asia/Seoul') as date,
  COUNT(*) as sessions,
  ROUND(AVG((properties->>'sessionDuration')::numeric)) as avg_seconds,
  ROUND(MAX((properties->>'sessionDuration')::numeric)) as max_seconds,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (properties->>'sessionDuration')::numeric)) as median_seconds
FROM app_analytics
WHERE event = 'app_close'
  AND properties->>'sessionDuration' IS NOT NULL
  AND (properties->>'sessionDuration')::numeric > 5
  AND (properties->>'sessionDuration')::numeric < 28800
GROUP BY DATE(created_at AT TIME ZONE 'Asia/Seoul')
ORDER BY date DESC;

-- 총 고유 사용자 수 뷰
CREATE OR REPLACE VIEW analytics_total_users AS
SELECT
  COUNT(DISTINCT device_id) as total_users,
  COUNT(DISTINCT CASE
    WHEN DATE(created_at AT TIME ZONE 'Asia/Seoul') = CURRENT_DATE AT TIME ZONE 'Asia/Seoul'
    THEN device_id
  END) as today_users
FROM app_analytics;

-- 주간 도구 사용 순위 뷰 (최근 7일)
CREATE OR REPLACE VIEW analytics_tool_ranking_weekly AS
SELECT
  properties->>'tool' as tool_name,
  COUNT(*) as usage_count,
  COUNT(DISTINCT device_id) as unique_users,
  ROUND(COUNT(*)::numeric / NULLIF(COUNT(DISTINCT device_id), 0)::numeric, 1) as avg_per_user
FROM app_analytics
WHERE event = 'tool_use'
  AND created_at >= (now() AT TIME ZONE 'Asia/Seoul' - interval '7 days')
GROUP BY properties->>'tool'
ORDER BY usage_count DESC;

-- 버전별 사용자 분포 뷰 (최근 30일)
CREATE OR REPLACE VIEW analytics_version_distribution AS
SELECT
  app_version,
  COUNT(DISTINCT device_id) as users,
  MAX(created_at) as last_seen
FROM app_analytics
WHERE created_at >= (now() - interval '30 days')
GROUP BY app_version
ORDER BY app_version DESC;

-- 코호트 기반 리텐션 (첫 사용일 기준)
CREATE OR REPLACE VIEW analytics_retention AS
WITH first_seen AS (
  SELECT
    device_id,
    DATE(MIN(created_at) AT TIME ZONE 'Asia/Seoul') as first_date
  FROM app_analytics
  GROUP BY device_id
),
daily_active AS (
  SELECT DISTINCT
    device_id,
    DATE(created_at AT TIME ZONE 'Asia/Seoul') as active_date
  FROM app_analytics
)
SELECT
  f.first_date as cohort_date,
  COUNT(DISTINCT f.device_id) as cohort_size,
  COUNT(DISTINCT CASE WHEN d.active_date = f.first_date + 1 THEN f.device_id END) as day1,
  COUNT(DISTINCT CASE WHEN d.active_date = f.first_date + 3 THEN f.device_id END) as day3,
  COUNT(DISTINCT CASE WHEN d.active_date = f.first_date + 7 THEN f.device_id END) as day7,
  ROUND(100.0 * COUNT(DISTINCT CASE WHEN d.active_date = f.first_date + 1 THEN f.device_id END) / NULLIF(COUNT(DISTINCT f.device_id), 0), 1) as day1_pct,
  ROUND(100.0 * COUNT(DISTINCT CASE WHEN d.active_date = f.first_date + 3 THEN f.device_id END) / NULLIF(COUNT(DISTINCT f.device_id), 0), 1) as day3_pct,
  ROUND(100.0 * COUNT(DISTINCT CASE WHEN d.active_date = f.first_date + 7 THEN f.device_id END) / NULLIF(COUNT(DISTINCT f.device_id), 0), 1) as day7_pct
FROM first_seen f
LEFT JOIN daily_active d ON f.device_id = d.device_id
GROUP BY f.first_date
HAVING COUNT(DISTINCT f.device_id) >= 3
ORDER BY f.first_date DESC;

-- 뷰 권한 부여
GRANT SELECT ON analytics_session_duration TO service_role;
GRANT SELECT ON analytics_total_users TO service_role;
GRANT SELECT ON analytics_tool_ranking_weekly TO service_role;
GRANT SELECT ON analytics_version_distribution TO service_role;
GRANT SELECT ON analytics_retention TO service_role;
