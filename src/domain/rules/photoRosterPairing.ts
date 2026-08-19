/**
 * 사진 명렬표 — 사진과 이름을 짝짓고 검산하는 순수 규칙.
 *
 * ## 왜 이 규칙이 중요한가
 *
 * 이 기능의 유일한 치명적 실패는 **얼굴과 이름이 어긋난 채 조용히 넘어가는 것**이다.
 * 교사는 앱을 믿고 외우기 때문에 스스로 오류를 알아챌 방법이 없고
 * (애초에 얼굴을 모르니까 이 기능을 쓴다), 몇 주 뒤 학생이 "저 걔 아닌데요"라고
 * 말할 때까지 드러나지 않는다.
 *
 * ## 왜 "개수가 같은지"만 보면 안 되는가
 *
 * 한글 파일의 그림 번호는 문서 전체가 공유하는 번호다 — **학교 로고·직인도 같은 번호를 쓴다.**
 * 로고가 1장 섞여 있고 전학생 사진이 1장 비어 있으면 `23 - 1 = 22`가 되어
 * 개수 검산을 **통과하면서 학생 전원이 한 칸씩 밀린다.**
 * 그래서 개수가 아니라 **자리(pairKey)가 정확히 일대일로 맞물리는지**를 본다.
 *
 * ## 실패하면 어떻게 되나
 *
 * 사진만 포기하고 **이름은 그대로 살린다.** 사용자는 "사진을 못 가져왔습니다"가 아니라
 * "직접 맞춰 주세요"(보정 화면)를 받는다. 안전을 지키면서 기능이 죽지 않게 하는 선택이다.
 */

import type {
  RosterNameCandidate,
  RosterPairedStudent,
  RosterPairingResult,
  RosterPhotoCandidate,
} from '@domain/valueObjects/PhotoRoster';

/** pairKey 별 개수 (중복 탐지용) */
function countByKey(items: readonly { readonly pairKey: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.pairKey, (counts.get(item.pairKey) ?? 0) + 1);
  }
  return counts;
}

function duplicatedKeys(counts: Map<string, number>): string[] {
  return [...counts.entries()].filter(([, n]) => n > 1).map(([key]) => key);
}

/**
 * 사진과 이름을 짝짓는다.
 *
 * 통과 조건은 하나뿐이다 — **사진 자리 집합과 이름 자리 집합이 완전히 같을 것(전단사).**
 * 자리가 하나라도 어긋나거나, 한 자리에 사진이 둘이거나, 개수가 다르면 전부 실패다.
 * 느슨하게 봐줘서 얻는 편의보다 어긋난 짝 하나가 훨씬 비싸다.
 */
export function pairRosterPhotos(
  names: readonly RosterNameCandidate[],
  photos: readonly RosterPhotoCandidate[],
): RosterPairingResult {
  if (photos.length === 0) {
    return {
      ok: false,
      reason: 'NO_PHOTOS',
      detail: `이름 ${names.length}명, 사진 0장`,
    };
  }

  const photoCounts = countByKey(photos);
  const nameCounts = countByKey(names);

  const dupPhotos = duplicatedKeys(photoCounts);
  if (dupPhotos.length > 0) {
    return {
      ok: false,
      reason: 'PHOTO_DUPLICATE_ANCHOR',
      detail: `같은 자리에 사진이 겹칩니다: ${dupPhotos.join(', ')}`,
    };
  }

  const dupNames = duplicatedKeys(nameCounts);
  if (dupNames.length > 0) {
    return {
      ok: false,
      reason: 'PHOTO_GRID_MISMATCH',
      detail: `같은 자리에 이름이 겹칩니다: ${dupNames.join(', ')}`,
    };
  }

  if (photos.length !== names.length) {
    return {
      ok: false,
      reason: 'PHOTO_COUNT_MISMATCH',
      detail: `이름 ${names.length}명, 사진 ${photos.length}장`,
    };
  }

  // 전단사 검사 — 개수가 같아도 자리가 어긋날 수 있다(로고 혼입 + 사진 누락이 대표 사례)
  const nameByKey = new Map(names.map((n) => [n.pairKey, n]));
  const orphanPhotos = photos.filter((p) => !nameByKey.has(p.pairKey)).map((p) => p.pairKey);
  if (orphanPhotos.length > 0) {
    const photoKeys = new Set(photos.map((p) => p.pairKey));
    const orphanNames = names.filter((n) => !photoKeys.has(n.pairKey)).map((n) => n.pairKey);
    return {
      ok: false,
      reason: 'PHOTO_ANCHOR_MISMATCH',
      detail:
        `이름이 없는 사진 자리: ${orphanPhotos.join(', ')}` +
        (orphanNames.length > 0 ? ` / 사진이 없는 이름 자리: ${orphanNames.join(', ')}` : ''),
    };
  }

  const pairs: RosterPairedStudent[] = photos.map((photo) => {
    // 위에서 고아 사진이 0장임을 확인했으므로 반드시 존재한다
    const matched = nameByKey.get(photo.pairKey)!;
    return { studentNumber: matched.studentNumber, name: matched.name, photo };
  });

  // 학번 순으로 정렬 — 화면·테스트가 파일 내부 순서에 흔들리지 않게 한다
  pairs.sort((a, b) => a.studentNumber - b.studentNumber);

  return { ok: true, pairs };
}

/**
 * 좌표 목록을 논리 격자 인덱스로 압축한다.
 *
 * 최신 한글(HWPML)은 사진이 표 밖에 떠 있어서 이름(표 셀)과 좌표계가 아예 다르다.
 * 그래서 양쪽을 각각 "몇 번째 줄의 몇 번째 칸"으로 환산해야 맞물릴 수 있다.
 *
 * @param values 같은 축의 좌표값들 (예: 사진들의 세로 위치)
 * @param tolerance 같은 줄로 볼 오차 (한글 좌표는 같은 줄이면 값이 똑같지만, 여유를 둔다)
 * @returns 좌표값 → 0부터 시작하는 인덱스
 */
export function toGridIndex(values: readonly number[], tolerance = 0): ReadonlyMap<number, number> {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  const result = new Map<number, number>();
  let index = -1;
  let groupAnchor = Number.NEGATIVE_INFINITY;
  for (const value of sorted) {
    if (index < 0 || value - groupAnchor > tolerance) {
      index += 1;
      groupAnchor = value;
    }
    result.set(value, index);
  }
  return result;
}

/** 격자 좌표를 pairKey 문자열로 만든다 (사진·이름이 같은 규칙을 써야 맞물린다) */
export function gridPairKey(row: number, col: number): string {
  return `r${row}:c${col}`;
}
