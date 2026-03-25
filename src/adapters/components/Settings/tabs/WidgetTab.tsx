import { useCallback } from 'react';
import type { Settings, WidgetSettings, WidgetDesktopMode } from '@domain/entities/Settings';
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
        <div className="space-y-1.5">
          <span className="text-sm font-medium text-sp-text">창 닫기 동작</span>
          <p className="text-xs text-sp-muted mb-2">X 버튼을 누를 때의 동작을 선택합니다.</p>
          {([
            { value: 'widget' as const, label: '위젯 모드로 전환', desc: '작은 위젯 창으로 전환합니다' },
            { value: 'tray' as const, label: '트레이로 최소화', desc: '시스템 트레이로 숨깁니다' },
            { value: 'ask' as const, label: '매번 물어보기', desc: '닫을 때마다 선택합니다' },
          ]).map((opt) => (
            <label key={opt.value} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-sp-surface/50 cursor-pointer transition-colors">
              <input
                type="radio"
                name="closeAction"
                checked={(draft.widget.closeAction ?? (draft.widget.closeToWidget ? 'widget' : 'tray')) === opt.value}
                onChange={() => patchWidget({ closeAction: opt.value })}
                className="w-3.5 h-3.5 text-sp-accent focus:ring-sp-accent"
              />
              <div>
                <span className="text-xs font-medium text-sp-text">{opt.label}</span>
                <p className="text-[10px] text-sp-muted">{opt.desc}</p>
              </div>
            </label>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-sp-text">위젯 표시 모드</span>
            <span className="text-xs text-sp-muted">
              {draft.widget.desktopMode === 'normal' && '일반: 다른 창에 가려질 수 있습니다. Win+D를 눌러도 사라지지 않습니다.'}
              {draft.widget.desktopMode === 'topmost' && '항상 위에: 항상 다른 창 위에 표시됩니다. Win+D를 눌러도 사라지지 않습니다.'}
            </span>
          </div>
          <select
            value={draft.widget.desktopMode}
            onChange={(e) => patchWidget({ desktopMode: e.target.value as WidgetDesktopMode })}
            className="bg-sp-card border border-sp-border rounded-lg px-3 py-1.5 text-sm text-sp-text focus:outline-none focus:ring-1 focus:ring-sp-accent"
          >
            <option value="normal">일반</option>
            <option value="topmost">항상 위에</option>
          </select>
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
