-- =====================================================================
-- 049_staffroom_core.sql
-- 온라인 교무실 M1 — 부서 · 멤버 · 초대 · 관리자 토큰
--
-- 계획서: docs/01-plan/features/online-staffroom.plan.md
--   §7  초대 흐름 (코드는 31자 알파벳 6자리, 입장은 구글 로그인 이메일로만)
--   §9  단계 나누기 (M1 = 부서 만들기 · 초대 · 신원 확인 · 멤버 관리)
--   §11 설계 단계에서 반드시 정하고 넘어갈 것 (부서 간 격리 / 관리자 토큰 위치)
--
-- ── 부서 간 격리(RLS) 설계 ──────────────────────────────────────────
-- 쌤핀은 Supabase Auth 를 쓰지 않는다(마이그레이션 전체에 auth.uid() 사용 0건).
-- 클라이언트가 들고 있는 것은 앱 번들에 포함된 공개 anon key 뿐이라,
-- "행 단위 정책으로 내 부서만 보이게" 하는 방식이 성립하지 않는다.
-- (anon key 는 누구나 꺼낼 수 있으므로 정책이 참조할 신원 자체가 없다.)
--
-- 그래서 격리는 두 겹으로 만든다:
--   1) DB 층 — 아래 4개 테이블은 service_role 만 접근할 수 있다.
--      anon / authenticated 는 RLS 정책도 없고 테이블 GRANT 도 회수한다.
--      → PostgREST 로 /rest/v1/staffroom_* 를 직접 때려도 한 행도 나오지 않는다.
--   2) 함수 층 — 모든 읽기·쓰기는 staffroom-* Edge Function 을 거친다.
--      함수는 요청자의 구글 access token 을 구글에 되물어 이메일을 확인하고,
--      그 이메일이 staffroom_members 에 있는지 본 뒤에만 응답한다.
--      → "남의 부서 글·멤버·초대 코드가 보이지 않는다"는 이 확인이 보장한다.
--
-- 044_revoke_secret_columns_from_anon.sql 에서 배운 것을 반영했다 —
-- RLS 는 행 단위라 열을 가리지 못하고, 클라이언트가 select 목록에서 빼는 것은
-- 방어가 아니다. 여기서는 아예 테이블 GRANT 를 회수해 열람 경로를 없앤다.
--
-- ── 관리자 토큰을 teacher_tokens 와 나눈 이유 ────────────────────────
-- 계획서 §11 의 미결 항목이었다. 별도 테이블(staffroom_admin_tokens)로 둔다.
--   - teacher_tokens 는 과제 제출 기능의 것이다. 같이 쓰면 한쪽 사고가 다른 쪽으로 번진다.
--   - 수명이 다르다. 과제 토큰은 과제가 끝나면 쓸모가 없지만, 교무실 관리자 토큰은
--     §3.2.1 대로 "자료를 읽는 길"까지 떠받치므로 부서가 살아 있는 동안 계속 필요하다.
--   - 소유 단위가 다르다. teacher_tokens 는 교사 1명, 이쪽은 부서 1개다.
--     한 선생님이 여러 부서의 관리자일 수 있고 부서마다 따로 끊길 수 있다.
--   - 암호화 키도 STAFFROOM_ENCRYPTION_KEY 로 분리한다(미설정 시 ENCRYPTION_KEY 폴백 + 경고).
--     자세한 근거는 DECISIONS.md ADR-062.
-- =====================================================================

-- ══════════════════════════════════════════════════════════════════
-- 1) staffroom_departments — 부서
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS staffroom_departments (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  description   TEXT,
  owner_email   TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  staffroom_departments             IS '온라인 교무실: 부서. 만든 선생님이 관리자가 되고 자료는 그 사람 구글 드라이브에 쌓인다.';
COMMENT ON COLUMN staffroom_departments.owner_email IS '부서를 만든 선생님의 지메일. 자료가 쌓이는 드라이브의 주인이자 최초 관리자.';
COMMENT ON COLUMN staffroom_departments.description IS '한 줄 소개. 배너 꾸미기는 M4 이므로 M1 에는 이미지 컬럼을 두지 않는다.';

CREATE INDEX IF NOT EXISTS idx_staffroom_departments_owner
  ON staffroom_departments (owner_email, created_at DESC);

ALTER TABLE staffroom_departments ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════
-- 2) staffroom_members — 부서 멤버
--    신원의 정본은 구글 로그인으로 확인한 지메일이다(§7).
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS staffroom_members (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id  UUID        NOT NULL REFERENCES staffroom_departments(id) ON DELETE CASCADE,
  member_email   TEXT        NOT NULL,
  display_name   TEXT,
  role           TEXT        NOT NULL DEFAULT 'member'
    CHECK (role IN ('admin', 'member')),
  joined_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (department_id, member_email)
);

