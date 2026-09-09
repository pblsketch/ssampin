-- =====================================================================
-- 071_consultation_owner_identity.sql
--
-- 상담·설문의 교사 명단 조회를 "관리 키 대조"에서 "만든 선생님의 Google 계정 확인"
-- 으로 옮기기 위한 **첫 단계**다. 근거: ADR-095, 계획서 §6 S1.
--
-- 지금 구조의 문제:
--   admin_key 하나가 (가) 예약자 정보를 푸는 열쇠 (나) 교사 신분증 (다) 학부모 링크에
--   실려 나가는 값을 겸한다. 세 역할이 한 값이라, 링크를 받은 사람이 신분증까지 갖는다.
--   더 근본적으로는 **"이 일정을 누가 만들었는가"라는 정보가 표에 아예 없어서**
--   admin_key 말고는 판단 근거가 없었다.
--
-- 이 파일이 하는 일 (넷):
--   1) 소유자 칸(owner_email·owner_set_at)과 유예 만료일(legacy_grace_until)을 만든다.
--      상담 일정 표에는 암호화 판 칸(crypto_version·crypto_salt)도 함께 만든다.
--   2) 소유자가 없는 기존 행에 유예 만료일을 **계산해 박는다**(스냅샷).
--   3) 옛 조회 RPC 2종을 "소유자가 있으면 거부"로 고친다.
--   4) 앱이 전혀 쓰지 않는 anon 권한을 회수한다 — **정책 DROP 과 반드시 짝으로.**
--
-- 이 파일이 하지 않는 일:
--   - **기존 행의 소유자를 채우지 않는다.** 채우면 그게 claim 이고, 서버가 검증하지 않은
--     소유권이 된다(계획서 §2 원칙 1). 소유자는 072 이후에도 "만들 때 서버가 확인한
--     Google 계정"으로만 생긴다.
--   - 앱이 실제로 쓰는 권한(일정 표 UPDATE, 시간대 표 UPDATE/DELETE, 조회 RPC 의
--     anon EXECUTE)은 건드리지 않는다. 그건 교사 쓰기를 엣지 함수로 옮긴 뒤 072 몫이다.
--
-- 학부모·학생 흐름은 하나도 바뀌지 않는다. 이 파일 적용 직후 계획서 §5 의 12종을
-- anon 열쇠로 실제 호출해 전부 성공하는지 확인하고, 하나라도 실패하면 즉시 되돌린다.
--
-- 근거 문서: docs/01-plan/features/consultation-teacher-identity.plan.md,
--            docs/03-decisions/ADR-095.md
--            (측정 원본·재현 조건은 저장소 밖 비공개 작업 폴더에 있다. 여기 옮겨 적지 말 것.)
-- =====================================================================

-- ── 1) 소유자·유예·암호화 판 칸 ──────────────────────────────────────
--
-- owner_email 은 **서버가 Google 에 되물어 확인한** 이메일만 들어간다. 소문자·앞뒤 공백
-- 제거로 정규화한 값을 넣는 것은 엣지 함수(_shared/googleIdentity.ts 의 normalizeEmail)
-- 책임이다. 여기서 CHECK 로 강제하지 않는 이유는, 규칙을 두 곳에 두면 한쪽만 바뀌었을 때
-- 조용히 어긋나기 때문이다. 쓰는 문이 하나(엣지 함수)뿐이라 그 문에서 지킨다.
--
-- legacy_grace_until 의 기본값을 전역 기한으로 둔 이유:
--   072 전까지는 구버전 앱이 anon 권한으로 일정을 계속 만들 수 있다. 그 행은 소유자가
--   없는데 유예일도 비게 되어, 새 앱이 열 때 "기한 없음"이 되어 버린다. 기본값을 전역
--   기한으로 두면 그런 행도 전역 기한까지는 열리고 그 뒤로는 닫힌다.

ALTER TABLE public.consultation_schedules
  ADD COLUMN IF NOT EXISTS owner_email         text,
  ADD COLUMN IF NOT EXISTS owner_set_at        timestamptz,
  ADD COLUMN IF NOT EXISTS legacy_grace_until  date DEFAULT date '2026-11-30',
  ADD COLUMN IF NOT EXISTS crypto_version      smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS crypto_salt         text;

