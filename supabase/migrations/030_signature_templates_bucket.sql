-- 030: 서명받기 Phase 2C — PDF 양식 (signature-templates) 저장소 + 마이그레이션
-- - 교사가 직접 업로드한 PDF 양식 원본을 보관한다.
-- - 029 의 signature-images bucket 패턴과 동일 (private + service_role only).
-- - validate-pdf-upload Edge Function 만 업로드/조회 가능 (anon/authenticated 직접 차단).
--
-- 저장 경로: signature-templates/{teacherId}/{templateId}.pdf
--   teacherId = 029 의 signature_requests.teacher_id 와 동일 (anon-{sha256(ip)} 또는 google sub)
--   templateId = uuid (PdfTemplate.storagePath 의 파일명)

-- 1) Storage bucket — 10MB / pdf only
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'signature-templates',
  'signature-templates',
  false,
  10485760, -- 10MB
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['application/pdf'];

-- 2) RLS — service_role only (anon / authenticated 직접 차단)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'signature_templates_service_all'
  ) THEN
    CREATE POLICY "signature_templates_service_all" ON storage.objects
      FOR ALL USING (bucket_id = 'signature-templates' AND auth.role() = 'service_role')
      WITH CHECK (bucket_id = 'signature-templates' AND auth.role() = 'service_role');
  END IF;
END $$;

-- 3) signature_requests 테이블에 pdf_template / regions / region_version 컬럼 추가
--    029 에는 PDF 오버레이 모델이 없었음. Phase 2C 에서 신규.
--    pdf_template 은 JSON {storagePath, pageCount, fileSize, uploadedAt}.
--    regions 는 JSON SignatureRegion[] (좌표 기반 매핑).
--    region_version 은 디자이너 편집 시 증분 — pre-render 경로의 cache-bust 세그먼트.

ALTER TABLE signature_requests
  ADD COLUMN IF NOT EXISTS pdf_template JSONB,
  ADD COLUMN IF NOT EXISTS regions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS region_version INTEGER NOT NULL DEFAULT 0;

-- 4) status 컬럼의 CHECK 제약을 새 값 (publishing / publish_failed) 까지 허용하도록 갱신
--    029 의 기존 CHECK: ('draft', 'active', 'closed', 'archived')
--    Phase 2C 추가: 'publishing', 'publish_failed'
ALTER TABLE signature_requests DROP CONSTRAINT IF EXISTS signature_requests_status_check;
ALTER TABLE signature_requests
  ADD CONSTRAINT signature_requests_status_check
  CHECK (status IN ('draft', 'publishing', 'active', 'closed', 'archived', 'publish_failed'));

-- 5) 인덱스 — teacherId 단위 PDF 양식 조회 용
CREATE INDEX IF NOT EXISTS idx_signature_requests_pdf_template
  ON signature_requests USING gin (pdf_template);

COMMENT ON COLUMN signature_requests.pdf_template
  IS 'Phase 2C: 교사 업로드 PDF 양식 메타데이터 {storagePath, pageCount, fileSize, uploadedAt}.';
COMMENT ON COLUMN signature_requests.regions
  IS 'Phase 2C: SignatureRegion[] — 좌표 기반 서명 영역 (pdf-region 모델).';
COMMENT ON COLUMN signature_requests.region_version
  IS 'Phase 2C: 디자이너 편집 시 증분. pre-render Storage 경로의 cache-bust 세그먼트.';
