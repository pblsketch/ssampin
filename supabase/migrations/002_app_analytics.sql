-- App Analytics 테이블
CREATE TABLE app_analytics (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event text NOT NULL,
  properties jsonb DEFAULT '{}',
  app_version text,
  device_id text,
  os_info text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_analytics_event ON app_analytics(event);
CREATE INDEX idx_analytics_created ON app_analytics(created_at);
CREATE INDEX idx_analytics_device ON app_analytics(device_id);
CREATE INDEX idx_analytics_event_created ON app_analytics(event, created_at);

ALTER TABLE app_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous insert"
  ON app_analytics FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow service role read"
  ON app_analytics FOR SELECT TO service_role USING (true);
