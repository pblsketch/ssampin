import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CHALK_COLORS,
  BOARD_BACKGROUNDS,
  PEN_SIZE_MIN,
  PEN_SIZE_MAX,
  ERASER_SIZE_MIN,
  ERASER_SIZE_MAX,
  clampPenSize,
  clampEraserSize,
  decrementPenSize,
  incrementPenSize,
} from './types';
import type { ChalkboardMode, GridMode } from './types';
import { BoardBackgroundPicker } from './BoardBackgroundPicker';

const PEN_SIZE_PRESETS = [2, 5, 10, 20, 40] as const;
const ERASER_SIZE_PRESETS = [16, 32, 60, 100] as const;

interface ChalkboardToolbarProps {
  mode: ChalkboardMode;
  onModeChange: (mode: ChalkboardMode) => void;
  penSize: number;
  onPenSizeChange: (size: number) => void;
  colorIndex: number;
  onColorIndexChange: (index: number) => void;
  onClearAll: () => void;
  gridMode: GridMode;
  onGridModeChange: (mode: GridMode) => void;
  backgroundPickerOpen: boolean;
  onBackgroundPickerOpenChange: (open: boolean) => void;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onAddPage: () => void;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  boardColorIndex: number;
  onBoardColorIndexChange: (index: number) => void;
  onDeleteSelected: () => void;
  eraserSize: number;
  onEraserSizeChange: (size: number) => void;
}

