/**
 * wordCloudTally — 단어 모으기(워드클라우드) 순수 규칙.
 *
 * 기존 `ToolWordCloud` 안에 있던 정규화·글자 크기 계산을 도메인으로 끌어올린 것이다.
 * **동작을 바꾸지 않는 것이 목적**이다. 규칙을 "개선"하면 기존 도구의 결과가 달라져 회귀가 된다.
 *
 * v2 복합 설문 도구의 `wordcloud` 문항과 기존 워드클라우드 도구가 같은 규칙을 쓰게 하려고 공용화했다.
 *
 * 책임:
 *  - 단어 정규화 (같은 단어를 하나로 묶는 기준)
 *  - 학생이 한 줄에 쉼표로 적은 입력을 단어 배열로 분리 (개수·글자 수 상한 적용)
 *  - 응답 묶음을 빈도 순 집계 (교사가 숨긴 단어 제외)
 *  - 빈도 → 글자 크기 환산
 *
 * NOT 책임: 렌더링, 색·회전 같은 표현 결정, 저장.
 */

/** 집계된 단어 하나. `word`는 화면에 보여줄 원래 표기, `normalized`는 묶음 기준 키. */
export interface WordTallyEntry {
  readonly word: string;
  readonly normalized: string;
  readonly count: number;
}

/** 학생 입력 분리 규칙 */
export interface SplitWordInputOptions {
  /** 한 학생이 낼 수 있는 최대 단어 수 */
  readonly maxWords: number;
  /** 단어 하나의 최대 글자 수 */
  readonly maxWordLength: number;
}

/**
 * 단어 정규화 — 앞뒤 공백 제거, 내부 연속 공백을 하나로, 소문자화.
 * (기존 `ToolWordCloud.normalizeWord`와 동일 동작)
 */
export function normalizeWord(word: string): string {
  return word.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * 학생이 한 줄에 쉼표로 적은 입력을 단어 배열로 분리한다.
 *
 * 규칙:
 *  - 쉼표(`,`)와 한글 쉼표(`、`)로 나눈다
 *  - 앞뒤 공백을 없애고 빈 조각은 버린다
 *  - 글자 수 상한을 넘으면 잘라낸다
 *  - 정규화 기준으로 같은 단어는 한 번만 센다 (한 학생이 같은 단어를 반복해도 1개)
 *  - 상한 개수를 넘으면 **앞에서부터** 상한 개수만 받는다
 *
 * 반환값은 원래 표기를 보존한다(정규화된 값이 아니다). 화면에 학생이 쓴 대로 보여주기 위함이다.
 */
export function splitWordInput(
  raw: string,
  { maxWords, maxWordLength }: SplitWordInputOptions,
): readonly string[] {
  if (maxWords <= 0 || maxWordLength <= 0) return [];

  const picked: string[] = [];
  const seen = new Set<string>();

  for (const piece of raw.split(/[,、]/)) {
    const trimmed = piece.trim().replace(/\s+/g, ' ');
    if (trimmed.length === 0) continue;

    const clipped = trimmed.slice(0, maxWordLength);
    const key = normalizeWord(clipped);
    if (key.length === 0 || seen.has(key)) continue;

    seen.add(key);
    picked.push(clipped);
    if (picked.length >= maxWords) break;
  }

  return picked;
}

/**
 * 응답 묶음을 빈도 순으로 집계한다.
 *
 * @param answers 학생별 단어 배열 묶음. 문자열 하나만 온 응답도 받아들인다.
 * @param hiddenWords 교사가 화면에서 숨긴 단어(정규화된 키). 집계에서 완전히 빠진다.
 *
 * 정렬: 빈도 내림차순 → 같은 빈도면 처음 등장한 순서(안정 정렬).
 */
export function tallyWords(
  answers: readonly (readonly string[] | string)[],
  hiddenWords: readonly string[] = [],
): readonly WordTallyEntry[] {
  const hidden = new Set(hiddenWords.map((w) => normalizeWord(w)));
  const order: string[] = [];
  const map = new Map<string, { word: string; count: number }>();

  for (const answer of answers) {
    const words = typeof answer === 'string' ? [answer] : answer;
    for (const rawWord of words) {
      const trimmed = rawWord.trim().replace(/\s+/g, ' ');
      if (trimmed.length === 0) continue;
      const key = normalizeWord(trimmed);
      if (key.length === 0 || hidden.has(key)) continue;

      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(key, { word: trimmed, count: 1 });
        order.push(key);
      }
    }
  }

  return order
    .map((key) => {
      const entry = map.get(key);
      // order와 map은 함께 채워지므로 항상 존재한다. strict 대응용 방어.
      return entry
        ? { word: entry.word, normalized: key, count: entry.count }
        : { word: key, normalized: key, count: 0 };
    })
    .sort((a, b) => b.count - a.count);
}

/** 응답 묶음에서 나온 단어 총 개수 (고유 단어 수가 아니라 제출된 단어 수) */
export function countSubmittedWords(
  answers: readonly (readonly string[] | string)[],
  hiddenWords: readonly string[] = [],
): number {
  return tallyWords(answers, hiddenWords).reduce((sum, e) => sum + e.count, 0);
}

/** 글자 크기 환산 규칙 */
export interface FontScaleRange {
  readonly minCount: number;
  readonly maxCount: number;
  readonly minFont: number;
  readonly maxFont: number;
}

/**
 * 빈도 → 글자 크기(px). 빈도 폭이 0이면 중간 크기로 고정한다.
 * (기존 `ToolWordCloud.WordCloudDisplay.getFontSize`와 동일 공식)
 */
export function scaleFontSize(
  count: number,
  { minCount, maxCount, minFont, maxFont }: FontScaleRange,
): number {
  if (maxCount === minCount) return (minFont + maxFont) / 2;
  return minFont + ((count - minCount) / (maxCount - minCount)) * (maxFont - minFont);
}
