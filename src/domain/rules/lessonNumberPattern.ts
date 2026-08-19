/**
 * 진도 입력에서 **다음 차시 값을 이어서 제안**하는 규칙.
 *
 * 앱은 "이번 학기 몇 번째 수업인지"를 셀 수 있지만, 그 숫자를 입력칸에 넣으면 안 된다.
 * 선생님마다 차시를 세는 층위가 다르기 때문이다 — 학기 통으로 세는 사람, 대단원별로 세는
 * 사람, 소단원별로 세는 사람이 모두 있다. 앱이 "13차시"를 넣어 주면 그 중 두 부류에게는
 * 틀린 값이다.
 *
 * 그래서 이 규칙은 **앱이 세지 않는다.** 그 반의 **직전 기록이 쓰던 표기를 읽어 한 칸 더한다.**
 * 선생님의 방식을 앱이 따라가는 것이지, 앱의 방식을 선생님에게 주는 것이 아니다.
 *
 * 두 가지를 절대 하지 않는다:
 *  1. **단위 글자를 붙이지 않는다.** '차시'·'교시'·'강'은 반환값에 들어가지 않는다. 앱이
 *     단위를 정하면 그 순간 앱이 차시를 정의하는 셈이 된다.
 *  2. **확신할 수 없으면 제안하지 않는다.** 읽을 수 없으면 `null`을 돌려주고 호출자는 입력칸을
 *     비워 둔다. 조용히 틀린 숫자가 들어가는 것보다 빈칸이 낫다 — 빈칸은 눈에 띄지만 틀린
 *     숫자는 그대로 저장된다.
 *
 * Clean Architecture: 외부 의존 0 — 다른 모듈을 아예 import하지 않는다.
 */

/** 제안에 필요한 최소 정보. */
export interface LessonNumberSuggestionInput {
  /** 그 반의 직전 진도 기록의 차시 칸 값. 없으면 제안하지 않는다. */
  readonly previousLesson?: string;
  /** 직전 기록의 단원 칸 값. */
  readonly previousUnit?: string;
  /** 지금 입력하려는 기록의 단원 칸 값. */
  readonly nextUnit?: string;
}

/**
 * 판정 규칙 (위에서부터 먼저 맞는 것 하나만 적용):
 *
 *  1. **단원이 바뀌었다** → `'1'`. 새 단원의 첫 차시다. 표기를 읽을 수 있든 없든 이게 이긴다.
 *  2. **글자가 하나도 안 섞인 숫자 표현**(`'7'`·`'2-3'`·`'3~4'`·`'2-3-1'`) → 마지막 숫자에 1을
 *     더하고 앞부분은 그대로 둔다. 구조가 분명해 어느 숫자가 차시인지 헷갈릴 여지가 없다.
 *  3. **글자가 섞였는데 숫자가 정확히 하나**(`'3차시 - 소설의 구성'`·`'Lesson 5'`) → 그 숫자에
 *     1을 더한 값만 돌려준다. 뒤따르는 설명 글자는 버린다(다음 차시의 제목은 앱이 모른다).
 *  4. **글자가 섞였는데 숫자가 둘 이상**(`'1단원 3차시'`·`'Unit 2 Lesson 5'`) → `null`.
 *     어느 숫자가 차시인지 앱이 판별할 근거가 없다. 앞 숫자를 집으면 단원 번호를 차시로
 *     올리고, 뒤 숫자를 집으면 반대로 틀린다. 그래서 고르지 않는다.
 *  5. **그 밖**(숫자 없음·음수·소수·빈 값) → `null`.
 *
 * @returns 숫자 또는 숫자-구분자 문자열. 단위 글자는 절대 포함하지 않는다. 판단 불가면 `null`.
 */
export function suggestNextLessonValue(input: LessonNumberSuggestionInput): string | null {
  // 1) 단원 변경이 최우선 — 직전 표기를 못 읽어도 새 단원의 첫 차시는 1이다.
  //    단, 다음 단원이 아직 비어 있으면 "바뀌었다"고 보지 않는다. 날짜를 옮기는 순간처럼
  //    사용자가 단원을 아직 입력하지 않은 상태를 단원 변경으로 오인하면 매번 1이 박힌다.
  const previousUnit = (input.previousUnit ?? '').trim();
  const nextUnit = (input.nextUnit ?? '').trim();
  if (nextUnit !== '' && nextUnit !== previousUnit) return '1';

  const raw = (input.previousLesson ?? '').trim();
  if (raw === '') return null;

  // 2) 글자가 섞이지 않은 숫자 표현. 공백은 무시하고 본다.
  const compact = raw.replace(/\s+/g, '');
  if (STRUCTURED_NUMBER_RE.test(compact)) {
    return incrementLastNumber(compact);
  }

  // 3~5) 글자가 섞인 경우
  const numbers = raw.match(/\d+/g);
  if (numbers === null || numbers.length !== 1) return null; // 0개 또는 2개 이상 → 판단 보류
  if (NEGATIVE_RE.test(raw)) return null; // 음수는 차시가 아니다
  if (DECIMAL_RE.test(raw)) return null; // 소수는 판단 보류
  return bump(numbers[0]!);
}

/** 숫자와 구분자(`-`, `~`)로만 이뤄졌는가. 앞뒤가 구분자면 매칭되지 않는다(음수 차단 포함). */
const STRUCTURED_NUMBER_RE = /^\d+(?:[-~]\d+)*$/;

/** 숫자 앞에 붙은 빼기 기호 — '3차시 - 소설'처럼 뒤에 숫자가 없는 경우는 걸리지 않는다. */
const NEGATIVE_RE = /(?:^|[^\d])-\d/;

/** 소수점 표기. */
const DECIMAL_RE = /\d\.\d/;

/** 문자열 끝의 숫자에 1을 더하고 앞부분은 그대로 둔다. `'2-3'` → `'2-4'`. */
function incrementLastNumber(expr: string): string | null {
  const m = /^(.*?)(\d+)$/.exec(expr);
  if (m === null) return null;
  const next = bump(m[2]!);
  return next === null ? null : `${m[1]!}${next}`;
}

/**
 * 자릿수 채움은 되살리지 않는다 — `'07'` → `'8'`.
 * 앱이 표기 형식을 정의하지 않는다는 원칙상, 가장 단순한 형태로 돌려주고 사용자가 고치게 한다.
 */
function bump(digits: string): string | null {
  const n = Number(digits);
  if (!Number.isSafeInteger(n) || n < 0) return null;
  return String(n + 1);
}
