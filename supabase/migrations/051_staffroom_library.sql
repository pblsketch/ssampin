-- =====================================================================
-- 051_staffroom_library.sql
-- 온라인 교무실 M3 — 자료실 · 미리보기 · 새 버전 · 용량 표시 · 부서 전체 검색
--
-- 계획서: docs/01-plan/features/online-staffroom.plan.md
--   §3.2.1 올리는 길만이 아니라 **읽는 길도** 서버를 거쳐야 한다
--   §3.4-가 미리보기·검색 글자도 **드라이브에** 둔다 (서버에 쌓지 않는다)
--   §3.4-나 내려받기는 서버가 **권한만 주고 빠진다** (바이트를 나르지 않는다)
--   §4     kordoc 미리보기 · pptx 는 구글 뷰어 · HTML 은 격리
--   §8-C   같은 파일 새 버전 · 부서 용량 표시
--   §9     M3
--   §10.6  파일당 200MB 상한 · 멤버 내보낼 때 파일 정리 묻기
--
-- ── ★ 이 표들에 **파일 내용이 없다** ────────────────────────────────
-- 원본도, 미리보기 글자도 여기 없다. 전부 관리자 선생님의 구글 드라이브에 있고
-- 아래 표는 **그걸 가리키는 표찰**만 들고 있다(드라이브 파일 id · 이름 · 크기 · 올린 사람).
--
-- 이유가 둘이다.
--   1) 전송량 — 무료 등급의 월 5GB 를 자료실이 혼자 먹으면 챗봇·상담·과제까지 같이 죽는다.
--      200MB 파일 25번이면 한 달치가 끝난다(§3.4).
--   2) 개인정보 — 파일에서 뽑은 글자에는 학생 이름이 들어 있다. 그 글자가 쌤핀 서버에
--      복제되지 않는다는 것이 §4.1 이 `IDocumentParserPort` 의 "파싱은 로컬에서만"
--      약속과 충돌하지 않는 이유다.
--
-- ── 격리는 049·050 과 같은 두 겹 ────────────────────────────────────
--   1) DB 층 — 아래 표는 전부 service_role 전용. anon/authenticated 는 GRANT 회수.
--   2) 함수 층 — staffroom-* Edge Function 이 구글로 신원을 확인하고
--      staffroom_members 에 있는지 본 뒤에만 응답한다.
-- 근거: DECISIONS.md ADR-062 · ADR-065.
-- =====================================================================

-- ══════════════════════════════════════════════════════════════════
-- 0) 부서마다 드라이브 폴더 하나
--    관리자 토큰으로 만든 폴더다. 자료실 파일은 전부 이 아래로 들어간다.
--    올리기 세션을 내줄 때 "이 폴더 아래"로 못박아야, 멤버가 세션 주소를
--    받아 엉뚱한 곳에 쓰는 일을 막을 수 있다(§3.4-나 의 올리기 판).
-- ══════════════════════════════════════════════════════════════════
ALTER TABLE staffroom_departments
  ADD COLUMN IF NOT EXISTS drive_folder_id TEXT;

COMMENT ON COLUMN staffroom_departments.drive_folder_id
  IS '이 부서 자료가 쌓이는 관리자 드라이브 폴더 id. 관리자가 토큰을 맡긴 뒤 첫 업로드 때 만들어진다. 없으면 자료실이 아직 열리지 않은 상태다.';

-- ══════════════════════════════════════════════════════════════════
-- 1) staffroom_files — 자료실 파일 (현재 판)
--
--    이전 판은 staffroom_file_versions 로 접혀 들어간다(§8-C).
--    "계획서_최종_최종2_진짜최종" 문제를 파일을 늘리지 않고 푸는 방식이다.
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS staffroom_files (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id   UUID        NOT NULL REFERENCES staffroom_departments(id) ON DELETE CASCADE,
  module_id       UUID        NOT NULL REFERENCES staffroom_modules(id) ON DELETE CASCADE,
  drive_file_id   TEXT        NOT NULL,
  name            TEXT        NOT NULL,
  mime_type       TEXT        NOT NULL DEFAULT 'application/octet-stream',
  size            BIGINT      NOT NULL DEFAULT 0,
  uploader_email  TEXT        NOT NULL,
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  version         INTEGER     NOT NULL DEFAULT 1,
  preview_file_id TEXT,
  preview_size    BIGINT      NOT NULL DEFAULT 0
);

