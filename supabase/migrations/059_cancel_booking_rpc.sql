-- =====================================================================
-- 059_cancel_booking_rpc.sql
--
-- 교사의 예약 취소를 RPC 로 옮긴다.
-- **이 마이그레이션은 순수 추가다.** 기존 정책·권한을 건드리지 않으므로
-- 배포해도 아무것도 깨지지 않는다. 권한 회수는 060 에서 별도로 한다.
--
-- 왜 필요한가 — 060 의 선행 작업이다:
--   지금 교사 앱은 예약 취소를 이렇게 한다 (ConsultationSupabaseClient.ts:335-385).
--     1) rpc/get_consultation_booking_slot  → slot_id 조회
--     2) DELETE /consultation_bookings?id=eq.<b>
--     3) PATCH  /consultation_slots?id=eq.<s>   status=available
--
--   2) 가 문제다. PostgreSQL 에서 **DELETE 의 WHERE 가 읽는 컬럼에는 SELECT 권한이
--   필요하다.** 060 에서 consultation_bookings 의 SELECT 를 회수하면
--   `WHERE id = ...` 가 id 를 읽지 못해 **예약 취소가 깨진다.**
--   계획서(collab-privacy-redesign.plan.md:176-178)는 "DELETE 는 SELECT 권한과
--   별개"라고 적어뒀는데 정확하지 않다. WHERE 절이 있으면 별개가 아니다.
--
--   SECURITY DEFINER 함수는 소유자 권한으로 돌기 때문에 호출자의 컬럼 권한과 무관하다.
--   → 취소 경로를 함수로 옮기면 060 이 이 기능을 깨지 않는다.
--
-- 덤으로 고쳐지는 것 — 원자성:
--   기존 3단계는 트랜잭션이 아니다. 2) 가 성공하고 3) 이 실패하면 예약은 사라졌는데
--   슬롯은 'booked' 로 남아 **아무도 예약할 수 없는 유령 슬롯**이 된다.
--   함수 안에서는 한 트랜잭션이라 둘 다 되거나 둘 다 안 된다.
--
-- 왜 DELETE ... RETURNING 인가:
--   조회 후 삭제(2단계)가 아니라 한 문장으로 끝낸다. 그 사이에 다른 세션이 같은
--   예약을 지우는 경쟁이 없어지고, 삭제된 행이 없으면 RETURNING 이 NULL 을 준다.
--
-- 오류 구분 (호출부가 사유를 구별할 수 있어야 한다):
--   42501 관리 키 불일치  → PostgREST 가 HTTP 403 으로 매핑
--   P0002 예약 없음       → 이미 취소됐거나 잘못된 id
--
-- 047 의 get_consultation_booking_slot 은 **남겨둔다.** 구버전 앱이 아직 부른다.
-- 060 이후 그 경로는 어차피 DELETE 에서 막히므로, 함수 정리는 나중에 별도로 한다.
--
-- 근거: 보안 조사 문서(저장소 외부 · 비공개). 재현 경로를 이 파일에 옮겨 적지 말 것.
-- =====================================================================

CREATE OR REPLACE FUNCTION cancel_consultation_booking_by_admin(
  p_booking_id  uuid,
  p_schedule_id uuid,
  p_admin_key   text
) RETURNS void
LANGUAGE plpgsql
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

  DELETE FROM consultation_bookings
  WHERE id = p_booking_id
    AND schedule_id = p_schedule_id
  RETURNING slot_id INTO v_slot_id;

  IF v_slot_id IS NULL THEN
    RAISE EXCEPTION '예약을 찾을 수 없습니다'
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE consultation_slots
  SET status = 'available'
  WHERE id = v_slot_id;
END $$;

COMMENT ON FUNCTION cancel_consultation_booking_by_admin(uuid, uuid, text) IS
  'P0-3: admin_key 대조 후 해당 예약 삭제 + 슬롯 available 복구를 한 트랜잭션으로 수행. 키 불일치 42501, 예약 없음 P0002.';

REVOKE ALL ON FUNCTION cancel_consultation_booking_by_admin(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cancel_consultation_booking_by_admin(uuid, uuid, text) TO anon, authenticated;
