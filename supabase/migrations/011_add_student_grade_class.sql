-- ============================================
-- 학생 학년/반 정보 추가 (수업반 지원)
-- 동아리·고교학점제 등에서 번호가 같은 학생 구분
-- ============================================

-- 1. submissions 테이블: student_grade, student_class 컬럼 추가
ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS student_grade TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS student_class TEXT NOT NULL DEFAULT '';

-- 2. 기존 unique 제약조건 삭제 (assignment_id, student_number)
ALTER TABLE submissions
  DROP CONSTRAINT IF EXISTS submissions_assignment_id_student_number_key;

-- 3. 새 unique 제약조건 (assignment_id, student_grade, student_class, student_number)
ALTER TABLE submissions
  ADD CONSTRAINT submissions_unique_student
  UNIQUE (assignment_id, student_grade, student_class, student_number);
