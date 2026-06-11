-- 035: sigv2 서명받기 재설계 — 핵심 스키마 (sigv2_ 네임스페이스)
-- - sigv2_rosters    : 재사용 명단 라이브러리 (교사별 class/teacher/custom 세트)
-- - sigv2_sessions   : 서명 세션 (draft → active → closed 상태 머신)
-- - sigv2_entries    : 행/제출 (member_ref 기준 1행 = 1서명, 중복 방지 UNIQUE)
-- - sigv2-signatures : public 이미지 버킷 (png, 256 KB 한도)
-- - RLS              : service_role 전용 (Edge Function 경유만 허용)
-- - pg_cron          : draft 세션 60일 자동 삭제 (매일 18:40 UTC = KST 03:40)
-- 주의: 029–034 마이그레이션의 기존 signature_* 테이블/버킷과 절대 이름 충돌 없음.

-- ══════════════════════════════════════════════════════════════════
-- 1) sigv2_rosters — 재사용 명단 라이브러리
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS sigv2_rosters (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_teacher_id  TEXT        NOT NULL,
  name              TEXT        NOT NULL,
  type              TEXT        NOT NULL
    CHECK (type IN ('class', 'teacher', 'custom')),
  columns           JSONB       NOT NULL DEFAULT '[]'::jsonb,
  members           JSONB       NOT NULL DEFAULT '[]'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  sigv2_rosters                      IS 'sigv2: 교사가 반복 재사용하는 명단 라이브러리. type 별로 학급/교사/커스텀을 구분한다.';
COMMENT ON COLUMN sigv2_rosters.owner_teacher_id     IS '명단 소유 교사 식별자 (Supabase Auth uid 또는 외부 시스템 ID).';
COMMENT ON COLUMN sigv2_rosters.type                 IS '명단 종류: class=학급, teacher=교원, custom=임의 목록.';
COMMENT ON COLUMN sigv2_rosters.columns              IS '동적 필드 정의 배열. 예: [{"key":"grade","label":"학년","type":"text"}].';
COMMENT ON COLUMN sigv2_rosters.members              IS '명단 구성원 배열. 각 항목은 columns 에 정의된 key 를 포함하는 객체.';

CREATE INDEX IF NOT EXISTS idx_sigv2_rosters_owner
  ON sigv2_rosters (owner_teacher_id, updated_at DESC);

ALTER TABLE sigv2_rosters ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════
-- 2) sigv2_sessions — 서명 세션
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS sigv2_sessions (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_teacher_id      TEXT        NOT NULL,
  admin_key             TEXT        NOT NULL,
  title                 TEXT        NOT NULL,
  header_text           TEXT,
  trust_mode            JSONB       NOT NULL DEFAULT '{"dedupLock":true,"accessCodeEnabled":false}'::jsonb,
  access_code_hash      TEXT,
  columns               JSONB       NOT NULL DEFAULT '[]'::jsonb,
  roster_snapshot       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  short_link_code       TEXT,
  drive_spreadsheet_id  TEXT,
  status                TEXT        NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'closed')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at            TIMESTAMPTZ
);

COMMENT ON TABLE  sigv2_sessions                      IS 'sigv2: 서명 세션. draft 로 생성 → active 공개 → closed 마감 상태 머신.';
COMMENT ON COLUMN sigv2_sessions.admin_key            IS '교사용 관리 키. 공개 응답에 절대 포함하지 않는다.';
COMMENT ON COLUMN sigv2_sessions.trust_mode           IS '중복 방지·접근 제어 설정. dedupLock: 동일 member_ref 재제출 차단. accessCodeEnabled: 접근 코드 활성화 여부.';
COMMENT ON COLUMN sigv2_sessions.access_code_hash     IS '접근 코드 SHA-256 해시. accessCodeEnabled=true 일 때만 사용.';
COMMENT ON COLUMN sigv2_sessions.columns              IS '서명 폼 동적 필드 정의 배열.';
COMMENT ON COLUMN sigv2_sessions.roster_snapshot      IS '세션 생성 시점의 명단 스냅샷. sigv2_rosters 수정 후에도 제출 기준 명단은 고정된다.';
COMMENT ON COLUMN sigv2_sessions.short_link_code      IS '숏링크 코드 (short_links.code 참조). NULL 이면 미생성.';
COMMENT ON COLUMN sigv2_sessions.drive_spreadsheet_id IS '연동된 Google Sheets 파일 ID. NULL 이면 미연동.';
COMMENT ON COLUMN sigv2_sessions.expires_at           IS '세션 만료 일시. NULL 이면 수동 마감 전까지 유효.';

