import { useState, useEffect, useRef } from 'react';
import type { Bookmark, BookmarkGroup, BookmarkIconType, BookmarkType } from '@domain/entities/Bookmark';
import { validateBookmarkUrl, validateFolderPath, recommendGroupId } from '@domain/rules/bookmarkRules';
import type { RealtimeWallLinkPreviewOgMeta } from '@domain/entities/RealtimeWall';

export interface BookmarkFormSaveData {
  name: string;
  url: string;
  type: BookmarkType;
  iconType: BookmarkIconType;
  iconValue: string;
  groupId: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImageUrl?: string;
}

interface BookmarkFormModalProps {
  bookmark: Bookmark | null;
  groups: readonly BookmarkGroup[];
  onSave: (data: BookmarkFormSaveData) => void;
  onClose: () => void;
}

const EMOJI_CHOICES = [
  '🌐', '📖', '📚', '💼', '📝', '🎓', '🏫', '💡',
  '🔬', '🎨', '🎵', '⚽', '🌍', '💻', '📊', '🔗',
  '🤖', '🔔', '📌', '🖼️', '📺', '📱', '🏛️', '💰',
  '✨', '🎯', '🛠️', '📋',
  '📁', '📂', '🗂️', '💾',
];

export function BookmarkFormModal({
  bookmark,
  groups,
  onSave,
  onClose,
}: BookmarkFormModalProps) {
  const isEdit = bookmark !== null;
  const [name, setName] = useState(bookmark?.name ?? '');
  const [url, setUrl] = useState(bookmark?.url ?? '');
  const [bookmarkType, setBookmarkType] = useState<BookmarkType>(bookmark?.type ?? 'url');
  const [iconType, setIconType] = useState<BookmarkIconType>(bookmark?.iconType ?? 'emoji');
  const [iconValue, setIconValue] = useState(bookmark?.iconValue ?? '🌐');
  const [groupId, setGroupId] = useState(bookmark?.groupId ?? groups[0]?.id ?? '');
  const [urlError, setUrlError] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [faviconLoading, setFaviconLoading] = useState(false);
  // OG 미리보기
  const [og, setOg] = useState<RealtimeWallLinkPreviewOgMeta | null>(
    bookmark?.ogTitle || bookmark?.ogDescription || bookmark?.ogImageUrl
      ? {
          ogTitle: bookmark.ogTitle,
          ogDescription: bookmark.ogDescription,
          ogImageUrl: bookmark.ogImageUrl,
        }
      : null,
  );
  const [ogLoading, setOgLoading] = useState(false);
  const lastFetchedUrlRef = useRef<string>(bookmark?.url ?? '');
  // 사용자가 그룹을 직접 선택했는지 추적 (편집 모드 또는 그룹 자동 추천이 적용된 후)
  const [userTouchedGroup, setUserTouchedGroup] = useState(isEdit);

  const canSelectFolder = !!window.electronAPI?.showOpenDialog;
  const canFetchOg = !!window.electronAPI?.fetchLinkPreview;

  useEffect(() => {
    if (!url) { setUrlError(''); return; }

    if (bookmarkType === 'folder') {
      if (!validateFolderPath(url)) {
        setUrlError('올바른 폴더 경로를 선택해주세요');
      } else {
        setUrlError('');
      }
    } else {
      if (!validateBookmarkUrl(url)) {
        setUrlError('http:// 또는 https://로 시작하는 URL을 입력해주세요');
      } else {
        setUrlError('');
      }
    }
  }, [url, bookmarkType]);

  // 그룹 자동 추천 (사용자가 그룹을 직접 변경하지 않았을 때만)
  useEffect(() => {
    if (bookmarkType !== 'url' || userTouchedGroup) return;
    if (!validateBookmarkUrl(url)) return;
    const recommended = recommendGroupId(url, groups);
    if (recommended && recommended !== groupId) {
      setGroupId(recommended);
    }
  }, [url, bookmarkType, groups, userTouchedGroup, groupId]);

  // URL 디바운스 후 OG 메타 자동 파싱 (1초)
  useEffect(() => {
    if (bookmarkType !== 'url') {
      setOg(null);
      return;
    }
    if (!validateBookmarkUrl(url)) return;
    if (url === lastFetchedUrlRef.current && og) return;
    if (!canFetchOg) return;

    const timer = setTimeout(async () => {
      lastFetchedUrlRef.current = url;
      setOgLoading(true);
      try {
        const meta = await window.electronAPI?.fetchLinkPreview?.(url);
        if (meta) setOg(meta);
      } catch {
        // 실패해도 폼 동작에는 영향 없음 — 오프라인 우선
      } finally {
        setOgLoading(false);
      }
    }, 1000);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, bookmarkType, canFetchOg]);

  const handleSelectFolder = async () => {
    if (!window.electronAPI?.showOpenDialog) return;

    const result = await window.electronAPI.showOpenDialog({
      properties: ['openDirectory'],
      title: '즐겨찾기에 추가할 폴더 선택',
    });

    if (!result.canceled && result.filePaths[0]) {
      const folderPath = result.filePaths[0];
      setUrl(folderPath);

      if (!name.trim()) {
        const folderName = folderPath.split('\\').pop() ?? folderPath.split('/').pop() ?? '';
        setName(folderName);
      }
    }
  };

  const handleFetchFavicon = async () => {
    if (!validateBookmarkUrl(url)) return;
    setFaviconLoading(true);
    try {
      const origin = new URL(url).origin;
      const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(origin)}&sz=64`;
      // 파비콘 로딩 확인
      const img = new Image();
      img.onload = () => {
        setIconType('favicon');
        setIconValue(faviconUrl);
        setFaviconLoading(false);
      };
      img.onerror = () => {
        setFaviconLoading(false);
      };
      img.src = faviconUrl;
    } catch {
      setFaviconLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const isValid = bookmarkType === 'folder'
      ? validateFolderPath(url)
      : validateBookmarkUrl(url);
    if (!name.trim() || !url.trim() || !isValid || !groupId) return;
    onSave({
      name: name.trim(),
      url: url.trim(),
      type: bookmarkType,
      iconType,
      iconValue,
      groupId,
      ogTitle: og?.ogTitle,
      ogDescription: og?.ogDescription,
      ogImageUrl: og?.ogImageUrl,
    });
  };

  const isUrlValid = bookmarkType === 'folder'
    ? validateFolderPath(url)
    : validateBookmarkUrl(url);
  const canSubmit = name.trim() && url.trim() && isUrlValid && groupId;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" aria-hidden="true">
      <div
        className="bg-sp-surface border border-sp-border rounded-2xl w-full max-w-md p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title-bookmark-form"
      >
        <h2 id="modal-title-bookmark-form" className="text-lg font-bold text-sp-text mb-5">
          {isEdit ? '즐겨찾기 편집' : '즐겨찾기 추가'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 타입 선택 탭 (Electron에서만 표시) */}
          {canSelectFolder && (
            <div className="flex gap-1 bg-sp-bg rounded-lg p-1">
              <button
                type="button"
                onClick={() => { setBookmarkType('url'); setUrl(''); setUrlError(''); }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs rounded-md transition-colors ${
                  bookmarkType === 'url'
                    ? 'bg-sp-card text-sp-text shadow-sm'
                    : 'text-sp-muted hover:text-sp-text'
                }`}
              >
                <span className="material-symbols-outlined text-sm">language</span>
                웹 URL
              </button>
              <button
                type="button"
                onClick={() => { setBookmarkType('folder'); setUrl(''); setUrlError(''); setIconValue('📁'); }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs rounded-md transition-colors ${
                  bookmarkType === 'folder'
                    ? 'bg-sp-card text-sp-text shadow-sm'
                    : 'text-sp-muted hover:text-sp-text'
                }`}
              >
                <span className="material-symbols-outlined text-sm">folder</span>
                PC 폴더
              </button>
            </div>
          )}

          {/* 이름 */}
          <div>
            <label className="block text-sm text-sp-muted mb-1">이름 *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={bookmarkType === 'folder' ? '폴더 이름' : '사이트 이름'}
              className="w-full bg-sp-card border border-sp-border rounded-lg px-3 py-2 text-sp-text placeholder-sp-muted/50 focus:border-sp-accent focus:outline-none"
              autoFocus
            />
          </div>

          {/* URL / 폴더 경로 */}
          <div>
            <label className="block text-sm text-sp-muted mb-1">
              {bookmarkType === 'folder' ? '폴더 경로 *' : 'URL *'}
            </label>
            {bookmarkType === 'folder' ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={url}
                  readOnly
                  placeholder="폴더를 선택해주세요"
                  className={`flex-1 bg-sp-card border rounded-lg px-3 py-2 text-sp-text placeholder-sp-muted/50 focus:outline-none cursor-default ${
                    urlError ? 'border-red-500' : 'border-sp-border'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => void handleSelectFolder()}
                  className="px-3 py-2 bg-sp-accent text-white text-xs rounded-lg hover:bg-blue-600 shrink-0 transition-colors"
                >
                  폴더 선택
                </button>
              </div>
            ) : (
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                className={`w-full bg-sp-card border rounded-lg px-3 py-2 text-sp-text placeholder-sp-muted/50 focus:outline-none ${
                  urlError ? 'border-red-500' : 'border-sp-border focus:border-sp-accent'
                }`}
              />
            )}
            {urlError && (
              <p className="text-xs text-red-400 mt-1">{urlError}</p>
            )}
          </div>

          {/* 아이콘 */}
          <div>
            <label className="block text-sm text-sp-muted mb-1">아이콘</label>
            <div className="flex items-center gap-2">
              {/* 현재 아이콘 미리보기 */}
              <div className="w-10 h-10 flex items-center justify-center bg-sp-card rounded-lg border border-sp-border text-2xl">
                {iconType === 'favicon' ? (
                  <img src={iconValue} alt="" className="w-6 h-6 rounded" />
                ) : (
                  iconValue
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="px-3 py-1.5 text-sm bg-sp-card border border-sp-border rounded-lg text-sp-text hover:bg-sp-border transition-colors"
              >
                이모지 선택
              </button>

              {bookmarkType === 'url' && validateBookmarkUrl(url) && (
                <button
                  type="button"
                  onClick={() => void handleFetchFavicon()}
                  disabled={faviconLoading}
                  className="px-3 py-1.5 text-sm bg-sp-card border border-sp-border rounded-lg text-sp-text hover:bg-sp-border transition-colors disabled:opacity-50"
                >
                  {faviconLoading ? '로딩...' : '파비콘 자동'}
                </button>
              )}
            </div>

            {/* 이모지 그리드 */}
            {showEmojiPicker && (
              <div className="mt-2 p-3 bg-sp-card border border-sp-border rounded-lg grid grid-cols-7 gap-1">
                {EMOJI_CHOICES.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      setIconType('emoji');
                      setIconValue(emoji);
                      setShowEmojiPicker(false);
                    }}
                    className={`w-8 h-8 flex items-center justify-center rounded hover:bg-sp-border text-lg transition-colors ${
                      iconType === 'emoji' && iconValue === emoji ? 'bg-sp-accent/20 ring-1 ring-sp-accent' : ''
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 그룹 */}
          <div>
            <label className="block text-sm text-sp-muted mb-1">그룹</label>
            <select
              value={groupId}
              onChange={(e) => { setGroupId(e.target.value); setUserTouchedGroup(true); }}
              className="w-full bg-sp-card border border-sp-border rounded-lg px-3 py-2 text-sp-text focus:border-sp-accent focus:outline-none"
            >
              {groups.length === 0 && (
                <option value="" disabled>그룹을 먼저 추가해주세요</option>
              )}
              {groups.filter((g) => !g.archived).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.emoji} {g.name}
                </option>
              ))}
            </select>
          </div>

          {/* OG 미리보기 */}
          {bookmarkType === 'url' && (ogLoading || og) && (
            <div className="bg-sp-bg border border-sp-border rounded-lg p-3">
              <div className="text-xs text-sp-muted mb-2 flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">link</span>
                미리보기 {ogLoading && '· 불러오는 중...'}
              </div>
              {og && (
                <div className="flex gap-3">
                  {og.ogImageUrl && (
                    <img
                      src={og.ogImageUrl}
                      alt=""
                      className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    {og.ogTitle && (
                      <p className="text-sm font-medium text-sp-text truncate">{og.ogTitle}</p>
                    )}
                    {og.ogDescription && (
                      <p className="text-xs text-sp-muted line-clamp-2">{og.ogDescription}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 버튼 */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg bg-sp-card hover:bg-sp-border text-sp-text transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="px-4 py-2 text-sm rounded-lg bg-sp-accent hover:bg-blue-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isEdit ? '저장' : '추가'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
