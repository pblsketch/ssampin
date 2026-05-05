import { useCallback, useEffect, useState } from 'react';
import type { Settings, WidgetSettings, WidgetDesktopMode } from '@domain/entities/Settings';
import { SettingsSection } from '../shared/SettingsSection';
import { Toggle } from '../shared/Toggle';
import { isWindows } from '@adapters/hooks/shortcut/keyNormalize';

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
            { value: 'icon' as const, label: '아이콘 모드로 접기', desc: '화면에 떠 있는 작은 아이콘으로 접습니다 (NEW)' },
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
        <div className="space-y-1.5">
          <span className="text-sm font-medium text-sp-text">위젯 표시 모드</span>
          <p className="text-xs text-sp-muted mb-2">위젯 창이 다른 창과 어떻게 어울릴지 선택합니다.</p>
          {(() => {
            const winSupported = isWindows();
            const opts: Array<{ value: WidgetDesktopMode; label: string; desc: string; winOnly?: boolean }> = [
              {
                value: 'normal',
                label: '일반',
                desc: '다른 창에 가려질 수 있습니다. Win+D를 눌러도 사라지지 않습니다.',
              },
              {
                value: 'topmost',
                label: '항상 위에',
                desc: '항상 다른 창 위에 표시됩니다. Win+D를 눌러도 사라지지 않습니다.',
              },
              {
                value: 'native-desktop',
                label: '바탕화면 아이콘 아래',
                desc: '쌤핀 위젯을 바탕화면 작업판처럼 깔고, 바탕화면 아이콘은 위에서 그대로 클릭ㆍ이동할 수 있습니다. Windows 전용 기능입니다.',
                winOnly: true,
              },
            ];
            return opts.map((opt) => {
              const disabled = opt.winOnly === true && !winSupported;
              const isSelected = draft.widget.desktopMode === opt.value;
              return (
                <label
                  key={opt.value}
                  title={disabled ? 'Windows에서만 사용할 수 있는 기능입니다.' : undefined}
                  className={[
                    'flex items-start gap-3 px-3 py-2 rounded-lg transition-colors',
                    disabled
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:bg-sp-surface/50 cursor-pointer',
                  ].join(' ')}
                >
                  <input
                    type="radio"
                    name="widgetDesktopMode"
                    value={opt.value}
                    checked={isSelected}
                    disabled={disabled}
                    onChange={() => patchWidget({ desktopMode: opt.value })}
                    className="mt-0.5 w-3.5 h-3.5 text-sp-accent focus:ring-sp-accent"
                  />
                  <div className="flex-1">
                    <span className="text-xs font-medium text-sp-text">
                      {opt.label}
                      {opt.winOnly && (
                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded bg-sp-accent/15 text-sp-accent text-[10px] font-semibold">
                          Windows
                        </span>
                      )}
                      {opt.value === 'native-desktop' && (
                        <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 text-[10px] font-semibold">
                          NEW
                        </span>
                      )}
                    </span>
                    <p className="text-caption text-sp-muted mt-0.5 leading-relaxed">{opt.desc}</p>
                  </div>
                </label>
              );
            });
          })()}
          {draft.widget.desktopMode === 'native-desktop' && (
            <div className="mt-2 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20">
              <p className="text-xs text-amber-300/90 leading-relaxed">
                <span className="material-symbols-outlined text-icon-sm align-middle mr-1">info</span>
                이 모드는 바탕화면 아이콘과 함께 동작하기 위해 Windows 바탕화면 창 계층과 마우스 이벤트를 제어합니다. 일부 보안 프로그램에서 민감하게 볼 수 있으며, 문제가 있으면 일반 모드로 되돌릴 수 있습니다.
              </p>
            </div>
          )}
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
