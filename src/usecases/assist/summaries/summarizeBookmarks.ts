/**
 * 즐겨찾기를 모델에 보낼 요약으로 바꾼다(순수 함수).
 *
 * ★**주소는 도메인만 나간다** — 2026-08-23 오너 결정 ②. 전체 주소에는 경로·질의 문자열이
 * 붙는데, 나이스·에듀파인 같은 업무 사이트 링크에는 학번·조회 조건이 그대로 박혀 있는 경우가
 * 흔하다. 도메인만 보내도 "어떤 사이트를 즐겨찾기 했는지"는 그대로 전해진다.
 *
 * 깨진 주소(`ㅁㄴㅇㄹ`, 오타)는 빈 문자열로 둔다. 여기서 예외가 나면 카드가 통째로
 * 사라지고, 선생님은 이유를 알 수 없는 빈 답을 본다.
 */

/** summarizeBookmarks 가 필요로 하는 최소 필드 (Bookmark 와 호환) */
export interface BookmarkLike {
  readonly name: string;
  readonly url: string;
  readonly groupId: string;
  /** 'folder' 면 주소가 없다 */
  readonly type?: string;
}

/** summarizeBookmarks 가 필요로 하는 최소 필드 (BookmarkGroup 과 호환) */
export interface BookmarkGroupLike {
  readonly id: string;
  readonly name: string;
  readonly archived?: boolean;
}

export interface SummarizeBookmarksOptions {
  /** 보관한 묶음의 즐겨찾기도 포함할지. 기본 false */
  readonly includeArchived?: boolean;
  /** 담을 건수 상한. 기본 100건 */
  readonly maxItems?: number;
}

export interface BookmarksSummary {
  /** 조건에 맞는 **전체** 건수 */
  readonly total: number;
  readonly truncated: boolean;
  readonly items: readonly {
    readonly name: string;
    /** 도메인(호스트)만. 깨진 주소·폴더는 빈 문자열 */
    readonly domain: string;
    readonly group: string;
  }[];
}

/**
 * 주소에서 도메인만 뽑는다.
 *
 * `neis.go.kr/foo?sid=12345` 처럼 스킴이 없는 입력도 선생님이 자주 넣으므로 https 를 붙여
 * 다시 시도한다. 사용자 정보(`user:pass@`)·경로·질의는 hostname 에 포함되지 않는다.
 */
function toDomain(url: string): string {
  const trimmed = url.trim();
  if (trimmed.length === 0) return '';
  for (const candidate of [trimmed, `https://${trimmed}`]) {
    try {
      const host = new URL(candidate).hostname;
      if (host.length > 0) return host;
    } catch {
      // 다음 후보로 넘어간다. 둘 다 실패하면 빈 문자열.
    }
  }
  return '';
}

export function summarizeBookmarks(
  bookmarks: readonly BookmarkLike[],
  groups: readonly BookmarkGroupLike[],
  opts: SummarizeBookmarksOptions = {},
): BookmarksSummary {
  const includeArchived = opts.includeArchived ?? false;
  const maxItems = opts.maxItems ?? 100;

  const groupById = new Map(groups.map((g) => [g.id, g]));

  const rows = bookmarks.filter((b) => {
    if (includeArchived) return true;
    return groupById.get(b.groupId)?.archived !== true;
  });

  return {
    total: rows.length,
    truncated: rows.length > maxItems,
    items: rows.slice(0, maxItems).map((b) => ({
      name: b.name,
      domain: b.type === 'folder' ? '' : toDomain(b.url),
      group: groupById.get(b.groupId)?.name ?? '',
    })),
  };
}
