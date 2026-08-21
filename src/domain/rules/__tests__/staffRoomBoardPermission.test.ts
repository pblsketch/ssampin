import { describe, it, expect } from 'vitest';
import {
  boardDenialMessage,
  canDeleteComment,
  canDeletePost,
  canEditPost,
  canSetRequired,
  canWritePost,
  checkDisplayName,
  countUnread,
  displayNameOf,
  isPostUnread,
} from '../staffRoomBoardPermission';
import { STAFFROOM_DISPLAY_NAME_MAX_LENGTH } from '@domain/entities/StaffRoomBoard';

const ME = 'kim@school.kr';
const OTHER = 'lee@school.kr';

describe('글 쓰기', () => {
  it('멤버면 누구나 쓸 수 있다 (읽기 전용 등급을 만들지 않았다)', () => {
    expect(canWritePost('member').allowed).toBe(true);
    expect(canWritePost('admin').allowed).toBe(true);
  });

  it('멤버가 아니면 못 쓴다', () => {
    expect(canWritePost(null)).toEqual({ allowed: false, reason: 'not_member' });
  });
});

describe('글 고치기·지우기 — 쓴 사람 본인 또는 관리자', () => {
  it('내가 쓴 글은 내가 고칠 수 있다', () => {
    expect(canEditPost('member', ME, ME).allowed).toBe(true);
  });

  it('남이 쓴 글은 일반 멤버가 못 고친다', () => {
    expect(canEditPost('member', ME, OTHER)).toEqual({ allowed: false, reason: 'not_author' });
  });

  it('관리자는 남이 쓴 글도 고칠 수 있다', () => {
    expect(canEditPost('admin', ME, OTHER).allowed).toBe(true);
  });

  it('멤버가 아니면 자기 글이어도 못 고친다 (강퇴된 사람)', () => {
    expect(canEditPost(null, ME, ME)).toEqual({ allowed: false, reason: 'not_member' });
  });

  it('지메일 대소문자·공백이 달라도 같은 사람으로 본다', () => {
    expect(canEditPost('member', '  KIM@School.KR ', ME).allowed).toBe(true);
  });

  it('지우기는 고치기와 같은 기준이다', () => {
    expect(canDeletePost('member', ME, OTHER).reason).toBe('not_author');
    expect(canDeletePost('admin', ME, OTHER).allowed).toBe(true);
    expect(canDeletePost('member', ME, ME).allowed).toBe(true);
  });
});

describe('필독 지정 — 관리자만', () => {
  it('일반 멤버는 필독으로 못 만든다', () => {
    expect(canSetRequired('member')).toEqual({ allowed: false, reason: 'not_admin' });
  });

  it('관리자는 할 수 있다', () => {
    expect(canSetRequired('admin').allowed).toBe(true);
  });

  it('멤버가 아니면 not_admin 이 아니라 not_member 다', () => {
    expect(canSetRequired(null).reason).toBe('not_member');
  });
});

describe('댓글 지우기', () => {
  it('내 댓글은 내가 지운다', () => {
    expect(canDeleteComment('member', ME, ME).allowed).toBe(true);
  });

  it('남의 댓글은 일반 멤버가 못 지운다', () => {
    expect(canDeleteComment('member', ME, OTHER).reason).toBe('not_author');
  });

  it('관리자는 남의 댓글도 지울 수 있다', () => {
    expect(canDeleteComment('admin', ME, OTHER).allowed).toBe(true);
  });
});

describe('안 읽은 글 판정 — 마지막 본 시각 한 줄로 계산한다', () => {
  const SEEN = '2026-09-01T10:00:00.000Z';

  it('한 번도 안 봤으면 전부 안 읽은 글이다', () => {
    expect(isPostUnread('2026-01-01T00:00:00.000Z', null)).toBe(true);
  });

  it('마지막 본 시각 이후에 올라온 글은 안 읽은 글', () => {
    expect(isPostUnread('2026-09-01T10:00:01.000Z', SEEN)).toBe(true);
  });

  it('마지막 본 시각 이전에 올라온 글은 읽은 것으로 본다', () => {
    expect(isPostUnread('2026-09-01T09:59:59.000Z', SEEN)).toBe(false);
  });

  it('★경계값 — 정확히 같은 시각이면 읽은 것으로 본다 (열자마자 배지가 다시 켜지지 않게)', () => {
    expect(isPostUnread(SEEN, SEEN)).toBe(false);
  });

  it('시각이 깨져 있으면 안 읽음으로 세지 않는다 (배지가 영원히 안 꺼지는 사고 방지)', () => {
    expect(isPostUnread('이상한값', SEEN)).toBe(false);
    expect(isPostUnread(SEEN, '이상한값')).toBe(false);
  });

  it('안 읽은 글 수를 센다', () => {
    const posts = [
      { createdAt: '2026-09-01T09:00:00.000Z' },
      { createdAt: '2026-09-01T11:00:00.000Z' },
      { createdAt: '2026-09-01T12:00:00.000Z' },
    ];
    expect(countUnread(posts, SEEN)).toBe(2);
    expect(countUnread(posts, null)).toBe(3);
    expect(countUnread([], SEEN)).toBe(0);
  });
});

describe('부서에서 쓸 이름', () => {
  it('앞뒤 공백을 정리해 받아들인다', () => {
    expect(checkDisplayName('  3학년부 김철수  ')).toEqual({ ok: true, value: '3학년부 김철수' });
  });

  it('공백만 넣으면 거부하고 한국어로 알린다', () => {
    const r = checkDisplayName('   ');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(/[가-힣]/.test(r.message)).toBe(true);
  });

  it('빈 문자열도 거부', () => {
    expect(checkDisplayName('').ok).toBe(false);
  });

  it(`${STAFFROOM_DISPLAY_NAME_MAX_LENGTH}자까지 된다`, () => {
    expect(checkDisplayName('가'.repeat(STAFFROOM_DISPLAY_NAME_MAX_LENGTH)).ok).toBe(true);
  });

  it('넘으면 거부하고 몇 자까지인지 알려준다', () => {
    const r = checkDisplayName('가'.repeat(STAFFROOM_DISPLAY_NAME_MAX_LENGTH + 1));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain(String(STAFFROOM_DISPLAY_NAME_MAX_LENGTH));
  });

  it('앞뒤 공백을 뺀 길이로 센다', () => {
    expect(checkDisplayName(`  ${'가'.repeat(STAFFROOM_DISPLAY_NAME_MAX_LENGTH)}  `).ok).toBe(true);
  });
});

describe('화면에 보여줄 이름', () => {
  it('이름을 정했으면 그 이름', () => {
    expect(displayNameOf({ email: ME, displayName: '김철수' })).toBe('김철수');
  });

  it('안 정했으면 지메일', () => {
    expect(displayNameOf({ email: ME, displayName: null })).toBe(ME);
  });

  it('공백만 들어 있으면 지메일로 떨어진다', () => {
    expect(displayNameOf({ email: ME, displayName: '   ' })).toBe(ME);
  });
});

describe('거절 문구', () => {
  it('모든 사유에 한국어 안내가 있다', () => {
    for (const reason of ['not_member', 'not_admin', 'not_author'] as const) {
      expect(/[가-힣]/.test(boardDenialMessage(reason))).toBe(true);
    }
  });
});
