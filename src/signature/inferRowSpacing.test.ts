import { describe, expect, it } from 'vitest';
import type { PdfRegionRect } from '@domain/entities/SignatureRequest';
import {
  estimatePatternAccuracy,
  inferRowSpacing,
  replicateUniformRows,
  replicateWithAnchors,
} from './inferRowSpacing';

const rect = (x: number, y: number, w = 0.2, h = 0.05): PdfRegionRect => ({ x, y, w, h });

describe('inferRowSpacing — 균일 행 간격', () => {
  it('두 사각형의 y 차이를 반환한다', () => {
    expect(inferRowSpacing({ first: rect(0.1, 0.1), second: rect(0.1, 0.18) })).toBeCloseTo(0.08);
  });

  it('순서가 바뀌어도 절댓값으로 반환한다', () => {
    expect(inferRowSpacing({ first: rect(0.1, 0.5), second: rect(0.1, 0.42) })).toBeCloseTo(0.08);
  });
});

describe('replicateUniformRows — 균일 양식', () => {
  it('80명 명단을 균일 간격으로 복제한다 (페이지 안)', () => {
    const result = replicateUniformRows(rect(0.1, 0.1), 0.01, 80, 1.0);
    expect(result.length).toBe(80);
    expect(result[0]?.y).toBeCloseTo(0.1);
    expect(result[10]?.y).toBeCloseTo(0.2);
    expect(result[79]?.y).toBeCloseTo(0.89);
  });

  it('페이지 경계를 넘는 행은 잘라낸다 — 명단이 더 많아도 페이지 안만 반환', () => {
    const result = replicateUniformRows(rect(0.1, 0.8), 0.05, 10, 1.0);
    // y=0.8 부터 0.05 간격으로 — h=0.05 면 0.8, 0.85, 0.9 만 (0.95 + 0.05 = 1.0 OK)
    expect(result.length).toBeLessThanOrEqual(4);
  });

  it('participantCount 0 은 빈 배열', () => {
    expect(replicateUniformRows(rect(0.1, 0.1), 0.01, 0)).toEqual([]);
  });

  it('rowSpacing 0 은 1행만 반환 (manual fallback 시그널)', () => {
    const result = replicateUniformRows(rect(0.1, 0.1), 0, 10);
    expect(result.length).toBe(1);
  });
});

describe('replicateWithAnchors — 비균일 행 양식', () => {
  it('2개 anchor (0번과 4번) 로부터 1,2,3번 위치를 선형 보간', () => {
    const result = replicateWithAnchors(
      [
        { participantIndex: 0, rect: rect(0.1, 0.1) },
        { participantIndex: 4, rect: rect(0.1, 0.5) },
      ],
      5,
    );
    expect(result).toHaveLength(5);
    expect(result[0]?.y).toBeCloseTo(0.1);
    expect(result[1]?.y).toBeCloseTo(0.2);
    expect(result[2]?.y).toBeCloseTo(0.3);
    expect(result[3]?.y).toBeCloseTo(0.4);
    expect(result[4]?.y).toBeCloseTo(0.5);
  });

  it('anchor 너머는 마지막 구간의 간격으로 외삽', () => {
    const result = replicateWithAnchors(
      [
        { participantIndex: 0, rect: rect(0.1, 0.1) },
        { participantIndex: 1, rect: rect(0.1, 0.15) },
      ],
      5,
    );
    expect(result[2]?.y).toBeCloseTo(0.2);
    expect(result[3]?.y).toBeCloseTo(0.25);
    expect(result[4]?.y).toBeCloseTo(0.3);
  });

  it('비균일 양식: anchor 사이 간격이 다르면 구간별로 다른 보간', () => {
    // 0~3 행은 간격 0.05, 4~7 행은 간격 0.08 (소계 행이 끼어 있음을 가정)
    const result = replicateWithAnchors(
      [
        { participantIndex: 0, rect: rect(0.1, 0.1) },
        { participantIndex: 3, rect: rect(0.1, 0.25) }, // 0.05 간격 × 3
        { participantIndex: 7, rect: rect(0.1, 0.57) }, // 0.08 간격 × 4 (소계 행 끼움 = 실제 0.05 × 4 + 0.12)
      ],
      8,
    );
    expect(result).toHaveLength(8);
    expect(result[1]?.y).toBeCloseTo(0.15);
    expect(result[2]?.y).toBeCloseTo(0.2);
    // 두 번째 구간 — anchor 사이는 0.32 / 4 = 0.08
    expect(result[4]?.y).toBeCloseTo(0.33);
    expect(result[5]?.y).toBeCloseTo(0.41);
  });

  it('anchor 가 0개면 빈 배열', () => {
    expect(replicateWithAnchors([], 10)).toEqual([]);
  });
});

