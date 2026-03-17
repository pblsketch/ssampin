-- 018: 분석 뷰 개선 (세션 시간, 버전 분포, 리텐션)

-- 1. 세션 시간: app_close 의존 제거 → 이벤트 기반 세션 계산
-- app_close 이벤트가 beforeunload에서 유실되는 문제 해결
CREATE OR REPLACE VIEW analytics_session_duration AS
WITH device_sessions AS (
  SELECT
    device_id,
    DATE(created_at AT TIME ZONE 'Asia/Seoul') as date,
    EXTRACT(EPOCH FROM MAX(created_at) - MIN(created_at)) as duration_seconds
  FROM app_analytics
  GROUP BY device_id, DATE(created_at AT TIME ZONE 'Asia/Seoul')
  HAVING COUNT(*) >= 2
)
SELECT
  date,
  COUNT(*) as sessions,
  ROUND(AVG(duration_seconds)) as avg_seconds,
  ROUND(MAX(duration_seconds)) as max_seconds,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_seconds)) as median_seconds
FROM device_sessions
WHERE duration_seconds > 5 AND duration_seconds < 28800
GROUP BY date
ORDER BY date DESC;

-- 2. 버전 분포: NULL/빈 문자열 처리, 기간 90일로 확대, 사용자 수 순 정렬
CREATE OR REPLACE VIEW analytics_version_distribution AS
SELECT
  COALESCE(NULLIF(TRIM(app_version), ''), 'unknown') as app_version,
  COUNT(DISTINCT device_id) as users,
  MAX(created_at) as last_seen
FROM app_analytics
WHERE created_at >= (now() - interval '90 days')
GROUP BY COALESCE(NULLIF(TRIM(app_version), ''), 'unknown')
ORDER BY app_version DESC;

-- 3. 리텐션: 코호트 최소 인원 3명 → 1명으로 (초기 사용자 적을 때 대응)
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
HAVING COUNT(DISTINCT f.device_id) >= 1
ORDER BY f.first_date DESC;

-- 뷰 권한 재부여
GRANT SELECT ON analytics_session_duration TO service_role;
GRANT SELECT ON analytics_version_distribution TO service_role;
GRANT SELECT ON analytics_retention TO service_role;
