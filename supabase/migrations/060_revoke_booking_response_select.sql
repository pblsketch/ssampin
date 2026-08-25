-- =====================================================================
-- 060_revoke_booking_response_select.sql
--
-- 🔴 선행조건 — 이 순서를 지키지 않으면 교사의 예약 취소가 깨진다.
--    1) 059 적용 완료 (cancel_consultation_booking_by_admin 존재)
--    2) 059 를 쓰는 데스크톱 릴리즈 배포 + 자동 업데이트가 어느 정도 확산
--    3) 구버전 비율 확인 (관리자 분석 화면의 버전 분포)
--    → 세 가지가 끝난 뒤에만 이 파일을 적용한다.
--
-- P0-3 4단계 — 계획서(collab-privacy-redesign.plan.md:175-186)가 "남음"으로
-- 남겨둔 마지막 단계다. 2026-08-14 에 미뤄진 이유는 구버전 앱 호환이었다.
--
-- 무엇을 막나:
--   두 표를 **좁히지 않고** 읽는 경로를 없앤다. 예약자 정보·상담 주제·설문 응답 내용과
--   학부모 셀프 취소·변경용 토큰이 이 표에 들어 있다. 토큰까지 읽히면 유출을 넘어
--   **남의 예약이 취소·변경될 수 있는 무결성 문제**가 된다.
--
-- 원인은 `FOR SELECT USING (TRUE)` 정책이다 (008:40-41, 009:57-58).
--   PostgREST 는 클라이언트가 보낸 필터를 신뢰할 뿐이라, RLS 로는
--   "반드시 좁혀서 조회하라"를 강제할 수 없다. 046 이 대신할 RPC 를 이미 깔아뒀다.
--
-- 왜 컬럼 단위(044·058 방식)가 아니라 전면 회수인가:
--   058 의 short_links 는 code 칸을 남겨야 구버전이 안 깨졌다. 여기는 반대다.
--   남길 안전한 칸이 없다 — student_number 만 남겨도 consultation_schedules 의
--   공개 컬럼(title·target_class_name)과 붙이면 "몇 학년 몇 반 몇 번이 상담을 신청했다"가
--   복원된다. 그래서 SELECT 를 통째로 회수한다.
--
-- 깨지는 것 (의도된 비용):
--   - 059 이전 구버전 앱의 **예약 취소**. DELETE 의 WHERE 가 id 를 읽는데 그 권한이
--     사라지기 때문이다. 화면에는 1단계에서 준비한 "최신 버전으로 업데이트해 주세요"
--     안내가 뜬다(supabaseAccessError.ts). 데이터는 그대로다.
--   - 그 밖의 구버전 직접 조회 경로. 046·047 로 이미 RPC 로 옮겼으므로
--     현재 버전은 영향 없다.
--
-- 깨지지 않는 것 (확인 완료):
--   - 학부모·학생 예약/응답 제출 — INSERT 는 SELECT 와 별개 권한이고
--     두 경로 모두 `Prefer: return=minimal` 이라 되읽기가 없다
--     (SurveySupabaseClient.ts:204-215, landing/.../checkApi.ts:147-158).
--     upsert(on_conflict)를 쓰는 곳은 없다 — 있으면 SELECT 에 의존했을 것이다.
--   - 중복 확인 — has_consultation_booking / has_survey_response (046, SECURITY DEFINER)
--   - 교사 목록 조회 — get_consultation_bookings / get_survey_responses (046, SECURITY DEFINER)
--   - 교사 예약 취소 — cancel_consultation_booking_by_admin (059, SECURITY DEFINER)
--   - 학부모 셀프 변경·취소 — *_by_token RPC (028, SECURITY DEFINER)
--   - service_role 전 경로 (정책 유지 + RLS 우회)
--
-- SECURITY DEFINER 함수는 소유자 권한으로 돌기 때문에 이 회수의 영향을 받지 않는다.
-- 그래서 위 RPC 들은 전부 그대로 동작한다.
--
-- 롤백:
--   GRANT SELECT ON public.consultation_bookings TO anon, authenticated;
--   GRANT SELECT ON public.survey_responses      TO anon, authenticated;
--   CREATE POLICY "consultation_bookings_public_read" ON consultation_bookings
--     FOR SELECT USING (TRUE);
--   CREATE POLICY "survey_responses_public_read" ON survey_responses
--     FOR SELECT USING (TRUE);
--
-- 적용 후 할 일:
--   개인정보 방침 제14조 "접근 통제" 문구를 원래대로 되돌린다. 2026-08-14 에
--   "권한 없는 요청이 다른 사람의 자료를 조회할 수 없도록 차단합니다"가 **사실이 아니어서**
--   낮춰 적었다. 같은 문장이 docs/edzip/학운위-심의자료.md · 에듀집-등록-초안.md 에도 있다.
--
-- 근거: 보안 조사 문서(저장소 외부 · 비공개). 재현 경로를 이 파일에 옮겨 적지 말 것.
-- =====================================================================

-- ── 1) 전 행 열람을 허용하던 정책 제거 ───────────────────────────────
-- 정책만 지워도 GRANT 가 남아 있으면 "0행이지만 200" 이 된다. 아래 2) 와 짝이다.

DROP POLICY IF EXISTS "consultation_bookings_public_read" ON public.consultation_bookings;
DROP POLICY IF EXISTS "survey_responses_public_read"      ON public.survey_responses;

-- ── 2) 테이블 SELECT 권한 회수 ───────────────────────────────────────
-- GRANT 까지 걷어 "열람 시도 자체"를 권한 오류로 만든다 (049~052 와 같은 방식).
-- INSERT 권한은 건드리지 않는다 — 학생·학부모 제출 경로가 여기에 의존한다.

REVOKE SELECT ON public.consultation_bookings FROM anon, authenticated;
REVOKE SELECT ON public.survey_responses      FROM anon, authenticated;
