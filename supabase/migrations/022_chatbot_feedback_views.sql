-- 챗봇 피드백 해결률 통계 뷰
-- chatbot_feedback 이벤트를 app_analytics에서 집계

CREATE OR REPLACE VIEW chatbot_feedback_stats
WITH (security_invoker = true)
AS
SELECT
  COUNT(*) FILTER (WHERE properties->>'result' = 'resolved') AS resolved_count,
  COUNT(*) FILTER (WHERE properties->>'result' = 'unresolved') AS unresolved_count,
  COUNT(*) FILTER (WHERE properties->>'result' = 'no_response') AS no_response_count,
  COUNT(*) AS total_count,
  CASE
    WHEN COUNT(*) FILTER (WHERE properties->>'result' IN ('resolved', 'unresolved')) > 0
    THEN ROUND(
      COUNT(*) FILTER (WHERE properties->>'result' = 'resolved')::numeric * 100.0
      / COUNT(*) FILTER (WHERE properties->>'result' IN ('resolved', 'unresolved')),
      1
    )
    ELSE 0
  END AS resolution_rate,
  COUNT(*) FILTER (WHERE properties->>'result' = 'resolved')
    + COUNT(*) FILTER (WHERE properties->>'result' = 'unresolved') AS responded_total
FROM app_analytics
WHERE event = 'chatbot_feedback';

-- 챗봇 에스컬레이션(피드백 경유) 통계
CREATE OR REPLACE VIEW chatbot_feedback_escalations
WITH (security_invoker = true)
AS
SELECT
  COUNT(*) AS escalation_count
FROM app_analytics
WHERE event = 'chatbot_escalate';
