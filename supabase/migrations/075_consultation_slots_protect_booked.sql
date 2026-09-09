-- =====================================================================
-- 075_consultation_slots_protect_booked.sql
--
-- 예약이 걸린 상담 시간대는 아무나 지우지 못하게 한다.
--
-- 배경:
--   `consultation_bookings` 는 RLS 로 잘 막혀 있다 — anon 이 예약 행을 직접 지우려
--   하면 401 이다(정책이 service_role + INSERT 뿐). 그런데 **자식 표의 연쇄 삭제로
--   그 방어가 우회된다.**
--
--     consultation_bookings.slot_id → consultation_slots  ON DELETE CASCADE
--
--   `consultation_slots` 는 anon 에게 SELECT·INSERT·UPDATE·DELETE 가 열려 있고
--   삭제 정책이 `USING (true)` 다. 그래서 시간대를 지우면 **학부모 예약이 함께
--   사라진다**(운영에서 시험용 행으로 실측: 예약 직접 삭제 401, 시간대 삭제 204 +
--   예약 동반 삭제). 되돌릴 방법이 없는 파괴다.
--
-- 이 마이그레이션이 하는 일:
--   삭제 정책을 "이 시간대에 걸린 **예약 행이 없을 때만**"으로 바꾼다.
--
-- ★ 왜 `status <> 'booked'` 로 하지 않았나
--   같은 표의 UPDATE 가 아직 `USING (true)` 라, 표시를 먼저 'available' 로 바꾼 뒤
--   지우면 그대로 뚫린다. **표시가 아니라 예약 행의 존재**로 판정해야 한다.
--
-- ★ 왜 SECURITY DEFINER 함수를 거치나
--   정책 식은 부르는 사람의 권한으로 실행된다. anon 은 `consultation_bookings` 에
--   SELECT 권한이 없어 정책 안에서 직접 조회하면 권한 오류가 난다.
--   함수는 "예약이 있나/없나" 참거짓만 돌려준다 — 같은 사실이 이미
--   `consultation_slots.status` 로 보이므로 새로 새는 정보는 없다.
--
-- 출시된 앱은 깨지지 않는다 (코드로 확인):
--   - v2.5.0 `replaceSlots` 는 `s.status !== 'booked'` 인 시간대만 지운다.
--   - 예약 취소 RPC 는 예약 행을 **DELETE** 한다(`consultation_bookings` 에는 취소
--     표시 칸 자체가 없다). 그래서 "취소했는데 행이 남아 못 지우는" 경우가 없다.
--   - RLS 로 걸러진 삭제는 오류가 아니라 **0행 삭제**다. 정상 흐름은 그대로 지나간다.
--
-- 남는 것(이 파일 범위 밖):
--   `consultation_slots` 의 UPDATE 는 여전히 `USING (true)` 다. 전 시간대를 차단으로
--   만들거나 예약된 시간대를 되돌리는 훼방이 가능하다. 출시된 앱이 status 를 직접
--   고치므로, 일정에 한 것처럼(ADR-095) 서버 대행으로 옮긴 뒤에야 닫을 수 있다.
--
-- 되돌리기:
--   DROP POLICY consultation_slots_public_delete ON public.consultation_slots;
--   CREATE POLICY consultation_slots_public_delete ON public.consultation_slots
--     FOR DELETE TO public USING (true);
-- =====================================================================

CREATE OR REPLACE FUNCTION public.consultation_slot_has_booking(p_slot_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.consultation_bookings WHERE slot_id = p_slot_id
  )
$$;

COMMENT ON FUNCTION public.consultation_slot_has_booking(uuid) IS
  '이 시간대에 예약 행이 있는지. consultation_slots 의 삭제 정책이 쓴다 — anon 은 consultation_bookings 를 읽을 수 없으므로 정책 안에서 직접 조회할 수 없다.';

REVOKE ALL ON FUNCTION public.consultation_slot_has_booking(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consultation_slot_has_booking(uuid)
  TO anon, authenticated, service_role;

DROP POLICY IF EXISTS consultation_slots_public_delete ON public.consultation_slots;

CREATE POLICY consultation_slots_public_delete
  ON public.consultation_slots
  FOR DELETE
  TO public
  USING (NOT public.consultation_slot_has_booking(id));
