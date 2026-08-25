/**
 * 조사 고르기 — "평가 요소을(를)" 을 없앤다 (순수 함수)
 *
 * ★안내 문구는 **선생님이 보는 유일한 설명**이다. 쌤핀 AI 가 무언가를 못 했을 때 화면에
 * 남는 것이 이 한 줄뿐이라(제안이 안 만들어지면 카드도 없다), "평가 요소을(를) 알 수
 * 없어서" 처럼 깨진 조사가 그대로 뜨면 선생님은 안내를 읽기 전에 앱을 먼저 의심한다.
 *
 * 규칙은 하나다 — 앞말의 **마지막 글자에 받침이 있으면** 을·은·이·과, 없으면 를·는·가·와.
 * 한글 음절이 아닌 글자(숫자·영문·기호·빈 문자열)로 끝나면 **받침 없음**으로 본다.
 * 숫자는 읽는 말에 따라 갈리지만("3" 은 삼, "7" 은 칠) 여기서 추측하지 않는다 —
 * 이 함수를 쓰는 자리의 앞말은 '할 일'·'수준'·'평가 요소' 같은 **낱말**이라 걸리지 않는다.
 */

const HANGUL_FIRST = 0xac00;
const HANGUL_LAST = 0xd7a3;
/** 한글 음절 한 글자는 종성 28가지(받침 없음 포함)를 돈다 */
const JONGSUNG_COUNT = 28;

/** 앞말이 받침으로 끝나는가. 한글 음절이 아니면 false. */
export function endsWithJongsung(word: string): boolean {
  const last = word.trim().at(-1);
  if (last === undefined) return false;
  const code = last.charCodeAt(0);
  if (code < HANGUL_FIRST || code > HANGUL_LAST) return false;
  return (code - HANGUL_FIRST) % JONGSUNG_COUNT !== 0;
}

/**
 * 앞말에 맞는 조사를 고른다.
 *
 * @param word     조사가 붙을 앞말. **따옴표는 빼고** 넘긴다 —
 *                 `"장보기"은(는)` 처럼 감싼 경우 마지막 글자는 따옴표라 판단이 어긋난다.
 * @param withBatchim    받침이 있을 때의 조사 (을·은·이·과)
 * @param withoutBatchim 받침이 없을 때의 조사 (를·는·가·와)
 */
export function particle(word: string, withBatchim: string, withoutBatchim: string): string {
  return endsWithJongsung(word) ? withBatchim : withoutBatchim;
}
