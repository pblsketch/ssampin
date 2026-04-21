-- 과제 제출 시 학생이 학년/반/번호 대신 이름만 입력하도록 허용하는 플래그.
-- 전학공처럼 번호 체계가 없는 명단에서 과제 수합 UX를 단순화하기 위함.

ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS identify_by_name BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN assignments.identify_by_name IS
  'true면 학생 제출 폼에서 학년/반/번호 필드 숨김, 이름만으로 매칭. 학생 번호는 서버 저장 시 student_list에서 자동 주입.';
