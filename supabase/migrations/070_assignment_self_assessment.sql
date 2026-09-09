-- 070: 학생 자기평가서 — 과제에 문항을, 제출에 답변을 담는 칸을 만든다.
--
-- 배경: 생기부 근거 3종(교사 관찰 / 학생 과제물과 교사 평가 / 학생 자기평가서) 중 세 번째가
-- 통째로 없었다. 수집은 과제 수합 위에서 한다(ADR-096 결정 1) — 학생이 이미 링크로 들어와
-- 학년·반·번호·이름을 대고 제출하는 통로가 거기 하나뿐이기 때문이다.
--
-- ★번호 주의: 067 은 설문 학생 번호 수정이 이미 가져갔고, 상담 교사 신원 전환 계획이 두 개를
--   더 예약해 두었다(그쪽은 068·069 로 밀린다). 이 파일이 070 인 이유다.
--
-- 되돌리기: 이 파일 맨 아래 주석 블록(별도 .sql 파일로 두지 않는다 — 이유는 그 블록 머리말).
--
-- 성격: **더하기만 한다.** 기존 행은 NULL 이고, 이 칸을 모르는 구버전 앱은 그대로 돈다.
-- 권한 변화 없음 — 두 표는 003 에서 이미 deny-all 이고 엣지 함수(service_role)로만 오간다.

-- 1) 과제에 붙는 문항 정의.
--    모양: [{ "id": "q1", "prompt": "무엇이 궁금했나요?", "slot": "질문", "maxLength": 1000 }, ...]
--    slot 은 앱의 관찰 슬롯 값과 같은 문자열이다(교사 관찰과 학생 성찰을 같은 갈래로 모으려고).
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS self_assessment JSONB;

COMMENT ON COLUMN assignments.self_assessment IS
  '학생 자기평가 문항 정의(JSON 배열). NULL 이면 이 과제는 자기평가를 받지 않는다.';

-- 2) 제출에 붙는 학생 답변.
--    모양: [{ "questionId": "q1", "prompt": "무엇이 궁금했나요?", "slot": "질문", "answer": "..." }, ...]
--    ★prompt 를 답변에도 복사해 둔다. 교사가 나중에 문항을 고치거나 지우면 questionId 만 남은
--      답변은 "무엇에 답한 것인지" 알 수 없게 되고, 근거 창고에 들어간 뒤에는 세특의 출처가
--      맥락을 잃는다. 저장 비용보다 유실 비용이 크다.
ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS self_assessment JSONB;

COMMENT ON COLUMN submissions.self_assessment IS
  '학생이 낸 자기평가 답변(JSON 배열). 답변 시점의 문항 원문·슬롯을 함께 담는다.';

-- 3) 값의 **모양과 개수만** 표에서 한 번 더 막는다.
--    ⚠️ 이 CHECK 이 막는 것은 정확히 둘이다 — 배열인가, 개수가 상한 이하인가.
--    ★상한은 두 표가 다르다: assignments = 6(문항), submissions = 12(쌓이는 답). 아래 ★블록 참고.
--    원소가 객체인지,
--    id·prompt 가 문자열인지, 답변 길이가 1,000자 이하인지는 **안 본다.** `[1,2,3]` 도 통과한다.
--    그 검사는 엣지 함수(`_shared/selfAssessment.ts`)가 한다. 여기 적힌 것 이상을 표가 지켜
--    준다고 믿지 말 것 — 처음엔 "표가 스스로 막는다"고 적었다가 리뷰에서 과장으로 잡혔다.
--    ⚠️ NULL 은 통과시킨다. 기존 행 전부가 NULL 이고, 부재는 위반이 아니다.
ALTER TABLE assignments
  DROP CONSTRAINT IF EXISTS assignments_self_assessment_shape;
ALTER TABLE assignments
  ADD CONSTRAINT assignments_self_assessment_shape CHECK (
    self_assessment IS NULL
    OR (jsonb_typeof(self_assessment) = 'array' AND jsonb_array_length(self_assessment) <= 6)
  );

-- ★제출 쪽 상한은 **12 로 문항 상한(6)보다 넉넉하게** 둔다. 두 칸은 성격이 다르다.
--    · assignments.self_assessment = 교사가 정하는 **문항**. 6 이 진짜 상한이다.
--    · submissions.self_assessment = 문항이 바뀌어 가는 동안 **답이 쌓이는 칸**. 교사가 문항을
--      갈아 끼우면 옛 답 + 새 답이 6 을 넘는데, 그건 위반이 아니라 정상이다.
--    같은 6 을 걸었더니 그 상황에서 upsert 가 통째로 실패해(500) **학생이 방금 쓴 글을 잃는다**.
--    엣지 함수가 자르기는 하지만(정의에 있는 문항 우선), 여유를 두면 자르는 일 자체가 드물어진다.
--    코드 리뷰가 "070 이 아직 미적용인 지금이 가장 싼 시점"이라고 짚어 여기서 갈랐다.
ALTER TABLE submissions
  DROP CONSTRAINT IF EXISTS submissions_self_assessment_shape;
