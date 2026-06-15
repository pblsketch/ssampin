-- ============================================
-- 038: 기간 파라미터 분석 RPC 함수
--
-- PostgREST 뷰는 파라미터를 받지 못해, 전체기간으로 사전집계되던 지표들이
-- admin 대시보드의 날짜 선택(DateRangePicker)을 반영하지 못했다.
-- 임의 기간 집계가 필요한 8개 지표를 RPC 함수로 제공해 날짜 선택을 반영한다.
--
-- 파라미터: p_from / p_to 는 KST 날짜. NULL = 무제한(전체).
--   필터는 (created_at AT TIME ZONE 'Asia/Seoul')::date 로 KST 일자 기준 포함 비교한다
--   (기존 일별/주간 뷰의 KST 일자 집계와 동일한 기준).
--
-- 보안: 함수는 SECURITY INVOKER(기본), STABLE. admin은 service_role 키로 호출한다.
--   anon/PUBLIC EXECUTE 회수, service_role 에만 EXECUTE 부여(기존 뷰 GRANT 정책과 동일).
-- 기존 뷰는 변경/삭제하지 않는다(레거시 호환 — analytics_tool_ranking 전체기간 등은 그대로 사용).
-- ============================================

-- 1. 도구 사용 순위 (기간)
CREATE OR REPLACE FUNCTION analytics_tool_ranking_range(p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS TABLE (tool_name text, usage_count bigint, unique_users bigint, avg_per_user numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    properties->>'tool' as tool_name,
    COUNT(*) as usage_count,
    COUNT(DISTINCT device_id) as unique_users,
    ROUND(COUNT(*)::numeric / NULLIF(COUNT(DISTINCT device_id), 0)::numeric, 1) as avg_per_user
  FROM app_analytics
  WHERE event = 'tool_use'
    AND (p_from IS NULL OR (created_at AT TIME ZONE 'Asia/Seoul')::date >= p_from)
    AND (p_to IS NULL OR (created_at AT TIME ZONE 'Asia/Seoul')::date <= p_to)
  GROUP BY properties->>'tool'
  ORDER BY usage_count DESC;
$$;

-- 2. 내보내기 형식 (기간)
CREATE OR REPLACE FUNCTION analytics_export_formats_range(p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS TABLE (format text, count bigint, unique_users bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    properties->>'format' as format,
    COUNT(*) as count,
    COUNT(DISTINCT device_id) as unique_users
  FROM app_analytics
  WHERE event = 'export'
    AND (p_from IS NULL OR (created_at AT TIME ZONE 'Asia/Seoul')::date >= p_from)
    AND (p_to IS NULL OR (created_at AT TIME ZONE 'Asia/Seoul')::date <= p_to)
  GROUP BY properties->>'format'
  ORDER BY count DESC;
$$;

-- 3. 버전 분포 (기간) — 기존 뷰는 최근 90일 고정. 함수는 선택 기간을 반영.
CREATE OR REPLACE FUNCTION analytics_version_distribution_range(p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS TABLE (app_version text, users bigint, last_seen timestamptz)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    COALESCE(NULLIF(TRIM(app_version), ''), 'unknown') as app_version,
    COUNT(DISTINCT device_id) as users,
    MAX(created_at) as last_seen
  FROM app_analytics
  WHERE (p_from IS NULL OR (created_at AT TIME ZONE 'Asia/Seoul')::date >= p_from)
    AND (p_to IS NULL OR (created_at AT TIME ZONE 'Asia/Seoul')::date <= p_to)
  GROUP BY COALESCE(NULLIF(TRIM(app_version), ''), 'unknown')
  ORDER BY app_version DESC;
$$;

-- 4. 인기 질문 키워드 (기간) — 키워드 매핑은 migration 014 와 동일.
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
        CASE WHEN content ILIKE '%PIN%' OR content ILIKE '%잠금%' THEN '보안/PIN' END
      ]) as keyword
    ) t
  WHERE role = 'user' AND keyword IS NOT NULL
    AND (p_from IS NULL OR (created_at AT TIME ZONE 'Asia/Seoul')::date >= p_from)
    AND (p_to IS NULL OR (created_at AT TIME ZONE 'Asia/Seoul')::date <= p_to)
  GROUP BY keyword
  ORDER BY mention_count DESC;
$$;

-- 5. 대화 깊이 분포 (기간) — 선택 기간 내 메시지로 세션 턴 수 집계.
CREATE OR REPLACE FUNCTION chatbot_depth_distribution_range(p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS TABLE (depth_bucket text, session_count bigint, pct numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
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
    WHERE (p_from IS NULL OR (created_at AT TIME ZONE 'Asia/Seoul')::date >= p_from)
      AND (p_to IS NULL OR (created_at AT TIME ZONE 'Asia/Seoul')::date <= p_to)
    GROUP BY session_id
  ) sub
  GROUP BY depth_bucket
  ORDER BY MIN(user_turns);
$$;

-- 6. 답변 신뢰도 분포 (기간) — sources 개수 기반.
CREATE OR REPLACE FUNCTION chatbot_confidence_stats_range(p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS TABLE (confidence_level text, response_count bigint, pct numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
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
    AND (p_from IS NULL OR (created_at AT TIME ZONE 'Asia/Seoul')::date >= p_from)
    AND (p_to IS NULL OR (created_at AT TIME ZONE 'Asia/Seoul')::date <= p_to)
  GROUP BY confidence_level
  ORDER BY response_count DESC;
$$;

-- 7. 피드백 해결률 (기간) — 테스트 세션 제외(migration 024 와 동일).
CREATE OR REPLACE FUNCTION chatbot_feedback_stats_range(p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS TABLE (
  resolved_count bigint,
  unresolved_count bigint,
  no_response_count bigint,
  total_count bigint,
  resolution_rate numeric,
  responded_total bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
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
    )
    AND (p_from IS NULL OR (a.created_at AT TIME ZONE 'Asia/Seoul')::date >= p_from)
    AND (p_to IS NULL OR (a.created_at AT TIME ZONE 'Asia/Seoul')::date <= p_to);
$$;

-- 8. 피드백 경유 에스컬레이션 (기간) — 테스트 세션 제외.
CREATE OR REPLACE FUNCTION chatbot_feedback_escalations_range(p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS TABLE (escalation_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT COUNT(*) AS escalation_count
  FROM app_analytics a
  WHERE a.event = 'chatbot_escalate'
    AND NOT EXISTS (
      SELECT 1 FROM ssampin_conversations sc
      WHERE sc.session_id = a.properties->>'sessionId'
        AND sc.is_test = true
    )
    AND (p_from IS NULL OR (a.created_at AT TIME ZONE 'Asia/Seoul')::date >= p_from)
    AND (p_to IS NULL OR (a.created_at AT TIME ZONE 'Asia/Seoul')::date <= p_to);
$$;

-- ── 권한: anon/PUBLIC 회수, service_role 에만 EXECUTE 부여 ──
DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'analytics_tool_ranking_range',
    'analytics_export_formats_range',
    'analytics_version_distribution_range',
    'chatbot_popular_topics_range',
    'chatbot_depth_distribution_range',
    'chatbot_confidence_stats_range',
    'chatbot_feedback_stats_range',
    'chatbot_feedback_escalations_range'
  ]
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I(date, date) FROM PUBLIC;', fn);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I(date, date) FROM anon;', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I(date, date) TO service_role;', fn);
  END LOOP;
END $$;

-- PostgREST 스키마 캐시 리로드 (새 RPC 함수 즉시 인식)
NOTIFY pgrst, 'reload schema';
