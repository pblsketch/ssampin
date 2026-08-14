import { useCallback, useEffect, useState } from 'react';
import type { Settings, WidgetSettings, WidgetDesktopMode } from '@domain/entities/Settings';
import { SettingsSection } from '../shared/SettingsSection';
import { Toggle } from '../shared/Toggle';
import { isWindows } from '@adapters/hooks/shortcut/keyNormalize';
import { useFirstRunModeCoachTour } from '@adapters/hooks/useFirstRunModeCoachTour';
import { useToastStore } from '@adapters/components/common/Toast';
import { PIN_NAME } from '@adapters/components/Icon/pinName';
import { GLASS_PRESETS, matchGlassPreset } from '@domain/rules/glassSurface';

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
      window.electronAPI
        ?.getMemoryMetrics?.()
        .then((m) => {
          if (!cancelled) setMetrics(m);
        })
        .catch(() => {
          /* ignore */
        });
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
  const patchWidget = useCallback(
    (p: Partial<WidgetSettings>) => {
      patch({ widget: { ...draft.widget, ...p } });
    },
    [draft.widget, patch],
  );

  // 지금 값이 어느 단계인지. 막대로 직접 조절한 상태면 null 이라 "직접 조절"로 표시된다 —
  // 미세 조정한 사용자를 억지로 3단계 중 하나로 밀어 넣지 않는다.
  const currentGlassLevel = matchGlassPreset({
    bgOpacity: draft.widget.opacity ?? 1,
    cardOpacity: draft.widget.cardOpacity ?? 1,
    blur: draft.widget.blur ?? 0,
  });

  // 어두운 테마에서만 유리 설정을 보여준다. `theme-dark` 는 useThemeApplier 가 테마
  // 배경색의 밝기를 보고 붙이는 클래스라, "어두운 테마인가"의 단일 기준이다.
  const isDarkTheme =
    typeof document !== 'undefined' && document.documentElement.classList.contains('theme-dark');

  const [showMemory, setShowMemory] = useState(false);
  const metrics = useMemoryMetrics(showMemory);
  const coachTour = useFirstRunModeCoachTour();
  const showToast = useToastStore((s) => s.show);

  // widget-mode-discovery — 모드 옵션 메타 (페이지 최상단 승격용)
  const winSupported = isWindows();
  const modeOpts: Array<{
    value: WidgetDesktopMode;
    label: string;
    desc: string;
    preview: string;
    winOnly?: boolean;
  }> = [
    {
      value: 'normal',
      label: '일반',
      desc: '다른 창에 가려질 수 있습니다. Win+D를 눌러도 사라지지 않습니다.',
      preview: 'mode-preview/normal.svg',
    },
    {
      value: 'topmost',
      label: '항상 위에',
      desc: '항상 다른 창 위에 표시됩니다. Win+D를 눌러도 사라지지 않습니다.',
      preview: 'mode-preview/topmost.svg',
    },
    {
      value: 'native-desktop',
      label: '바탕화면 아이콘 아래',
      desc: '쌤핀 위젯을 바탕화면 작업판처럼 깔고, 바탕화면 아이콘은 위에서 그대로 클릭·이동할 수 있습니다. Windows 전용 기능입니다.',
      preview: 'mode-preview/native-desktop.svg',
      winOnly: true,
    },
  ];

  return (
    <SettingsSection icon="widgets" iconColor="bg-indigo-500/10 text-indigo-400" title="위젯 설정">
      <div className="space-y-6">
        {/* widget-mode-discovery — "위젯 표시 모드" 섹션을 페이지 최상단으로 승격 */}
        <div className="space-y-1.5" data-testid="settings-mode-section">
          <span className="text-sm font-medium text-sp-text">위젯 표시 모드</span>
          <p className="text-xs text-sp-muted mb-2">
            위젯 창이 다른 창과 어떻게 어울릴지 선택합니다.
          </p>
          {modeOpts.map((opt) => {
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
                <img
                  src={opt.preview}
                  alt=""
                  width={48}
                  height={32}
                  className="flex-shrink-0 rounded opacity-80 mt-0.5"
                  aria-hidden="true"
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
          })}
          {draft.widget.desktopMode === 'native-desktop' && (
            <div className="mt-2 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20">
              <p className="text-xs text-amber-300/90 leading-relaxed">
                <span className="material-symbols-outlined text-icon-sm align-middle mr-1">
                  info
                </span>
                이 모드는 바탕화면 아이콘과 함께 동작하기 위해 Windows 바탕화면 창 계층과 마우스
                이벤트를 제어합니다. 일부 보안 프로그램에서 민감하게 볼 수 있으며, 문제가 있으면
                일반 모드로 되돌릴 수 있습니다.
              </p>
              {/*
                고착 상태 탈출구(2026-08-11 사용자 신고 대응).
                이 모드가 이미 선택돼 있으면 라디오를 눌러도 변경 이벤트가 발생하지 않아
                재시도가 불가능했다. 저장을 거치지 않고 바로 다시 붙이기를 요청한다.
              */}
              <button
                type="button"
                onClick={() => {
                  void window.electronAPI?.applyWidgetSettings({
                    opacity: draft.widget.opacity,
                    desktopMode: 'native-desktop',
                  });
                  showToast(
                    '바탕화면에 다시 붙이는 중입니다. 실패하면 위젯 화면에 원인 안내가 표시됩니다.',
                    'info',
                  );
                }}
                className="mt-2 px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-300 text-xs font-medium hover:bg-amber-500/25 transition-colors"
                data-testid="settings-native-desktop-reapply"
              >
                <span
                  className="material-symbols-outlined align-middle mr-1"
                  style={{ fontSize: 14 }}
                >
                  refresh
                </span>
                지금 다시 적용
              </button>
            </div>
          )}
          {/* 아이콘 모드 승격 카드 (v2.2.7) — 기존에는 '창 닫기 동작' 옵션 안에만 숨어
              있어 사용자가 "화면 모드"로 인지할 수 없었다. 표시 모드 섹션에서 함께 소개. */}
          <div
            className="mt-3 px-3 py-2.5 rounded-lg bg-sp-surface/50 border border-sp-border"
            data-testid="settings-icon-mode-card"
          >
            <div className="flex items-start gap-3">
              <span
                className="material-symbols-outlined text-sp-accent mt-0.5"
                style={{ fontSize: 20 }}
              >
                push_pin
              </span>
              <div className="flex-1">
                <span className="text-xs font-medium text-sp-text">
                  아이콘 모드 — 핀 캐릭터 {PIN_NAME}
                  <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 text-[10px] font-semibold">
                    NEW
                  </span>
                </span>
                <p className="text-caption text-sp-muted mt-0.5 leading-relaxed">
                  화면 위에 떠 있는 작은 핀 캐릭터가 수업 시작 전·급식·할 일 마감을 말풍선으로 먼저
                  알려줍니다. 핀을 클릭하면 오늘 요약(수업·할 일·빠른 추가)이 그 자리에서 열려요.
                  아래 &lsquo;창 닫기 동작&rsquo;을 &lsquo;아이콘 모드로 접기&rsquo;로 두면 X 버튼
                  한 번으로 접힙니다.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    void window.electronAPI?.iconShow();
                  }}
                  className="mt-1.5 px-2.5 py-1 rounded-lg bg-sp-accent text-white text-xs font-medium hover:opacity-90 transition-opacity"
                  data-testid="settings-icon-mode-try"
                >
                  지금 아이콘 모드로 접기
                </button>
              </div>
            </div>
          </div>
          {/* 모드 가이드 다시 보기 — settings.widget.modeTour.shown=false reset → 다음 위젯 모드 진입에서 표시 */}
          <button
            type="button"
            className="mt-2 text-xs text-sp-accent hover:text-sp-accent/80 underline-offset-2 hover:underline"
            onClick={() => {
              void coachTour.reset();
              showToast('모드 가이드가 다음 위젯 모드 진입 시 다시 표시됩니다.', 'success');
            }}
            data-testid="settings-mode-tour-reset"
          >
            <span className="material-symbols-outlined align-middle mr-1" style={{ fontSize: 14 }}>
              help
            </span>
            모드 가이드 다시 보기
          </button>
        </div>

        {/*
          유리 효과 — 투명도·흐림·배경을 한 번에 정하는 3단계.
          아래 막대들은 세부 조정용으로 남긴다. 대부분의 사용자는 여기서 끝나고,
          더 만지고 싶은 사람만 막대를 쓴다.

          밝은 테마에서는 보여주지 않는다. 밝은 테마는 카드가 거의 흰색이라 뒤가 밝으면
          "흰색 위에 흰색"이 되어 아무리 투명도를 낮춰도 유리로 보이지 않는다(실측).
          되지도 않는 설정을 켜게 두면 "켰는데 왜 그대로죠?" 가 된다.
        */}
        {isDarkTheme && (
          <div className="space-y-3 pt-4 border-t border-sp-border">
            <div className="flex justify-between">
              <span className="text-sm font-medium text-sp-text">유리 효과</span>
              <span className="text-sm font-bold text-sp-accent">
                {currentGlassLevel === 'none'
                  ? '없음'
                  : currentGlassLevel === 'soft'
                    ? '약하게'
                    : currentGlassLevel === 'strong'
                      ? '강하게'
                      : '직접 조절'}
              </span>
            </div>
            <p className="text-xs text-sp-muted">
              앱 뒤에 은은한 배경을 깔고 카드가 비쳐 보이게 합니다. 시간표·출결처럼 빽빽한 표는 읽기
              편하도록 그대로 둡니다.
            </p>
            <div className="flex gap-2">
              {(
                [
                  { level: 'none', label: '없음' },
                  { level: 'soft', label: '약하게' },
                  { level: 'strong', label: '강하게' },
                ] as const
              ).map(({ level, label }) => (
                <button
                  key={level}
                  onClick={() =>
                    patchWidget({
                      opacity: GLASS_PRESETS[level].bgOpacity,
                      cardOpacity: GLASS_PRESETS[level].cardOpacity,
                      blur: GLASS_PRESETS[level].blur,
                      backdrop: level === 'none' ? 'none' : 'generated',
                    })
                  }
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                    currentGlassLevel === level
                      ? 'bg-sp-accent text-sp-accent-fg border-sp-accent font-medium'
                      : 'border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3 pt-4 border-t border-sp-border">
          <div className="flex justify-between">
            <span className="text-sm font-medium text-sp-text">배경 투명도</span>
            <span className="text-sm font-bold text-sp-accent">
              {Math.round((draft.widget.opacity ?? 1) * 100)}%
            </span>
          </div>
          {/*
            widget.opacity는 위젯 카드 배경의 CSS rgba alpha로만 사용된다(OS BrowserWindow.setOpacity는
            영구 차단). 0%여도 BrowserWindow 자체는 100% 유지 → 텍스트는 항상 가시.
            스타일 탭(WidgetSettingsPanel·DisplayTab)의 동일 슬라이더가 min={0}이므로 통일.
          */}
          <p className="text-xs text-sp-muted">
            위젯 모드·옆핀·대시보드에 함께 적용됩니다. 옆핀은 펼친 뒤 머리말의 조절 버튼에서 바로
            맞출 수도 있습니다.
          </p>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round((draft.widget.opacity ?? 1) * 100)}
            onChange={(e) => patchWidget({ opacity: Number(e.target.value) / 100 })}
            className="w-full h-2 bg-sp-border rounded-full appearance-none cursor-pointer accent-sp-accent"
          />
        </div>
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-sm font-medium text-sp-text">카드 배경 투명도</span>
            <span className="text-sm font-bold text-sp-accent">
              {Math.round((draft.widget.cardOpacity ?? 1) * 100)}%
            </span>
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
        {/*
          옆핀 전용 투명도 막대가 여기 따로 있었는데 없앴다. 위 두 막대가 위젯 모드·옆핀·
          대시보드에 모두 적용된다 — 설정을 하나로 합치기로 했다.
          자리마다 뒤에 있는 것이 달라(바탕화면 위 / 창 안) 같은 값이 같은 인상을 주지
          않으므로, 자리별 환산은 domain/rules/glassSurface.ts 가 맡는다.
        */}
        <div className="space-y-1.5">
          <span className="text-sm font-medium text-sp-text">창 닫기 동작</span>
          <p className="text-xs text-sp-muted mb-2">X 버튼을 누를 때의 동작을 선택합니다.</p>
          {[
            {
              value: 'widget' as const,
              label: '위젯 모드로 전환',
              desc: '작은 위젯 창으로 전환합니다',
            },
            {
              value: 'sidePin' as const,
              label: '옆핀으로 접기',
              desc: '화면 오른쪽 가장자리에 접어 둡니다 (마우스를 올리면 펼쳐집니다)',
            },
            {
              value: 'icon' as const,
              label: '아이콘 모드로 접기',
              desc: '화면에 떠 있는 작은 아이콘으로 접습니다 (NEW)',
            },
            { value: 'tray' as const, label: '트레이로 최소화', desc: '시스템 트레이로 숨깁니다' },
            {
              value: 'quit' as const,
              label: '완전히 종료',
              desc: '앱을 완전히 끕니다 (알림·자동 동기화도 함께 멈춥니다)',
            },
            { value: 'ask' as const, label: '매번 물어보기', desc: '닫을 때마다 선택합니다' },
          ].map((opt) => (
            <label
              key={opt.value}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-sp-surface/50 cursor-pointer transition-colors"
            >
              <input
                type="radio"
                name="closeAction"
                checked={
                  (draft.widget.closeAction ?? (draft.widget.closeToWidget ? 'widget' : 'tray')) ===
                  opt.value
                }
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
        <div className="flex items-center justify-between pt-4 border-t border-sp-border">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-sp-text">시작 시 위젯 모드</span>
            <span className="text-xs text-sp-muted">
              앱 실행 시 전체화면 대신 위젯으로 시작합니다.
            </span>
          </div>
          <Toggle
            checked={draft.widget.transparent}
            onChange={(v) => patchWidget({ transparent: v })}
          />
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
                <p className="text-xs text-sp-muted">
                  개발 모드(브라우저)에서는 사용할 수 없습니다.
                </p>
              ) : metrics === null ? (
                <p className="text-xs text-sp-muted">측정 중…</p>
              ) : (
                <>
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-sp-muted">전체 사용량</span>
                    <span className="text-base font-bold text-sp-text">
                      {formatMB(metrics.totalBytes)}
                    </span>
                  </div>
                  <div className="text-xs text-sp-muted">
                    프로세스 {metrics.processes.length}개 (메인 + 렌더러 + GPU 등)
                  </div>
                  <ul className="mt-2 space-y-1 max-h-48 overflow-y-auto pr-1">
                    {[...metrics.processes]
                      .sort((a, b) => b.memoryBytes - a.memoryBytes)
                      .map((p) => (
                        <li
                          key={p.pid}
                          className="flex items-center justify-between text-detail text-sp-muted"
                        >
                          <span className="truncate">
                            {p.type}
                            {p.name ? ` · ${p.name}` : ''}
                            <span className="text-sp-muted/60"> (pid {p.pid})</span>
                          </span>
                          <span className="font-mono text-sp-text shrink-0 ml-2">
                            {formatMB(p.memoryBytes)}
                          </span>
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
          <p className="text-xs text-sp-muted">
            위젯 모드는 대시보드 화면의 카드 설정을 그대로 따릅니다. 대시보드 편집 모드에서 카드를
            추가/제거하세요.
          </p>
        </div>
      </div>
    </SettingsSection>
  );
}
