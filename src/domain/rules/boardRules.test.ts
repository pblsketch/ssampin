import { describe, it, expect } from 'vitest';
import {
  sanitizeParticipantName,
  canonicalParticipantName,
  nextAvailableName,
  verifyJoinCredentials,
  mergeParticipantHistory,
  canEditElement,
  PARTICIPANT_NAME_MAX_LENGTH,
} from './boardRules';
import type { BoardAuthToken } from '@domain/valueObjects/BoardAuthToken';
import type { BoardSessionCode } from '@domain/valueObjects/BoardSessionCode';

describe('sanitizeParticipantName', () => {
  it('일반 이름은 그대로 통과', () => {
    expect(sanitizeParticipantName('민수')).toBe('민수');
  });
  it('앞뒤 공백 제거', () => {
    expect(sanitizeParticipantName('  민수  ')).toBe('민수');
  });
  it('빈 문자열은 null', () => {
    expect(sanitizeParticipantName('')).toBeNull();
  });
  it('공백만 있으면 null', () => {
    expect(sanitizeParticipantName('   ')).toBeNull();
  });
  it('제로폭 문자만 있으면 null', () => {
    expect(sanitizeParticipantName('​‌')).toBeNull();
  });
  it('최대 길이로 자름', () => {
    const long = '가'.repeat(20);
    expect(sanitizeParticipantName(long)?.length).toBe(PARTICIPANT_NAME_MAX_LENGTH);
  });
  it('이모지 허용', () => {
    expect(sanitizeParticipantName('😀민수')).toBe('😀민수');
  });
});

describe('canonicalParticipantName', () => {
  it('접미사 없으면 그대로', () => {
    expect(canonicalParticipantName('민수')).toBe('민수');
  });
  it('(2) 형태 접미사 제거', () => {
    expect(canonicalParticipantName('민수(2)')).toBe('민수');
  });
  it('(23) 두 자리 숫자 접미사 제거', () => {
    expect(canonicalParticipantName('민수(23)')).toBe('민수');
  });
  it('중간 괄호는 유지', () => {
    expect(canonicalParticipantName('민수(1)더')).toBe('민수(1)더');
  });
});

describe('nextAvailableName', () => {
  it('빈 목록은 base 그대로', () => {
    expect(nextAvailableName('민수', [])).toBe('민수');
  });
  it('1건 중복 시 (2)', () => {
    expect(nextAvailableName('민수', ['민수'])).toBe('민수(2)');
  });
  it('2건 중복 시 (3)', () => {
    expect(nextAvailableName('민수', ['민수', '민수(2)'])).toBe('민수(3)');
  });
  it('다른 이름은 그대로', () => {
    expect(nextAvailableName('지우', ['민수', '민수(2)'])).toBe('지우');
  });
});

describe('verifyJoinCredentials', () => {
  const validToken = 'a'.repeat(32) as BoardAuthToken;
  const validCode = 'ABCDEF' as BoardSessionCode;

  it('완전 일치 시 true', () => {
    expect(
      verifyJoinCredentials(validToken, validCode, { token: validToken, code: validCode }),
    ).toBe(true);
  });
  it('세션 코드 불일치 시 false', () => {
    expect(
      verifyJoinCredentials('a'.repeat(32), 'ABCDEZ', { token: validToken, code: validCode }),
    ).toBe(false);
  });
  it('토큰 불일치 시 false', () => {
    expect(
      verifyJoinCredentials('b'.repeat(32), 'ABCDEF', { token: validToken, code: validCode }),
    ).toBe(false);
  });
  it('토큰 형식 불량 false', () => {
    expect(verifyJoinCredentials('xxx', validCode, { token: validToken, code: validCode })).toBe(
      false,
    );
  });
  it('대문자 hex 토큰은 거부', () => {
    expect(
      verifyJoinCredentials('A'.repeat(32), validCode, { token: validToken, code: validCode }),
    ).toBe(false);
  });
});

describe('mergeParticipantHistory', () => {
  it('빈 목록에 새 이름 추가', () => {
    expect(mergeParticipantHistory([], ['민수'])).toEqual(['민수']);
  });
  it('canonical 중복은 무시', () => {
    expect(mergeParticipantHistory(['민수'], ['민수(2)'])).toEqual(['민수']);
  });
  it('신규 이름 등장 순서 보존', () => {
    expect(mergeParticipantHistory(['민수'], ['서연', '지우'])).toEqual(['민수', '서연', '지우']);
  });
  it('incoming 내부 중복도 제거', () => {
    expect(mergeParticipantHistory(['민수'], ['서연', '서연(2)'])).toEqual(['민수', '서연']);
  });
  it('빈 이름은 무시', () => {
    expect(mergeParticipantHistory([], [''])).toEqual([]);
  });
});

describe('canEditElement', () => {
  const me = 'awareness-100';
  const other = 'awareness-200';

  describe('teacher 역할', () => {
    it('본인 sticker → true', () => {
      expect(
        canEditElement({ elementAuthorAwarenessId: me, currentAwarenessId: me, role: 'teacher' }),
      ).toBe(true);
    });
    it('다른 학생 sticker → true', () => {
      expect(
        canEditElement({
          elementAuthorAwarenessId: other,
          currentAwarenessId: me,
          role: 'teacher',
        }),
      ).toBe(true);
    });
    it('템플릿(authorAwarenessId null) → true', () => {
      expect(
        canEditElement({ elementAuthorAwarenessId: null, currentAwarenessId: me, role: 'teacher' }),
      ).toBe(true);
    });
    it('undefined authorAwarenessId → true', () => {
      expect(
        canEditElement({
          elementAuthorAwarenessId: undefined,
          currentAwarenessId: me,
          role: 'teacher',
        }),
      ).toBe(true);
    });
  });

  describe('student 역할', () => {
    it('본인 sticker → true', () => {
      expect(
        canEditElement({ elementAuthorAwarenessId: me, currentAwarenessId: me, role: 'student' }),
      ).toBe(true);
    });
    it('다른 학생 sticker → false', () => {
      expect(
        canEditElement({
          elementAuthorAwarenessId: other,
          currentAwarenessId: me,
          role: 'student',
        }),
      ).toBe(false);
    });
    it('템플릿(authorAwarenessId null) → false', () => {
      expect(
        canEditElement({ elementAuthorAwarenessId: null, currentAwarenessId: me, role: 'student' }),
      ).toBe(false);
    });
    it('undefined authorAwarenessId → false', () => {
      expect(
        canEditElement({
          elementAuthorAwarenessId: undefined,
          currentAwarenessId: me,
          role: 'student',
        }),
      ).toBe(false);
    });
  });

  describe('방어적 가드', () => {
    it('빈 currentAwarenessId 는 teacher 도 false', () => {
      expect(
        canEditElement({ elementAuthorAwarenessId: me, currentAwarenessId: '', role: 'teacher' }),
      ).toBe(false);
    });
    it('빈 currentAwarenessId 는 student 도 false', () => {
      expect(
        canEditElement({ elementAuthorAwarenessId: me, currentAwarenessId: '', role: 'student' }),
      ).toBe(false);
    });
  });
});
