-- ============================================
-- 039: 에스컬레이션 대화 맥락 노출 + 인기주제 RPC 키워드 정정
--
-- (1) admin 대시보드 '최근 버그/기능 요청'에서 각 항목의 전체 대화 내용을 볼 수 있도록
--     chatbot_recent_escalations 뷰에 session_id 와 conversation_context 를 추가한다.
--     conversation_context 는 신고 시점에 이미 저장된 대화 맥락(role/content/created_at)이라
--     별도 조회 없이 그대로 노출한다(ssampin-escalate 가 적재).
--
-- (2) migration 038 의 chatbot_popular_topics_range 가 014 의 옛 키워드 목록(20개)을 써서
--     020 에서 확장된 키워드(27개)를 누락했다. 현재 뷰(020)와 동일한 목록으로 정정한다.
-- ============================================

-- (1) 최근 에스컬레이션 뷰 — 기존 컬럼 보존 + session_id, conversation_context 추가
CREATE OR REPLACE VIEW chatbot_recent_escalations
WITH (security_invoker = true)
AS
SELECT
  id,
  type,
  summary,
  user_email,
  LEFT(user_message, 200) as user_message_preview,
  email_sent,
  created_at AT TIME ZONE 'Asia/Seoul' as created_at_kst,
  session_id,
  conversation_context
FROM ssampin_escalations
ORDER BY created_at DESC
LIMIT 50;

GRANT SELECT ON chatbot_recent_escalations TO service_role;

-- (2) 인기 질문 키워드 RPC — 020 확장 목록과 동일하게 정정
CREATE OR REPLACE FUNCTION chatbot_popular_topics_range(p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS TABLE (keyword text, mention_count bigint, unique_sessions bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
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
        -- 020 신규 추가 키워드
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
    AND (p_from IS NULL OR (created_at AT TIME ZONE 'Asia/Seoul')::date >= p_from)
    AND (p_to IS NULL OR (created_at AT TIME ZONE 'Asia/Seoul')::date <= p_to)
  GROUP BY keyword
  ORDER BY mention_count DESC;
$$;

REVOKE EXECUTE ON FUNCTION chatbot_popular_topics_range(date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION chatbot_popular_topics_range(date, date) FROM anon;
GRANT EXECUTE ON FUNCTION chatbot_popular_topics_range(date, date) TO service_role;

-- PostgREST 스키마 캐시 리로드
NOTIFY pgrst, 'reload schema';
