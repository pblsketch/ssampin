-- =====================================================================
-- 074_consultation_schedules_write_grants.sql
--
-- 상담 일정 표의 쓰기 권한을 **칸 단위로** 좁힌다.
--
-- 배경:
--   044 는 SELECT 를 칸 단위로 좁혔지만(admin_key·owner_email 등 제외) **쓰기는
--   테이블 단위 그대로** 두었다. 그래서 anon·authenticated 가 모든 칸을 UPDATE 할 수
--   있었고, RLS 정책 `consultation_schedules_public_update` 는 `USING (true)` 다.
--
--   071(ADR-095)이 명단 조회의 신분증을 `owner_email` 일치로 옮기면서 이 칸이
--   **관문의 근거**가 되었다. 근거가 되는 칸을 관문 밖에서 고칠 수 있으면 관문이
--   성립하지 않는다. 같은 이유로 `admin_key`(관리 키), `legacy_grace_until`(유예
--   기한), `crypto_version`·`crypto_salt`(암호화 규격)도 밖에서 고쳐선 안 된다.
--
-- 이 마이그레이션이 하는 일:
--   테이블 단위 UPDATE 를 회수하고, **일정 편집에 실제로 필요한 칸만** 다시 준다.
--   044 가 SELECT 에 한 것과 같은 방식이다.
--
-- 무엇이 그대로인가:
--   - INSERT 는 건드리지 않는다. `admin_key` 는 NOT NULL·기본값 없음이라 칸을 좁히면
--     일정 만들기가 통째로 실패한다. 만들기 경로 정리는 별건으로 다룬다.
--   - SELECT 권한, RLS 정책, 서버(service_role)·엣지 함수 경로는 그대로다.
--   - 현재 앱·랜딩은 이 표에 직접 쓰지 않는다(랜딩 `bookingApi.ts` 의 조회 2곳이 전부).
--     `owner_email` 은 엣지 함수만 쓴다 — 앱이 본문에 보내도 서버가 읽지 않는다.
--
-- 비용:
--   구버전 앱이 anon 으로 이 표를 직접 고치고 있었다면 그 기기의 일정 **수정**이
--   막힌다(만들기는 위 INSERT 유지로 영향 없음).
--
-- 되돌리기:
--   GRANT UPDATE ON public.consultation_schedules TO anon, authenticated;
-- =====================================================================

REVOKE UPDATE ON public.consultation_schedules FROM anon, authenticated;

-- 일정 편집에 필요한 칸만. 여기 없는 칸(admin_key, owner_email, owner_set_at,
-- legacy_grace_until, crypto_version, crypto_salt, id, created_at)은 서버만 쓴다.
GRANT UPDATE (
  title,
  type,
  methods,
  slot_minutes,
  dates,
  target_class_name,
  target_students,
  message,
  is_archived,
  closed_at,
  expires_at,
  topic_options
) ON public.consultation_schedules TO anon, authenticated;
