-- ============================================
-- 쌤핀 챗봇 갭 분석 뷰
-- Migration 020: chatbot gap analysis views
-- ============================================

-- 1. 저신뢰 대화 (소스 없음 + hedging 표현 감지)
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
  AND (
    c_bot.sources IS NULL
    OR jsonb_array_length(c_bot.sources) = 0
    OR c_bot.content ILIKE '%정보가 없%'
    OR c_bot.content ILIKE '%모르%'
    OR c_bot.content ILIKE '%확인이 어%'
  )
ORDER BY c_user.created_at DESC;

-- 2. 미답변 토픽 클러스터링
CREATE OR REPLACE VIEW chatbot_unanswered_topics AS
WITH gap_questions AS (
  SELECT user_question, asked_at
  FROM chatbot_low_confidence_conversations
),
keyword_matches AS (
  SELECT
    user_question,
    keyword,
    asked_at
  FROM gap_questions,
  LATERAL (
    SELECT unnest(ARRAY[
      CASE WHEN user_question ILIKE '%설치%' THEN '설치' END,
      CASE WHEN user_question ILIKE '%업데이트%' OR user_question ILIKE '%버전%' THEN '업데이트' END,
      CASE WHEN user_question ILIKE '%V3%' OR user_question ILIKE '%백신%' OR user_question ILIKE '%안랩%' THEN 'V3/백신' END,
      CASE WHEN user_question ILIKE '%알약%' THEN '알약' END,
      CASE WHEN user_question ILIKE '%차단%' OR user_question ILIKE '%경고%' THEN '보안경고' END,
      CASE WHEN user_question ILIKE '%오류%' OR user_question ILIKE '%에러%' OR user_question ILIKE '%안 돼%' OR user_question ILIKE '%안돼%' THEN '오류일반' END,
      CASE WHEN user_question ILIKE '%느려%' OR user_question ILIKE '%느림%' OR user_question ILIKE '%멈춰%' THEN '성능문제' END,
      CASE WHEN user_question ILIKE '%데이터%' OR user_question ILIKE '%사라%' OR user_question ILIKE '%유실%' THEN '데이터유실' END,
      CASE WHEN user_question ILIKE '%NEIS%' OR user_question ILIKE '%나이스%' THEN 'NEIS연동' END,
      CASE WHEN user_question ILIKE '%동기화%' OR user_question ILIKE '%백업%' OR user_question ILIKE '%구글%드라이브%' THEN '동기화/백업' END,
      CASE WHEN user_question ILIKE '%화면%' OR user_question ILIKE '%깨짐%' OR user_question ILIKE '%글자%' THEN '화면깨짐' END,
      CASE WHEN user_question ILIKE '%인쇄%' OR user_question ILIKE '%출력%' THEN '인쇄문제' END,
      CASE WHEN user_question ILIKE '%내보내기%' OR user_question ILIKE '%엑셀%' OR user_question ILIKE '%한글%' THEN '내보내기' END,
      CASE WHEN user_question ILIKE '%시간표%' THEN '시간표' END,
      CASE WHEN user_question ILIKE '%좌석%' OR user_question ILIKE '%자리%' THEN '좌석배치' END,
      CASE WHEN user_question ILIKE '%과제%' OR user_question ILIKE '%수합%' THEN '과제수합' END
    ]) AS keyword
  ) t
  WHERE keyword IS NOT NULL
)
SELECT
  keyword AS topic,
  COUNT(*) AS gap_count,
  COUNT(DISTINCT DATE(asked_at)) AS distinct_days,
  MAX(asked_at) AS last_seen
FROM keyword_matches
GROUP BY keyword
ORDER BY gap_count DESC;

-- 3. 회피 가능했던 에스컬레이션
CREATE OR REPLACE VIEW chatbot_avoidable_escalations AS
SELECT
  e.type,
  e.summary,
  e.user_message,
  e.created_at AT TIME ZONE 'Asia/Seoul' AS escalated_at,
  EXISTS (
    SELECT 1 FROM ssampin_docs d
    WHERE d.metadata->>'category' = 'troubleshoot'
      AND d.content ILIKE '%' || LEFT(REGEXP_REPLACE(e.user_message, '[^가-힣a-zA-Z0-9 ]', '', 'g'), 20) || '%'
  ) AS has_related_doc
FROM ssampin_escalations e
WHERE e.type IN ('bug', 'other')
ORDER BY e.created_at DESC;

-- 4. chatbot_popular_topics 확장 (기존 뷰를 대체)
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
WHERE role = 'user' AND keyword IS NOT NULL
GROUP BY keyword
ORDER BY mention_count DESC;

-- 권한 부여
GRANT SELECT ON chatbot_low_confidence_conversations TO service_role;
GRANT SELECT ON chatbot_unanswered_topics TO service_role;
GRANT SELECT ON chatbot_avoidable_escalations TO service_role;
