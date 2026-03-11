-- 010: 교사 생성 테이블에 공개 INSERT/UPDATE/DELETE 정책 추가
-- surveys, consultation_schedules, consultation_slots 테이블에
-- anon key로 쓰기가 가능하도록 RLS 정책 추가
-- (admin_key를 통한 인증은 앱 레벨에서 처리)

-- surveys: 공개 쓰기
CREATE POLICY "surveys_public_insert" ON surveys
  FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "surveys_public_update" ON surveys
  FOR UPDATE USING (TRUE);

CREATE POLICY "surveys_public_delete" ON surveys
  FOR DELETE USING (TRUE);

-- consultation_schedules: 공개 쓰기
CREATE POLICY "consultation_schedules_public_insert" ON consultation_schedules
  FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "consultation_schedules_public_update" ON consultation_schedules
  FOR UPDATE USING (TRUE);

CREATE POLICY "consultation_schedules_public_delete" ON consultation_schedules
  FOR DELETE USING (TRUE);

-- consultation_slots: 공개 쓰기
CREATE POLICY "consultation_slots_public_insert" ON consultation_slots
  FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "consultation_slots_public_update" ON consultation_slots
  FOR UPDATE USING (TRUE);

CREATE POLICY "consultation_slots_public_delete" ON consultation_slots
  FOR DELETE USING (TRUE);