COMMENT ON TABLE  staffroom_files                 IS '온라인 교무실 자료실: 파일 표찰. **파일 내용은 여기 없다** — 관리자 드라이브에 있고 여기는 가리키기만 한다(계획서 §3.4).';
COMMENT ON COLUMN staffroom_files.drive_file_id   IS '관리자 드라이브의 파일 id. 멤버는 이것만으로 못 연다 — drive.file 은 계정마다 따로 걸리므로 서버가 지메일에 권한을 줘야 한다(§3.2.1).';
COMMENT ON COLUMN staffroom_files.size            IS '바이트. 파일당 200MB 상한은 올리기 전에 막는다(§10.6).';
COMMENT ON COLUMN staffroom_files.version         IS '몇 번째 판인가. 새 판을 올리면 1 오르고 이전 판은 staffroom_file_versions 로 접힌다(§8-C).';
COMMENT ON COLUMN staffroom_files.preview_file_id IS 'kordoc 이 뽑은 글자가 담긴 **드라이브** 파일 id. 글자도 서버에 쌓지 않는다(§3.4-가). 뽑을 수 없는 종류면 NULL.';

CREATE INDEX IF NOT EXISTS idx_staffroom_files_module
  ON staffroom_files (module_id, uploaded_at DESC);

CREATE INDEX IF NOT EXISTS idx_staffroom_files_department
  ON staffroom_files (department_id);

-- 같은 부서 안에서 드라이브 파일 id 가 겹치면 안 된다(중복 커밋 방지)
CREATE UNIQUE INDEX IF NOT EXISTS uq_staffroom_files_drive
  ON staffroom_files (department_id, drive_file_id);

ALTER TABLE staffroom_files ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════
-- 2) staffroom_file_versions — 접어 둔 이전 판 (§8-C)
--
--    ★ 드라이브 파일을 지우지 않는다. 새 판을 올려도 이전 판 파일은 그대로 남아
--      "잘못 덮었다"에서 되돌릴 수 있다. 용량을 먹지만, 업무 문서에서
--      되돌릴 길이 없는 편이 훨씬 비싸다.
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS staffroom_file_versions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id         UUID        NOT NULL REFERENCES staffroom_files(id) ON DELETE CASCADE,
  version         INTEGER     NOT NULL,
  drive_file_id   TEXT        NOT NULL,
  name            TEXT        NOT NULL,
  size            BIGINT      NOT NULL DEFAULT 0,
  uploader_email  TEXT        NOT NULL,
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  preview_file_id TEXT
);

COMMENT ON TABLE staffroom_file_versions IS '온라인 교무실 자료실: 접어 둔 이전 판(계획서 §8-C). 드라이브 원본은 지우지 않아 되돌릴 수 있다.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_staffroom_file_versions
  ON staffroom_file_versions (file_id, version);

