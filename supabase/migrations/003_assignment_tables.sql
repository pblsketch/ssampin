-- ============================================
-- 쌤핀 과제수합 데이터베이스 스키마
-- ============================================

-- 1. 과제 정보 (교사가 생성)
CREATE TABLE IF NOT EXISTS assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id TEXT NOT NULL,
  admin_key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  deadline TIMESTAMPTZ NOT NULL,
  target_type TEXT NOT NULL DEFAULT 'class',
  target_name TEXT NOT NULL,
  student_list JSONB NOT NULL,
  drive_folder_id TEXT NOT NULL,
  drive_root_folder_id TEXT,
  file_type_restriction TEXT NOT NULL DEFAULT 'all',
  allow_late BOOLEAN NOT NULL DEFAULT true,
  allow_resubmit BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assignments_teacher
  ON assignments (teacher_id);

-- 2. 제출 기록
CREATE TABLE IF NOT EXISTS submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID REFERENCES assignments(id) ON DELETE CASCADE,
  student_id TEXT,
  student_number INTEGER NOT NULL,
  student_name TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  drive_file_id TEXT,
  is_late BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(assignment_id, student_number)
);

CREATE INDEX IF NOT EXISTS idx_submissions_assignment
  ON submissions (assignment_id);

-- 3. 교사 OAuth 토큰 (AES-256-GCM 암호화)
CREATE TABLE IF NOT EXISTS teacher_tokens (
  teacher_id TEXT PRIMARY KEY,
  encrypted_access_token TEXT NOT NULL,
  access_iv TEXT NOT NULL,
  access_tag TEXT NOT NULL,
  encrypted_refresh_token TEXT NOT NULL,
  refresh_iv TEXT NOT NULL,
  refresh_tag TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. RLS: 모든 테이블 직접 접근 전면 차단
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_all_assignments" ON assignments FOR ALL USING (false);
CREATE POLICY "deny_all_submissions" ON submissions FOR ALL USING (false);
CREATE POLICY "deny_all_teacher_tokens" ON teacher_tokens FOR ALL USING (false);
