import { useEffect, useState, useCallback } from 'react';
import { useImageWidgetStore } from '@adapters/stores/useImageWidgetStore';
import {
  ASPECT_RATIO_LABELS,
  FIT_MODE_LABELS,
  type ImageAspectRatio,
  type ImageFitMode,
  type ImageWidgetData,
} from '@domain/entities/ImageWidget';

/** 공유 콘텐츠 컴포넌트 — widgetId별로 독립 동작 */
function ImageStickerContent({ widgetId }: { widgetId: string }) {
  const { load, loaded, setImage, updateSettings, removeImage } = useImageWidgetStore();
  const data = useImageWidgetStore((s) => s.widgets[widgetId]);
  const widgetData: ImageWidgetData = data ?? { imageUrl: null, aspectRatio: 'free', fitMode: 'cover', borderRadius: 8, showBorder: false };
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSelectImage = useCallback(async () => {
    const api = (window as unknown as Record<string, unknown>).electronAPI as {
      showOpenDialog?: (opts: unknown) => Promise<{ canceled: boolean; filePaths: string[] }>;
      readFileAsDataUrl?: (path: string) => Promise<string>;
    } | undefined;

    if (api?.showOpenDialog) {
      // Electron: 파일 선택 다이얼로그
      const result = await api.showOpenDialog({
        title: '이미지 선택',
        filters: [
          { name: '이미지', extensions: ['jpg', 'jpeg', 'png', 'svg', 'webp', 'gif'] },
        ],
        properties: ['openFile'],
      });
      if (result.canceled || !result.filePaths[0]) return;

      const filePath = result.filePaths[0];
      const fileName = filePath.split(/[/\\]/).pop() ?? 'image';

      // readFileAsDataUrl이 있으면 base64로, 없으면 file:// URL
      if (api.readFileAsDataUrl) {
        const dataUrl = await api.readFileAsDataUrl(filePath);
        void setImage(widgetId, dataUrl, fileName);
      } else {
        void setImage(widgetId, `file://${filePath}`, fileName);
      }
      return;
    }

    // 브라우저 폴백: input[type=file]
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/svg+xml,image/webp,image/gif';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        void setImage(widgetId, reader.result as string, file.name);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }, [widgetId, setImage]);

  if (!loaded) return null;

  // 이미지 없음 → 업로드 안내
  if (!widgetData.imageUrl) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-4">
        <button
          onClick={() => void handleSelectImage()}
          className="flex flex-col items-center gap-3 text-sp-muted hover:text-sp-accent transition-colors cursor-pointer"
        >
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-60">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="m21 15-5-5L5 21" />
          </svg>
          <span className="text-sm font-medium">이미지 추가</span>
          <span className="text-[10px]">클릭하여 이미지를 선택하세요</span>
        </button>
      </div>
    );
  }

  // 비율 스타일
  const aspectStyle: React.CSSProperties = {};
  if (widgetData.aspectRatio !== 'free') {
    const [w, h] = widgetData.aspectRatio.split(':').map(Number);
    if (w && h) aspectStyle.aspectRatio = `${w}/${h}`;
  }

  return (
    <div className="h-full flex flex-col overflow-hidden group/img relative">
      <div
        className="flex-1 min-h-0 overflow-hidden"
        style={{
          borderRadius: `${widgetData.borderRadius}px`,
          border: widgetData.showBorder ? '1px solid var(--sp-border)' : 'none',
          ...aspectStyle,
        }}
      >
        <img
          src={widgetData.imageUrl}
          alt={widgetData.caption ?? widgetData.fileName ?? '이미지'}
          className="w-full h-full"
          style={{ objectFit: widgetData.fitMode }}
          draggable={false}
        />
      </div>

      {/* 캡션 */}
      {widgetData.caption && (
        <p className="text-center text-xs text-sp-muted py-1 truncate px-2">
          {widgetData.caption}
        </p>
      )}

      {/* 호버 시 오버레이 */}
      <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/30 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover/img:opacity-100">
        <button
          onClick={() => void handleSelectImage()}
          className="bg-white/90 text-gray-700 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-white transition-colors"
        >
          변경
        </button>
        <button
          onClick={() => setShowSettings(true)}
          className="bg-white/90 text-gray-700 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-white transition-colors"
        >
          설정
        </button>
        <button
          onClick={() => void removeImage(widgetId)}
          className="bg-white/90 text-red-500 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-white transition-colors"
        >
          삭제
        </button>
      </div>

      {/* 설정 팝오버 */}
      {showSettings && (
        <ImageSettingsPopover
          data={widgetData}
          onUpdate={(patch) => void updateSettings(widgetId, patch)}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

/** 이미지 설정 팝오버 */
function ImageSettingsPopover({
  data,
  onUpdate,
  onClose,
}: {
  data: ImageWidgetData;
  onUpdate: (patch: Partial<ImageWidgetData>) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="absolute top-2 right-2 w-56 bg-sp-bg border border-sp-border rounded-xl shadow-xl p-3 z-10 space-y-3"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-sp-text">이미지 설정</span>
        <button onClick={onClose} className="text-sp-muted hover:text-sp-text text-lg leading-none">
          &times;
        </button>
      </div>

      {/* 비율 */}
      <div>
        <label className="text-[10px] text-sp-muted mb-1 block">비율</label>
        <select
          value={data.aspectRatio}
          onChange={(e) => onUpdate({ aspectRatio: e.target.value as ImageAspectRatio })}
          className="w-full bg-sp-surface border border-sp-border rounded-lg px-2 py-1 text-[11px] text-sp-text"
        >
          {Object.entries(ASPECT_RATIO_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* 표시 모드 */}
      <div>
        <label className="text-[10px] text-sp-muted mb-1 block">표시 모드</label>
        <select
          value={data.fitMode}
          onChange={(e) => onUpdate({ fitMode: e.target.value as ImageFitMode })}
          className="w-full bg-sp-surface border border-sp-border rounded-lg px-2 py-1 text-[11px] text-sp-text"
        >
          {Object.entries(FIT_MODE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* 라운드 */}
      <div>
        <label className="text-[10px] text-sp-muted mb-1 block">둥글기 {data.borderRadius}px</label>
        <input
          type="range" min={0} max={24} step={2}
          value={data.borderRadius}
          onChange={(e) => onUpdate({ borderRadius: Number(e.target.value) })}
          className="w-full accent-sp-accent"
        />
      </div>

      {/* 테두리 */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-sp-muted">테두리</span>
        <button
          onClick={() => onUpdate({ showBorder: !data.showBorder })}
          className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
            data.showBorder ? 'bg-sp-accent' : 'bg-sp-border'
          }`}
        >
          <span className={`inline-block h-2.5 w-2.5 rounded-full bg-white transition-transform ${
            data.showBorder ? 'translate-x-3.5' : 'translate-x-0.5'
          }`} />
        </button>
      </div>

      {/* 캡션 */}
      <div>
        <label className="text-[10px] text-sp-muted mb-1 block">캡션</label>
        <input
          type="text"
          value={data.caption ?? ''}
          onChange={(e) => onUpdate({ caption: e.target.value || undefined })}
          placeholder="예: 우리 반 단체 사진"
          className="w-full bg-sp-surface border border-sp-border rounded-lg px-2 py-1 text-[11px] text-sp-text placeholder:text-sp-muted/50"
        />
      </div>
    </div>
  );
}

// ─── 개별 인스턴스 내보내기 (위젯 시스템이 props 없이 렌더링) ───

export function ImageSticker1() { return <ImageStickerContent widgetId="image-sticker-1" />; }
export function ImageSticker2() { return <ImageStickerContent widgetId="image-sticker-2" />; }
export function ImageSticker3() { return <ImageStickerContent widgetId="image-sticker-3" />; }
export function ImageSticker4() { return <ImageStickerContent widgetId="image-sticker-4" />; }
