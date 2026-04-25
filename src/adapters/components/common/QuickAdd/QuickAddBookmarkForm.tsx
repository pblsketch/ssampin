import { useEffect, useMemo, useRef, useState } from 'react';
import { useBookmarkStore } from '@adapters/stores/useBookmarkStore';
import { useToastStore } from '@adapters/components/common/Toast';
import {
  validateBookmarkUrl,
  recommendGroupId,
  extractDomain,
} from '@domain/rules/bookmarkRules';
import type { BookmarkIconType } from '@domain/entities/Bookmark';
import type { RealtimeWallLinkPreviewOgMeta } from '@domain/entities/RealtimeWall';

interface Props {
  onClose: () => void;
}

const EMOJI_CHOICES = [
  '🌐', '📖', '📚', '💼', '📝', '🎓', '🏫', '💡',
  '🔬', '🎨', '🎵', '⚽', '🌍', '💻', '📊', '🔗',
  '🤖', '🔔', '📌', '🖼️', '📺', '📱', '🏛️', '💰',
  '✨', '🎯', '🛠️', '📋',
];

/**
 * Google s2 favicons API — 안정적이며 도메인만 있으면 64×64 PNG 반환.
 * 도메인이 favicon을 직접 제공하지 않는 경우에도 폴백 이미지가 옴.
 */