COMMENT ON TABLE  staffroom_members               IS '온라인 교무실: 부서 멤버. UNIQUE(department_id, member_email) 로 같은 사람이 두 번 들어오지 않는다.';
COMMENT ON COLUMN staffroom_members.member_email  IS '구글 로그인으로 서버가 확인한 지메일(소문자 정규화). 초대 코드는 초대장일 뿐 이 값이 신원이다.';
COMMENT ON COLUMN staffroom_members.role          IS '권한 2단계: admin=부서 관리자, member=일반. 세 번째 등급은 만들지 않는다.';

-- "내가 속한 부서 목록"을 지메일로 찾는 경로 — 가장 자주 쓰인다
CREATE INDEX IF NOT EXISTS idx_staffroom_members_email
  ON staffroom_members (member_email);

CREATE INDEX IF NOT EXISTS idx_staffroom_members_department
  ON staffroom_members (department_id, joined_at);

ALTER TABLE staffroom_members ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════
-- 3) staffroom_invites — 초대
--    code 는 31자 알파벳 6자리(31^6 ≈ 8.9억). 숫자 6자리(100만)를 쓰지 않는다.
--    경우의 수만으로 막지 않고 staffroom-join 에서 rateLimit 을 함께 건다.
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS staffroom_invites (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id  UUID        NOT NULL REFERENCES staffroom_departments(id) ON DELETE CASCADE,
  code           TEXT        NOT NULL UNIQUE,
  expires_at     TIMESTAMPTZ,
  revoked_at     TIMESTAMPTZ,
  max_uses       INTEGER,
  use_count      INTEGER     NOT NULL DEFAULT 0,
  created_by     TEXT        NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT staffroom_invites_code_format CHECK (code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$'),
  CONSTRAINT staffroom_invites_max_uses_positive CHECK (max_uses IS NULL OR max_uses > 0)
);

COMMENT ON TABLE  staffroom_invites            IS '온라인 교무실: 초대장. 링크·코드는 초대장일 뿐 열쇠가 아니며 입장은 구글 로그인으로만 이뤄진다(계획서 §7).';
COMMENT ON COLUMN staffroom_invites.code       IS '31자 알파벳(혼동 문자 0/O/1/I/L 제외) 6자리. BoardSessionCode 와 같은 규칙.';
COMMENT ON COLUMN staffroom_invites.expires_at IS '만료 시각. NULL 이면 무기한.';
COMMENT ON COLUMN staffroom_invites.revoked_at IS '관리자가 해지한 시각. NULL 이면 살아 있음.';
COMMENT ON COLUMN staffroom_invites.max_uses   IS '이 초대로 들어올 수 있는 최대 인원. NULL 이면 제한 없음.';

CREATE INDEX IF NOT EXISTS idx_staffroom_invites_department
  ON staffroom_invites (department_id, created_at DESC);

ALTER TABLE staffroom_invites ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════
-- 4) staffroom_admin_tokens — 부서 관리자 구글 토큰 (AES-256-GCM)
--    teacher_tokens 와 같은 컬럼 모양이지만 별도 테이블이다(위 헤더 참고).
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS staffroom_admin_tokens (
  department_id            UUID        PRIMARY KEY REFERENCES staffroom_departments(id) ON DELETE CASCADE,
  admin_email              TEXT        NOT NULL,
  encrypted_access_token   TEXT        NOT NULL,
  access_iv                TEXT        NOT NULL,
  access_tag               TEXT        NOT NULL,
  encrypted_refresh_token  TEXT        NOT NULL,
  refresh_iv               TEXT        NOT NULL,
  refresh_tag              TEXT        NOT NULL,
  expires_at               TIMESTAMPTZ NOT NULL,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  staffroom_admin_tokens             IS '온라인 교무실: 부서 관리자의 구글 토큰(AES-256-GCM). 자료를 쓰는 길과 읽는 길 양쪽이 이 토큰에 걸린다(계획서 §3.2.1).';
COMMENT ON COLUMN staffroom_admin_tokens.admin_email IS '이 토큰의 주인. 관리자가 바뀌면(M6 관리자 넘겨주기) 이 행이 교체된다.';

ALTER TABLE staffroom_admin_tokens ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════
-- 5) RLS 정책 — 네 테이블 모두 service_role 전용
--    pg_policies 존재 확인 가드로 멱등 보장 (035 와 같은 방식).
-- ══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_table TEXT;
  v_policy TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'staffroom_departments',
    'staffroom_members',
    'staffroom_invites',
    'staffroom_admin_tokens'
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
-- 6) anon / authenticated 권한 회수
--    RLS 정책이 없으면 어차피 0행이지만, GRANT 까지 걷어 "열람 시도 자체"를
--    막는다. 정책을 나중에 누가 실수로 넓혀도 이 회수가 남아 있으면
--    남의 부서가 통째로 새는 사고로 이어지지 않는다.
-- ══════════════════════════════════════════════════════════════════
REVOKE ALL ON public.staffroom_departments   FROM anon, authenticated;
REVOKE ALL ON public.staffroom_members       FROM anon, authenticated;
REVOKE ALL ON public.staffroom_invites       FROM anon, authenticated;
REVOKE ALL ON public.staffroom_admin_tokens  FROM anon, authenticated;

