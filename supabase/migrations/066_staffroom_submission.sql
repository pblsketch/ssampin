-- =====================================================================
-- 066_staffroom_submission.sql
-- 온라인 교무실 — 제출 과제 · 업무분장 지식 칸 · 업무 서식 연결
--
-- 계획서: .omc/plans/staffroom-submission-plan.md (S1-1)
-- 명세  : .omc/specs/deep-interview-staffroom-swl.md (딥 인터뷰 10라운드)
-- 출처  : github.com/cando8442/school-work-links (MIT) — 설계 판단만 참고
--
-- ── 무엇을 왜 만드는가 ──────────────────────────────────────────────
-- 052 의 staffroom_tasks 는 "한 사람이 맡는 일"이다. 그런데 학교 업무의
-- 상당수는 **여러 사람이 각자 내고 한 사람이 취합하는** 모양이다 —
-- "2학기 수행평가 계획을 과목별로 내주세요" 같은 것. 그걸 담을 자리가 없었다.
--
--   staffroom_submissions        제출 과제 하나 (마감 + 문서 링크 + 안내)
--   staffroom_submission_targets 그 과제를 내야 하는 사람들 (각자 완료 시각)
--
-- 그리고 052 의 업무(staffroom_tasks)에는 **인수인계 때 진짜 넘어가야 하는
-- 지식**을 담을 칸이 없었다. 파일은 넘어가는데 "매주 금요일 무엇을 하는지"는
-- 안 넘어간다. routines · howto · handover_notes 세 칸이 그 자리다.
--
-- ── ★ §8-E — 사람별 누적을 세지 않는다 ─────────────────────────────
-- staffroom_submission_targets.done_at 은 052 의 staffroom_tasks.done_at 과
-- 같은 성격이다: **그 일이 끝났는지**를 말할 뿐 사람에게 붙는 점수가 아니다.
-- 이 파일 어떤 표에도 point/score/rank/streak/badge/stamp/level 칸이 없고,
-- 사람별로 GROUP BY 해 누적을 세는 함수도 만들지 않는다.
--
-- ── ★ staffroom_members 로 FK 를 걸지 않는 이유 ─────────────────────
-- 049 의 staffroom_members 에는 "나갔다"를 표시하는 칸이 없고, 내보내기가
-- 행을 통째로 지운다(staffroom-members/index.ts). FK 를 걸면 CASCADE 로
-- **제출 이력까지 함께 사라진다.** 그래서 member_email 을 글자로 들고,
-- 이름은 걸 때 복사해 둔다(display_name_snapshot).
--
-- ── 격리는 049~055 와 같은 두 겹 ────────────────────────────────────
--   1) DB 층 — 아래 표는 전부 service_role 전용. anon/authenticated 는 GRANT 회수.
--   2) 함수 층 — staffroom-* Edge Function 이 구글로 신원을 확인하고
--      staffroom_members 에 있는지 본 뒤에만 응답한다.
-- 근거: DECISIONS.md ADR-062. 멱등.
-- =====================================================================

-- ══════════════════════════════════════════════════════════════════
-- 0) ★ 모듈 종류에 'submission' 을 더한다
--
--    050_staffroom_board.sql:40 의 CHECK 은 다섯 종류만 적어 두었다.
--    그 파일 주석은 "종류가 늘 때 CHECK 을 다시 고치지 않으려고 미리 적어
--    둔다"고 했지만 실제로는 다섯만 있다. 이 줄이 없으면 관리자가 제출 과제
--    모듈을 만드는 순간 Postgres 가 거부하고, **앱의 검사 4종은 전부 초록인 채
--    원인 없는 오류만 뜬다.**
-- ══════════════════════════════════════════════════════════════════
ALTER TABLE staffroom_modules
  DROP CONSTRAINT IF EXISTS staffroom_modules_kind_check;

ALTER TABLE staffroom_modules
  ADD CONSTRAINT staffroom_modules_kind_check
  CHECK (kind IN ('board', 'archive', 'discussion', 'gallery', 'minutes', 'submission'));

