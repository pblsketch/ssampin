import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
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

/** hex 색상에서 배너 5색을 도출 */
/** CSS 변수를 직접 사용하여 테마 변경에 자동 반응 */
const THEME_COLORS = {
  bg: 'color-mix(in srgb, var(--sp-accent) 10%, transparent)',
  border: 'color-mix(in srgb, var(--sp-accent) 20%, transparent)',
  icon: 'var(--sp-accent)',
  text: 'var(--sp-accent)',
  sub: 'color-mix(in srgb, var(--sp-accent) 80%, transparent)',
};

function deriveColors(hex: string) {
  return {
    bg: `${hex}1a`,
    border: `${hex}33`,
    icon: hex,
    text: hex,
    sub: `${hex}cc`,
  };
}

function getColors(s: MessageStyle) {
  if (s.colorPreset === 'theme') return THEME_COLORS;
  if (s.colorPreset === 'custom') return deriveColors(s.customColor ?? '#3b82f6');
  return MESSAGE_COLOR_MAP[s.colorPreset];
}

function MessageStyleEditor({ style, onUpdate, onClose }: {
  style: MessageStyle;
  onUpdate: (patch: Partial<MessageStyle>) => void;
  onClose: () => void;
}) {
  const [subtitleDraft, setSubtitleDraft] = useState(style.subtitle);
  const isThemeSync = style.colorPreset === 'theme';

  return (
    <div className="absolute top-full right-0 mt-2 w-72 bg-white border border-gray-200 rounded-xl shadow-2xl p-4 z-50 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-gray-800">배너 꾸미기</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <span className="material-symbols-outlined text-sm">close</span>
        </button>
      </div>

      {/* 아이콘 선택 */}
      <div>
        <label className="text-caption text-gray-500 uppercase tracking-wider mb-1.5 block">아이콘</label>
        <div className="flex flex-wrap gap-1.5">
          {ICON_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => onUpdate({ icon: opt.id })}
              className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-all ${
                style.icon === opt.id
                  ? 'bg-blue-500 text-white ring-2 ring-blue-400 scale-110'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
              title={opt.id}
            >
              {opt.id !== 'none' ? (
                <span className="material-symbols-outlined text-icon">{opt.id}</span>
              ) : (
                <span className="text-caption">✕</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 색상 */}
      <div>
        <label className="text-caption text-gray-500 uppercase tracking-wider mb-1.5 block">색상</label>

        {/* 테마 연동 토글 */}
        <button
          onClick={() => onUpdate({ colorPreset: isThemeSync ? 'emerald' : 'theme' })}
          className={`w-full mb-2.5 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
            isThemeSync
              ? 'bg-blue-50 text-blue-600 border border-blue-200'
              : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100'
          }`}
        >
          <span className="material-symbols-outlined text-icon">
            {isThemeSync ? 'link' : 'link_off'}
          </span>
          위젯 테마 연동
          {isThemeSync && (
            <span className="ml-auto text-caption text-blue-500">활성</span>
          )}
        </button>

        {/* 수동 프리셋 (테마 연동 꺼져 있을 때만 활성) */}
        <div className={`flex flex-wrap gap-1.5 transition-opacity ${isThemeSync ? 'opacity-30 pointer-events-none' : ''}`}>
          {COLOR_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => onUpdate({ colorPreset: opt.id })}
              className={`w-8 h-8 rounded-full border-2 transition-all ${
                style.colorPreset === opt.id
                  ? 'border-gray-800 scale-110 ring-2 ring-gray-300'
                  : 'border-transparent hover:border-gray-300'
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
              className="w-8 h-8 rounded-full cursor-pointer border-2 border-dashed border-gray-300"
              title="직접 선택"
            />
          </div>
        </div>
      </div>

      {/* 부제목 */}
      <div>
        <label className="text-caption text-gray-500 uppercase tracking-wider mb-1.5 block">부제목</label>
        <input
          type="text"
          value={subtitleDraft}
          onChange={(e) => setSubtitleDraft(e.target.value)}
          onBlur={() => onUpdate({ subtitle: subtitleDraft.trim() })}
          onKeyDown={(e) => { if (e.key === 'Enter') onUpdate({ subtitle: subtitleDraft.trim() }); }}
          placeholder="예: 오늘도 힘내자! 💪"
          className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-blue-400"
        />
      </div>

      {/* 초기화 */}
      <button
        onClick={() => onUpdate({ icon: 'verified', colorPreset: 'theme', subtitle: '', customColor: undefined })}
        className="w-full py-1.5 text-caption rounded-lg border border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
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
  const isCollapsed = s.collapsed === true;

  function startEdit() {
    if (isCollapsed) {
      void setStyle({ collapsed: false });
      return;
    }
    setDraft(message);
    setIsEditing(true);
  }

  function toggleCollapsed(e: React.MouseEvent) {
    e.stopPropagation();
    void setStyle({ collapsed: !isCollapsed });
    if (!isCollapsed) {
      setIsEditing(false);
      setShowStyleEditor(false);
    }
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
        className={`rounded-xl flex items-center max-w-2xl w-full cursor-pointer border transition-all ${
          isCollapsed ? 'px-3 py-1.5 gap-2' : 'p-4 gap-4'
        }`}
        style={{ background: colors.bg, borderColor: colors.border }}
        onClick={!isEditing ? startEdit : undefined}
        role={!isEditing ? 'button' : undefined}
        tabIndex={!isEditing ? 0 : undefined}
        onKeyDown={
          !isEditing
            ? (e) => { if (e.key === 'Enter' || e.key === ' ') startEdit(); }
            : undefined
        }
        aria-label={
          !isEditing
            ? isCollapsed ? '오늘의 메시지 펼치기' : '메시지 편집'
            : undefined
        }
        aria-expanded={!isCollapsed}
      >
        {/* 아이콘 */}
        {s.icon !== 'none' && (
          <div
            className={`rounded-full text-white flex shrink-0 ${isCollapsed ? 'p-1' : 'p-2'}`}
            style={{ background: colors.icon }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: isCollapsed ? '14px' : '20px' }}
            >
              {s.icon}
            </span>
          </div>
        )}

        {/* 텍스트 영역 */}
        <div className="flex-1 min-w-0">
          {isCollapsed ? (
            <p
              className="text-sm font-medium truncate"
              style={{ color: colors.text }}
              title={message || '오늘의 메시지'}
            >
              {message !== '' ? message : '오늘의 메시지'}
            </p>
          ) : isEditing ? (
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

        {/* 스타일 편집 버튼 (펼친 상태에서만) */}
        {!isCollapsed && (
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
        )}

        {/* 접기/펼치기 토글 */}
        <button
          onClick={toggleCollapsed}
          className={`shrink-0 rounded-lg transition-colors hover:bg-white/10 ${
            isCollapsed ? 'p-1' : 'p-1.5'
          }`}
          style={{ color: colors.text }}
          title={isCollapsed ? '펼치기' : '접기'}
          aria-label={isCollapsed ? '오늘의 메시지 펼치기' : '오늘의 메시지 접기'}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: isCollapsed ? '16px' : '18px' }}
          >
            {isCollapsed ? 'expand_more' : 'expand_less'}
          </span>
        </button>
      </div>

      {/* 스타일 편집 드롭다운 */}
      {showStyleEditor && !isCollapsed && (
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
