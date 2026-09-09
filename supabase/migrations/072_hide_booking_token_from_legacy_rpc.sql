-- =====================================================================
-- 072_hide_booking_token_from_legacy_rpc.sql
--
-- 옛 교사용 조회 RPC 가 학부모의 **본인 확인 토큰**까지 돌려주던 것을 막는다.
--
-- 무엇이 문제였나:
--   `get_consultation_bookings` 는 반환형이 `SETOF consultation_bookings` 였다.
--   표의 행 타입을 그대로 쓰면 **표에 있는 칸이 전부 나간다.** 그 표에는 학부모가
--   자기 예약을 확인·변경·취소할 때 쓰는 토큰 칸이 들어 있다.
--
--   이 함수는 관리 키만 맞으면 열린다. 그런데 그 관리 키는 학부모에게 보내는 예약
--   링크에도 함께 실려 나간다. 그래서 링크를 받은 사람이 같은 일정의 **다른 학부모
--   예약을 취소하거나 시간을 바꿀 수 있는** 상태였다. 유출을 넘어 무결성 문제다.
--
-- 왜 지금 여기서 고치나:
--   원래 이 경로는 anon 실행 권한을 걷어 통째로 닫기로 되어 있다(ADR-095 후속).
--   그 회수는 구버전 앱을 막기 때문에 확산 실측과 오너 승인이 필요하지만, **반환
--   칸을 좁히는 것은 그 비용이 없다** — 앱은 이 함수에서 토큰 칸을 읽은 적이 없고
--   (`BookingPublic` 에 그 칸 자체가 없다) 구버전도 마찬가지다.
--
-- 하지 않는 것:
--   · anon 실행 권한 회수 — 확산 실측·오너 승인 뒤에 별도로 한다.
--   · 유예 기한 검사 추가 — 같은 회차의 몫이다. 지금은 소유자가 있을 때만 거부한다.
--   · `get_survey_responses` 는 그대로 둔다 — 응답 표에는 토큰 칸이 없다.
--
-- 근거: ADR-095 · docs/01-plan/features/consultation-teacher-identity.plan.md §1.1
-- =====================================================================

-- 반환형을 바꾸려면 지웠다 다시 만들어야 한다(CREATE OR REPLACE 로는 못 바꾼다).
-- 인자 목록이 같으므로 부르는 쪽은 아무것도 바꿀 필요가 없다.
DROP FUNCTION IF EXISTS get_consultation_bookings(uuid, text);

CREATE FUNCTION get_consultation_bookings(
  p_schedule_id uuid,
  p_admin_key   text
) RETURNS TABLE (
  -- ★ 칸을 하나씩 적는다. `SETOF <표>` 로 두면 나중에 표에 민감한 칸이 하나 더
  --   생겼을 때 **아무도 모르게 함께 나간다.** 그게 이번 문제의 원인이었다.
  id                    uuid,
  schedule_id           uuid,
  slot_id               uuid,
  student_number        integer,
  booker_info_encrypted text,
  method                text,
  memo_encrypted        text,
  created_at            timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner text;
BEGIN
  SELECT owner_email INTO v_owner
  FROM consultation_schedules
  WHERE consultation_schedules.id = p_schedule_id
    AND admin_key = p_admin_key;

  IF NOT FOUND THEN
    RAISE EXCEPTION '상담 일정의 관리 키가 일치하지 않습니다'
      USING ERRCODE = '42501';
  END IF;

  IF v_owner IS NOT NULL THEN
    RAISE EXCEPTION '이 상담 일정은 만든 선생님의 Google 계정으로만 열 수 있습니다'
      USING ERRCODE = '42501', HINT = 'owner_bound';
  END IF;

  RETURN QUERY
    SELECT b.id, b.schedule_id, b.slot_id, b.student_number,
           b.booker_info_encrypted, b.method, b.memo_encrypted, b.created_at
    FROM consultation_bookings b
    WHERE b.schedule_id = p_schedule_id
    ORDER BY b.student_number ASC;
END $$;

COMMENT ON FUNCTION get_consultation_bookings(uuid, text) IS
  'ADR-095(072): 반환 칸을 명시해 학부모 본인 확인 토큰이 나가지 않게 한다. 소유자가 정해진 일정은 이 옛 경로로 열리지 않는다(HINT=owner_bound).';

-- 지웠다 다시 만들었으므로 실행 권한도 다시 준다(046 과 같은 상태로).
REVOKE ALL ON FUNCTION get_consultation_bookings(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_consultation_bookings(uuid, text) TO anon, authenticated;

-- =====================================================================
-- 되돌리기 — 046 의 정의로 돌아가되 071 의 소유자 검사는 남긴다.
--   DROP FUNCTION IF EXISTS get_consultation_bookings(uuid, text);
--   그리고 071 §4 의 정의(RETURNS SETOF consultation_bookings)를 그대로 실행한 뒤
--   REVOKE ALL … FROM PUBLIC; GRANT EXECUTE … TO anon, authenticated;
--   ★되돌리면 본인 확인 토큰이 다시 나간다. 되돌릴 이유가 거의 없다.
-- =====================================================================
