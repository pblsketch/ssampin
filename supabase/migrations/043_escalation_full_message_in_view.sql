-- ============================================
-- 043: 에스컬레이션 신고 '전문(全文)'을 admin 뷰에 노출
--
-- 문제: 사용자가 챗봇 "개발자에게 전달"로 보낸 긴 건의(최대 2000자)는
--   ssampin_escalations.user_message 에 온전히 저장돼 있으나, admin 뷰
--   chatbot_recent_escalations 는 LEFT(user_message, 200) (200자 미리보기)만
--   노출한다. 그 결과 /admin/analytics '최근 버그/기능 요청'에서 200자 뒤가
--   잘려 전문을 확인할 수 없었다. (summary 컬럼도 저장 시점에 200자로 잘림.)
--
-- 해결: 기존 컬럼(042)을 모두 보존하면서 전체 본문 user_message 를 추가 노출한다.
--   미리보기(user_message_preview)는 접힌 상태 요약용으로 유지한다.
-- ============================================

-- CREATE OR REPLACE 는 뷰 중간에 컬럼을 끼워넣지 못하므로(위치 기반 매칭 → 컬럼명
-- 변경으로 오인, SQLSTATE 42P16) DROP 후 재생성한다. 이 뷰에 의존하는 DB 객체는 없다
-- (landing REST 조회 전용 leaf 뷰).
DROP VIEW IF EXISTS chatbot_recent_escalations;

CREATE VIEW chatbot_recent_escalations
WITH (security_invoker = true)
AS
SELECT
  id,
  type,
  summary,
  user_email,
  LEFT(user_message, 200) as user_message_preview,
  user_message,
  email_sent,
  created_at AT TIME ZONE 'Asia/Seoul' as created_at_kst,
  session_id,
  conversation_context,
  image_paths
FROM ssampin_escalations
ORDER BY created_at DESC
LIMIT 50;

GRANT SELECT ON chatbot_recent_escalations TO service_role;

-- PostgREST 스키마 캐시 리로드
NOTIFY pgrst, 'reload schema';
