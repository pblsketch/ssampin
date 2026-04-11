import { CHALK_COLORS, BOARD_BACKGROUNDS } from './types';
import type { ChalkboardMode, GridMode } from './types';

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
}

const GRID_LABELS: Record<GridMode, string> = {
  none: '없음',
  grid: '모눈',
  lines: '줄선',
};

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

  const cycleGrid = () => {
    const order: GridMode[] = ['none', 'grid', 'lines'];
    const idx = order.indexOf(gridMode);
    onGridModeChange(order[(idx + 1) % order.length]!);
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
      <div className="flex items-center gap-0.5 bg-white rounded-xl px-2 py-1 border border-gray-200 shrink-0">
        <button
          onClick={() => onPenSizeChange(Math.max(10, penSize - 5))}
          className="p-0.5 text-gray-500 hover:text-gray-800 transition-colors"
          title="크기 줄이기 ([)"
        >
          <span className="material-symbols-outlined text-icon-sm">remove</span>
        </button>
        <span className="text-xs font-medium text-gray-700 min-w-[2rem] text-center">{penSize}</span>
        <button
          onClick={() => onPenSizeChange(Math.min(80, penSize + 5))}
          className="p-0.5 text-gray-500 hover:text-gray-800 transition-colors"
          title="크기 키우기 (])"
        >
          <span className="material-symbols-outlined text-icon-sm">add</span>
        </button>
      </div>

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

      {/* 지우개 (클릭 삭제) */}
      <ToolbarButton active={mode === 'eraser'} onClick={() => onModeChange('eraser')} title="지우개 — 클릭하여 삭제 (E)">
        <span className="material-symbols-outlined text-icon-md">ink_eraser</span>
        지우개
      </ToolbarButton>

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

      {/* 격자 */}
      <ToolbarButton active={gridMode !== 'none'} onClick={cycleGrid} title="격자 (G)">
        <span className="material-symbols-outlined text-icon-md">grid_on</span>
        {GRID_LABELS[gridMode]}
      </ToolbarButton>

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
