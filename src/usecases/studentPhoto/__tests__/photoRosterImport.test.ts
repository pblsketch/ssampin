/**
 * 사진 명렬표 → 기존 명단 가져오기 파이프라인 입력 변환.
 *
 * 여기서 지키는 것:
 * 1. 명단 병합 규칙을 **다시 구현하지 않는다** — 입력 형태만 맞춰서 기존 기계에 넘긴다
 * 2. 검산에 실패한 사진은 **한 장도 넘기지 않는다** — 어긋난 얼굴보다 사진 없음이 낫다
 */
import { describe, it, expect } from 'vitest';
import type { PhotoRosterParseResult } from '@domain/valueObjects/PhotoRoster';
import {
  collectPhotoCandidates,
  describeParseResult,
  toImportReadyStudents,
} from '../photoRosterImport';

const NAMES = [
  { pairKey: 'r0:c1', studentNumber: 2, name: '김가영' },
  { pairKey: 'r0:c0', studentNumber: 1, name: '강나영' },
];

function makeResult(overrides: Partial<PhotoRosterParseResult> = {}): PhotoRosterParseResult {
  return {
    format: 'xlsx',
    names: NAMES,
    photos: [],
    pairing: { ok: false, reason: 'NO_PHOTOS', detail: '' },
    ...overrides,
  };
}

describe('toImportReadyStudents', () => {
  it('학번 순으로 정렬해 돌려준다', () => {
    expect(toImportReadyStudents(NAMES).map((s) => s.studentNumber)).toEqual([1, 2]);
  });

  it('연락처·생년월일은 빈 값으로 둔다 (기존 값을 지우지 않게)', () => {
    const [first] = toImportReadyStudents(NAMES.slice(0, 1));
    expect(first).toMatchObject({
      name: '김가영',
      studentNumber: 2,
      phone: '',
      parentPhone: '',
      birthDate: '',
      isVacant: false,
    });
  });

  it('이름 앞뒤 공백을 정리한다', () => {
    const result = toImportReadyStudents([
      { pairKey: 'r0:c0', studentNumber: 1, name: '  강나영 ' },
    ]);
    expect(result[0]!.name).toBe('강나영');
  });
});

describe('collectPhotoCandidates', () => {
  it('짝짓기에 성공하면 사진을 넘긴다', () => {
    const result = makeResult({
      pairing: {
        ok: true,
        pairs: [
          {
            studentNumber: 1,
            name: '강나영',
            photo: {
              pairKey: 'r0:c0',
              bytes: new Uint8Array([1]),
              mimeType: 'image/jpeg',
            },
          },
        ],
      },
    });
    expect(collectPhotoCandidates(result)).toEqual([
      { studentNumber: 1, name: '강나영', bytes: new Uint8Array([1]), mimeType: 'image/jpeg' },
    ]);
  });

  it('★검산에 실패하면 사진을 한 장도 넘기지 않는다', () => {
    const result = makeResult({
      photos: [{ pairKey: 'r0:c0', bytes: new Uint8Array([1]), mimeType: 'image/jpeg' }],
      pairing: { ok: false, reason: 'PHOTO_ANCHOR_MISMATCH', detail: '어긋남' },
    });
    // 사진 자체는 읽혔지만 자리를 믿을 수 없으므로 저장 대상이 아니다
    expect(result.photos).toHaveLength(1);
    expect(collectPhotoCandidates(result)).toEqual([]);
  });
});

describe('describeParseResult', () => {
  it('성공하면 개수를 그대로 알려 준다', () => {
    const result = makeResult({
      pairing: {
        ok: true,
        pairs: [
          {
            studentNumber: 1,
            name: '강나영',
            photo: { pairKey: 'r0:c0', bytes: new Uint8Array(), mimeType: 'image/jpeg' },
          },
        ],
      },
    });
    expect(describeParseResult(result)).toBe('이름 2명, 사진 1장을 가져왔어요.');
  });

  it('사진이 없으면 그 사실을 그대로 말한다', () => {
    expect(describeParseResult(makeResult())).toContain('사진이 들어 있지 않아');
  });

  it('짝짓기에 실패하면 이름만 가져왔다고 알리고 다음 할 일을 말해 준다', () => {
    const text = describeParseResult(
      makeResult({ pairing: { ok: false, reason: 'PHOTO_ANCHOR_MISMATCH', detail: '' } }),
    );
    expect(text).toContain('이름 2명만');
    expect(text).toContain('직접');
  });
});