-- 설문은 응답을 암호화하지 않는다(평문). 그래서 암호화 판 칸이 없다.
ALTER TABLE public.surveys
  ADD COLUMN IF NOT EXISTS owner_email         text,
  ADD COLUMN IF NOT EXISTS owner_set_at        timestamptz,
  ADD COLUMN IF NOT EXISTS legacy_grace_until  date DEFAULT date '2026-11-30';

COMMENT ON COLUMN public.consultation_schedules.owner_email IS
  'ADR-095: 이 일정을 만든 선생님의 Google 이메일. 서버가 검증한 값만 들어간다(앱이 보낸 주장은 무시). 비어 있으면 소유자 미정.';
COMMENT ON COLUMN public.consultation_schedules.legacy_grace_until IS
  'ADR-095: 소유자가 없는 일정을 옛 관리 키 방식으로 열 수 있는 마지막 날. 071 시점에 계산해 박은 스냅샷이라 나중에 슬롯을 더해도 늘어나지 않는다.';
COMMENT ON COLUMN public.consultation_schedules.crypto_version IS
  'ADR-095: 예약자 정보 암호화 판(1=고정 소금값, 2=일정별 난수 소금값). 통계·감사용이며 복호화 판정에는 쓰지 않는다 — 판정은 암호문의 v2: 접두사로 한다.';
COMMENT ON COLUMN public.consultation_schedules.crypto_salt IS
  'ADR-095: 판 2 암호화에 쓰는 일정별 난수 소금값. 서버(엣지 함수)가 생성하며 앱이 보낸 값은 무시한다.';
COMMENT ON COLUMN public.surveys.owner_email IS
  'ADR-095: 이 설문을 만든 선생님의 Google 이메일. 서버가 검증한 값만 들어간다.';
COMMENT ON COLUMN public.surveys.legacy_grace_until IS
  'ADR-095: 소유자가 없는 설문을 옛 관리 키 방식으로 열 수 있는 마지막 날(071 시점 스냅샷).';

-- ── 2) 새 칸의 anon 읽기 권한 — 두 칸만, 나머지는 일부러 안 준다 ─────
--
-- 044 가 이 두 표의 SELECT 를 **칸 단위**로 줬다(테이블 단위 권한은 회수됨).
-- 칸 단위 권한은 나중에 추가된 칸에 자동으로 붙지 않는다. 그래서 학부모 화면이 읽어야
-- 하는 칸은 여기서 **명시적으로** 줘야 한다. 안 주면 새 칸을 포함한 조회가 42703/권한
-- 오류로 실패하고, 랜딩은 그 실패를 null 로 삼켜 학부모에게는 "일정이 없습니다"로 보인다.
--
-- 044 처럼 "민감 칸만 빼고 전부 다시 GRANT" 하는 방식을 **쓰지 않는다.** 그렇게 하면
-- owner_email 까지 함께 열려 선생님 개인 이메일이 공개 열쇠로 읽힌다.
--
-- 주는 칸: crypto_version, crypto_salt — 학부모 브라우저가 예약자 정보를 암호화할 때 쓴다.
--          소금값은 비밀이 아니다(설계상 공개되어도 되는 값이다).
-- 안 주는 칸: owner_email(선생님 개인 이메일), owner_set_at, legacy_grace_until.
--          셋 다 학부모 화면이 쓰지 않고, 서버 쪽 판정은 service_role 로 읽으므로
--          이 권한과 무관하다.

GRANT SELECT (crypto_version, crypto_salt)
  ON public.consultation_schedules TO anon, authenticated;

