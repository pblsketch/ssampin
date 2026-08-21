-- =====================================================================
-- 052_staffroom_rooms.sql
-- 온라인 교무실 M4 — 토론방 · 갤러리 · 회의록 · 배너 · 모듈 이름 · 부서 일정 · 업무 분담
--
-- 계획서: docs/01-plan/features/online-staffroom.plan.md
--   §6     화면 구성 — 모듈은 **종류를 고르고 이름을 자유롭게 붙인다**
--   §8-B   부서 일정 → 내 일정에 겹쳐 보기 · 부서 업무 분담 → 내 할 일로
--   §8-C   회의록 모듈 (토론방에서 결정된 걸 그대로 굳힌다)
--   §9     M4 — "부서를 꾸미고 운영한다"
--   §8-E   ★ 활동 포인트·랭킹·출석도장은 **넣지 않는다**(쌤핀 금지 규칙).
--          아래 어떤 표에도 사람별 누적 점수를 쌓는 칸이 없는 이유다.
--
-- ── 갤러리에 표를 만들지 않은 이유 ──────────────────────────────────
-- 갤러리는 **사진 격자로 보는 자료실**이다. 051 의 staffroom_files 가 이미
-- module_id 로 어느 모듈 것인지 갈라 두었고 그림 미리보기도 붙어 있어서,
-- 표를 새로 만들면 올리기·용량 집계·권한 회수를 두 벌로 관리하게 된다.
-- 같은 표를 쓰고 **화면만 격자로** 바꾼다.
--
-- ── 격리는 049·050·051 과 같은 두 겹 ────────────────────────────────
--   1) DB 층 — 아래 표는 전부 service_role 전용. anon/authenticated 는 GRANT 회수.
--   2) 함수 층 — staffroom-* Edge Function 이 구글로 신원을 확인하고
--      staffroom_members 에 있는지 본 뒤에만 응답한다.
-- 근거: DECISIONS.md ADR-062.
-- =====================================================================

-- ══════════════════════════════════════════════════════════════════
-- 0) 배너 (§6)
--
--    부서 카드와 부서 안 맨 위에 뜨는 그림이다. 세 가지 중 하나다:
--      color  — 고른 색 (기본값. 아무것도 안 골라도 부서마다 달라 보인다)
--      preset — 쌤핀이 준비한 그림
--      photo  — 올린 사진. 값은 **드라이브 파일 id** 다(§3.4 — 그림도 서버에 쌓지 않는다)
-- ══════════════════════════════════════════════════════════════════
ALTER TABLE staffroom_departments
  ADD COLUMN IF NOT EXISTS banner_kind  TEXT NOT NULL DEFAULT 'color'
    CHECK (banner_kind IN ('color', 'preset', 'photo')),
  ADD COLUMN IF NOT EXISTS banner_value TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN staffroom_departments.banner_kind  IS '배너 종류(계획서 §6). color=고른 색 · preset=준비된 그림 · photo=올린 사진.';
COMMENT ON COLUMN staffroom_departments.banner_value IS 'color 면 토큰 이름, preset 이면 그림 이름, photo 면 **드라이브 파일 id**. 그림 자체는 서버에 쌓지 않는다(§3.4).';

-- ══════════════════════════════════════════════════════════════════
-- 1) staffroom_discussions — 토론방 안건 (§6)
--
--    게시판 글과 무엇이 다른가 — **집계가 붙는다.** 글은 읽고 댓글을 달지만
--    안건은 찬성·반대를 세어 "부서가 무엇으로 정했는지"를 남긴다.
--    그 결과를 회의록으로 굳히는 것이 §8-C 다.
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS staffroom_discussions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id      UUID        NOT NULL REFERENCES staffroom_modules(id) ON DELETE CASCADE,
  department_id  UUID        NOT NULL REFERENCES staffroom_departments(id) ON DELETE CASCADE,
  author_email   TEXT        NOT NULL,
  title          TEXT        NOT NULL,
  body           TEXT        NOT NULL DEFAULT '',
  closed_at      TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  staffroom_discussions           IS '온라인 교무실 토론방: 안건. 게시판 글과 달리 찬성·반대 집계가 붙는다(계획서 §6).';
COMMENT ON COLUMN staffroom_discussions.closed_at IS '마감 시각. 마감하면 더 투표할 수 없고 집계가 굳는다. 관리자 또는 낸 사람이 마감한다.';

CREATE INDEX IF NOT EXISTS idx_staffroom_discussions_module
  ON staffroom_discussions (module_id, created_at DESC);

