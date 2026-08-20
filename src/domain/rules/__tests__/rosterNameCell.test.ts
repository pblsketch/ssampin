/**
 * 사진 명렬표 이름 칸 읽기.
 *
 * 나이스는 명렬표 종류에 따라 이름 칸을 다르게 쓴다.
 * - 담임(학급): `1번  강나영`
 * - 교과별 수강학생: `3학년 1반 2번  권지민`  ← 여러 반이 섞이므로 소속이 함께 적힌다
 *
 * 수업반 형태의 학년-반-번호는 **앱이 수업반 학생을 구분할 때 이미 쓰는 키와 같다.**
 */
import { describe, it, expect } from 'vitest';
import { isTeachingClassNameCell, parseRosterNameCell } from '@domain/rules/rosterNameCell';

describe('parseRosterNameCell — 담임(학급) 명렬표', () => {
  it('`1번  강나영` 을 읽는다', () => {
    expect(parseRosterNameCell('1번  강나영')).toEqual({ studentNumber: 1, name: '강나영' });
  });

  it('두 자리 번호와 공백 변형도 읽는다', () => {
    expect(parseRosterNameCell(' 22번 한지우 ')).toEqual({ studentNumber: 22, name: '한지우' });
  });

  it('복성도 이름 전체를 가져온다', () => {
    expect(parseRosterNameCell('7번  남궁 민수')?.name).toBe('남궁 민수');
  });
});

describe('parseRosterNameCell — 수업반(교과) 명렬표', () => {
  it('★학년·반·번호를 모두 읽는다', () => {
    expect(parseRosterNameCell('3학년 1반 2번  권지민')).toEqual({
      grade: 3,
      classNum: 1,
      studentNumber: 2,
      name: '권지민',
    });
  });

  it('두 자리 번호도 정확히 가른다', () => {
    expect(parseRosterNameCell('3학년 2반 10번  안혜지')).toEqual({
      grade: 3,
      classNum: 2,
      studentNumber: 10,
      name: '안혜지',
    });
  });

  it('★담임 규칙이 앞부분을 먼저 삼키지 않는다', () => {
    // `^(\d+)번` 을 먼저 시도하면 "3학년 1반 2번 권지민" 에서 엉뚱하게 걸릴 수 있다.
    // 반드시 수업반 형태를 먼저 판정해야 한다.
    const parsed = parseRosterNameCell('3학년 1반 2번  권지민');
    expect(parsed?.studentNumber).toBe(2); // 3(학년)이 아니라 2(번호)
    expect(parsed?.name).toBe('권지민'); // '학년 1반 2번 권지민' 이 아니다
  });

  it('소속 여부를 구분할 수 있다', () => {
    expect(isTeachingClassNameCell(parseRosterNameCell('3학년 1반 2번  권지민')!)).toBe(true);
    expect(isTeachingClassNameCell(parseRosterNameCell('1번  강나영')!)).toBe(false);
  });
});

describe('parseRosterNameCell — 이름 칸이 아닌 것', () => {
  it.each([
    ['교과별수강학생사진명렬표'],
    ['사진명렬표'],
    ['홍성여자고등학교'],
    ['교과 : 고전 읽기 3학년  3-1 반'],
    ['담당교사 : 이민경'],
    ['2026.08.20.'],
    ['/'],
    [''],
    ['   '],
  ])('%s 는 이름 칸이 아니다', (text) => {
    expect(parseRosterNameCell(text)).toBeNull();
  });
});