GRANT ALL ON public.staffroom_departments   TO service_role;
GRANT ALL ON public.staffroom_members       TO service_role;
GRANT ALL ON public.staffroom_invites       TO service_role;
GRANT ALL ON public.staffroom_admin_tokens  TO service_role;

-- ══════════════════════════════════════════════════════════════════
-- 7) 초대 수락 원자 처리 — 코드 확인 → 멤버 등록 → 사용 횟수 증가
--    max_uses 를 여러 사람이 동시에 밀어 넣어도 정원을 넘지 않도록
--    초대 행을 FOR UPDATE 로 잠근다.
--    service_role 전용 — anon 에는 EXECUTE 를 주지 않는다.
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION staffroom_accept_invite(
  p_code         TEXT,
  p_email        TEXT,
  p_display_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invite    staffroom_invites%ROWTYPE;
  v_email     TEXT := lower(trim(p_email));
  v_member_id UUID;
  v_dept_name TEXT;
BEGIN
  IF v_email = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_email');
  END IF;

  SELECT * INTO v_invite
  FROM staffroom_invites
  WHERE code = upper(trim(p_code))
  FOR UPDATE;

  IF v_invite.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invite_not_found');
  END IF;

  IF v_invite.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invite_revoked');
  END IF;

  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at <= now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'invite_expired');
  END IF;

  IF v_invite.max_uses IS NOT NULL AND v_invite.use_count >= v_invite.max_uses THEN
    RETURN jsonb_build_object('success', false, 'error', 'invite_full');
  END IF;

  SELECT name INTO v_dept_name
  FROM staffroom_departments
  WHERE id = v_invite.department_id;

  -- 이미 멤버면 사용 횟수를 올리지 않고 그대로 알려준다
  SELECT id INTO v_member_id
  FROM staffroom_members
  WHERE department_id = v_invite.department_id AND member_email = v_email;

  IF v_member_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'already_member',
      'departmentId', v_invite.department_id,
      'departmentName', v_dept_name
    );
  END IF;

  INSERT INTO staffroom_members (department_id, member_email, display_name, role)
  VALUES (v_invite.department_id, v_email, nullif(trim(coalesce(p_display_name, '')), ''), 'member')
  RETURNING id INTO v_member_id;

  UPDATE staffroom_invites
  SET use_count = use_count + 1
  WHERE id = v_invite.id;

  RETURN jsonb_build_object(
    'success', true,
    'memberId', v_member_id,
    'departmentId', v_invite.department_id,
    'departmentName', v_dept_name
  );
END;
$$;

COMMENT ON FUNCTION staffroom_accept_invite(TEXT, TEXT, TEXT)
  IS '초대 코드 확인 → 멤버 등록 → 사용 횟수 증가를 한 트랜잭션으로 처리한다. 이메일은 Edge Function 이 구글에 확인한 값만 넘겨야 한다.';

REVOKE ALL ON FUNCTION staffroom_accept_invite(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION staffroom_accept_invite(TEXT, TEXT, TEXT) TO service_role;
