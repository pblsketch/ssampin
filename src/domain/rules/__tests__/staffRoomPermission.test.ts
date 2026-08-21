import { describe, it, expect } from 'vitest';
import type { StaffRoomMember } from '@domain/entities/StaffRoom';
import {
  canAcceptInvite,
  canChangeRole,
  canIssueInvite,
  canManageMembers,
  canRemoveMember,
  canViewDepartment,
  countAdmins,
  isInviteAcceptable,
  isLastAdmin,
  staffRoomDenialMessage,
} from '../staffRoomPermission';
import {
  generateInviteCode,
  isInviteCode,
  normalizeInviteCode,
  STAFFROOM_INVITE_CODE_ALPHABET,
} from '@domain/valueObjects/StaffRoomInviteCode';

const NOW = Date.parse('2026-09-01T00:00:00.000Z');

function member(id: string, role: 'admin' | 'member', email = `${id}@school.kr`): StaffRoomMember {
  return {
    id,
    departmentId: 'dept-1',
    email,
    displayName: null,
    role,
    joinedAt: '2026-08-01T00:00:00.000Z',
  };
}

const LIVE_INVITE = {
  expiresAt: null,
  revokedAt: null,
  maxUses: null,
  useCount: 0,
} as const;

describe('부서 권한 — 2단계(관리자/일반)', () => {
  it('멤버가 아니면 부서를 볼 수 없다', () => {
    expect(canViewDepartment(null)).toEqual({ allowed: false, reason: 'not_member' });
  });

  it('일반 멤버도 부서는 볼 수 있다', () => {
    expect(canViewDepartment('member').allowed).toBe(true);
  });

  it('일반 멤버는 멤버 관리를 할 수 없다', () => {
    expect(canManageMembers('member')).toEqual({ allowed: false, reason: 'not_admin' });
  });

  it('일반 멤버는 초대를 발급할 수 없다', () => {
    expect(canIssueInvite('member')).toEqual({ allowed: false, reason: 'not_admin' });
  });

  it('멤버가 아닌 사람은 초대 발급 시 not_member 로 막힌다 (not_admin 이 아니다)', () => {
    expect(canIssueInvite(null).reason).toBe('not_member');
  });

  it('관리자는 멤버 관리와 초대 발급을 할 수 있다', () => {
    expect(canManageMembers('admin').allowed).toBe(true);
    expect(canIssueInvite('admin').allowed).toBe(true);
  });
});

describe('마지막 관리자 보호', () => {
  const soloAdmin = [member('a1', 'admin'), member('m1', 'member'), member('m2', 'member')];
  const twoAdmins = [member('a1', 'admin'), member('a2', 'admin'), member('m1', 'member')];

  it('관리자 수를 센다', () => {
    expect(countAdmins(soloAdmin)).toBe(1);
    expect(countAdmins(twoAdmins)).toBe(2);
  });

  it('관리자가 한 명뿐이면 그 사람이 마지막 관리자다', () => {
    expect(isLastAdmin(soloAdmin, 'a1')).toBe(true);
  });

  it('일반 멤버는 마지막 관리자가 아니다', () => {
    expect(isLastAdmin(soloAdmin, 'm1')).toBe(false);
  });

  it('관리자가 둘이면 마지막 관리자가 아니다', () => {
    expect(isLastAdmin(twoAdmins, 'a1')).toBe(false);
  });

  it('마지막 관리자를 일반으로 강등할 수 없다', () => {
    expect(canChangeRole('admin', soloAdmin, 'a1', 'member')).toEqual({
      allowed: false,
      reason: 'last_admin',
    });
  });

  it('마지막 관리자를 내보낼 수 없다', () => {
    expect(canRemoveMember('admin', soloAdmin, 'a1')).toEqual({
      allowed: false,
      reason: 'last_admin',
    });
  });

  it('관리자가 둘이면 한 명은 강등할 수 있다', () => {
    expect(canChangeRole('admin', twoAdmins, 'a1', 'member').allowed).toBe(true);
  });

  it('일반 멤버를 관리자로 올리는 것은 마지막 관리자 보호와 무관하다', () => {
    expect(canChangeRole('admin', soloAdmin, 'm1', 'admin').allowed).toBe(true);
  });

  it('일반 멤버는 애초에 권한 변경을 못 한다 (마지막 관리자 판정보다 먼저 막힌다)', () => {
    expect(canChangeRole('member', twoAdmins, 'a1', 'member').reason).toBe('not_admin');
  });

  it('일반 멤버 내보내기는 관리자가 하면 통과한다', () => {
    expect(canRemoveMember('admin', soloAdmin, 'm1').allowed).toBe(true);
  });
});

