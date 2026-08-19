/**
 * 사진 명렬표 짝짓기 검산 — 계획서 §4의 반례를 전부 시험한다.
 *
 * 특히 중요한 건 "개수는 맞는데 자리가 어긋난" 경우다.
 * 한글 파일의 그림 번호는 학교 로고·직인과 공유되기 때문에
 * 로고 1장 + 사진 1장 누락이면 개수 검산을 통과하면서 전원이 한 칸씩 밀린다.
 */
import { describe, it, expect } from 'vitest';
import { pairRosterPhotos, toGridIndex, gridPairKey } from '@domain/rules/photoRosterPairing';
import type { RosterNameCandidate, RosterPhotoCandidate } from '@domain/valueObjects/PhotoRoster';

const NAMES_22 = [
  '강나영',
  '김가영',
  '김나연',
  '김드보라',
  '김민성',
  '김세은',
  '김수현',
  '민지혜',
  '박소영',
  '송연수',
  '신윤서',
  '오채령',
  '원서현',
  '윤지영',
  '이윤지',
  '이자현',
  '이효린',
  '임가람',
  '장아영',
  '정지윤',
  '조재원',
  '한지우',
];

/** 실물과 같은 8·8·6 격자를 만든다 */
function gridKeys(count: number): string[] {
  const keys: string[] = [];
  for (let i = 0; i < count; i++) {
    keys.push(gridPairKey(Math.floor(i / 8), i % 8));
  }
  return keys;
}

function makeNames(count = 22, keys: string[] = gridKeys(count)): RosterNameCandidate[] {
  return Array.from({ length: count }, (_, i) => ({
    pairKey: keys[i]!,
    studentNumber: i + 1,
    name: NAMES_22[i] ?? `학생${i + 1}`,
  }));
}

function makePhotos(count = 22, keys: string[] = gridKeys(count)): RosterPhotoCandidate[] {
  return Array.from({ length: count }, (_, i) => ({
    pairKey: keys[i]!,
    bytes: new Uint8Array([0xff, 0xd8, i]),
    mimeType: 'image/jpeg',
  }));
}

describe('pairRosterPhotos — 정상', () => {
  it('22쌍이 자리대로 정확히 맞물린다', () => {
    const result = pairRosterPhotos(makeNames(), makePhotos());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pairs).toHaveLength(22);
    expect(result.pairs[0]).toMatchObject({ studentNumber: 1, name: '강나영' });
    expect(result.pairs[21]).toMatchObject({ studentNumber: 22, name: '한지우' });
    // 사진이 제 주인에게 갔는지 — 바이트의 마지막 값이 원래 인덱스다
    expect(result.pairs[4]!.photo.bytes[2]).toBe(4);
  });

  it('파일 안 순서가 뒤죽박죽이어도 학번 순으로 정렬해 돌려준다', () => {
    const names = makeNames();
    const photos = [...makePhotos()].reverse();
    const result = pairRosterPhotos(names, photos);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pairs.map((p) => p.studentNumber)).toEqual(
      Array.from({ length: 22 }, (_, i) => i + 1),
    );
    expect(result.pairs[0]!.photo.bytes[2]).toBe(0);
  });
});

describe('pairRosterPhotos — 실패를 반드시 잡아야 하는 경우', () => {
  it('사진이 한 장도 없으면 NO_PHOTOS (사진 없는 명렬표)', () => {
    const result = pairRosterPhotos(makeNames(), []);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('NO_PHOTOS');
  });

  it('사진 1장이 빠지면 PHOTO_COUNT_MISMATCH', () => {
    const result = pairRosterPhotos(makeNames(22), makePhotos(21));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('PHOTO_COUNT_MISMATCH');
    expect(result.detail).toContain('22');
    expect(result.detail).toContain('21');
  });

  it('★로고 혼입 + 사진 누락: 개수는 22로 맞지만 자리가 어긋나므로 잡아야 한다', () => {
    // 로고가 그림 목록에 섞여 격자 밖(r9:c9)에 앉고, 학생 사진 1장(r2:c5)이 비었다.
    // 개수만 세면 22 === 22 로 통과해 버리는, 이 기능에서 가장 위험한 경우다.
    const names = makeNames(22);
    const photoKeys = gridKeys(22).filter((k) => k !== gridPairKey(2, 5));
    photoKeys.push(gridPairKey(9, 9)); // 로고
    const photos = makePhotos(22, photoKeys);

    expect(photos).toHaveLength(names.length); // 개수 검산은 통과하는 상황임을 명시

    const result = pairRosterPhotos(names, photos);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('PHOTO_ANCHOR_MISMATCH');
    expect(result.detail).toContain('r9:c9');
    expect(result.detail).toContain('r2:c5');
  });

  it('같은 자리에 사진이 2장이면 PHOTO_DUPLICATE_ANCHOR', () => {
    const keys = gridKeys(22);
    keys[7] = keys[6]!; // 7번째 사진이 6번째와 같은 자리에
    const result = pairRosterPhotos(makeNames(22), makePhotos(22, keys));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('PHOTO_DUPLICATE_ANCHOR');
  });

  it('같은 자리에 이름이 2명이면 PHOTO_GRID_MISMATCH', () => {
    const keys = gridKeys(22);
    keys[3] = keys[2]!;
    const result = pairRosterPhotos(makeNames(22, keys), makePhotos(22));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('PHOTO_GRID_MISMATCH');
  });

  it('이름이 0명이면(사진만 있음) 자리가 맞을 수 없다', () => {
    const result = pairRosterPhotos([], makePhotos(22));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('PHOTO_COUNT_MISMATCH');
  });

  it('사진이 이름보다 많으면 PHOTO_COUNT_MISMATCH', () => {
    const result = pairRosterPhotos(makeNames(20), makePhotos(22));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('PHOTO_COUNT_MISMATCH');
  });

  it('28명 반(4번째 줄이 생기는 경우)도 자리만 맞으면 통과한다', () => {
    const result = pairRosterPhotos(makeNames(28), makePhotos(28));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pairs).toHaveLength(28);
  });
});

describe('toGridIndex — 좌표를 논리 격자로 압축', () => {
  it('실물 한글 파일의 세로 좌표 3줄을 0·1·2로 환산한다', () => {
    const index = toGridIndex([13680, 27352, 41025, 13680, 27352]);
    expect(index.get(13680)).toBe(0);
    expect(index.get(27352)).toBe(1);
    expect(index.get(41025)).toBe(2);
  });

  it('오차 범위 안의 값은 같은 줄로 묶는다', () => {
    const index = toGridIndex([1000, 1005, 2000], 10);
    expect(index.get(1000)).toBe(0);
    expect(index.get(1005)).toBe(0);
    expect(index.get(2000)).toBe(1);
  });

  it('오차를 주지 않으면 1이라도 다르면 다른 줄이다', () => {
    const index = toGridIndex([1000, 1001]);
    expect(index.get(1000)).toBe(0);
    expect(index.get(1001)).toBe(1);
  });

  it('빈 목록도 안전하다', () => {
    expect(toGridIndex([]).size).toBe(0);
  });
});
