-- ══════════════════════════════════════════════════════════════════
-- 064 · 온라인 교무실 — 실사용 계측 (계획서 staffroom-survival.plan.md §6-P0, ADR-079)
--
-- 왜 필요한가
--   교무실은 v2.4.4 에 실험실 기능으로 나갔는데 **계측이 0건**이다. 부서가 몇 개인지,
--   그중 관리자 구글 연결이 끊긴 부서가 몇 개인지 아무도 모른다. 그 숫자가 없으면
--   "관리자 넘겨주기"·"공동 관리자" 같은 다음 작업의 긴급도를 정할 수 없다.
--
-- ★★ 개인정보 — 이 파일의 가장 중요한 계약 (ADR-079)
--   집계 함수는 **부서를 식별할 수 있는 칸을 아예 만들지 않는다.**
--   부서 이름·교사 이메일·글 제목은 물론이고 **부서 id 조차 밖으로 내보내지 않는다.**
--   화면에서 가리는 게 아니라 **SQL 에서 선택조차 하지 않는다** — 관리자 대시보드는
--   비밀번호를 쿠키에 그대로 담는 경계 위에 있어서, "안 띄운다"보다 "안 나간다"가 훨씬 무겁다.
--
--   두 겹으로 못박는다:
--     ① 타입 — RETURNS TABLE 에 uuid·text·jsonb 가 하나도 없다
--     ② 카디널리티 — **바깥 SELECT 에 FROM 이 없다**(스칼라 서브쿼리만).
--        그래서 이 함수는 구조적으로 **항상 정확히 1행**이다. 히스토그램의 GROUP BY 는
--        CTE 안에 갇혀 밖으로 새지 않는다.
--   ②가 없으면 `RETURNS TABLE(members_count bigint, files_total bigint, ...)` 같은
--   **부서당 한 행**이 타입 검사를 통과하면서 되살아난다. 오너는 자기 학교 부서를 아니까
--   용량+마지막 활동일 조합만으로 특정 부서를 짚을 수 있다.
--   이 계약은 staffroomHealthPrivacy.meta.test.ts 가 지킨다.
--
-- ★ 새 표를 만들지 않는다
--   초안은 staffroom_admin_token_health 를 새로 만들려 했는데, "정상"의 답은 이미
--   staffroom_admin_tokens.updated_at 에 있다(갱신 성공·재로그인 양쪽에 기록된다).
--   그래서 컬럼 2개만 더한다. 덤으로 049 의 _service_all 정책·REVOKE 관례와
--   staffroomIsolation.meta.test.ts 의 TABLES 배열을 건드릴 일이 없다.
-- ══════════════════════════════════════════════════════════════════

-- ── 1) 끊김 기록 칸 2개 ────────────────────────────────────────────
--
-- ★ 성공은 여기 안 적는다. adminAccessToken 은 모든 읽기·쓰기가 지나는 뜨거운 길이고,
--   빠른 경로는 지금 쓰기가 0회다. 거기에 쓰기를 넣으면 계측이 자료실을 죽인다.
--   "정상"은 updated_at 으로 소급해서 구한다 — 배포 첫날부터 진짜 숫자가 나온다.

ALTER TABLE staffroom_admin_tokens
  ADD COLUMN IF NOT EXISTS last_broken_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS broken_kind    SMALLINT;

COMMENT ON COLUMN staffroom_admin_tokens.last_broken_at IS
  '이 부서의 관리자 연결이 마지막으로 실패한 시각. 성공은 여기 안 적는다(updated_at 이 그 역할). staffroom-library 의 list 가 실패했을 때만 적는다.';
COMMENT ON COLUMN staffroom_admin_tokens.broken_kind IS
  '실패 종류: 2=토큰 갱신 실패, 4=드라이브가 거부(용량 초과·폴더 휴지통 등). 전역 설정 사고(암호화 키·구글 클라이언트 미설정)는 부서 사고가 아니므로 적지 않는다.';

-- ── 2) 집계 함수 ──────────────────────────────────────────────────
--
-- 건강 4상태는 **배타적**이어야 한다. 그냥 나열하면 겹친다 —
-- updated_at 3일 전 + last_broken_at 1일 전이면 "정상이면서 끊김"이고,
-- 그러면 네 칸의 합이 부서 총수와 안 맞아 오너가 분모를 잘못 잡는다.
-- 그래서 CASE 하나로 부서마다 상태를 **하나만** 정한다.
--   우선순위: 미연결 > 끊김 > 정상(14일) > 조용함
--
-- ★ 14일인 이유 — updated_at 은 토큰이 갱신될 때만 오른다(액세스 토큰 수명 1시간).
--   즉 이 창은 "연결 건강"이 아니라 **"최근 사용"**을 잰다. 14일이면 방학·연휴 2주를 견딘다.
--   7일로 잡으면 방학마다 멀쩡한 부서가 전부 "조용함"으로 뒤집힌다.
--
-- ★ 컬럼 별칭을 전부 붙인 이유 — RETURNS TABLE 의 이름은 SQL 함수 본문에서 출력
--   파라미터로 보인다. last_broken_at 을 한정 없이 쓰면 **ambiguous 로 마이그레이션이
--   거절된다.** 그래서 CTE 안에서 broken_at/ok_at 처럼 겹치지 않는 이름으로 바꿔 둔다.