function buildFaviconUrl(url: string): string | null {
  try {
    const origin = new URL(url).origin;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(origin)}&sz=64`;
  } catch {
    return null;
  }
}

export function QuickAddBookmarkForm({ onClose }: Props): JSX.Element {
  const urlInputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [groupId, setGroupId] = useState('');
  const [iconType, setIconType] = useState<BookmarkIconType>('favicon');
  const [iconValue, setIconValue] = useState('');
  const [userTouchedGroup, setUserTouchedGroup] = useState(false);
  const [userTouchedName, setUserTouchedName] = useState(false);
  const [userTouchedIcon, setUserTouchedIcon] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [og, setOg] = useState<RealtimeWallLinkPreviewOgMeta | null>(null);
  const [ogLoading, setOgLoading] = useState(false);
  const lastFetchedUrlRef = useRef<string>('');

  const groups = useBookmarkStore((s) => s.groups);
  const bookmarks = useBookmarkStore((s) => s.bookmarks);
  const loadAll = useBookmarkStore((s) => s.loadAll);
  const addBookmark = useBookmarkStore((s) => s.addBookmark);
  const updateOgMeta = useBookmarkStore((s) => s.updateOgMeta);
  const showToast = useToastStore((s) => s.show);

  // 첫 마운트: 데이터 로드 + 클립보드 자동 채움 + URL 입력 포커스
  useEffect(() => {
    void loadAll();

    void (async () => {
      try {
        let text = '';
        const ipcRead = window.electronAPI?.readClipboardText;
        if (ipcRead) {
          text = await ipcRead();
        } else if (navigator.clipboard?.readText) {
          text = await navigator.clipboard.readText();
        }
        const trimmed = text?.trim();
        if (trimmed && validateBookmarkUrl(trimmed)) {
          setUrl(trimmed);
        }
      } catch {
        /* 권한/포커스 거부는 무시 */
      }
    })();

    requestAnimationFrame(() => urlInputRef.current?.focus({ preventScroll: true }));
  }, [loadAll]);

  // 활성 그룹만 노출
  const activeGroups = useMemo(
    () => groups.filter((g) => !g.archived),
    [groups],
  );

  // 그룹 자동 추천 (사용자가 직접 변경 전까지)
  useEffect(() => {
    if (userTouchedGroup) return;
    if (groupId && activeGroups.some((g) => g.id === groupId)) return;
    if (validateBookmarkUrl(url)) {
      const recommended = recommendGroupId(url, activeGroups);
      if (recommended) {
        setGroupId(recommended);
        return;
      }
    }
    if (activeGroups.length > 0) setGroupId(activeGroups[0]!.id);
  }, [url, activeGroups, userTouchedGroup, groupId]);

  // URL 유효해지면 파비콘 자동 적용 (사용자가 아이콘 변경 전까지)
  useEffect(() => {
    if (userTouchedIcon) return;
    if (!validateBookmarkUrl(url)) return;
    const favicon = buildFaviconUrl(url);
    if (favicon) {
      setIconType('favicon');
      setIconValue(favicon);
    }
  }, [url, userTouchedIcon]);

  // URL 변경 시 OG 메타 자동 페치 (디바운스 600ms) — 이름 자동 채움
  useEffect(() => {
    if (!validateBookmarkUrl(url)) {
      setOg(null);
      return;
    }
    if (url === lastFetchedUrlRef.current) return;
    const api = window.electronAPI?.fetchLinkPreview;
    if (!api) return;

    const timer = setTimeout(async () => {
      lastFetchedUrlRef.current = url;
      setOgLoading(true);
      try {
        const meta = await api(url);
        if (!meta) {
          setOg(null);
          return;
        }
        setOg(meta);
        if (!userTouchedName && meta.ogTitle?.trim()) {
          setName(meta.ogTitle.trim());
        }
      } catch {
        /* 무시 */
      } finally {
        setOgLoading(false);
      }
    }, 600);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const handleSelectEmoji = (emoji: string): void => {
    setIconType('emoji');
    setIconValue(emoji);
    setUserTouchedIcon(true);
    setShowIconPicker(false);
  };

  const handleResetToFavicon = (): void => {
    const favicon = buildFaviconUrl(url);
    if (favicon) {
      setIconType('favicon');
      setIconValue(favicon);
    }
    setUserTouchedIcon(true);
    setShowIconPicker(false);
  };

  const handleSubmit = async (): Promise<void> => {
    if (saving) return;
    if (!validateBookmarkUrl(url)) {
      showToast('http:// 또는 https://로 시작하는 URL을 입력해주세요.', 'error');
      return;
    }
    if (!groupId) {
      showToast('먼저 즐겨찾기 그룹을 만들어주세요. 즐겨찾기 페이지에서 그룹을 추가할 수 있어요.', 'error');
      return;
    }

    setSaving(true);
    try {
      const trimmedName = name.trim();
      const ogTitleTrimmed = og?.ogTitle?.trim();
      const fallbackName = ogTitleTrimmed || extractDomain(url) || url;
      const finalName = trimmedName || fallbackName;

      // 아이콘 폴백: 비어있으면 파비콘 시도, 그것도 안되면 이모지 🌐
      let finalIconType = iconType;
      let finalIconValue = iconValue;
      if (!finalIconValue) {
        const favicon = buildFaviconUrl(url);
        if (favicon) {
          finalIconType = 'favicon';
          finalIconValue = favicon;
        } else {
          finalIconType = 'emoji';
          finalIconValue = '🌐';
        }
      }

      const groupBookmarks = bookmarks.filter((b) => b.groupId === groupId);
      const maxOrder = groupBookmarks.length > 0
        ? Math.max(...groupBookmarks.map((b) => b.order)) + 1
        : 0;

      const created = await addBookmark({
        name: finalName,
        url: url.trim(),
        type: 'url',
        iconType: finalIconType,
        iconValue: finalIconValue,
        groupId,
        order: maxOrder,
        ogTitle: og?.ogTitle,
        ogDescription: og?.ogDescription,
        ogImageUrl: og?.ogImageUrl,
        ogFetchedAt: og ? new Date().toISOString() : undefined,
      });

      showToast('즐겨찾기가 추가되었습니다.', 'success');
      onClose();

      // OG가 미처 도착 못 한 경우 백그라운드에서 보강
      const api = window.electronAPI?.fetchLinkPreview;
      if (api && created && !og) {
        void (async () => {
          try {
            const meta = await api(url);
            if (meta) {
              await updateOgMeta(created.id, {
                ogTitle: meta.ogTitle,
                ogDescription: meta.ogDescription,
                ogImageUrl: meta.ogImageUrl,
              });
            }
          } catch {
            /* 무시 */
          }
        })();
      }
    } catch {
      showToast('즐겨찾기 추가에 실패했습니다.', 'error');
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <form
      onKeyDown={handleKeyDown}
      onSubmit={(e) => { e.preventDefault(); void handleSubmit(); }}
      className="space-y-3"
    >
      <input
        ref={urlInputRef}
        type="text"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://example.com"
        className="w-full bg-sp-bg/60 border border-sp-border rounded-lg px-3 py-2.5 text-[15px] font-sp-medium text-sp-text placeholder:text-sp-muted outline-none focus:ring-1 focus:ring-sp-accent focus:border-sp-accent transition-colors"
      />

      {/* 이름 + 아이콘 */}
      <div className="flex items-stretch gap-2">
        {/* 아이콘 토글 버튼 */}
        <button
          type="button"
          onClick={() => setShowIconPicker((v) => !v)}
          aria-label="아이콘 선택"
          className="w-10 h-auto flex items-center justify-center bg-sp-bg/60 border border-sp-border rounded-lg hover:bg-sp-card transition-colors"
        >
          {iconType === 'favicon' && iconValue ? (
            <img
              src={iconValue}
              alt=""
              className="w-5 h-5 rounded"
              onError={(e) => {
                // 파비콘 실패 시 기본 이모지로
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <span className="text-xl">{iconValue || '🌐'}</span>
          )}
        </button>

        <div className="relative flex-1">
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setUserTouchedName(true); }}
            placeholder={
              ogLoading
                ? '사이트 이름을 가져오는 중...'
                : userTouchedName
                  ? '사이트 이름'
                  : (og?.ogTitle ?? extractDomain(url) ?? '사이트 이름 (선택 — 비우면 도메인으로)')
            }
            className="w-full bg-sp-bg/60 border border-sp-border rounded-lg px-3 py-2 text-sm font-sp-medium text-sp-text placeholder:text-sp-muted outline-none focus:ring-1 focus:ring-sp-accent focus:border-sp-accent transition-colors"
          />
          {ogLoading && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-sp-muted">
              ...
            </span>
          )}
        </div>
      </div>

      {/* 아이콘 선택 패널 */}
      {showIconPicker && (
        <div className="bg-sp-bg/60 border border-sp-border rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-sp-muted">아이콘</span>
            <button
              type="button"
              onClick={handleResetToFavicon}
              disabled={!validateBookmarkUrl(url)}
              className="text-[11px] text-sp-accent hover:underline disabled:text-sp-muted disabled:no-underline disabled:cursor-not-allowed"
            >
              ↻ 파비콘으로
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {EMOJI_CHOICES.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => handleSelectEmoji(emoji)}
                className={`w-8 h-8 flex items-center justify-center rounded hover:bg-sp-border text-lg transition-colors ${
                  iconType === 'emoji' && iconValue === emoji ? 'bg-sp-accent/20 ring-1 ring-sp-accent' : ''
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-sp-muted mr-1 whitespace-nowrap">그룹</span>
        <select
          value={groupId}
          onChange={(e) => { setGroupId(e.target.value); setUserTouchedGroup(true); }}
          disabled={activeGroups.length === 0}
          className="flex-1 bg-sp-bg/60 border border-sp-border rounded-lg px-3 py-2 text-sm font-sp-medium text-sp-text focus:ring-1 focus:ring-sp-accent focus:border-sp-accent transition-colors disabled:opacity-50"
        >
          {activeGroups.length === 0 && (
            <option value="" disabled>그룹이 없습니다 — 즐겨찾기 페이지에서 추가</option>
          )}
          {activeGroups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.emoji} {g.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={() => { onClose(); requestAnimationFrame(() => { window.dispatchEvent(new CustomEvent<string>('ssampin:navigate', { detail: 'bookmarks' })); }); }}
          className="text-[12px] text-sp-muted hover:text-sp-accent transition-colors"
        >
          → 상세 편집
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
            disabled={saving || !validateBookmarkUrl(url) || !groupId}
            className="px-4 py-1.5 bg-sp-accent text-white rounded-lg text-sm font-sp-semibold hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </form>
  );
}
