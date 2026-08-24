-- ══════════════════════════════════════════════════════════════════
-- 056_staffroom_draft_taxonomy.sql
-- 온라인 교무실 — 임시저장이 말머리·태그·첨부까지 보관한다
--
-- 왜 지금 넓히는가 (v2.4.4 UltraQA P1 의 근본 해법)
-- ─────────────────────────────────────────────────
-- 임시저장(050 의 staffroom_drafts)은 제목·본문만 보관했다. 글쓰기 화면은
-- 054(말머리·태그)·055(첨부)로 고를 것이 늘었는데 임시저장은 그대로라,
-- 쓰다 만 글을 이어 열면 골라 둔 말머리·태그·첨부가 조용히 사라졌다.
-- 임시 조치로 배너 문구를 사실대로("다시 골라주세요") 바꿔 두었지만,
-- 사라지지 않는 것이 맞다 — 세 값을 임시저장 행에 함께 둔다.
--
-- 왜 별도 표가 아니라 칸 추가인가
-- ──────────────────────────────
-- 글(054·055)은 태그·첨부를 별도 표에 둔다 — 태그로 찾기, 부서 단위 정리,
-- "지워진 파일" 표시 같은 일이 있어서다. 임시저장은 그 일이 하나도 없다.
-- 사람×게시판마다 한 행뿐이고, 검색·집계 없이 글쓰기 화면과 왕복만 한다.
-- 별도 표를 만들면 upsert 한 번이 표 세 개의 트랜잭션이 된다.
--
--   tags     — TEXT[]. 저장할 때 서버가 글과 같은 규칙(normalizeTags)으로
--              다듬어 넣으므로 표를 나눠 얻을 게 없다.
--   file_ids — UUID[]. 배열 원소에는 FK 를 걸 수 없지만, 임시저장은
--              가리키기만 한다 — 자료실에서 지워진 파일은 복원 시 화면이
--              "지워진 파일"로 보여주고, 글을 올릴 때 staffroom-posts 가
--              부서 자료실 대조(resolveDepartmentFiles)로 걸러낸다.
--
-- category_id 는 054 의 글과 같은 이유로 ON DELETE SET NULL —
-- 관리자가 말머리를 지웠다고 쓰다 만 글(제목·본문)까지 사라지면 사고다.
--
-- 격리: 새 표가 없으므로 새 정책도 없다. 050 이 잠근 RLS·REVOKE 를
--       그대로 물려받는다 — 여기서 GRANT 를 주지 않는 것이 곧 격리 유지다.
-- 멱등: ADD COLUMN IF NOT EXISTS.
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE staffroom_drafts
  ADD COLUMN IF NOT EXISTS category_id UUID
    REFERENCES staffroom_categories(id) ON DELETE SET NULL;

ALTER TABLE staffroom_drafts
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE staffroom_drafts
  ADD COLUMN IF NOT EXISTS file_ids UUID[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN staffroom_drafts.category_id IS '쓰다 만 글의 말머리. 비어 있을 수 있고, 말머리를 지우면 NULL 이 된다(글은 남는다 — 054 와 같은 이유).';
COMMENT ON COLUMN staffroom_drafts.tags        IS '쓰다 만 글의 해시태그. 글의 별도 표(054)와 달리 검색·집계가 없어 행에 배열로 둔다. 서버가 글과 같은 규칙으로 다듬어 넣는다.';
COMMENT ON COLUMN staffroom_drafts.file_ids    IS '쓰다 만 글에 붙여 둔 자료실 파일 id. 배열이라 FK 가 없다 — 지워진 파일은 복원 시 화면이 알리고, 게시 시 staffroom-posts 가 걸러낸다.';
