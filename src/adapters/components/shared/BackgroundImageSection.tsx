import type { BackgroundImageFit } from '@domain/entities/Settings';
import { SelectRow, SliderRow } from './StyleControls';

interface BackgroundImageSectionProps {
  value: string | null;
  opacity: number;
  /** 없으면 기존 동작인 'cover'. 이 값이 없는 기존 저장 설정이 있어 optional 이다. */
  fit?: BackgroundImageFit;
  onChange: (patch: {
    backgroundImage?: string | null;
    backgroundImageOpacity?: number;
    backgroundImageFit?: BackgroundImageFit;
  }) => void;
  compact?: boolean;
}

const FIT_OPTIONS: { value: BackgroundImageFit; label: string }[] = [
  { value: 'cover', label: '채우기 (잘릴 수 있음)' },
  { value: 'contain', label: '전체 보기 (여백 생김)' },
];

export function BackgroundImageSection({
  value,
  opacity,
  fit,
  onChange,
  compact = false,
}: BackgroundImageSectionProps) {
  const isElectron = !!window.electronAPI?.showOpenDialog;
  const isCustomImage = value !== null && value.startsWith('file://');

  const handlePickImage = async () => {
    if (!window.electronAPI?.showOpenDialog) return;
    const result = await window.electronAPI.showOpenDialog({
      title: '배경 이미지 선택',
      properties: ['openFile'],
      filters: [{ name: '이미지', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
    });
    if (!result.canceled && result.filePaths[0]) {
      const normalized = result.filePaths[0].replace(/\\/g, '/');
      onChange({ backgroundImage: `file:///${normalized}` });
    }
  };

  const thumbSize = compact ? 'h-8' : 'h-14';

  return (
    <div className="space-y-2">
      {/* 이미지 선택 버튼 */}
      <div className="flex items-center gap-2">
        {isCustomImage && (
          <div
            className={`rounded border border-sp-accent/50 overflow-hidden shrink-0 ${compact ? 'w-8 h-8' : 'w-14 h-14'} ${thumbSize}`}
            style={{
              backgroundImage: `url(${value})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
        )}
        {isElectron ? (
          <button
            onClick={handlePickImage}
            className={`flex items-center gap-1.5 rounded-lg border border-dashed border-sp-border/50 hover:border-sp-accent/50 px-3 py-1.5 text-sp-muted hover:text-sp-text transition-colors ${
              compact ? 'text-caption' : 'text-xs'
            } ${isCustomImage ? '' : 'flex-1 justify-center'}`}
          >
            <span className="material-symbols-outlined" style={{ fontSize: compact ? 12 : 14 }}>
              image
            </span>
            {isCustomImage ? '변경' : '이미지 선택'}
          </button>
        ) : (
          <div
            className={`flex items-center gap-1.5 rounded-lg border border-dashed border-sp-border/30 px-3 py-1.5 text-sp-muted/50 ${
              compact ? 'text-caption' : 'text-xs'
            } ${isCustomImage ? '' : 'flex-1 justify-center'}`}
          >
            <span className="material-symbols-outlined" style={{ fontSize: compact ? 12 : 14 }}>
              image
            </span>
            Electron에서만 사용 가능
          </div>
        )}
      </div>

      {/* 맞춤 방식 + 불투명도 + 제거 (선택된 배경이 있을 때만) */}
      {value !== null && (
        <SelectRow
          label="맞춤"
          value={fit ?? 'cover'}
          options={FIT_OPTIONS}
          onChange={(v) => onChange({ backgroundImageFit: v })}
          compact={compact}
        />
      )}

      {value !== null && (
        <div className="flex items-center gap-1">
          <div className="flex-1">
            <SliderRow
              label="투명도"
              min={5}
              max={100}
              step={5}
              value={Math.round(opacity * 100)}
              unit="%"
              onChange={(v) => onChange({ backgroundImageOpacity: v / 100 })}
              compact={compact}
            />
          </div>
          <button
            onClick={() => onChange({ backgroundImage: null })}
            className={`text-sp-muted hover:text-red-400 transition-colors shrink-0 ${compact ? 'text-tiny' : 'text-caption'}`}
          >
            제거
          </button>
        </div>
      )}
    </div>
  );
}
