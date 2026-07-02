-- =====================================================================
-- 041_consultation_link_expiry.sql
-- 상담 예약 링크 만료(마감) 기능.
--
-- 배경: 담임이 "보관"해도 학부모 예약 링크가 닫히지 않고, 시점 기반
--       자동 만료도 없었다. 서버에 두 개의 "닫힘" 신호를 추가한다.
--
-- 1) consultation_schedules 에 closed_at / expires_at 컬럼 추가 (둘 다 nullable).
--    - closed_at  : 담임이 수동으로 마감한 시각 (NULL = 마감 안 됨)
--    - expires_at : 자동 만료 시각 (NULL = 자동 만료 없음)
-- 2) book_consultation_slot 재정의(CREATE OR REPLACE) — 슬롯 잠금 전에
--    스케줄의 마감 여부를 확인하고, 마감이면 예약을 거부한다(서버 강제).
--
-- 학부모 "마감" 판정식 (landing 페이지와 동일):
--   is_archived = true
--   OR closed_at IS NOT NULL
--   OR (expires_at IS NOT NULL AND expires_at < now())
--
-- is_archived 는 기존처럼 "보관" 의미로 유지한다.
-- book_consultation_slot 은 009→028 에서 이미 CREATE OR REPLACE 이력이 있어
-- 같은 방식으로 덮어쓴다(권한/토큰 로직 보존).
-- =====================================================================

-- 1) 컬럼 추가 (nullable — 기존 행에 영향 없음)
ALTER TABLE consultation_schedules
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

ALTER TABLE consultation_schedules
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- 2) book_consultation_slot 재정의 — 마감/만료 시 예약 거부 추가
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
  v_is_archived BOOLEAN;
  v_closed_at TIMESTAMPTZ;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- 스케줄 마감 여부 확인 (예약을 더 받지 않는 상태면 즉시 거부)
  SELECT is_archived, closed_at, expires_at
    INTO v_is_archived, v_closed_at, v_expires_at
  FROM consultation_schedules
  WHERE id = p_schedule_id;

  IF v_is_archived IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'schedule_not_found');
  END IF;

  IF v_is_archived
     OR v_closed_at IS NOT NULL
     OR (v_expires_at IS NOT NULL AND v_expires_at < now()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'closed');
  END IF;

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

-- book_consultation_slot 은 009 에서 이미 GRANT 됨 (CREATE OR REPLACE 로 권한 유지)