-- ══════════════════════════════════════════════════════════════════
-- 1) staffroom_submissions — 제출 과제
--
--    게시판 글과 무엇이 다른가 — **마감과 취합이 붙는다.** 글은 읽고 말지만
--    제출 과제는 "누가 냈고 누가 안 냈는지"를 센다.
--    부서 업무(staffroom_tasks)와 무엇이 다른가 — 업무는 한 사람이 계속
--    도는 일이고, 제출 과제는 **여럿이 각자 내고 다 내면 끝나는 일**이다.
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS staffroom_submissions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id      UUID        NOT NULL REFERENCES staffroom_modules(id) ON DELETE CASCADE,
  department_id  UUID        NOT NULL REFERENCES staffroom_departments(id) ON DELETE CASCADE,
  author_email   TEXT        NOT NULL,
  title          TEXT        NOT NULL,
  due_on         DATE,
  guide          TEXT        NOT NULL DEFAULT '',
  doc_url        TEXT        NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  staffroom_submissions              IS '온라인 교무실: 제출 과제. 마감 하나에 여러 사람이 각자 내고, 만든 사람이 취합한다.';
COMMENT ON COLUMN staffroom_submissions.author_email IS '만든 사람 = 취합하는 사람. 관리자가 아니어도 된다 — 교과 간사·행사 담당 누구나 만든다.';
COMMENT ON COLUMN staffroom_submissions.due_on       IS '마감일. NULL 이면 "기한 없음"으로 보여준다.';
COMMENT ON COLUMN staffroom_submissions.doc_url      IS '제출할 구글 문서·시트 주소. http/https 만 서버가 받는다.';

CREATE INDEX IF NOT EXISTS idx_staffroom_submissions_module
  ON staffroom_submissions (module_id, due_on);

ALTER TABLE staffroom_submissions ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════
-- 2) staffroom_submission_targets — 제출 주체
--
--    ★ display_name_snapshot 이 왜 필요한가.
--      049 의 staffroom_members 에는 나간 사람을 표시하는 칸이 없고,
--      내보내기가 행을 통째로 지운다. 그러면 "안 낸 분" 명단에 붙일 이름이
--      사라져 생 지메일만 남는다. 걸 때의 이름을 복사해 둔다.
--      055 의 file_name 과 같은 이유·같은 방식이다.
--
--    ★ done_at 은 §8-E 대로 사람에게 붙는 점수가 아니다.
--      done_by_email 을 따로 두는 이유는 "취합자가 대신 체크한 것"과
--      "본인이 낸 것"을 구분해 나중에 다투지 않게 하기 위해서다.
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS staffroom_submission_targets (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id         UUID        NOT NULL REFERENCES staffroom_submissions(id) ON DELETE CASCADE,
  member_email          TEXT        NOT NULL,
  display_name_snapshot TEXT,
  done_at               TIMESTAMPTZ,
  done_by_email         TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 같은 사람을 두 번 걸면 진행률 분모가 부푼다(11/11 이 11/12 가 된다).
  -- 049 의 staffroom_members UNIQUE (department_id, member_email) 과 같은 결.
  UNIQUE (submission_id, member_email)
);

COMMENT ON TABLE  staffroom_submission_targets                       IS '온라인 교무실: 제출 과제를 내야 하는 사람들. staffroom_members 로 FK 를 걸지 않는다 — 내보내기가 행을 지우면 제출 이력까지 함께 사라진다.';
COMMENT ON COLUMN staffroom_submission_targets.display_name_snapshot IS '주체로 걸 때의 표시 이름을 복사해 둔 값. 부서를 나가면 멤버 행이 지워져 이름을 알 길이 없어진다. 구글이 이름을 안 주므로 본인이 안 정했으면 NULL 이다.';
COMMENT ON COLUMN staffroom_submission_targets.done_at               IS '낸 시각. **사람에게 붙는 점수가 아니다**(§8-E 활동 포인트 금지).';
COMMENT ON COLUMN staffroom_submission_targets.done_by_email         IS '누가 표시했는가. 본인일 수도, 취합자·관리자가 대신 눌렀을 수도 있다.';

CREATE INDEX IF NOT EXISTS idx_staffroom_submission_targets_member
  ON staffroom_submission_targets (member_email, done_at);

CREATE INDEX IF NOT EXISTS idx_staffroom_submission_targets_submission
  ON staffroom_submission_targets (submission_id);

ALTER TABLE staffroom_submission_targets ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════
-- 3) staffroom_tasks 에 인수인계 지식 세 칸
--
--    2월에 부서가 바뀔 때 넘어가야 하는 건 파일이 아니라 **아는 것**이다:
--      routines        매주 금요일 무엇을 하는가 (주기 + 할 일)
--      howto           순서대로 어떻게 처리하는가
--      handover_notes  다음 사람이 모르면 사고 나는 주의사항
--
--    별도 표로 나누지 않은 이유 — 이 셋은 언제나 업무 하나와 **통째로** 읽고
--    쓴다. 개별 항목을 검색할 일이 없고, 순서가 뜻을 갖는다.
--    DEFAULT '[]'::jsonb 라서 이미 있는 업무는 하나도 안 바뀐다.
-- ══════════════════════════════════════════════════════════════════
ALTER TABLE staffroom_tasks
  ADD COLUMN IF NOT EXISTS routines       JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS howto          JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS handover_notes JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN staffroom_tasks.routines       IS '반복 업무 [{cycle, what}]. 예: {"cycle":"매주 금요일","what":"주간 출결 통계 정리"}. 순서를 지킨다.';
