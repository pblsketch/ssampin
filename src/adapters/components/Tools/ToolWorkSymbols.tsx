import { useState, useEffect, useCallback, useRef } from 'react';
import { ToolLayout } from './ToolLayout';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { DEFAULT_WORK_SYMBOLS } from '@adapters/stores/useSettingsStore';
import type { WorkSymbolItem } from '@domain/entities/Settings';

interface ToolWorkSymbolsProps {
  onBack: () => void;
  isFullscreen: boolean;
}

// ─── Emoji Picker ──────────────────────────────────────────────

const EMOJI_CATEGORIES: { label: string; emojis: string[] }[] = [
  {
    label: '수업 활동',
    emojis: [
      '🤫', '🙋', '💬', '👥', '📝', '✋', '🤚', '👋', '🖐️', '🙌',
      '👏', '🤝', '🗣️', '💭', '📢', '📣', '🔔', '🔕', '🤔', '💡',
    ],
  },
  {
    label: '학습',
    emojis: [
      '📖', '📚', '✏️', '🖊️', '📐', '📏', '🔬', '🔭', '🧪', '🧮',
      '💻', '🎓', '📓', '📋', '🗒️', '📎', '✂️', '🖍️', '🎨', '🧠',
    ],
  },
  {
    label: '상태 / 신호',
    emojis: [
      '🟢', '🟡', '🔴', '⭕', '❌', '✅', '⚠️', '🚦', '⏸️', '▶️',
      '⏹️', '🔇', '🔊', '👀', '👁️', '⏰', '⏳', '🎯', '⭐', '🏆',
    ],
  },
  {
    label: '감정 / 표현',
    emojis: [
      '😊', '😀', '🤩', '😮', '🤯', '😴', '🥳', '💪', '🙏', '❤️',
      '🔥', '✨', '🌟', '👍', '👎', '🎉', '🎊', '💯', '🏃', '🧘',
    ],
  },
  {
    label: '사물',
    emojis: [
      '📱', '🖥️', '⌨️', '🎧', '🎤', '📷', '🗂️', '📌', '🧩', '🎲',
      '🪄', '🔑', '🧲', '💎', '🛠️', '🔧', '📦', '🗃️', '🏷️', '🔖',
    ],
  },
];

interface EmojiPickerProps {
  value: string;
  onSelect: (emoji: string) => void;
}

