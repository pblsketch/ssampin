-- ══════════════════════════════════════════════════════════════════
-- 055_staffroom_post_attachments.sql
-- 온라인 교무실 — 글에 자료실 파일 붙이기
--
-- 왜 파일을 새로 올리는 길을 만들지 않는가
-- ────────────────────────────────────────
-- 자료실(051)이 이미 다 한다 — 관리자 드라이브에 올리고, 남이 열 수 있게 권한을
-- 내주고(`staffroom_file_grants`), 미리보기 글자를 뽑고, 새 판을 쌓는다.
-- **글 첨부는 그 파일을 가리키기만 한다.** 별도 경로를 만들면 같은 파일이 두 곳에
-- 쌓이고, 권한 내주는 규칙도 두 벌이 된다.
--
-- 오너 결정(2026-08-21)이 "첨부는 M3 자료실과 함께"였던 이유가 이것이다 —
-- 남이 파일을 열게 해주는 부품이 M3 에 있어서, 그게 없으면 "올렸는데 못 여는"
-- 상태가 된다. 이제 그 부품이 있으므로 잇기만 하면 된다.
--
-- 자료실에서 파일을 지우면 글에서 어떻게 보이는가
-- ──────────────────────────────────────────────
-- **첨부 줄은 남기고 "지워진 파일"로 보여준다.** 두 가지를 견줬다:
--
--   (가) 함께 지운다(CASCADE) — 첨부가 조용히 사라진다. 글쓴이도 읽는 사람도
--        "내가 붙였던 그 파일이 어디 갔지" 하고 글이 고쳐진 줄 안다.
--   (나) 줄은 남기고 파일만 떨어뜨린다(SET NULL) — "○○.hwp (자료실에서
--        지워졌어요)" 라고 알릴 수 있다.
--
-- (나)를 골랐다. 조용히 사라지는 쪽이 더 나쁘다. 그래서 `file_id` 를 비울 수 있게
-- 두고, **이름을 따로 적어 둔다** — 파일이 지워지면 이름을 알 길이 없어서다.
--
-- 격리: 049~054 와 같은 두 겹. 멱등.
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS staffroom_post_attachments (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id        UUID        NOT NULL REFERENCES staffroom_posts(id) ON DELETE CASCADE,
  department_id  UUID        NOT NULL REFERENCES staffroom_departments(id) ON DELETE CASCADE,
  -- 자료실에서 지워지면 NULL 이 된다. 줄은 남아서 "지워진 파일"로 보인다.
  file_id        UUID        REFERENCES staffroom_files(id) ON DELETE SET NULL,
  -- 지워진 뒤에도 무엇이었는지 알리기 위한 이름. 붙일 때의 이름을 적어 둔다.
  file_name      TEXT        NOT NULL,
  position       INTEGER     NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  staffroom_post_attachments           IS '온라인 교무실: 글에 붙인 자료실 파일. 파일 자체는 자료실(staffroom_files)에 있고 여기는 가리키기만 한다.';
COMMENT ON COLUMN staffroom_post_attachments.file_id   IS '자료실 파일. 자료실에서 지워지면 NULL 이 되고 줄은 남는다 — 첨부가 조용히 사라지지 않게.';
COMMENT ON COLUMN staffroom_post_attachments.file_name IS '붙일 때의 파일 이름. 파일이 지워진 뒤에도 무엇이었는지 알리기 위해 따로 적어 둔다.';

-- 같은 글에 같은 파일을 두 번 붙이지 않는다.
-- 부분 인덱스인 이유: 지워진 첨부(file_id 가 NULL)는 여럿일 수 있다.
CREATE UNIQUE INDEX IF NOT EXISTS idx_staffroom_post_attachments_unique
  ON staffroom_post_attachments (post_id, file_id)
  WHERE file_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_staffroom_post_attachments_post
  ON staffroom_post_attachments (post_id, position, created_at);

ALTER TABLE staffroom_post_attachments ENABLE ROW LEVEL SECURITY;

-- ── 격리 — service_role 전용 (049~054 와 같은 방식) ───────────────

DO $$
DECLARE
  v_table  TEXT := 'staffroom_post_attachments';
  v_policy TEXT := 'staffroom_post_attachments_service_role_only';
BEGIN
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
END $$;
