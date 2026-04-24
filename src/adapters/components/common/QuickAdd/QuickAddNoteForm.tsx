import { useEffect, useMemo, useRef, useState } from 'react';
import { useNoteStore } from '@adapters/stores/useNoteStore';
import { useToastStore } from '@adapters/components/common/Toast';

interface Props {
  onClose: () => void;
}

export function QuickAddNoteForm({ onClose }: Props): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const notebooks = useNoteStore((s) => s.notebooks);
  const sections = useNoteStore((s) => s.sections);
  const pagesMeta = useNoteStore((s) => s.pagesMeta);
  const activeNotebookId = useNoteStore((s) => s.activeNotebookId);
  const activeSectionId = useNoteStore((s) => s.activeSectionId);
  const loaded = useNoteStore((s) => s.loaded);
  const load = useNoteStore((s) => s.load);
  const createPage = useNoteStore((s) => s.createPage);
  const renamePage = useNoteStore((s) => s.renamePage);
  const showToast = useToastStore((s) => s.show);

  const [notebookId, setNotebookId] = useState<string>('');
  const [sectionId, setSectionId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [openAfter, setOpenAfter] = useState(false);
  const [saving, setSaving] = useState(false);

  // 노트 데이터 lazy load
  useEffect(() => {
    if (!loaded) {
      void load();
    }
  }, [loaded, load]);

  // 기본 선택값: lastActive 또는 첫 항목
  useEffect(() => {
    if (notebookId) return;
    const initialNotebook = activeNotebookId ?? notebooks[0]?.id ?? '';
    if (initialNotebook) setNotebookId(initialNotebook);
  }, [activeNotebookId, notebooks, notebookId]);

  // 노트북 선택 시 섹션 자동 선택
  const filteredSections = useMemo(
    () => sections.filter((s) => s.notebookId === notebookId),
    [sections, notebookId],
  );

  useEffect(() => {
    if (!notebookId) return;
    const stillValid = filteredSections.some((s) => s.id === sectionId);
    if (stillValid) return;
    const initialSection = (notebookId === activeNotebookId ? activeSectionId : null) ?? filteredSections[0]?.id ?? '';
    setSectionId(initialSection);
  }, [notebookId, filteredSections, activeNotebookId, activeSectionId, sectionId]);

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  }, []);

  const noNotebooks = loaded && notebooks.length === 0;
  const noSections = loaded && notebookId !== '' && filteredSections.length === 0;
  const canSave = !noNotebooks && !noSections && !!sectionId && title.trim().length > 0;

  const handleSubmit = async (): Promise<void> => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      await createPage(sectionId);
      // createPage는 새 페이지를 활성화하므로, activePageId를 가져와 rename
      const newPageId = useNoteStore.getState().activePageId;
      if (newPageId) {
        await renamePage(newPageId, title.trim());
      }
      showToast('노트 페이지가 추가되었습니다.', 'success');
      onClose();
      if (openAfter) {
        requestAnimationFrame(() => {
          window.dispatchEvent(new CustomEvent<string>('ssampin:navigate', { detail: 'note' }));
        });
      }
    } catch {
      showToast('노트 페이지 추가에 실패했습니다.', 'error');
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  // 페이지 수가 너무 많으면 셀렉트 가독성을 위해 단순화 — 향후 필요시 개선
  void pagesMeta;

  return (
    <form
      onKeyDown={handleKeyDown}
      onSubmit={(e) => { e.preventDefault(); void handleSubmit(); }}
      className="space-y-3"
    >
      {noNotebooks ? (
        <div className="text-sm text-sp-muted py-2">
          노트북이 없습니다.{' '}
          <button
            type="button"
            onClick={() => { onClose(); requestAnimationFrame(() => { window.dispatchEvent(new CustomEvent<string>('ssampin:navigate', { detail: 'note' })); }); }}
            className="text-sp-accent hover:underline"
          >
            노트에서 먼저 만들기 →
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={notebookId}
              onChange={(e) => setNotebookId(e.target.value)}
              aria-label="노트북"
              className="bg-sp-bg/60 border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text outline-none focus:ring-1 focus:ring-sp-accent transition-colors"
            >
              {notebooks.map((nb) => (
                <option key={nb.id} value={nb.id}>{nb.title}</option>
              ))}
            </select>
            <select
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
              aria-label="섹션"
              disabled={noSections}
              className="bg-sp-bg/60 border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text outline-none focus:ring-1 focus:ring-sp-accent transition-colors disabled:opacity-50"
            >
              {noSections ? (
                <option value="">섹션 없음</option>
              ) : (
                filteredSections.map((sec) => (
                  <option key={sec.id} value={sec.id}>{sec.title}</option>
                ))
              )}
            </select>
          </div>

          <input
            ref={inputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="페이지 제목"
            className="w-full bg-sp-bg/60 border border-sp-border rounded-lg px-3 py-2.5 text-[15px] font-sp-medium text-sp-text placeholder:text-sp-muted outline-none focus:ring-1 focus:ring-sp-accent focus:border-sp-accent transition-colors"
          />

          <label className="flex items-center gap-2 text-sm text-sp-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={openAfter}
              onChange={(e) => setOpenAfter(e.target.checked)}
              className="rounded accent-sp-accent"
            />
            저장 후 노트 열기
          </label>
        </>
      )}

      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={() => { onClose(); requestAnimationFrame(() => { window.dispatchEvent(new CustomEvent<string>('ssampin:navigate', { detail: 'note' })); }); }}
          className="text-[12px] text-sp-muted hover:text-sp-accent transition-colors"
        >
          → 노트 열기
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-sp-muted hover:text-sp-text transition-colors"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={!canSave || saving}
            className="px-4 py-1.5 bg-sp-accent text-white rounded-lg text-sm font-sp-semibold hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </form>
  );
}