describe('estimatePatternAccuracy — Pattern 2 PoC 정확도 측정', () => {
  it('완벽 매칭은 1.0', () => {
    const positions = replicateUniformRows(rect(0.1, 0.1), 0.05, 10);
    expect(estimatePatternAccuracy(positions, positions)).toBe(1);
  });

  it('절반이 어긋나면 0.5', () => {
    const actual = replicateUniformRows(rect(0.1, 0.1), 0.05, 10);
    const predicted = actual.map((r, i) => (i % 2 === 0 ? r : { ...r, y: r.y + 0.05 }));
    expect(estimatePatternAccuracy(predicted, actual)).toBe(0.5);
  });

  it('PoC AC-0 A0-4 시나리오: 균일 양식은 Pattern 2 자동복제 시 ≥ 80%', () => {
    // 연수등록부 같은 균일 양식: 10명 × 0.05 간격, 단순 표
    const actualPositions = Array.from({ length: 10 }, (_, i) => rect(0.1, 0.1 + i * 0.05));
    const uniformPredicted = replicateUniformRows(rect(0.1, 0.1), 0.05, 10);
    expect(estimatePatternAccuracy(uniformPredicted, actualPositions)).toBeGreaterThanOrEqual(0.8);
  });

  it('PoC AC-0 A0-4 시나리오: 비균일 양식 (소계 행 끼움) 은 균일 가정 시 < 80% → manual fallback 진입 정당화', () => {
    // 실제 양식: 8명 + 4번째 행 뒤에 소계 행 (가상 간격) — anchor 1개 (균일 가정) 로
    // 추정한 8행 위치는 4번 이후로 어긋난다 → manual fallback 안내 트리거
    const actualPositions: PdfRegionRect[] = [
      rect(0.1, 0.1),
      rect(0.1, 0.15),
      rect(0.1, 0.2),
      rect(0.1, 0.25),
      // 소계 행이 0.30 위치에 있음 (실제 명단 5번째는 0.35)
      rect(0.1, 0.35),
      rect(0.1, 0.4),
      rect(0.1, 0.45),
      rect(0.1, 0.5),
    ];
    const uniformPredicted = replicateUniformRows(rect(0.1, 0.1), 0.05, 8);
    const accuracy = estimatePatternAccuracy(uniformPredicted, actualPositions);
    expect(accuracy).toBeLessThan(0.8); // 첫 4행은 정확, 마지막 4행은 0.05 어긋남 → 0.5
  });

  it('PoC AC-0 A0-4 시나리오: 비균일 양식도 anchor 를 소계 행 양쪽에 두면 ≥ 80% 회복', () => {
    // 같은 비균일 양식 — 소계 행 양쪽 (3번 마지막, 4번 첫) 에 anchor 를 두면 두 구간 모두
    // 균일 간격이라 보간 정확.
    const actualPositions: PdfRegionRect[] = [
      rect(0.1, 0.1),
      rect(0.1, 0.15),
      rect(0.1, 0.2),
      rect(0.1, 0.25),
      rect(0.1, 0.35),
      rect(0.1, 0.4),
      rect(0.1, 0.45),
      rect(0.1, 0.5),
    ];
    const anchorPredicted = replicateWithAnchors(
      [
        { participantIndex: 0, rect: actualPositions[0]! },
        { participantIndex: 3, rect: actualPositions[3]! },
        { participantIndex: 4, rect: actualPositions[4]! },
        { participantIndex: 7, rect: actualPositions[7]! },
      ],
      8,
    );
    expect(estimatePatternAccuracy(anchorPredicted, actualPositions)).toBeGreaterThanOrEqual(0.8);
  });
});
