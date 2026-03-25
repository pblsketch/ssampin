import { useState, useEffect, useCallback } from 'react';
import { FONT_PRESETS, FONT_CATEGORIES } from '@domain/entities/FontPreset';
import type { FontPreset, FontCategory } from '@domain/entities/FontPreset';
import type { FontFamily, CustomFontSettings } from '@domain/entities/Settings';

interface Props {
  value: FontFamily;
  onChange: (font: FontFamily) => void;
  customFont?: CustomFontSettings;
  onCustomFontChange?: (font: CustomFontSettings | undefined) => void;
}

/** MIME 타입 → CSS format() 값 */
function getFontFormat(mimeType: string): string {
  switch (mimeType) {
    case 'font/woff2': return 'woff2';
    case 'font/woff': return 'woff';
    case 'font/ttf':
    case 'application/x-font-ttf': return 'truetype';
    case 'font/otf':
    case 'application/x-font-opentype': return 'opentype';
    default: return 'woff2';
  }
}

const PRESET_FONTS = FONT_PRESETS.filter((f) => f.id !== 'custom');

export function FontSelector({ value, onChange, customFont, onCustomFontChange }: Props) {
  const [categoryFilter, setCategoryFilter] = useState<FontCategory | 'all'>('all');
  const [expandedId, setExpandedId] = useState<FontFamily | null>(value);

  useEffect(() => { setExpandedId(value); }, [value]);

  // 확장된 항목의 폰트만 동적 로드 (미리보기용)
  useEffect(() => {
    if (!expandedId || expandedId === 'noto-sans' || expandedId === 'custom') return;

    const font = PRESET_FONTS.find((f) => f.id === expandedId);
    if (!font) return;

    const url = font.googleFontsUrl ?? font.cdnUrl;

    // customCss가 있는 폰트 처리
    if (font.customCss && !document.querySelector(`style[data-ssp-font-preview="${font.id}"]`)) {
      const style = document.createElement('style');
      style.dataset.sspFontPreview = font.id;
      style.textContent = font.customCss;
      document.head.appendChild(style);
    }

    // URL 기반 폰트 처리
    if (url && !document.querySelector(`link[href="${url}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      link.dataset.sspFontPreview = font.id;
      document.head.appendChild(link);
    }
  }, [expandedId]);

  // 커스텀 폰트 미리보기용 @font-face
  useEffect(() => {
    if (!customFont?.dataUrl) return;
    const styleId = 'ssp-custom-font-preview';
    let style = document.querySelector(`#${styleId}`) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }
    const fmt = getFontFormat(customFont.mimeType);
    style.textContent = `
      @font-face {
        font-family: 'SsampinCustomFontPreview';
        src: url('${customFont.dataUrl}') format('${fmt}');
        font-weight: 400;
        font-display: swap;
      }
    `;
  }, [customFont?.dataUrl, customFont?.mimeType]);

  const filtered = categoryFilter === 'all'
    ? PRESET_FONTS
    : PRESET_FONTS.filter((f) => f.category === categoryFilter);

  const handleUploadFont = useCallback(async () => {
    const api = window.electronAPI;

    let fileName = '';
    let dataUrl = '';
    let mimeType = '';

    if (api?.importFont) {
      // Electron: 전용 IPC (10MB 제한, base64)
      const result = await api.importFont();
      if (!result) return;
      fileName = result.name;
      dataUrl = result.dataUrl;
      mimeType = result.mimeType;
    } else {
      // 브라우저 폴백
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.woff2,.woff,.ttf,.otf';

      const selected = await new Promise<File | null>((resolve) => {
        input.onchange = () => resolve(input.files?.[0] ?? null);
        input.click();
      });

      if (!selected) return;
      fileName = selected.name;

      // 10MB 제한
      if (selected.size > 10 * 1024 * 1024) {
        alert('폰트 파일은 10MB 이하만 지원합니다.');
        return;
      }

      // File → dataURL
      dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(selected);
      });

      const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
      const mimeMap: Record<string, string> = {
        woff2: 'font/woff2',
        woff: 'font/woff',
        ttf: 'font/ttf',
        otf: 'font/otf',
      };
      mimeType = mimeMap[ext] ?? 'font/woff2';
    }

    // 폰트 이름: 파일명에서 확장자 제거
    const defaultName = fileName.replace(/\.[^.]+$/, '');
    const fontName = prompt('폰트 이름을 입력하세요:', defaultName);
    if (!fontName?.trim()) return;

    const newCustomFont: CustomFontSettings = {
      name: fontName.trim(),
      dataUrl,
      fileName,
      mimeType,
      cssFamilyName: 'SsampinCustomFont',
    };

    onCustomFontChange?.(newCustomFont);
    onChange('custom');
  }, [onChange, onCustomFontChange]);

  const handleRemoveCustomFont = useCallback(() => {
    onCustomFontChange?.(undefined);
    if (value === 'custom') {
      onChange('noto-sans');
    }
    // 동적 @font-face 제거
    document.querySelector('#ssp-custom-font')?.remove();
    document.querySelector('#ssp-custom-font-preview')?.remove();
  }, [value, onChange, onCustomFontChange]);

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold text-sp-muted uppercase tracking-wider">
        글꼴 (Font)
      </h4>

      {/* 카테고리 필터 탭 */}
      <div className="flex bg-sp-surface/80 p-1 rounded-lg border border-sp-border">
        <CategoryTab
          label="전체"
          count={PRESET_FONTS.length}
          active={categoryFilter === 'all'}
          onClick={() => setCategoryFilter('all')}
        />
        {FONT_CATEGORIES.map((cat) => (
          <CategoryTab
            key={cat.id}
            label={cat.label}
            count={PRESET_FONTS.filter((f) => f.category === cat.id).length}
            active={categoryFilter === cat.id}
            onClick={() => setCategoryFilter(cat.id)}
          />
        ))}
      </div>

      {/* 폰트 리스트 */}
      <div className="space-y-1.5">
        {filtered.map((font) => (
          <FontListItem
            key={font.id}
            font={font}
            isSelected={value === font.id}
            isExpanded={expandedId === font.id}
            onSelect={() => onChange(font.id)}
            onToggleExpand={() => setExpandedId(expandedId === font.id ? null : font.id)}
          />
        ))}
      </div>

      {/* 내 폰트 업로드 섹션 */}
      <div className="border-t border-sp-border/30 pt-3 mt-3">
        <p className="text-xs text-sp-muted mb-2 font-medium">내 폰트</p>

        {customFont ? (
          <div className="flex items-center gap-2 mb-2">
            <button
              type="button"
              onClick={() => onChange('custom')}
              className={`flex-1 px-3 py-2.5 rounded-xl text-left transition-all border-2 ${
                value === 'custom'
                  ? 'border-sp-accent bg-sp-accent/5'
                  : 'border-sp-border hover:border-sp-muted/50'
              }`}
            >
              <div
                className="text-sm font-bold text-sp-text truncate"
                style={{ fontFamily: "'SsampinCustomFontPreview', 'SsampinCustomFont', sans-serif" }}
              >
                {customFont.name}
              </div>
              <div className="text-[10px] text-sp-muted mt-0.5">{customFont.fileName}</div>
            </button>
            <button
              type="button"
              onClick={handleRemoveCustomFont}
              className="text-sp-muted hover:text-red-400 p-1.5 transition-colors"
              title="삭제"
            >
              <span className="material-symbols-outlined text-icon">delete</span>
            </button>
          </div>
        ) : null}

        <button
          type="button"
          onClick={handleUploadFont}
          className="w-full py-2.5 rounded-xl border-2 border-dashed border-sp-border text-xs text-sp-muted hover:text-sp-accent hover:border-sp-accent transition-colors flex items-center justify-center gap-1.5"
        >
          <span className="material-symbols-outlined text-icon-sm">upload_file</span>
          {customFont ? '폰트 변경' : '폰트 파일 업로드 (.woff2, .ttf, .otf)'}
        </button>
      </div>
    </div>
  );
}