COMMENT ON COLUMN staffroom_tasks.howto          IS '처리 절차 [문자열]. 순서대로 따라 할 수 있게 적는다.';
COMMENT ON COLUMN staffroom_tasks.handover_notes IS '인수인계 메모 [문자열]. 다음 담당자가 모르면 사고 나는 것들.';

-- ══════════════════════════════════════════════════════════════════
-- 4) staffroom_task_forms — 업무에 걸어 둔 서식
--
--    자료실은 파일이 한 더미로 쌓인다. "결석계 서식"을 찾으려고 자료실을
--    뒤지는 대신 **"출결 관리" 업무를 열면 거기 있게** 한다.
--
--    파일이 자료실에서 지워질 때 어떻게 하나 — 055 와 같은 판단이다.
--    (가) 함께 지운다(CASCADE) → 서식이 조용히 사라져 업무가 고쳐진 줄 안다
--    (나) 줄은 남기고 파일만 떨어뜨린다(SET NULL) → "지워진 파일"로 알린다
--    (나)를 고른다. 조용히 사라지는 쪽이 더 나쁘다.
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS staffroom_task_forms (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id        UUID        NOT NULL REFERENCES staffroom_tasks(id) ON DELETE CASCADE,
  department_id  UUID        NOT NULL REFERENCES staffroom_departments(id) ON DELETE CASCADE,
  -- 자료실에서 지워지면 NULL 이 된다. 줄은 남아서 "지워진 파일"로 보인다.
  file_id        UUID        REFERENCES staffroom_files(id) ON DELETE SET NULL,
  -- 지워진 뒤에도 무엇이었는지 알리기 위한 이름. 걸 때의 이름을 적어 둔다.
  file_name      TEXT        NOT NULL,
  position       INTEGER     NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  staffroom_task_forms           IS '온라인 교무실: 업무에 걸어 둔 자료실 서식. 파일 자체는 자료실(staffroom_files)에 있고 여기는 가리키기만 한다.';
COMMENT ON COLUMN staffroom_task_forms.file_id   IS '자료실 파일. 자료실에서 지워지면 NULL 이 되고 줄은 남는다 — 서식이 조용히 사라지지 않게.';
COMMENT ON COLUMN staffroom_task_forms.file_name IS '걸 때의 파일 이름. 파일이 지워진 뒤에도 무엇이었는지 알리기 위해 따로 적어 둔다.';

-- 같은 업무에 같은 파일을 두 번 걸지 않는다.
-- 부분 인덱스인 이유: 지워진 서식(file_id 가 NULL)은 여럿일 수 있다.
CREATE UNIQUE INDEX IF NOT EXISTS idx_staffroom_task_forms_unique
  ON staffroom_task_forms (task_id, file_id)
  WHERE file_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_staffroom_task_forms_task
  ON staffroom_task_forms (task_id, position);

ALTER TABLE staffroom_task_forms ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════
-- 5) RLS 정책 — 세 표 모두 service_role 전용 (049~055 와 같은 방식)
-- ══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_table TEXT;
  v_policy TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'staffroom_submissions',
    'staffroom_submission_targets',
    'staffroom_task_forms'
  ]
  LOOP
    v_policy := v_table || '_service_all';
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = v_table AND policyname = v_policy
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL USING (auth.role() = ''service_role'') WITH CHECK (auth.role() = ''service_role'')',
        v_policy, v_table
      );
    END IF;
  END LOOP;
END $$;

-- ══════════════════════════════════════════════════════════════════
-- 6) 격리 — anon/authenticated 는 이 표들에 닿을 수 없다
-- ══════════════════════════════════════════════════════════════════
REVOKE ALL ON public.staffroom_submissions        FROM anon, authenticated;
REVOKE ALL ON public.staffroom_submission_targets FROM anon, authenticated;
REVOKE ALL ON public.staffroom_task_forms         FROM anon, authenticated;

GRANT ALL ON public.staffroom_submissions        TO service_role;
GRANT ALL ON public.staffroom_submission_targets TO service_role;
GRANT ALL ON public.staffroom_task_forms         TO service_role;
