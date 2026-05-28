-- 031: 서명받기 Phase 2C — 클라이언트 사이드 pre-render 결과 (signature-previews) 저장소
-- - 교사 브라우저가 pdfjs-dist 5.x 로 PDF 페이지 + region cutout 을 PNG 로 렌더링한 결과.
-- - signature-templates 와 분리한 이유: mime type 이 image/png (PDF 와 다름) + 라이프사이클이 다름.
-- - 학생 hot-path 는 이 bucket 의 PNG 만 fetch (Edge Function 호출 0회 목적).
--
-- 저장 경로: signature-previews/{requestId}/v{regionVersion}/page-{i}.png  (페이지 전체)
--           signature-previews/{requestId}/v{regionVersion}/region-{regionId}.png  (region cutout)
--   requestId / regionVersion 으로 cache-bust. region 편집 후 publish 시 새 디렉터리.

-- 1) Storage bucket — 5MB / png only / public read
--    학생 hot-path 에서 anon key + signed URL 없이 직접 GET 하므로 public 으로 둔다.
--    원본 PDF 는 비공개 (signature-templates), 미리보기 PNG 는 공개해도 PII 없음.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'signature-previews',
  'signature-previews',
  true,
  5242880, -- 5MB per file
  ARRAY['image/png']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/png'];

-- 2) RLS — service_role 가 모든 작업, anon/authenticated 는 read only
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'signature_previews_service_all'
  ) THEN
    CREATE POLICY "signature_previews_service_all" ON storage.objects
      FOR ALL USING (bucket_id = 'signature-previews' AND auth.role() = 'service_role')
      WITH CHECK (bucket_id = 'signature-previews' AND auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'signature_previews_public_read'
  ) THEN
    CREATE POLICY "signature_previews_public_read" ON storage.objects
      FOR SELECT USING (bucket_id = 'signature-previews');
  END IF;
END $$;

COMMENT ON POLICY "signature_previews_service_all" ON storage.objects
  IS 'Phase 2C: Edge Function (service_role) 만 PNG 업로드/삭제.';
COMMENT ON POLICY "signature_previews_public_read" ON storage.objects
  IS 'Phase 2C: 학생 hot-path GET 을 위한 public read (signed URL 비용 0).';
