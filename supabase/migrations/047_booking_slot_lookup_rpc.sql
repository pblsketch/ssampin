-- =====================================================================
-- 047_booking_slot_lookup_rpc.sql
--
-- P0-3 3단계 마무리: 예약 취소 경로에 남아 있던 마지막 직접 SELECT 를 없앤다.
--
-- 배경:
--   cancelBooking 은 삭제 전에 슬롯을 복구하려고 slot_id 를 조회한다.
--     GET /rest/v1/consultation_bookings?id=eq.<b>&schedule_id=eq.<s>&select=id,slot_id
--   046 으로 목록 조회는 RPC 로 옮겼지만 이 한 줄이 남아 있어, 4단계(테이블 SELECT
--   권한 회수)를 하면 예약 취소가 깨진다.
--
-- 설계:
--   admin_key 를 대조한 뒤 그 예약의 slot_id 만 돌려준다.
--   찾지 못하면 NULL 이 아니라 예외로 실패시킨다 — 호출부가 "Booking not found" 와
--   "권한 없음" 을 구분할 수 있어야 하기 때문이다.
--
-- 이 마이그레이션도 순수 추가다. 기존 정책·권한은 건드리지 않는다.
--
-- 근거 문서: docs/01-plan/features/collab-privacy-redesign.plan.md
-- =====================================================================

CREATE OR REPLACE FUNCTION get_consultation_booking_slot(
  p_booking_id  uuid,
  p_schedule_id uuid,
  p_admin_key   text
) RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_slot_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM consultation_schedules
    WHERE id = p_schedule_id
      AND admin_key = p_admin_key
  ) THEN
    RAISE EXCEPTION '상담 일정의 관리 키가 일치하지 않습니다'
      USING ERRCODE = '42501';
  END IF;

  SELECT slot_id INTO v_slot_id
  FROM consultation_bookings
  WHERE id = p_booking_id
    AND schedule_id = p_schedule_id;

  IF v_slot_id IS NULL THEN
    RAISE EXCEPTION '예약을 찾을 수 없습니다'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN v_slot_id;
END $$;

COMMENT ON FUNCTION get_consultation_booking_slot(uuid, uuid, text) IS
  'P0-3: 예약 취소 전 슬롯 복구용 slot_id 조회. admin_key 대조 후 해당 예약만. 없으면 NULL 이 아니라 예외.';

REVOKE ALL ON FUNCTION get_consultation_booking_slot(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_consultation_booking_slot(uuid, uuid, text) TO anon, authenticated;
