import {
  makePlaceholderTitle,
  type GridDimension,
} from '@domain/entities/DesktopOrganizeConfig';

/**
 * 그리드 변경 계획.
 * - nextTitles: 변경 후 newSize 길이의 제목 배열 (앞쪽은 from에서 보존, 뒤쪽은 placeholder)
 * - truncated: 잘리는 박스 [{ index, title }] (빈 배열이면 잘림 없음)
 *
 * 사용자가 적용 전에 truncated.length > 0 이면 ConfirmGridResizeModal로
 * 확인을 받아야 한다.
 */
export interface GridResizePlan {
  readonly from: {
    readonly cols: number;
    readonly rows: number;
    readonly titles: readonly string[];
  };
  readonly to: {
    readonly cols: GridDimension;
    readonly rows: GridDimension;
  };
  readonly nextTitles: readonly string[];
  readonly truncated: ReadonlyArray<{
    readonly index: number;
    readonly title: string;
  }>;
}

export interface ComputeGridResizePlanInput {
  readonly from: {
    readonly cols: number;
    readonly rows: number;
    readonly titles: readonly string[];
  };
  readonly to: {
    readonly cols: GridDimension;
    readonly rows: GridDimension;
  };
}

/**
 * 그리드 변경 계획을 순수하게 계산한다.
 *
 * 규칙:
 * - oldSize = from.cols × from.rows, newSize = to.cols × to.rows
 * - nextTitles[i] = i < oldSize ? from.titles[i] : placeholder
 *   (i는 0..newSize-1)
 * - truncated = (oldSize > newSize) ? from.titles.slice(newSize)에서 빈 문자열 제외
 *   인덱스는 from 기준 (사용자에게 "박스 N의 제목 'XXX'가 사라집니다" 안내용)
 *
 * 빈 제목('')은 truncated에 포함하지 않음 — 사용자가 직접 입력하지 않은
 * placeholder는 손실로 간주하지 않는다.
 *
 * 순수 함수 — 외부 의존 0건.
 */
export function computeGridResizePlan(input: ComputeGridResizePlanInput): GridResizePlan {
  const { from, to } = input;
  const oldSize = from.cols * from.rows;
  const newSize = to.cols * to.rows;

  // 다음 titles 배열: 길이 정확히 newSize
  // - i < oldSize: 기존 슬롯 → from.titles[i] 보존 (배열이 짧으면 빈 문자열)
  // - i >= oldSize: 새 슬롯 → placeholder
  const nextTitles: string[] = [];
  for (let i = 0; i < newSize; i += 1) {
    if (i < oldSize) {
      nextTitles.push(from.titles[i] ?? '');
    } else {
      nextTitles.push(makePlaceholderTitle(i));
    }
  }

  // 잘리는 박스 (oldSize > newSize인 경우만)
  const truncated: { index: number; title: string }[] = [];
  if (oldSize > newSize) {
    for (let i = newSize; i < oldSize; i += 1) {
      const title = from.titles[i];
      // 사용자가 입력하지 않은 빈 제목은 안내하지 않음
      if (typeof title === 'string' && title.trim().length > 0) {
        truncated.push({ index: i, title });
      }
    }
  }

  return {
    from,
    to,
    nextTitles,
    truncated,
  };
}
