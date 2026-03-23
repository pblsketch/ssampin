import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { useMessageStore } from '@adapters/stores/useMessageStore';
import {
  MESSAGE_COLOR_MAP,
  DEFAULT_MESSAGE_STYLE,
  type MessageIcon,
  type MessageColorPreset,
  type MessageStyle,
  type MessageColorOverrides,
} from '@domain/entities/Message';

const ICON_OPTIONS: { id: MessageIcon; label: string }[] = [
  { id: 'verified', label: '✅' },
  { id: 'star', label: '⭐' },
  { id: 'favorite', label: '❤️' },
  { id: 'campaign', label: '📢' },
  { id: 'celebration', label: '🎉' },
  { id: 'school', label: '🏫' },
  { id: 'emoji_objects', label: '💡' },
  { id: 'warning', label: '⚠️' },
  { id: 'info', label: 'ℹ️' },
  { id: 'mood', label: '😊' },
  { id: 'auto_stories', label: '📖' },
  { id: 'psychiatry', label: '🌿' },
  { id: 'none', label: '없음' },
];

const COLOR_OPTIONS: { id: MessageColorPreset; label: string; sample: string }[] = [
  { id: 'emerald', label: '에메랄드', sample: '#10b981' },
  { id: 'blue', label: '파랑', sample: '#3b82f6' },
  { id: 'purple', label: '보라', sample: '#8b5cf6' },
  { id: 'amber', label: '노랑', sample: '#f59e0b' },
  { id: 'rose', label: '분홍', sample: '#f43f5e' },
  { id: 'slate', label: '회색', sample: '#64748b' },
  { id: 'teal', label: '청록', sample: '#14b8a6' },
];

function getBaseColors(s: MessageStyle) {
  if (s.colorPreset !== 'custom') {
    return MESSAGE_COLOR_MAP[s.colorPreset];
  }
  const c = s.customColor ?? '#3b82f6';
  return {
    bg: `${c}1a`,
    border: `${c}33`,
    icon: c,
    text: c,
    sub: `${c}cc`,
  };
}

function getColors(s: MessageStyle) {
  const base = getBaseColors(s);
  if (!s.overrides) return base;
  return {
    bg: s.overrides.bg ?? base.bg,
    border: s.overrides.border ?? base.border,
    icon: s.overrides.icon ?? base.icon,
    text: s.overrides.text ?? base.text,
    sub: s.overrides.sub ?? base.sub,
  };
}

const ELEMENT_LABELS: { key: keyof MessageColorOverrides; label: string }[] = [
  { key: 'bg', label: '배경' },
  { key: 'border', label: '테두리' },
  { key: 'icon', label: '아이콘' },
  { key: 'text', label: '텍스트' },
  { key: 'sub', label: '부제목' },
];

/** rgba/hex 색상을 #hex로 근사 변환 (color picker에 넣기 위함) */
function toHex(color: string): string {
  if (color.startsWith('#') && !color.includes('a') && !color.includes('A') && color.length <= 7) return color;
  // rgba → hex 근사
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) {
    const [, r, g, b] = m;
    return `#${[r, g, b].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`;
  }
  // hex with alpha suffix → strip alpha
  if (color.startsWith('#') && color.length > 7) return color.slice(0, 7);
  return color;
}

