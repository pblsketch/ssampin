import { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import type { WidgetVisibleSections } from '@domain/entities/Settings';

const SECTION_ITEMS: { key: keyof WidgetVisibleSections; label: string; icon: string }[] = [
  { key: 'dateTime', label: '날짜 / 시간', icon: 'schedule' },
  { key: 'weather', label: '날씨 정보', icon: 'cloud' },
  { key: 'message', label: '메시지 배너', icon: 'campaign' },
  { key: 'teacherTimetable', label: '교사 시간표', icon: 'calendar_view_week' },
  { key: 'classTimetable', label: '학급 시간표', icon: 'table' },
  { key: 'events', label: '학교 교육 활동', icon: 'event' },
  { key: 'periodBar', label: '교시 시간 바', icon: 'timer' },
  { key: 'todayClass', label: '오늘 수업', icon: 'today' },
  { key: 'meal', label: '급식 메뉴', icon: 'restaurant' },
  { key: 'todo', label: '할 일', icon: 'checklist' },
  { key: 'memo', label: '메모', icon: 'sticky_note_2' },
  { key: 'studentRecords', label: '담임 메모장', icon: 'person_book' },
  { key: 'seating', label: '자리배치', icon: 'grid_view' },
];

interface WidgetContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
}

export function WidgetContextMenu({ x, y, onClose }: WidgetContextMenuProps) {
  const { settings, update } = useSettingsStore();
  const menuRef = useRef<HTMLDivElement>(null);

  const alwaysOnTop = settings.widget.alwaysOnTop;
  const opacity = settings.widget.opacity;
  const vis = settings.widget.visibleSections;

  // 뷰포트 클램핑을 위한 위치 계산
  const [position, setPosition] = useState({ left: x, top: y });

  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setPosition({
      left: Math.min(x, vw - rect.width - 8),
      top: Math.min(y, vh - rect.height - 8),
    });
  }, [x, y]);

  // 외부 클릭으로 닫기
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  // ESC 키로 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleToggleSection = (key: keyof WidgetVisibleSections) => {
    const next = { ...vis, [key]: !vis[key] };
    void update({ widget: { ...settings.widget, visibleSections: next } });
  };

  const handleAlwaysOnTop = () => {
    const next = !alwaysOnTop;
    void update({ widget: { ...settings.widget, alwaysOnTop: next } });
    window.electronAPI?.setAlwaysOnTop(next);
  };

  const handleToggleWidget = () => {
    onClose();
    window.electronAPI?.toggleWidget();
  };

  const handleOpacityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pct = Number(e.target.value);
    const normalized = pct / 100;
    void update({ widget: { ...settings.widget, opacity: normalized } });
    window.electronAPI?.setOpacity(normalized);
  };

  const handleSettings = () => {
    onClose();
    window.electronAPI?.toggleWidget();
  };

  const handleClose = () => {
    onClose();
    window.electronAPI?.closeWindow();
  };

  const menu = (
    <div
      ref={menuRef}
      className="fixed z-[9999] w-56 bg-slate-800/75 backdrop-blur-xl rounded-xl border border-white/10 shadow-2xl overflow-hidden"
      style={{ left: position.left, top: position.top }}
    >
      {/* 메뉴 헤더 */}
      <div className="px-3 pt-3 pb-2">
        <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
          SsamPin Menu
        </p>
      </div>

      {/* 항상 위에 표시 */}
      <button
        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/[0.08] transition-colors text-left"
        onClick={handleAlwaysOnTop}
      >
        <span
          className={[
            'material-symbols-outlined flex-shrink-0',
            alwaysOnTop ? 'text-blue-400' : 'text-slate-400',
          ].join(' ')}
          style={{ fontSize: 20 }}
        >
          push_pin
        </span>
        <span className="flex-1 text-sm text-slate-200">항상 위에 표시</span>
        {alwaysOnTop && (
          <span
            className="material-symbols-outlined text-blue-400 flex-shrink-0"
            style={{ fontSize: 16 }}
          >
            check
          </span>
        )}
      </button>

      {/* 구분선 */}
      <div className="h-px bg-white/10 mx-3 my-1" />

      {/* 전체 화면으로 전환 */}
      <button
        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/[0.08] transition-colors text-left"
        onClick={handleToggleWidget}
      >
        <span
          className="material-symbols-outlined text-slate-400 flex-shrink-0"
          style={{ fontSize: 20 }}
        >
          fullscreen
        </span>
        <span className="text-sm text-slate-200">전체 화면으로 전환</span>
      </button>

      {/* 구분선 */}
      <div className="h-px bg-white/10 mx-3 my-1" />

      {/* 투명도 조절 */}
      <div className="px-3 py-2">
        <div className="flex items-center gap-3 mb-2">
          <span
            className="material-symbols-outlined text-slate-400 flex-shrink-0"
            style={{ fontSize: 20 }}
          >
            opacity
          </span>
          <span className="flex-1 text-sm text-slate-200">투명도 조절</span>
          <span className="text-xs font-mono text-slate-400 flex-shrink-0 w-8 text-right">
            {Math.round(opacity * 100)}%
          </span>
        </div>
        <div className="px-1">
          <input
            type="range"
            min={20}
            max={100}
            step={5}
            value={Math.round(opacity * 100)}
            onChange={handleOpacityChange}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, #3b82f6 ${Math.round(opacity * 100)}%, #334155 ${Math.round(opacity * 100)}%)`,
            }}
          />
        </div>
      </div>

      {/* 폰트 크기 조절 (위젯 전용) */}
      <div className="px-3 py-2">
        <div className="flex items-center gap-3 mb-2">
          <span
            className="material-symbols-outlined text-slate-400 flex-shrink-0"
            style={{ fontSize: 20 }}
          >
            format_size
          </span>
          <span className="flex-1 text-sm text-slate-200">글자 크기</span>
          <span className="text-xs font-mono text-slate-400 flex-shrink-0 w-12 text-right">
            {settings.fontSize === 'small' ? '작게' : settings.fontSize === 'large' ? '크게' : settings.fontSize === 'xlarge' ? '매우 크게' : '보통'}
          </span>
        </div>
        <div className="px-1 flex items-center justify-between gap-2">
          {(['small', 'medium', 'large', 'xlarge'] as const).map((size) => (
            <button
              key={size}
              onClick={() => void update({ fontSize: size })}
              className={`w-full py-1 rounded text-xs transition-colors ${settings.fontSize === size
                  ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/50'
                  : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                }`}
            >
              {size === 'small' ? '가' : size === 'medium' ? '가' : size === 'large' ? '가' : '가'}
            </button>
          ))}
        </div>
      </div>

      {/* 구분선 */}
      <div className="h-px bg-white/10 mx-3 my-1" />

      {/* 표시 항목 토글 */}
      <div className="px-3 py-2">
        <div className="flex items-center gap-3 mb-2">
          <span
            className="material-symbols-outlined text-slate-400 flex-shrink-0"
            style={{ fontSize: 20 }}
          >
            visibility
          </span>
          <span className="flex-1 text-sm text-slate-200">표시 항목</span>
        </div>
        <div className="space-y-0.5">
          {SECTION_ITEMS.map(({ key, label, icon }) => {
            const checked = vis[key];
            return (
              <button
                key={key}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/[0.06] transition-colors text-left"
                onClick={() => handleToggleSection(key)}
              >
                <span
                  className={[
                    'material-symbols-outlined flex-shrink-0',
                    checked ? 'text-blue-400' : 'text-slate-500',
                  ].join(' ')}
                  style={{ fontSize: 16 }}
                >
                  {icon}
                </span>
                <span className={`flex-1 text-xs ${checked ? 'text-slate-200' : 'text-slate-500'}`}>
                  {label}
                </span>
                <span
                  className={[
                    'material-symbols-outlined flex-shrink-0 transition-colors',
                    checked ? 'text-blue-400' : 'text-slate-600',
                  ].join(' ')}
                  style={{ fontSize: 16 }}
                >
                  {checked ? 'check_box' : 'check_box_outline_blank'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 구분선 */}
      <div className="h-px bg-white/10 mx-3 my-1" />

      {/* 설정 */}
      <button
        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/[0.08] transition-colors text-left"
        onClick={handleSettings}
      >
        <span
          className="material-symbols-outlined text-slate-400 flex-shrink-0"
          style={{ fontSize: 20 }}
        >
          settings
        </span>
        <span className="text-sm text-slate-200">설정</span>
      </button>

      {/* 닫기 */}
      <button
        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-red-500/10 transition-colors text-left group mb-1"
        onClick={handleClose}
      >
        <span
          className="material-symbols-outlined text-slate-400 group-hover:text-red-400 flex-shrink-0 transition-colors"
          style={{ fontSize: 20 }}
        >
          close
        </span>
        <span className="text-sm text-slate-200 group-hover:text-red-300 transition-colors">
          닫기
        </span>
      </button>
    </div>
  );

  return ReactDOM.createPortal(menu, document.body);
}
