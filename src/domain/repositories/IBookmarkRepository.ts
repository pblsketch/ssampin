import type { BookmarkData } from '../entities/Bookmark';

export interface IBookmarkRepository {
  load(): Promise<BookmarkData | null>;
  save(data: BookmarkData): Promise<void>;
}
