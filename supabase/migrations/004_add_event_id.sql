-- event_id 컬럼 추가 (중복 이벤트 방지용)
ALTER TABLE app_analytics ADD COLUMN event_id TEXT;
CREATE UNIQUE INDEX idx_analytics_event_id ON app_analytics(event_id) WHERE event_id IS NOT NULL;
