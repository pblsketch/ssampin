import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { ToolLayout } from './ToolLayout';
import { ChalkboardToolbar } from './Chalkboard/ChalkboardToolbar';
import { useChalkCanvas } from './Chalkboard/useChalkCanvas';
import { CHALK_COLORS, BOARD_BACKGROUNDS } from './Chalkboard/types';
import type { ChalkboardMode, GridMode } from './Chalkboard/types';
import type { KeyboardShortcut } from './types';

interface ToolChalkboardProps {
  onBack: () => void;
  isFullscreen: boolean;
}

export function ToolChalkboard({ onBack, isFullscreen }: ToolChalkboardProps) {
  const [mode, setMode] = useState<ChalkboardMode>('pen');
  const [penSize, setPenSize] = useState(20);
  const [colorIndex, setColorIndex] = useState(0);
  const [boardColorIndex, setBoardColorIndex] = useState(0);

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
      { key: 'e', label: '지우개', description: '지우개 모드', handler: () => setMode('eraser') },
      { key: 'z', label: '실행취소', description: '실행취소', modifiers: { ctrl: true }, handler: handleUndo },
      { key: 'y', label: '다시실행', description: '다시실행', modifiers: { ctrl: true }, handler: handleRedo },
      { key: 's', label: '저장', description: '이미지 저장', modifiers: { ctrl: true }, handler: saveAsImage },
      { key: '[', label: '크기 줄이기', description: '펜 크기 줄이기', handler: () => setPenSize((s) => Math.max(10, s - 5)) },
      { key: ']', label: '크기 키우기', description: '펜 크기 키우기', handler: () => setPenSize((s) => Math.min(80, s + 5)) },
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
          />
        </div>
      </div>
    </ToolLayout>
  );
}
