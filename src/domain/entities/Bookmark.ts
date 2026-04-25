export type BookmarkIconType = 'emoji' | 'favicon';
export type BookmarkType = 'url' | 'folder';

export interface Bookmark {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly type?: BookmarkType;    // 기본값 'url' (하위호환)
  readonly iconType: BookmarkIconType;
  readonly iconValue: string;     // 이모지 문자 또는 파비콘 URL
  readonly groupId: string;
  readonly order: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  // OG 메타 (옵셔널, 하위호환)
  readonly ogTitle?: string;
  readonly ogDescription?: string;
  readonly ogImageUrl?: string;
  readonly ogFetchedAt?: string;
  // 클릭 추적 (옵셔널, 하위호환)
  readonly lastClickedAt?: string;
  readonly clickCount?: number;
}

export interface BookmarkGroup {
  readonly id: string;
  readonly name: string;
  readonly emoji: string;
  readonly order: number;
  readonly collapsed: boolean;
  readonly createdAt: string;
  // 아카이브 (옵셔널, 하위호환)
  readonly archived?: boolean;
  readonly archivedAt?: string;
}

export interface BookmarkData {
  readonly groups: readonly BookmarkGroup[];
  readonly bookmarks: readonly Bookmark[];
}

/** 내보내기/가져오기용 페이로드 (.ssampin-bookmarks.json) */
export interface BookmarkExportPayload {
  readonly version: 1;
  readonly exportedAt: string;
  readonly groups: readonly BookmarkGroup[];
  readonly bookmarks: readonly Bookmark[];
}