-- ── 3) 유예 만료일 스냅샷 ────────────────────────────────────────────
--
-- 소유자가 없는 행에만 채운다(수용 기준 #14). 값은
--   min(전역 기한 2026-11-30, 그 일정의 마지막 상담일 + 30일)
-- 이고, 날짜를 알 수 없으면 전역 기한만 남는다.
--
-- ★ least() 는 NULL 인수를 **무시한다**(PostgreSQL 동작). 슬롯이 없는 일정이나 마감일이
--   없는 설문에서 두 번째 인수가 NULL 이 되면 결과는 전역 기한이 된다 — 그게 의도한
--   동작이다("날짜가 없으면 전역 기한만"). NULL 을 만나면 전체가 NULL 이 되는 함수로
--   바꾸면 기한 없는 행이 생기므로 그렇게 고치지 말 것.
--
-- ★ 왜 매 조회 재계산이 아니라 스냅샷인가:
--   시간대 표의 anon 수정 권한이 072 까지 남아 있다. 재계산 방식이면 먼 미래 슬롯을
--   하나 끼워 넣는 것만으로 기한이 무한정 밀린다. 박아 두면 그 길이 막힌다.
--   기한은 소유권이 아니므로 이 쓰기는 원칙 1(claim 금지) 위반이 아니다.

UPDATE public.consultation_schedules c
   SET legacy_grace_until = least(
         date '2026-11-30',
         (SELECT max(s.date) FROM public.consultation_slots s WHERE s.schedule_id = c.id) + 30
       )
 WHERE c.owner_email IS NULL;

UPDATE public.surveys
   SET legacy_grace_until = least(date '2026-11-30', due_date + 30)
 WHERE owner_email IS NULL;

-- ── 4) 옛 조회 RPC 2종 — 소유자가 있으면 거부 ────────────────────────
--
-- 이 한 수가 "소유자가 정해진 뒤에는 그 계정으로만 열린다"를 참으로 만든다. 새 문(엣지
-- 함수)만 만들고 옛 문을 열어 두면, 관리 키를 가진 사람이 옛 문으로 그냥 들어온다.
--
-- 구버전 앱이 깨지는가: **일정을 만든 그 기기 기준으로는 안 깨진다.** 구버전은 소유자를
-- 만들 수 없으므로, 구버전이 만든 일정에는 소유자가 없고 이 검사에 걸리지 않는다.
-- 다만 정직하게 적어 두는 예외가 둘 있다.
--   (가) 상담 일정은 클라우드 동기화 대상이라, 새 앱이 만든 일정이 같은 선생님의
--        **구버전 두 번째 기기**로 내려가면 그 기기의 조회는 거부된다.
--   (나) 운영자가 수동으로 소유자를 기입한 경우도 같다(그래서 그 절차는 대상 교사의
--        앱 버전 확인이 선행 조건이다).
--
-- ★ 거부 문구를 기존 "관리 키가 일치하지 않습니다"와 **다르게** 쓴다.
--   src/infrastructure/supabase/supabaseAccessError.ts 가 응답 본문에서 그 문구를 찾아
--   두 경우를 가른다. 같은 문구를 쓰면 구버전이 "이 일정을 만든 기기에서 다시 시도해
--   주세요"라고 안내하는데, 위 (가) 상황에서는 그게 틀린 처방이다. 다른 문구를 쓰면
--   구버전은 "최신 버전으로 업데이트해 주세요"로 떨어지는데 — 그게 맞는 처방이다.
--
-- ★ HINT 에 기계가 읽는 표식(owner_bound)을 싣는다. PostgREST 가 hint 필드로 그대로
--   내려 주므로, 새 앱은 한국어 문구를 문자열로 비교하지 않고 이 표식으로 판별한다
--   (문구를 다듬을 때마다 판별이 깨지는 것을 막는다).

CREATE OR REPLACE FUNCTION get_consultation_bookings(
  p_schedule_id uuid,
  p_admin_key   text
) RETURNS SETOF consultation_bookings
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
  WHERE id = p_schedule_id
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
    SELECT * FROM consultation_bookings
    WHERE schedule_id = p_schedule_id
    ORDER BY student_number ASC;
END $$;

COMMENT ON FUNCTION get_consultation_bookings(uuid, text) IS
  'ADR-095(071): 소유자가 정해진 일정은 이 옛 경로로 열리지 않는다(HINT=owner_bound). 소유자가 없으면 종전대로 admin_key 대조 후 해당 일정의 예약만 반환. 키가 틀리면 빈 결과가 아니라 403 으로 실패시킨다.';

CREATE OR REPLACE FUNCTION get_survey_responses(
  p_survey_id uuid,
  p_admin_key text
) RETURNS SETOF survey_responses
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner text;
BEGIN
  SELECT owner_email INTO v_owner
  FROM surveys
  WHERE id = p_survey_id
    AND admin_key = p_admin_key;

  IF NOT FOUND THEN
    RAISE EXCEPTION '설문의 관리 키가 일치하지 않습니다'
      USING ERRCODE = '42501';
  END IF;

  IF v_owner IS NOT NULL THEN
    RAISE EXCEPTION '이 설문은 만든 선생님의 Google 계정으로만 열 수 있습니다'
      USING ERRCODE = '42501', HINT = 'owner_bound';
  END IF;

  RETURN QUERY
    SELECT * FROM survey_responses
    WHERE survey_id = p_survey_id
    ORDER BY student_number ASC;
