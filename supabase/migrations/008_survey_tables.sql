-- 008: 설문/체크리스트 테이블
-- surveys: 교사가 생성한 설문 메타데이터 (학생 응답 모드용)
-- survey_responses: 학생 응답 데이터

CREATE TABLE IF NOT EXISTS surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('teacher', 'student')),
  questions JSONB NOT NULL DEFAULT '[]',
  due_date DATE,
  category_color TEXT NOT NULL DEFAULT 'blue',
  admin_key TEXT NOT NULL,
  target_count INT NOT NULL DEFAULT 30,
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS survey_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  student_number INT NOT NULL,
  answers JSONB NOT NULL DEFAULT '[]',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (survey_id, student_number)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_survey_responses_survey_id ON survey_responses(survey_id);

-- RLS 정책
ALTER TABLE surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_responses ENABLE ROW LEVEL SECURITY;

-- surveys: 공개 읽기 (설문 정보 조회)
CREATE POLICY "surveys_public_read" ON surveys
  FOR SELECT USING (TRUE);

-- survey_responses: 공개 읽기 + 공개 삽입
CREATE POLICY "survey_responses_public_read" ON survey_responses
  FOR SELECT USING (TRUE);

CREATE POLICY "survey_responses_public_insert" ON survey_responses
  FOR INSERT WITH CHECK (TRUE);

-- Service role 전체 권한
CREATE POLICY "surveys_service_all" ON surveys
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "survey_responses_service_all" ON survey_responses
  FOR ALL USING (auth.role() = 'service_role');
