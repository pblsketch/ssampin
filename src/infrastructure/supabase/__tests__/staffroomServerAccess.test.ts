/**
 * 온라인 교무실 — 서버 인가 로직 테스트
 *
 * 왜 여기에 있나: vitest.config.ts 의 include 는 `src/**` 와 `electron/**` 뿐이라
 * `supabase/functions/**` 아래에 둔 테스트는 CI 에서 돌지 않는다
 * (기존 `_shared/sigRetention.test.ts` 가 그 상태다).
 * 서버 인가는 "남의 부서가 보이지 않는다"를 떠받치는 부분이라 돌지 않는 테스트로
 * 둘 수 없어, 순수 함수만 상대경로로 불러와 여기서 검증한다.
 */
import { describe, it, expect } from 'vitest';
import {
  canChangeRole,
  canRemoveMember,
  countAdmins,
  denialMessage,
  denialStatus,
  findMember,
  inviteExpiryFromDays,
  isInviteCodeFormat,
  isLastAdmin,
  normalizeInviteCode,
  requireAdmin,
  requireMember,
  type AccessMember,
} from '../../../../supabase/functions/_shared/staffroomAccess.ts';

const ADMIN: AccessMember = { id: 'a1', email: 'kim@school.kr', role: 'admin' };
const ADMIN2: AccessMember = { id: 'a2', email: 'park@school.kr', role: 'admin' };
const MEMBER: AccessMember = { id: 'm1', email: 'lee@school.kr', role: 'member' };

const SOLO = [ADMIN, MEMBER];
const DUO = [ADMIN, ADMIN2, MEMBER];

describe('멤버십 확인 — 남의 부서 차단', () => {
  it('멤버가 아니면 거부한다', () => {
    expect(requireMember(SOLO, 'stranger@other.kr')).toEqual({
      ok: false,
      reason: 'not_member',
    });
  });

  it('멤버면 통과하고 그 사람의 멤버 정보를 돌려준다', () => {
    const result = requireMember(SOLO, 'lee@school.kr');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.member.id).toBe('m1');
  });

  it('지메일 대소문자·앞뒤 공백이 달라도 같은 사람으로 본다', () => {
    expect(requireMember(SOLO, '  LEE@School.KR ').ok).toBe(true);
  });

  it('빈 멤버 목록에서는 누구도 통과하지 못한다', () => {
    expect(requireMember([], 'kim@school.kr').ok).toBe(false);
  });

  it('멤버가 아닌 사람은 not_member 로 막히고 403 을 받는다 (부서 존재 여부를 알려주지 않는다)', () => {
    const result = requireMember(SOLO, 'stranger@other.kr');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(denialStatus(result.reason)).toBe(403);
  });

  it('findMember 는 없으면 null 이다', () => {
    expect(findMember(SOLO, 'nobody@x.kr')).toBeNull();
  });
});

describe('관리자 확인 — 일반 멤버의 관리 조작 거부', () => {
  it('일반 멤버는 관리자 조작을 못 한다', () => {
    expect(requireAdmin(SOLO, 'lee@school.kr')).toEqual({ ok: false, reason: 'not_admin' });
  });

  it('아예 멤버가 아니면 not_admin 이 아니라 not_member 다', () => {
    expect(requireAdmin(SOLO, 'stranger@other.kr')).toEqual({ ok: false, reason: 'not_member' });
  });

  it('관리자는 통과한다', () => {
    expect(requireAdmin(SOLO, 'kim@school.kr').ok).toBe(true);
  });
});

