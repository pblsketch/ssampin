/**
 * Phase 2C Step 0 PoC artifact A0-4: Pattern 2 자동복제용 행 간격 추론 (PRD AC-0 / AC-3).
 *
 * 교사가 첫 두 행에 사각형을 그리면, 두 사각형의 y 차이가 행 간격이 된다. 그 행 간격으로
 * 명단 N명까지 자동복제할 위치를 계산한다.
 *
 * 비균일 행 양식 (직급 헤더 또는 부서 소계 행이 끼어 있는 양식) 에서는 행 간격이
 * 일정하지 않으므로, anchorRows (교사가 미리 그려둔 N개 anchor 사각형) 로부터
 * "구간별 행 간격" 을 외삽한다.
 *
 * 핵심 함수
 *   - `inferRowSpacing(firstRect, secondRect)`: 균일 행 가정 — 두 행 간격을 반환
 *   - `replicateUniformRows(...)`: 균일 간격으로 N 행 복제
 *   - `replicateWithAnchors(anchorRects, participantCount)`: 비균일 — anchor 사이를
 *     선형 보간 + anchor 너머는 마지막 구간의 간격으로 외삽 (PoC 정확도 측정용)
 *   - `estimatePatternAccuracy(...)`: 합성 fixture 위치에 매칭된 비율 측정
 *
 * 순수 함수. 모든 좌표는 PDF 정규화 0~1 좌표 (top-left origin).
 */

import type { PdfRegionRect } from '@domain/entities/SignatureRequest';

export interface InferRowSpacingInput {
  readonly first: PdfRegionRect;
  readonly second: PdfRegionRect;
}

export function inferRowSpacing(input: InferRowSpacingInput): number {
  return Math.abs(input.second.y - input.first.y);
}

export function replicateUniformRows(
  template: PdfRegionRect,
  rowSpacing: number,
  participantCount: number,
  pageMaxY = 1.0,
): readonly PdfRegionRect[] {
  if (participantCount <= 0) return [];
  if (rowSpacing <= 0) return [{ ...template }];

  const result: PdfRegionRect[] = [];
  for (let i = 0; i < participantCount; i++) {
    const y = template.y + rowSpacing * i;
    if (y + template.h > pageMaxY) break; // 페이지 밖이면 중단 — caller 가 manual fallback 안내
    result.push({ x: template.x, y, w: template.w, h: template.h });
  }
  return result;
}

/**
 * 비균일 양식용: 교사가 anchorRects 를 명단 N 개의 특정 위치에 미리 배치하면,
 * 인접한 anchor 사이를 선형 보간하여 나머지 위치를 추정. anchor 너머는
 * 마지막 구간의 간격으로 외삽.
 */
export function replicateWithAnchors(
  anchorRects: readonly { participantIndex: number; rect: PdfRegionRect }[],
  participantCount: number,
): readonly PdfRegionRect[] {
  if (anchorRects.length === 0 || participantCount <= 0) return [];

  // 인덱스 순으로 정렬
  const sorted = [...anchorRects].sort((a, b) => a.participantIndex - b.participantIndex);
  const result: PdfRegionRect[] = new Array(participantCount);

  // 1) anchor 자체는 그대로
  for (const a of sorted) {
    if (a.participantIndex < participantCount) {
      result[a.participantIndex] = { ...a.rect };
    }
  }

  // 2) 인접 anchor 사이 선형 보간
  for (let s = 0; s < sorted.length - 1; s++) {
    const a = sorted[s]!;
    const b = sorted[s + 1]!;
    const gap = b.participantIndex - a.participantIndex;
    if (gap <= 1) continue;
    const dy = (b.rect.y - a.rect.y) / gap;
    const dx = (b.rect.x - a.rect.x) / gap;
    for (let k = 1; k < gap; k++) {
      const idx = a.participantIndex + k;
      if (idx >= participantCount) break;
      result[idx] = {
        x: a.rect.x + dx * k,
        y: a.rect.y + dy * k,
        w: a.rect.w,
        h: a.rect.h,
      };
    }
  }

  // 3) anchor 너머는 마지막 구간의 간격으로 외삽
  if (sorted.length >= 2) {
    const last = sorted[sorted.length - 1]!;
    const prev = sorted[sorted.length - 2]!;
    const gap = last.participantIndex - prev.participantIndex || 1;
    const dy = (last.rect.y - prev.rect.y) / gap;
    const dx = (last.rect.x - prev.rect.x) / gap;
    for (let i = last.participantIndex + 1; i < participantCount; i++) {
      const k = i - last.participantIndex;
      result[i] = {
        x: last.rect.x + dx * k,
        y: last.rect.y + dy * k,
        w: last.rect.w,
        h: last.rect.h,
      };
    }
  } else {
    // anchor 가 1개뿐이면 외삽할 간격 정보가 없으므로 그 위치를 그대로 반복 — caller 가
    // "anchor 가 부족하다" 경고를 띄워야 함
    const only = sorted[0]!;
    for (let i = 0; i < participantCount; i++) {
      if (!result[i]) result[i] = { ...only.rect };
    }
  }

  // 4) anchor 이전 (사용자가 N번째부터 anchor 를 그리고 0..N-1 은 비어 있는 경우)
  if (sorted.length >= 2) {
    const first = sorted[0]!;
    const second = sorted[1]!;
    const gap = second.participantIndex - first.participantIndex || 1;
    const dy = (second.rect.y - first.rect.y) / gap;
    const dx = (second.rect.x - first.rect.x) / gap;
    for (let i = first.participantIndex - 1; i >= 0; i--) {
      const k = first.participantIndex - i;
      result[i] = {
        x: first.rect.x - dx * k,
        y: first.rect.y - dy * k,
        w: first.rect.w,
        h: first.rect.h,
      };
    }
  }

  return result.filter(Boolean) as PdfRegionRect[];
}

/**
 * PoC 정확도 측정: 추정한 위치 (predicted) 와 실제 위치 (actual) 가 toleranceY 이내로
 * 매칭되는 행 비율을 0~1 로 반환. tolerance 기본 = 행 높이의 25%.
 */
export function estimatePatternAccuracy(
  predicted: readonly PdfRegionRect[],
  actual: readonly PdfRegionRect[],
  toleranceY = 0.012,
): number {
  if (predicted.length === 0 || actual.length === 0) return 0;
  const n = Math.min(predicted.length, actual.length);
  let matches = 0;
  for (let i = 0; i < n; i++) {
    const dy = Math.abs(predicted[i]!.y - actual[i]!.y);
    if (dy <= toleranceY) matches++;
  }
  return matches / n;
}