function CategoryTab({ label, count, active, onClick }: {
  label: string; count: number; active: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 py-2 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
        active
          ? 'bg-sp-accent text-white shadow-md'
          : 'text-sp-muted hover:text-sp-text hover:bg-sp-text/5'
      }`}
    >
      {label}
      <span className={`text-caption px-1.5 py-0.5 rounded-full ${
        active ? 'bg-white/20' : 'bg-sp-border/50'
      }`}>
        {count}
      </span>
    </button>
  );
}

function FontListItem({ font, isSelected, isExpanded, onSelect, onToggleExpand }: {
  font: FontPreset;
  isSelected: boolean;
  isExpanded: boolean;
  onSelect: () => void;
  onToggleExpand: () => void;
}) {
  return (
    <div
      className={`rounded-xl border-2 overflow-hidden transition-all ${
        isSelected
          ? 'border-sp-accent bg-sp-accent/5'
          : 'border-sp-border hover:border-sp-muted/50'
      }`}
    >
      {/* 헤더 행 */}
      <button
        type="button"
        onClick={onSelect}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        {/* 라디오 인디케이터 */}
        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
          isSelected ? 'border-sp-accent bg-sp-accent' : 'border-sp-border'
        }`}>
          {isSelected && (
            <span className="material-symbols-outlined text-white text-icon-sm">check</span>
          )}
        </div>

        {/* 폰트명 (해당 폰트로 렌더링) */}
        <span
          className="text-sm font-bold text-sp-text flex-1 truncate"
          style={{ fontFamily: font.cssFamily }}
        >
          {font.name}
        </span>

        {/* 설명 */}
        <span className="text-xs text-sp-muted shrink-0 hidden sm:inline">{font.description}</span>

        {/* NEW 뱃지 */}
        {font.isNew && (
          <span className="text-caption font-bold text-sp-accent bg-sp-accent/10 px-1.5 py-0.5 rounded-full shrink-0">
            NEW
          </span>
        )}

        {/* 확장 토글 */}
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onToggleExpand(); } }}
          className="text-sp-muted hover:text-sp-text transition-colors shrink-0 cursor-pointer"
        >
          <span className={`material-symbols-outlined text-icon-md transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
            expand_more
          </span>
        </span>
      </button>

      {/* 확장 미리보기 */}
      {isExpanded && (
        <div
          className="px-4 pb-4 pt-1 border-t border-sp-border/50 space-y-2"
          style={{ fontFamily: font.cssFamily }}
        >
          <p className="text-2xl text-sp-text leading-relaxed">
            가나다라마바사 아자차카타파하
          </p>
          <p className="text-base text-sp-text">
            ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789
          </p>
          <p className="text-sm text-sp-muted leading-relaxed">
            선생님, 오늘 수업은 프로젝트 학습입니다. 모둠별로 주제를 정해서 탐구해봅시다.
            The quick brown fox jumps over the lazy dog.
          </p>
          <div className="flex items-center gap-3 pt-2">
            <span className="text-caption text-sp-muted uppercase tracking-wider">Weight</span>
            <div className="flex gap-1 flex-wrap">
              {font.weights.map((w) => (
                <span
                  key={w}
                  className="text-caption px-1.5 py-0.5 rounded bg-sp-surface text-sp-muted"
                  style={{ fontFamily: font.cssFamily, fontWeight: w }}
                >
                  {w}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
