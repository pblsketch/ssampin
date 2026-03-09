-- ============================================
-- 제출 방식(submitType) 및 텍스트 제출 지원
-- ============================================

-- 1. assignments 테이블: submit_type 컬럼 추가
--    'file' | 'text' | 'both' (기존 과제는 'file'로 기본값)
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS submit_type TEXT NOT NULL DEFAULT 'file';

-- 2. submissions 테이블: text_content 컬럼 추가
ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS text_content TEXT;

-- 3. submissions 테이블: file_name NULL 허용 (텍스트 전용 제출 시 파일 없음)
ALTER TABLE submissions
  ALTER COLUMN file_name DROP NOT NULL;

-- 4. submissions 테이블: file_size 기본값 0 + NULL 허용
ALTER TABLE submissions
  ALTER COLUMN file_size SET DEFAULT 0,
  ALTER COLUMN file_size DROP NOT NULL;
