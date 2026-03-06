import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IBookmarkRepository } from '@domain/repositories/IBookmarkRepository';
import type { BookmarkData } from '@domain/entities/Bookmark';

export class JsonBookmarkRepository implements IBookmarkRepository {
  constructor(private readonly storage: IStoragePort) {}

  load(): Promise<BookmarkData | null> {
    return this.storage.read<BookmarkData>('bookmarks');
  }

  save(data: BookmarkData): Promise<void> {
    return this.storage.write('bookmarks', data);
  }
}
