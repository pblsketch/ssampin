-- 067: 설문 응답 대상 **실제 출석번호 목록**
--
-- 문제(2026-09-08 학생 번호 무결성 검토 D):
--   surveys 에는 `target_count`(인원수)만 있고, 학생 화면은 `1..target_count` 버튼을 그렸다.
--   33번까지 있는 반에서 2명이 결번이면 재학생은 31명 → 32·33번 학생은 **자기 번호가 없어
--   응답을 못 하고**, 빠진 번호는 반대로 남아 아무나 고를 수 있었다. PIN 도 같은 기준이라
--   32·33번에게는 PIN 이 없었다.
--
-- 변경:
--   student_numbers int[] 를 추가한다. 새 설문은 명렬표의 실제 출석번호를 그대로 담는다.
--   NULL 이면 구형 설문이므로 앱·학생 화면이 `1..target_count` 로 되돌아간다(하위 호환).
--
-- ⚠️ 044 가 surveys 의 컬럼 목록을 **그때 있던 것만** anon 에게 GRANT 했다.
--    새 컬럼은 자동으로 안 열리므로 여기서 명시적으로 GRANT 한다.
--    admin_key / pin_hashes 는 계속 닫힌 채로 둔다.

ALTER TABLE surveys
  ADD COLUMN IF NOT EXISTS student_numbers INT[] DEFAULT NULL;

COMMENT ON COLUMN surveys.student_numbers IS
  '응답 가능한 실제 출석번호 목록(오름차순). NULL 이면 구형 설문 → 1..target_count 로 대체.';

-- 학생 화면(anon)이 번호 버튼을 그리려면 읽을 수 있어야 한다.
GRANT SELECT (student_numbers) ON public.surveys TO anon, authenticated;

-- 교사 앱이 설문을 만들 때 이 컬럼을 함께 넣는다(surveys_public_insert 정책은 010 에서 이미 열려 있다).
GRANT INSERT (student_numbers), UPDATE (student_numbers) ON public.surveys TO anon, authenticated;

-- 확인용: 컬럼과 권한이 실제로 붙었는지
DO $$
DECLARE
  v_ok boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.column_privileges
    WHERE table_schema = 'public' AND table_name = 'surveys'
      AND column_name = 'student_numbers' AND grantee = 'anon' AND privilege_type = 'SELECT'
  ) INTO v_ok;
  IF NOT v_ok THEN
    RAISE EXCEPTION '067: anon 이 surveys.student_numbers 를 읽지 못합니다';
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────
-- 되돌리기 (필요할 때 아래 주석을 풀어 그대로 실행)
--
-- ★별도 `.rollback.sql` 파일로 두지 않는다 — 같은 폴더에 두면 파일 이름이 같은 판번호로
--   읽혀 `supabase db push` 가 마이그레이션 **직후 되돌리기까지 실행**한다.
-- ─────────────────────────────────────────────────────────────────────
-- -- 067 되돌리기.
-- --
-- -- 컬럼을 지우면 그 사이에 만든 설문의 "응답 가능 번호"가 사라지고, 학생 화면은 다시
-- -- 1..target_count 로 되돌아간다(결번 뒤 번호 학생이 응답 못 하는 옛 상태). 데이터 손실이므로
-- -- 앱을 옛 버전으로 되돌린 뒤에만 실행할 것.
--
-- REVOKE SELECT (student_numbers), INSERT (student_numbers), UPDATE (student_numbers)
--   ON public.surveys FROM anon, authenticated;
--
-- ALTER TABLE surveys DROP COLUMN IF EXISTS student_numbers;
