import { describe, it, expect } from 'vitest';
import { suggestNextLessonValue } from '../lessonNumberPattern';

/**
 * 계획서 §8 케이스 표 전량 + 금지 확인.
 *
 * ⚠️ **계획서와 다른 기대값이 하나 있다 — 케이스 13.**
 * 계획서 v1.1은 `'3차시~4차시'` → `'5'`를 기대했지만, 이 구현은 `null`을 돌려준다.
 * 이유: 계획서 표 안에서 그 기대값이 다른 두 케이스와 동시에 성립할 수 없다.
 *
 *   - 케이스 12 `'3~4'` → `'3~5'` (범위를 유지하고 마지막 숫자만 올림)
 *   - 케이스 13 `'3차시~4차시'` → `'5'`  (범위를 버리고 마지막 숫자만 남김)
 *
 * 같은 물결 표기인데 글자가 붙었다는 이유로 결과 **모양**이 달라진다. 한 파서가 둘 다
 * 만족하려면 "단위 글자가 붙으면 범위를 버린다"는 규칙이 필요한데, 그건 앱이 '차시'라는
 * 단위를 알아본다는 뜻이고 §1-1.3(앱이 차시를 정의하지 않는다)과 어긋난다.
 *
 * 그래서 오너 결정("숫자가 둘이고 층위가 갈리면 제안하지 않는다", §12 Q1)을 그대로 적용해
 * `null`로 통일했다. 케이스 10·15와 같은 처리이며, 규칙이 4단계 하나로 설명된다.
 * 사용자에게는 빈칸이 보이고, 직접 쓰면 그만이다.
 */

const FORBIDDEN_UNIT_WORDS = /차시|교시|강/;

interface Case {
  readonly no: number;
  readonly previousLesson?: string;
  readonly previousUnit?: string;
  readonly nextUnit?: string;
  readonly expected: string | null;
  readonly why: string;
}

/** 단원이 그대로인 케이스는 앞뒤 단원을 같은 값으로 준다. */
const SAME_UNIT = { previousUnit: '1단원', nextUnit: '1단원' } as const;

const CASES: readonly Case[] = [
  {
    no: 1,
    previousLesson: '3차시 - 소설의 구성',
    ...SAME_UNIT,
    expected: '4',
    why: '글자 섞임 + 숫자 하나 → 숫자만 올림, 설명은 버림',
  },
  {
    no: 2,
    previousLesson: '2-3',
    ...SAME_UNIT,
    expected: '2-4',
    why: '숫자 표현 → 마지막만 올리고 앞부분 유지',
  },
  { no: 3, previousLesson: 'Lesson 5', ...SAME_UNIT, expected: '6', why: '라벨 접두 + 숫자 하나' },
  {
    no: 4,
    previousLesson: '3차시 - 소설의 구성',
    previousUnit: '1단원',
    nextUnit: '2단원',
    expected: '1',
    why: '단원이 바뀌면 리셋',
  },
  { no: 5, previousLesson: '7', ...SAME_UNIT, expected: '8', why: '숫자만' },
  {
    no: 6,
    previousLesson: '07',
    ...SAME_UNIT,
    expected: '8',
    why: '자릿수 채움은 되살리지 않는다',
  },
  { no: 7, previousLesson: '', ...SAME_UNIT, expected: null, why: '빈 값' },
  {
    no: 8,
    previousLesson: '소설의 구성',
    ...SAME_UNIT,
    expected: null,
    why: '숫자 없음 → 추측 금지',
  },
  { no: 9, previousLesson: '중간고사', ...SAME_UNIT, expected: null, why: '숫자 없음' },
  {
    no: 10,
    previousLesson: '1단원 3차시',
    ...SAME_UNIT,
    expected: null,
    why: '숫자 둘 + 층위 갈림 → 오너 결정으로 제안 안 함',
  },
  { no: 11, previousLesson: '2-3-1', ...SAME_UNIT, expected: '2-3-2', why: '다단 숫자 표현' },
  { no: 12, previousLesson: '3~4', ...SAME_UNIT, expected: '3~5', why: '물결도 같은 숫자 표현' },
  {
    no: 13,
    previousLesson: '3차시~4차시',
    ...SAME_UNIT,
    expected: null,
    why: '글자 섞임 + 숫자 둘 → 케이스 10·15와 같은 처리(계획서 기대값에서 변경, 위 주석 참조)',
  },
  { no: 14, previousLesson: 'lesson 5', ...SAME_UNIT, expected: '6', why: '대소문자 무관' },
  {
    no: 15,
    previousLesson: 'Unit 2 Lesson 5',
    ...SAME_UNIT,
    expected: null,
    why: '숫자 둘 + 층위 갈림',
  },
  { no: 16, previousLesson: '9999', ...SAME_UNIT, expected: '10000', why: '상한 없음' },
  { no: 17, previousLesson: '-3', ...SAME_UNIT, expected: null, why: '음수는 차시가 아니다' },
  { no: 18, previousLesson: '3.5', ...SAME_UNIT, expected: null, why: '소수는 판단 보류' },
  { no: 19, previousLesson: '  4  ', ...SAME_UNIT, expected: '5', why: '앞뒤 공백 정리' },
  { no: 20, previousLesson: '3차시(보충)', ...SAME_UNIT, expected: '4', why: '괄호 주석 버림' },
  {
    no: 21,
    previousLesson: undefined,
    ...SAME_UNIT,
    expected: null,
    why: '직전 기록 없음 → 제안하지 않는다',
  },
  {
    no: 22,
    previousLesson: '복습',
    previousUnit: '1단원',
    nextUnit: '2단원',
    expected: '1',
    why: '단원 변경이 패턴 실패보다 우선',
  },
];

