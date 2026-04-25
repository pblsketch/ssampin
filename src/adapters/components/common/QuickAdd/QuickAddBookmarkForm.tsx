import { useEffect, useMemo, useRef, useState } from 'react';
import { useBookmarkStore } from '@adapters/stores/useBookmarkStore';
import { useToastStore } from '@adapters/components/common/Toast';
import {
  validateBookmarkUrl,
  recommendGroupId,
  extractDomain,
} from '@domain/rules/bookmarkRules';

interface Props {
  onClose: () => void;
}

export function QuickAddBookmarkForm({ onClose }: Props): JSX.Element {
  const urlInputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [groupId, setGroupId] = useState('');
  const [userTouchedGroup, setUserTouchedGroup] = useState(false);
  const [userTouchedName, setUserTouchedName] = useState(false);
  const [saving, setSaving] = useState(false);

  const groups = useBookmarkStore((s) => s.groups);
  const bookmarks = useBookmarkStore((s) => s.bookmarks);
  const loadAll = useBookmarkStore((s) => s.loadAll);
  const addBookmark = useBookmarkStore((s) => s.addBookmark);
  const updateOgMeta = useBookmarkStore((s) => s.updateOgMeta);
  const showToast = useToastStore((s) => s.show);

  // 첫 마운트 시 데이터 로드 + 클립보드 자동 채움 + URL 입력에 포커스
  useEffect(() => {
    void loadAll();

    // 클립보드에 URL이 들어 있으면 자동으로 채워넣기 (사용자 편의)
    void (async () => {
      try {
        const text = await navigator.clipboard.readText();
        const trimmed = text?.trim();
        if (trimmed && validateBookmarkUrl(trimmed)) {
          setUrl(trimmed);
        }
      } catch {
        // 권한 거부/Unfocused 등은 조용히 무시
      }
    })();

    requestAnimationFrame(() => urlInputRef.current?.focus({ preventScroll: true }));
  }, [loadAll]);

  // 활성 그룹만 노출
  const activeGroups = useMemo(
    () => groups.filter((g) => !g.archived),
    [groups],
  );

  // 그룹 초기값 — 사용자가 직접 선택하기 전엔 자동 설정
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
      // 이름 폴백: 입력 없으면 도메인
      const trimmedName = name.trim();
      const fallbackName = extractDomain(url) ?? url;
      const finalName = trimmedName || fallbackName;

      // order: 해당 그룹의 max+1
      const groupBookmarks = bookmarks.filter((b) => b.groupId === groupId);
      const maxOrder = groupBookmarks.length > 0
        ? Math.max(...groupBookmarks.map((b) => b.order)) + 1
        : 0;

      const created = await addBookmark({
        name: finalName,
        url: url.trim(),
        type: 'url',
        iconType: 'emoji',
        iconValue: '🌐',
        groupId,
        order: maxOrder,
      });

      showToast('즐겨찾기가 추가되었습니다.', 'success');
      onClose();

      // OG 파싱은 백그라운드 — 모달은 이미 닫힘
      const api = window.electronAPI?.fetchLinkPreview;
      if (api && created) {
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
            /* OG 실패는 무시 */
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

      <input
        type="text"
        value={name}
        onChange={(e) => { setName(e.target.value); setUserTouchedName(true); }}
        placeholder={
          userTouchedName
            ? '사이트 이름'
            : extractDomain(url) ?? '사이트 이름 (선택 — 비우면 도메인으로)'
        }
        className="w-full bg-sp-bg/60 border border-sp-border rounded-lg px-3 py-2 text-sm font-sp-medium text-sp-text placeholder:text-sp-muted outline-none focus:ring-1 focus:ring-sp-accent focus:border-sp-accent transition-colors"
      />

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
