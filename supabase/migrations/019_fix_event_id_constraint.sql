-- 019: event_id UNIQUE 제약조건 수정
-- 문제: partial unique index (WHERE event_id IS NOT NULL)는 ON CONFLICT(event_id)와 호환되지 않음
-- v0.3.2부터 upsert(ON CONFLICT event_id)를 사용하지만, 적합한 unique constraint가 없어
-- 모든 upsert가 실패 → v0.3.2+ 사용자의 analytics 데이터 전체 누락

-- 1. 기존 partial unique index 제거 (존재할 경우)
DROP INDEX IF EXISTS idx_analytics_event_id;

-- 2. event_id 컬럼 추가 (혹시 없는 경우 대비)
ALTER TABLE app_analytics ADD COLUMN IF NOT EXISTS event_id TEXT;

-- 3. 비-partial unique constraint 생성 (NULL 값은 PostgreSQL에서 서로 distinct로 취급됨)
ALTER TABLE app_analytics ADD CONSTRAINT uq_analytics_event_id UNIQUE (event_id);

-- 4. anon 역할에 upsert 지원을 위한 RLS 정책 추가 (이미 존재하면 무시)
DO $$
BEGIN
  -- SELECT 정책
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'app_analytics'
      AND policyname = 'Allow anonymous select for upsert'
  ) THEN
    CREATE POLICY "Allow anonymous select for upsert"
      ON app_analytics FOR SELECT TO anon USING (true);
  END IF;

  -- UPDATE 정책
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'app_analytics'
      AND policyname = 'Allow anonymous update for upsert'
  ) THEN
    CREATE POLICY "Allow anonymous update for upsert"
      ON app_analytics FOR UPDATE TO anon USING (true) WITH CHECK (true);
  END IF;
END
$$;
