import { BookmarkSection } from './BookmarkSection';

export function BookmarksPage() {
  return (
    <div>
      {/* 헤더 */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-sp-text flex items-center gap-2">
          <span className="material-symbols-outlined text-[28px]">bookmark</span>
          <span>즐겨찾기</span>
        </h1>
        <p className="text-sp-muted mt-1">자주 사용하는 교육 사이트를 한곳에서 관리</p>
      </div>

      <BookmarkSection />
    </div>
  );
}
