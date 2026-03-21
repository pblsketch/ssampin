import { useState } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import type { FolderZone, FolderZoneColor } from '@domain/entities/FolderZone';
import { ZONE_COLORS, DEFAULT_FOLDER_ZONES } from '@domain/entities/FolderZone';

const COLOR_LIST: FolderZoneColor[] = ['red', 'yellow', 'blue', 'green', 'purple', 'orange', 'teal', 'gray'];

export function FolderZoneWidget() {
  const zones = useSettingsStore((s) => s.settings.folderZones) ?? DEFAULT_FOLDER_ZONES;
  const update = useSettingsStore((s) => s.update);
  const [editMode, setEditMode] = useState(false);
  const [addModal, setAddModal] = useState(false);

  const addZone = (name: string, color: FolderZoneColor) => {
    if (zones.length >= 6) return;
    const newZone: FolderZone = {
      id: `fz-${Date.now()}`,
      name,
      color,
    };
    void update({ folderZones: [...zones, newZone] });
  };

  const deleteZone = (id: string) => {
    void update({ folderZones: zones.filter((z) => z.id !== id) });
  };

  const updateZone = (id: string, patch: Partial<FolderZone>) => {
    void update({
      folderZones: zones.map((z) => z.id === id ? { ...z, ...patch } : z),
    });
  };

  return (
    <div
      className="h-full flex flex-col gap-2"
      style={{ pointerEvents: editMode ? 'auto' : 'none' }}
    >
      {/* 헤더 — 편집 버튼만 클릭 가능 */}
      <div className="flex items-center justify-between" style={{ pointerEvents: 'auto' }}>
        <span className="text-[10px] font-bold text-sp-muted/50 select-none">📂 폴더 정리</span>
        <button
          data-clickable
          onClick={() => setEditMode(!editMode)}
          className="text-sp-muted/40 hover:text-sp-text transition-colors p-0.5 rounded hover:scale-110"
          title={editMode ? '편집 완료' : '영역 편집'}
        >
          {editMode ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          )}
        </button>
      </div>

      {/* 영역 그리드 */}
      <div className="flex-1 grid gap-2" style={{
        gridTemplateColumns: zones.length <= 2 ? '1fr' : 'repeat(2, 1fr)',
        gridTemplateRows: zones.length <= 2
          ? `repeat(${zones.length}, 1fr)`
          : `repeat(${Math.ceil(zones.length / 2)}, 1fr)`,
      }}>
        {zones.map((zone) => {
          const colors = ZONE_COLORS[zone.color];
          return (
            <div
              key={zone.id}
              className="rounded-xl relative"
              style={{
                background: colors.bg,
                border: `1px solid ${colors.border}`,
                pointerEvents: editMode ? 'auto' : 'none',
              }}
            >
              {/* 라벨 */}
              <div
                className="absolute top-2 left-3 text-[10px] font-bold select-none"
                style={{ color: colors.label, opacity: 0.8 }}
              >
                {zone.name}
              </div>

              {/* 편집 모드: 삭제/색상 변경 */}
              {editMode && (
                <div className="absolute top-1.5 right-2 flex gap-1">
                  <button
                    onClick={() => {
                      const currentIdx = COLOR_LIST.indexOf(zone.color);
                      const nextColor = COLOR_LIST[(currentIdx + 1) % COLOR_LIST.length]!;
                      updateZone(zone.id, { color: nextColor });
                    }}
                    className="w-4 h-4 rounded-full transition-transform hover:scale-125"
                    style={{ background: colors.label, opacity: 0.6 }}
                    title="색상 변경"
                  />
                  <button
                    onClick={() => deleteZone(zone.id)}
                    className="text-[10px] text-red-400/60 hover:text-red-400 transition-colors"
                    title="삭제"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {/* 편집 모드: 추가 버튼 */}
        {editMode && zones.length < 6 && (
          <button
            onClick={() => setAddModal(true)}
            className="rounded-xl border border-dashed border-sp-border/30 flex items-center justify-center text-sp-muted/30 hover:text-sp-muted/60 hover:border-sp-border/50 transition-colors"
          >
            <span className="text-xl">+</span>
          </button>
        )}
      </div>

      {/* 추가 모달 */}
      {addModal && (
        <ZoneAddModal
          onAdd={(name, color) => { addZone(name, color); setAddModal(false); }}
          onClose={() => setAddModal(false)}
        />
      )}
    </div>
  );
}

/** 영역 추가 모달 */
function ZoneAddModal({
  onAdd,
  onClose,
}: {
  onAdd: (name: string, color: FolderZoneColor) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState<FolderZoneColor>('blue');

  return (
    <div
      className="absolute inset-0 flex items-center justify-center z-50"
      style={{ pointerEvents: 'auto', background: 'rgba(0,0,0,0.5)' }}
    >
      <div className="bg-sp-card border border-sp-border rounded-xl p-4 w-56 shadow-xl">
        <h4 className="text-xs font-bold text-sp-text mb-2">영역 추가</h4>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="이름 (예: 긴급)"
          className="w-full bg-sp-bg border border-sp-border rounded-lg px-3 py-1.5 text-xs text-sp-text placeholder:text-sp-muted focus:outline-none focus:border-sp-accent mb-2"
          autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) onAdd(name.trim(), color); }}
        />
        <div className="flex gap-1.5 mb-3">
          {COLOR_LIST.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className="w-5 h-5 rounded-full transition-transform"
              style={{
                background: ZONE_COLORS[c].label,
                transform: color === c ? 'scale(1.3)' : 'scale(1)',
                border: color === c ? '2px solid white' : '2px solid transparent',
              }}
            />
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { if (name.trim()) onAdd(name.trim(), color); }}
            className="flex-1 text-xs bg-sp-accent text-white rounded-lg py-1.5 disabled:opacity-40"
            disabled={!name.trim()}
          >
            추가
          </button>
          <button
            onClick={onClose}
            className="flex-1 text-xs bg-sp-border text-sp-muted rounded-lg py-1.5"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