describe('초대 수락 가능 여부', () => {
  it('해지되지 않고 기한도 인원도 남았으면 통과', () => {
    expect(isInviteAcceptable(LIVE_INVITE, NOW).allowed).toBe(true);
  });

  it('해지된 초대는 거부', () => {
    expect(
      isInviteAcceptable({ ...LIVE_INVITE, revokedAt: '2026-08-30T00:00:00.000Z' }, NOW),
    ).toEqual({ allowed: false, reason: 'invite_revoked' });
  });

  it('기한이 지난 초대는 거부', () => {
    expect(
      isInviteAcceptable({ ...LIVE_INVITE, expiresAt: '2026-08-31T23:59:59.000Z' }, NOW),
    ).toEqual({ allowed: false, reason: 'invite_expired' });
  });

  it('만료 시각이 정확히 지금이면 이미 지난 것으로 본다', () => {
    expect(
      isInviteAcceptable({ ...LIVE_INVITE, expiresAt: new Date(NOW).toISOString() }, NOW).reason,
    ).toBe('invite_expired');
  });

  it('기한이 아직 남았으면 통과', () => {
    expect(
      isInviteAcceptable({ ...LIVE_INVITE, expiresAt: '2026-09-08T00:00:00.000Z' }, NOW).allowed,
    ).toBe(true);
  });

  it('정원이 찬 초대는 거부', () => {
    expect(isInviteAcceptable({ ...LIVE_INVITE, maxUses: 3, useCount: 3 }, NOW)).toEqual({
      allowed: false,
      reason: 'invite_full',
    });
  });

  it('정원이 남았으면 통과', () => {
    expect(isInviteAcceptable({ ...LIVE_INVITE, maxUses: 3, useCount: 2 }, NOW).allowed).toBe(true);
  });

  it('해지가 만료보다 먼저 판정된다', () => {
    expect(
      isInviteAcceptable(
        {
          ...LIVE_INVITE,
          revokedAt: '2026-08-01T00:00:00.000Z',
          expiresAt: '2026-08-02T00:00:00.000Z',
        },
        NOW,
      ).reason,
    ).toBe('invite_revoked');
  });
});

describe('초대 수락 — 이미 멤버인 경우', () => {
  const members = [member('a1', 'admin', 'kim@school.kr')];

  it('이미 멤버면 다시 넣지 않는다', () => {
    expect(canAcceptInvite(LIVE_INVITE, members, 'kim@school.kr', NOW)).toEqual({
      allowed: false,
      reason: 'already_member',
    });
  });

  it('지메일 대소문자·앞뒤 공백이 달라도 같은 사람으로 본다', () => {
    expect(canAcceptInvite(LIVE_INVITE, members, '  KIM@School.kr ', NOW).reason).toBe(
      'already_member',
    );
  });

  it('처음 들어오는 사람은 통과', () => {
    expect(canAcceptInvite(LIVE_INVITE, members, 'lee@school.kr', NOW).allowed).toBe(true);
  });

  it('초대 자체가 죽었으면 멤버 여부보다 먼저 막힌다', () => {
    expect(
      canAcceptInvite(
        { ...LIVE_INVITE, revokedAt: '2026-08-01T00:00:00.000Z' },
        members,
        'kim@school.kr',
        NOW,
      ).reason,
    ).toBe('invite_revoked');
  });
});

describe('거절 사유 문구', () => {
  it('모든 사유에 한국어 안내가 있다', () => {
    const reasons = [
      'not_member',
      'not_admin',
      'last_admin',
      'invite_revoked',
      'invite_expired',
      'invite_full',
      'already_member',
    ] as const;
    for (const reason of reasons) {
      const message = staffRoomDenialMessage(reason);
      expect(message.length).toBeGreaterThan(0);
      // 한글이 한 글자라도 들어 있어야 한다 (영어 문구가 새어 나오지 않게)
      expect(/[가-힣]/.test(message)).toBe(true);
    }
  });
});

describe('초대 코드 — 숫자 6자리가 아니다', () => {
  it('BoardSessionCode 의 31자 알파벳을 그대로 쓴다', () => {
    expect(STAFFROOM_INVITE_CODE_ALPHABET).toBe('ABCDEFGHJKMNPQRSTUVWXYZ23456789');
    expect(STAFFROOM_INVITE_CODE_ALPHABET.length).toBe(31);
  });

  it('생성된 코드는 6자리이고 알파벳 안의 문자만 쓴다', () => {
    let rand = 0;
    const seq = () => {
      rand = (rand + 7) % 31;
      return rand / 31;
    };
    for (let i = 0; i < 50; i += 1) {
      const code = generateInviteCode(seq);
      expect(code).toHaveLength(6);
      expect(isInviteCode(code)).toBe(true);
    }
  });

  it('숫자만으로 이뤄진 6자리는 유효한 코드가 아니다', () => {
    expect(isInviteCode('123456')).toBe(false);
  });

  it('혼동 문자(0/O/1/I/L)는 코드에 쓰지 않는다', () => {
    for (const ch of ['0', 'O', '1', 'I', 'L']) {
      expect(STAFFROOM_INVITE_CODE_ALPHABET.includes(ch)).toBe(false);
    }
  });

  it('붙여넣기 공백·하이픈·소문자를 정리한다', () => {
    expect(normalizeInviteCode(' ab c-d ef ')).toBe('ABCDEF');
  });

  it('길이가 다르면 거부', () => {
    expect(isInviteCode('ABCDE')).toBe(false);
    expect(isInviteCode('ABCDEFG')).toBe(false);
  });
});