END $$;

COMMENT ON FUNCTION get_survey_responses(uuid, text) IS
  'ADR-095(071): 소유자가 정해진 설문은 이 옛 경로로 열리지 않는다(HINT=owner_bound). 소유자가 없으면 종전대로 admin_key 대조 후 해당 설문의 응답만 반환.';

-- ── 5) 앱이 쓰지 않는 anon 권한 회수 — 정책 DROP 과 반드시 짝으로 ────
--
-- 두 방향의 함정이 다 있다.
--   · 정책만 지우고 GRANT 를 남기면 → 요청이 "0행 200" 으로 조용히 성공한 것처럼 보인다(060 교훈).
--   · GRANT 만 걷고 정책을 남기면 → 나중에 누가 GRANT 를 복구했을 때 **조용히 다시 열린다.**
-- 그래서 항상 쌍으로 처리하고, 되돌리기 문구도 쌍으로 적는다(맨 아래 §7).
--
-- 여기서 회수하는 것은 **앱이 한 줄도 쓰지 않는 것뿐**이다(코드 확인 완료).
--   · 설문 표 UPDATE/DELETE — 설문 수정·삭제는 로컬에서만 하고 서버로 보내지 않는다.
--   · 상담 일정 표 DELETE — deleteSchedule 은 로컬 전용이다.
--   · 여섯 표의 TRUNCATE/REFERENCES/TRIGGER — 클라이언트가 쓸 수 있는 권한이 아니다.
-- 앱이 실제로 쓰는 일정 표 UPDATE 와 시간대 표 UPDATE/DELETE 는 **남긴다.**
-- 교사 쓰기를 엣지 함수로 옮긴 뒤 072 에서 같은 방식으로 회수한다.

DROP POLICY IF EXISTS "surveys_public_update"                ON public.surveys;
DROP POLICY IF EXISTS "surveys_public_delete"                ON public.surveys;
DROP POLICY IF EXISTS "consultation_schedules_public_delete" ON public.consultation_schedules;

REVOKE UPDATE, DELETE ON public.surveys               FROM anon, authenticated;
REVOKE DELETE         ON public.consultation_schedules FROM anon, authenticated;

REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.surveys                FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.consultation_schedules FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.consultation_slots     FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.consultation_bookings  FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.survey_responses       FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.short_links            FROM anon, authenticated;

-- ── 6) PUBLIC 실행 권한 정리 5개 — anon 실행은 **반드시 유지** ───────
--
-- 아래 다섯 함수에 PUBLIC EXECUTE 가 남아 있다(028 등에서 REVOKE FROM PUBLIC 누락).
-- 실효 차이는 없지만, 권한 표를 볼 때마다 "이건 왜 열려 있지"를 다시 묻게 되므로 정리한다.
--
-- 🔴 이 다섯 중 넷은 **학부모가 예약·조회·변경·취소할 때 실제로 부르는 함수**다.
--    anon 실행까지 걷으면 그날 예약이 통째로 막힌다. PUBLIC 만 걷고 anon 은 곧바로
--    다시 준다(이미 있어도 무해하다 — 의도를 눈에 보이게 적어 두는 쪽을 택했다).

REVOKE ALL ON FUNCTION book_consultation_slot(uuid, uuid, integer, text, text, text)  FROM PUBLIC;
REVOKE ALL ON FUNCTION get_consultation_booking_by_token(text)                        FROM PUBLIC;
REVOKE ALL ON FUNCTION reschedule_consultation_booking_by_token(text, uuid)           FROM PUBLIC;
REVOKE ALL ON FUNCTION cancel_consultation_booking_by_token(text)                     FROM PUBLIC;
REVOKE ALL ON FUNCTION reschedule_consultation_booking(uuid, uuid, uuid)              FROM PUBLIC;

