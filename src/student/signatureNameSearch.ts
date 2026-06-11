/**
 * 서명받기 공개 페이지 — 이름 검색 매칭 (초성 검색 지원).
 *
 * 100명 규모 명단에서 본인 이름을 빠르게 찾기 위한 유틸.
 * - 부분 일치: "길동" → 홍길동
 * - 초성 일치: "ㅎㄱㄷ" / "ㄱㄷ" → 홍길동 (질의가 전부 초성일 때만)
 * - 대소문자 무시(영문 이름 대응), 공백 무시
 *
 * 프레임워크 의존 없음 — 순수 함수.
 */

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

/** 완성형 한글 음절이면 초성으로, 아니면 원문 그대로 반환. */
function toChosung(char: string): string {
  const code = char.charCodeAt(0);
  if (code < HANGUL_BASE || code > HANGUL_LAST) return char;
  return CHOSUNG_LIST[Math.floor((code - HANGUL_BASE) / SYLLABLES_PER_CHOSUNG)] ?? char;
}

/** 질의가 전부 초성 문자(ㄱ~ㅎ)로만 이루어졌는지. */
function isChosungQuery(query: string): boolean {
  return [...query].every((c) => CHOSUNG_SET.has(c));
}

/**
 * 이름이 검색어와 일치하는가.
 * 빈 검색어는 전체 일치(true). 부분 일치 우선, 전부 초성인 검색어는 초성 시퀀스 부분 일치.
 */
export function matchesSignatureName(name: string, query: string): boolean {
  const q = query.replace(/\s+/g, '').toLowerCase();
  if (q.length === 0) return true;
  const n = name.replace(/\s+/g, '').toLowerCase();
  if (n.includes(q)) return true;
  if (!isChosungQuery(q)) return false;
  const nameChosung = [...n].map(toChosung).join('');
  return nameChosung.includes(q);
}
