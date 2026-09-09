-- =====================================================================
-- 073_consultation_topic_options.sql
--
-- 상담 주제 선택지 — 교사가 예약 화면에 미리 보여 줄 주제 목록.
--
-- 배경:
--   지금까지 상담 주제는 학부모·학생이 빈 칸에 직접 적는 것뿐이었다.
--   무엇을 적어야 할지 몰라 비워 두는 예약이 많고, 선생님은 상담 직전까지
--   무슨 이야기를 준비해야 하는지 알 수 없었다.
--
-- 이 마이그레이션이 하는 일:
--   consultation_schedules 에 `topic_options` 한 칸을 더한다. 교사가 만든
--   문자열 배열이고, 예약 화면이 체크 목록으로 보여 준다(복수 선택).
--   기존 자유 입력 칸은 그대로 남는다.
--
-- ★ 예약자가 **무엇을 골랐는지**는 여기 저장하지 않는다.
--   고른 결과는 지금까지처럼 `consultation_bookings.memo_encrypted` 안에
--   관리 키로 잠긴 채 들어간다. "학교폭력" 같은 선택은 그 자체로 민감하므로
--   서버가 읽을 수 있는 평문 칸을 새로 만들지 않는다(ADR-060·095 의 연장).
--   담는 모양은 src/domain/rules/consultationTopic.ts 참고.
--
-- ★ 권한 (044 의 교훈):
--   044 가 `REVOKE SELECT ON TABLE` 후 **그 시점의 컬럼 목록만** 다시 GRANT 했다.
--   그래서 이후에 추가되는 컬럼은 anon 이 자동으로 읽지 못한다. 학부모 예약
--   화면은 로그인 없이(anon) 이 칸을 읽어야 하므로 **컬럼 단위 GRANT 를 여기서
--   명시한다.** 071 이 crypto_version·crypto_salt 에 한 것과 같은 방식이다.
--   빠뜨리면 예약 화면의 일정 조회가 통째로 400 이 되어 "일정을 찾을 수 없습니다"
--   가 뜬다 — 화면 코드가 멀쩡해도 그렇다.
--
-- 되돌리기:
--   ALTER TABLE public.consultation_schedules DROP COLUMN topic_options;
--   (GRANT 는 컬럼과 함께 사라진다. 앱·랜딩은 이 칸이 없으면 선택지 없는
--    예전 동작으로 돌아간다 — 없는 칸을 select 하면 400 이므로 랜딩의
--    getSchedulePublic 은 이 칸 없이 한 번 더 시도하는 길을 갖고 있다.)
-- =====================================================================

ALTER TABLE public.consultation_schedules
  ADD COLUMN IF NOT EXISTS topic_options JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.consultation_schedules.topic_options IS
  '교사가 만든 상담 주제 선택지(문자열 배열). 예약 화면이 복수 선택으로 보여 준다. 예약자가 무엇을 골랐는지는 여기가 아니라 consultation_bookings.memo_encrypted 안에 잠겨 들어간다.';

-- 학부모 예약 화면은 로그인 없이 읽는다. 044 이후 추가되는 컬럼은 자동 GRANT 가 없다.
GRANT SELECT (topic_options)
  ON public.consultation_schedules TO anon, authenticated;
