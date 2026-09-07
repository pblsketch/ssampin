/**
 * 제출 과제 권한·투영 — **서버 쪽** 판정
 *
 * 짝 테스트: src/domain/rules/__tests__/staffRoomSubmissionRules.test.ts
 * 두 파일이 **같은 케이스 표 한 벌**을 돌린다.
 *
 * ★ 이 파일이 `src/` 아래 있는 이유 — `vitest.config.ts` 의 include 가
 *   `src/**` 와 `electron/**` 뿐이다. `supabase/functions/**` 아래에 두면
 *   수집조차 안 되어 **실패도 안 한다**(`_shared/sigRetention.test.ts` 가
 *   이미 그 상태다). 그래서 상대경로로 불러 온다.
 */
import { describe, it, expect } from 'vitest';
import {
  canSeeUnsubmittedList,
  canToggleSubmissionDone,
  doneWindowStart,
  normalizeAssignees,
  SUBMISSION_DONE_WINDOW_DAYS,
  toSubmissionSummary,
  toTargetsList,
  toUnsubmittedList,
  type SubmissionRow,
  type SubmissionTargetRow,
} from '../../../../supabase/functions/_shared/staffroomSubmissions';
import type { AccessMember } from '../../../../supabase/functions/_shared/staffroomAccess';
import {
  ADMIN_EMAIL,
  AUTHOR_EMAIL,
  BYSTANDER_EMAIL,
  OTHER_TARGET_EMAIL,
  SUBMISSION_AUTHZ_CASES,
  TARGET_EMAIL,
} from '@domain/rules/__tests__/fixtures/submissionAuthzCases';

const MEMBERS: AccessMember[] = [
  { id: 'm1', email: ADMIN_EMAIL, role: 'admin' },
  { id: 'm2', email: AUTHOR_EMAIL, role: 'member' },
  { id: 'm3', email: TARGET_EMAIL, role: 'member' },
  { id: 'm4', email: BYSTANDER_EMAIL, role: 'member' },
  { id: 'm5', email: OTHER_TARGET_EMAIL, role: 'member' },
];

describe('제출 과제 권한 (서버) — 화면과 같은 케이스 표', () => {
  for (const c of SUBMISSION_AUTHZ_CASES) {
    it(`${c.what} — 내 칸`, () => {
      expect(canToggleSubmissionDone(MEMBERS, c.viewerEmail, c.viewerEmail, AUTHOR_EMAIL).ok).toBe(
        c.canToggleOwn,
      );
    });

    it(`${c.what} — 남의 칸`, () => {
      expect(
        canToggleSubmissionDone(MEMBERS, c.viewerEmail, OTHER_TARGET_EMAIL, AUTHOR_EMAIL).ok,
      ).toBe(c.canToggleOther);
    });

    it(`${c.what} — 명단 보기`, () => {
      expect(canSeeUnsubmittedList(MEMBERS, c.viewerEmail, AUTHOR_EMAIL).ok).toBe(c.canSeeList);
    });
  }

  it('부서 밖 사람은 부서가 있는지조차 알려주지 않는다 (403 으로 통일)', () => {
    const denied = canSeeUnsubmittedList(MEMBERS, 'outsider@other.kr', AUTHOR_EMAIL);
    expect(denied).toEqual({ ok: false, reason: 'not_member' });
  });
});

describe('제출 주체 다듬기', () => {
  it('부서 밖 사람은 빠지고, 몇 명 빠졌는지 알려준다', () => {
    const result = normalizeAssignees(MEMBERS, [TARGET_EMAIL, 'outsider@other.kr']);
    expect(result.kept).toEqual([TARGET_EMAIL]);
    expect(result.dropped).toBe(1);
  });

  it('★ 같은 사람을 두 번 적은 것은 빠진 것으로 세지 않는다', () => {
    // 중복은 실수가 아니라 그냥 중복이다. 알릴 일이 아니고, DB 에도 UNIQUE 가 있다.
    const result = normalizeAssignees(MEMBERS, [TARGET_EMAIL, TARGET_EMAIL.toUpperCase()]);
    expect(result.kept).toEqual([TARGET_EMAIL]);
    expect(result.dropped).toBe(0);
  });

  it('대소문자·공백이 달라도 같은 사람으로 본다', () => {
    const result = normalizeAssignees(MEMBERS, [`  ${TARGET_EMAIL.toUpperCase()}  `]);
    expect(result.kept).toEqual([TARGET_EMAIL]);
  });

  it('배열이 아니면 빈 결과를 준다', () => {
    expect(normalizeAssignees(MEMBERS, 'kim@school.kr')).toEqual({ kept: [], dropped: 0 });
  });
});

const ROW: SubmissionRow = {
  id: 's1',
  module_id: 'mod1',
  department_id: 'dep1',
  author_email: AUTHOR_EMAIL,
  title: '2학기 수행평가 계획 제출',
  due_on: '2026-09-15',
  guide: '링크를 열어 과목별 시트에 작성해 주세요.',
  doc_url: 'https://docs.google.com/x',
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
};

const TARGETS: SubmissionTargetRow[] = [
  { member_email: TARGET_EMAIL, display_name_snapshot: '김선생', done_at: '2026-09-10T00:00:00Z' },
  { member_email: BYSTANDER_EMAIL, display_name_snapshot: '이선생', done_at: null },
  // 부서를 나간 사람 — MEMBERS 에 없다
  { member_email: 'left@school.kr', display_name_snapshot: '박선생', done_at: null },
];

