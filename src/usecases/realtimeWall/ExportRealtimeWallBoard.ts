/**
 * ExportRealtimeWallBoard — 실시간 담벼락 내보내기 use case.
 *
 * Clean Architecture:
 *   - usecases는 domain 만 import (infrastructure 호출 금지).
 *   - 본 use case는 도메인 변환만 수행: WallBoard + posts + columns →
 *     `RealtimeWallExportRows` 평면 구조.
 *   - 어댑터(`adapters/components/Tools/RealtimeWall/...`)에서 본 use case로
 *     데이터 정규화 → infrastructure exporter(`exportRealtimeWallToPdf` /
 *     `exportRealtimeWallToExcel`) 호출 → Save Dialog 흐름으로 파일 저장.
 *
 * 책임 분리 의도:
 *   - "어떤 행을 어떤 순서로 내보낼지"는 도메인 정책 (정렬/필터/라벨)
 *   - "행을 xlsx 셀/PDF 텍스트로 그리는 법"은 infrastructure (exceljs/pdf-lib)
 *
 * 따라서 본 모듈은 thin orchestrator — domain rules에 위임.
 */

import type {
  RealtimeWallColumn,
  RealtimeWallLayoutMode,
  RealtimeWallPost,
} from '@domain/entities/RealtimeWall';
import {
  buildRealtimeWallExportRows,
  DEFAULT_REALTIME_WALL_EXPORT_OPTIONS,
  sanitizeRealtimeWallFileBase,
  type RealtimeWallExportOptions,
  type RealtimeWallExportRows,
} from '@domain/rules/realtimeWallExportRules';

export {
  DEFAULT_REALTIME_WALL_EXPORT_OPTIONS,
  sanitizeRealtimeWallFileBase,
  type RealtimeWallExportOptions,
  type RealtimeWallExportRows,
};

export interface ExportRealtimeWallBoardInput {
  readonly title: string;
  readonly layoutMode: RealtimeWallLayoutMode;
  readonly columns: readonly RealtimeWallColumn[];
  readonly posts: readonly RealtimeWallPost[];
  readonly options?: RealtimeWallExportOptions;
  /** 테스트 결정성을 위한 시각 주입 (default: Date.now()) */
  readonly now?: number;
}

/**
 * 보드 + 게시물 → 내보내기용 평면 행 구조.
 *
 * 어댑터에서 호출 후 결과를 infrastructure exporter에 넘겨 사용한다.
 * @example
 * ```ts
 * const rows = exportRealtimeWallBoard({ title, layoutMode, columns, posts, options });
 * const buffer = format === 'excel'
 *   ? await exportRealtimeWallToExcel(rows)
 *   : await exportRealtimeWallToPdf(rows);
 * ```
 */
export function exportRealtimeWallBoard(
  input: ExportRealtimeWallBoardInput,
): RealtimeWallExportRows {
  return buildRealtimeWallExportRows({
    title: input.title,
    layoutMode: input.layoutMode,
    columns: input.columns,
    posts: input.posts,
    ...(input.options !== undefined ? { options: input.options } : {}),
    ...(input.now !== undefined ? { now: input.now } : {}),
  });
}
