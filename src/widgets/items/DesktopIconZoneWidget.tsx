import { useMemo } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import {
  DEFAULT_DESKTOP_ICON_ZONE_PRESET,
  normalizeDesktopIconZones,
  type WidgetDesktopMode,
} from '@domain/entities/Settings';

/**
 * 바탕화면 작업판 위젯 카드 (v2.1.0~ Phase 3.0).
 *
 * Phase 3.0 동작:
 *   - 카드 자체는 zone 표시 placeholder. 실제 마법은 main 측 WH_MOUSE_LL hook 이
 *     LVM_HITTEST 로 폴더 위 클릭은 explorer 양보, 빈 영역은 PostMessage 로 위젯에
 *     전달하는 방식으로 처리한다.
 *   - 사용자 시점: 위젯이 WorkerW 자식으로 attach 된 상태에서, 카드 영역에 폴더가
 *     떠 있으면 폴더가 시각적으로 카드 위에 보이고 폴더 클릭/드래그 정상 동작.
 *   - 카드 슬롯이 곧 zone — 별도 좌표 IPC 송신 불필요.
 */
export function DesktopIconZoneWidget() {
  const { settings, update } = useSettingsStore();
  const isWindows =
    typeof navigator !== 'undefined' && /Win/i.test(navigator.platform);
  const isActive = settings.widget.desktopMode === 'native-desktop';
  const zones = useMemo(
    () => normalizeDesktopIconZones(settings.widget.desktopIconZones ?? []),
    [settings.widget.desktopIconZones],
  );
  const enabledZones = zones.filter((z) => z.enabled);

  if (!isWindows) {
    return (
      <div className="h-full p-4 flex flex-col items-center justify-center text-center bg-sp-card/50 rounded-xl">
        <span
          className="material-symbols-outlined text-sp-muted mb-2"
          style={{ fontSize: 32 }}
        >
          desktop_windows
        </span>
        <p className="text-sm text-sp-muted">바탕화면 작업판은 Windows 전용입니다.</p>
      </div>
    );
  }

  const handleActivate = () => {
    const nextMode: WidgetDesktopMode = 'native-desktop';
    const existingZones = settings.widget.desktopIconZones ?? [];
    const shouldSeed = existingZones.length === 0;
    const nextZones = shouldSeed
      ? DEFAULT_DESKTOP_ICON_ZONE_PRESET.map((z) => ({ ...z }))
      : existingZones;
    void update({
      widget: {
        ...settings.widget,
        desktopMode: nextMode,
        desktopIconZones: nextZones,
      },
    });
    void window.electronAPI?.applyWidgetSettings({
      opacity: settings.widget.opacity,
      desktopMode: nextMode,
    });
  };

  const handleDeactivate = () => {
    void update({
      widget: { ...settings.widget, desktopMode: 'normal' },
    });
    void window.electronAPI?.applyWidgetSettings({
      opacity: settings.widget.opacity,
      desktopMode: 'normal',
    });
  };

  if (!isActive) {
    return (
      <div className="h-full p-4 flex flex-col items-center justify-center text-center bg-sp-card/50 rounded-xl border border-dashed border-sp-border">
        <span
          className="material-symbols-outlined text-sp-accent mb-2"
          style={{ fontSize: 32 }}
        >
          wallpaper
        </span>
        <p className="text-sm font-medium text-sp-text mb-1">바탕화면 작업판</p>
        <p className="text-xs text-sp-muted mb-3 leading-relaxed">
          Windows 바탕화면 아이콘을
          <br /> 카드 위에 올려 정리하세요
        </p>
        <button
          type="button"
          className="px-3 py-1.5 rounded-lg bg-sp-accent text-white text-xs font-medium hover:opacity-90 transition-opacity"
          onClick={handleActivate}
        >
          켜기
        </button>
      </div>
    );
  }

  // Active: 카드 슬롯을 가로 grid 로 분할해 각 zone 라벨 + 점선 영역 표시.
  // 본 영역 위에 바탕화면 폴더가 떠 있으면 LVM_HITTEST 가 폴더 클릭을 explorer 로 양보.
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-1.5 px-1">
        <div className="flex items-center gap-1.5">
          <span
            className="material-symbols-outlined text-emerald-400"
            style={{ fontSize: 16 }}
          >
            wallpaper
          </span>
          <span className="text-xs font-medium text-sp-text">바탕화면 작업판</span>
        </div>
        <button
          type="button"
          className="text-xs text-sp-muted hover:text-sp-text transition-colors px-1.5 py-0.5 rounded hover:bg-sp-text/10"
          onClick={handleDeactivate}
          title="일반 위젯 모드로 되돌리기"
        >
          끄기
        </button>
      </div>
      <div
        className="flex-1 grid gap-2 min-h-0"
        style={{
          gridTemplateColumns: `repeat(${Math.max(enabledZones.length, 1)}, minmax(0, 1fr))`,
        }}
      >
        {enabledZones.length === 0 ? (
          <div className="text-xs text-sp-muted italic flex items-center justify-center">
            구역이 없습니다
          </div>
        ) : (
          enabledZones.map((z) => (
            <div
              key={z.id}
              className="rounded-xl border border-dashed border-sp-border/60 bg-sp-card/20 flex flex-col overflow-hidden"
            >
              <div className="px-2 py-1 text-[11px] font-medium text-sp-muted border-b border-sp-border/40 truncate">
                {z.name}
              </div>
              <div className="flex-1 min-h-[40px]" />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
