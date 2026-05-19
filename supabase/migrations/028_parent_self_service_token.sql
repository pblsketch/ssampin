-- =====================================================================
-- 028_parent_self_service_token.sql
-- Phase 3 — 학부모 셀프 변경/취소를 위한 token 기반 RPC.
--
-- 1) consultation_bookings 에 token 컬럼 추가 (nullable, unique).
--    - 기존 booking 은 token = NULL → 학부모 셀프 변경 불가 (담임만 변경 가능)
--    - 028 적용 이후 신규 booking 만 token 발급
-- 2) book_consultation_slot 재정의 — INSERT 시 token 생성 + 응답에 포함
-- 3) get_consultation_booking_by_token(p_token) — 본인 예약 조회
-- 4) reschedule_consultation_booking_by_token(p_token, p_new_slot_id) —
--    token 검증 후 기존 reschedule_consultation_booking 동작 위임
-- 5) cancel_consultation_booking_by_token(p_token) — token 검증 후 취소
--
-- 보안: 모든 RPC SECURITY DEFINER + search_path 명시.
-- token = gen_random_uuid()::text (36자 UUID, 128bit 엔트로피, URL-safe).
-- =====================================================================

-- 1) token 컬럼
ALTER TABLE consultation_bookings
  ADD COLUMN IF NOT EXISTS token text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_consultation_bookings_token
  ON consultation_bookings (token)
  WHERE token IS NOT NULL;

-- 2) book_consultation_slot 재정의 — token 발급 추가
CREATE OR REPLACE FUNCTION book_consultation_slot(
  p_schedule_id UUID,
  p_slot_id UUID,
  p_student_number INT,
  p_booker_info TEXT DEFAULT NULL,
  p_method TEXT DEFAULT 'face',
  p_memo TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_booking_id UUID;
  v_token TEXT;
  v_slot_status TEXT;
  v_existing INT;
BEGIN
  -- 슬롯 잠금
  SELECT status INTO v_slot_status
  FROM consultation_slots
  WHERE id = p_slot_id AND schedule_id = p_schedule_id
  FOR UPDATE;

  IF v_slot_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'slot_not_found');
  END IF;

  IF v_slot_status <> 'available' THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_booked');
  END IF;

  -- 중복 예약 방지
  SELECT 1 INTO v_existing
  FROM consultation_bookings
  WHERE schedule_id = p_schedule_id AND student_number = p_student_number
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'student_already_booked');
  END IF;

  -- token 생성 (uuid 형식 — URL-safe, 128bit 엔트로피)
  v_token := gen_random_uuid()::text;

  -- 예약 삽입 (token 포함)
  INSERT INTO consultation_bookings (
    schedule_id, slot_id, student_number,
    booker_info_encrypted, method, memo_encrypted, token
  )
  VALUES (
    p_schedule_id, p_slot_id, p_student_number,
    p_booker_info, p_method, p_memo, v_token
  )
  RETURNING id INTO v_booking_id;

  -- 슬롯 상태 업데이트
  UPDATE consultation_slots SET status = 'booked' WHERE id = p_slot_id;

  RETURN jsonb_build_object(
    'success', true,
    'bookingId', v_booking_id,
    'token', v_token
  );
END;
$$;

