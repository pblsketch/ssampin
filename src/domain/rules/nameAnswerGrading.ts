/**
 * "이름 쓰기" 모드의 채점 규칙 (순수 계산).
 *
 * ## 왜 한 글자만 달라도 오답인가
 *
 * 이름은 **한 글자가 곧 다른 사람**이다. `김민수`와 `김민서`가 같은 반에 함께 있을 수 있고,
 * 그 둘을 구분하는 게 정확히 이 기능의 목적이다. 그래서 비슷하면 맞다고 봐주는 규칙은
 * 편의가 아니라 **학습을 망치는 오답**이다.
 *
 * 오너 확정(2026-08-19): **재시도·부분점수 없음.** 틀리면 바로 오답 처리하고 정답을 보여 준다.
 * 규칙이 단순할수록 "내가 진짜 아는가"라는 신호가 정확해진다.
 *
 * ## 띄어쓰기만 무시한다
 *
 * `남궁 민수`와 `남궁민수`는 같은 사람이다. 한국 이름 표기에서 공백은 의미가 없다.
 */

/** 한글 음절의 초성 19개 (유니코드 조합 순서) */
const CHOSUNG = [
  'ㄱ',
  'ㄲ',
  'ㄴ',
  'ㄷ',
  'ㄸ',
  'ㄹ',
  'ㅁ',
  'ㅂ',
  'ㅃ',
  'ㅅ',
  'ㅆ',
  'ㅇ',
  'ㅈ',
  'ㅉ',
  'ㅊ',
  'ㅋ',
  'ㅌ',
  'ㅍ',
  'ㅎ',
] as const;

const HANGUL_START = 0xac00;
const HANGUL_END = 0xd7a3;
/** 초성 하나가 담당하는 음절 수 (중성 21 × 종성 28) */
const SYLLABLES_PER_CHOSUNG = 588;

/** 공백을 모두 없앤다 — 비교에만 쓰고 화면 표시에는 원문을 쓴다 */
export function normalizeNameAnswer(raw: string): string {
  return raw.replace(/\s+/g, '');
}

export type NameAnswerVerdict = 'correct' | 'wrong';

/**
 * 답을 채점한다. **띄어쓰기만 무시하고, 나머지는 완전 일치여야 정답.**
 *
 * @param answer 사용자가 입력한 답
 * @param correctName 정답 이름
 * @param alternativeNames 같은 이름을 가진 다른 학생이 있을 때 함께 넘긴다.
 *   같은 반 동명이인은 어느 쪽을 떠올렸든 구분할 방법이 없으므로 정답으로 인정한다.
 */
export function gradeNameAnswer(
  answer: string,
  correctName: string,
  alternativeNames: readonly string[] = [],
): NameAnswerVerdict {
  const normalized = normalizeNameAnswer(answer);
  if (normalized.length === 0) return 'wrong';
  const accepted = [correctName, ...alternativeNames].map(normalizeNameAnswer);
  return accepted.includes(normalized) ? 'correct' : 'wrong';
}

/**
 * 초성 힌트. `강나영` → `ㄱㄴㅇ`
 *
 * 아예 못 맞히면 학습이 안 되고 좌절만 남는다. 초성은 답을 알려 주지 않으면서
 * 기억을 끌어내는 정도의 단서다. 한글이 아닌 글자는 그대로 둔다.
 */
export function toChosungHint(name: string): string {
  return [...normalizeNameAnswer(name)]
    .map((char) => {
      const code = char.charCodeAt(0);
      if (code < HANGUL_START || code > HANGUL_END) return char;
      return CHOSUNG[Math.floor((code - HANGUL_START) / SYLLABLES_PER_CHOSUNG)] ?? char;
    })
    .join('');
}

/**
 * 같은 이름을 가진 학생이 있는지 찾아 "정답으로 인정할 이름들"을 만든다.
 *
 * 실제로는 정답 이름 하나뿐이지만, 동명이인 처리를 호출부마다 다시 짜지 않도록 여기 둔다.
 */
export function acceptedNamesFor(targetName: string, allNames: readonly string[]): string[] {
  const normalizedTarget = normalizeNameAnswer(targetName);
  const duplicates = allNames.filter(
    (name) => normalizeNameAnswer(name) === normalizedTarget && name !== targetName,
  );
  return [targetName, ...duplicates];
}