describe('마지막 관리자 보호 (서버 쪽)', () => {
  it('관리자 수를 센다', () => {
    expect(countAdmins(SOLO)).toBe(1);
    expect(countAdmins(DUO)).toBe(2);
  });

  it('관리자가 한 명뿐이면 마지막 관리자다', () => {
    expect(isLastAdmin(SOLO, 'a1')).toBe(true);
  });

  it('일반 멤버는 마지막 관리자가 아니다', () => {
    expect(isLastAdmin(SOLO, 'm1')).toBe(false);
  });

  it('마지막 관리자를 강등하려 하면 막고 409 를 준다', () => {
    const result = canChangeRole(SOLO, 'kim@school.kr', 'a1', 'member');
    expect(result).toEqual({ ok: false, reason: 'last_admin' });
    if (!result.ok) expect(denialStatus(result.reason)).toBe(409);
  });

  it('마지막 관리자를 내보내려 하면 막는다', () => {
    expect(canRemoveMember(SOLO, 'kim@school.kr', 'a1')).toEqual({
      ok: false,
      reason: 'last_admin',
    });
  });

  it('관리자가 둘이면 한 명은 강등할 수 있다', () => {
    expect(canChangeRole(DUO, 'kim@school.kr', 'a1', 'member').ok).toBe(true);
  });

  it('일반 멤버로 올리는 요청은 마지막 관리자 보호와 무관하다', () => {
    expect(canChangeRole(SOLO, 'kim@school.kr', 'm1', 'admin').ok).toBe(true);
  });

  it('일반 멤버가 권한 변경을 시도하면 마지막 관리자 판정 전에 막힌다', () => {
    expect(canChangeRole(DUO, 'lee@school.kr', 'a1', 'member')).toEqual({
      ok: false,
      reason: 'not_admin',
    });
  });

  it('멤버가 아닌 사람이 내보내기를 시도하면 not_member 다', () => {
    expect(canRemoveMember(DUO, 'stranger@other.kr', 'm1')).toEqual({
      ok: false,
      reason: 'not_member',
    });
  });
});

describe('초대 코드 형식 — 숫자 6자리 금지', () => {
  it('31자 알파벳 6자리만 통과한다', () => {
    expect(isInviteCodeFormat('ABCDEF')).toBe(true);
    expect(isInviteCodeFormat('234567')).toBe(true);
  });

  it('혼동 문자가 들어가면 거부', () => {
    expect(isInviteCodeFormat('ABC0EF')).toBe(false);
    expect(isInviteCodeFormat('ABCOEF')).toBe(false);
    expect(isInviteCodeFormat('ABC1EF')).toBe(false);
    expect(isInviteCodeFormat('ABCIEF')).toBe(false);
    expect(isInviteCodeFormat('ABCLEF')).toBe(false);
  });

  it('길이가 다르면 거부', () => {
    expect(isInviteCodeFormat('ABCDE')).toBe(false);
    expect(isInviteCodeFormat('ABCDEFG')).toBe(false);
  });

  it('소문자·공백·하이픈을 정리한다', () => {
    expect(normalizeInviteCode(' ab-cd ef ')).toBe('ABCDEF');
  });
});

describe('초대 만료 계산', () => {
  const NOW = Date.parse('2026-09-01T00:00:00.000Z');

  it('무기한이면 null', () => {
    expect(inviteExpiryFromDays(null, NOW)).toBeNull();
  });

  it('7일이면 7일 뒤 시각', () => {
    expect(inviteExpiryFromDays(7, NOW)).toBe('2026-09-08T00:00:00.000Z');
  });

  it('0 이하나 이상한 값은 무기한으로 떨어뜨린다 (과거 만료를 만들지 않는다)', () => {
    expect(inviteExpiryFromDays(0, NOW)).toBeNull();
    expect(inviteExpiryFromDays(-5, NOW)).toBeNull();
    expect(inviteExpiryFromDays(Number.NaN, NOW)).toBeNull();
  });
});

describe('거절 문구', () => {
  it('모든 사유가 한국어 문구를 갖는다', () => {
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
      expect(/[가-힣]/.test(denialMessage(reason))).toBe(true);
      expect(denialStatus(reason)).toBeGreaterThanOrEqual(400);
    }
  });
});
