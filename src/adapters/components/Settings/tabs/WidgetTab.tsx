import { useCallback, useEffect, useState } from 'react';
import type { Settings, WidgetSettings, WidgetDesktopMode } from '@domain/entities/Settings';
import { SettingsSection } from '../shared/SettingsSection';
import { Toggle } from '../shared/Toggle';

interface Props {
  draft: Settings;
  patch: (p: Partial<Settings>) => void;
}

interface MemoryMetrics {
  totalBytes: number;
  processes: Array<{ type: string; pid: number; memoryBytes: number; name?: string }>;
}

function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

function useMemoryMetrics(enabled: boolean): MemoryMetrics | null {
  const [metrics, setMetrics] = useState<MemoryMetrics | null>(null);
  useEffect(() => {
    if (!enabled || !window.electronAPI?.getMemoryMetrics) return undefined;
    let cancelled = false;
    const fetchMetrics = () => {
      window.electronAPI?.getMemoryMetrics?.().then((m) => {
        if (!cancelled) setMetrics(m);
      }).catch(() => { /* ignore */ });
    };
    fetchMetrics();
    const timerId = window.setInterval(fetchMetrics, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timerId);
    };
  }, [enabled]);
  return metrics;
}

export function WidgetTab({ draft, patch }: Props) {
  const patchWidget = useCallback((p: Partial<WidgetSettings>) => {
    patch({ widget: { ...draft.widget, ...p } });
  }, [draft.widget, patch]);

  const [showMemory, setShowMemory] = useState(false);
  const metrics = useMemoryMetrics(showMemory);

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
                <p className="text-caption text-sp-muted">{opt.desc}</p>
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
        <div className="flex items-center justify-between pt-4 border-t border-sp-border">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-sp-text">메모리 절약 모드</span>
            <span className="text-xs text-sp-muted leading-relaxed">
              위젯으로 전환할 때 메인 창을 완전히 해제해 메모리 사용량을 줄입니다.
              <br />
              메인으로 돌아올 때 첫 화면 로드가 약간 느려질 수 있습니다. (저사양 PC 권장)
            </span>
          </div>
          <Toggle
            checked={draft.widget.memorySaverMode ?? false}
            onChange={(v) => patchWidget({ memorySaverMode: v })}
          />
        </div>
        <div className="pt-4 border-t border-sp-border">
          <button
            type="button"
            onClick={() => setShowMemory((v) => !v)}
            className="flex items-center gap-2 text-sm text-sp-accent hover:text-sp-accent/80 transition-colors"
          >
            <span className="material-symbols-outlined text-icon-md">
              {showMemory ? 'expand_less' : 'expand_more'}
            </span>
            메모리 사용량 진단 {showMemory ? '숨기기' : '보기'}
          </button>
          {showMemory && (
            <div className="mt-3 rounded-lg bg-sp-surface p-3 space-y-2">
              {!window.electronAPI?.getMemoryMetrics ? (
                <p className="text-xs text-sp-muted">개발 모드(브라우저)에서는 사용할 수 없습니다.</p>
              ) : metrics === null ? (
                <p className="text-xs text-sp-muted">측정 중…</p>
              ) : (
                <>
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-sp-muted">전체 사용량</span>
                    <span className="text-base font-bold text-sp-text">{formatMB(metrics.totalBytes)}</span>
                  </div>
                  <div className="text-xs text-sp-muted">
                    프로세스 {metrics.processes.length}개 (메인 + 렌더러 + GPU 등)
                  </div>
                  <ul className="mt-2 space-y-1 max-h-48 overflow-y-auto pr-1">
                    {[...metrics.processes]
                      .sort((a, b) => b.memoryBytes - a.memoryBytes)
                      .map((p) => (
                        <li key={p.pid} className="flex items-center justify-between text-detail text-sp-muted">
                          <span className="truncate">
                            {p.type}
                            {p.name ? ` · ${p.name}` : ''}
                            <span className="text-sp-muted/60"> (pid {p.pid})</span>
                          </span>
                          <span className="font-mono text-sp-text shrink-0 ml-2">{formatMB(p.memoryBytes)}</span>
                        </li>
                      ))}
                  </ul>
                  <p className="text-caption text-sp-muted/70 pt-1">3초마다 갱신됩니다.</p>
                </>
              )}
            </div>
          )}
        </div>
        <div className="pt-4 border-t border-sp-border">
          <p className="text-sm font-medium text-sp-text mb-1">위젯 표시 항목</p>
          <p className="text-xs text-sp-muted">위젯 모드는 대시보드 화면의 카드 설정을 그대로 따릅니다. 대시보드 편집 모드에서 카드를 추가/제거하세요.</p>
        </div>
      </div>
    </SettingsSection>
  );
}
