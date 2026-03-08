-- ═══════════════════════════════════════
-- 쌤핀 AI 챗봇 모니터링 쿼리 모음
-- ═══════════════════════════════════════

-- 1. 일별 대화 수 (최근 30일)
SELECT
  DATE(created_at) AS date,
  COUNT(*) FILTER (WHERE role = 'user') AS user_messages,
  COUNT(*) FILTER (WHERE role = 'assistant') AS bot_replies
FROM ssampin_conversations
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- 2. 에스컬레이션 통계 (유형별)
SELECT
  type,
  COUNT(*) AS count,
  COUNT(*) FILTER (WHERE email_sent) AS emails_sent,
  DATE(MIN(created_at)) AS first_date,
  DATE(MAX(created_at)) AS last_date
FROM ssampin_escalations
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY type
ORDER BY count DESC;

-- 3. 가장 많이 질문하는 세션 (남용 감지)
SELECT
  session_id,
  COUNT(*) AS message_count,
  MIN(created_at) AS first_message,
  MAX(created_at) AS last_message
FROM ssampin_conversations
WHERE role = 'user'
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY session_id
HAVING COUNT(*) > 20
ORDER BY message_count DESC;

-- 4. 임베딩 문서 현황
SELECT
  metadata->>'category' AS category,
  COUNT(*) AS chunks,
  MAX(updated_at) AS last_updated
FROM ssampin_docs
GROUP BY metadata->>'category'
ORDER BY chunks DESC;

-- 5. 에스컬레이션 미처리 목록
SELECT
  id,
  type,
  summary,
  user_email,
  created_at
FROM ssampin_escalations
WHERE email_sent = false
ORDER BY created_at DESC
LIMIT 20;

-- 6. 30일 이상 된 대화 로그 정리 (개인정보 보호)
-- ⚠️ 주의: 실행 전 백업 확인
-- DELETE FROM ssampin_conversations
-- WHERE created_at < NOW() - INTERVAL '30 days';

-- 7. 일별 고유 사용자 수
SELECT
  DATE(created_at) AS date,
  COUNT(DISTINCT session_id) AS unique_users
FROM ssampin_conversations
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- 8. Rate limit 현황 (분당 요청 수 확인)
SELECT
  identifier,
  endpoint,
  COUNT(*) AS request_count,
  MIN(requested_at) AS first_request,
  MAX(requested_at) AS last_request
FROM ssampin_rate_limits
WHERE requested_at > NOW() - INTERVAL '1 hour'
GROUP BY identifier, endpoint
HAVING COUNT(*) > 5
ORDER BY request_count DESC;
