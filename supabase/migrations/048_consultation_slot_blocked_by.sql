-- =====================================================================
-- 048_consultation_slot_blocked_by.sql
--
-- 상담 슬롯에 "누가 막았는지" 를 기록한다.
--
-- 배경 (2026-08-20 사용자 신고):
--   "상담 슬롯이 차단된 슬롯이라고 되어 있는데 왜 그런가요? 예약되어 있지 않은데"
--
--   consultation_slots 에는 status(available/booked/blocked) 만 있고 차단 주체가
--   없었다. 그래서 일정표 동기화(useConsultationStore.recomputeSlotAvailability)가
--   **교사가 직접 막아 둔 슬롯과 앱이 자동으로 막은 슬롯을 구분하지 못했다.**
--
--   결과: 겹치는 일정이 없으면 재계산이 "잘못 막힌 것" 으로 보고 available 로
--   되돌렸다. 교사가 "이 시간은 안 됩니다" 하고 막아 둔 시간에 학부모 예약이
--   들어올 수 있는 상태였다(실측 확인: availableRestored=1).
--
-- 이 컬럼에 사람이 읽는 사유를 넣지 않는 이유 (ADR-060):
--   consultation_slots 는 `FOR SELECT USING (TRUE)` 공개 읽기다(마이그레이션 009).
--   "○○ 회의와 겹침" 같은 문자열을 넣으면 **교사 캘린더 일정 제목이 외부로
--   노출된다.** 이 저장소는 같은 종류의 사고를 이미 겪었다 —
--   044_revoke_secret_columns_from_anon.sql (anon 키로 admin_key 186행 열람).
--   따라서 저장하는 값은 'teacher' | 'auto' 열거형 **둘 뿐**이고, 화면에 띄울
--   사유 문구는 교사 PC 에서 로컬 계산한다.
--
-- 044 의 anon SELECT 재부여와의 관계:
--   044 는 컬럼 목록을 하드코딩하지 않고 information_schema 에서 뽑아 부여하므로
--   이 컬럼은 자동으로 anon SELECT 에 포함된다. 별도 GRANT 불필요.
--   그리고 **포함되어야 한다** — 교사 데스크톱 앱도 같은 anon 키를 쓰기 때문에
--   여기서 막으면 기능 자체가 죽는다. 값이 열거형뿐이라 공개돼도 위험이 없다는
--   것이 이 설계의 전제다(자유 문구를 넣지 않는 이유이기도 하다).
-- =====================================================================

ALTER TABLE consultation_slots
  ADD COLUMN IF NOT EXISTS blocked_by TEXT;

-- CHECK 제약은 재실행 안전하게 분리 (ADD CONSTRAINT 에는 IF NOT EXISTS 가 없다)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'consultation_slots_blocked_by_check'
  ) THEN
    ALTER TABLE consultation_slots
      ADD CONSTRAINT consultation_slots_blocked_by_check
      CHECK (blocked_by IS NULL OR blocked_by IN ('teacher', 'auto'));
  END IF;
END $$;

-- 기존 차단 슬롯은 전부 'auto' 로 채운다.
--
--   과거 데이터는 누가 막았는지 알 방법이 없다. 'teacher' 로 채우면 종일 일정
--   때문에 잘못 자동 차단된 슬롯들이 **영구히 굳는다**(바로 그 신고 내용이다).
--   'auto' 로 채우면 같은 릴리즈의 종일 일정 수정이 배포될 때 자연히 풀린다.
--   교사가 의도적으로 막았던 소수는 상세 화면에서 다시 막을 수 있다.
UPDATE consultation_slots
   SET blocked_by = 'auto'
 WHERE status = 'blocked'
   AND blocked_by IS NULL;

-- status <> 'blocked' 인 행은 NULL 을 유지한다(차단 상태가 아니므로 주체도 없다).
