-- 033: 서명받기 Phase 2C — compose-signed-pdf 결과 추적 (US-2C-12)
-- - signature_compositions: 결과 PDF 버전 이력 (요청 1건당 N 버전, 최신 = MAX(version))
-- - signature-results bucket: 합성 PDF 저장소 (service_role only write, public read 불허)
-- - 시각 워터마크 부재 정책: 합성 PDF 내부에는 시각 워터마크/배너 없음.
--   행정용 표시는 setKeywords (['행정용','법적효력없음','쌤핀']) + setProducer ('쌤핀 행정용') 메타.

CREATE TABLE IF NOT EXISTS signature_compositions (
  request_id UUID NOT NULL REFERENCES signature_requests(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version >= 1),
  storage_path TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL CHECK (file_size_bytes > 0),
  submission_count INTEGER NOT NULL CHECK (submission_count >= 0),
  participant_count INTEGER NOT NULL CHECK (participant_count >= 0),
  composed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, version)
);

CREATE INDEX IF NOT EXISTS idx_signature_compositions_request_latest
  ON signature_compositions (request_id, version DESC);

ALTER TABLE signature_compositions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'signature_compositions'
      AND policyname = 'signature_compositions_service_all'
  ) THEN
    CREATE POLICY "signature_compositions_service_all" ON signature_compositions
      FOR ALL USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- signature-results bucket — 비공개 (signed URL 통해서만 접근).
-- public read 미설정 — 결과 PDF 는 행정용으로 학생 광범위 노출 방지.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'signature-results',
  'signature-results',
  false,
  31457280, -- 30MB per file (80 영역 × 10 페이지 + 한글 footer 여유)
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 31457280,
  allowed_mime_types = ARRAY['application/pdf'];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'signature_results_service_all'
  ) THEN
    CREATE POLICY "signature_results_service_all" ON storage.objects
      FOR ALL USING (bucket_id = 'signature-results' AND auth.role() = 'service_role')
      WITH CHECK (bucket_id = 'signature-results' AND auth.role() = 'service_role');
  END IF;
END $$;

COMMENT ON TABLE signature_compositions IS
  'Phase 2C US-2C-12: compose-signed-pdf 결과 버전 이력. 최신 = MAX(version) WHERE request_id = ?.';
COMMENT ON COLUMN signature_compositions.storage_path IS
  'signature-results bucket 내 path: {requestId}/v{version}.pdf (idempotent).';