function ToolbarButton({
  active,
  onClick,
  disabled,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-xl px-3 py-2 text-sm font-medium transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
        active
          ? 'ring-2 ring-amber-400 bg-amber-100 text-amber-900'
          : disabled
            ? 'bg-white text-gray-300 cursor-not-allowed'
            : 'bg-white hover:bg-gray-50 text-gray-700'
      }`}
    >
      {children}
    </button>
  );
}

export function ChalkboardToolbar({
  mode,
  onModeChange,
  penSize,
  onPenSizeChange,
  colorIndex,
  onColorIndexChange,
  onClearAll,
  gridMode,
  onGridModeChange,
  backgroundPickerOpen,
  onBackgroundPickerOpenChange,
  currentPage,
  totalPages,
  onPageChange,
  onAddPage,
  onSave,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  boardColorIndex,
  onBoardColorIndexChange,
  onDeleteSelected,
  eraserSize,
  onEraserSizeChange,
}: ChalkboardToolbarProps) {
  const currentColor = CHALK_COLORS[colorIndex] ?? CHALK_COLORS[0];
  const currentBoard = BOARD_BACKGROUNDS[boardColorIndex] ?? BOARD_BACKGROUNDS[0];

  const cycleColor = (dir: 1 | -1) => {
    const next = (colorIndex + dir + CHALK_COLORS.length) % CHALK_COLORS.length;
    onColorIndexChange(next);
  };

  const cycleBoardColor = (dir: 1 | -1) => {
    const next = (boardColorIndex + dir + BOARD_BACKGROUNDS.length) % BOARD_BACKGROUNDS.length;
    onBoardColorIndexChange(next);
  };

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 bg-amber-50 rounded-2xl shadow-lg px-3 py-2 border border-amber-200 max-w-[95%] overflow-x-auto">
      {/* 선택 */}
      <ToolbarButton active={mode === 'select'} onClick={() => onModeChange('select')} title="선택/이동 (V)">
        <span className="material-symbols-outlined text-icon-md">arrow_selector_tool</span>
        선택
      </ToolbarButton>

      {/* 판서 */}
      <ToolbarButton active={mode === 'pen'} onClick={() => onModeChange('pen')} title="판서 (P)">
        <span className="material-symbols-outlined text-icon-md">edit</span>
        판서
      </ToolbarButton>

      {/* 텍스트 입력 */}
      <ToolbarButton active={mode === 'text'} onClick={() => onModeChange('text')} title="텍스트 입력 (T)">
        <span className="text-base font-bold">Aa</span>
        텍스트
      </ToolbarButton>

      {/* 크기 */}
      <PenSizeControl penSize={penSize} onPenSizeChange={onPenSizeChange} />

      {/* 분필 색상 */}
      <div className="flex items-center gap-0.5 bg-white rounded-xl px-2 py-1 border border-gray-200 shrink-0">
        <button
          onClick={() => cycleColor(-1)}
          className="p-0.5 text-gray-500 hover:text-gray-800 transition-colors"
        >
          <span className="material-symbols-outlined text-icon-sm">chevron_left</span>
        </button>
        <div
          className="w-6 h-6 rounded-full border-2 border-gray-300"
          style={{ backgroundColor: currentColor?.value }}
          title={'분필: ' + (currentColor?.name ?? '')}
        />
        <button
          onClick={() => cycleColor(1)}
          className="p-0.5 text-gray-500 hover:text-gray-800 transition-colors"
        >
          <span className="material-symbols-outlined text-icon-sm">chevron_right</span>
        </button>
      </div>

      {/* 지우개 (개체/부분 선택 팝오버) */}
      <EraserControl
        mode={mode}
        onModeChange={onModeChange}
        eraserSize={eraserSize}
        onEraserSizeChange={onEraserSizeChange}
      />

      {/* 선택 삭제 */}
      <ToolbarButton onClick={onDeleteSelected} title="선택 항목 삭제 (Delete)">
        <span className="material-symbols-outlined text-icon-md">delete</span>
      </ToolbarButton>

      {/* 전체 지우기 */}
      <ToolbarButton onClick={onClearAll} title="전체 지우기">
        <span className="material-symbols-outlined text-icon-md">delete_sweep</span>
        전체
      </ToolbarButton>

      {/* 구분선 */}
      <div className="w-px h-8 bg-amber-300 mx-0.5 shrink-0" />

      {/* 칠판 색상 */}
      <div className="flex items-center gap-0.5 bg-white rounded-xl px-2 py-1 border border-gray-200 shrink-0" title={'칠판: ' + (currentBoard?.name ?? '')}>
        <button
          onClick={() => cycleBoardColor(-1)}
          className="p-0.5 text-gray-500 hover:text-gray-800 transition-colors"
        >
          <span className="material-symbols-outlined text-icon-sm">chevron_left</span>
        </button>
        <div
          className="w-6 h-6 rounded border-2 border-gray-300"
          style={{ backgroundColor: currentBoard?.value }}
        />
        <button
          onClick={() => cycleBoardColor(1)}
          className="p-0.5 text-gray-500 hover:text-gray-800 transition-colors"
        >
          <span className="material-symbols-outlined text-icon-sm">chevron_right</span>
        </button>
      </div>

      {/* 배경 (격자/오선지/지도) */}
      <BoardBackgroundPicker
        gridMode={gridMode}
        onGridModeChange={onGridModeChange}
        open={backgroundPickerOpen}
        onOpenChange={onBackgroundPickerOpenChange}
      />

      {/* 페이지 */}
      <div className="flex items-center gap-0.5 bg-white rounded-xl px-2 py-1 border border-gray-200 shrink-0">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 0}
          className="p-0.5 text-gray-500 hover:text-gray-800 transition-colors disabled:text-gray-300 disabled:cursor-not-allowed"
          title="이전 페이지 (←)"
        >
          <span className="material-symbols-outlined text-icon-sm">chevron_left</span>
        </button>
        <span className="text-xs font-medium text-gray-700 min-w-[2.5rem] text-center whitespace-nowrap">
          {currentPage + 1}/{totalPages}
        </span>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages - 1}
          className="p-0.5 text-gray-500 hover:text-gray-800 transition-colors disabled:text-gray-300 disabled:cursor-not-allowed"
          title="다음 페이지 (→)"
        >
          <span className="material-symbols-outlined text-icon-sm">chevron_right</span>
        </button>
        <button
          onClick={onAddPage}
          disabled={totalPages >= 20}
          className="p-0.5 text-gray-500 hover:text-gray-800 transition-colors disabled:text-gray-300 disabled:cursor-not-allowed"
          title="페이지 추가"
        >
          <span className="material-symbols-outlined text-icon-sm">add</span>
        </button>
      </div>

      {/* 저장 */}
      <ToolbarButton onClick={onSave} title="저장 (Ctrl+S)">
        <span className="material-symbols-outlined text-icon-md">download</span>
      </ToolbarButton>

      {/* 실행취소 / 다시실행 */}
      <ToolbarButton onClick={onUndo} disabled={!canUndo} title="실행취소 (Ctrl+Z)">
        <span className="material-symbols-outlined text-icon-md">undo</span>
      </ToolbarButton>
      <ToolbarButton onClick={onRedo} disabled={!canRedo} title="다시실행 (Ctrl+Y)">
        <span className="material-symbols-outlined text-icon-md">redo</span>
      </ToolbarButton>
    </div>
  );
}

function EraserControl({
  mode,
  onModeChange,
  eraserSize,
  onEraserSizeChange,
}: {
  mode: ChalkboardMode;
  onModeChange: (mode: ChalkboardMode) => void;
  eraserSize: number;
  onEraserSizeChange: (size: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverStyle, setPopoverStyle] = useState<{ left: number; top: number }>({ left: 0, top: 0 });

  const isEraserActive = mode === 'eraser' || mode === 'pixelEraser';
  const currentKind: 'object' | 'pixel' = mode === 'pixelEraser' ? 'pixel' : 'object';

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const updatePosition = () => {
      const btn = triggerRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const popoverWidth = 240;
      const popoverHeight = currentKind === 'pixel' ? 260 : 140;
      let left = rect.left + rect.width / 2 - popoverWidth / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - popoverWidth - 8));
      const top = rect.top - popoverHeight - 8;
      setPopoverStyle({ left, top: Math.max(8, top) });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, currentKind]);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', handle);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', handle);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);

  const handleTriggerClick = () => {
    if (!isEraserActive) {
      // 지우개가 꺼진 상태에서 누르면 → 마지막 종류로 켜고 팝오버 열기
      onModeChange(currentKind === 'pixel' ? 'pixelEraser' : 'eraser');
    }
    setOpen((v) => !v);
  };

  return (
    <>
      <button
        ref={triggerRef}
        onClick={handleTriggerClick}
        title="지우개 — 개체/부분 선택"
        className={`rounded-xl px-3 py-2 text-sm font-medium transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
          isEraserActive
            ? 'ring-2 ring-amber-400 bg-amber-100 text-amber-900'
            : 'bg-white hover:bg-gray-50 text-gray-700'
        }`}
      >
        <span className="material-symbols-outlined text-icon-md">
          {currentKind === 'pixel' ? 'backspace' : 'ink_eraser'}
        </span>
        지우개
        <span className="material-symbols-outlined text-icon-sm opacity-60">expand_more</span>
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={popoverRef}
          style={{ position: 'fixed', left: popoverStyle.left, top: popoverStyle.top, width: 240, zIndex: 10000 }}
          className="bg-white rounded-xl shadow-xl border border-gray-200 p-3"
        >
          <div className="text-xs font-semibold text-gray-600 mb-2">지우개 종류</div>
          <div className="grid grid-cols-2 gap-1.5 mb-2">
            <button
              onClick={() => onModeChange('eraser')}
              className={`rounded-lg py-2 text-xs font-medium flex flex-col items-center gap-1 transition-colors ${
                currentKind === 'object'
                  ? 'bg-amber-100 text-amber-900 ring-1 ring-amber-400'
                  : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
              }`}
            >
              <span className="material-symbols-outlined text-icon-md">ink_eraser</span>
              <span>개체</span>
              <span className="text-[10px] text-gray-500">클릭하여 통째로 삭제</span>
            </button>
            <button
              onClick={() => onModeChange('pixelEraser')}
              className={`rounded-lg py-2 text-xs font-medium flex flex-col items-center gap-1 transition-colors ${
                currentKind === 'pixel'
                  ? 'bg-amber-100 text-amber-900 ring-1 ring-amber-400'
                  : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
              }`}
            >
              <span className="material-symbols-outlined text-icon-md">backspace</span>
              <span>부분</span>
              <span className="text-[10px] text-gray-500">드래그로 일부만 지우기</span>
            </button>
          </div>

          {currentKind === 'pixel' && (
            <div className="pt-2 mt-2 border-t border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-600">지우개 크기</span>
                <span className="text-xs font-bold text-gray-900 tabular-nums">{eraserSize}</span>
              </div>
              <input
                type="range"
                min={ERASER_SIZE_MIN}
                max={ERASER_SIZE_MAX}
                step={1}
                value={eraserSize}
                onChange={(e) => onEraserSizeChange(clampEraserSize(Number(e.target.value)))}
                className="w-full accent-amber-500"
              />
              <div className="flex items-center justify-between mt-1 text-[10px] text-gray-400 tabular-nums">
                <span>{ERASER_SIZE_MIN}</span>
                <span>{ERASER_SIZE_MAX}</span>
              </div>
              <div className="mt-2">
                <div className="text-[10px] text-gray-500 mb-1">빠른 선택</div>
                <div className="flex items-center gap-1">
                  {ERASER_SIZE_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      onClick={() => onEraserSizeChange(preset)}
                      className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors ${
                        eraserSize === preset
                          ? 'bg-amber-100 text-amber-900 ring-1 ring-amber-400'
                          : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}

function PenSizeControl({
  penSize,
  onPenSizeChange,
}: {
  penSize: number;
  onPenSizeChange: (size: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverStyle, setPopoverStyle] = useState<{ left: number; top: number }>({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const updatePosition = () => {
      const btn = triggerRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const popoverWidth = 224;
      const popoverHeight = 160;
      let left = rect.left + rect.width / 2 - popoverWidth / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - popoverWidth - 8));
      const top = rect.top - popoverHeight - 8;
      setPopoverStyle({ left, top: Math.max(8, top) });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', handle);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', handle);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);

  const dotSize = Math.min(24, Math.max(2, penSize));

  return (
    <>
      <div className="flex items-center gap-0.5 bg-white rounded-xl px-2 py-1 border border-gray-200 shrink-0">
        <button
          onClick={() => onPenSizeChange(decrementPenSize(penSize))}
          className="p-0.5 text-gray-500 hover:text-gray-800 transition-colors"
          title="크기 줄이기 ([)"
        >
          <span className="material-symbols-outlined text-icon-sm">remove</span>
        </button>
        <button
          ref={triggerRef}
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1 min-w-[3rem] justify-center hover:bg-gray-50 rounded px-1 py-0.5 transition-colors"
          title="굵기 상세 조절"
        >
          <span
            className="rounded-full bg-gray-700 shrink-0"
            style={{ width: dotSize, height: dotSize }}
          />
          <span className="text-xs font-medium text-gray-700 tabular-nums">{penSize}</span>
        </button>
        <button
          onClick={() => onPenSizeChange(incrementPenSize(penSize))}
          className="p-0.5 text-gray-500 hover:text-gray-800 transition-colors"
          title="크기 키우기 (])"
        >
          <span className="material-symbols-outlined text-icon-sm">add</span>
        </button>
      </div>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={popoverRef}
          style={{ position: 'fixed', left: popoverStyle.left, top: popoverStyle.top, width: 224, zIndex: 10000 }}
          className="bg-white rounded-xl shadow-xl border border-gray-200 p-3"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-600">펜 굵기</span>
            <span className="text-xs font-bold text-gray-900 tabular-nums">{penSize}</span>
          </div>
          <input
            type="range"
            min={PEN_SIZE_MIN}
            max={PEN_SIZE_MAX}
            step={1}
            value={penSize}
            onChange={(e) => onPenSizeChange(clampPenSize(Number(e.target.value)))}
            className="w-full accent-amber-500"
          />
          <div className="flex items-center justify-between mt-1 text-[10px] text-gray-400 tabular-nums">
            <span>{PEN_SIZE_MIN}</span>
            <span>{PEN_SIZE_MAX}</span>
          </div>
          <div className="mt-3 pt-2 border-t border-gray-100">
            <div className="text-[10px] text-gray-500 mb-1.5">빠른 선택</div>
            <div className="flex items-center gap-1">
              {PEN_SIZE_PRESETS.map((preset) => (
                <button
                  key={preset}
                  onClick={() => onPenSizeChange(preset)}
                  className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors ${
                    penSize === preset
                      ? 'bg-amber-100 text-amber-900 ring-1 ring-amber-400'
                      : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
