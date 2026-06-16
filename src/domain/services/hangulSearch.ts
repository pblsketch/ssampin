/**
 * 한글 초성 검색 유틸 — 명령 팔레트 등 검색 매칭 공용. 프레임워크 의존 없음(순수 함수).
 *
 * 예) "시간표" → "ㅅㄱㅍ", "안녕하세요" → "ㅇㄴㅎㅅㅇ"
 *
 * NOTE: 동일한 초성 변환 로직이 src/domain/rules/multiSurveyRules.ts(normalizeHangulInitial)와
 * src/student/signatureNameSearch.ts(toChosung)에도 존재한다. 학생 정적 페이지 빌드 경계와
 * 회귀 범위 때문에 이번에는 통합하지 않고 검색 공용 유틸만 신설한다. 향후 통합 후보.
 */

/** 19자 초성 목록 (ㄱ~ㅎ) */
const CHOSUNG_LIST = [
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

const CHOSUNG_SET = new Set<string>(CHOSUNG_LIST);

const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;
/** 한 초성당 음절 개수 (중성 21 × 종성 28) */
const SYLLABLES_PER_CHOSUNG = 588;

/**
 * 완성형 한글 음절을 초성 시퀀스로 변환한다.
 * 비한글 문자(영문·숫자·기호)와 이미 초성인 문자(ㄱ~ㅎ)는 그대로 통과한다.
 */
export function toChosungString(s: string): string {
  return [...s]
    .map((char) => {
      const code = char.charCodeAt(0);
      if (code < HANGUL_BASE || code > HANGUL_LAST) return char;
      return CHOSUNG_LIST[Math.floor((code - HANGUL_BASE) / SYLLABLES_PER_CHOSUNG)] ?? char;
    })
    .join('');
}

/** 문자열이 전부 초성 문자(ㄱ~ㅎ)로만 이루어졌는지. 빈 문자열은 false. */
export function isChosungQuery(q: string): boolean {
  if (q.length === 0) return false;
  return [...q].every((c) => CHOSUNG_SET.has(c));
}
