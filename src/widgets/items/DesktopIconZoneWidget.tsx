import { useMemo } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import {
  DEFAULT_DESKTOP_ICON_ZONE_PRESET,
  normalizeDesktopIconZones,
  type WidgetDesktopMode,
} from '@domain/entities/Settings';

/**
 * 바탕화면 작업판 위젯 카드 (v2.1.0~ Windows 전용, Phase 2.2 단순화 버전).
 *
 * Phase 2.2 변경:
 *   - 카드 자체는 더 이상 zone 영역을 직접 표시하지 않는다 (이중 렌더 결함 제거).
 *   - 실제 zone 카드는 별도 `desktopZoneWindow` BrowserWindow 가 가상 데스크톱
 *     전체에 걸쳐 그린다.
 *   - 본 위젯 카드는 켜기/끄기 토글 + zone 라벨 미리보기 + 안내 문구만 담당한다.
 *
 * 사용자 시나리오:
 *   1. 위젯 우클릭 또는 위젯 설정에서 본 카드를 추가
 *   2. "켜기" 클릭 → settings.widget.desktopMode = 'native-desktop' + 프리셋 시드
 *   3. main 프로세스가 desktopZoneWindow 를 빌드 + Explorer WorkerW 에 attach
 *   4. zone 영역(`작업 전 / 작업 중 / 작업 완료`)이 가상 데스크톱 전체에 떠 있으며
 *      바탕화면 아이콘이 영역 위로 자유롭게 드래그됨
 *   5. "끄기" 클릭 또는 모드 전환 시 desktopZoneWindow 파괴 + 일반 모드 복귀
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

  // Active 상태: zones 라벨 미리보기 + "끄기" 버튼.
  // 실제 zone 카드는 별도 desktopZoneWindow 가 가상 데스크톱에 그림.
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
          className="text-xs text-sp-muted hover:text-sp-text transition-colors px-2 py-0.5 rounded hover:bg-sp-text/10"
          onClick={handleDeactivate}
          title="일반 위젯 모드로 되돌리기"
        >
          끄기
        </button>
      </div>
      <div className="flex-1 grid gap-1.5 overflow-hidden" style={{ gridTemplateColumns: `repeat(${Math.max(zones.length, 1)}, minmax(0, 1fr))` }}>
        {zones.length === 0 ? (
          <div className="text-xs text-sp-muted italic flex items-center justify-center">
            구역이 없습니다
          </div>
        ) : (
          zones.map((z) => (
            <div
              key={z.id}
              className="flex items-center justify-center text-center rounded-lg bg-emerald-500/10 border border-emerald-400/30 p-2 min-w-0"
              title={z.name}
            >
              <span className="text-[10px] text-sp-text truncate w-full">{z.name}</span>
            </div>
          ))
        )}
      </div>
      <p className="text-[10px] text-sp-muted/60 mt-2 px-1 leading-tight">
        실제 영역은 바탕화면 위에 표시됩니다.
      </p>
    </div>
  );
}
