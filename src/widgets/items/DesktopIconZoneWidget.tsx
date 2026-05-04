import { useMemo } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import {
  DEFAULT_DESKTOP_ICON_ZONE_PRESET,
  normalizeDesktopIconZones,
  type WidgetDesktopMode,
} from '@domain/entities/Settings';

/**
 * 바탕화면 작업판 위젯 카드 (v2.1.0~ Windows 전용).
 *
 * 사용자 경험:
 *   - 위젯 카드 토글 ON → 즉시 native-desktop 모드 활성화 + zone 카드 표시
 *   - 토글 OFF → 일반 모드 복귀
 *   - Windows 가 아닐 경우 안내 문구만 표시
 *
 * 본 카드 자체가 zone 영역의 시각화를 담당하며, native-desktop 모드 진입 시
 * `DesktopIconZoneOverlay` (Widget.tsx 의 absolute 오버레이) 가 main 측 mouse hook
 * pass-through 캐시에 카드 영역을 등록한다.
 *
 * Phase 2 정책:
 *   - 카드 헤더(이름) 영역은 클릭 가능 (native mode 에서 PostMessage 라우팅)
 *   - 카드 본문은 pointer-events-none — 바탕화면 아이콘이 시각적으로 위에 떠 있으며,
 *     클릭/드래그가 자연스럽게 Explorer ListView 로 통과된다.
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

  // Active 상태: 카드 zones 미리보기 (실제 pass-through 영역은 DesktopIconZoneOverlay 가 그린다)
  return (
    <div className="h-full p-3 flex flex-col bg-sp-card/40 rounded-xl">
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-1.5">
          <span
            className="material-symbols-outlined text-emerald-400"
            style={{ fontSize: 18 }}
          >
            wallpaper
          </span>
          <span className="text-xs font-medium text-sp-text">바탕화면 작업판</span>
        </div>
        <button
          type="button"
          className="text-xs text-sp-muted hover:text-sp-text transition-colors"
          onClick={handleDeactivate}
          title="일반 위젯 모드로 되돌리기"
        >
          끄기
        </button>
      </div>
      <div className="flex-1 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.max(zones.length, 1)}, minmax(0, 1fr))` }}>
        {zones.length === 0 ? (
          <div className="text-xs text-sp-muted italic flex items-center justify-center">
            구역이 없습니다
          </div>
        ) : (
          zones.map((z) => (
            <div
              key={z.id}
              className="flex flex-col items-center justify-center text-center rounded-lg bg-sp-card/60 border border-dashed border-sp-border p-2"
              title={z.name}
            >
              <span className="text-[10px] text-sp-muted truncate w-full">{z.name}</span>
            </div>
          ))
        )}
      </div>
      <p className="text-[10px] text-sp-muted/60 mt-2 px-1 leading-tight">
        실제 카드는 위젯 하단 오버레이로 표시되며, 위 항목은 미리보기입니다.
      </p>
    </div>
  );
}
