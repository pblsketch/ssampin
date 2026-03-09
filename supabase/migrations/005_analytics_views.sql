-- 1. 주간 핵심 지표 요약
CREATE OR REPLACE VIEW analytics_weekly_summary AS
SELECT
  DATE_TRUNC('week', created_at)::date as week_start,
  COUNT(DISTINCT device_id) as weekly_active_users,
  COUNT(*) as total_events,
  COUNT(CASE WHEN event = 'app_open' THEN 1 END) as app_opens,
  COUNT(CASE WHEN event = 'seating_shuffle' THEN 1 END) as seat_shuffles,
  COUNT(CASE WHEN event = 'tool_use' THEN 1 END) as tool_uses,
  COUNT(CASE WHEN event = 'export' THEN 1 END) as exports,
  COUNT(CASE WHEN event = 'onboarding_complete' THEN 1 END) as onboarding_completions,
  COUNT(CASE WHEN event = 'error' THEN 1 END) as errors
FROM app_analytics
GROUP BY DATE_TRUNC('week', created_at)
ORDER BY week_start DESC;

-- 2. 일별 활성 사용자
CREATE OR REPLACE VIEW analytics_daily_active AS
SELECT
  DATE(created_at) as date,
  COUNT(DISTINCT device_id) as dau,
  COUNT(*) as events
FROM app_analytics
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- 3. 도구 사용 순위
CREATE OR REPLACE VIEW analytics_tool_ranking AS
SELECT
  properties->>'tool' as tool_name,
  COUNT(*) as usage_count,
  COUNT(DISTINCT device_id) as unique_users,
  ROUND(COUNT(*)::numeric / NULLIF(COUNT(DISTINCT device_id), 0)::numeric, 1) as avg_per_user
FROM app_analytics
WHERE event = 'tool_use'
GROUP BY properties->>'tool'
ORDER BY usage_count DESC;

-- 4. 내보내기 형식 분포
CREATE OR REPLACE VIEW analytics_export_formats AS
SELECT
  properties->>'format' as format,
  COUNT(*) as count,
  COUNT(DISTINCT device_id) as unique_users
FROM app_analytics
WHERE event = 'export'
GROUP BY properties->>'format'
ORDER BY count DESC;

-- 5. 세션 시간 통계
CREATE OR REPLACE VIEW analytics_session_duration AS
SELECT
  DATE(created_at) as date,
  COUNT(*) as sessions,
  ROUND(AVG((properties->>'sessionDuration')::numeric)) as avg_seconds,
  ROUND(MAX((properties->>'sessionDuration')::numeric)) as max_seconds,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (properties->>'sessionDuration')::numeric)) as median_seconds
FROM app_analytics
WHERE event = 'app_close'
  AND properties->>'sessionDuration' IS NOT NULL
  AND (properties->>'sessionDuration')::numeric > 0
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- VIEW에 대한 service_role 접근 허용
GRANT SELECT ON analytics_weekly_summary TO service_role;
GRANT SELECT ON analytics_daily_active TO service_role;
GRANT SELECT ON analytics_tool_ranking TO service_role;
GRANT SELECT ON analytics_export_formats TO service_role;
GRANT SELECT ON analytics_session_duration TO service_role;
