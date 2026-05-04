import { useCallback, useMemo, useState } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import {
  DEFAULT_DESKTOP_ICON_ZONE_PRESET,
  DESKTOP_ICON_ZONE_LIMITS,
  normalizeDesktopIconZones,
  type DesktopIconZoneSettings,
  type WidgetDesktopMode,
} from '@domain/entities/Settings';
import {
  addDesktopIconZone,
  removeDesktopIconZone,
  renameDesktopIconZone,
} from '@domain/rules/desktopIconZoneRules';

/**
 * 바탕화면 작업대 위젯 카드 (Phase 3.1).
 *
 * - 표시 모드: zones 를 가로 grid 로 표시 + 우상단 ✏️ / 끄기 버튼
 * - 편집 모드: 각 zone 의 이름 인라인 수정 + ✕ 삭제 + 마지막에 + 추가
 * - 변경 즉시 useSettingsStore.update 호출 → main 으로 전파
 *
 * 실제 폴더 hit-test 는 main 측 WH_MOUSE_LL hook + LVM_HITTEST 가 픽셀 단위로 처리.
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
  const enabledZones = useMemo(() => zones.filter((z) => z.enabled), [zones]);
  const [editing, setEditing] = useState(false);

  const persistZones = useCallback(
    (next: DesktopIconZoneSettings[]) => {
      void update({
        widget: { ...settings.widget, desktopIconZones: next },
      });
    },
    [update, settings.widget],
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
        <p className="text-sm text-sp-muted">바탕화면 작업대는 Windows 전용입니다.</p>
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
    setEditing(false);
    void update({
      widget: { ...settings.widget, desktopMode: 'normal' },
    });
    void window.electronAPI?.applyWidgetSettings({
      opacity: settings.widget.opacity,
      desktopMode: 'normal',
    });
  };

  const handleAdd = () => {
    if (zones.length >= DESKTOP_ICON_ZONE_LIMITS.MAX_COUNT) return;
    persistZones(addDesktopIconZone(zones, ''));
  };

  const handleRemove = (id: string) => {
    if (zones.length <= DESKTOP_ICON_ZONE_LIMITS.MIN_COUNT) return;
    persistZones(removeDesktopIconZone(zones, id));
  };

  const handleRename = (id: string, newName: string) => {
    const trimmed = newName.trim();
    if (trimmed.length === 0) return;
    persistZones(renameDesktopIconZone(zones, id, trimmed));
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
        <p className="text-sm font-medium text-sp-text mb-1">바탕화면 작업대</p>
        <p className="text-xs text-sp-muted mb-3 leading-relaxed">
          카테고리별로 바탕화면
          <br /> 아이콘을 분류하세요
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

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-1.5 px-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="material-symbols-outlined text-emerald-400 flex-shrink-0"
            style={{ fontSize: 16 }}
          >
            wallpaper
          </span>
          <span className="text-xs font-medium text-sp-text truncate">바탕화면 작업대</span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            className={[
              'p-1 rounded text-xs transition-colors',
              editing
                ? 'bg-sp-accent text-white'
                : 'text-sp-muted hover:text-sp-text hover:bg-sp-text/10',
            ].join(' ')}
            onClick={() => setEditing((e) => !e)}
            title={editing ? '편집 완료' : '카테고리 편집'}
            aria-label={editing ? '편집 완료' : '카테고리 편집'}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
              {editing ? 'done' : 'edit'}
            </span>
          </button>
          <button
            type="button"
            className="text-xs text-sp-muted hover:text-sp-text transition-colors px-1.5 py-0.5 rounded hover:bg-sp-text/10"
            onClick={handleDeactivate}
            title="일반 위젯 모드로 되돌리기"
          >
            끄기
          </button>
        </div>
      </div>

      {editing ? (
        <EditModeBody
          zones={enabledZones}
          totalCount={zones.length}
          onRename={handleRename}
          onRemove={handleRemove}
          onAdd={handleAdd}
        />
      ) : (
        <DisplayModeBody zones={enabledZones} />
      )}
    </div>
  );
}

interface DisplayModeBodyProps {
  readonly zones: ReadonlyArray<DesktopIconZoneSettings>;
}

function DisplayModeBody({ zones }: DisplayModeBodyProps) {
  if (zones.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-sp-muted italic">
        구역이 없습니다
      </div>
    );
  }
  return (
    <div
      className="flex-1 grid gap-2 min-h-0"
      style={{ gridTemplateColumns: `repeat(${zones.length}, minmax(0, 1fr))` }}
    >
      {zones.map((z) => (
        <div
          key={z.id}
          className="rounded-xl border border-dashed border-sp-border/60 bg-sp-card/20 flex flex-col overflow-hidden"
        >
          <div className="px-2 py-1 text-[11px] font-medium text-sp-muted border-b border-sp-border/40 truncate">
            {z.name}
          </div>
          <div className="flex-1 min-h-[40px]" />
        </div>
      ))}
    </div>
  );
}

interface EditModeBodyProps {
  readonly zones: ReadonlyArray<DesktopIconZoneSettings>;
  readonly totalCount: number;
  readonly onRename: (id: string, name: string) => void;
  readonly onRemove: (id: string) => void;
  readonly onAdd: () => void;
}

function EditModeBody({ zones, totalCount, onRename, onRemove, onAdd }: EditModeBodyProps) {
  const canRemove = totalCount > DESKTOP_ICON_ZONE_LIMITS.MIN_COUNT;
  const canAdd = totalCount < DESKTOP_ICON_ZONE_LIMITS.MAX_COUNT;
  return (
    <div className="flex-1 flex flex-col gap-1.5 overflow-y-auto min-h-0">
      {zones.map((z) => (
        <ZoneEditRow
          key={z.id}
          zone={z}
          canRemove={canRemove}
          onRename={onRename}
          onRemove={onRemove}
        />
      ))}
      <button
        type="button"
        disabled={!canAdd}
        onClick={onAdd}
        className={[
          'flex items-center justify-center gap-1 rounded-lg border border-dashed py-1.5 text-xs transition-colors',
          canAdd
            ? 'border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent hover:bg-sp-accent/5'
            : 'border-sp-border/40 text-sp-muted/40 cursor-not-allowed',
        ].join(' ')}
        title={canAdd ? '카테고리 추가' : `최대 ${DESKTOP_ICON_ZONE_LIMITS.MAX_COUNT}개까지`}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
          add
        </span>
        <span>카테고리 추가 (예: 수업 / 학급 / 업무)</span>
      </button>
    </div>
  );
}

interface ZoneEditRowProps {
  readonly zone: DesktopIconZoneSettings;
  readonly canRemove: boolean;
  readonly onRename: (id: string, name: string) => void;
  readonly onRemove: (id: string) => void;
}

function ZoneEditRow({ zone, canRemove, onRename, onRemove }: ZoneEditRowProps) {
  const [draft, setDraft] = useState(zone.name);
  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== zone.name) {
      onRename(zone.id, trimmed);
    } else if (!trimmed) {
      setDraft(zone.name);
    }
  };
  return (
    <div className="flex items-center gap-1.5 bg-sp-card/30 rounded-lg px-2 py-1">
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setDraft(zone.name);
        }}
        maxLength={DESKTOP_ICON_ZONE_LIMITS.MAX_NAME_LENGTH}
        className="flex-1 min-w-0 bg-transparent border-none text-xs text-sp-text focus:outline-none focus:ring-1 focus:ring-sp-accent rounded px-1.5 py-0.5"
        placeholder="카테고리 이름"
      />
      <button
        type="button"
        disabled={!canRemove}
        onClick={() => onRemove(zone.id)}
        className={[
          'p-1 rounded transition-colors',
          canRemove
            ? 'text-sp-muted hover:text-red-400 hover:bg-red-500/10'
            : 'text-sp-muted/30 cursor-not-allowed',
        ].join(' ')}
        title={canRemove ? '삭제' : `최소 ${DESKTOP_ICON_ZONE_LIMITS.MIN_COUNT}개 필요`}
        aria-label="카테고리 삭제"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
          close
        </span>
      </button>
    </div>
  );
}