GRANT EXECUTE ON FUNCTION book_consultation_slot(uuid, uuid, integer, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_consultation_booking_by_token(text)                       TO anon, authenticated;
GRANT EXECUTE ON FUNCTION reschedule_consultation_booking_by_token(text, uuid)          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cancel_consultation_booking_by_token(text)                    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION reschedule_consultation_booking(uuid, uuid, uuid)             TO anon, authenticated;

-- ── 7) 스키마 캐시 새로 고침 ─────────────────────────────────────────
--
-- PostgREST 는 표에 어떤 칸이 있는지를 기억해 둔다. 칸을 새로 만들고 이 목록을 새로
-- 고치지 않으면, 새 칸을 포함한 조회가 "그런 칸 없음"으로 실패한다. 랜딩의
-- getSchedulePublic 은 그 실패를 null 로 삼키므로 **학부모 화면에는 "일정이 없습니다"로
-- 보인다.** 그래서 적용 직후 반드시 새로 고치고, anon 열쇠로 새 칸 2개를 포함한 조회가
-- 200 인지 실제로 확인한 다음에야 랜딩을 배포한다.

NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- 되돌리기 (이 파일을 적용한 뒤 문제가 생겼을 때)
--
-- 학부모 흐름이 하나라도 실패하면 **먼저 아래 (3) 을 실행**한다. 권한 회수가 원인일
-- 가능성이 가장 크고, 되돌리는 데 1초면 된다.
--
-- (1) 칸 추가 — 되돌릴 필요가 없다. 아무도 읽지 않는 칸이 늘어날 뿐이다.
--     굳이 지우려면:
--       ALTER TABLE public.consultation_schedules
--         DROP COLUMN owner_email, DROP COLUMN owner_set_at,
--         DROP COLUMN legacy_grace_until, DROP COLUMN crypto_version, DROP COLUMN crypto_salt;
--       ALTER TABLE public.surveys
--         DROP COLUMN owner_email, DROP COLUMN owner_set_at, DROP COLUMN legacy_grace_until;
--
-- (2) 옛 조회 RPC — 046 의 정의로 되돌린다(소유자 검사만 빼면 같다).
--     ★ 앱을 되돌릴 때는 이것도 **반드시 짝으로** 되돌려야 한다. 소유자가 박힌 일정은
--       이 검사 때문에 옛 경로로 열리지 않으므로, 앱만 옛 버전으로 내리면 그 일정들이
--       아무 문에서도 안 열린다.
--
-- (3) 회수한 권한 — GRANT 와 CREATE POLICY 를 **한 쌍씩** 되돌린다.
--     둘 중 하나만 복구하면 열린 것처럼 보이거나(정책만) 조용히 0행이 된다(권한만).
--
--       GRANT UPDATE, DELETE ON public.surveys               TO anon, authenticated;
--       GRANT DELETE         ON public.consultation_schedules TO anon, authenticated;
--       CREATE POLICY "surveys_public_update" ON public.surveys
--         FOR UPDATE USING (TRUE);
--       CREATE POLICY "surveys_public_delete" ON public.surveys
--         FOR DELETE USING (TRUE);
--       CREATE POLICY "consultation_schedules_public_delete" ON public.consultation_schedules
--         FOR DELETE USING (TRUE);
--
--       GRANT TRUNCATE, REFERENCES, TRIGGER ON public.surveys                TO anon, authenticated;
--       GRANT TRUNCATE, REFERENCES, TRIGGER ON public.consultation_schedules TO anon, authenticated;
--       GRANT TRUNCATE, REFERENCES, TRIGGER ON public.consultation_slots     TO anon, authenticated;
--       GRANT TRUNCATE, REFERENCES, TRIGGER ON public.consultation_bookings  TO anon, authenticated;
--       GRANT TRUNCATE, REFERENCES, TRIGGER ON public.survey_responses       TO anon, authenticated;
--       GRANT TRUNCATE, REFERENCES, TRIGGER ON public.short_links            TO anon, authenticated;
--
--     PUBLIC 실행 권한(6절)은 되돌릴 이유가 없다 — anon 실행이 그대로 남아 있어
--     학부모 흐름에 아무 영향이 없다. 그래도 원상복구하려면:
--       GRANT EXECUTE ON FUNCTION book_consultation_slot(uuid, uuid, integer, text, text, text) TO PUBLIC;
--       (나머지 넷도 같은 방식)
--
-- (4) 유예 만료일 스냅샷 — 값만 지운다.
--       UPDATE public.consultation_schedules SET legacy_grace_until = NULL WHERE owner_email IS NULL;
--       UPDATE public.surveys                SET legacy_grace_until = NULL WHERE owner_email IS NULL;
-- =====================================================================
