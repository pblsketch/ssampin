import { describe, it, expect } from 'vitest';
import type { Student } from '@domain/entities/Student';
import type { StaffContact } from '@domain/entities/StaffContact';
import {
  normalizePhoneDigits,
  formatPhoneNumber,
  telHref,
  matchesContactQuery,
  staffToEntry,
  studentToEntry,
  guardianEntriesOf,
  sortContactEntries,
  filterContactEntries,
  filterStaffContacts,
} from '../contactRules';

const staff = (over: Partial<StaffContact> = {}): StaffContact => ({
  id: 's1',
  name: '김민호',
  createdAt: '2026-08-21T00:00:00.000Z',
  ...over,
});

const student = (over: Partial<Student> = {}): Student => ({
  id: 'st1',
  name: '홍길동',
  ...over,
});

describe('normalizePhoneDigits', () => {
  it('숫자만 남긴다', () => {
    expect(normalizePhoneDigits('010-1234-5678')).toBe('01012345678');
    expect(normalizePhoneDigits('(02) 123 4567')).toBe('021234567');
  });

  it('숫자가 없으면 빈 문자열', () => {
    expect(normalizePhoneDigits('내선')).toBe('');
  });
});

describe('formatPhoneNumber', () => {
  it('휴대폰 11자리를 3-4-4로 끊는다', () => {
    expect(formatPhoneNumber('01012345678')).toBe('010-1234-5678');
  });

  it('지역번호 10자리를 3-3-4로 끊는다', () => {
    expect(formatPhoneNumber('0311234567')).toBe('031-123-4567');
  });

  it('서울 02는 9자리·10자리를 각각 다르게 끊는다', () => {
    expect(formatPhoneNumber('021234567')).toBe('02-123-4567');
    expect(formatPhoneNumber('0212345678')).toBe('02-1234-5678');
  });

  it('지역번호 없는 8자리를 4-4로 끊는다', () => {
    expect(formatPhoneNumber('12345678')).toBe('1234-5678');
  });

  it('내선처럼 규칙에 없는 자릿수는 원본을 그대로 둔다', () => {
    expect(formatPhoneNumber('1234')).toBe('1234');
    expect(formatPhoneNumber('+81 90-1234-5678')).toBe('+81 90-1234-5678');
  });

  it('빈 값과 공백은 빈 문자열', () => {
    expect(formatPhoneNumber('')).toBe('');
    expect(formatPhoneNumber('   ')).toBe('');
  });

  it('이미 형식이 잡힌 번호도 같은 결과를 낸다(멱등)', () => {
    expect(formatPhoneNumber('010-1234-5678')).toBe('010-1234-5678');
  });
});

describe('telHref', () => {
  it('숫자만 뽑아 tel: 링크를 만든다', () => {
    expect(telHref('010-1234-5678')).toBe('tel:01012345678');
  });

  it('번호가 없거나 숫자가 없으면 null', () => {
    expect(telHref(undefined)).toBeNull();
    expect(telHref('연락처 없음')).toBeNull();
  });
});

describe('matchesContactQuery', () => {
  const text = ['김민호', '3학년부', '부장'];
  const phones = ['010-1234-5678', '1502'];

  it('빈 검색어는 모두 통과', () => {
    expect(matchesContactQuery(text, phones, '   ')).toBe(true);
  });

  it('이름 부분 일치', () => {
    expect(matchesContactQuery(text, phones, '민호')).toBe(true);
    expect(matchesContactQuery(text, phones, '박')).toBe(false);
  });

  it('초성으로 찾는다', () => {
    expect(matchesContactQuery(text, phones, 'ㄱㅁㅎ')).toBe(true);
    expect(matchesContactQuery(text, phones, 'ㅂㅈ')).toBe(true); // 부장
    expect(matchesContactQuery(text, phones, 'ㅋㅋㅋ')).toBe(false);
  });

  it('숫자로 번호를 찾는다', () => {
    expect(matchesContactQuery(text, phones, '1502')).toBe(true);
    expect(matchesContactQuery(text, phones, '1234')).toBe(true);
    expect(matchesContactQuery(text, phones, '9999')).toBe(false);
  });

  it('한 자리 숫자는 번호 검색으로 치지 않는다 — 전부 걸려 검색이 무의미해진다', () => {
    expect(matchesContactQuery(['김민호'], ['1502'], '5')).toBe(false);
  });

  it('숫자와 하이픈으로 된 글자(담임 학급 2-4)를 번호로 오인하지 않는다', () => {
    expect(matchesContactQuery(['2-4'], ['01011112222'], '2-4')).toBe(true);
  });

  it('하이픈을 넣고 빼도 같은 번호를 찾는다', () => {
    expect(matchesContactQuery(text, phones, '010-1234')).toBe(true);
    expect(matchesContactQuery(text, phones, '0101234')).toBe(true);
  });

  it('영문 대소문자를 구분하지 않는다', () => {
    expect(matchesContactQuery(['minho@school.kr'], [], 'MINHO')).toBe(true);
  });
});

