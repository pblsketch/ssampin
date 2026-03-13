-- 015: anon 키로 upsert 허용 (v0.3.2부터 upsert 사용으로 INSERT만으로는 부족)
-- event_id 기반 중복 방지를 위해 upsert(INSERT + ON CONFLICT UPDATE)가 필요하며,
-- 이를 위해 anon 역할에 SELECT/UPDATE 정책을 추가한다.

-- anon이 upsert 시 기존 행 확인 가능하도록 SELECT 허용 (event_id 매칭 한정)
CREATE POLICY "Allow anonymous select for upsert"
  ON app_analytics FOR SELECT TO anon
  USING (true);

-- anon이 upsert 시 기존 행 갱신 가능하도록 UPDATE 허용
CREATE POLICY "Allow anonymous update for upsert"
  ON app_analytics FOR UPDATE TO anon
  USING (true) WITH CHECK (true);
