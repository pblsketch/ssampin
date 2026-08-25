/**
 * 반 이름을 견주기 좋은 꼴로 (순수 함수)
 *
 * ★선생님은 말로 "3학년 1반"이라 하고, 앱에는 "3-1"로 저장돼 있다. 글자만 견주면
 * 이 둘이 서로 다른 반이 된다 — 실제로 "1학년 7반 구예찬 결석"이 수업반 "1-7"을
 * 못 찾고 되물었다(2026-08-25 오너 신고). 반대로 앱에 "3학년 1반"으로 저장해 둔
 * 선생님이 "3-1"이라고 말하는 경우도 같은 문제다.
 *
 * 그래서 **양쪽을 같은 꼴로 바꿔** 놓고 견준다. 뜻이 같은 표기를 하나로 모으는 것일 뿐,
 * 다른 반을 같은 반으로 만들지는 않는다("1-7"과 "1-8"은 여전히 다르다).
 *
 * ★반 이름은 선생님이 자유롭게 붙인다("공국2", "3반 심국"). 학년-반 꼴이 아니면
 * **손대지 않고 그대로** 둔다 — 못 알아본 이름을 억지로 바꾸면 엉뚱한 반에 붙는다.
 */

/** 공백을 지운다. "3학년 1반" 과 "3학년1반" 을 같게 본다. */
function squash(value: string): string {
  return value.replace(/\s+/g, '');
}

/**
 * "N학년M반" → "N-M". 그 밖의 이름은 공백만 지워 그대로 돌려준다.
 *
 * ★`\d{1,2}` 로 묶은 이유: 학년·반은 두 자리를 넘지 않는다. 자릿수를 열어 두면
 * "2026학년도1반" 같은 말까지 반 이름으로 접혀 버린다.
 */
export function classAlias(name: string): string {
  const squashed = squash(name);
  const matched = /^(\d{1,2})학년(\d{1,2})반$/.exec(squashed);
  if (matched) return `${matched[1]!}-${matched[2]!}`;
  return squashed;
}

/**
 * 이 이름의 **여러 말투**. 질문 속에서 반 이름을 찾을 때 쓴다.
 *
 * 앱에 "1-7"로 저장돼 있어도 선생님은 "1학년 7반"이라고 말한다. 반대로 "1학년 7반"으로
 * 저장해 두고 "1-7"이라고 말하기도 한다. 그래서 두 꼴을 모두 만들어 둔다.
 */
export function classSpokenForms(name: string): readonly string[] {
  const alias = classAlias(name);
  const matched = /^(\d{1,2})-(\d{1,2})$/.exec(alias);
  if (!matched) return [alias];
  return [alias, `${matched[1]!}학년${matched[2]!}반`];
}

/**
 * "우리 반"을 가리키는 말인가 — 담임 학급을 뜻한다.
 *
 * ★모델이 **선생님이 말하지도 않은 "우리반"을 반 이름으로 보내는** 일이 있다(옆에 뜬
 * 조회 카드의 "학급: 우리 반"을 베낀다, 2026-08-25 실측). 그때 이 말을 수업반 이름으로
 * 찾으면 "우리반에 맞는 수업반을 찾지 못했어요"가 되어 아무것도 못 한다.
 */
export function isHomeroomWord(name: string): boolean {
  return ['우리반', '우리학급', '담임반', '담임학급', '우리'].includes(squash(name));
}

/**
 * 질문에 **선생님이 직접 말한 반 이름**이 있으면 그것.
 *
 * ★모델이 준 반 이름보다 이쪽을 **먼저** 본다. 모델은 옆 카드의 학급을 베끼거나 아예
 * 빠뜨리지만, 선생님의 말은 선생님의 뜻 그대로다.
 *
 * ★앞뒤가 **숫자나 하이픈**이면 반 이름으로 보지 않는다 — "2026-1-7"의 "1-7"이 반으로
 * 잡히면 엉뚱한 반에 적힌다(하이픈까지 봐야 한다: 앞 글자가 숫자가 아니라 "-"였다).
 */
export function findClassNameInQuestion<T>(
  classes: readonly T[],
  question: string,
  nameOf: (item: T) => string,
): T | undefined {
  const haystack = squash(question);
  for (const item of classes) {
    for (const form of classSpokenForms(nameOf(item))) {
      if (form.length === 0) continue;
      let from = 0;
      for (;;) {
        const at = haystack.indexOf(form, from);
        if (at < 0) break;
        const before = haystack[at - 1];
        const after = haystack[at + form.length];
        const glued = (ch: string | undefined): boolean => ch !== undefined && /[\d-]/.test(ch);
        if (!glued(before) && !glued(after)) return item;
        from = at + 1;
      }
    }
  }
  return undefined;
}
