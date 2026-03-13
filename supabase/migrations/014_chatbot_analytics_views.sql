-- ============================================
-- 쌤핀 챗봇 분석 뷰
-- Migration 014: chatbot analytics views
-- ============================================

-- 1. 일별 챗봇 사용 통계
CREATE OR REPLACE VIEW chatbot_daily_stats AS
SELECT
  DATE(created_at AT TIME ZONE 'Asia/Seoul') as date,
  COUNT(*) FILTER (WHERE role = 'user') as user_messages,
  COUNT(*) FILTER (WHERE role = 'assistant') as bot_responses,
  COUNT(DISTINCT session_id) as unique_sessions,
  ROUND(
    COUNT(*) FILTER (WHERE role = 'user')::numeric /
    NULLIF(COUNT(DISTINCT session_id), 0)::numeric, 1
  ) as avg_messages_per_session
FROM ssampin_conversations
GROUP BY DATE(created_at AT TIME ZONE 'Asia/Seoul')
ORDER BY date DESC;

-- 2. 인기 질문 키워드 분석
CREATE OR REPLACE VIEW chatbot_popular_topics AS
SELECT
  keyword,
  COUNT(*) as mention_count,
  COUNT(DISTINCT session_id) as unique_sessions
FROM ssampin_conversations,
  LATERAL (
    SELECT unnest(ARRAY[
      CASE WHEN content ILIKE '%시간표%' THEN '시간표' END,
      CASE WHEN content ILIKE '%좌석%' OR content ILIKE '%자리%' THEN '좌석배치' END,
      CASE WHEN content ILIKE '%위젯%' THEN '위젯' END,
      CASE WHEN content ILIKE '%설정%' THEN '설정' END,
      CASE WHEN content ILIKE '%급식%' THEN '급식' END,
      CASE WHEN content ILIKE '%타이머%' THEN '타이머' END,
      CASE WHEN content ILIKE '%랜덤%' OR content ILIKE '%뽑기%' THEN '랜덤뽑기' END,
      CASE WHEN content ILIKE '%과제%' OR content ILIKE '%수합%' THEN '과제수합' END,
      CASE WHEN content ILIKE '%투표%' THEN '투표' END,
      CASE WHEN content ILIKE '%설문%' THEN '설문' END,
      CASE WHEN content ILIKE '%QR%' OR content ILIKE '%큐알%' THEN 'QR코드' END,
      CASE WHEN content ILIKE '%내보내기%' OR content ILIKE '%엑셀%' OR content ILIKE '%hwp%' THEN '내보내기' END,
      CASE WHEN content ILIKE '%업데이트%' OR content ILIKE '%버전%' THEN '업데이트' END,
      CASE WHEN content ILIKE '%오류%' OR content ILIKE '%안돼%' OR content ILIKE '%안 돼%' OR content ILIKE '%버그%' THEN '오류/버그' END,
      CASE WHEN content ILIKE '%상담%' THEN '상담' END,
      CASE WHEN content ILIKE '%메모%' THEN '메모' END,
      CASE WHEN content ILIKE '%일정%' OR content ILIKE '%캘린더%' THEN '일정' END,
      CASE WHEN content ILIKE '%할 일%' OR content ILIKE '%할일%' OR content ILIKE '%todo%' THEN '할일' END,
      CASE WHEN content ILIKE '%테마%' OR content ILIKE '%다크%' THEN '테마' END,
      CASE WHEN content ILIKE '%PIN%' OR content ILIKE '%잠금%' THEN '보안/PIN' END
    ]) as keyword
  ) t
WHERE role = 'user' AND keyword IS NOT NULL
GROUP BY keyword
ORDER BY mention_count DESC;

-- 3. 에스컬레이션 통계
CREATE OR REPLACE VIEW chatbot_escalation_stats AS
SELECT
  DATE(created_at AT TIME ZONE 'Asia/Seoul') as date,
  type,
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE email_sent = true) as emails_sent
FROM ssampin_escalations
GROUP BY DATE(created_at AT TIME ZONE 'Asia/Seoul'), type
ORDER BY date DESC;

-- 4. 세션별 대화 깊이
CREATE OR REPLACE VIEW chatbot_session_depth AS
SELECT
  session_id,
  COUNT(*) FILTER (WHERE role = 'user') as user_turns,
  COUNT(*) FILTER (WHERE role = 'assistant') as bot_turns,
  MIN(created_at) as started_at,
  MAX(created_at) as ended_at,
  EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at)))::int as duration_seconds
FROM ssampin_conversations
GROUP BY session_id
ORDER BY started_at DESC;

-- 5. 대화 깊이 분포
CREATE OR REPLACE VIEW chatbot_depth_distribution AS
SELECT
  CASE
    WHEN user_turns = 1 THEN '1턴 (단발)'
    WHEN user_turns BETWEEN 2 AND 3 THEN '2-3턴'
    WHEN user_turns BETWEEN 4 AND 6 THEN '4-6턴'
    ELSE '7턴+'
  END as depth_bucket,
  COUNT(*) as session_count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) as pct
FROM (
  SELECT session_id, COUNT(*) FILTER (WHERE role = 'user') as user_turns
  FROM ssampin_conversations
  GROUP BY session_id
) sub
GROUP BY depth_bucket
ORDER BY MIN(user_turns);

-- 6. 최근 에스컬레이션 상세
CREATE OR REPLACE VIEW chatbot_recent_escalations AS
SELECT
  id,
  type,
  summary,
  user_email,
  LEFT(user_message, 200) as user_message_preview,
  email_sent,
  created_at AT TIME ZONE 'Asia/Seoul' as created_at_kst
FROM ssampin_escalations
ORDER BY created_at DESC
LIMIT 50;

-- 7. AI 답변 confidence 분포 (sources 기반)
CREATE OR REPLACE VIEW chatbot_confidence_stats AS
SELECT
  CASE
    WHEN sources IS NULL OR jsonb_array_length(sources) = 0 THEN '소스 없음 (낮음)'
    WHEN jsonb_array_length(sources) = 1 THEN '소스 1개 (보통)'
    WHEN jsonb_array_length(sources) >= 2 THEN '소스 2개+ (높음)'
  END as confidence_level,
  COUNT(*) as response_count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) as pct
FROM ssampin_conversations
WHERE role = 'assistant'
GROUP BY confidence_level
ORDER BY response_count DESC;

-- 권한 부여
GRANT SELECT ON chatbot_daily_stats TO service_role;
GRANT SELECT ON chatbot_popular_topics TO service_role;
GRANT SELECT ON chatbot_escalation_stats TO service_role;
GRANT SELECT ON chatbot_session_depth TO service_role;
GRANT SELECT ON chatbot_depth_distribution TO service_role;
GRANT SELECT ON chatbot_recent_escalations TO service_role;
GRANT SELECT ON chatbot_confidence_stats TO service_role;