ALTER TABLE staffroom_discussions ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════
-- 2) staffroom_discussion_votes — 찬성 / 반대 / 기권 + 의견
--
--    ★ 사람마다 안건당 **한 줄뿐이다**(UNIQUE). 마음이 바뀌면 그 줄을 고친다.
--      줄을 쌓으면 "몇 번 투표했는지"가 기록으로 남는데, 그건 §8-E 가 금지한
--      활동 집계와 사실상 같은 것이 된다. 셀 것은 **지금 부서의 뜻**이지
--      누가 부지런한가가 아니다.
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS staffroom_discussion_votes (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  discussion_id  UUID        NOT NULL REFERENCES staffroom_discussions(id) ON DELETE CASCADE,
  member_email   TEXT        NOT NULL,
  stance         TEXT        NOT NULL CHECK (stance IN ('agree', 'disagree', 'abstain')),
  comment        TEXT        NOT NULL DEFAULT '',
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  staffroom_discussion_votes         IS '온라인 교무실 토론방: 한 사람의 뜻(찬성·반대·기권)과 의견. 사람마다 안건당 한 줄만 둔다.';
COMMENT ON COLUMN staffroom_discussion_votes.stance  IS 'agree=찬성 · disagree=반대 · abstain=기권. 기권을 넣은 이유는 "읽었지만 판단을 미룬다"를 말할 자리가 필요해서다.';
COMMENT ON COLUMN staffroom_discussion_votes.comment IS '왜 그렇게 생각하는지. 비워도 된다 — 의견을 강제하면 투표 자체를 안 한다.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_staffroom_discussion_votes
  ON staffroom_discussion_votes (discussion_id, member_email);

ALTER TABLE staffroom_discussion_votes ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════
-- 3) staffroom_minutes — 회의록 (§8-C)
--
--    안건 → 논의 → 결정사항 세 칸으로 나눠 둔 이유: 한 덩어리 글로 두면
--    "그래서 뭘 정했나"가 문단 속에 묻힌다. 나중에 찾을 때 필요한 건 결정사항이다.
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS staffroom_minutes (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id      UUID        NOT NULL REFERENCES staffroom_modules(id) ON DELETE CASCADE,
  department_id  UUID        NOT NULL REFERENCES staffroom_departments(id) ON DELETE CASCADE,
  author_email   TEXT        NOT NULL,
  title          TEXT        NOT NULL,
  met_on         DATE        NOT NULL,
  attendees      TEXT        NOT NULL DEFAULT '',
  agenda         TEXT        NOT NULL DEFAULT '',
  discussion     TEXT        NOT NULL DEFAULT '',
  decisions      TEXT        NOT NULL DEFAULT '',
  -- 토론방 안건에서 굳힌 것이면 그 안건 (§8-C)
  from_discussion_id UUID    REFERENCES staffroom_discussions(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  staffroom_minutes                    IS '온라인 교무실 회의록: 안건 → 논의 → 결정사항(계획서 §8-C).';
COMMENT ON COLUMN staffroom_minutes.met_on             IS '회의한 날. 만든 날과 다를 수 있어 따로 받는다(회의 뒤에 적는 것이 보통이다).';
COMMENT ON COLUMN staffroom_minutes.attendees          IS '참석자를 글자로 적는다. 멤버 명단과 이어붙이지 않는 이유 — 외부 참석자가 오고, 멤버인데 안 온 사람도 있다.';
COMMENT ON COLUMN staffroom_minutes.from_discussion_id IS '토론방에서 정해진 걸 그대로 굳힌 경우 그 안건. 지워져도 회의록은 남는다(SET NULL).';

CREATE INDEX IF NOT EXISTS idx_staffroom_minutes_module
  ON staffroom_minutes (module_id, met_on DESC);

ALTER TABLE staffroom_minutes ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════
-- 4) staffroom_events — 부서 일정 (§8-B)
--
--    ★ 쌤핀 개인 일정 표에 넣지 않는다. 부서 일정은 **부서가 주인**이라
--      멤버가 바뀌어도 남아야 하고, 부서를 나가면 안 보여야 한다.
--      개인 일정 표에 복사해 넣으면 나간 뒤에도 남고, 부서에서 고쳐도
--      이미 복사된 것은 안 바뀐다.
--      앱은 이걸 **읽어서 내 달력 위에 겹쳐 보여줄 뿐** 내 일정으로 만들지 않는다.
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS staffroom_events (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id  UUID        NOT NULL REFERENCES staffroom_departments(id) ON DELETE CASCADE,
  author_email   TEXT        NOT NULL,
  title          TEXT        NOT NULL,
  starts_on      DATE        NOT NULL,
  ends_on        DATE,
  start_time     TEXT,
  place          TEXT        NOT NULL DEFAULT '',
  memo           TEXT        NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  staffroom_events            IS '온라인 교무실: 부서 일정(계획서 §8-B). 앱이 내 달력 위에 겹쳐 보여준다 — 개인 일정으로 복사하지 않는다.';
COMMENT ON COLUMN staffroom_events.ends_on    IS '여러 날 걸치는 일정의 마지막 날. 하루짜리면 NULL.';
COMMENT ON COLUMN staffroom_events.start_time IS '"14:30" 같은 시각 문자열. 종일 일정이면 NULL. 시간대를 붙이지 않는 이유 — 학교 일정은 전부 그 학교 현지 시각이다.';

CREATE INDEX IF NOT EXISTS idx_staffroom_events_department
  ON staffroom_events (department_id, starts_on);

ALTER TABLE staffroom_events ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════
-- 5) staffroom_tasks — 업무 분담 (§8-B)
--
--    ★ "누가 뭘 맡았는지"를 적는 곳이지 **누가 얼마나 했는지를 세는 곳이 아니다.**
--      끝낸 개수를 사람별로 쌓는 칸을 두지 않은 것이 §8-E(활동 포인트 금지)다.
--      done_at 은 그 일이 끝났는지를 말할 뿐 사람에게 붙는 점수가 아니다.
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS staffroom_tasks (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id  UUID        NOT NULL REFERENCES staffroom_departments(id) ON DELETE CASCADE,
  author_email   TEXT        NOT NULL,
  title          TEXT        NOT NULL,
  assignee_email TEXT,
  due_on         DATE,
  memo           TEXT        NOT NULL DEFAULT '',
  done_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  staffroom_tasks                IS '온라인 교무실: 부서 업무 분담(계획서 §8-B). 맡은 사람의 개인 할 일 화면에도 내려간다.';
COMMENT ON COLUMN staffroom_tasks.assignee_email IS '맡은 사람. 아직 안 정했으면 NULL — "누가 할까요"를 적어 둘 자리가 필요하다.';
COMMENT ON COLUMN staffroom_tasks.done_at        IS '끝난 시각. **사람에게 붙는 점수가 아니다**(§8-E 활동 포인트 금지).';

CREATE INDEX IF NOT EXISTS idx_staffroom_tasks_department
  ON staffroom_tasks (department_id, due_on);

CREATE INDEX IF NOT EXISTS idx_staffroom_tasks_assignee
  ON staffroom_tasks (assignee_email, done_at);

ALTER TABLE staffroom_tasks ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════
-- 6) RLS 정책 — 다섯 표 모두 service_role 전용 (049~051 과 같은 방식)
-- ══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_table TEXT;
  v_policy TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'staffroom_discussions',
    'staffroom_discussion_votes',
    'staffroom_minutes',
    'staffroom_events',
    'staffroom_tasks'
  ]
  LOOP
    v_policy := v_table || '_service_all';
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = v_table AND policyname = v_policy
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL USING (auth.role() = ''service_role'') WITH CHECK (auth.role() = ''service_role'')',
        v_policy, v_table
      );
    END IF;
  END LOOP;
