import { useState } from 'react';
import { useBookmarkStore } from '@adapters/stores/useBookmarkStore';
import { parseBrowserBookmarksHtml } from '@domain/rules/bookmarkRules';
import type { BookmarkExportPayload, BookmarkGroup, Bookmark } from '@domain/entities/Bookmark';
import type { ImportConflictPolicy, ImportResult } from '@usecases/bookmark/ManageBookmarks';
import { Modal } from '@adapters/components/common/Modal';

interface BookmarkImportExportModalProps {
  onClose: () => void;
  onResultMessage: (msg: string) => void;
}

type Mode = 'export' | 'import';

interface ImportPreview {
  groups: readonly BookmarkGroup[];
  bookmarks: readonly Bookmark[];
  source: 'json' | 'html';
}

export function BookmarkImportExportModal({ onClose, onResultMessage }: BookmarkImportExportModalProps) {
  const { groups, exportData, importData } = useBookmarkStore();

  const [mode, setMode] = useState<Mode>('export');
  // 내보내기 상태
  const [selectedGroupIds, setSelectedGroupIds] = useState<readonly string[]>([]);
  const [exportAll, setExportAll] = useState(true);
  // 가져오기 상태
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [conflictPolicy, setConflictPolicy] = useState<ImportConflictPolicy>('skip');
  const [importBusy, setImportBusy] = useState(false);

  const canUseDialog = !!window.electronAPI?.showSaveDialog && !!window.electronAPI?.writeFile;
  const canUseImportDialog = !!window.electronAPI?.importBookmarksFile;

  const handleToggleGroup = (id: string) => {
    setSelectedGroupIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleExport = async () => {
    if (!canUseDialog) {
      onResultMessage('내보내기는 데스크톱 앱에서만 지원됩니다.');
      return;
    }
    const payload: BookmarkExportPayload = await exportData(
      exportAll ? undefined : selectedGroupIds,
    );
    if (payload.bookmarks.length === 0 && payload.groups.length === 0) {
      onResultMessage('내보낼 즐겨찾기가 없습니다.');
      return;
    }

    const date = new Date().toISOString().slice(0, 10);
    const result = await window.electronAPI?.showSaveDialog?.({
      title: '즐겨찾기 내보내기',
      defaultPath: `ssampin-bookmarks-${date}.ssampin-bookmarks.json`,
      filters: [
        { name: '쌤핀 즐겨찾기', extensions: ['json'] },
      ],
    });
    if (!result) return;
    await window.electronAPI?.writeFile?.(result, JSON.stringify(payload, null, 2));
    onResultMessage(
      `${payload.groups.length}개 그룹 · ${payload.bookmarks.length}개 즐겨찾기를 내보냈어요.`,
    );
    onClose();
  };

  const handleImportFile = async () => {
    if (!canUseImportDialog) {
      onResultMessage('가져오기는 데스크톱 앱에서만 지원됩니다.');
      return;
    }
    const file = await window.electronAPI?.importBookmarksFile?.();
    if (!file) return;

    if (file.format === 'json') {
      try {
        const parsed = JSON.parse(file.content) as Partial<BookmarkExportPayload>;
        if (!Array.isArray(parsed.groups) || !Array.isArray(parsed.bookmarks)) {
          onResultMessage('올바른 쌤핀 즐겨찾기 파일이 아닙니다.');
          return;
        }
        setImportPreview({
          groups: parsed.groups,
          bookmarks: parsed.bookmarks,
          source: 'json',
        });
      } catch {
        onResultMessage('JSON 파일을 읽을 수 없어요.');
      }
    } else {
      const parsed = parseBrowserBookmarksHtml(file.content);
      if (parsed.bookmarks.length === 0) {
        onResultMessage('HTML 파일에서 즐겨찾기를 찾지 못했어요.');
        return;
      }
      setImportPreview({
        groups: parsed.groups,
        bookmarks: parsed.bookmarks,
        source: 'html',
      });
    }
  };

  const handleImportApply = async () => {
    if (!importPreview) return;
    setImportBusy(true);
    try {
      const result: ImportResult = await importData(
        { groups: importPreview.groups, bookmarks: importPreview.bookmarks },
        conflictPolicy,
      );
      const parts: string[] = [];
      if (result.bookmarksAdded > 0) parts.push(`추가 ${result.bookmarksAdded}`);
      if (result.bookmarksUpdated > 0) parts.push(`갱신 ${result.bookmarksUpdated}`);
      if (result.bookmarksSkipped > 0) parts.push(`스킵 ${result.bookmarksSkipped}`);
      if (result.groupsAdded > 0) parts.push(`그룹 추가 ${result.groupsAdded}`);
      if (result.groupsMerged > 0) parts.push(`그룹 병합 ${result.groupsMerged}`);
      onResultMessage(`가져오기 완료: ${parts.join(', ') || '변동 없음'}`);
      onClose();
    } finally {
      setImportBusy(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="가져오기 / 내보내기" srOnlyTitle size="lg">
      <div className="p-6">
        <h3 className="text-lg font-bold text-sp-text mb-5">
          가져오기 / 내보내기
        </h3>

        {/* 모드 탭 */}
        <div className="flex gap-1 bg-sp-bg rounded-lg p-1 mb-5">
          <button
            type="button"
            onClick={() => setMode('export')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm rounded-md transition-colors ${
              mode === 'export'
                ? 'bg-sp-card text-sp-text shadow-sm'
                : 'text-sp-muted hover:text-sp-text'
            }`}
          >
            <span className="material-symbols-outlined text-icon">file_download</span>
            내보내기
          </button>
          <button
            type="button"
            onClick={() => setMode('import')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm rounded-md transition-colors ${
              mode === 'import'
                ? 'bg-sp-card text-sp-text shadow-sm'
                : 'text-sp-muted hover:text-sp-text'
            }`}
          >
            <span className="material-symbols-outlined text-icon">file_upload</span>
            가져오기
          </button>
        </div>

        {mode === 'export' ? (
          <div className="space-y-4">
            <p className="text-sm text-sp-muted">
              .ssampin-bookmarks.json 파일로 저장합니다. 다른 PC나 동료 선생님과 공유할 수 있어요.
            </p>

            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer text-sm text-sp-text">
                <input
                  type="radio"
                  checked={exportAll}
                  onChange={() => setExportAll(true)}
                  className="accent-sp-accent"
                />
                전체 내보내기 ({groups.length}개 그룹)
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm text-sp-text">
                <input
                  type="radio"
                  checked={!exportAll}
                  onChange={() => setExportAll(false)}
                  className="accent-sp-accent"
                />
                그룹 선택
              </label>

              {!exportAll && (
                <div className="ml-6 max-h-48 overflow-y-auto bg-sp-card border border-sp-border rounded-lg p-2 space-y-1">
                  {groups.map((g) => (
                    <label key={g.id} className="flex items-center gap-2 cursor-pointer text-sm text-sp-text px-2 py-1 hover:bg-sp-border rounded">
                      <input
                        type="checkbox"
                        checked={selectedGroupIds.includes(g.id)}
                        onChange={() => handleToggleGroup(g.id)}
                        className="accent-sp-accent"
                      />
                      <span>{g.emoji}</span>
                      <span>{g.name}</span>
                      {g.archived && <span className="text-xs text-sp-muted">(아카이브됨)</span>}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm rounded-lg bg-sp-card hover:bg-sp-border text-sp-text transition-colors"
              >
                닫기
              </button>
              <button
                type="button"
                onClick={() => void handleExport()}
                disabled={!exportAll && selectedGroupIds.length === 0}
                className="px-4 py-2 text-sm rounded-lg bg-sp-accent hover:bg-blue-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                내보내기
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {!importPreview ? (
              <>
                <p className="text-sm text-sp-muted">
                  쌤핀 내보내기 파일(.json) 또는 브라우저 북마크 파일(.html)을 가져올 수 있어요.
                </p>
                <button
                  type="button"
                  onClick={() => void handleImportFile()}
                  className="w-full px-4 py-3 text-sm rounded-lg bg-sp-card hover:bg-sp-border text-sp-text transition-colors flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-icon">folder_open</span>
                  파일 선택하기
                </button>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-sm rounded-lg bg-sp-card hover:bg-sp-border text-sp-text transition-colors"
                  >
                    닫기
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="bg-sp-card border border-sp-border rounded-lg p-3 text-sm text-sp-text">
                  <p>
                    📂 그룹 <strong>{importPreview.groups.length}</strong>개 ·
                    📌 즐겨찾기 <strong>{importPreview.bookmarks.length}</strong>개를 가져옵니다.
                  </p>
                  <p className="text-xs text-sp-muted mt-1">
                    {importPreview.source === 'html'
                      ? '브라우저 북마크 HTML에서 추출했어요. 폴더는 그룹으로 매핑됩니다.'
                      : '쌤핀 즐겨찾기 파일을 읽었어요.'}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-sp-muted mb-2">URL이 이미 존재하면…</p>
                  <div className="space-y-2">
                    <label className="flex items-start gap-2 cursor-pointer text-sm text-sp-text">
                      <input
                        type="radio"
                        checked={conflictPolicy === 'skip'}
                        onChange={() => setConflictPolicy('skip')}
                        className="accent-sp-accent mt-0.5"
                      />
                      <span>
                        스킵 — 기존 즐겨찾기 유지
                        <span className="block text-xs text-sp-muted">중복 URL은 추가하지 않아요.</span>
                      </span>
                    </label>
                    <label className="flex items-start gap-2 cursor-pointer text-sm text-sp-text">
                      <input
                        type="radio"
                        checked={conflictPolicy === 'overwrite'}
                        onChange={() => setConflictPolicy('overwrite')}
                        className="accent-sp-accent mt-0.5"
                      />
                      <span>
                        덮어쓰기 — 이름·아이콘·미리보기 갱신
                        <span className="block text-xs text-sp-muted">기존 항목의 이름/아이콘/OG 메타를 새 데이터로 갱신합니다.</span>
                      </span>
                    </label>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setImportPreview(null)}
                    className="px-4 py-2 text-sm rounded-lg bg-sp-card hover:bg-sp-border text-sp-text transition-colors"
                  >
                    다시 선택
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleImportApply()}
                    disabled={importBusy}
                    className="px-4 py-2 text-sm rounded-lg bg-sp-accent hover:bg-blue-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {importBusy ? '가져오는 중...' : '가져오기'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