ALTER TABLE staffroom_file_versions ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════
-- 3) staffroom_upload_tickets — 올리기 표 (ADR-065)
--
--    ★ 왜 표가 필요한가 — 파일 바이트가 서버를 지나지 않기 때문이다.
--
--    서버는 구글에서 **업로드 세션 주소**만 받아 멤버에게 건네주고 빠진다.
--    멤버의 쌤핀이 구글로 곧장 올리고, 다 되면 "올렸습니다" 하고 돌아온다.
--    그 말을 그대로 믿으면 안 되므로(아무 파일 id 나 보낼 수 있다) 표를 남겨 두고
--    돌아왔을 때 이름·크기·폴더가 표와 맞는지 서버가 드라이브에 되물어 확인한다.
--
--    끝나지 않은 표는 쌓이기만 하므로 하루 지난 것은 정리한다.
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS staffroom_upload_tickets (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id     UUID        NOT NULL REFERENCES staffroom_departments(id) ON DELETE CASCADE,
  module_id         UUID        NOT NULL REFERENCES staffroom_modules(id) ON DELETE CASCADE,
  uploader_email    TEXT        NOT NULL,
  name              TEXT        NOT NULL,
  mime_type         TEXT        NOT NULL DEFAULT 'application/octet-stream',
  size              BIGINT      NOT NULL,
  folder_id         TEXT        NOT NULL,
  replaces_file_id  UUID        REFERENCES staffroom_files(id) ON DELETE CASCADE,
  kind              TEXT        NOT NULL DEFAULT 'file'
    CHECK (kind IN ('file', 'preview')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  consumed_at       TIMESTAMPTZ
);

COMMENT ON TABLE  staffroom_upload_tickets                  IS '온라인 교무실 자료실: 올리기 표. 파일이 서버를 지나지 않으므로(ADR-065), 다 올렸다고 돌아왔을 때 대조할 근거로 남긴다.';
COMMENT ON COLUMN staffroom_upload_tickets.folder_id        IS '이 표가 허락한 드라이브 폴더. 다른 곳에 올라온 파일은 커밋을 거부한다.';
COMMENT ON COLUMN staffroom_upload_tickets.replaces_file_id IS '새 판으로 덮을 파일(§8-C). 새 파일이면 NULL.';
COMMENT ON COLUMN staffroom_upload_tickets.kind             IS 'file = 원본, preview = kordoc 이 뽑은 글자. 글자도 드라이브로 가므로 같은 길을 쓴다(§3.4-가).';
COMMENT ON COLUMN staffroom_upload_tickets.consumed_at      IS '커밋된 시각. 한 표를 두 번 쓰지 못하게 한다.';

CREATE INDEX IF NOT EXISTS idx_staffroom_upload_tickets_open
  ON staffroom_upload_tickets (department_id, created_at)
  WHERE consumed_at IS NULL;

ALTER TABLE staffroom_upload_tickets ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════
-- 4) staffroom_file_grants — 누구에게 어떤 파일을 열어줬는가 (§3.4-나)
--
--    내려받기는 서버가 바이트를 나르는 대신 **그 멤버의 지메일에 읽기 권한을 주고**
--    구글 링크만 돌려준다. 파일은 구글에서 선생님에게 곧장 간다.
--
--    ★ 그래서 회수할 목록이 필요하다. 멤버를 내보낼 때 이 표를 훑어 권한을 거둔다.
--      기록이 없으면 "내보냈는데 파일은 계속 열리는" 구멍이 남는다(§10.6).
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS staffroom_file_grants (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id  UUID        NOT NULL REFERENCES staffroom_departments(id) ON DELETE CASCADE,
  file_id        UUID        NOT NULL REFERENCES staffroom_files(id) ON DELETE CASCADE,
  drive_file_id  TEXT        NOT NULL,
  member_email   TEXT        NOT NULL,
  permission_id  TEXT        NOT NULL,
  granted_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  staffroom_file_grants               IS '온라인 교무실 자료실: 멤버 지메일에 내준 드라이브 읽기 권한(계획서 §3.4-나). 내보낼 때 회수하려면 무엇을 줬는지 알아야 한다.';
COMMENT ON COLUMN staffroom_file_grants.permission_id IS '드라이브가 발급한 권한 id. 회수할 때 이 값으로 지운다.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_staffroom_file_grants
  ON staffroom_file_grants (file_id, member_email);

CREATE INDEX IF NOT EXISTS idx_staffroom_file_grants_member
  ON staffroom_file_grants (department_id, member_email);

ALTER TABLE staffroom_file_grants ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════
-- 5) RLS 정책 — 네 표 모두 service_role 전용 (049·050 과 같은 방식)
-- ══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_table TEXT;
  v_policy TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'staffroom_files',
    'staffroom_file_versions',
    'staffroom_upload_tickets',
    'staffroom_file_grants'
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
-- 6) 격리 — anon/authenticated 는 이 표들에 닿을 수 없다
--
--    RLS 정책이 없으면 어차피 0행이지만, GRANT 까지 걷어 "열람 시도 자체"를 막는다.
--    049·050 과 같은 방식이다.
-- ══════════════════════════════════════════════════════════════════
REVOKE ALL ON public.staffroom_files          FROM anon, authenticated;
REVOKE ALL ON public.staffroom_file_versions  FROM anon, authenticated;
REVOKE ALL ON public.staffroom_upload_tickets FROM anon, authenticated;
REVOKE ALL ON public.staffroom_file_grants    FROM anon, authenticated;

