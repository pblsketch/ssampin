/**
 * 상담·설문 교사 접근 판정 테스트 (ADR-095, 계획서 §9.1)
 *
 * 왜 여기에 있나: vitest.config.ts 의 include 는 `src/**` 와 `electron/**` 뿐이라
 * `supabase/functions/**` 아래 테스트는 CI 에서 돌지 않는다. 이 판정이 "링크만 가진
 * 사람은 명단을 못 본다"를 떠받치는 자리라 돌지 않는 테스트로 둘 수 없어, 순수 함수만
 * 상대경로로 불러와 여기서 검증한다(`staffroomServerAccess.test.ts` 선례와 같다).
 */
import { describe, it, expect } from 'vitest';
import {
  computeGraceUntil,
  decideReadAccess,
  decideWriteAccess,
  effectiveGraceUntil,
  normalizeEmail,
  toDateKey,
  type OwnedRow,
} from '../../../../supabase/functions/_shared/consultationAccess.ts';
import {
  isAudienceAllowed,
  isCacheFresh,
  parseAllowedAudiences,
  readTokenInfo,
} from '../../../../supabase/functions/_shared/googleAudience.ts';

const DEADLINE = '2026-11-30';
const OWNED: OwnedRow = { ownerEmail: 'kim@school.kr', adminKey: 'key-1', legacyGraceUntil: null };
const LEGACY: OwnedRow = { ownerEmail: null, adminKey: 'key-1', legacyGraceUntil: '2026-10-15' };

/** 기한 안 / 기한 뒤 (한국 시간 기준) */
const BEFORE = new Date('2026-10-10T03:00:00Z');
const AFTER = new Date('2026-10-20T03:00:00Z');

const read = (over: Partial<Parameters<typeof decideReadAccess>[0]>) =>
  decideReadAccess({
    row: LEGACY,
    identityEmail: 'kim@school.kr',
    providedAdminKey: 'key-1',
    now: BEFORE,
    globalDeadline: DEADLINE,
    ...over,
  });

describe('소유자가 정해진 일정 — 그 계정만 연다', () => {
  it('만든 계정이면 허용한다', () => {
    expect(read({ row: OWNED })).toEqual({ ok: true, mode: 'owner' });
  });

  it('다른 계정이면 different_account 로 막는다', () => {
    expect(read({ row: OWNED, identityEmail: 'park@school.kr' })).toEqual({
      ok: false,
      reason: 'different_account',
    });
  });

  it('관리 키가 맞아도 다른 계정이면 못 연다 — 키는 더 이상 신분증이 아니다', () => {
    expect(
      read({ row: OWNED, identityEmail: 'park@school.kr', providedAdminKey: 'key-1' }),
    ).toEqual({
      ok: false,
      reason: 'different_account',
    });
  });

  it('대소문자·앞뒤 공백이 달라도 같은 사람으로 본다', () => {
    expect(read({ row: OWNED, identityEmail: '  KIM@School.KR ' })).toEqual({
      ok: true,
      mode: 'owner',
    });
  });

  it('소유자 쪽에 대문자가 섞여 있어도 맞춘다', () => {
    const row = { ...OWNED, ownerEmail: 'KIM@SCHOOL.KR' };
    expect(read({ row })).toEqual({ ok: true, mode: 'owner' });
  });
});

describe('학부모 시나리오 — 링크만 가진 사람은 새 문으로 못 들어온다', () => {
  it('구글 토큰이 없으면 관리 키가 맞아도 not_connected 다', () => {
    expect(read({ identityEmail: null })).toEqual({ ok: false, reason: 'not_connected' });
  });

  it('소유자가 정해진 일정에서도 토큰이 없으면 not_connected 다', () => {
    expect(read({ row: OWNED, identityEmail: null })).toEqual({
      ok: false,
      reason: 'not_connected',
    });
  });

  it('기한이 지난 옛 일정에서도 토큰 없음이 먼저다', () => {
    expect(read({ identityEmail: null, now: AFTER })).toEqual({
      ok: false,
      reason: 'not_connected',
    });
  });
});

