import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { ToolLayout } from './ToolLayout';
import { ChalkboardToolbar } from './Chalkboard/ChalkboardToolbar';
import { useChalkCanvas } from './Chalkboard/useChalkCanvas';
import {
  CHALK_COLORS,
  BOARD_BACKGROUNDS,
  PEN_SIZE_DEFAULT,
  ERASER_SIZE_DEFAULT,
  clampPenSize,
  clampEraserSize,
  decrementPenSize,
  incrementPenSize,
} from './Chalkboard/types';
import type { ChalkboardMode, GridMode } from './Chalkboard/types';
import type { KeyboardShortcut } from './types';

const PEN_SIZE_STORAGE_KEY = 'chalkboard.penSize';
const ERASER_SIZE_STORAGE_KEY = 'chalkboard.eraserSize';
const COLOR_INDEX_STORAGE_KEY = 'chalkboard.colorIndex';
const BOARD_COLOR_INDEX_STORAGE_KEY = 'chalkboard.boardColorIndex';

function loadNumber(key: string, fallback: number, max: number): number {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === null) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(0, Math.floor(n)));
}

interface ToolChalkboardProps {
  onBack: () => void;
  isFullscreen: boolean;
}

export function ToolChalkboard({ onBack, isFullscreen }: ToolChalkboardProps) {
  const [mode, setMode] = useState<ChalkboardMode>('pen');
  const [penSize, setPenSize] = useState(() => {
    if (typeof window === 'undefined') return PEN_SIZE_DEFAULT;
    const raw = window.localStorage.getItem(PEN_SIZE_STORAGE_KEY);
    if (raw === null) return PEN_SIZE_DEFAULT;
    const n = Number(raw);
    return Number.isFinite(n) ? clampPenSize(n) : PEN_SIZE_DEFAULT;
  });
  const [eraserSize, setEraserSize] = useState(() => {
    if (typeof window === 'undefined') return ERASER_SIZE_DEFAULT;
    const raw = window.localStorage.getItem(ERASER_SIZE_STORAGE_KEY);
    if (raw === null) return ERASER_SIZE_DEFAULT;
    const n = Number(raw);
    return Number.isFinite(n) ? clampEraserSize(n) : ERASER_SIZE_DEFAULT;
  });
  const [colorIndex, setColorIndex] = useState(() =>
    loadNumber(COLOR_INDEX_STORAGE_KEY, 0, CHALK_COLORS.length - 1),
  );
  const [boardColorIndex, setBoardColorIndex] = useState(() =>
    loadNumber(BOARD_COLOR_INDEX_STORAGE_KEY, 0, BOARD_BACKGROUNDS.length - 1),
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(PEN_SIZE_STORAGE_KEY, String(penSize));
  }, [penSize]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(ERASER_SIZE_STORAGE_KEY, String(eraserSize));
  }, [eraserSize]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(COLOR_INDEX_STORAGE_KEY, String(colorIndex));
  }, [colorIndex]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(BOARD_COLOR_INDEX_STORAGE_KEY, String(boardColorIndex));
  }, [boardColorIndex]);

  const canvasElRef = useRef<HTMLCanvasElement>(null);

  const currentColor = CHALK_COLORS[colorIndex]?.value ?? '#FFFFFF';
  const currentBoardBg = BOARD_BACKGROUNDS[boardColorIndex]?.value ?? BOARD_BACKGROUNDS[0]!.value;

  const {
    undo,
    redo,
    canUndo,
    canRedo,
    clearAll,
    saveAsImage,
    gridMode,
    setGridMode,
    currentPage,
    totalPages,
    goToPage,
    addPage,
    initCanvas,
    deleteSelected,
  } = useChalkCanvas({
    canvasElRef,
    mode,
    color: currentColor,
    penSize,
    eraserSize,
    boardColor: currentBoardBg,
  });

  // Initialize Fabric canvas on mount
  useEffect(() => {
    const timer = requestAnimationFrame(initCanvas);
    return () => cancelAnimationFrame(timer);
  }, [initCanvas]);

  const handleClearAll = useCallback(() => {
    if (window.confirm('칠판 내용을 모두 지우시겠습니까?')) {
      clearAll();
    }
  }, [clearAll]);

  const cycleGridMode = useCallback(() => {
    const order: GridMode[] = ['none', 'grid', 'lines'];
    const idx = order.indexOf(gridMode);
    setGridMode(order[(idx + 1) % order.length]!);
  }, [gridMode, setGridMode]);

  const handleUndo = useCallback(() => { void undo(); }, [undo]);
  const handleRedo = useCallback(() => { void redo(); }, [redo]);
  const handleGoToPage = useCallback((n: number) => { void goToPage(n); }, [goToPage]);

  const shortcuts: KeyboardShortcut[] = useMemo(
    () => [
      { key: 'v', label: '선택', description: '선택/이동 모드', handler: () => setMode('select') },
      { key: 'p', label: '판서', description: '판서 모드', handler: () => setMode('pen') },
      { key: 't', label: '텍스트', description: '텍스트 모드', handler: () => setMode('text') },
      { key: 'e', label: '개체 지우개', description: '개체 단위 지우개', handler: () => setMode('eraser') },
      { key: 'e', label: '부분 지우개', description: '드래그로 부분 지우개', modifiers: { shift: true }, handler: () => setMode('pixelEraser') },
      { key: 'z', label: '실행취소', description: '실행취소', modifiers: { ctrl: true }, handler: handleUndo },
      { key: 'y', label: '다시실행', description: '다시실행', modifiers: { ctrl: true }, handler: handleRedo },
      { key: 's', label: '저장', description: '이미지 저장', modifiers: { ctrl: true }, handler: saveAsImage },
      { key: '[', label: '크기 줄이기', description: '펜 크기 줄이기', handler: () => setPenSize((s) => decrementPenSize(s)) },
      { key: ']', label: '크기 키우기', description: '펜 크기 키우기', handler: () => setPenSize((s) => incrementPenSize(s)) },
      { key: 'g', label: '격자', description: '격자 전환', handler: cycleGridMode },
      { key: 'ArrowLeft', label: '이전 페이지', description: '이전 페이지', handler: () => handleGoToPage(currentPage - 1) },
      { key: 'ArrowRight', label: '다음 페이지', description: '다음 페이지', handler: () => handleGoToPage(currentPage + 1) },
      { key: 'Delete', label: '삭제', description: '선택 항목 삭제', handler: deleteSelected },
    ],
    [handleUndo, handleRedo, saveAsImage, cycleGridMode, handleGoToPage, currentPage, deleteSelected],
  );

  const cursorStyle = mode === 'pen'
    ? 'crosshair'
    : mode === 'eraser'
      ? 'pointer'
      : mode === 'pixelEraser'
        ? 'crosshair'
        : mode === 'text'
          ? 'text'
          : 'default';

  return (
    <ToolLayout title="칠판" emoji="🖍️" onBack={onBack} isFullscreen={isFullscreen} shortcuts={shortcuts} disableZoom>
      <div className="flex-1 min-h-0 flex flex-col">
        <div
          className="relative flex-1 rounded-xl border-4 border-amber-800/60 shadow-inner overflow-hidden"
          style={{ backgroundColor: currentBoardBg, cursor: cursorStyle }}
        >
          {/* Fabric.js canvas */}
          <canvas ref={canvasElRef} className="absolute inset-0" />

          {/* Placeholder */}
          {currentPage === 0 && !canUndo && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 5 }}>
              <p className="text-white/20 text-2xl font-medium select-none">
                칠판에 자유롭게 판서하세요
              </p>
            </div>
          )}

          {/* Toolbar */}
          <ChalkboardToolbar
            mode={mode}
            onModeChange={setMode}
            penSize={penSize}
            onPenSizeChange={setPenSize}
            colorIndex={colorIndex}
            onColorIndexChange={setColorIndex}
            onClearAll={handleClearAll}
            gridMode={gridMode}
            onGridModeChange={setGridMode}
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handleGoToPage}
            onAddPage={addPage}
            onSave={saveAsImage}
            onUndo={handleUndo}
            onRedo={handleRedo}
            canUndo={canUndo}
            canRedo={canRedo}
            boardColorIndex={boardColorIndex}
            onBoardColorIndexChange={setBoardColorIndex}
            onDeleteSelected={deleteSelected}
            eraserSize={eraserSize}
            onEraserSizeChange={setEraserSize}
          />
        </div>
      </div>
    </ToolLayout>
  );
}
