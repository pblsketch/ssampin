/**
 * NEIS 학교 ↔ 학교알리미(schoolinfo) 학교 매칭 (순수, school-enrich ②-B).
 *
 * NEIS 검색 결과(이름+도로명주소)를 학교알리미 검색 결과(SchoolinfoSchoolHit)에
 * 대응시켜 학교 고유식별코드(shlIdfCd)를 찾는다.
 *
 * 제약(§8-C): ①이 이식한 SchoolinfoSchoolHit 에는 지역코드(sido/sgg)가 없다.
 * 따라서 1차로 학교명(공백 무시)으로 거르고, 동명이교는 주소의 앞 토큰
 * (시/도·시/군/구) 일치 개수로 가른다. 모호하면 best=null + 후보 목록을 돌려준다
 * (자동 보강을 강요하지 않음, §12).
 *
 * 도메인 레이어이므로 외부 의존성을 import 하지 않는다.
 */

export interface SchoolMatchInput {
  /** NEIS 학교명 (예: '한울중학교') */
  readonly neisName: string;
  /** NEIS 도로명주소 (ORG_RDNMA) */
  readonly neisAddress: string;
}

/** 매칭 후보(= 학교알리미 검색 결과의 부분집합) */
export interface SchoolMatchCandidate {
  readonly shlIdfCd: string;
  readonly name: string;
  readonly address: string;
}

export interface SchoolMatchResult {
  /** 확정 매칭(유일하게 결정됐을 때만). 모호/없음 → null */
  readonly best: SchoolMatchCandidate | null;
  /** 동명이교를 주소로도 못 가른 경우의 후보들(선택 UI용). 확정 시 빈 배열 */
  readonly ambiguous: readonly SchoolMatchCandidate[];
}

/** 공백 제거 정규화 (NEIS '한울 중학교' vs schoolinfo '한울중학교' 흡수) */
function norm(s: string): string {
  return (s ?? '').replace(/\s+/g, '');
}

/** 주소 앞 토큰(시/도·시/군/구)이 몇 개나 연속 일치하는지 — 동명이교 구분 점수 */
function addressScore(a: string, b: string): number {
  const ta = norm(a);
  const tb = norm(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const tokensA = (a ?? '').trim().split(/\s+/).map(norm);
  const tokensB = (b ?? '').trim().split(/\s+/).map(norm);
  let score = 0;
  const len = Math.min(tokensA.length, tokensB.length);
  for (let i = 0; i < len; i++) {
    if (tokensA[i] && tokensA[i] === tokensB[i]) score++;
    else break; // 앞 토큰부터 연속 일치만 인정(시/도 다르면 0)
  }
  return score;
}

/**
 * NEIS 학교를 학교알리미 검색 결과(hits)에 매칭한다.
 *
 * 1) 학교명 정확 일치(공백 무시) → 유일하면 확정.
 * 2) 정확 일치 0건이면 포함 관계(접미사 차이)로 후보 재선정.
 * 3) 후보가 여럿(동명이교)이면 주소 앞 토큰 일치 점수로 가른다.
 *    - 최고점이 유일 → 확정, 동점/0점 → 모호(ambiguous 반환).
 */
export function matchSchool(
  input: SchoolMatchInput,
  hits: readonly SchoolMatchCandidate[],
): SchoolMatchResult {
  const target = norm(input.neisName);
  if (target.length === 0 || hits.length === 0) {
    return { best: null, ambiguous: [] };
  }

  // 1) 학교명 정확 일치
  let named = hits.filter((h) => norm(h.name) === target);

  // 2) 폴백: 한쪽이 다른쪽을 포함(예: '한울중' vs '한울중학교')
  if (named.length === 0) {
    named = hits.filter((h) => {
      const n = norm(h.name);
      return n.length > 0 && (n.includes(target) || target.includes(n));
    });
  }

  if (named.length === 0) return { best: null, ambiguous: [] };
  if (named.length === 1) return { best: named[0]!, ambiguous: [] };

  // 3) 동명이교 → 주소로 구분
  const scored = named.map((h) => ({ h, score: addressScore(input.neisAddress, h.address) }));
  const maxScore = Math.max(...scored.map((s) => s.score));
  const top = scored.filter((s) => s.score === maxScore);

  if (maxScore > 0 && top.length === 1) {
    return { best: top[0]!.h, ambiguous: [] };
  }
  return { best: null, ambiguous: named };
}