function MessageStyleEditor({ style, onUpdate, onClose }: {
  style: MessageStyle;
  onUpdate: (patch: Partial<MessageStyle>) => void;
  onClose: () => void;
}) {
  const [subtitleDraft, setSubtitleDraft] = useState(style.subtitle);
  const currentColors = getColors(style);
  const hasOverrides = style.overrides && Object.keys(style.overrides).length > 0;

  function updateOverride(key: keyof MessageColorOverrides, value: string) {
    onUpdate({ overrides: { ...style.overrides, [key]: value } });
  }

  function clearOverride(key: keyof MessageColorOverrides) {
    if (!style.overrides) return;
    const next = { ...style.overrides };
    delete (next as Record<string, unknown>)[key];
    onUpdate({ overrides: Object.keys(next).length > 0 ? next : undefined });
  }

  return (
    <div className="absolute top-full right-0 mt-2 w-80 bg-[#0a0e17] border border-white/10 rounded-xl shadow-2xl p-4 z-50 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-gray-100">배너 꾸미기</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-100">
          <span className="material-symbols-outlined text-sm">close</span>
        </button>
      </div>

      {/* 아이콘 선택 */}
      <div>
        <label className="text-[10px] text-gray-400 uppercase tracking-wider mb-1.5 block">아이콘</label>
        <div className="flex flex-wrap gap-1.5">
          {ICON_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => onUpdate({ icon: opt.id })}
              className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-all ${
                style.icon === opt.id
                  ? 'bg-blue-500 text-white ring-2 ring-blue-400 scale-110'
                  : 'bg-white/10 text-gray-300 hover:bg-white/20'
              }`}
              title={opt.id}
            >
              {opt.id !== 'none' ? (
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>{opt.id}</span>
              ) : (
                <span className="text-[10px]">✕</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 기본 색상 프리셋 */}
      <div>
        <label className="text-[10px] text-gray-400 uppercase tracking-wider mb-1.5 block">기본 색상</label>
        <div className="flex flex-wrap gap-1.5">
          {COLOR_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => onUpdate({ colorPreset: opt.id, overrides: undefined })}
              className={`w-8 h-8 rounded-full border-2 transition-all ${
                style.colorPreset === opt.id && !hasOverrides
                  ? 'border-white scale-110 ring-2 ring-white/30'
                  : 'border-transparent hover:border-white/30'
              }`}
              style={{ background: opt.sample }}
              title={opt.label}
            />
          ))}
          <div className="relative">
            <input
              type="color"
              value={style.customColor ?? '#3b82f6'}
              onChange={(e) => onUpdate({ colorPreset: 'custom', customColor: e.target.value, overrides: undefined })}
              className="w-8 h-8 rounded-full cursor-pointer border-2 border-dashed border-white/20"
              title="직접 선택"
            />
          </div>
        </div>
      </div>

      {/* 요소별 색상 커스터마이징 */}
      <div>
        <label className="text-[10px] text-gray-400 uppercase tracking-wider mb-1.5 block">요소별 색상</label>
        <div className="grid grid-cols-5 gap-1.5">
          {ELEMENT_LABELS.map(({ key, label }) => {
            const isOverridden = style.overrides?.[key] != null;
            return (
              <div key={key} className="flex flex-col items-center gap-1">
                <div className="relative">
                  <input
                    type="color"
                    value={toHex(currentColors[key])}
                    onChange={(e) => updateOverride(key, e.target.value)}
                    className={`w-9 h-9 rounded-lg cursor-pointer border-2 transition-all ${
                      isOverridden ? 'border-blue-400 ring-1 ring-blue-400/50' : 'border-white/20'
                    }`}
                    title={`${label} 색상 변경`}
                  />
                  {isOverridden && (
                    <button
                      onClick={() => clearOverride(key)}
                      className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-blue-500 text-white rounded-full flex items-center justify-center text-[8px] leading-none hover:brightness-110"
                      title="프리셋 색상으로 되돌리기"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <span className="text-[9px] text-gray-400">{label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 부제목 */}
      <div>
        <label className="text-[10px] text-gray-400 uppercase tracking-wider mb-1.5 block">부제목</label>
        <input
          type="text"
          value={subtitleDraft}
          onChange={(e) => setSubtitleDraft(e.target.value)}
          onBlur={() => onUpdate({ subtitle: subtitleDraft.trim() })}
          onKeyDown={(e) => { if (e.key === 'Enter') onUpdate({ subtitle: subtitleDraft.trim() }); }}
          placeholder="예: 오늘도 힘내자! 💪"
          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-xs text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-blue-400"
        />
      </div>

      {/* 초기화 */}
      <button
        onClick={() => onUpdate({ icon: 'verified', colorPreset: 'emerald', subtitle: '', customColor: undefined, overrides: undefined })}
        className="w-full py-1.5 text-[10px] rounded-lg border border-white/20 text-gray-400 hover:text-gray-100 transition-colors"
      >
        기본으로 초기화
      </button>
    </div>
  );
}

export function MessageBanner() {
  const { message, style, setMessage, setStyle } = useMessageStore();
  const [isEditing, setIsEditing] = useState(false);
  const [showStyleEditor, setShowStyleEditor] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  const s = { ...DEFAULT_MESSAGE_STYLE, ...style };
  const colors = getColors(s);

  function startEdit() {
    setDraft(message);
    setIsEditing(true);
  }

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  useEffect(() => {
    if (!showStyleEditor) return;
    function handleClick(e: MouseEvent) {
      if (editorRef.current && !editorRef.current.contains(e.target as Node)) {
        setShowStyleEditor(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showStyleEditor]);

  async function confirmEdit() {
    await setMessage(draft.trim());
    setIsEditing(false);
  }

  function cancelEdit() {
    setIsEditing(false);
    setDraft('');
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') void confirmEdit();
    else if (e.key === 'Escape') cancelEdit();
  }

  return (
    <div className="relative">
      <div
        className="rounded-xl p-4 flex items-center gap-4 max-w-2xl w-full cursor-pointer border transition-colors"
        style={{ background: colors.bg, borderColor: colors.border }}
        onClick={!isEditing ? startEdit : undefined}
        role={!isEditing ? 'button' : undefined}
        tabIndex={!isEditing ? 0 : undefined}
        onKeyDown={
          !isEditing
            ? (e) => { if (e.key === 'Enter' || e.key === ' ') startEdit(); }
            : undefined
        }
        aria-label={!isEditing ? '메시지 편집' : undefined}
      >
        {/* 아이콘 */}
        {s.icon !== 'none' && (
          <div
            className="rounded-full p-2 text-white flex shrink-0"
            style={{ background: colors.icon }}
          >
            <span className="material-symbols-outlined text-xl">{s.icon}</span>
          </div>
        )}

        {/* 텍스트 영역 */}
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => void confirmEdit()}
              placeholder="오늘의 메시지를 입력하세요..."
              className="w-full bg-transparent font-bold text-lg outline-none"
              style={{ color: colors.text }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <>
              <h3 className="font-bold text-lg leading-snug" style={{ color: colors.text }}>
                {message !== '' ? message : '클릭하여 메시지를 입력하세요...'}
              </h3>
              {(message === '' || s.subtitle) && (
                <p className="text-sm mt-0.5" style={{ color: colors.sub }}>
                  {s.subtitle || '오늘의 한마디를 남겨보세요'}
                </p>
              )}
            </>
          )}
        </div>

        {/* 스타일 편집 버튼 */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowStyleEditor((v) => !v);
          }}
          className="shrink-0 rounded-lg p-1.5 transition-colors hover:bg-white/10"
          style={{ color: colors.text }}
          title="배너 꾸미기"
        >
          <span className="material-symbols-outlined text-lg">palette</span>
        </button>
      </div>

      {/* 스타일 편집 드롭다운 */}
      {showStyleEditor && (
        <div ref={editorRef}>
          <MessageStyleEditor
            style={s}
            onUpdate={(patch) => void setStyle(patch)}
            onClose={() => setShowStyleEditor(false)}
          />
        </div>
      )}
    </div>
  );
}
