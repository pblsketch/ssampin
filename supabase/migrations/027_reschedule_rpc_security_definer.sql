-- =====================================================================
-- 027_reschedule_rpc_security_definer.sql
-- 026 의 reschedule_consultation_booking 함수를
-- SECURITY INVOKER → SECURITY DEFINER 로 재정의한다.
--
-- 이유:
--   SECURITY INVOKER 로 호출하면 anon 역할 컨텍스트에서 RLS 가 평가된다.
--   anon 은 consultation_bookings 의 SELECT 는 가능하지만,
--   `SELECT ... FOR UPDATE` 처럼 row lock 의도가 있으면 RLS 가
--   UPDATE 정책을 함께 평가해 0 rows 가 반환되며 "예약을 찾을 수 없습니다"
--   분기를 타게 된다.
--
--   기존 book_consultation_slot RPC 도 INSERT 가 RLS 정책을 우회하기 위해
--   동일하게 SECURITY DEFINER 로 작성됨. 본 패치는 그 패턴을 맞춘다.
--
-- 보안 모델:
--   - 담임 워크스테이션은 anon 키로 임의 booking 수정 가능 (기존 cancelBooking
--     REST DELETE 와 동일한 보안 모델 — 변동 없음)
--   - 학부모 셀프 서비스(Phase 3) 는 booking token 으로 별도 RPC 통해 제한
--   - 함수 search_path 를 명시해 권한 상승 우려 차단
-- =====================================================================

CREATE OR REPLACE FUNCTION reschedule_consultation_booking(
  p_booking_id uuid,
  p_new_slot_id uuid,
  p_schedule_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

-- GRANT 는 026 에서 이미 부여됨 (anon/authenticated) — 변동 없음
