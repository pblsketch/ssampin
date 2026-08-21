-- =====================================================================
-- 050_staffroom_board.sql
-- 온라인 교무실 M2 — 게시판(글·댓글) · 읽음 확인 · 필독 · @멘션 · 임시저장
--
-- 계획서: docs/01-plan/features/online-staffroom.plan.md
--   §3.5-나 읽음 확인을 두 갈래로 나눈다 (행이 24배 줄어든다)
--   §3.5-다 목록은 제목·작성자·시각만 (전송량 8.6GB → 1.1GB)
--   §8-A   읽음 확인 · 필독 고정 · @멘션 · 임시저장
--   §9     M2
--
-- 오너 결정(2026-08-21): **첨부파일은 M2 에 넣지 않는다.** M3 자료실과 함께 만든다.
--   §11 의 "이메일 지정 권한 부여·회수"(멤버가 파일을 열게 해주는 부품)가 M3 라서,
--   M2 에 첨부를 넣으면 "올릴 수는 있는데 남이 못 여는" 상태가 된다.
--
-- ── 격리는 049 와 같은 두 겹 ─────────────────────────────────────────
--   1) DB 층 — 아래 표는 전부 service_role 전용. anon/authenticated 는 GRANT 회수.
--   2) 함수 층 — staffroom-* Edge Function 이 구글로 신원을 확인하고
--      staffroom_members 에 있는지 본 뒤에만 응답한다.
-- 근거: DECISIONS.md ADR-062.
--
-- ── ★ 읽음 확인을 왜 두 표로 나눴나 (§3.5-나) ────────────────────────
-- 글 하나마다 사람 수만큼 기록을 남기면 부서 250개에서 **375만 행(358MB)** 이 된다.
-- 그래서 나눈다:
--   staffroom_module_reads — 사람마다 게시판마다 **"마지막으로 본 시각" 한 줄.**
--     그 시각 이후에 올라온 글이 곧 안 읽은 글이다. 250부서 × 30명 = 7,500행.
--   staffroom_post_reads  — **필독으로 지정한 글에만** 사람별로 기록한다.
--     부장 선생님이 실제로 궁금한 건 중요 공지 몇 건이지 모든 잡담 글이 아니다.
-- 결과: 358MB → 15MB. 기능은 하나도 빼지 않았다.
-- =====================================================================