describe('목록 투영 — 무엇을 내보내지 않는가', () => {
  it('★ 응답 어디에도 제출 주체의 지메일·이름이 없다', () => {
    // 이 계약이 깨지면 미제출자 이름이 부서 전원에게 간다.
    const summary = toSubmissionSummary(
      ROW,
      TARGETS,
      BYSTANDER_EMAIL,
      MEMBERS.map((m) => m.email),
    );
    const body = JSON.stringify(summary);
    for (const email of [TARGET_EMAIL, BYSTANDER_EMAIL, 'left@school.kr']) {
      expect(body).not.toContain(email);
    }
    for (const name of ['김선생', '이선생', '박선생']) {
      expect(body).not.toContain(name);
    }
  });

  it('만든이 지메일만 예외로 담는다 — 화면이 "안 낸 분 보기"를 그릴지 판정해야 한다', () => {
    const summary = toSubmissionSummary(
      ROW,
      TARGETS,
      BYSTANDER_EMAIL,
      MEMBERS.map((m) => m.email),
    );
    expect(summary.authorEmail).toBe(AUTHOR_EMAIL);
  });

  it('★ 만든이 이름(authorName)은 담지 않는다', () => {
    const summary = toSubmissionSummary(
      ROW,
      TARGETS,
      BYSTANDER_EMAIL,
      MEMBERS.map((m) => m.email),
    );
    expect(Object.keys(summary)).not.toContain('authorName');
  });
});

describe('진행률 — 부서를 나간 사람', () => {
  const active = MEMBERS.map((m) => m.email);

  it('★ 나간 사람은 분모에서 빠진다 — 안 그러면 영원히 안 채워진다', () => {
    const summary = toSubmissionSummary(ROW, TARGETS, ADMIN_EMAIL, active);
    expect(summary.totalCount).toBe(2); // 3명 중 나간 1명 제외
  });

  it('★ 분자에서도 빠진다 — 한쪽만 빼면 12/11 같은 숫자가 나온다', () => {
    const withLeftDone: SubmissionTargetRow[] = [
      ...TARGETS.slice(0, 2),
      {
        member_email: 'left@school.kr',
        display_name_snapshot: '박선생',
        done_at: '2026-09-09T00:00:00Z',
      },
    ];
    const summary = toSubmissionSummary(ROW, withLeftDone, ADMIN_EMAIL, active);
    expect(summary.doneCount).toBe(1);
    expect(summary.totalCount).toBe(2);
    expect(summary.doneCount).toBeLessThanOrEqual(summary.totalCount);
  });

  it('내 상태는 내 것만 읽는다', () => {
    expect(toSubmissionSummary(ROW, TARGETS, TARGET_EMAIL, active).myDoneAt).toBe(
      '2026-09-10T00:00:00Z',
    );
    expect(toSubmissionSummary(ROW, TARGETS, BYSTANDER_EMAIL, active).myDoneAt).toBeNull();
    expect(toSubmissionSummary(ROW, TARGETS, ADMIN_EMAIL, active).myDoneAt).toBeNull();
  });
});

describe('명단 투영 — 세 구역', () => {
  it('낸 사람 · 안 낸 사람 · 부서를 나간 사람으로 나눈다', () => {
    const list = toTargetsList(TARGETS, MEMBERS);
    expect(list.done.map((t) => t.email)).toEqual([TARGET_EMAIL]);
    expect(list.pending.map((t) => t.email)).toEqual([BYSTANDER_EMAIL]);
    expect(list.excluded.map((t) => t.email)).toEqual(['left@school.kr']);
  });

  it('★ 낸 사람이 보여야 취합자가 잘못 켠 것을 되돌릴 수 있다', () => {
    expect(toTargetsList(TARGETS, MEMBERS).done).toHaveLength(1);
  });

  it('이름은 산 값 → 스냅샷 → null 순서로 고른다', () => {
    const list = toTargetsList(TARGETS, MEMBERS, { [TARGET_EMAIL]: '김담임' });
    expect(list.done[0]?.name).toBe('김담임'); // 지금 멤버의 산 이름
    expect(list.excluded[0]?.name).toBe('박선생'); // 나갔으므로 걸 때의 스냅샷
  });

  it('아무 이름도 없으면 null — 화면이 대신 그릴 수 있게', () => {
    const noName: SubmissionTargetRow[] = [
      { member_email: TARGET_EMAIL, display_name_snapshot: null, done_at: null },
    ];
    expect(toTargetsList(noName, MEMBERS).pending[0]?.name).toBeNull();
  });

  it('안 낸 사람 명단은 같은 조립을 재사용한다', () => {
    const full = toTargetsList(TARGETS, MEMBERS);
    const short = toUnsubmittedList(TARGETS, MEMBERS);
    expect(short.pending).toEqual(full.pending);
    expect(short.excluded).toEqual(full.excluded);
  });
});

describe('완료분 창 — 15일을 기다리지 않고 확인한다', () => {
  it(`${SUBMISSION_DONE_WINDOW_DAYS}일 전 시각을 돌려준다`, () => {
    const now = new Date('2026-09-20T00:00:00.000Z');
    expect(doneWindowStart(now)).toBe('2026-09-06T00:00:00.000Z');
  });

  it('창 안에 든 것과 넘어간 것이 갈린다', () => {
    const now = new Date('2026-09-20T00:00:00.000Z');
    const since = doneWindowStart(now);
    expect('2026-09-10T00:00:00.000Z' >= since).toBe(true); // 10일 전 — 보인다
    expect('2026-09-05T00:00:00.000Z' >= since).toBe(false); // 15일 전 — 사라진다
  });
});