describe('staffToEntry', () => {
  it('부서·직위·과목을 가운뎃점으로 잇는다', () => {
    const e = staffToEntry(staff({ department: '3학년부', position: '부장', subject: '수학' }));
    expect(e.subtitle).toBe('3학년부 · 부장 · 수학');
    expect(e.key).toBe('staff:s1');
  });

  it('비어 있는 항목은 건너뛴다', () => {
    const e = staffToEntry(staff({ department: '정보부', position: '   ' }));
    expect(e.subtitle).toBe('정보부');
  });

  it('휴대폰이 없으면 내선을 대표 번호로 쓴다', () => {
    expect(staffToEntry(staff({ officePhone: '1502' })).phone).toBe('1502');
    expect(staffToEntry(staff({ mobile: '01011112222', officePhone: '1502' })).phone).toBe(
      '01011112222',
    );
  });
});

describe('studentToEntry', () => {
  it('번호가 없는 학생은 목록에 넣지 않는다', () => {
    expect(studentToEntry(student())).toBeNull();
  });

  it('학번을 부제로 보여준다', () => {
    const e = studentToEntry(student({ phone: '01099998888', studentNumber: 10201 }));
    expect(e?.subtitle).toBe('10201');
    expect(e?.kind).toBe('student');
  });
});

describe('guardianEntriesOf', () => {
  it('보호자 호칭이 있으면 "학생이름 호칭"으로 보여준다', () => {
    const list = guardianEntriesOf(
      student({ parentPhone: '01011112222', parentPhoneLabel: '어머니' }),
    );
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe('홍길동 어머니');
  });

  it('호칭이 없으면 보호자1/2로 매긴다', () => {
    const list = guardianEntriesOf(
      student({ parentPhone: '01011112222', parentPhone2: '01033334444' }),
    );
    expect(list.map((g) => g.name)).toEqual(['홍길동 보호자1', '홍길동 보호자2']);
    expect(list[1]?.key).toBe('guardian:st1:2');
  });

  it('보호자1이 비고 보호자2만 있으면 2번 자리만 만든다', () => {
    const list = guardianEntriesOf(student({ parentPhone2: '01033334444' }));
    expect(list).toHaveLength(1);
    expect(list[0]?.key).toBe('guardian:st1:2');
  });

  it('번호가 하나도 없으면 빈 배열', () => {
    expect(guardianEntriesOf(student())).toEqual([]);
  });
});

describe('sortContactEntries', () => {
  it('즐겨찾기가 위로, 그 다음 가나다순', () => {
    const entries = [
      staffToEntry(staff({ id: 'a', name: '홍길동' })),
      staffToEntry(staff({ id: 'b', name: '강수진' })),
      staffToEntry(staff({ id: 'c', name: '박서준', favorite: true })),
    ];
    expect(sortContactEntries(entries).map((e) => e.name)).toEqual(['박서준', '강수진', '홍길동']);
  });

  it('원본 배열을 건드리지 않는다', () => {
    const entries = [
      staffToEntry(staff({ id: 'a', name: '홍길동' })),
      staffToEntry(staff({ id: 'b', name: '강수진' })),
    ];
    sortContactEntries(entries);
    expect(entries[0]?.name).toBe('홍길동');
  });
});

describe('filterContactEntries', () => {
  const entries = [
    staffToEntry(staff({ id: 'a', name: '김민호', department: '3학년부', mobile: '01011112222' })),
    staffToEntry(staff({ id: 'b', name: '박서준', department: '정보부', officePhone: '1502' })),
  ];

  it('검색과 정렬을 함께 적용한다', () => {
    expect(filterContactEntries(entries, '정보부').map((e) => e.name)).toEqual(['박서준']);
    expect(filterContactEntries(entries, '1502').map((e) => e.name)).toEqual(['박서준']);
  });

  it('빈 검색어면 전부 정렬해서 돌려준다', () => {
    expect(filterContactEntries(entries, '').map((e) => e.name)).toEqual(['김민호', '박서준']);
  });
});

describe('filterStaffContacts', () => {
  it('메모까지 훑어서 찾는다', () => {
    const list = [staff({ memo: '수요일 출장 잦음' }), staff({ id: 's2', name: '박서준' })];
    expect(filterStaffContacts(list, '출장').map((c) => c.name)).toEqual(['김민호']);
  });

  it('담임 학급 표기로도 찾는다', () => {
    const list = [staff({ homeroom: '2-4' }), staff({ id: 's2', name: '박서준', homeroom: '3-1' })];
    expect(filterStaffContacts(list, '2-4').map((c) => c.name)).toEqual(['김민호']);
  });
});