function EmojiPicker({ value, onSelect }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState(0);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleSelect = useCallback((emoji: string) => {
    onSelect(emoji);
    setOpen(false);
    setSearch('');
  }, [onSelect]);

  // Flatten for search
  const allEmojis = EMOJI_CATEGORIES.flatMap((c) => c.emojis);
  const filtered = search
    ? [...new Set(allEmojis)].filter((e) => e.includes(search))
    : null;

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-12 h-12 text-center text-2xl rounded-lg border transition-all flex items-center justify-center ${
          open
            ? 'bg-sp-accent/10 border-sp-accent'
            : 'bg-sp-surface border-sp-border hover:border-sp-accent/50'
        }`}
      >
        {value}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-14 left-0 z-50 w-[280px] bg-sp-surface border border-sp-border rounded-xl shadow-2xl overflow-hidden">
          {/* Search */}
          <div className="px-3 py-2 border-b border-sp-border">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="이모지 검색..."
              className="w-full px-2.5 py-1.5 text-sm bg-sp-card border border-sp-border rounded-lg text-sp-text focus:outline-none focus:border-sp-accent placeholder:text-sp-muted/50"
              autoFocus
            />
          </div>

          {/* Category tabs (hidden when searching) */}
          {!search && (
            <div className="flex gap-0.5 px-2 py-1.5 border-b border-sp-border overflow-x-auto">
              {EMOJI_CATEGORIES.map((cat, i) => (
                <button
                  key={cat.label}
                  type="button"
                  onClick={() => setActiveCategory(i)}
                  className={`px-2 py-1 rounded-md text-[11px] whitespace-nowrap transition-all ${
                    activeCategory === i
                      ? 'bg-sp-accent text-white'
                      : 'text-sp-muted hover:text-sp-text hover:bg-white/5'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          )}

          {/* Emoji grid */}
          <div className="p-2 max-h-[200px] overflow-y-auto">
            {search ? (
              filtered && filtered.length > 0 ? (
                <div className="grid grid-cols-7 gap-0.5">
                  {filtered.map((emoji, i) => (
                    <button
                      key={`${emoji}-${i}`}
                      type="button"
                      onClick={() => handleSelect(emoji)}
                      className="w-9 h-9 flex items-center justify-center text-xl rounded-lg hover:bg-white/10 transition-colors"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-center text-sp-muted text-xs py-4">결과 없음</p>
              )
            ) : (
              <div className="grid grid-cols-7 gap-0.5">
                {EMOJI_CATEGORIES[activeCategory]?.emojis.map((emoji, i) => (
                  <button
                    key={`${emoji}-${i}`}
                    type="button"
                    onClick={() => handleSelect(emoji)}
                    className="w-9 h-9 flex items-center justify-center text-xl rounded-lg hover:bg-white/10 transition-colors"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Direct input fallback */}
          <div className="px-3 py-2 border-t border-sp-border">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-sp-muted whitespace-nowrap">직접 입력:</span>
              <input
                type="text"
                defaultValue=""
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const val = (e.target as HTMLInputElement).value.trim();
                    if (val) handleSelect(val);
                  }
                }}
                className="flex-1 px-2 py-1 text-sm bg-sp-card border border-sp-border rounded text-center focus:outline-none focus:border-sp-accent"
                placeholder="붙여넣기"
                maxLength={4}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Settings Modal ────────────────────────────────────────────

interface SettingsModalProps {
  symbols: readonly WorkSymbolItem[];
  onSave: (symbols: WorkSymbolItem[]) => void;
  onClose: () => void;
}

function SettingsModal({ symbols, onSave, onClose }: SettingsModalProps) {
  const [items, setItems] = useState<WorkSymbolItem[]>([...symbols]);
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  const updateItem = useCallback((index: number, patch: Partial<WorkSymbolItem>) => {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }, []);

  const removeItem = useCallback((index: number) => {
    setItems((prev) => {
      if (prev.length <= 2) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const addItem = useCallback(() => {
    setItems((prev) => {
      if (prev.length >= 8) return prev;
      const newItem: WorkSymbolItem = {
        id: `custom-${Date.now()}`,
        emoji: '⭐',
        name: '새 활동',
        description: '설명을 입력하세요',
        bgGradient: 'from-slate-950/30 to-transparent',
      };
      return [...prev, newItem];
    });
  }, []);

  const handleDragStart = useCallback((index: number) => {
    dragItem.current = index;
  }, []);

  const handleDragEnter = useCallback((index: number) => {
    dragOverItem.current = index;
  }, []);

  const handleDragEnd = useCallback(() => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    const from = dragItem.current;
    const to = dragOverItem.current;
    if (from === to) {
      dragItem.current = null;
      dragOverItem.current = null;
      return;
    }
    setItems((prev) => {
      const copy = [...prev];
      const removed = copy.splice(from, 1)[0];
      if (removed) copy.splice(to, 0, removed);
      return copy;
    });
    dragItem.current = null;
    dragOverItem.current = null;
  }, []);

  const resetDefaults = useCallback(() => {
    setItems([...DEFAULT_WORK_SYMBOLS]);
  }, []);

  const handleSave = useCallback(() => {
    onSave(items);
    onClose();
  }, [items, onSave, onClose]);

  const BG_OPTIONS = [
    { label: '파랑', value: 'from-blue-950/30 to-transparent' },
    { label: '초록', value: 'from-green-950/30 to-transparent' },
    { label: '노랑', value: 'from-yellow-950/30 to-transparent' },
    { label: '보라', value: 'from-purple-950/30 to-transparent' },
    { label: '회색', value: 'from-slate-950/30 to-transparent' },
    { label: '빨강', value: 'from-red-950/30 to-transparent' },
    { label: '분홍', value: 'from-pink-950/30 to-transparent' },
    { label: '청록', value: 'from-teal-950/30 to-transparent' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-sp-surface border border-sp-border rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-sp-border">
          <h2 className="text-lg font-bold text-white">활동 기호 설정</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-sp-muted hover:text-white hover:bg-white/5 transition-all"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {items.map((item, index) => (
            <div
              key={item.id}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragEnter={() => handleDragEnter(index)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => e.preventDefault()}
              className="bg-sp-card border border-sp-border rounded-xl p-4 cursor-grab active:cursor-grabbing hover:border-sp-accent/30 transition-colors"
            >
              <div className="flex items-start gap-3">
                {/* Drag handle */}
                <div className="pt-1 text-sp-muted">
                  <span className="material-symbols-outlined text-[18px]">drag_indicator</span>
                </div>

                {/* Emoji picker */}
                <EmojiPicker
                  value={item.emoji}
                  onSelect={(emoji) => updateItem(index, { emoji })}
                />

                {/* Name & description */}
                <div className="flex-1 space-y-2">
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) => updateItem(index, { name: e.target.value })}
                    className="w-full px-3 py-1.5 text-sm bg-sp-surface border border-sp-border rounded-lg text-sp-text focus:outline-none focus:border-sp-accent"
                    placeholder="활동명"
                    maxLength={20}
                  />
                  <input
                    type="text"
                    value={item.description}
                    onChange={(e) => updateItem(index, { description: e.target.value })}
                    className="w-full px-3 py-1.5 text-sm bg-sp-surface border border-sp-border rounded-lg text-sp-text focus:outline-none focus:border-sp-accent"
                    placeholder="설명"
                    maxLength={50}
                  />
                  {/* Background color select */}
                  <select
                    value={item.bgGradient}
                    onChange={(e) => updateItem(index, { bgGradient: e.target.value })}
                    className="w-full px-3 py-1.5 text-sm bg-sp-surface border border-sp-border rounded-lg text-sp-text focus:outline-none focus:border-sp-accent"
                  >
                    {BG_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                {/* Delete */}
                <button
                  onClick={() => removeItem(index)}
                  disabled={items.length <= 2}
                  className="p-1.5 rounded-lg text-sp-muted hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  title="삭제"
                >
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                </button>
              </div>
            </div>
          ))}

          {/* Add button */}
          {items.length < 8 && (
            <button
              onClick={addItem}
              className="w-full py-3 rounded-xl border-2 border-dashed border-sp-border text-sp-muted hover:border-sp-accent hover:text-sp-accent transition-all text-sm font-medium"
            >
              + 기호 추가 ({items.length}/8)
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-sp-border">
          <button
            onClick={resetDefaults}
            className="px-4 py-2 rounded-lg text-sm text-sp-muted hover:text-white hover:bg-white/5 transition-all"
          >
            기본값으로 복원
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-lg text-sm text-sp-muted hover:text-white bg-sp-card border border-sp-border hover:border-sp-accent transition-all"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 rounded-lg text-sm text-white bg-sp-accent hover:bg-blue-500 transition-all font-medium"
            >
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────

export function ToolWorkSymbols({ onBack, isFullscreen }: ToolWorkSymbolsProps) {
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.update);

  const symbols = settings.workSymbols.symbols;
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [animPhase, setAnimPhase] = useState<'idle' | 'out' | 'in'>('idle');
  const pendingIndex = useRef<number | null>(null);
  const [showBottomBar, setShowBottomBar] = useState(true);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentSymbol = symbols[selectedIndex] ?? symbols[0] ?? {
    id: 'fallback', emoji: '🤫', name: '조용히',
    description: '소리 내지 않고 혼자 활동합니다',
    bgGradient: 'from-blue-950/30 to-transparent',
  };

  // Select with animation
  const selectSymbol = useCallback((index: number) => {
    if (index === selectedIndex || animPhase !== 'idle') return;
    pendingIndex.current = index;
    setAnimPhase('out');

    setTimeout(() => {
      setSelectedIndex(index);
      setAnimPhase('in');
      setTimeout(() => {
        setAnimPhase('idle');
        pendingIndex.current = null;
      }, 300);
    }, 200);
  }, [selectedIndex, animPhase]);

  // Keyboard shortcuts (1~N)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= symbols.length) {
        selectSymbol(num - 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [symbols.length, selectSymbol]);

  // Fullscreen: auto-hide bottom bar
  useEffect(() => {
    if (!isFullscreen) {
      setShowBottomBar(true);
      return;
    }

    setShowBottomBar(false);

    const handleMouseMove = (e: MouseEvent) => {
      const threshold = window.innerHeight - 120;
      if (e.clientY >= threshold) {
        setShowBottomBar(true);
        if (hideTimeout.current) clearTimeout(hideTimeout.current);
        hideTimeout.current = setTimeout(() => setShowBottomBar(false), 3000);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (hideTimeout.current) clearTimeout(hideTimeout.current);
    };
  }, [isFullscreen]);

  // Save customized symbols
  const handleSaveSymbols = useCallback(async (newSymbols: WorkSymbolItem[]) => {
    await updateSettings({
      workSymbols: { symbols: newSymbols },
    });
    // Ensure selected index stays valid
    if (selectedIndex >= newSymbols.length) {
      setSelectedIndex(0);
    }
  }, [updateSettings, selectedIndex]);

  // Animation classes for the icon
  const iconAnimClass = (() => {
    if (animPhase === 'out') return 'scale-75 opacity-0';
    if (animPhase === 'in') return 'scale-110 opacity-100';
    return 'scale-100 opacity-100';
  })();

  // Sizes based on fullscreen
  const iconSize = isFullscreen ? 'text-[20rem]' : 'text-[10rem] md:text-[14rem]';
  const nameSize = isFullscreen ? 'text-6xl' : 'text-4xl md:text-5xl';
  const descSize = isFullscreen ? 'text-3xl' : 'text-xl md:text-2xl';

  const COLOR_RGB: Record<string, string> = {
    blue: '30, 58, 138',
    green: '20, 83, 45',
    yellow: '113, 63, 18',
    purple: '59, 21, 100',
    slate: '30, 41, 59',
    red: '127, 29, 29',
    pink: '131, 24, 67',
    teal: '19, 78, 74',
  };

  // Build gradient — use inline style since Tailwind can't compose these dynamically
  const bgGradientStyle = (() => {
    const gradient = currentSymbol.bgGradient;
    const colorMatch = gradient.match(/from-(\w+)-950/);
    if (!colorMatch || !colorMatch[1]) return {};
    const rgb = COLOR_RGB[colorMatch[1]] ?? '30, 41, 59';
    const alpha = isFullscreen ? 0.5 : 0.3;
    return {
      background: `linear-gradient(to bottom, rgba(${rgb}, ${alpha}), transparent)`,
    };
  })();

  return (
    <ToolLayout title="활동 기호" emoji="🤫" onBack={onBack} isFullscreen={isFullscreen}>
      <div className="relative w-full h-full flex flex-col">
        {/* Main Display Area */}
        <div
          className="flex-1 flex flex-col items-center justify-center transition-all duration-500 rounded-2xl"
          style={bgGradientStyle}
        >
          {/* Icon */}
          <div
            className={`leading-none transition-all duration-300 ease-out select-none ${iconSize} ${iconAnimClass}`}
          >
            {currentSymbol.emoji}
          </div>

          {/* Name */}
          <div className={`mt-4 font-bold text-white transition-all duration-300 ${nameSize} ${animPhase !== 'idle' ? 'opacity-0' : 'opacity-100'}`}>
            {currentSymbol.name}
          </div>

          {/* Description */}
          <div className={`mt-2 text-sp-muted transition-all duration-300 ${descSize} ${animPhase !== 'idle' ? 'opacity-0' : 'opacity-100'}`}>
            {currentSymbol.description}
          </div>
        </div>

        {/* Bottom Bar */}
        <div
          className={`transition-all duration-300 ease-out ${
            isFullscreen
              ? `fixed bottom-0 left-0 right-0 px-6 py-4 bg-sp-bg/90 backdrop-blur-md border-t border-sp-border ${
                  showBottomBar ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
                }`
              : 'mt-6 pb-2'
          }`}
        >
          <div className="flex items-center justify-center gap-3">
            {symbols.map((symbol, index) => (
              <button
                key={symbol.id}
                onClick={() => selectSymbol(index)}
                className={`flex flex-col items-center justify-center w-16 h-16 md:w-20 md:h-20 rounded-2xl transition-all duration-200 ${
                  selectedIndex === index
                    ? 'ring-2 ring-blue-500 bg-sp-card scale-110 opacity-100'
                    : 'bg-sp-card opacity-60 hover:opacity-80 hover:scale-105'
                }`}
              >
                <span className="text-3xl leading-none">{symbol.emoji}</span>
                <span className="text-[10px] text-sp-muted mt-1 leading-tight text-center px-1 truncate w-full">
                  {symbol.name}
                </span>
              </button>
            ))}

            {/* Settings button */}
            {!isFullscreen && (
              <button
                onClick={() => setShowSettings(true)}
                className="flex flex-col items-center justify-center w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-sp-card/50 border border-dashed border-sp-border text-sp-muted hover:text-white hover:border-sp-accent transition-all"
                title="설정"
              >
                <span className="material-symbols-outlined text-xl">settings</span>
                <span className="text-[10px] mt-1">설정</span>
              </button>
            )}
          </div>

          {/* Keyboard hint */}
          <div className={`text-center mt-3 text-xs text-sp-muted ${isFullscreen && !showBottomBar ? 'hidden' : ''}`}>
            단축키:{' '}
            {symbols.map((_, i) => (
              <span key={i}>
                <kbd className="px-1.5 py-0.5 rounded bg-sp-card border border-sp-border font-mono text-[10px]">
                  {i + 1}
                </kbd>
                {i < symbols.length - 1 && <span className="mx-1" />}
              </span>
            ))}
          </div>
        </div>

        {/* Settings Modal */}
        {showSettings && (
          <SettingsModal
            symbols={symbols}
            onSave={handleSaveSymbols}
            onClose={() => setShowSettings(false)}
          />
        )}
      </div>
    </ToolLayout>
  );
}
