/**
 * 옆핀 메모 영역에 무엇을 보여줄지 고르는 순수 규칙.
 *
 * `Memo`에는 제목 필드가 없다. 그래서 본문 첫 줄을 제목처럼 쓴다. 제목 필드를
 * 새로 만들면 기존 메모 파일 전체를 손대야 해서 1차에서는 하지 않기로 했다.
 *
 * 잠금 상태에서 내용을 지우는 일도 여기서 한다. 화면에서 가리는 방식으로 처리하면
 * 값 자체는 화면 쪽 메모리에 남아, 개발자 도구나 화면 공유로 새어 나갈 수 있다.
 * 아예 만들어 보내지 않는 편이 확실하다.
 */
import type { Memo } from '@domain/entities/Memo';
import type { MemoColor } from '@domain/valueObjects/MemoColor';

/** 옆핀 메모 목록에 기본으로 보여줄 개수 */
export const SIDE_PIN_MEMO_LIMIT = 5;

/** 제목처럼 쓰는 첫 줄의 최대 글자 수 */
export const SIDE_PIN_MEMO_LABEL_MAX = 40;

/** 미리보기로 보여줄 최대 줄 수 */
export const SIDE_PIN_MEMO_PREVIEW_LINES = 2;

/** 본문이 비어 있는 메모의 표시 이름 */
export const SIDE_PIN_EMPTY_MEMO_LABEL = '새 메모';

export interface SidePinMemoListItem {
  readonly id: string;
  readonly label: string;
  readonly preview: string;
  readonly color: MemoColor;
  readonly updatedAt: string;
  readonly hasImage: boolean;
}

export interface SelectSidePinMemosInput {
  readonly memos: readonly Memo[];
  /** 앱이 잠겨 있으면 내용을 만들지 않는다 */
  readonly locked: boolean;
  readonly limit?: number;
}

/** 앞뒤 공백을 뺀 줄들 중 비어 있지 않은 것만 */
function meaningfulLines(content: string): string[] {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

/**
 * 본문에서 제목처럼 쓸 첫 줄을 만든다.
 * 내용이 없으면 '새 메모'로 표시해, 방금 만든 빈 메모도 목록에서 눌러 열 수 있게 한다.
 */
export function deriveSidePinMemoLabel(content: string): string {
  const [first] = meaningfulLines(content);
  if (first === undefined) return SIDE_PIN_EMPTY_MEMO_LABEL;
  return first.slice(0, SIDE_PIN_MEMO_LABEL_MAX);
}

/** 제목으로 쓴 줄 다음부터 최대 두 줄까지 미리보기로 만든다 */
export function deriveSidePinMemoPreview(content: string): string {
  return meaningfulLines(content)
    .slice(1, 1 + SIDE_PIN_MEMO_PREVIEW_LINES)
    .join('\n');
}

/**
 * 보관하지 않은 메모를 최근 수정순으로 골라 옆핀 표시용 목록을 만든다.
 */
export function selectSidePinMemos(input: SelectSidePinMemosInput): readonly SidePinMemoListItem[] {
  const limit = input.limit ?? SIDE_PIN_MEMO_LIMIT;
  if (limit <= 0) return [];

  const active = input.memos.filter((memo) => !memo.archived);
  // 원본 배열을 건드리지 않도록 복사한 뒤 정렬한다.
  // updatedAt은 ISO 8601이라 문자열 크기 비교만으로 시간순이 된다.
  // localeCompare는 로케일에 따라 결과가 달라질 수 있어 쓰지 않는다.
  const sorted = [...active].sort((a, b) => {
    if (a.updatedAt === b.updatedAt) return 0;
    return a.updatedAt < b.updatedAt ? 1 : -1;
  });

  return sorted.slice(0, limit).map((memo) => ({
    id: memo.id,
    label: input.locked ? '' : deriveSidePinMemoLabel(memo.content),
    preview: input.locked ? '' : deriveSidePinMemoPreview(memo.content),
    color: memo.color,
    updatedAt: memo.updatedAt,
    hasImage: input.locked ? false : memo.image !== undefined,
  }));
}
