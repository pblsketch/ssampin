-- 009: 상담 예약 테이블

-- 상담 일정 (교사가 생성)
CREATE TABLE IF NOT EXISTS consultation_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('parent', 'student')),
  methods TEXT[] NOT NULL DEFAULT '{"face"}',
  slot_minutes INT NOT NULL DEFAULT 15,
  dates JSONB NOT NULL DEFAULT '[]',
  target_class_name TEXT NOT NULL DEFAULT '',
  target_students JSONB NOT NULL DEFAULT '[]',
  message TEXT,
  admin_key TEXT NOT NULL,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 상담 슬롯 (일정 생성 시 자동 생성)
CREATE TABLE IF NOT EXISTS consultation_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES consultation_schedules(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'booked', 'blocked'))
);

-- 상담 예약 건
CREATE TABLE IF NOT EXISTS consultation_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES consultation_schedules(id) ON DELETE CASCADE,
  slot_id UUID NOT NULL REFERENCES consultation_slots(id) ON DELETE CASCADE,
  student_number INT NOT NULL,
  booker_info_encrypted TEXT,
  method TEXT NOT NULL DEFAULT 'face' CHECK (method IN ('face', 'phone', 'video')),
  memo_encrypted TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (schedule_id, student_number)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_consultation_slots_schedule_id ON consultation_slots(schedule_id);
CREATE INDEX IF NOT EXISTS idx_consultation_bookings_schedule_id ON consultation_bookings(schedule_id);
CREATE INDEX IF NOT EXISTS idx_consultation_bookings_slot_id ON consultation_bookings(slot_id);

-- RLS 정책
ALTER TABLE consultation_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultation_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultation_bookings ENABLE ROW LEVEL SECURITY;

-- 공개 읽기
CREATE POLICY "consultation_schedules_public_read" ON consultation_schedules
  FOR SELECT USING (TRUE);
CREATE POLICY "consultation_slots_public_read" ON consultation_slots
  FOR SELECT USING (TRUE);
CREATE POLICY "consultation_bookings_public_read" ON consultation_bookings
  FOR SELECT USING (TRUE);

-- 공개 삽입 (예약)
CREATE POLICY "consultation_bookings_public_insert" ON consultation_bookings
  FOR INSERT WITH CHECK (TRUE);

-- Service role 전체 권한
CREATE POLICY "consultation_schedules_service_all" ON consultation_schedules
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "consultation_slots_service_all" ON consultation_slots
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "consultation_bookings_service_all" ON consultation_bookings
  FOR ALL USING (auth.role() = 'service_role');

-- 동시 예약 방지 DB 함수
CREATE OR REPLACE FUNCTION book_consultation_slot(
  p_schedule_id UUID,
  p_slot_id UUID,
  p_student_number INT,
  p_booker_info_encrypted TEXT DEFAULT NULL,
  p_method TEXT DEFAULT 'face',
  p_memo_encrypted TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_booking_id UUID;
  v_slot_status TEXT;
BEGIN
  -- 슬롯 잠금 (FOR UPDATE)
  SELECT status INTO v_slot_status
  FROM consultation_slots
  WHERE id = p_slot_id AND schedule_id = p_schedule_id
  FOR UPDATE;

  IF v_slot_status IS NULL THEN
    RAISE EXCEPTION 'Slot not found';
  END IF;

  IF v_slot_status <> 'available' THEN
    RAISE EXCEPTION 'Slot is not available';
  END IF;

  -- 예약 삽입
  INSERT INTO consultation_bookings (schedule_id, slot_id, student_number, booker_info_encrypted, method, memo_encrypted)
  VALUES (p_schedule_id, p_slot_id, p_student_number, p_booker_info_encrypted, p_method, p_memo_encrypted)
  RETURNING id INTO v_booking_id;

  -- 슬롯 상태 업데이트
  UPDATE consultation_slots SET status = 'booked' WHERE id = p_slot_id;

  RETURN v_booking_id;
END;
$$;