CREATE INDEX IF NOT EXISTS idx_sigv2_sessions_owner
  ON sigv2_sessions (owner_teacher_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sigv2_sessions_short_link
  ON sigv2_sessions (short_link_code)
  WHERE short_link_code IS NOT NULL;

ALTER TABLE sigv2_sessions ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════
-- 3) sigv2_entries — 행/제출
--    raw IP/UA 저장 금지 — 해시 컬럼(ip_hash, ua_hash)만 보관.
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS sigv2_entries (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            UUID        NOT NULL
    REFERENCES sigv2_sessions(id) ON DELETE CASCADE,
  member_ref            TEXT        NOT NULL,
  row_data              JSONB       NOT NULL DEFAULT '{}'::jsonb,
  signer_name           TEXT        NOT NULL,
  signature_object_key  TEXT        NOT NULL,
  signature_public_url  TEXT        NOT NULL,
  signed_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_hash               TEXT,
  ua_hash               TEXT,
  UNIQUE (session_id, member_ref)
);

COMMENT ON TABLE  sigv2_entries                       IS 'sigv2: 서명 제출 행. 세션 내 member_ref 는 유일 (중복 제출 DB 레벨 차단).';
COMMENT ON COLUMN sigv2_entries.member_ref            IS '명단 구성원 식별자 (roster_snapshot 내 고유 키). UNIQUE(session_id, member_ref) 로 1인 1서명 보장.';
COMMENT ON COLUMN sigv2_entries.row_data              IS '제출 시점의 동적 필드 값 맵. columns 정의 기준 key→value.';
COMMENT ON COLUMN sigv2_entries.signature_object_key  IS 'sigv2-signatures 버킷 내 storage object key (경로). 예: {session_id}/{entry_id}.png.';
COMMENT ON COLUMN sigv2_entries.signature_public_url  IS '서명 이미지 공개 접근 URL (CDN 직접 링크).';
COMMENT ON COLUMN sigv2_entries.ip_hash               IS '제출자 IP SHA-256 해시. raw IP 는 수집/저장하지 않는다.';
COMMENT ON COLUMN sigv2_entries.ua_hash               IS '제출자 User-Agent SHA-256 해시. raw UA 는 수집/저장하지 않는다.';

CREATE INDEX IF NOT EXISTS idx_sigv2_entries_session
  ON sigv2_entries (session_id, signed_at DESC);

ALTER TABLE sigv2_entries ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════
-- 4) RLS 정책 — 세 테이블 모두 service_role 전용
--    DO $$ ... pg_policies 존재 체크 가드로 멱등 보장.
-- ══════════════════════════════════════════════════════════════════
DO $$
BEGIN
  -- sigv2_rosters
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sigv2_rosters'
      AND policyname = 'sigv2_rosters_service_all'
  ) THEN
    CREATE POLICY "sigv2_rosters_service_all" ON sigv2_rosters
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;

  -- sigv2_sessions
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sigv2_sessions'
      AND policyname = 'sigv2_sessions_service_all'
  ) THEN
    CREATE POLICY "sigv2_sessions_service_all" ON sigv2_sessions
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;

  -- sigv2_entries
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sigv2_entries'
      AND policyname = 'sigv2_entries_service_all'
  ) THEN
    CREATE POLICY "sigv2_entries_service_all" ON sigv2_entries
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════════════
-- 5) Storage 버킷: sigv2-signatures
--    public=TRUE (이미지 직접 CDN URL 제공), png 단일, 256 KB 한도
-- ══════════════════════════════════════════════════════════════════
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'sigv2-signatures',
  'sigv2-signatures',
  TRUE,
  262144,
  ARRAY['image/png']
)
ON CONFLICT (id) DO UPDATE SET
  public             = TRUE,
  file_size_limit    = 262144,
  allowed_mime_types = ARRAY['image/png'];

