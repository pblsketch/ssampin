export type BookmarkIconType = 'emoji' | 'favicon';

export interface Bookmark {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly iconType: BookmarkIconType;
  readonly iconValue: string;     // 이모지 문자 또는 파비콘 URL
  readonly groupId: string;
  readonly order: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface BookmarkGroup {
  readonly id: string;
  readonly name: string;
  readonly emoji: string;
  readonly order: number;
  readonly collapsed: boolean;
  readonly createdAt: string;
}

export interface BookmarkData {
  readonly groups: readonly BookmarkGroup[];
  readonly bookmarks: readonly Bookmark[];
}