GRANT ALL ON public.staffroom_files          TO service_role;
GRANT ALL ON public.staffroom_file_versions  TO service_role;
GRANT ALL ON public.staffroom_upload_tickets TO service_role;
GRANT ALL ON public.staffroom_file_grants    TO service_role;

-- ══════════════════════════════════════════════════════════════════
-- 7) staffroom_storage_usage — 부서가 쓰는 용량 (§8-C)
--
--    앱이 파일 목록을 받아 더하지 않고 데이터베이스가 센다. 목록에 크기를 실어
--    보내지 않아도 되므로 전송량이 준다(§3.5-다 와 같은 이유).
--
--    ★ 이전 판(versions)도 함께 센다. 드라이브에 그대로 남아 실제로 용량을
--      먹고 있는데 빼고 세면, 화면의 숫자와 관리자가 드라이브에서 보는 숫자가
--      어긋나 "쌤핀이 거짓말한다"가 된다.
--
--    멤버십 확인은 하지 않으므로 부르는 쪽이 이미 "내가 멤버인 부서"로 좁혀서
--    넘겨야 한다. 그래서 anon 에는 EXECUTE 를 주지 않는다.
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION staffroom_storage_usage(
  p_department_ids UUID[]
)
RETURNS TABLE (department_id UUID, used_bytes BIGINT, file_count BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    d.id AS department_id,
    COALESCE(
      (SELECT SUM(f.size) + COALESCE(SUM(f.preview_size), 0)
         FROM staffroom_files f WHERE f.department_id = d.id), 0
    )
    + COALESCE(
      (SELECT SUM(v.size)
         FROM staffroom_file_versions v
         JOIN staffroom_files f2 ON f2.id = v.file_id
        WHERE f2.department_id = d.id), 0
    ) AS used_bytes,
    COALESCE(
      (SELECT COUNT(*) FROM staffroom_files f3 WHERE f3.department_id = d.id), 0
    ) AS file_count
  FROM staffroom_departments d
  WHERE d.id = ANY(p_department_ids);
$$;

COMMENT ON FUNCTION staffroom_storage_usage(UUID[])
  IS '부서별 자료실 사용량(현재 판 + 미리보기 글자 + 접어 둔 이전 판). 멤버십 확인은 하지 않으므로 부르는 쪽이 이미 좁혀서 넘겨야 한다.';

REVOKE ALL ON FUNCTION staffroom_storage_usage(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION staffroom_storage_usage(UUID[]) TO service_role;

-- ══════════════════════════════════════════════════════════════════
-- 8) 자료실 모듈을 이미 있는 부서에도 하나씩 만들어 준다
--
--    050 에서 부서마다 게시판을 하나 만들었듯이, 자료실도 부서마다 하나다.
--    M1·M2 로 이미 생긴 부서에는 없으므로 여기서 채운다.
--    (새로 만들어지는 부서는 staffroom-departments 함수가 함께 만든다.)
-- ══════════════════════════════════════════════════════════════════
INSERT INTO staffroom_modules (department_id, kind, name, position)
SELECT d.id, 'archive', '자료실', 1
  FROM staffroom_departments d
 WHERE NOT EXISTS (
   SELECT 1 FROM staffroom_modules m
    WHERE m.department_id = d.id AND m.kind = 'archive'
 );
