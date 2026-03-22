-- ============================================
-- 챗봇 테스트 세션 플래그
-- Migration 023: chatbot test session flag
--
-- 테스트/개발 중 발생한 버스트성 세션을 is_test=true로 마킹하고,
-- 모든 챗봇 분석 뷰에서 테스트 세션을 제외한다.
-- ============================================

-- 1. ssampin_conversations에 is_test 컬럼 추가
ALTER TABLE ssampin_conversations ADD COLUMN IF NOT EXISTS is_test boolean DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_ssampin_conversations_is_test ON ssampin_conversations (is_test) WHERE is_test = true;

-- 2. 기존 테스트 세션 마킹
--    버스트 패턴: 10분 이내에 사용자 메시지 5개 이상 전송된 세션
UPDATE ssampin_conversations
SET is_test = true
WHERE session_id IN (
  SELECT session_id
  FROM ssampin_conversations
  WHERE role = 'user'
  GROUP BY session_id
  HAVING COUNT(*) >= 5
    AND EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) < 600
);

-- ============================================
-- 3. 분석 뷰 재생성 (is_test = false 필터 추가)
-- ============================================

-- 3-1. 일별 챗봇 사용 통계 (migration 014)
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
WHERE is_test = false
GROUP BY DATE(created_at AT TIME ZONE 'Asia/Seoul')
ORDER BY date DESC;

-- 3-2. 인기 질문 키워드 분석 (migration 020 버전 — 신규 키워드 포함)
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
      CASE WHEN content ILIKE '%PIN%' OR content ILIKE '%잠금%' THEN '보안/PIN' END,
      -- 신규 추가 키워드
      CASE WHEN content ILIKE '%V3%' OR content ILIKE '%백신%' OR content ILIKE '%안랩%' THEN 'V3/백신' END,
      CASE WHEN content ILIKE '%알약%' THEN '알약' END,
      CASE WHEN content ILIKE '%설치%' AND (content ILIKE '%안%' OR content ILIKE '%오류%' OR content ILIKE '%차단%') THEN '설치문제' END,
      CASE WHEN content ILIKE '%느려%' OR content ILIKE '%느림%' OR content ILIKE '%멈춰%' THEN '성능' END,
      CASE WHEN content ILIKE '%데이터%' AND (content ILIKE '%사라%' OR content ILIKE '%유실%' OR content ILIKE '%복원%') THEN '데이터유실' END,
      CASE WHEN content ILIKE '%동기화%' OR content ILIKE '%구글%드라이브%' THEN '동기화' END,
      CASE WHEN content ILIKE '%백업%' OR content ILIKE '%복원%' THEN '백업/복원' END
    ]) as keyword
  ) t
WHERE role = 'user' AND keyword IS NOT NULL AND is_test = false
GROUP BY keyword
ORDER BY mention_count DESC;

-- 3-3. 세션별 대화 깊이 (migration 014)
CREATE OR REPLACE VIEW chatbot_session_depth AS
SELECT
  session_id,
  COUNT(*) FILTER (WHERE role = 'user') as user_turns,
  COUNT(*) FILTER (WHERE role = 'assistant') as bot_turns,
  MIN(created_at) as started_at,
  MAX(created_at) as ended_at,
  EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at)))::int as duration_seconds
FROM ssampin_conversations
WHERE is_test = false
GROUP BY session_id
ORDER BY started_at DESC;

-- 3-4. 대화 깊이 분포 (migration 014)
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
  WHERE is_test = false
  GROUP BY session_id
) sub
GROUP BY depth_bucket
ORDER BY MIN(user_turns);

-- 3-5. AI 답변 confidence 분포 (migration 014)
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
WHERE role = 'assistant' AND is_test = false
GROUP BY confidence_level
ORDER BY response_count DESC;

-- 3-6. 저신뢰 대화 (migration 020)
CREATE OR REPLACE VIEW chatbot_low_confidence_conversations AS
SELECT
  c_user.session_id,
  c_user.content AS user_question,
  c_bot.content AS bot_response,
  c_bot.sources,
  CASE
    WHEN c_bot.sources IS NULL OR jsonb_array_length(c_bot.sources) = 0 THEN 'no_source'
    WHEN c_bot.content ILIKE '%정보가 없%' OR c_bot.content ILIKE '%모르%' OR c_bot.content ILIKE '%확인이 어%' THEN 'admitted_ignorance'
    WHEN c_bot.content ILIKE '%에스컬레이션%' THEN 'near_escalation'
    ELSE 'low_source'
  END AS gap_type,
  c_user.created_at AT TIME ZONE 'Asia/Seoul' AS asked_at
FROM ssampin_conversations c_user
JOIN ssampin_conversations c_bot
  ON c_user.session_id = c_bot.session_id
  AND c_bot.role = 'assistant'
  AND c_bot.created_at > c_user.created_at
  AND c_bot.created_at < c_user.created_at + INTERVAL '30 seconds'
WHERE c_user.role = 'user'
  AND c_user.is_test = false
  AND (
    c_bot.sources IS NULL
    OR jsonb_array_length(c_bot.sources) = 0
    OR c_bot.content ILIKE '%정보가 없%'
    OR c_bot.content ILIKE '%모르%'
    OR c_bot.content ILIKE '%확인이 어%'
  )
ORDER BY c_user.created_at DESC;

-- 권한 부여
GRANT SELECT ON chatbot_daily_stats TO service_role;
GRANT SELECT ON chatbot_popular_topics TO service_role;
GRANT SELECT ON chatbot_session_depth TO service_role;
GRANT SELECT ON chatbot_depth_distribution TO service_role;
GRANT SELECT ON chatbot_confidence_stats TO service_role;
GRANT SELECT ON chatbot_low_confidence_conversations TO service_role;
