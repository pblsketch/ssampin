import { useEffect, useState } from 'react';
import { ToolLayout } from './ToolLayout';
import { useStickerStore } from '@adapters/stores/useStickerStore';
import { StickerManager } from './Sticker/StickerManager';
import { StickerGuidePanel } from './Sticker/StickerGuidePanel';

interface ToolMyEmojiProps {
  onBack: () => void;
  isFullscreen: boolean;
}

type TopTab = 'manage' | 'guide';

const FIRST_VISIT_KEY = 'ssampin.sticker.first-visit';

/**
 * 쌤도구 → 내 이모티콘.
 *
 * 두 개의 최상위 탭:
 * - 내 이모티콘 (관리)
 * - 만드는 법 💡 (가이드)
 *
 * 첫 방문 OR 등록 0개 → 가이드로 시작.
 * 1개 이상 → 관리로 시작.
 */
export function ToolMyEmoji({ onBack, isFullscreen }: ToolMyEmojiProps): JSX.Element {
  const data = useStickerStore((s) => s.data);
  const loaded = useStickerStore((s) => s.loaded);
  const load = useStickerStore((s) => s.load);

  const [tab, setTab] = useState<TopTab>('manage');
  const [didInitTab, setDidInitTab] = useState(false);

  // 마운트 시 데이터 로드
  useEffect(() => {
    if (!loaded) void load();
  }, [load, loaded]);

  // 데이터가 로드된 후 한 번만 초기 탭 결정
  useEffect(() => {
    if (!loaded || didInitTab) return;
    const firstVisit =
      typeof window !== 'undefined' &&
      window.localStorage.getItem(FIRST_VISIT_KEY) === null;
    if (firstVisit || data.stickers.length === 0) {
      setTab('guide');
    } else {
      setTab('manage');
    }
    if (firstVisit) {
      try {
        window.localStorage.setItem(FIRST_VISIT_KEY, new Date().toISOString());
      } catch {
        /* storage 비활성 */
      }
    }
    setDidInitTab(true);
  }, [loaded, data.stickers.length, didInitTab]);

  return (
    <ToolLayout
      title="내 이모티콘"
      emoji="😎"
      onBack={onBack}
      isFullscreen={isFullscreen}
      disableZoom
    >
      <div className="flex flex-col h-full px-1">
        {/* 최상위 탭 */}
        <div className="shrink-0 mb-4">
          <div className="inline-flex gap-1 p-1 bg-sp-bg ring-1 ring-sp-border rounded-xl">
            <TopTabButton
              active={tab === 'manage'}
              onClick={() => setTab('manage')}
              icon="grid_view"
              label="내 이모티콘"
              count={data.stickers.length}
            />
            <TopTabButton
              active={tab === 'guide'}
              onClick={() => setTab('guide')}
              icon="tips_and_updates"
              label="만드는 법"
            />
          </div>
        </div>

        {/* 콘텐츠 */}
        <div className="flex-1 min-h-0">
          {tab === 'manage' ? (
            <StickerManager onSwitchToGuide={() => setTab('guide')} />
          ) : (
            <StickerGuidePanel />
          )}
        </div>
      </div>
    </ToolLayout>
  );
}

interface TopTabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
  count?: number;
}

function TopTabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: TopTabButtonProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm transition-all duration-sp-base ease-sp-out',
        active
          ? 'bg-sp-accent text-sp-accent-fg shadow-sp-sm font-sp-semibold'
          : 'text-sp-muted hover:text-sp-text hover:bg-sp-text/5 font-sp-medium',
      ].join(' ')}
    >
      <span className="material-symbols-outlined icon-sm">{icon}</span>
      <span>{label}</span>
      {count !== undefined && count > 0 && (
        <span
          className={[
            'text-detail tabular-nums px-1.5 py-0.5 rounded',
            active ? 'bg-white/20' : 'bg-sp-text/5 text-sp-muted',
          ].join(' ')}
        >
          {count}
        </span>
      )}
    </button>
  );
}