-- Storage RLS — service_role write + public read (객체 직접 GET 허용, 버킷 LIST 차단)
DO $$
BEGIN
  -- service_role: INSERT/UPDATE/DELETE (쓰기 전용)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'sigv2_signatures_service_write'
  ) THEN
    CREATE POLICY "sigv2_signatures_service_write" ON storage.objects
      FOR ALL
      USING (bucket_id = 'sigv2-signatures' AND auth.role() = 'service_role')
      WITH CHECK (bucket_id = 'sigv2-signatures' AND auth.role() = 'service_role');
  END IF;

  -- public: SELECT (객체 직접 GET 허용 — 버킷 LIST 는 이 정책으로 막힘)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'sigv2_signatures_public_read'
  ) THEN
    CREATE POLICY "sigv2_signatures_public_read" ON storage.objects
      FOR SELECT
      USING (bucket_id = 'sigv2-signatures');
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════════════
-- 6) pg_cron: draft 세션 60일 자동 삭제
--    - entries 는 CASCADE 로 자동 제거
--    - sigv2-signatures/{session_id}/* storage objects prefix 삭제
--    - 034 패턴과 동일한 EXCEPTION 가드 적용
-- ══════════════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION cleanup_sigv2_draft_sessions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  removed  integer := 0;
  sess_id  UUID;
BEGIN
  -- 60일 이상 경과한 draft 세션을 순회하며 storage 먼저 정리 후 행 삭제
  FOR sess_id IN
    SELECT id
    FROM sigv2_sessions
    WHERE status = 'draft'
      AND created_at < now() - INTERVAL '60 days'
  LOOP
    -- sigv2-signatures/{session_id}/* prefix 에 해당하는 objects 삭제
    DELETE FROM storage.objects
    WHERE bucket_id = 'sigv2-signatures'
      AND name LIKE sess_id::text || '/%';

    -- entries 는 ON DELETE CASCADE 로 자동 삭제; 세션 행 직접 삭제
    DELETE FROM sigv2_sessions WHERE id = sess_id;

    removed := removed + 1;
  END LOOP;

  RETURN removed;
END;
$$;

COMMENT ON FUNCTION cleanup_sigv2_draft_sessions IS
  'sigv2: 생성 후 60일 이상 경과한 draft 세션을 삭제. entries 는 CASCADE, sigv2-signatures storage objects 는 prefix 일치로 직접 제거.';

DO $$
BEGIN
  -- 매일 18:40 UTC (= KST 03:40) — draft 세션 60일 정리
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup_sigv2_draft_daily') THEN
    PERFORM cron.schedule(
      'cleanup_sigv2_draft_daily',
      '40 18 * * *',
      $cmd$ SELECT cleanup_sigv2_draft_sessions(); $cmd$
    );
  END IF;
EXCEPTION
  WHEN undefined_function THEN
    RAISE NOTICE 'pg_cron 이 활성화되지 않았습니다 — Supabase 프로젝트 설정에서 활성화 후 본 마이그레이션 재실행 또는 외부 cron 으로 폴백하세요.';
  WHEN undefined_table THEN
    RAISE NOTICE 'cron.job 테이블 없음 — pg_cron 권한 확인 필요.';
END $$;
