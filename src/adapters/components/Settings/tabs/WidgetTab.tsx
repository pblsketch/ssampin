import { useCallback } from 'react';
import type { Settings, WidgetSettings } from '@domain/entities/Settings';
import { SettingsSection } from '../shared/SettingsSection';
import { Toggle } from '../shared/Toggle';

interface Props {
  draft: Settings;
  patch: (p: Partial<Settings>) => void;
}

export function WidgetTab({ draft, patch }: Props) {
  const patchWidget = useCallback((p: Partial<WidgetSettings>) => {
    patch({ widget: { ...draft.widget, ...p } });
  }, [draft.widget, patch]);

  return (
    <SettingsSection
      icon="widgets"
      iconColor="bg-indigo-500/10 text-indigo-400"
      title="위젯 설정"
    >
      <div className="space-y-6">
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-sm font-medium text-sp-text">기본 투명도</span>
            <span className="text-sm font-bold text-sp-accent">{Math.round(draft.widget.opacity * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(draft.widget.opacity * 100)}
            onChange={(e) => patchWidget({ opacity: Number(e.target.value) / 100 })}
            className="w-full h-2 bg-sp-border rounded-full appearance-none cursor-pointer accent-sp-accent"
          />
        </div>
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-sm font-medium text-sp-text">카드 배경 투명도</span>
            <span className="text-sm font-bold text-sp-accent">{Math.round((draft.widget.cardOpacity ?? 1) * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round((draft.widget.cardOpacity ?? 1) * 100)}
            onChange={(e) => patchWidget({ cardOpacity: Number(e.target.value) / 100 })}
            className="w-full h-2 bg-sp-border rounded-full appearance-none cursor-pointer accent-sp-accent"
          />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-sp-text">항상 위에 표시</span>
            <span className="text-xs text-sp-muted">다른 창보다 항상 위에 고정합니다.</span>
          </div>
          <Toggle checked={draft.widget.alwaysOnTop} onChange={(v) => patchWidget({ alwaysOnTop: v })} />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-sp-text">닫기 시 위젯 전환</span>
            <span className="text-xs text-sp-muted">X 버튼을 누르면 위젯 모드로 전환합니다.</span>
          </div>
          <Toggle checked={draft.widget.closeToWidget} onChange={(v) => patchWidget({ closeToWidget: v })} />
        </div>
        <div className="flex items-center justify-between pt-4 border-t border-sp-border">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-sp-text">시작 시 위젯 모드</span>
            <span className="text-xs text-sp-muted">앱 실행 시 전체화면 대신 위젯으로 시작합니다.</span>
          </div>
          <Toggle checked={draft.widget.transparent} onChange={(v) => patchWidget({ transparent: v })} />
        </div>
        <div className="pt-4 border-t border-sp-border">
          <p className="text-sm font-medium text-sp-text mb-1">위젯 표시 항목</p>
          <p className="text-xs text-sp-muted">위젯 모드는 대시보드 화면의 카드 설정을 그대로 따릅니다. 대시보드 편집 모드에서 카드를 추가/제거하세요.</p>
        </div>
      </div>
    </SettingsSection>
  );
}
