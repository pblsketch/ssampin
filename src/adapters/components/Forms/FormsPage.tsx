import { useEffect } from 'react';
import { useFormStore } from '@adapters/stores/useFormStore';
import { FormsToolbar } from './FormsToolbar';
import { FormGrid } from './FormGrid';
import { FormPreviewModal } from './FormPreviewModal';
import { FormUploadModal } from './FormUploadModal';

interface FormsPageProps {
  onBack?: () => void;
}

export function FormsPage({ onBack }: FormsPageProps = {}) {
  const loadAll = useFormStore((s) => s.loadAll);
  const loaded = useFormStore((s) => s.loaded);
  const selectedId = useFormStore((s) => s.selectedId);
  const uploadModalOpen = useFormStore((s) => s.uploadModalOpen);
  const openUpload = useFormStore((s) => s.openUpload);

  useEffect(() => {
    if (!loaded) {
      void loadAll();
    }
  }, [loaded, loadAll]);

  return (
    <div className="max-w-7xl mx-auto p-6">
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-surface transition-colors"
              aria-label="쌤도구로 돌아가기"
            >
              <span className="material-symbols-outlined text-lg">arrow_back</span>
            </button>
          )}
          <div>
            <h1 className="text-2xl font-bold text-sp-text">서식</h1>
            <p className="text-sm text-sp-muted mt-1">
              자주 쓰는 HWPX · PDF · Excel 서식을 한곳에 모아두세요
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={openUpload}
          className="inline-flex items-center gap-2 bg-sp-accent text-white px-4 py-2 rounded-lg hover:bg-sp-accent/90 transition-colors"
        >
          <span className="material-symbols-outlined text-lg">add</span>
          <span className="text-sm font-medium">서식 등록</span>
        </button>
      </header>

      <FormsToolbar />
      <FormGrid />

      {selectedId && <FormPreviewModal />}
      {uploadModalOpen && <FormUploadModal />}
    </div>
  );
}
