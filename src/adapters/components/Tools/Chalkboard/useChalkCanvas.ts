import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas, PencilBrush, IText, Shadow, Line } from 'fabric';
import type { TPointerEventInfo, TPointerEvent } from 'fabric';
import type { ChalkboardMode, GridMode } from './types';

const MAX_HISTORY = 50;
const MAX_PAGES = 20;
const GRID_TAG = '__grid__';
const ERASER_TAG = '__eraser__';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isGrid(obj: any): boolean {
  return obj?.[GRID_TAG] === true;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function markGrid(obj: any): void {
  obj[GRID_TAG] = true;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isEraserStroke(obj: any): boolean {
  return obj?.[ERASER_TAG] === true;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function markEraserStroke(obj: any): void {
  obj[ERASER_TAG] = true;
}

interface UseChalkCanvasOptions {
  canvasElRef: React.RefObject<HTMLCanvasElement | null>;
  mode: ChalkboardMode;
  color: string;
  penSize: number;
  eraserSize: number;
  boardColor: string;
}

function createGridObjects(w: number, h: number, gridMode: GridMode): Line[] {
  if (gridMode === 'none') return [];
  const lines: Line[] = [];
  const opts = {
    stroke: 'rgba(255,255,255,0.12)',
    strokeWidth: 0.5,
    selectable: false,
    evented: false,
    excludeFromExport: true,
  } as const;

  if (gridMode === 'grid') {
    const step = 40;
    for (let x = step; x < w; x += step) {
      const l = new Line([x, 0, x, h], opts);
      markGrid(l);
      lines.push(l);
    }
    for (let y = step; y < h; y += step) {
      const l = new Line([0, y, w, y], opts);
      markGrid(l);
      lines.push(l);
    }
  } else if (gridMode === 'lines') {
    const step = 48;
    for (let y = step; y < h; y += step) {
      const l = new Line([0, y, w, y], opts);
      markGrid(l);
      lines.push(l);
    }
  }
  return lines;
}

export function useChalkCanvas({ canvasElRef, mode, color, penSize, eraserSize, boardColor }: UseChalkCanvasOptions) {
  const fabricRef = useRef<Canvas | null>(null);
  const [gridMode, setGridMode] = useState<GridMode>('none');
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const history = useRef<string[]>([]);
  const historyIndex = useRef(-1);
  const pages = useRef<(string | null)[]>([null]);
  const skipSnapshotRef = useRef(false);
  const modeRef = useRef<ChalkboardMode>(mode);
  const colorRef = useRef(color);
  const penSizeRef = useRef(penSize);
  const eraserSizeRef = useRef(eraserSize);
  const gridModeRef = useRef<GridMode>('none');
  const initializedRef = useRef(false);

  modeRef.current = mode;
  colorRef.current = color;
  penSizeRef.current = penSize;
  eraserSizeRef.current = eraserSize;
  gridModeRef.current = gridMode;

  // ── Snapshot (undo/redo) ──────────────────────────────
  const updateUndoRedoState = useCallback(() => {
    setCanUndo(historyIndex.current > 0);
    setCanRedo(historyIndex.current < history.current.length - 1);
  }, []);

  const pushSnapshot = useCallback(() => {
    if (skipSnapshotRef.current) return;
    const canvas = fabricRef.current;
    if (!canvas) return;
    const json = JSON.stringify(canvas.toJSON());
    history.current = history.current.slice(0, historyIndex.current + 1);
    history.current.push(json);
    if (history.current.length > MAX_HISTORY) {
      history.current.shift();
    } else {
      historyIndex.current++;
    }
    updateUndoRedoState();
  }, [updateUndoRedoState]);

  const loadState = useCallback(async (json: string) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    skipSnapshotRef.current = true;
    await canvas.loadFromJSON(json);
    // Re-mark eraser strokes after JSON load (custom tag is lost through serialization)
    canvas.getObjects().forEach((obj) => {
      if (obj.globalCompositeOperation === 'destination-out') {
        markEraserStroke(obj);
        obj.selectable = false;
        obj.evented = false;
      }
    });
    canvas.renderAll();
    skipSnapshotRef.current = false;
  }, []);

  const undo = useCallback(async () => {
    if (historyIndex.current <= 0) return;
    historyIndex.current--;
    const json = history.current[historyIndex.current];
    if (json) await loadState(json);
    updateUndoRedoState();
  }, [loadState, updateUndoRedoState]);

  const redo = useCallback(async () => {
    if (historyIndex.current >= history.current.length - 1) return;
    historyIndex.current++;
    const json = history.current[historyIndex.current];
    if (json) await loadState(json);
    updateUndoRedoState();
  }, [loadState, updateUndoRedoState]);

  const clearAll = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.getObjects().forEach((obj) => {
      if (!isGrid(obj)) {
        canvas.remove(obj);
      }
    });
    canvas.discardActiveObject();
    canvas.renderAll();
    pushSnapshot();
  }, [pushSnapshot]);

  // ── Grid ──────────────────────────────────────────────
  const redrawGrid = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    // Remove old grid
    canvas.getObjects().forEach((obj) => {
      if (isGrid(obj)) {
        canvas.remove(obj);
      }
    });
    // Add new grid
    const w = canvas.getWidth();
    const h = canvas.getHeight();
    const lines = createGridObjects(w, h, gridModeRef.current);
    lines.forEach((l) => canvas.add(l));
    // Send grid to back
    lines.forEach((l) => canvas.sendObjectToBack(l));
    canvas.renderAll();
  }, []);

  useEffect(() => {
    redrawGrid();
  }, [gridMode, redrawGrid]);

  // ── Save as image ─────────────────────────────────────
  const saveAsImage = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    // Temporarily set background for export
    const prevBg = canvas.backgroundColor;
    canvas.backgroundColor = boardColor;
    canvas.renderAll();
    const dataUrl = canvas.toDataURL({ format: 'png', quality: 1, multiplier: 1 });
    canvas.backgroundColor = prevBg;
    canvas.renderAll();
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = '\uce60\ud310_' + new Date().toISOString().slice(0, 10) + '.png';
    a.click();
  }, [boardColor]);

  // ── Multi-page ────────────────────────────────────────
  const saveCurrentPage = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    // Exclude grid from page save
    const gridObjects = canvas.getObjects().filter((o) => isGrid(o));
    gridObjects.forEach((o) => canvas.remove(o));
    pages.current[currentPage] = JSON.stringify(canvas.toJSON());
    gridObjects.forEach((o) => canvas.add(o));
  }, [currentPage]);

  const goToPage = useCallback(async (n: number) => {
    if (n < 0 || n >= pages.current.length) return;
    const canvas = fabricRef.current;
    if (!canvas) return;
    saveCurrentPage();
    // Clear non-grid objects
    skipSnapshotRef.current = true;
    canvas.getObjects().forEach((obj) => {
      if (!isGrid(obj)) {
        canvas.remove(obj);
      }
    });
    const pageData = pages.current[n];
    if (pageData) {
      await canvas.loadFromJSON(pageData);
    }
    canvas.discardActiveObject();
    canvas.renderAll();
    skipSnapshotRef.current = false;
    setCurrentPage(n);
    // Reset history for new page
    history.current = [];
    historyIndex.current = -1;
    pushSnapshot();
    redrawGrid();
  }, [saveCurrentPage, pushSnapshot, redrawGrid]);

  const addPage = useCallback(() => {
    if (pages.current.length >= MAX_PAGES) return;
    const canvas = fabricRef.current;
    if (!canvas) return;
    saveCurrentPage();
    pages.current.push(null);
    const newIdx = pages.current.length - 1;
    setTotalPages(pages.current.length);
    // Clear non-grid objects
    skipSnapshotRef.current = true;
    canvas.getObjects().forEach((obj) => {
      if (!isGrid(obj)) {
        canvas.remove(obj);
      }
    });
    canvas.discardActiveObject();
    canvas.renderAll();
    skipSnapshotRef.current = false;
    setCurrentPage(newIdx);
    history.current = [];
    historyIndex.current = -1;
    pushSnapshot();
  }, [saveCurrentPage, pushSnapshot]);

  // ── Delete selected ───────────────────────────────────
  const deleteSelected = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObjects();
    if (active.length === 0) return;
    active.forEach((obj) => {
      if (!isGrid(obj)) {
        canvas.remove(obj);
      }
    });
    canvas.discardActiveObject();
    canvas.renderAll();
    pushSnapshot();
  }, [pushSnapshot]);

  // ── Mode switching ────────────────────────────────────
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    if (mode === 'pen' || mode === 'pixelEraser') {
      canvas.isDrawingMode = true;
      canvas.selection = false;
      canvas.discardActiveObject();
      canvas.renderAll();
    } else if (mode === 'select') {
      canvas.isDrawingMode = false;
      canvas.selection = true;
      // Make all non-grid/non-eraser objects selectable
      canvas.getObjects().forEach((obj) => {
        if (!isGrid(obj) && !isEraserStroke(obj)) {
          obj.selectable = true;
          obj.evented = true;
        }
      });
    } else {
      // text or eraser (object-delete)
      canvas.isDrawingMode = false;
      canvas.selection = false;
      canvas.discardActiveObject();
      canvas.getObjects().forEach((obj) => {
        if (!isGrid(obj) && !isEraserStroke(obj)) {
          obj.selectable = false;
          obj.evented = mode === 'eraser'; // eraser needs click events
        }
      });
      canvas.renderAll();
    }
  }, [mode]);

  // ── Update brush properties ───────────────────────────
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const brush = new PencilBrush(canvas);
    if (mode === 'pixelEraser') {
      // Fully opaque — destination-out will cut through 100% (no semi-transparent remnants)
      brush.color = '#000000';
      brush.width = eraserSize;
      brush.shadow = null;
    } else {
      brush.color = color;
      brush.width = penSize;
      brush.shadow = new Shadow({
        blur: 3,
        offsetX: 0,
        offsetY: 0,
        color: color + '40',
      });
    }
    canvas.freeDrawingBrush = brush;
  }, [color, penSize, eraserSize, mode]);

  // ── Apply style to selected objects ───────────────────
  const applyStyleToSelected = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas || modeRef.current !== 'select') return;
    const active = canvas.getActiveObjects();
    if (active.length === 0) return;
    let changed = false;
    active.forEach((obj) => {
      if (obj instanceof IText) {
        obj.set({ fontSize: Math.max(16, penSize * 1.5), fill: color });
        changed = true;
      } else if (!isGrid(obj) && !isEraserStroke(obj)) {
        obj.set({ stroke: color, strokeWidth: penSize });
        changed = true;
      }
    });
    if (changed) {
      canvas.renderAll();
      pushSnapshot();
    }
  }, [color, penSize, pushSnapshot]);

  useEffect(() => {
    applyStyleToSelected();
  }, [applyStyleToSelected]);

  // ── Initialize ────────────────────────────────────────
  const initCanvas = useCallback(() => {
    const el = canvasElRef.current;
    if (!el || initializedRef.current) return;
    initializedRef.current = true;

    const parent = el.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const w = Math.floor(rect.width);
    const h = Math.floor(rect.height);

    el.width = w;
    el.height = h;

    const canvas = new Canvas(el, {
      isDrawingMode: false,
      backgroundColor: 'transparent',
      selection: true,
      preserveObjectStacking: true,
      width: w,
      height: h,
    });

    // Chalk-style brush
    const brush = new PencilBrush(canvas);
    brush.color = colorRef.current;
    brush.width = penSizeRef.current;
    brush.shadow = new Shadow({
      blur: 3,
      offsetX: 0,
      offsetY: 0,
      color: colorRef.current + '40',
    });
    canvas.freeDrawingBrush = brush;

    fabricRef.current = canvas;

    // ── Event: IText 비율 왜곡 방지 (복원된 텍스트에도 적용) ──
    const textScalingAttached = new WeakSet<IText>();
    canvas.on('object:added', ({ target }) => {
      if (target instanceof IText && !textScalingAttached.has(target)) {
        target.set({ lockScalingFlip: true });
        target.on('scaling', () => {
          const newFontSize = Math.round(target.fontSize * target.scaleX);
          target.set({ fontSize: Math.max(12, newFontSize), scaleX: 1, scaleY: 1 });
        });
        textScalingAttached.add(target);
      }
    });

    // ── Event: after drawing path ───────────────────────
    canvas.on('path:created', (e: { path: unknown }) => {
      const path = e.path as {
        globalCompositeOperation?: GlobalCompositeOperation;
        selectable?: boolean;
        evented?: boolean;
        shadow?: unknown;
        set?: (props: Record<string, unknown>) => void;
      };
      if (modeRef.current === 'pixelEraser' && path) {
        // Mark as eraser stroke: cuts through existing content
        path.globalCompositeOperation = 'destination-out';
        path.selectable = false;
        path.evented = false;
        path.shadow = null;
        markEraserStroke(path);
      }
      pushSnapshot();
    });

    canvas.on('object:modified', () => {
      pushSnapshot();
    });

    // ── Event: mouse down for text/eraser ───────────────
    canvas.on('mouse:down', (opt: TPointerEventInfo<TPointerEvent>) => {
      const currentMode = modeRef.current;

      if (currentMode === 'text' && !opt.target) {
        const pointer = canvas.getScenePoint(opt.e);
        const text = new IText('', {
          left: pointer.x,
          top: pointer.y,
          fontSize: Math.max(16, penSizeRef.current * 1.5),
          fill: colorRef.current,
          fontFamily: "'Noto Sans KR', sans-serif",
          editable: true,
          lockScalingFlip: true,
        });
        // Resize → fontSize 변환 (비율 왜곡 방지)
        text.on('scaling', () => {
          const newFontSize = Math.round(text.fontSize * text.scaleX);
          text.set({
            fontSize: Math.max(12, newFontSize),
            scaleX: 1,
            scaleY: 1,
          });
        });
        canvas.add(text);
        canvas.setActiveObject(text);
        text.enterEditing();
        // Snapshot after editing ends
        text.on('editing:exited', () => {
          if (!text.text || text.text.trim() === '') {
            canvas.remove(text);
          }
          pushSnapshot();
        });
      }

      if (currentMode === 'eraser' && opt.target) {
        if (!isGrid(opt.target)) {
          canvas.remove(opt.target);
          canvas.renderAll();
          pushSnapshot();
        }
      }
    });

    // Initial snapshot
    pushSnapshot();
  }, [canvasElRef, pushSnapshot]);

  // ── Resize ────────────────────────────────────────────
  useEffect(() => {
    const handleResize = () => {
      const canvas = fabricRef.current;
      const el = canvasElRef.current;
      if (!canvas || !el) return;
      const parent = el.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      canvas.setDimensions({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
      redrawGrid();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [canvasElRef, redrawGrid]);

  // ── Cleanup ───────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (fabricRef.current) {
        fabricRef.current.dispose();
        fabricRef.current = null;
        initializedRef.current = false;
      }
    };
  }, []);

  return {
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
  };
}
