-- analytics_daily_active: UTC → KST 기준으로 수정
CREATE OR REPLACE VIEW analytics_daily_active AS
SELECT
  DATE(created_at AT TIME ZONE 'Asia/Seoul') as date,
  COUNT(DISTINCT device_id) as dau,
  COUNT(*) as events
FROM app_analytics
GROUP BY DATE(created_at AT TIME ZONE 'Asia/Seoul')
ORDER BY date DESC;

-- analytics_weekly_summary도 KST로 통일
CREATE OR REPLACE VIEW analytics_weekly_summary AS
SELECT
  DATE_TRUNC('week', created_at AT TIME ZONE 'Asia/Seoul')::date as week_start,
  COUNT(DISTINCT device_id) as weekly_active_users,
  COUNT(*) as total_events,
  COUNT(CASE WHEN event = 'app_open' THEN 1 END) as app_opens,
  COUNT(CASE WHEN event = 'seating_shuffle' THEN 1 END) as seat_shuffles,
  COUNT(CASE WHEN event = 'tool_use' THEN 1 END) as tool_uses,
  COUNT(CASE WHEN event = 'export' THEN 1 END) as exports,
  COUNT(CASE WHEN event = 'onboarding_complete' THEN 1 END) as onboarding_completions,
  COUNT(CASE WHEN event = 'error' THEN 1 END) as errors
FROM app_analytics
GROUP BY DATE_TRUNC('week', created_at AT TIME ZONE 'Asia/Seoul')
ORDER BY week_start DESC;

-- 뷰 권한 재부여
GRANT SELECT ON analytics_daily_active TO service_role;
GRANT SELECT ON analytics_weekly_summary TO service_role;
