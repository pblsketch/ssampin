/**
 * 메모지를 모델에 보낼 요약으로 바꾼다(순수 함수).
 *
 * ★**내용까지 그대로 보낸다** — 2026-08-23 오너 결정 ①. 제목만 보내면 "메모에 뭐라고
 * 적었더라"를 물을 수 없어 기능이 반쪽이 된다. 대신 이름·연락처를 가리는 관문(그물 ③)은
 * 선택지가 아니라 **모든 도구에 걸린 기존 관문**이므로 content 를 freeTextFields 로 선언해
 * 그대로 통과시킨다.
 *
 * 자르는 것은 개인정보 축소가 아니라 **서버 상한(도구 결과당 4,000자)** 때문이다.
 * 최근에 고친 것부터 담으므로, 잘려 나가는 것은 항상 오래된 메모다.
 */
import { clip } from './clip';

/** summarizeMemos 가 필요로 하는 최소 필드 (Memo 와 호환) */
export interface MemoLike {
  readonly content: string;
  /** ISO 8601 */
  readonly updatedAt: string;
  readonly archived: boolean;
}

export interface SummarizeMemosOptions {
  /** 보관함으로 넘긴 메모도 포함할지. 기본 false */
  readonly includeArchived?: boolean;
  /** 메모 한 건의 길이 상한. 기본 1,000자 */
  readonly maxContentChars?: number;
  /** 내용 전체의 길이 상한. 기본 3,000자 (서버 상한 4,000자 안쪽) */
  readonly maxTotalChars?: number;
  /** 담을 건수 상한. 기본 30건 */
  readonly maxItems?: number;
}

export interface MemosSummary {
  /** 조건에 맞는 **전체** 건수. 잘려도 이 숫자는 사실 그대로다 */
  readonly total: number;
  readonly truncated: boolean;
  readonly items: readonly {
    readonly content: string;
    /** YYYY-MM-DD — 시각까지는 보내지 않는다 */
    readonly updated: string;
  }[];
}

export function summarizeMemos(
  memos: readonly MemoLike[],
  opts: SummarizeMemosOptions = {},
): MemosSummary {
  const includeArchived = opts.includeArchived ?? false;
  const maxContentChars = opts.maxContentChars ?? 1_000;
  const maxTotalChars = opts.maxTotalChars ?? 3_000;
  const maxItems = opts.maxItems ?? 30;

  const candidates = memos
    .filter((m) => includeArchived || !m.archived)
    // 최근에 고친 것부터 — 잘려 나가는 쪽이 항상 오래된 메모가 되게 한다.
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const items: MemosSummary['items'][number][] = [];
  let used = 0;
  let truncated = false;

  for (const memo of candidates) {
    if (items.length >= maxItems) {
      truncated = true;
      break;
    }
    const content = clip(memo.content, maxContentChars);
    if (content.length !== memo.content.length) truncated = true;
    if (used + content.length > maxTotalChars && items.length > 0) {
      truncated = true;
      break;
    }
    used += content.length;
    items.push({ content, updated: memo.updatedAt.slice(0, 10) });
  }

  return { total: candidates.length, truncated, items };
}