-- ══════════════════════════════════════════════════════════════════
-- 1) staffroom_modules — 부서 안의 모듈
--    M2 에서 실제로 만드는 건 'board' 하나뿐이다(부서 생성 시 자동).
--    kind 목록에 나머지를 미리 적어 두는 이유는, M3~M4 에서 종류가 늘 때
--    CHECK 제약을 다시 고치지 않기 위해서다.
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS staffroom_modules (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id  UUID        NOT NULL REFERENCES staffroom_departments(id) ON DELETE CASCADE,
  kind           TEXT        NOT NULL
    CHECK (kind IN ('board', 'archive', 'discussion', 'gallery', 'minutes')),
  name           TEXT        NOT NULL,
  position       INTEGER     NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  staffroom_modules      IS '온라인 교무실: 부서 안의 모듈. M2 는 board 만 만든다(부서 생성 시 자동 1개). 이름 바꾸기·추가는 M4.';
COMMENT ON COLUMN staffroom_modules.kind IS '모듈 종류. M2 에서 생성되는 값은 board 뿐이고 나머지는 M3~M4 대비 자리다.';
COMMENT ON COLUMN staffroom_modules.name IS '관리자가 붙인 이름. M2 기본값 "게시판".';

CREATE INDEX IF NOT EXISTS idx_staffroom_modules_department
  ON staffroom_modules (department_id, position, created_at);

ALTER TABLE staffroom_modules ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════
-- 2) staffroom_posts — 글
--    department_id 를 함께 둔 이유: 부서 단위 확인·정리를 모듈을 거치지 않고
--    한 번에 하기 위해서다(서버가 매 요청 멤버십을 확인하므로 조회가 잦다).
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS staffroom_posts (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id      UUID        NOT NULL REFERENCES staffroom_modules(id) ON DELETE CASCADE,
  department_id  UUID        NOT NULL REFERENCES staffroom_departments(id) ON DELETE CASCADE,
  author_email   TEXT        NOT NULL,
  title          TEXT        NOT NULL,
  body           TEXT        NOT NULL DEFAULT '',
  is_required    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  staffroom_posts             IS '온라인 교무실: 게시판 글. 목록 조회는 body 를 빼고 보낸다(계획서 §3.5-다 전송량).';
COMMENT ON COLUMN staffroom_posts.is_required IS '필독. 목록 맨 위 고정이면서 **이 글에만** staffroom_post_reads 에 사람별 읽음이 쌓인다(§3.5-나). 관리자만 지정.';
COMMENT ON COLUMN staffroom_posts.body        IS '본문. 길이로 막지 않는다(§2) — 권고 상한 20만 자는 화면 안내용이다.';

-- 목록: 필독 먼저, 그 다음 최신순
CREATE INDEX IF NOT EXISTS idx_staffroom_posts_module
  ON staffroom_posts (module_id, is_required DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_staffroom_posts_department
  ON staffroom_posts (department_id);

ALTER TABLE staffroom_posts ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════
-- 3) staffroom_comments — 댓글
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS staffroom_comments (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id        UUID        NOT NULL REFERENCES staffroom_posts(id) ON DELETE CASCADE,
  department_id  UUID        NOT NULL REFERENCES staffroom_departments(id) ON DELETE CASCADE,
  author_email   TEXT        NOT NULL,
  body           TEXT        NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE staffroom_comments IS '온라인 교무실: 댓글. 글이 지워지면 함께 지워진다.';

CREATE INDEX IF NOT EXISTS idx_staffroom_comments_post
  ON staffroom_comments (post_id, created_at);

ALTER TABLE staffroom_comments ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════
-- 4) staffroom_module_reads — ★ "마지막으로 본 시각" 한 줄 (§3.5-나)
--    사람 × 게시판 = 한 행. 글 수와 무관하게 늘지 않는다.
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS staffroom_module_reads (
  module_id     UUID        NOT NULL REFERENCES staffroom_modules(id) ON DELETE CASCADE,
  member_email  TEXT        NOT NULL,
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (module_id, member_email)
);

COMMENT ON TABLE  staffroom_module_reads              IS '온라인 교무실: 사람마다 게시판마다 "마지막으로 본 시각" 한 줄. 안 읽은 개수는 이 시각 이후 글을 세서 구한다(계획서 §3.5-나). 250부서×30명=7,500행.';
COMMENT ON COLUMN staffroom_module_reads.last_seen_at IS '이 시각 이후에 올라온 글이 안 읽은 글이다. 같은 시각은 읽은 것으로 친다.';

ALTER TABLE staffroom_module_reads ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════
-- 5) staffroom_post_reads — ★ 필독 글에만 쌓는 사람별 읽음 (§3.5-나)
--    일반 글에 쌓지 않는 것이 이 설계의 핵심이다. 서버(staffroom-posts)가
--    is_required = TRUE 인 글에만 INSERT 하도록 강제한다.
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS staffroom_post_reads (
  post_id       UUID        NOT NULL REFERENCES staffroom_posts(id) ON DELETE CASCADE,
  member_email  TEXT        NOT NULL,
  read_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, member_email)
);

COMMENT ON TABLE staffroom_post_reads IS '온라인 교무실: 필독 글의 사람별 읽음 기록. **필독 글에만 쌓는다** — 모든 글에 쌓으면 부서 250개에서 375만 행(358MB)이 된다(계획서 §3.5-나).';

ALTER TABLE staffroom_post_reads ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════
-- 6) staffroom_mentions — @선생님 호출
--    M2 는 "누가 불렸는지"를 기록하고 화면에 표시까지만 한다.
--    윈도우 알림·실시간 구독은 M5.
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS staffroom_mentions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id           UUID        NOT NULL REFERENCES staffroom_posts(id) ON DELETE CASCADE,
  department_id     UUID        NOT NULL REFERENCES staffroom_departments(id) ON DELETE CASCADE,
  mentioned_email   TEXT        NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (post_id, mentioned_email)
);

COMMENT ON TABLE staffroom_mentions IS '온라인 교무실: 글에서 특정 멤버를 지목한 기록(@멘션). M2 는 표시까지, 알림은 M5.';

CREATE INDEX IF NOT EXISTS idx_staffroom_mentions_member
  ON staffroom_mentions (mentioned_email, department_id);

ALTER TABLE staffroom_mentions ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════
-- 7) staffroom_drafts — 임시저장
--    사람마다 게시판마다 한 벌. 긴 글을 한 번 날리면 두 번 다시 안 쓴다(§8-A).
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS staffroom_drafts (
  module_id     UUID        NOT NULL REFERENCES staffroom_modules(id) ON DELETE CASCADE,
  author_email  TEXT        NOT NULL,
  title         TEXT        NOT NULL DEFAULT '',
  body          TEXT        NOT NULL DEFAULT '',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (module_id, author_email)
);

