-- ============================================
-- 피드백 해결률 뷰에서 테스트 세션 제외
-- Migration 024: exclude test sessions from feedback stats
--
-- chatbot_feedback / chatbot_escalate 이벤트의 sessionId가
-- ssampin_conversations에서 is_test=true인 세션이면 통계에서 제외한다.
-- sessionId가 없는 기존 이벤트는 그대로 포함 (레거시 호환).
-- ============================================

-- 피드백 해결률 통계
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
FROM app_analytics a
WHERE a.event = 'chatbot_feedback'
  AND NOT EXISTS (
    SELECT 1 FROM ssampin_conversations sc
    WHERE sc.session_id = a.properties->>'sessionId'
      AND sc.is_test = true
  );

-- 에스컬레이션 통계
CREATE OR REPLACE VIEW chatbot_feedback_escalations
WITH (security_invoker = true)
AS
SELECT
  COUNT(*) AS escalation_count
FROM app_analytics a
WHERE a.event = 'chatbot_escalate'
  AND NOT EXISTS (
    SELECT 1 FROM ssampin_conversations sc
    WHERE sc.session_id = a.properties->>'sessionId'
      AND sc.is_test = true
  );
