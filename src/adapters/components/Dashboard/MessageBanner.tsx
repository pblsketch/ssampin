import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useMessageStore } from '@adapters/stores/useMessageStore';
import {
  MESSAGE_COLOR_MAP,
  DEFAULT_MESSAGE_STYLE,
  type MessageIcon,
  type MessageColorPreset,
  type MessageStyle,
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

function getColors(s: MessageStyle) {
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

function MessageStyleEditor({ style, onUpdate, onClose }: {
  style: MessageStyle;
  onUpdate: (patch: Partial<MessageStyle>) => void;
  onClose: () => void;
}) {
  const [subtitleDraft, setSubtitleDraft] = useState(style.subtitle);

  return (
    <div className="w-72 bg-[#0a0e17] border border-sp-border rounded-xl shadow-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-sp-text">배너 꾸미기</span>
        <button onClick={onClose} className="text-sp-muted hover:text-sp-text">
          <span className="material-symbols-outlined text-sm">close</span>
        </button>
      </div>

      {/* 아이콘 선택 */}
      <div>
        <label className="text-[10px] text-sp-muted uppercase tracking-wider mb-1.5 block">아이콘</label>
        <div className="flex flex-wrap gap-1.5">
          {ICON_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => onUpdate({ icon: opt.id })}
              className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-all ${
                style.icon === opt.id
                  ? 'bg-sp-accent text-sp-accent-fg ring-2 ring-sp-accent scale-110'
                  : 'bg-sp-surface text-sp-muted hover:bg-sp-card'
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

      {/* 색상 선택 */}
      <div>
        <label className="text-[10px] text-sp-muted uppercase tracking-wider mb-1.5 block">색상</label>
        <div className="flex flex-wrap gap-1.5">
          {COLOR_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => onUpdate({ colorPreset: opt.id })}
              className={`w-8 h-8 rounded-full border-2 transition-all ${
                style.colorPreset === opt.id
                  ? 'border-white scale-110 ring-2 ring-white/30'
                  : 'border-transparent hover:border-sp-border'
              }`}
              style={{ background: opt.sample }}
              title={opt.label}
            />
          ))}
          <div className="relative">
            <input
              type="color"
              value={style.customColor ?? '#3b82f6'}
              onChange={(e) => onUpdate({ colorPreset: 'custom', customColor: e.target.value })}
              className="w-8 h-8 rounded-full cursor-pointer border-2 border-dashed border-sp-border"
              title="직접 선택"
            />
          </div>
        </div>
      </div>

      {/* 부제목 */}
      <div>
        <label className="text-[10px] text-sp-muted uppercase tracking-wider mb-1.5 block">부제목</label>
        <input
          type="text"
          value={subtitleDraft}
          onChange={(e) => setSubtitleDraft(e.target.value)}
          onBlur={() => onUpdate({ subtitle: subtitleDraft.trim() })}
          onKeyDown={(e) => { if (e.key === 'Enter') onUpdate({ subtitle: subtitleDraft.trim() }); }}
          placeholder="예: 오늘도 힘내자! 💪"
          className="w-full bg-sp-surface border border-sp-border rounded-lg px-3 py-1.5 text-xs text-sp-text focus:outline-none focus:border-sp-accent"
        />
      </div>

      {/* 초기화 */}
      <button
        onClick={() => onUpdate({ icon: 'verified', colorPreset: 'emerald', subtitle: '', customColor: undefined })}
        className="w-full py-1.5 text-[10px] rounded-lg border border-sp-border text-sp-muted hover:text-sp-text transition-colors"
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
  const paletteRef = useRef<HTMLButtonElement>(null);
  const [editorPos, setEditorPos] = useState<{ top: number; left: number } | null>(null);

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
          ref={paletteRef}
          onClick={(e) => {
            e.stopPropagation();
            setShowStyleEditor((v) => {
              if (!v && paletteRef.current) {
                const rect = paletteRef.current.getBoundingClientRect();
                setEditorPos({ top: rect.bottom + 8, left: Math.max(8, rect.right - 288) });
              }
              return !v;
            });
          }}
          className="shrink-0 rounded-lg p-1.5 transition-colors hover:bg-white/10"
          style={{ color: colors.text }}
          title="배너 꾸미기"
        >
          <span className="material-symbols-outlined text-lg">palette</span>
        </button>
      </div>

      {/* 스타일 편집 드롭다운 (portal로 overflow-hidden 회피) */}
      {showStyleEditor && editorPos && createPortal(
        <div ref={editorRef} className="fixed z-[200]" style={{ top: editorPos.top, left: editorPos.left }}>
          <MessageStyleEditor
            style={s}
            onUpdate={(patch) => void setStyle(patch)}
            onClose={() => setShowStyleEditor(false)}
          />
        </div>,
        document.body,
      )}
    </div>
  );
}
