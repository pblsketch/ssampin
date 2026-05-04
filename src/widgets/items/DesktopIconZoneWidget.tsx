import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import {
  DEFAULT_DESKTOP_ICON_ZONE_PRESET,
  normalizeDesktopIconZones,
  type DesktopIconZoneSettings,
  type WidgetDesktopMode,
} from '@domain/entities/Settings';

/**
 * 바탕화면 작업판 위젯 카드 (v2.1.0~ Windows 전용, Phase 2.3).
 *
 * 핵심 동작 (Phase 2.3 일체화):
 *   - 카드 슬롯이 곧 zone 영역. 카드 본문 좌표를 IPC 로 main 에 보내면 별도
 *     `desktopZoneWindow` (WorkerW attach 된 transparent fullscreen) 가 동일 위치에
 *     점선 zone 카드를 그려, 시각적으로 위젯 카드와 zoneWindow 가 일체화된다.
 *   - 카드 본문에 마우스가 진입하면 `widget:setClickThrough(true)` 를 호출 →
 *     widgetWindow.setIgnoreMouseEvents(true, {forward: true}) 적용 → 카드 영역의
 *     클릭이 데스크톱(Explorer ListView)으로 통과되어 바탕화면 아이콘 드래그 가능.
 *   - 카드를 벗어나면 false 호출 → 일반 위젯 모드 복귀, 다른 위젯 카드는 영향 없음.
 */
export function DesktopIconZoneWidget() {
  const { settings, update } = useSettingsStore();
  const isWindows =
    typeof navigator !== 'undefined' && /Win/i.test(navigator.platform);
  const isActive = settings.widget.desktopMode === 'native-desktop';
  const zones = useMemo<DesktopIconZoneSettings[]>(
    () => normalizeDesktopIconZones(settings.widget.desktopIconZones ?? []),
    [settings.widget.desktopIconZones],
  );
  const enabledZones = useMemo(
    () => zones.filter((z) => z.enabled),
    [zones],
  );

  const cellRefs = useRef(new Map<string, HTMLDivElement>());
  const lastSentSerializedRef = useRef<string>('');
  const setCellRef = useCallback((id: string) => (el: HTMLDivElement | null) => {
    if (el) cellRefs.current.set(id, el);
    else cellRefs.current.delete(id);
  }, []);

  // 카드 본문 좌표 측정 + IPC 송신.
  // physical screen px = (window.screenX + rect.left) * devicePixelRatio.
  // Electron BrowserWindow 에서 DIP 와 CSS px 는 1:1, devicePixelRatio = display scaleFactor.
  const measureAndSend = useCallback(() => {
    const api = window.electronAPI?.desktopIconZones;
    if (!api?.updateBounds) return;
    if (!isActive || enabledZones.length === 0) {
      void api.updateBounds([]);
      lastSentSerializedRef.current = '[]';
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    const screenX = window.screenX;
    const screenY = window.screenY;
    const out: Array<{
      id: string;
      name: string;
      rect: { x: number; y: number; width: number; height: number };
    }> = [];
    for (const zone of enabledZones) {
      const el = cellRefs.current.get(zone.id);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      out.push({
        id: zone.id,
        name: zone.name,
        rect: {
          x: Math.round((screenX + rect.left) * dpr),
          y: Math.round((screenY + rect.top) * dpr),
          width: Math.round(rect.width * dpr),
          height: Math.round(rect.height * dpr),
        },
      });
    }
    const serialized = JSON.stringify(out);
    if (serialized === lastSentSerializedRef.current) return;
    lastSentSerializedRef.current = serialized;
    void api.updateBounds(out);
  }, [isActive, enabledZones]);

  // 30Hz 폴링 + ResizeObserver — 위젯 이동/리사이즈 추종.
  useEffect(() => {
    if (!isActive) return;
    let raf = 0;
    const schedule = (): void => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        measureAndSend();
      });
    };
    const ro = new ResizeObserver(schedule);
    cellRefs.current.forEach((el) => ro.observe(el));
    const interval = window.setInterval(schedule, 33);
    schedule();
    return () => {
      ro.disconnect();
      window.clearInterval(interval);
      if (raf) cancelAnimationFrame(raf);
      // unmount 시 정리: zoneWindow 카드 제거 + click-through 해제
      const api = window.electronAPI?.desktopIconZones;
      if (api?.clearBounds) void api.clearBounds();
      if (api?.setWidgetClickThrough) void api.setWidgetClickThrough(false);
      lastSentSerializedRef.current = '';
    };
  }, [isActive, measureAndSend]);

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
    const api = window.electronAPI?.desktopIconZones;
    if (api?.setWidgetClickThrough) void api.setWidgetClickThrough(false);
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

  // Active 상태: 카드 슬롯을 가로 grid 로 분할해 각 zone 셀 렌더링.
  // 셀 본문은 transparent + pointer-events 가 mouse 진입 시에만 click-through 로 토글.
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
              ref={setCellRef(z.id)}
              className="rounded-xl bg-transparent"
              onMouseEnter={() => {
                const api = window.electronAPI?.desktopIconZones;
                if (api?.setWidgetClickThrough) void api.setWidgetClickThrough(true);
              }}
              onMouseLeave={() => {
                const api = window.electronAPI?.desktopIconZones;
                if (api?.setWidgetClickThrough) void api.setWidgetClickThrough(false);
              }}
              title={z.name}
            />
          ))
        )}
      </div>
    </div>
  );
}
