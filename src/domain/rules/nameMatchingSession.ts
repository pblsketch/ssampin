/**
 * "매칭하기" 모드의 순수 규칙.
 *
 * 왼쪽에 학생 얼굴 한 장이 뜨고, 오른쪽 명단에서 그 얼굴의 이름을 골라 짝을 짓는다.
 *
 * ## "이름 쓰기"와 무엇이 다른가
 *
 * 이름 쓰기는 **떠올려서 쓰는 것**(회상)이고, 매칭하기는 **보기에서 고르는 것**(재인)이다.
 * 재인이 훨씬 쉬우므로, 아직 얼굴이 눈에 안 익은 학기 초에 먼저 쓰는 단계다.
 * 그래서 채점 규칙은 같게 두되(재시도 없음), 고른 이름은 명단에서 빠져 남은 후보가 줄어든다.
 *
 * ## 왜 고른 이름이 명단에서 빠지는가
 *
 * "짝 맞추기"는 이미 쓴 짝이 사라져야 성립한다. 남겨 두면 같은 이름을 여러 얼굴에 붙일 수
 * 있어 무엇을 맞혔는지가 흐려지고, 뒤로 갈수록 좁혀지는 재미도 없어진다.
 *
 * ## 동명이인
 *
 * 같은 반에 `김민수`가 둘이면 어느 쪽을 떠올렸든 구분할 방법이 없다. 그래서 **이름이 같으면
 * 정답으로 인정한다**(이름 쓰기와 같은 규칙 — `acceptedNamesFor`).
 * 다만 명단에서 빠지는 것은 **문제로 나온 학생의 줄**이다. 고른 줄을 빼면 정작 문제였던
 * 학생이 명단에 남아 다음에 또 나올 수 있다.
 */

/** 오른쪽 명단 한 줄 */
export interface MatchOption {
  readonly studentId: string;
  readonly name: string;
  readonly studentNumber?: number;
  /** 이미 짝이 지어져 고를 수 없는 상태 */
  readonly matched: boolean;
}

export interface MatchCandidate {
  readonly studentId: string;
  readonly name: string;
  readonly studentNumber?: number;
}

/**
 * 오른쪽 명단을 만든다 — 학번 순, 이미 푼 학생은 `matched`.
 *
 * 정답이든 오답이든 **한 번 나온 학생은 다시 나오지 않는다**(재시도 없음, 오너 확정).
 * 그래서 `answered` 하나로 "명단에서 빠짐"을 판단한다.
 */
export function buildMatchOptions(
  candidates: readonly MatchCandidate[],
  answered: ReadonlySet<string>,
): MatchOption[] {
  return [...candidates]
    .sort(
      (a, b) =>
        (a.studentNumber ?? Number.MAX_SAFE_INTEGER) - (b.studentNumber ?? Number.MAX_SAFE_INTEGER),
    )
    .map((c) => ({
      studentId: c.studentId,
      name: c.name,
      ...(c.studentNumber !== undefined ? { studentNumber: c.studentNumber } : {}),
      matched: answered.has(c.studentId),
    }));
}

/**
 * 아직 안 푼 학생 중 다음 문제를 고른다.
 *
 * @param pickRandom 0~1 난수를 주는 함수 (시험에서 고정할 수 있게 주입받는다)
 * @returns 다음 문제의 studentId. 남은 학생이 없으면 `null` (= 한 바퀴 끝)
 */
export function pickNextMatchTarget(
  pool: readonly MatchCandidate[],
  answered: ReadonlySet<string>,
  pickRandom: () => number,
): string | null {
  const remaining = pool.filter((c) => !answered.has(c.studentId));
  if (remaining.length === 0) return null;
  const index = Math.min(remaining.length - 1, Math.floor(pickRandom() * remaining.length));
  return remaining[index]!.studentId;
}
