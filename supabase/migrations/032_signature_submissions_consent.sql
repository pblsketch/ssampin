-- 032: 서명받기 Phase 2C — submit-signature 동의 로그 + IP 해시 (US-2C-11)
-- - consent_log: 동의 항목 4행(법적 효력·해시 보관·결과 PDF·보관 기간) 체크 결과 기록
-- - consent_ip_hash: 동의 시점의 client IP SHA-256 해시 (raw IP 저장 X — 제1 원칙)
-- - 기존 ip_hash 컬럼은 abuse-prevention 용으로 유지, consent_ip_hash 는 법적 의사 확인 별도 보관

ALTER TABLE signature_submissions
  ADD COLUMN IF NOT EXISTS consent_log JSONB,
  ADD COLUMN IF NOT EXISTS consent_ip_hash TEXT;

COMMENT ON COLUMN signature_submissions.consent_log IS
  'Phase 2C: 학생/학부모가 서명 제출 시 체크한 4행 동의 항목 (id/label/checked/at). raw IP/식별자 저장 X.';
COMMENT ON COLUMN signature_submissions.consent_ip_hash IS
  'Phase 2C: 동의 시점 client IP 의 SHA-256 해시. raw IP 는 저장하지 않는다 (제1 원칙).';

-- 데이터 형식 가드 (선택): consent_log 가 들어왔을 때 JSON 배열인지만 확인.
-- NULL 허용 (Phase 2C 이전 제출 + 마이그레이션 호환).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'signature_submissions' AND constraint_name = 'consent_log_is_array'
  ) THEN
    ALTER TABLE signature_submissions
      ADD CONSTRAINT consent_log_is_array
      CHECK (consent_log IS NULL OR jsonb_typeof(consent_log) = 'array');
  END IF;
END $$;
