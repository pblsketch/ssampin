-- 029: 서명받기 공개 제출 계약
-- - 학교별 Google Docs/Sheets 양식 메타데이터와 매핑을 저장한다.
-- - 공개 사용자는 Edge Function을 통해서만 조회/제출한다.
-- - RLS는 모든 일반 클라이언트 직접 접근을 차단하고 service_role만 허용한다.

CREATE TABLE IF NOT EXISTS signature_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id TEXT NOT NULL,
  admin_key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  template_kind TEXT NOT NULL CHECK (
    template_kind IN ('general-register', 'training-register', 'absence-form', 'notice-form', 'custom')
  ),
  template_source JSONB NOT NULL,
  mapping JSONB NOT NULL,
  access JSONB NOT NULL DEFAULT '{"uniqueLinksEnabled":true,"pinEnabled":false}'::jsonb,
  scope JSONB NOT NULL DEFAULT '{"legalEffect":"none","automaticReminders":false,"strongIdentityRequired":false}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed', 'archived')),
  due_at TIMESTAMPTZ,
  result_file_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS signature_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES signature_requests(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('teacher', 'student', 'parent', 'guardian', 'staff', 'custom')),
  student_number INTEGER,
  class_name TEXT,
  required_signature_kinds TEXT[] NOT NULL DEFAULT ARRAY['recipient'],
  unique_link_token_hash TEXT,
  pin_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (request_id, display_name, student_number)
);

CREATE TABLE IF NOT EXISTS signature_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES signature_requests(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES signature_participants(id) ON DELETE CASCADE,
  signature_kind TEXT NOT NULL CHECK (signature_kind IN ('recipient', 'student', 'parent', 'guardian', 'teacher')),
  signer_name TEXT NOT NULL,
  signature_image_path TEXT NOT NULL,
  signature_image_mime TEXT NOT NULL CHECK (signature_image_mime IN ('image/png', 'image/webp')),
  signature_image_size_bytes INTEGER NOT NULL CHECK (signature_image_size_bytes > 0 AND signature_image_size_bytes <= 1048576),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_hash TEXT,
  user_agent_hash TEXT,
  UNIQUE (request_id, participant_id, signature_kind)
);

CREATE INDEX IF NOT EXISTS idx_signature_requests_teacher
  ON signature_requests (teacher_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_signature_requests_admin
  ON signature_requests (id, admin_key);

CREATE INDEX IF NOT EXISTS idx_signature_participants_request
  ON signature_participants (request_id);

CREATE INDEX IF NOT EXISTS idx_signature_participants_token
  ON signature_participants (request_id, unique_link_token_hash)
  WHERE unique_link_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_signature_submissions_request
  ON signature_submissions (request_id, submitted_at DESC);

ALTER TABLE signature_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE signature_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE signature_submissions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'signature_requests'
      AND policyname = 'signature_requests_service_all'
  ) THEN
    CREATE POLICY "signature_requests_service_all" ON signature_requests
      FOR ALL USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'signature_participants'
      AND policyname = 'signature_participants_service_all'
  ) THEN
    CREATE POLICY "signature_participants_service_all" ON signature_participants
      FOR ALL USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'signature_submissions'
      AND policyname = 'signature_submissions_service_all'
  ) THEN
    CREATE POLICY "signature_submissions_service_all" ON signature_submissions
      FOR ALL USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'signature-images',
  'signature-images',
  false,
  1048576,
  ARRAY['image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 1048576,
  allowed_mime_types = ARRAY['image/png', 'image/webp'];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'signature_images_service_all'
  ) THEN
    CREATE POLICY "signature_images_service_all" ON storage.objects
      FOR ALL USING (bucket_id = 'signature-images' AND auth.role() = 'service_role')
      WITH CHECK (bucket_id = 'signature-images' AND auth.role() = 'service_role');
  END IF;
END $$;

COMMENT ON TABLE signature_requests IS '서명받기 요청 메타데이터. 공개 접근은 Edge Function만 사용한다.';
COMMENT ON COLUMN signature_requests.admin_key IS '교사용 현황 조회/관리용 비밀 키. 공개 응답에 절대 포함하지 않는다.';
COMMENT ON COLUMN signature_participants.unique_link_token_hash IS '개인별 고유 링크 토큰 SHA-256 해시.';
COMMENT ON COLUMN signature_participants.pin_hash IS '선택 PIN SHA-256 해시.';
COMMENT ON COLUMN signature_submissions.signature_image_path IS 'private storage bucket signature-images 내부 경로.';