END $$;

-- ══════════════════════════════════════════════════════════════════
-- 7) 격리 — anon/authenticated 는 이 표들에 닿을 수 없다
-- ══════════════════════════════════════════════════════════════════
REVOKE ALL ON public.staffroom_discussions      FROM anon, authenticated;
REVOKE ALL ON public.staffroom_discussion_votes FROM anon, authenticated;
REVOKE ALL ON public.staffroom_minutes          FROM anon, authenticated;
REVOKE ALL ON public.staffroom_events           FROM anon, authenticated;
REVOKE ALL ON public.staffroom_tasks            FROM anon, authenticated;

GRANT ALL ON public.staffroom_discussions      TO service_role;
GRANT ALL ON public.staffroom_discussion_votes TO service_role;
GRANT ALL ON public.staffroom_minutes          TO service_role;
GRANT ALL ON public.staffroom_events           TO service_role;
GRANT ALL ON public.staffroom_tasks            TO service_role;

-- ══════════════════════════════════════════════════════════════════
-- 8) staffroom_discussion_tally — 안건별 집계 (§6)
--
--    앱이 투표를 전부 받아 세지 않고 데이터베이스가 센다. 30명 부서에서
--    안건 20개면 600줄을 받아야 하는데, 화면에 필요한 건 숫자 세 개다(§3.5-다).
--
--    ★ **사람별 누적을 세지 않는다.** 안건 하나의 찬반만 센다 —
--      "누가 몇 번 찬성했나" 같은 집계는 §8-E 가 금지한 활동 점수가 된다.
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION staffroom_discussion_tally(
  p_discussion_ids UUID[]
)
RETURNS TABLE (
  discussion_id UUID,
  agree_count    BIGINT,
  disagree_count BIGINT,
  abstain_count  BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    d.id AS discussion_id,
    COUNT(v.id) FILTER (WHERE v.stance = 'agree')    AS agree_count,
    COUNT(v.id) FILTER (WHERE v.stance = 'disagree') AS disagree_count,
    COUNT(v.id) FILTER (WHERE v.stance = 'abstain')  AS abstain_count
  FROM staffroom_discussions d
  LEFT JOIN staffroom_discussion_votes v ON v.discussion_id = d.id
  WHERE d.id = ANY(p_discussion_ids)
  GROUP BY d.id;
$$;

COMMENT ON FUNCTION staffroom_discussion_tally(UUID[])
  IS '안건별 찬성·반대·기권 수. 멤버십 확인은 하지 않으므로 부르는 쪽이 이미 좁혀서 넘겨야 한다.';

REVOKE ALL ON FUNCTION staffroom_discussion_tally(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION staffroom_discussion_tally(UUID[]) TO service_role;
