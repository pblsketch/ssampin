-- 012: URL 축약 (숏링크) 테이블
CREATE TABLE IF NOT EXISTS short_links (
  code TEXT PRIMARY KEY,                    -- 6자리 영숫자 코드 (예: "Xk3mP9") 또는 커스텀 코드
  target_path TEXT NOT NULL,                -- 원본 경로 (예: "/submit/uuid-here")
  expires_at TIMESTAMPTZ,                   -- 만료일시 (NULL = 영구)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_short_links_target ON short_links(target_path);

-- RLS: 공개 읽기 (리다이렉트용) + 공개 삽입
ALTER TABLE short_links ENABLE ROW LEVEL SECURITY;

-- 만료되지 않은 링크만 읽기 가능
CREATE POLICY "short_links_public_read" ON short_links
  FOR SELECT USING (expires_at IS NULL OR expires_at > NOW());

CREATE POLICY "short_links_public_insert" ON short_links
  FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "short_links_service_all" ON short_links
  FOR ALL USING (auth.role() = 'service_role');
