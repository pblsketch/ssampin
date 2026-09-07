/**
 * 제출 과제 권한 — **화면 쪽** 판정
 *
 * 짝 테스트: src/infrastructure/supabase/__tests__/staffroomSubmissionServerAccess.test.ts
 * 두 파일이 **같은 케이스 표 한 벌**(fixtures/submissionAuthzCases.ts)을 돌린다.
 * 어긋나면 화면은 막는데 서버는 통과하거나 그 반대가 된다.
 */
import { describe, it, expect } from 'vitest';
import { canSeeUnsubmittedList, canToggleSubmissionDone } from '@domain/rules/staffRoomRoomRules';
import {
  AUTHOR_EMAIL,
  OTHER_TARGET_EMAIL,
  SUBMISSION_AUTHZ_CASES,
} from './fixtures/submissionAuthzCases';

describe('제출 과제 권한 (화면) — 케이스 표 한 벌', () => {
  for (const c of SUBMISSION_AUTHZ_CASES) {
    it(`${c.what} — 내 칸`, () => {
      // 내가 주체인 경우: 대상이 곧 나다
      expect(
        canToggleSubmissionDone(c.viewerEmail, c.viewerRole, c.viewerEmail, AUTHOR_EMAIL),
      ).toBe(c.canToggleOwn);
    });

    it(`${c.what} — 남의 칸`, () => {
      expect(
        canToggleSubmissionDone(c.viewerEmail, c.viewerRole, OTHER_TARGET_EMAIL, AUTHOR_EMAIL),
      ).toBe(c.canToggleOther);
    });

    it(`${c.what} — 명단 보기`, () => {
      expect(canSeeUnsubmittedList(c.viewerEmail, c.viewerRole, AUTHOR_EMAIL)).toBe(c.canSeeList);
    });
  }
});

describe('제출 과제 권한 (화면) — 놓치기 쉬운 것', () => {
  it('★ 주체도 만든이도 아닌 멤버에게 명단을 보여주지 않는다', () => {
    // 여기가 뚫리면 미제출자 이름이 부서 전원에게 보인다.
    expect(canSeeUnsubmittedList('someone@school.kr', 'member', AUTHOR_EMAIL)).toBe(false);
  });

  it('★ 부서를 나간 사람(role null)은 만든이였어도 못 본다', () => {
    expect(canSeeUnsubmittedList(AUTHOR_EMAIL, null, AUTHOR_EMAIL)).toBe(false);
  });
});
