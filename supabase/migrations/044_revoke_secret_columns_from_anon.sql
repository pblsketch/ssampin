-- =====================================================================
-- 044_revoke_secret_columns_from_anon.sql
--
-- P0-1: 익명(anon) 역할이 admin_key / pin_hashes 를 읽지 못하게 막는다.
--
-- 배경 (2026-08-14 실측):
--   공개 anon 키(앱 번들에 포함되어 누구나 볼 수 있다)로 아래가 가능했다.
--     GET /rest/v1/consultation_schedules?select=admin_key  → 186행 전부 반환
--     GET /rest/v1/surveys?select=admin_key                 → 반환
--     GET /rest/v1/surveys?select=pin_hashes                → 반환
--
--   admin_key 는 ①상담 예약의 booker_info_encrypted / memo_encrypted 를 푸는
--   열쇠이면서 ②교사용 관리 키다. 이게 읽히면 학부모 이름·연락처·상담 내용을
--   보호하던 종단간 암호화가 통째로 무의미해진다.
--
-- 원인:
--   consultation_schedules / surveys 에 `FOR SELECT USING (TRUE)` RLS 정책이
--   있는데, **RLS 는 행 단위라 열을 가리지 못한다.** 학부모 화면 코드가
--   select= 목록에서 admin_key 를 빼고 요청하는 것은 방어가 아니라
--   "안 달라고 하는 것"일 뿐이다. 열을 가리는 수단은 컬럼 단위 GRANT 다.
--
-- 방법:
--   테이블 단위 SELECT 권한을 회수하고, **민감 컬럼을 제외한 나머지만**
--   다시 부여한다. 컬럼 목록을 하드코딩하지 않고 information_schema 에서
--   뽑아 쓰므로, 앞으로 안전한 컬럼이 추가되어도 자동으로 포함된다.
--   (새로 추가되는 컬럼이 민감하다면 이 파일의 제외 목록에 넣을 것.)
--
-- 영향 범위 (사전 확인 완료):
--   - `select=*` 를 쓰는 클라이언트 없음 → 와일드카드 조회가 깨질 일 없음
--   - admin_key 를 서버에서 읽는 유일한 코드는
--     ConsultationSupabaseClient.getSchedule() 인데 **호출부가 없는 죽은 코드**다
--     (같은 커밋에서 admin_key 를 select 목록에서 제거)
--   - INSERT 는 `Prefer: return=representation` 을 쓰지 않아 되읽기가 없고,
--     INSERT 권한은 SELECT 권한과 별개라 생성 경로는 영향 없음
--   - pin_hashes 는 학생 화면이 통째로 받아 클라이언트에서 비교하던 것을
--     verify_survey_pin RPC(아래)로 옮긴다
--
-- 남은 문제 (이 마이그레이션 범위 밖 — 계획서 P0-3):
--   consultation_bookings(256행) · survey_responses(129행) 전 행 익명 열람은
--   여전히 가능하다. RPC 로 좁히는 작업은 별도로 진행한다.
--   근거 문서: docs/01-plan/features/collab-privacy-redesign.plan.md
-- =====================================================================

-- ── 1) consultation_schedules — admin_key 차단 ───────────────────────
DO $$
DECLARE
  v_cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'consultation_schedules'
    AND column_name NOT IN ('admin_key');

  IF v_cols IS NULL THEN
    RAISE EXCEPTION 'consultation_schedules 컬럼을 찾지 못했습니다';
  END IF;

  REVOKE SELECT ON public.consultation_schedules FROM anon, authenticated;
  EXECUTE format(
    'GRANT SELECT (%s) ON public.consultation_schedules TO anon, authenticated',
    v_cols
  );
END $$;

-- ── 2) surveys — admin_key + pin_hashes 차단 ─────────────────────────
DO $$
DECLARE
  v_cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'surveys'
    AND column_name NOT IN ('admin_key', 'pin_hashes');

  IF v_cols IS NULL THEN
    RAISE EXCEPTION 'surveys 컬럼을 찾지 못했습니다';
  END IF;

  REVOKE SELECT ON public.surveys FROM anon, authenticated;
  EXECUTE format(
    'GRANT SELECT (%s) ON public.surveys TO anon, authenticated',
    v_cols
  );
END $$;

-- ── 3) 설문 PIN 검증을 서버로 이동 ───────────────────────────────────
-- 기존: 학생 화면이 pin_hashes 전체를 내려받아 클라이언트에서 비교
--       → 익명 누구나 모든 설문의 PIN 해시 목록을 열람 가능
-- 변경: 해시 계산은 그대로 클라이언트에서 하고(원문 PIN 은 서버로 보내지 않는다),
--       비교만 서버가 수행해 boolean 만 돌려준다.
CREATE OR REPLACE FUNCTION verify_survey_pin(
  p_survey_id      uuid,
  p_student_number int,
  p_pin_hash       text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hashes   jsonb;
  v_expected text;
  v_found    boolean;
BEGIN
  SELECT pin_hashes, TRUE INTO v_hashes, v_found
  FROM surveys
  WHERE id = p_survey_id;

  -- 없는 설문 → false (기존 클라이언트 동작과 동일)
  IF v_found IS NOT TRUE THEN
    RETURN FALSE;
  END IF;

  -- PIN 미설정 설문 → 통과 (기존 동작과 동일)
  IF v_hashes IS NULL THEN
    RETURN TRUE;
  END IF;

  v_expected := v_hashes ->> p_student_number::text;

  IF v_expected IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN v_expected = p_pin_hash;
END $$;

REVOKE ALL ON FUNCTION verify_survey_pin(uuid, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION verify_survey_pin(uuid, int, text) TO anon, authenticated;

COMMENT ON FUNCTION verify_survey_pin(uuid, int, text) IS
  'P0-1: 설문 PIN 검증. pin_hashes 를 클라이언트로 내려보내지 않기 위해 비교만 서버에서 수행한다. p_pin_hash 는 클라이언트가 계산한 해시(원문 PIN 아님).';