COMMENT ON TABLE staffroom_drafts IS '온라인 교무실: 글 쓰는 중 자동 저장. 사람마다 게시판마다 한 벌만 둔다(글을 올리면 지운다).';

ALTER TABLE staffroom_drafts ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════
-- 8) RLS 정책 — 일곱 표 모두 service_role 전용 (049 와 같은 방식)
-- ══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_table TEXT;
  v_policy TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'staffroom_modules',
    'staffroom_posts',
    'staffroom_comments',
    'staffroom_module_reads',
    'staffroom_post_reads',
    'staffroom_mentions',
    'staffroom_drafts'
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
-- 9) anon / authenticated 권한 회수 (049 와 같은 이유)
--    RLS 정책이 없으면 어차피 0행이지만, GRANT 까지 걷어 "열람 시도 자체"를 막는다.
-- ══════════════════════════════════════════════════════════════════
REVOKE ALL ON public.staffroom_modules       FROM anon, authenticated;
REVOKE ALL ON public.staffroom_posts         FROM anon, authenticated;
REVOKE ALL ON public.staffroom_comments      FROM anon, authenticated;
REVOKE ALL ON public.staffroom_module_reads  FROM anon, authenticated;
REVOKE ALL ON public.staffroom_post_reads    FROM anon, authenticated;
REVOKE ALL ON public.staffroom_mentions      FROM anon, authenticated;
REVOKE ALL ON public.staffroom_drafts        FROM anon, authenticated;

GRANT ALL ON public.staffroom_modules       TO service_role;
GRANT ALL ON public.staffroom_posts         TO service_role;
GRANT ALL ON public.staffroom_comments      TO service_role;
GRANT ALL ON public.staffroom_module_reads  TO service_role;
GRANT ALL ON public.staffroom_post_reads    TO service_role;
GRANT ALL ON public.staffroom_mentions      TO service_role;
GRANT ALL ON public.staffroom_drafts        TO service_role;

-- ══════════════════════════════════════════════════════════════════
-- 10) 이미 있는 부서에 기본 게시판을 하나씩 깔아 준다
--     049 배포 후 M2 배포 전에 만들어진 부서가 게시판 없이 남지 않게 한다.
--     (부서 생성 함수도 함께 고치지만, 그건 새로 만드는 부서에만 적용된다.)
-- ══════════════════════════════════════════════════════════════════
INSERT INTO staffroom_modules (department_id, kind, name, position)
SELECT d.id, 'board', '게시판', 0
FROM staffroom_departments d
WHERE NOT EXISTS (
  SELECT 1 FROM staffroom_modules m
  WHERE m.department_id = d.id AND m.kind = 'board'
);

-- ══════════════════════════════════════════════════════════════════
-- 11) staffroom_unread_counts — 안 읽은 글 수를 데이터베이스가 센다
--
--     앱이 글 목록을 통째로 받아서 세면 계획서 §3.5-다 의 전송량 설계가 무너진다
--     (교사 1,500명 × 월 300회 조회 = 8.6GB). 개수만 세서 돌려준다.
--
--     ★ 이 함수는 멤버십을 확인하지 않는다. **부르는 쪽(staffroom-departments)이
--       이미 "내가 멤버인 부서"로 좁혀서 넘긴 뒤에만 호출한다.**
--       그래서 anon 에는 EXECUTE 를 주지 않고 service_role 만 부를 수 있게 한다.
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION staffroom_unread_counts(
  p_email          TEXT,
  p_department_ids UUID[]
)
RETURNS TABLE (department_id UUID, module_id UUID, unread_count BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    m.department_id,
    m.id AS module_id,
    COUNT(p.id) FILTER (
      WHERE p.id IS NOT NULL
        AND (r.last_seen_at IS NULL OR p.created_at > r.last_seen_at)
    ) AS unread_count
  FROM staffroom_modules m
  LEFT JOIN staffroom_module_reads r
    ON r.module_id = m.id
   AND r.member_email = lower(trim(p_email))
  LEFT JOIN staffroom_posts p
    ON p.module_id = m.id
  WHERE m.department_id = ANY(p_department_ids)
  GROUP BY m.department_id, m.id;
$$;

COMMENT ON FUNCTION staffroom_unread_counts(TEXT, UUID[])
  IS '모듈별 안 읽은 글 수. "마지막 본 시각" 이후 글을 센다(계획서 §3.5-나). 멤버십 확인은 하지 않으므로 부르는 쪽이 이미 좁혀서 넘겨야 한다.';

REVOKE ALL ON FUNCTION staffroom_unread_counts(TEXT, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION staffroom_unread_counts(TEXT, UUID[]) TO service_role;