CREATE OR REPLACE FUNCTION staffroom_health_v1()
RETURNS TABLE (
  generated_at        TIMESTAMPTZ,
  departments_total   BIGINT,
  dept_members_0      BIGINT,
  dept_members_1      BIGINT,
  dept_members_2_5    BIGINT,
  dept_members_6_10   BIGINT,
  dept_members_11_30  BIGINT,
  dept_members_31_up  BIGINT,
  posts_total         BIGINT,
  comments_total      BIGINT,
  files_total         BIGINT,
  files_bytes         BIGINT,
  last_activity_date  DATE,
  depts_no_activity   BIGINT,
  health_ok           BIGINT,
  health_broken       BIGINT,
  health_quiet        BIGINT,
  health_unlinked     BIGINT,
  last_broken_at      TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH mem AS (
    SELECT m.department_id AS dept, count(*) AS c
      FROM staffroom_members m
     GROUP BY m.department_id
  ),
  tok AS (
    SELECT d.id AS dept,
           t.department_id  AS linked,
           t.updated_at     AS ok_at,
           t.last_broken_at AS broken_at
      FROM staffroom_departments d
      LEFT JOIN staffroom_admin_tokens t ON t.department_id = d.id
  ),
  st AS (
    SELECT k.dept,
           CASE
             WHEN k.linked IS NULL
               THEN 'unlinked'
             WHEN k.broken_at IS NOT NULL
                  AND (k.ok_at IS NULL OR k.broken_at > k.ok_at)
               THEN 'broken'
             WHEN k.ok_at IS NOT NULL
                  AND k.ok_at >= now() - interval '14 days'
               THEN 'ok'
             ELSE 'quiet'
           END AS state
      FROM tok k
  ),
  act AS (
    SELECT x.dept, max(x.act_at) AS last_at
      FROM (
        SELECT p.department_id AS dept, p.created_at  AS act_at FROM staffroom_posts p
        UNION ALL
        SELECT c.department_id AS dept, c.created_at  AS act_at FROM staffroom_comments c
        UNION ALL
        SELECT f.department_id AS dept, f.uploaded_at AS act_at FROM staffroom_files f
      ) x
     GROUP BY x.dept
  ),
  -- 부서 총수는 세 군데(분모·멤버 0명·활동 0건)에서 쓰이므로 한 번만 센다.
  tot AS (
    SELECT count(*)::bigint AS n FROM staffroom_departments
  )
  SELECT
    now(),
    (SELECT t1.n FROM tot t1),
    -- 멤버 0명 부서 = 전체 − 멤버가 하나라도 있는 부서. mem 에는 0명 부서가 아예 안 들어온다.
    -- 이 칸이 없으면 히스토그램 6칸의 합이 부서 총수와 안 맞는다.
    (SELECT t2.n FROM tot t2) - (SELECT count(*)::bigint FROM mem m0),
    (SELECT count(*)::bigint FROM mem m1  WHERE m1.c = 1),
    (SELECT count(*)::bigint FROM mem m2  WHERE m2.c BETWEEN 2 AND 5),
    (SELECT count(*)::bigint FROM mem m3  WHERE m3.c BETWEEN 6 AND 10),
    (SELECT count(*)::bigint FROM mem m4  WHERE m4.c BETWEEN 11 AND 30),
    (SELECT count(*)::bigint FROM mem m5  WHERE m5.c >= 31),
    (SELECT count(*)::bigint FROM staffroom_posts pp),
    (SELECT count(*)::bigint FROM staffroom_comments cc),
    (SELECT count(*)::bigint FROM staffroom_files ff),
    -- ★ 앱 화면의 "부서 용량"(staffroom_storage_usage)과 **다른 숫자**다.
    --   그쪽은 현재 판 + 미리보기 글자 + 접어 둔 이전 판을 더한다. 여기는 현재 판만 센다.
    --   COALESCE 로 감싸므로 이 칸은 NULL 이 되지 않는다.
    (SELECT COALESCE(sum(fb.size), 0)::bigint FROM staffroom_files fb),
    (SELECT (max(a1.last_at) AT TIME ZONE 'Asia/Seoul')::date FROM act a1),
    (SELECT t3.n FROM tot t3) - (SELECT count(*)::bigint FROM act a2),
    (SELECT count(*)::bigint FROM st s1 WHERE s1.state = 'ok'),
    (SELECT count(*)::bigint FROM st s2 WHERE s2.state = 'broken'),
    (SELECT count(*)::bigint FROM st s3 WHERE s3.state = 'quiet'),
    (SELECT count(*)::bigint FROM st s4 WHERE s4.state = 'unlinked'),
    -- 진단용: 계측이 살아 있는지 보는 유일한 창. 정상 상태에서는 아무것도 안 적히므로
    -- "끊김 0"과 "계측이 죽었다"는 화면만 봐서는 구별되지 않는다(계획서 §6-P0-라).
    (SELECT max(lb.broken_at) FROM tok lb);
$$;

COMMENT ON FUNCTION staffroom_health_v1() IS
  '온라인 교무실 실사용 계측(ADR-079). 숫자·날짜만 돌려주고 부서를 식별할 수 있는 칸은 만들지 않는다 — 바깥 SELECT 에 FROM 이 없어 구조적으로 항상 1행이다.';

REVOKE ALL ON FUNCTION staffroom_health_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION staffroom_health_v1() TO service_role;

-- ★ 없으면 PostgREST 스키마 캐시가 새 RPC 를 모르는 동안 404 를 내는데,
--   대시보드의 fetchRpc 가 실패를 [] 로 삼켜서 **오류가 아니라 "데이터 없음"처럼 보인다.**
--   049~056 교무실 마이그레이션에는 이 줄이 하나도 없다 — 관례를 따르면 오히려 틀린다.
NOTIFY pgrst, 'reload schema';