-- 3) get_consultation_booking_by_token
--    학부모 페이지가 본인 예약 정보를 가져올 때 사용.
--    booker_info_encrypted 와 memo_encrypted 는 의도적으로 노출 (호출자가 adminKey 로 복호화).
--    실패 시 NULL 반환.
CREATE OR REPLACE FUNCTION get_consultation_booking_by_token(
  p_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row consultation_bookings%ROWTYPE;
  v_slot consultation_slots%ROWTYPE;
BEGIN
  IF p_token IS NULL OR length(p_token) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;

  SELECT * INTO v_row FROM consultation_bookings WHERE token = p_token;
  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  SELECT * INTO v_slot FROM consultation_slots WHERE id = v_row.slot_id;
  IF v_slot.id IS NULL THEN
    -- 슬롯이 사라진 비정상 상태 — booking 만 반환
    RETURN jsonb_build_object(
      'success', true,
      'booking', jsonb_build_object(
        'id', v_row.id,
        'scheduleId', v_row.schedule_id,
        'slotId', v_row.slot_id,
        'studentNumber', v_row.student_number,
        'method', v_row.method,
        'bookerInfoEncrypted', v_row.booker_info_encrypted,
        'memoEncrypted', v_row.memo_encrypted,
        'createdAt', v_row.created_at
      ),
      'slot', NULL
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'booking', jsonb_build_object(
      'id', v_row.id,
      'scheduleId', v_row.schedule_id,
      'slotId', v_row.slot_id,
      'studentNumber', v_row.student_number,
      'method', v_row.method,
      'bookerInfoEncrypted', v_row.booker_info_encrypted,
      'memoEncrypted', v_row.memo_encrypted,
      'createdAt', v_row.created_at
    ),
    'slot', jsonb_build_object(
      'id', v_slot.id,
      'scheduleId', v_slot.schedule_id,
      'date', v_slot.date,
      'startTime', v_slot.start_time,
      'endTime', v_slot.end_time,
      'status', v_slot.status
    )
  );
END;
$$;

-- 4) reschedule_consultation_booking_by_token
--    token 으로 booking 을 조회한 뒤 기존 reschedule_consultation_booking 패턴을 적용.
CREATE OR REPLACE FUNCTION reschedule_consultation_booking_by_token(
  p_token TEXT,
  p_new_slot_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_booking_id UUID;
  v_schedule_id UUID;
  v_old_slot_id UUID;
  v_new_slot_status TEXT;
  v_new_slot_schedule_id UUID;
BEGIN
  IF p_token IS NULL OR length(p_token) = 0 THEN
    RETURN jsonb_build_object('success', false, 'message', '잘못된 접근입니다.');
  END IF;

  -- 1) token 으로 booking 조회 + lock
  SELECT id, schedule_id, slot_id
    INTO v_booking_id, v_schedule_id, v_old_slot_id
  FROM consultation_bookings
  WHERE token = p_token
  FOR UPDATE;

  IF v_booking_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', '예약을 찾을 수 없습니다.');
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
    RETURN jsonb_build_object('success', false, 'message', '대상 시간대를 찾을 수 없습니다.');
  END IF;

  IF v_new_slot_schedule_id <> v_schedule_id THEN
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
   WHERE id = v_booking_id;

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

-- 5) cancel_consultation_booking_by_token
CREATE OR REPLACE FUNCTION cancel_consultation_booking_by_token(
  p_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_booking_id UUID;
  v_slot_id UUID;
BEGIN
  IF p_token IS NULL OR length(p_token) = 0 THEN
    RETURN jsonb_build_object('success', false, 'message', '잘못된 접근입니다.');
  END IF;

  SELECT id, slot_id
    INTO v_booking_id, v_slot_id
  FROM consultation_bookings
  WHERE token = p_token
  FOR UPDATE;

  IF v_booking_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', '예약을 찾을 수 없습니다.');
  END IF;

  -- 예약 삭제
  DELETE FROM consultation_bookings WHERE id = v_booking_id;

  -- 슬롯 복구 (예약 있던 경우만)
  IF v_slot_id IS NOT NULL THEN
    UPDATE consultation_slots SET status = 'available' WHERE id = v_slot_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'message', '예약이 취소되었습니다.');
END;
$$;

-- GRANT — anon 키로 호출 가능 (학부모 페이지가 anon 으로 호출)
GRANT EXECUTE ON FUNCTION get_consultation_booking_by_token(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION reschedule_consultation_booking_by_token(TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cancel_consultation_booking_by_token(TEXT) TO anon, authenticated;
-- book_consultation_slot 은 009 에서 이미 GRANT 됨 (CREATE OR REPLACE 로 권한 유지)
