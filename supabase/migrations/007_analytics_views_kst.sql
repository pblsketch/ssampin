-- 007: Analytics 뷰 타임존 수정 (UTC → KST)
-- 모든 날짜 집계를 한국 시간(Asia/Seoul, UTC+9) 기준으로 변경

-- 1. 일별 활성 사용자 (KST 기준)
CREATE OR REPLACE VIEW analytics_daily_active AS
SELECT
  DATE(created_at AT TIME ZONE 'Asia/Seoul') as date,
  COUNT(DISTINCT device_id) as dau,
  COUNT(*) as events
FROM app_analytics
GROUP BY DATE(created_at AT TIME ZONE 'Asia/Seoul')
ORDER BY date DESC;

-- 2. 주간 핵심 지표 요약 (KST 기준)
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

-- 3. 세션 시간 통계 (KST 기준)
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
  AND (properties->>'sessionDuration')::numeric > 0
GROUP BY DATE(created_at AT TIME ZONE 'Asia/Seoul')
ORDER BY date DESC;

-- 도구 사용 순위 / 내보내기 형식은 날짜 집계가 없으므로 변경 불필요
-- analytics_tool_ranking: OK (날짜 무관)
-- analytics_export_formats: OK (날짜 무관)
