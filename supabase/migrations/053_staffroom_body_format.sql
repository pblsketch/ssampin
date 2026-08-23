-- ══════════════════════════════════════════════════════════════════
-- 053_staffroom_body_format.sql
-- 온라인 교무실 — 본문이 어떤 형식으로 쓰였는지 표시하는 칸
--
-- 왜 이 칸이 필요한가
-- ───────────────────
-- 본문이 글자 덩어리 하나(body)뿐이면 화면이 "이 글을 어떻게 읽어야 하는지"
-- 판단할 근거가 없다. 서식 편집기를 붙이는 순간, 표시가 없으면 꾸밈이 통째로
-- 날아가거나 저장된 구조가 글자로 보인다.
--
-- 글이 쌓인 뒤에 넣으면 기존 행을 전부 훑어 고쳐야 한다. 아직 아무도 쓰지
-- 않는 지금이 값싸게 넣을 수 있는 유일한 시점이라 미리 박아 둔다.
-- **이 마이그레이션은 편집기가 붙기 전에 먼저 들어가는 것이 요점이다.**
--
-- 값은 두 가지뿐이다 (오너 결정 2026-08-23 · ADR-069)
-- ───────────────────────────────────────────────────
--   plain    — 맨글. 줄바꿈만 살리고 나머지 문자는 글자 그대로 보여준다.
--              이 마이그레이션 이전 글과, 편집기가 붙기 전 글이 전부 여기다.
--   lexical  — 서식 있는 글. 편집기(Lexical)가 만든 구조를 그대로 담는다.
--
-- **markdown 을 넣지 않았다.** 처음에는 마크다운을 쓰려 했으나, 오너가 보낸
-- 화면에 **글자색과 글자크기**가 있고 마크다운에는 그 둘을 적을 방법이 아예
-- 없다. 마크다운을 허용값에 남겨 두면 "화면이 그릴 줄 모르는 형식"이 저장될
-- 수 있으므로 뺀다. 나중에 필요해지면 값을 더하는 작은 마이그레이션이면 된다.
--
-- **html 도 넣지 않는다.** 교무실은 남이 쓴 글이 내 화면 안에서 펼쳐지는
-- 쌤핀 최초의 기능이다. html 을 그대로 저장하면 소독 도구가 필요한데 앱에
-- 없다. lexical 형식은 **화면이 아는 종류의 조각만 골라 그리는 구조**라
-- 소독 없이도 안전하게 다룰 수 있다(꾸밈 값도 정해진 목록만 통과시킨다).
--
-- 왜 기본값이 'plain' 인가
-- ────────────────────────
-- 이 칸이 생기기 전에 쓰인 글은 전부 맨글이다. 기본값을 lexical 로 두면
-- 옛 글을 구조로 읽으려다 실패해 본문이 빈 것처럼 보인다.
--
-- 세 표에 모두 넣는 이유
-- ──────────────────────
-- 본문을 저장했다가 나중에 다시 펼치는 자리는 세 곳이다 — 글·댓글·임시저장.
-- 임시저장은 글 본문 그 자체라 형식이 왕복하지 않으면 이어 쓸 때 깨진다.
-- 댓글은 지금 서식 계획이 없지만, 칸 하나 값이 한 줄인 데 비해 나중에
-- 마이그레이션을 또 만드는 값이 훨씬 크다.
--
-- 멱등: ADD COLUMN IF NOT EXISTS + pg_constraint 가드라 재실행해도 안전하다.
-- 격리: 세 표 모두 049·050 에서 이미 RLS + service_role 전용으로 잠겨 있고,
--       칸을 더한다고 그 잠금이 풀리지 않는다(여기서 GRANT 를 주지 않는다).
-- ══════════════════════════════════════════════════════════════════

-- ── 1) 칸 추가 ────────────────────────────────────────────────────

ALTER TABLE staffroom_posts
  ADD COLUMN IF NOT EXISTS body_format TEXT NOT NULL DEFAULT 'plain';

ALTER TABLE staffroom_comments
  ADD COLUMN IF NOT EXISTS body_format TEXT NOT NULL DEFAULT 'plain';

ALTER TABLE staffroom_drafts
  ADD COLUMN IF NOT EXISTS body_format TEXT NOT NULL DEFAULT 'plain';

-- ── 2) 값 제한 ────────────────────────────────────────────────────
--    아는 값만 들어오게 막는다. 화면이 그릴 줄 모르는 형식이 저장되면 그 글은
--    영영 제대로 안 보인다. 나중에 형식이 늘면 이 제약을 고치는 마이그레이션을
--    새로 만든다.

DO $$
DECLARE
  v_table  TEXT;
  v_check  TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'staffroom_posts',
    'staffroom_comments',
    'staffroom_drafts'
  ] LOOP
    v_check := v_table || '_body_format_check';

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = v_check
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (body_format IN (''plain'', ''lexical''))',
        v_table, v_check
      );
    END IF;
  END LOOP;
END $$;

-- ── 3) 설명 ───────────────────────────────────────────────────────

COMMENT ON COLUMN staffroom_posts.body_format IS
  '본문 형식. plain=맨글(줄바꿈만), lexical=서식 있는 글(편집기 구조 그대로). 기본 plain — 편집기가 붙기 전 글은 전부 맨글이다. html/markdown 은 두지 않는다(ADR-069).';

COMMENT ON COLUMN staffroom_comments.body_format IS
  '댓글 본문 형식. 글과 같은 규칙. M2 에서 값은 항상 plain 이고, 나중에 댓글 서식을 열 때 마이그레이션 없이 쓰려고 미리 둔다.';

COMMENT ON COLUMN staffroom_drafts.body_format IS
  '임시저장 본문 형식. 글과 함께 왕복해야 이어 쓸 때 서식이 풀리지 않는다.';