describe('소유자가 없는 옛 일정 — 기한 안에서 관리 키로', () => {
  it('토큰 확인 + 기한 안 + 키 일치면 허용한다', () => {
    expect(read({})).toEqual({ ok: true, mode: 'legacy' });
  });

  it('소유자가 없으면 누구 계정이든(확인만 되면) 통과한다 — 소유자를 못 정하기 때문이다', () => {
    expect(read({ identityEmail: 'anyone@school.kr' })).toEqual({ ok: true, mode: 'legacy' });
  });

  it('기한이 지나면 legacy_closed 다', () => {
    expect(read({ now: AFTER })).toEqual({ ok: false, reason: 'legacy_closed' });
  });

  it('키가 틀리면 key_mismatch 다', () => {
    expect(read({ providedAdminKey: 'wrong' })).toEqual({ ok: false, reason: 'key_mismatch' });
  });

  it('키가 아예 없으면 key_mismatch 다', () => {
    expect(read({ providedAdminKey: null })).toEqual({ ok: false, reason: 'key_mismatch' });
  });

  it('기한이 지났으면 키가 틀려도 legacy_closed 로 답한다 — 닫힌 문에서 키 이야기를 하지 않는다', () => {
    expect(read({ now: AFTER, providedAdminKey: 'wrong' })).toEqual({
      ok: false,
      reason: 'legacy_closed',
    });
  });

  it('행에 기한이 비어 있으면 전역 기한까지는 열린다', () => {
    const row = { ...LEGACY, legacyGraceUntil: null };
    expect(read({ row, now: new Date('2026-11-20T03:00:00Z') })).toEqual({
      ok: true,
      mode: 'legacy',
    });
    expect(read({ row, now: new Date('2026-12-01T03:00:00Z') })).toEqual({
      ok: false,
      reason: 'legacy_closed',
    });
  });

  it('기한 당일은 아직 열려 있다', () => {
    expect(read({ now: new Date('2026-10-15T12:00:00Z') })).toEqual({ ok: true, mode: 'legacy' });
  });
});

describe('수정 판정 — 조회와 같은 규칙이다', () => {
  const write = (over: Partial<Parameters<typeof decideWriteAccess>[0]>) =>
    decideWriteAccess({
      row: LEGACY,
      identityEmail: 'kim@school.kr',
      providedAdminKey: 'key-1',
      now: BEFORE,
      globalDeadline: DEADLINE,
      ...over,
    });

  it('소유자면 고칠 수 있다', () => {
    expect(write({ row: OWNED })).toEqual({ ok: true, mode: 'owner' });
  });

  it('다른 계정은 못 고친다', () => {
    expect(write({ row: OWNED, identityEmail: 'park@school.kr' })).toEqual({
      ok: false,
      reason: 'different_account',
    });
  });

  it('토큰이 없으면 못 고친다 — 오늘은 신원 확인 없이 고쳐지던 자리다', () => {
    expect(write({ identityEmail: null })).toEqual({ ok: false, reason: 'not_connected' });
  });

  it('소유자가 없는 옛 일정도 기한 안에서는 고칠 수 있다', () => {
    // ★ 이걸 막으면 선생님이 071 이전에 만든 자기 일정을 마감도 보관도 못 하게 된다.
    //   운영에 그런 일정이 200건 넘게 있다.
    expect(write({})).toEqual({ ok: true, mode: 'legacy' });
  });

  it('소유자가 없어도 기한이 지나면 못 고친다', () => {
    expect(write({ now: AFTER })).toEqual({ ok: false, reason: 'legacy_closed' });
  });
});

describe('유예 만료일 계산 — 071 의 SQL 과 같은 공식', () => {
  it('일정별이 이르면 일정별을 쓴다', () => {
    expect(computeGraceUntil('2026-09-30', DEADLINE)).toBe('2026-10-30');
  });

  it('전역이 이르면 전역을 쓴다', () => {
    expect(computeGraceUntil('2027-03-01', DEADLINE)).toBe(DEADLINE);
  });

  it('날짜가 없는 설문은 전역 기한만 쓴다', () => {
    expect(computeGraceUntil(null, DEADLINE)).toBe(DEADLINE);
  });

  it('월을 넘어가는 30일 더하기가 맞다', () => {
    expect(computeGraceUntil('2026-10-20', DEADLINE)).toBe('2026-11-19');
  });

  it('실제로 적용되는 기한은 행 값과 전역 중 이른 쪽이다', () => {
    expect(effectiveGraceUntil('2026-10-15', DEADLINE)).toBe('2026-10-15');
    expect(effectiveGraceUntil('2027-01-01', DEADLINE)).toBe(DEADLINE);
    expect(effectiveGraceUntil(null, DEADLINE)).toBe(DEADLINE);
  });
});