describe('suggestNextLessonValue — 계획서 §8 케이스 표', () => {
  for (const c of CASES) {
    it(`케이스 ${c.no}: ${JSON.stringify(c.previousLesson)} → ${JSON.stringify(c.expected)} (${c.why})`, () => {
      expect(
        suggestNextLessonValue({
          previousLesson: c.previousLesson,
          previousUnit: c.previousUnit,
          nextUnit: c.nextUnit,
        }),
      ).toBe(c.expected);
    });
  }

  it('LESSON 5 — 대문자도 같은 결과', () => {
    expect(suggestNextLessonValue({ previousLesson: 'LESSON 5', ...SAME_UNIT })).toBe('6');
  });
});

describe('suggestNextLessonValue — 금지 확인 (앱이 차시를 정의하지 않는다)', () => {
  it('케이스 전량의 반환값에 단위 글자가 한 번도 들어가지 않는다', () => {
    for (const c of CASES) {
      const got = suggestNextLessonValue({
        previousLesson: c.previousLesson,
        previousUnit: c.previousUnit,
        nextUnit: c.nextUnit,
      });
      if (got !== null) {
        expect(FORBIDDEN_UNIT_WORDS.test(got), `케이스 ${c.no} 반환값 "${got}"`).toBe(false);
      }
    }
  });

  it('반환값이 직전 기록의 설명 텍스트를 물고 오지 않는다', () => {
    const got = suggestNextLessonValue({ previousLesson: '3차시 - 소설의 구성', ...SAME_UNIT });
    expect(got).toBe('4');
    expect(got).not.toContain('소설');
  });

  it('반환값은 숫자와 구분자(-, ~)로만 이뤄진다', () => {
    for (const c of CASES) {
      const got = suggestNextLessonValue({
        previousLesson: c.previousLesson,
        previousUnit: c.previousUnit,
        nextUnit: c.nextUnit,
      });
      if (got !== null) {
        expect(/^\d+(?:[-~]\d+)*$/.test(got), `케이스 ${c.no} 반환값 "${got}"`).toBe(true);
      }
    }
  });
});

describe('suggestNextLessonValue — 단원 처리 경계', () => {
  it('다음 단원이 비어 있으면 단원 변경으로 보지 않는다', () => {
    // 날짜만 옮긴 순간처럼 단원을 아직 입력하지 않은 상태. 여기서 1을 박으면 매번 1이 된다.
    expect(
      suggestNextLessonValue({ previousLesson: '3', previousUnit: '1단원', nextUnit: '' }),
    ).toBe('4');
    expect(suggestNextLessonValue({ previousLesson: '3', previousUnit: '1단원' })).toBe('4');
  });

  it('단원 앞뒤 공백은 같은 단원으로 본다', () => {
    expect(
      suggestNextLessonValue({ previousLesson: '3', previousUnit: ' 1단원 ', nextUnit: '1단원' }),
    ).toBe('4');
  });

  it('단원이 둘 다 비어 있으면 표기 규칙으로 넘어간다', () => {
    expect(suggestNextLessonValue({ previousLesson: '3' })).toBe('4');
  });
});
