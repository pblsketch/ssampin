-- =====================================================================
-- 057_short_link_rpcs.sql
--
-- 숏링크 조회를 "코드 하나를 정확히 대면 그 목적지만" 돌려주는 RPC 로 옮긴다.
-- **이 마이그레이션은 순수 추가다.** 기존 정책·권한을 건드리지 않으므로
-- 배포해도 아무것도 깨지지 않는다. 권한 회수는 058 에서 별도로 한다.
--
-- 배경:
--   `short_links.target_path` 는 공유 링크 원문을 그대로 담는다. 상담·설문 링크에는
--   관리 키가 프래그먼트로 붙어 있어(useConsultationStore.ts:150), 이 칸이 목록으로
--   열리면 **링크를 받은 적 없는 사람에게도 관리 키가 드러난다.**
--   관리 키는 예약자 정보를 푸는 열쇠이면서 교사용 조회 RPC 의 인증 수단이라 영향이 크다.
--
-- 원인은 `USING (expires_at IS NULL OR expires_at > NOW())` 정책이다.
--   조건이 "만료 안 됐나" 뿐이라 "코드를 알고 있나"를 강제하지 못한다.
--   PostgREST 는 클라이언트가 보낸 필터를 신뢰할 뿐이라, RLS 로는
--   "반드시 code 로 좁혀 조회하라"를 강제할 수 없다 — 046 과 같은 구조의 문제다.
--
-- 설계:
--   - 리다이렉트에 필요한 건 "이 코드의 목적지" **하나뿐**이다.
--     → 인자로 받은 코드 하나만 대조하고 target_path 를 스칼라로 돌려준다.
--   - 숏링크 재사용(같은 target 이면 기존 코드를 다시 쓴다)에도 조회가 필요하다.
--     → 정확히 일치하는 target_path 를 아는 호출자만 code 를 얻는다.
--       전체 목록을 만들 수 없으므로 열람 경로가 되지 않는다.
--
-- 왜 없을 때 예외가 아니라 NULL 인가:
--   046 의 교사용 RPC 는 "조용한 빈 결과"가 사용자 신고로 이어졌기에 403 으로 실패시킨다.
--   여기는 반대다. 없는 숏코드는 **정상적인 404 경로**이고 호출부가 이미 notFound() 로
--   처리한다. 예외로 만들면 오타 하나에 500 이 뜬다.
--
-- 만료 처리는 기존 RLS 정책과 동일하게 유지한다(만료된 링크는 해석되지 않는다).
--
-- 근거: 보안 조사 문서(저장소 외부 · 비공개). 재현 경로를 이 파일에 옮겨 적지 말 것.
-- =====================================================================

-- ── 1) 리다이렉트용 — 코드 하나 → 목적지 하나 ────────────────────────

CREATE OR REPLACE FUNCTION resolve_short_link(p_code text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT target_path
  FROM short_links
  WHERE code = p_code
    AND (expires_at IS NULL OR expires_at > NOW())
  LIMIT 1;
$$;

COMMENT ON FUNCTION resolve_short_link(text) IS
  '숏링크 해석: 코드 하나를 대조해 target_path 만 반환. 없거나 만료면 NULL(호출부가 404 로 처리). 목록 열람 불가.';

-- ── 2) 생성 시 재사용용 — 정확히 일치하는 target → 기존 코드 ─────────
-- 호출자가 target_path 전체를 이미 알고 있어야 한다. 목록을 만들 수 없다.

CREATE OR REPLACE FUNCTION find_short_code_by_target(p_target_path text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT code
  FROM short_links
  WHERE target_path = p_target_path
    AND (expires_at IS NULL OR expires_at > NOW())
  LIMIT 1;
$$;

COMMENT ON FUNCTION find_short_code_by_target(text) IS
  '숏링크 재사용: 목적지를 이미 아는 호출자에게만 기존 code 반환. 없으면 NULL → 호출부가 새 코드를 만든다.';

-- ── 3) 커스텀 코드 중복 확인 — 여부만 ────────────────────────────────
-- 교사가 링크 이름을 직접 지을 때 "이미 쓰는 이름인가"를 묻는다.
--
-- 예전에는 `?code=eq.X&select=code` 로 테이블을 읽었다. 그런데 **그 경로를 남겨두면
-- 058 이 무의미해진다** — 필터를 빼고 `?select=code` 만 던지면 살아 있는 코드가 전량
-- 나오고, 그 코드를 위 resolve_short_link 에 하나씩 넣으면 target_path(관리 키 포함)를
-- 그대로 회수할 수 있다. 즉 target_path 만 가려도 code 목록이 열려 있으면 우회된다.
-- 그래서 058 은 테이블 SELECT 를 전면 회수하고, 이 함수가 그 자리를 대신한다.
--
-- 만료 여부를 보지 않는다: code 는 기본키라 만료된 링크도 그 이름을 계속 점유한다.
-- 만료된 것을 "사용 가능"이라고 답하면 생성 단계에서 409 로 실패한다(기존 결함).
CREATE OR REPLACE FUNCTION is_short_code_available(p_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM short_links WHERE code = p_code
  );
$$;

COMMENT ON FUNCTION is_short_code_available(text) IS
  '커스텀 숏코드 중복 확인: 여부(boolean)만 반환. 목록·목적지는 나가지 않는다. 만료된 코드도 점유 중으로 본다(code 가 기본키).';

-- ── 4) 실행 권한 ─────────────────────────────────────────────────────
-- 랜딩(학생·학부모)과 교사 앱 모두 anon 키를 쓴다.

REVOKE ALL ON FUNCTION resolve_short_link(text)          FROM PUBLIC;
REVOKE ALL ON FUNCTION find_short_code_by_target(text)   FROM PUBLIC;
REVOKE ALL ON FUNCTION is_short_code_available(text)     FROM PUBLIC;

GRANT EXECUTE ON FUNCTION resolve_short_link(text)        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION find_short_code_by_target(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION is_short_code_available(text)   TO anon, authenticated;