describe('날짜 자르기는 한국 시간으로 한다', () => {
  it('한국의 자정 직후는 이미 다음 날이다', () => {
    // 2026-10-16 00:30 KST = 2026-10-15 15:30 UTC. UTC 로 자르면 하루 전으로 판정된다.
    expect(toDateKey(new Date('2026-10-15T15:30:00Z'))).toBe('2026-10-16');
  });

  it('기한 마지막 날 한국 아침에 아직 열려 있고, 다음 날 아침에는 닫힌다', () => {
    expect(read({ now: new Date('2026-10-14T23:00:00Z') })).toEqual({ ok: true, mode: 'legacy' });
    expect(read({ now: new Date('2026-10-15T23:00:00Z') })).toEqual({
      ok: false,
      reason: 'legacy_closed',
    });
  });
});

describe('이메일 정규화', () => {
  it('앞뒤 공백을 없애고 소문자로 만든다', () => {
    expect(normalizeEmail('  Kim@School.KR ')).toBe('kim@school.kr');
  });
});

describe('토큰을 발급받은 앱(aud) 확인', () => {
  it('허용 목록 문자열을 쉼표로 가른다', () => {
    expect(
      parseAllowedAudiences('a.apps.googleusercontent.com, b.apps.googleusercontent.com'),
    ).toEqual(['a.apps.googleusercontent.com', 'b.apps.googleusercontent.com']);
  });

  it('미설정·빈 값은 빈 목록이다', () => {
    expect(parseAllowedAudiences(undefined)).toEqual([]);
    expect(parseAllowedAudiences('')).toEqual([]);
    expect(parseAllowedAudiences('  ,  ')).toEqual([]);
  });

  it('허용 목록이 비어 있으면 검사하지 않는다 — 설정 전에 전부 막으면 명단이 통째로 안 보인다', () => {
    expect(isAudienceAllowed('anything', [])).toBe(true);
    expect(isAudienceAllowed(null, [])).toBe(true);
  });

  it('목록이 있으면 그 안에 있어야 통과한다', () => {
    expect(isAudienceAllowed('a', ['a', 'b'])).toBe(true);
    expect(isAudienceAllowed('c', ['a', 'b'])).toBe(false);
    expect(isAudienceAllowed(null, ['a'])).toBe(false);
  });

  it('tokeninfo 의 email_verified 는 문자열 "false" 로 온다 — 그걸 참으로 읽지 않는다', () => {
    expect(readTokenInfo({ aud: 'a', email: 'x@y.kr', email_verified: 'false' })).toBeNull();
    expect(readTokenInfo({ aud: 'a', email: 'x@y.kr', email_verified: false })).toBeNull();
    expect(readTokenInfo({ aud: 'a', email: 'X@Y.kr', email_verified: 'true' })).toEqual({
      aud: 'a',
      email: 'x@y.kr',
    });
  });

  it('이메일이 없으면 null 로 표시해 userinfo 로 한 번 더 묻게 한다', () => {
    expect(readTokenInfo({ aud: 'a' })).toEqual({ aud: 'a', email: null });
  });

  it('응답이 아니면 null 이다', () => {
    expect(readTokenInfo(null)).toBeNull();
    expect(readTokenInfo('nope')).toBeNull();
  });
});

describe('신원 캐시 — 철회된 토큰이 통과하는 창의 크기', () => {
  it('창 안이면 쓴다', () => {
    expect(isCacheFresh({ email: 'a@b.kr', storedAt: 1000 }, 1000 + 4 * 60_000, 5 * 60_000)).toBe(
      true,
    );
  });

  it('창을 넘기면 안 쓴다', () => {
    expect(isCacheFresh({ email: 'a@b.kr', storedAt: 1000 }, 1000 + 6 * 60_000, 5 * 60_000)).toBe(
      false,
    );
  });

  it('창이 0 이면 아예 안 쓴다', () => {
    expect(isCacheFresh({ email: 'a@b.kr', storedAt: 1000 }, 1000, 0)).toBe(false);
  });

  it('시계가 거꾸로 가면 안 쓴다', () => {
    expect(isCacheFresh({ email: 'a@b.kr', storedAt: 5000 }, 1000, 5 * 60_000)).toBe(false);
  });
});
