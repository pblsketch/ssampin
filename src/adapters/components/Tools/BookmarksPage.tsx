import { BookmarkSection } from './BookmarkSection';
import { PageHeader } from '@adapters/components/common/PageHeader';

export function BookmarksPage() {
  return (
    <div className="flex flex-col h-full -m-8">
      <PageHeader
        icon="bookmark"
        iconIsMaterial
        title="즐겨찾기"
        leftAddon={
          <span className="text-sp-muted text-sm font-sp-medium">
            자주 사용하는 교육 사이트를 한곳에서 관리
          </span>
        }
      />
      <div className="flex-1 min-h-0 overflow-y-auto p-8">
        <BookmarkSection />
      </div>
    </div>
  );
}
