import {
  MAX_GRID_CELLS,
  MAX_GRID_DIMENSION,
  MIN_GRID_DIMENSION,
  type GridDimension,
} from '@domain/entities/DesktopOrganizeConfig';

/**
 * 그리드 차원 검증 결과.
 * - ok: true → 정상
 * - ok: false → 거부, reason에 사용자에게 보여줄 메시지
 */
export type GridValidationResult =
  | { readonly ok: true; readonly cols: GridDimension; readonly rows: GridDimension }
  | { readonly ok: false; readonly reason: string };

/**
 * cols, rows 입력값을 검증해 GridDimension 타입으로 좁히거나 거부 사유를 반환한다.
 *
 * 규칙:
 * - 정수 (소수점 거부)
 * - 1 ≤ cols ≤ 6, 1 ≤ rows ≤ 6
 * - cols × rows ≤ 12
 *
 * 순수 함수 — 외부 의존 0건.
 */
export function validateGridDimensions(cols: number, rows: number): GridValidationResult {
  if (!Number.isInteger(cols) || !Number.isInteger(rows)) {
    return { ok: false, reason: '가로·세로는 정수만 입력할 수 있어요' };
  }

  if (cols < MIN_GRID_DIMENSION || rows < MIN_GRID_DIMENSION) {
    return { ok: false, reason: `가로·세로는 최소 ${MIN_GRID_DIMENSION}칸 이상이어야 해요` };
  }

  if (cols > MAX_GRID_DIMENSION || rows > MAX_GRID_DIMENSION) {
    return { ok: false, reason: `가로·세로는 최대 ${MAX_GRID_DIMENSION}칸까지 가능해요` };
  }

  if (cols * rows > MAX_GRID_CELLS) {
    return { ok: false, reason: `박스는 최대 ${MAX_GRID_CELLS}칸까지 만들 수 있어요` };
  }

  return {
    ok: true,
    cols: cols as GridDimension,
    rows: rows as GridDimension,
  };
}
