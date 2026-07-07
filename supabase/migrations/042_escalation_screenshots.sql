-- ============================================
-- 042: 에스컬레이션(버그신고) 스크린샷 저장
--
-- 사용자가 챗봇 "개발자에게 전달"(버그 신고 등)에서 첨부한 스크린샷을
-- ssampin-escalate 가 지금까지 받기만 하고 저장하지 않아, 관리자가
-- /admin/analytics 에서 확인할 수 없었다. 이미지 저장소 + 참조 컬럼을 추가한다.
-- 030 의 signature-templates 버킷과 동일 패턴(private + service_role only).
-- ============================================

-- 1) Storage bucket — 이미지당 5MB(클라이언트 imageUtils.ts MAX_FILE_SIZE 와 동일), 이미지 전용
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'escalation-screenshots',
  'escalation-screenshots',
  false,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

-- 2) RLS — service_role only (anon / authenticated 직접 차단)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'escalation_screenshots_service_all'
  ) THEN
    CREATE POLICY "escalation_screenshots_service_all" ON storage.objects
      FOR ALL USING (bucket_id = 'escalation-screenshots' AND auth.role() = 'service_role')
      WITH CHECK (bucket_id = 'escalation-screenshots' AND auth.role() = 'service_role');
  END IF;
END $$;

-- 3) ssampin_escalations 에 첨부 스크린샷의 storage 경로 배열 컬럼 추가
ALTER TABLE ssampin_escalations
  ADD COLUMN IF NOT EXISTS image_paths text[];

COMMENT ON COLUMN ssampin_escalations.image_paths
  IS '버그 신고 등에 첨부된 스크린샷의 escalation-screenshots 버킷 내 경로 배열 (없으면 NULL).';

-- 4) 최근 에스컬레이션 뷰에 image_paths 노출 (039 재정의 + 컬럼 추가)
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
  conversation_context,
  image_paths
FROM ssampin_escalations
ORDER BY created_at DESC
LIMIT 50;

GRANT SELECT ON chatbot_recent_escalations TO service_role;

-- PostgREST 스키마 캐시 리로드
NOTIFY pgrst, 'reload schema';
