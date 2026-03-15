-- 016: 설문 사칭 방지 PIN 코드 기능
ALTER TABLE surveys
  ADD COLUMN IF NOT EXISTS pin_protection BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pin_hashes JSONB DEFAULT NULL;

-- pin_hashes 형식: {"1": "sha256hash...", "2": "sha256hash...", ...}
-- 키: 학생 번호(문자열), 값: PIN의 SHA-256 해시

COMMENT ON COLUMN surveys.pin_protection IS '사칭 방지 모드 활성화 여부';
COMMENT ON COLUMN surveys.pin_hashes IS '학생별 PIN SHA-256 해시 (번호→해시 매핑)';