ALTER TABLE submissions
  ADD CONSTRAINT submissions_self_assessment_shape CHECK (
    self_assessment IS NULL
    OR (jsonb_typeof(self_assessment) = 'array' AND jsonb_array_length(self_assessment) <= 12)
  );

-- 4) 자기평가만 받는 과제는 드라이브 폴더가 필요 없다.
--    003 에서 drive_folder_id 가 NOT NULL 이라 "글만 받는 과제"를 만들 수 없었다.
--    ★기존 행은 전부 값이 있으므로 이 완화로 사라지는 데이터는 없다. 되돌릴 때는 빈 문자열을
--      채운 뒤 NOT NULL 을 다시 걸어야 한다(맨 아래 되돌리기 블록 3번).
ALTER TABLE assignments
  ALTER COLUMN drive_folder_id DROP NOT NULL;

COMMENT ON COLUMN assignments.drive_folder_id IS
  '제출 파일을 올릴 구글 드라이브 폴더. 자기평가만 받는 과제(submit_type=selfAssessment)에서는 NULL.';

-- ─────────────────────────────────────────────────────────────────────
-- 되돌리기 (필요할 때 아래 주석을 풀어 그대로 실행)
--
-- ★별도 `.rollback.sql` 파일로 두지 않는다 — 같은 폴더에 두면 `supabase db push` 가 그것까지
--   실행한다. 게다가 파일 이름이 알파벳순으로 정방향보다 **먼저** 오고 판번호도 같아서,
--   최악의 경우 마이그레이션 직후 되돌리기가 돌아 학생 답변 칸이 통째로 사라진다.
--   (067 이 같은 함정을 먼저 겪고 남긴 규칙이다.)
-- ─────────────────────────────────────────────────────────────────────
-- -- 070 되돌리기.
-- --
-- -- ⚠️ 컬럼을 지우면 학생이 낸 자기평가 답변이 사라진다. 근거 창고로 이미 옮긴 것은 교사 PC 에
-- -- 남지만, 아직 안 옮긴 답변은 복구할 수 없다. 앱을 옛 버전으로 되돌린 뒤에만 실행할 것.
-- --
-- -- 1) 지우기 전에 대피시킨다. rollback 은 대개 급할 때 돌리고, 되돌린 판단이 틀렸을 때
-- --    돌아올 길이 있어야 한다. 백업 표는 안정된 뒤 손으로 지운다.
-- --    ★새 표에는 **반드시 잠금 두 줄**을 건다 — `CREATE TABLE AS` 로 만든 표는 RLS 가 안 걸리고
-- --      public 스키마 새 표에는 anon 권한이 기본으로 붙는다. 학생 학년·반·번호와 성찰 원문이
-- --      들어가는 표라, 안 걸면 057~060 에서 몇 주에 걸쳐 막은 구멍이 되돌리기로 다시 열린다.
-- CREATE TABLE IF NOT EXISTS submissions_self_assessment_backup_070 AS
--   SELECT id, assignment_id, student_grade, student_class, student_number, self_assessment
--   FROM submissions WHERE self_assessment IS NOT NULL;
-- ALTER TABLE submissions_self_assessment_backup_070 ENABLE ROW LEVEL SECURITY;
-- REVOKE ALL ON public.submissions_self_assessment_backup_070 FROM anon, authenticated;
--
-- CREATE TABLE IF NOT EXISTS assignments_self_assessment_backup_070 AS
--   SELECT id, title, submit_type, self_assessment
--   FROM assignments WHERE self_assessment IS NOT NULL;
-- ALTER TABLE assignments_self_assessment_backup_070 ENABLE ROW LEVEL SECURITY;
-- REVOKE ALL ON public.assignments_self_assessment_backup_070 FROM anon, authenticated;
--
-- -- 2) 자기평가 전용 과제를 제출 가능한 방식으로 되돌린다.
-- --    ★안 하면 그 과제들은 영원히 제출이 안 되는 상태가 된다 — 옛 학생 화면은 submit_type 이
-- --    'file'|'text'|'both' 뿐이라 'selfAssessment' 를 만나면 입력 칸을 하나도 안 그리고,
-- --    폴더 id 는 빈 문자열이라 파일을 올려도 구글이 거부한다. 겉보기엔 멀쩡한 과제다.
-- UPDATE assignments SET submit_type = 'text' WHERE submit_type = 'selfAssessment';
--
-- -- 3) drive_folder_id NOT NULL 복원. 폴더 없는 과제는 지우지 않고 빈 문자열로 채운다 —
-- --    제출 기록까지 CASCADE 로 날리는 것보다 낫다.
-- UPDATE assignments SET drive_folder_id = '' WHERE drive_folder_id IS NULL;
-- ALTER TABLE assignments ALTER COLUMN drive_folder_id SET NOT NULL;
--
-- -- 4) 제약과 컬럼 제거.
-- ALTER TABLE assignments DROP CONSTRAINT IF EXISTS assignments_self_assessment_shape;
-- ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_self_assessment_shape;
-- ALTER TABLE assignments DROP COLUMN IF EXISTS self_assessment;
-- ALTER TABLE submissions DROP COLUMN IF EXISTS self_assessment;
