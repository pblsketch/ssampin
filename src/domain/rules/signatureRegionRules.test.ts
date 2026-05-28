import { describe, expect, it } from 'vitest';
import type {
  PdfRegionRect,
  SignatureParticipant,
  SignatureRegion,
} from '@domain/entities/SignatureRequest';
import {
  checkParticipantRegionMatch,
  isMixedOrientationWarn,
  isWithinPageBounds,
  meetsMinimumSize,
} from './signatureRegionRules';

function rect(x: number, y: number, w: number, h: number): PdfRegionRect {
  return { x, y, w, h };
}

function participant(id: string): SignatureParticipant {
  return {
    id,
    displayName: id,
    role: 'student',
    requiredSignatureKinds: ['recipient'],
  };
}

function region(id: string, participantId: string): SignatureRegion {
  return {
    id,
    pageIndex: 0,
    rect: rect(0.1, 0.1, 0.2, 0.05),
    participantId,
    signatureKind: 'recipient',
  };
}

describe('isWithinPageBounds', () => {
  it('수용: 단위 정사각형 안에 완전히 들어 있는 사각형', () => {
    expect(isWithinPageBounds(rect(0.1, 0.2, 0.3, 0.4))).toBe(true);
  });

  it('경계 ε 안: 정확히 x+w === 1 또는 y+h === 1 도 허용', () => {
    expect(isWithinPageBounds(rect(0, 0, 1, 1))).toBe(true);
  });

  it('거절: x+w > 1 으로 페이지 우측을 넘어감', () => {
    expect(isWithinPageBounds(rect(0.7, 0.1, 0.5, 0.1))).toBe(false);
  });

  it('거절: 음수 좌표', () => {
    expect(isWithinPageBounds(rect(-0.1, 0.1, 0.2, 0.2))).toBe(false);
  });

  it('거절: 폭/높이 0 이하', () => {
    expect(isWithinPageBounds(rect(0.1, 0.1, 0, 0.1))).toBe(false);
    expect(isWithinPageBounds(rect(0.1, 0.1, 0.1, 0))).toBe(false);
  });

  it('거절: NaN/Infinity', () => {
    expect(isWithinPageBounds(rect(Number.NaN, 0.1, 0.1, 0.1))).toBe(false);
    expect(isWithinPageBounds(rect(0.1, 0.1, Number.POSITIVE_INFINITY, 0.1))).toBe(false);
  });
});

describe('meetsMinimumSize', () => {
  const viewport = { widthPx: 1000, heightPx: 1414 };

  it('수용: 50×20 px 초과', () => {
    expect(meetsMinimumSize(rect(0.1, 0.1, 0.1, 0.05), viewport)).toBe(true);
  });

  it('수용: 정확히 50×20 px (경계 등호)', () => {
    expect(meetsMinimumSize(rect(0, 0, 50 / 1000, 20 / 1414), viewport)).toBe(true);
  });

  it('거절: 가로 49px (최소 50px 미만)', () => {
    expect(meetsMinimumSize(rect(0, 0, 49 / 1000, 0.5), viewport)).toBe(false);
  });

  it('거절: 세로 19px (최소 20px 미만)', () => {
    expect(meetsMinimumSize(rect(0, 0, 0.5, 19 / 1414), viewport)).toBe(false);
  });

  it('거절: 0 폭 viewport', () => {
    expect(meetsMinimumSize(rect(0.1, 0.1, 0.1, 0.1), { widthPx: 0, heightPx: 1414 })).toBe(false);
  });
});

describe('checkParticipantRegionMatch', () => {
  it('ok: 명단 N명 = 영역으로 바인딩된 명단 N명', () => {
    const participants = [participant('p1'), participant('p2')];
    const regions = [region('r1', 'p1'), region('r2', 'p2')];
    expect(checkParticipantRegionMatch(participants, regions)).toEqual({ status: 'ok' });
  });

  it('too-few-regions: 명단 3, 영역 바인딩 2 → shortfall=1', () => {
    const participants = [participant('p1'), participant('p2'), participant('p3')];
    const regions = [region('r1', 'p1'), region('r2', 'p2')];
    expect(checkParticipantRegionMatch(participants, regions)).toEqual({
      status: 'too-few-regions',
      shortfall: 1,
    });
  });

  it('too-many-regions: 영역에서 명단에 없는 participantId 발견은 무시, 명단보다 더 많은 명단 바인딩일 때만 too-many', () => {
    const participants = [participant('p1')];
    const regions = [region('r1', 'p1'), region('r2', 'ghost')];
    // ghost 는 명단에 없어서 boundParticipantIds 에 들어가지 않음 → ok
    expect(checkParticipantRegionMatch(participants, regions)).toEqual({ status: 'ok' });
  });

  it('한 명에게 여러 영역 (학생+학부모 서명 자리 2개) 은 1회 count', () => {
    const participants = [participant('p1')];
    const r1: SignatureRegion = { ...region('r1', 'p1'), signatureKind: 'student' };
    const r2: SignatureRegion = { ...region('r2', 'p1'), signatureKind: 'parent' };
    expect(checkParticipantRegionMatch(participants, [r1, r2])).toEqual({ status: 'ok' });
  });
});

describe('isMixedOrientationWarn', () => {
  it('false: 모두 세로 (portrait)', () => {
    expect(
      isMixedOrientationWarn([
        { widthPx: 800, heightPx: 1100 },
        { widthPx: 800, heightPx: 1100 },
      ]),
    ).toBe(false);
  });

  it('false: 모두 가로 (landscape)', () => {
    expect(
      isMixedOrientationWarn([
        { widthPx: 1100, heightPx: 800 },
        { widthPx: 1100, heightPx: 800 },
      ]),
    ).toBe(false);
  });

  it('true: 세로 + 가로 혼합', () => {
    expect(
      isMixedOrientationWarn([
        { widthPx: 800, heightPx: 1100 },
        { widthPx: 1100, heightPx: 800 },
      ]),
    ).toBe(true);
  });

  it('false: 페이지 1장 (혼합 불가능)', () => {
    expect(isMixedOrientationWarn([{ widthPx: 800, heightPx: 1100 }])).toBe(false);
  });

  it('false: 정사각형은 portrait/landscape 어느 쪽도 아니라 무시', () => {
    expect(
      isMixedOrientationWarn([
        { widthPx: 800, heightPx: 800 },
        { widthPx: 800, heightPx: 800 },
      ]),
    ).toBe(false);
  });
});
