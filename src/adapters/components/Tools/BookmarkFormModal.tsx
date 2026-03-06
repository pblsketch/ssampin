import { useState, useEffect } from 'react';
import type { Bookmark, BookmarkGroup, BookmarkIconType } from '@domain/entities/Bookmark';
import { validateBookmarkUrl } from '@domain/rules/bookmarkRules';

interface BookmarkFormModalProps {
  bookmark: Bookmark | null;
  groups: readonly BookmarkGroup[];
  onSave: (data: {
    name: string;
    url: string;
    iconType: BookmarkIconType;
    iconValue: string;
    groupId: string;
  }) => void;
  onClose: () => void;
}

const EMOJI_CHOICES = [
  '🌐', '📖', '📚', '💼', '📝', '🎓', '🏫', '💡',
  '🔬', '🎨', '🎵', '⚽', '🌍', '💻', '📊', '🔗',
  '🤖', '🔔', '📌', '🖼️', '📺', '📱', '🏛️', '💰',
  '✨', '🎯', '🛠️', '📋',
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
  const [iconType, setIconType] = useState<BookmarkIconType>(bookmark?.iconType ?? 'emoji');
  const [iconValue, setIconValue] = useState(bookmark?.iconValue ?? '🌐');
  const [groupId, setGroupId] = useState(bookmark?.groupId ?? groups[0]?.id ?? '');
  const [urlError, setUrlError] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [faviconLoading, setFaviconLoading] = useState(false);

  useEffect(() => {
    if (url && !validateBookmarkUrl(url)) {
      setUrlError('http:// 또는 https://로 시작하는 URL을 입력해주세요');
    } else {
      setUrlError('');
    }
  }, [url]);

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
    if (!name.trim() || !url.trim() || !validateBookmarkUrl(url) || !groupId) return;
    onSave({
      name: name.trim(),
      url: url.trim(),
      iconType,
      iconValue,
      groupId,
    });
  };

  const canSubmit = name.trim() && url.trim() && validateBookmarkUrl(url) && groupId;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-sp-surface border border-sp-border rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <h2 className="text-lg font-bold text-white mb-5">
          {isEdit ? '즐겨찾기 편집' : '즐겨찾기 추가'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 이름 */}
          <div>
            <label className="block text-sm text-sp-muted mb-1">이름 *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="사이트 이름"
              className="w-full bg-sp-card border border-sp-border rounded-lg px-3 py-2 text-sp-text placeholder-sp-muted/50 focus:border-sp-accent focus:outline-none"
              autoFocus
            />
          </div>

          {/* URL */}
          <div>
            <label className="block text-sm text-sp-muted mb-1">URL *</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              className={`w-full bg-sp-card border rounded-lg px-3 py-2 text-sp-text placeholder-sp-muted/50 focus:outline-none ${
                urlError ? 'border-red-500' : 'border-sp-border focus:border-sp-accent'
              }`}
            />
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

              {validateBookmarkUrl(url) && (
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
              onChange={(e) => setGroupId(e.target.value)}
              className="w-full bg-sp-card border border-sp-border rounded-lg px-3 py-2 text-sp-text focus:border-sp-accent focus:outline-none"
            >
              {groups.length === 0 && (
                <option value="" disabled>그룹을 먼저 추가해주세요</option>
              )}
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.emoji} {g.name}
                </option>
              ))}
            </select>
          </div>

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
