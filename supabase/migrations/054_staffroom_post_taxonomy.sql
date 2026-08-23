-- ══════════════════════════════════════════════════════════════════
-- 054_staffroom_post_taxonomy.sql
-- 온라인 교무실 — 글 분류: 말머리(카테고리) + 해시태그
--
-- 왜 둘을 나눠 만드는가
-- ─────────────────────
-- 성격이 다르다. 하나로 합치면 둘 다 어중간해진다.
--
--   말머리  — **관리자가 미리 정한다.** `[공지] [회의록] [업무연락]` 처럼.
--             글 하나에 하나만. 부서마다 목록이 따로다.
--             목적: 목록을 훑을 때 "이건 뭐에 관한 글인가"가 한눈에 보이게.
--
--   해시태그 — **글 쓰는 사람이 그때그때 붙인다.** 개수 제한만 있고 목록은 없다.
--             목적: 나중에 "체육대회" 로 묶어 찾기.
--
-- 말머리를 자유 입력으로 두면 같은 뜻인데 `공지`·`공지사항`·`[공지]` 가 섞여
-- 걸러 보기가 쓸모없어진다. 반대로 해시태그를 관리자가 정하게 하면 아무도
-- 안 쓴다. 그래서 나눴다.
--
-- 왜 글에서 본문 검색용 칸을 따로 만들지 않았나
-- ─────────────────────────────────────────────
-- 본문은 이제 편집기 구조(053 의 `lexical`)라 `body LIKE '%체육%'` 이 구조 속
-- 낱말까지 긁는다. 그러나 검색은 M3 자료실의 `searchPosts` 가 이미 맡고 있으므로
-- **여기서 검색 얼개를 새로 만들지 않는다.** 해시태그는 검색이 아니라 분류다.
--
-- 격리: 새 표 둘 다 049·050 과 같은 두 겹 — RLS 켜고 service_role 전용 정책,
--       anon/authenticated 는 GRANT 자체가 없다(여기서 주지 않는다).
-- 멱등: IF NOT EXISTS + pg_policies / pg_constraint 가드.
-- ══════════════════════════════════════════════════════════════════

-- ── 1) 말머리 ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS staffroom_categories (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id  UUID        NOT NULL REFERENCES staffroom_departments(id) ON DELETE CASCADE,
  name           TEXT        NOT NULL,
  position       INTEGER     NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  staffroom_categories          IS '온라인 교무실: 글 말머리. 관리자가 부서마다 미리 정한다. 자유 입력이 아니라 고른 목록이라 걸러 보기가 쓸모 있어진다.';
COMMENT ON COLUMN staffroom_categories.position IS '목록에서 보일 순서. 관리자가 자주 쓰는 것을 앞으로 옮길 수 있게.';

-- 같은 부서 안에서 이름이 겹치면 고르는 사람이 어느 것인지 알 수 없다
CREATE UNIQUE INDEX IF NOT EXISTS idx_staffroom_categories_unique_name
  ON staffroom_categories (department_id, name);

CREATE INDEX IF NOT EXISTS idx_staffroom_categories_department
  ON staffroom_categories (department_id, position, created_at);

ALTER TABLE staffroom_categories ENABLE ROW LEVEL SECURITY;

-- ── 2) 글에 말머리 달기 ───────────────────────────────────────────
--    **비워 둘 수 있다.** 이미 쓰인 글에는 말머리가 없고, 앞으로도 "그냥 글"을
--    막을 이유가 없다. NOT NULL 로 두면 기존 글을 전부 어딘가에 밀어 넣어야 한다.
--
--    ON DELETE SET NULL — 말머리를 지운다고 그 말머리를 쓰던 글까지 사라지면
--    사고다. 말머리만 떨어지고 글은 남는다.

ALTER TABLE staffroom_posts
  ADD COLUMN IF NOT EXISTS category_id UUID
    REFERENCES staffroom_categories(id) ON DELETE SET NULL;

COMMENT ON COLUMN staffroom_posts.category_id IS '말머리. 비어 있을 수 있다(말머리 없는 글). 말머리를 지우면 NULL 이 되고 글은 남는다.';

CREATE INDEX IF NOT EXISTS idx_staffroom_posts_category
  ON staffroom_posts (module_id, category_id, created_at DESC);

-- ── 3) 해시태그 ───────────────────────────────────────────────────
--    글 하나에 여러 개. 표를 따로 두는 이유는 **태그로 찾기** 때문이다.
--    글 행에 쉼표로 이어 붙이면 `LIKE '%체육%'` 이 되어 "체육대회"를 찾을 때
--    "체육"도 걸리고, 개수가 늘수록 느려진다.
--
--    department_id 를 함께 두는 이유: 부서 단위 정리·확인을 글을 거치지 않고
--    한 번에 하기 위해서다(050 의 글·댓글과 같은 이유).

CREATE TABLE IF NOT EXISTS staffroom_post_tags (
  post_id        UUID NOT NULL REFERENCES staffroom_posts(id) ON DELETE CASCADE,
  department_id  UUID NOT NULL REFERENCES staffroom_departments(id) ON DELETE CASCADE,
  tag            TEXT NOT NULL,
  PRIMARY KEY (post_id, tag)
);

COMMENT ON TABLE  staffroom_post_tags     IS '온라인 교무실: 글 해시태그. 글이 지워지면 함께 지워진다. 같은 글에 같은 태그가 두 번 붙지 않는다(기본키).';
COMMENT ON COLUMN staffroom_post_tags.tag IS '앞의 # 를 떼고 앞뒤 공백을 정리한 값만 저장한다(domain/rules/staffRoomTaxonomy.ts). "#체육대회" 와 "체육대회" 가 다른 태그로 갈리지 않게.';

-- 태그로 글 찾기 — 부서 안에서 같은 태그를 모은다
CREATE INDEX IF NOT EXISTS idx_staffroom_post_tags_lookup
  ON staffroom_post_tags (department_id, tag);

ALTER TABLE staffroom_post_tags ENABLE ROW LEVEL SECURITY;

-- ── 4) 격리 — service_role 전용 (049·050 과 같은 방식) ────────────

DO $$
DECLARE
  v_table  TEXT;
  v_policy TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['staffroom_categories', 'staffroom_post_tags'] LOOP
    v_policy := v_table || '_service_role_only';

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = v_table AND policyname = v_policy
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL USING (auth.role() = ''service_role'') WITH CHECK (auth.role() = ''service_role'')',
        v_policy, v_table
      );
    END IF;

    -- 두 겹째 — 정책이 실수로 느슨해져도 권한 자체가 없으면 닿지 못한다
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', v_table);
  END LOOP;
END $$;
