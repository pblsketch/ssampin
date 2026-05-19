-- =====================================================================
-- 026_reschedule_consultation_booking.sql
-- 상담 예약 재배정 (reschedule) 원자적 RPC.
--
-- 호출 예:
--   POST /rest/v1/rpc/reschedule_consultation_booking
--     { p_booking_id, p_new_slot_id, p_schedule_id }
--
-- 동작:
--   1) 기존 booking 행 잠금 + 기존 slot_id 조회
--   2) 새 slot 행 잠금 + status 가 'available' 인지 확인 (아니면 실패)
--   3) booking.slot_id 를 새 slot 으로 PATCH
--   4) 새 slot.status = 'booked', 기존 slot.status = 'available'
--   5) jsonb { success, message } 반환
--
-- FOR UPDATE 잠금으로 동시에 같은 슬롯 재배정 시도 시 race 차단.
-- =====================================================================

CREATE OR REPLACE FUNCTION reschedule_consultation_booking(
  p_booking_id uuid,
  p_new_slot_id uuid,
  p_schedule_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_old_slot_id uuid;
  v_new_slot_status text;
  v_new_slot_schedule_id uuid;
BEGIN
  -- 1) 기존 booking 잠금 + 기존 슬롯 ID 조회
  SELECT slot_id
    INTO v_old_slot_id
  FROM consultation_bookings
  WHERE id = p_booking_id
    AND schedule_id = p_schedule_id
  FOR UPDATE;

  IF v_old_slot_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', '예약을 찾을 수 없습니다.'
    );
  END IF;

  IF v_old_slot_id = p_new_slot_id THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', '이미 선택한 시간대에 예약되어 있습니다.'
    );
  END IF;

  -- 2) 새 슬롯 잠금 + 상태/소속 검증
  SELECT status, schedule_id
    INTO v_new_slot_status, v_new_slot_schedule_id
  FROM consultation_slots
  WHERE id = p_new_slot_id
  FOR UPDATE;

  IF v_new_slot_status IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', '대상 시간대를 찾을 수 없습니다.'
    );
  END IF;

  IF v_new_slot_schedule_id <> p_schedule_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', '다른 상담 일정의 시간대로는 변경할 수 없습니다.'
    );
  END IF;

  IF v_new_slot_status <> 'available' THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', '선택한 시간대는 이미 예약되었거나 차단되었습니다.'
    );
  END IF;

  -- 3) booking.slot_id 갱신
  UPDATE consultation_bookings
     SET slot_id = p_new_slot_id
   WHERE id = p_booking_id;

  -- 4) 슬롯 상태 swap
  UPDATE consultation_slots
     SET status = 'booked'
   WHERE id = p_new_slot_id;

  UPDATE consultation_slots
     SET status = 'available'
   WHERE id = v_old_slot_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', '예약 시간이 변경되었습니다.'
  );
END;
$$;

-- anon 키로 RPC 호출 가능하게 GRANT (기존 RPC 들과 동일 패턴)
GRANT EXECUTE ON FUNCTION reschedule_consultation_booking(uuid, uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION reschedule_consultation_booking(uuid, uuid, uuid) TO authenticated;
