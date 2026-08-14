-- =====================================================================
-- 046_scoped_read_rpcs.sql
--
-- P0-3 2단계: 상담 예약·설문 응답을 "필요한 만큼만" 돌려주는 RPC 를 만든다.
-- **이 마이그레이션은 순수 추가다.** 기존 정책·권한을 건드리지 않으므로
-- 배포해도 아무것도 깨지지 않는다. 클라이언트 전환(3단계)과 권한 회수(4단계)는 별도.
--
-- 배경 (2026-08-14 실측):
--   공개 anon 키로 아래가 가능했다 — 아무 조건 없이 전 행이 나온다.
--     GET /rest/v1/consultation_bookings   → 256행
--     GET /rest/v1/survey_responses        → 129행
--   특히 survey_responses.answers 는 평문이라 응답 내용이 그대로 읽힌다.
--
--   원인은 `FOR SELECT USING (TRUE)` 정책이다. PostgREST 는 클라이언트가 보낸
--   필터를 신뢰할 뿐이므로, 필터를 빼고 요청하면 전부 나온다. RLS 로는
--   "반드시 schedule_id 로 좁혀 조회하라"를 강제할 수 없다.
--
-- 설계:
--   - 학생·학부모 화면에 필요한 건 "이 학번이 이미 예약/응답했나" **여부뿐**이다.
--     → boolean 만 돌려주는 RPC. 남의 예약 정보는 한 글자도 나가지 않는다.
--   - 교사 화면은 자기 일정/설문의 전체 목록이 필요하다.
--     → `admin_key` 를 대조한 뒤 **그 일정/설문 것만** 돌려주는 RPC.
--
--   반환형은 `SETOF <테이블>` 로 둔다. 컬럼을 하나하나 나열하면 나중에 컬럼이
--   추가·변경될 때 타입 불일치로 조용히 깨지므로, 테이블 행 타입을 그대로 쓴다.
--
-- 왜 잘못된 admin_key 에 빈 배열이 아니라 예외인가:
--   빈 결과로 돌려주면 화면이 "예약 없음"으로 보인다. 바로 이 패턴 때문에
--   2026-05-14 사용자 신고가 있었고(설문), 상담에도 같은 결함이 있어 직전 커밋에서
--   고쳤다. 권한 문제는 반드시 눈에 보이게 실패시킨다.
--   ERRCODE 42501(insufficient_privilege) 은 PostgREST 가 HTTP 403 으로 매핑한다.
--
-- 근거 문서: docs/01-plan/features/collab-privacy-redesign.plan.md
-- =====================================================================

-- ── 1) 학생·학부모용 — 중복 확인 (boolean 만) ────────────────────────

CREATE OR REPLACE FUNCTION has_consultation_booking(
  p_schedule_id   uuid,
  p_student_number int
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM consultation_bookings
    WHERE schedule_id = p_schedule_id
      AND student_number = p_student_number
  );
$$;

COMMENT ON FUNCTION has_consultation_booking(uuid, int) IS
  'P0-3: 이 학번이 해당 상담 일정에 이미 예약했는지 여부만 반환. 예약 내용은 노출하지 않는다.';

CREATE OR REPLACE FUNCTION has_survey_response(
  p_survey_id      uuid,
  p_student_number int
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM survey_responses
    WHERE survey_id = p_survey_id
      AND student_number = p_student_number
  );
$$;

COMMENT ON FUNCTION has_survey_response(uuid, int) IS
  'P0-3: 이 학번이 해당 설문에 이미 응답했는지 여부만 반환. 응답 내용은 노출하지 않는다.';

-- ── 2) 교사용 — admin_key 를 대조한 뒤 해당 건만 ─────────────────────

CREATE OR REPLACE FUNCTION get_consultation_bookings(
  p_schedule_id uuid,
  p_admin_key   text
) RETURNS SETOF consultation_bookings
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM consultation_schedules
    WHERE id = p_schedule_id
      AND admin_key = p_admin_key
  ) THEN
    RAISE EXCEPTION '상담 일정의 관리 키가 일치하지 않습니다'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT * FROM consultation_bookings
    WHERE schedule_id = p_schedule_id
    ORDER BY student_number ASC;
END $$;

COMMENT ON FUNCTION get_consultation_bookings(uuid, text) IS
  'P0-3: admin_key 대조 후 해당 상담 일정의 예약만 반환. 키가 틀리면 빈 결과가 아니라 403 으로 실패시킨다(조용한 "예약 없음" 방지).';

CREATE OR REPLACE FUNCTION get_survey_responses(
  p_survey_id uuid,
  p_admin_key text
) RETURNS SETOF survey_responses
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM surveys
    WHERE id = p_survey_id
      AND admin_key = p_admin_key
  ) THEN
    RAISE EXCEPTION '설문의 관리 키가 일치하지 않습니다'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT * FROM survey_responses
    WHERE survey_id = p_survey_id
    ORDER BY student_number ASC;
END $$;

COMMENT ON FUNCTION get_survey_responses(uuid, text) IS
  'P0-3: admin_key 대조 후 해당 설문의 응답만 반환. 키가 틀리면 403 으로 실패시킨다.';

-- ── 3) 실행 권한 ─────────────────────────────────────────────────────
-- 교사 앱도 anon 키를 쓰므로 anon 에게 EXECUTE 를 준다.
-- 교사용 함수의 실제 방어선은 인자로 받는 admin_key 대조다.

REVOKE ALL ON FUNCTION has_consultation_booking(uuid, int)    FROM PUBLIC;
REVOKE ALL ON FUNCTION has_survey_response(uuid, int)         FROM PUBLIC;
REVOKE ALL ON FUNCTION get_consultation_bookings(uuid, text)  FROM PUBLIC;
REVOKE ALL ON FUNCTION get_survey_responses(uuid, text)       FROM PUBLIC;

GRANT EXECUTE ON FUNCTION has_consultation_booking(uuid, int)   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION has_survey_response(uuid, int)        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_consultation_bookings(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_survey_responses(uuid, text)      TO anon, authenticated;
