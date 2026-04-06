import { useState, useEffect, useMemo } from 'react';
import { ToolLayout } from '../ToolLayout';
import type { KeyboardShortcut } from '../types';
import { useAnalytics } from '@adapters/hooks/useAnalytics';
import type { Tab } from './types';
import { TimerMode } from './TimerMode';
import { StopwatchMode } from './StopwatchMode';
import { PresentationMode } from './PresentationMode';

interface ToolTimerProps {
  onBack: () => void;
  isFullscreen: boolean;
}

const TABS: { id: Tab; label: string; emoji: string }[] = [
  { id: 'timer', label: '타이머', emoji: '⏱️' },
  { id: 'stopwatch', label: '스톱워치', emoji: '⏱️' },
  { id: 'presentation', label: '발표 타이머', emoji: '🗣️' },
];

export function ToolTimer({ onBack, isFullscreen }: ToolTimerProps) {
  const { track } = useAnalytics();
  useEffect(() => {
    track('tool_use', { tool: 'timer' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [tab, setTab] = useState<Tab>('timer');

  const displayShortcuts = useMemo<KeyboardShortcut[]>(() => {
    if (tab === 'timer') {
      return [
        { key: ' ', label: '시작/일시정지', description: '타이머 토글', handler: () => {} },
        { key: 'r', label: '리셋', description: '타이머 리셋', handler: () => {} },
        { key: 'Enter', label: '확인', description: '종료 확인', handler: () => {} },
        { key: '↑', label: '+30초', description: '시간 추가', handler: () => {} },
        { key: '↓', label: '-30초', description: '시간 빼기', handler: () => {} },
      ];
    }
    if (tab === 'presentation') {
      return [
        { key: ' ', label: '시작/일시정지', description: '발표 토글', handler: () => {} },
        { key: '→', label: '다음 발표자', description: '다음 발표자', handler: () => {} },
        { key: 'r', label: '처음으로', description: '발표 리셋', handler: () => {} },
      ];
    }
    return [
      { key: ' ', label: '시작/일시정지', description: '스톱워치 토글', handler: () => {} },
      { key: 'r', label: '리셋', description: '스톱워치 리셋', handler: () => {} },
      { key: 'l', label: '랩', description: '랩 기록', handler: () => {} },
    ];
  }, [tab]);

  return (
    <ToolLayout title="타이머" emoji="⏱️" onBack={onBack} isFullscreen={isFullscreen} shortcuts={displayShortcuts}>
      <div className="flex flex-col items-center w-full max-w-xl mx-auto gap-8">
        {/* 탭 */}
        <div className="flex bg-sp-card rounded-xl p-1 border border-sp-border">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === t.id
                  ? 'bg-sp-accent text-white shadow-sm'
                  : 'text-sp-muted hover:text-sp-text'
              }`}
            >
              {t.emoji} {t.label}
            </button>
          ))}
        </div>

        {/* 탭 콘텐츠 */}
        {tab === 'timer' && <TimerMode />}
        {tab === 'stopwatch' && <StopwatchMode />}
        {tab === 'presentation' && <PresentationMode />}
      </div>
    </ToolLayout>
  );
}
