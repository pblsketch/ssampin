import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas, PencilBrush, IText, Shadow, Line, Rect, Ellipse, Polygon, Path } from 'fabric';
import type { FabricObject, TPointerEventInfo, TPointerEvent } from 'fabric';
import { BACKGROUND_ASSETS, BACKGROUND_RENDER_KIND } from './types';
import type { ChalkboardMode, GridMode, ShapeKind } from './types';

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

// ── Shape helpers (module scope, pure) ─────────────────
interface ShapeBBox {
  left: number;
  top: number;
  width: number;
  height: number;
  /** 선·화살표처럼 시작·끝점 정보가 의미 있는 도형용 */
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

/** 드래그 시작·현재 포인터 + Shift/Alt 모디파이어로 도형의 바운딩 박스를 계산. */
function computeShapeBBox(
  kind: ShapeKind,
  startX: number,
  startY: number,
  pointerX: number,
  pointerY: number,
  shift: boolean,
  alt: boolean,
): ShapeBBox {
  const rawDx = pointerX - startX;
  const rawDy = pointerY - startY;

  // 선·화살표류: 시작-끝 포인트 자체가 본질. bbox는 부가 정보.
  if (kind === 'line' || kind === 'arrow' || kind === 'arrowDouble') {
    let endX = pointerX;
    let endY = pointerY;
    if (shift) {
      const length = Math.hypot(rawDx, rawDy);
      const angle = Math.atan2(rawDy, rawDx);
      const step = Math.PI / 12; // 15°
      const snapped = Math.round(angle / step) * step;
      endX = startX + Math.cos(snapped) * length;
      endY = startY + Math.sin(snapped) * length;
    }
    let sX = startX;
    let sY = startY;
    if (alt) {
      sX = startX - (endX - startX);
      sY = startY - (endY - startY);
    }
    return {
      left: Math.min(sX, endX),
      top: Math.min(sY, endY),
      width: Math.abs(endX - sX),
      height: Math.abs(endY - sY),
      startX: sX,
      startY: sY,
      endX,
      endY,
    };
  }

  // 박스 기반 도형
  let absDx = Math.abs(rawDx);
  let absDy = Math.abs(rawDy);
  if (shift) {
    const s = Math.max(absDx, absDy);
    absDx = s;
    absDy = s;
  }
  let width: number;
  let height: number;
  let left: number;
  let top: number;
  if (alt) {
    width = absDx * 2;
    height = absDy * 2;
    left = startX - absDx;
    top = startY - absDy;
  } else {
    width = absDx;
    height = absDy;
    left = rawDx < 0 ? startX - absDx : startX;
    top = rawDy < 0 ? startY - absDy : startY;
  }
  return {
    left,
    top,
    width: Math.max(1, width),
    height: Math.max(1, height),
    startX,
    startY,
    endX: pointerX,
    endY: pointerY,
  };
}

/** 도형 종류별로 적합한 Fabric 오브젝트를 생성. bbox 0 치수도 허용해 mouse:down 초기화에 사용. */
function buildShapeForKind(
  kind: ShapeKind,
  bbox: ShapeBBox,
  color: string,
  strokeWidth: number,
): FabricObject {
  const common = {
    stroke: color,
    strokeWidth,
    selectable: false,
    evented: false,
    originX: 'left' as const,
    originY: 'top' as const,
  };
  const w = Math.max(1, bbox.width);
  const h = Math.max(1, bbox.height);
  const l = bbox.left;
  const t = bbox.top;
  const cx = l + w / 2;
  const cy = t + h / 2;

  if (kind === 'line') {
    return new Line([bbox.startX, bbox.startY, bbox.endX, bbox.endY], {
      ...common,
      strokeLineCap: 'round',
    });
  }
  if (kind === 'rect') {
    return new Rect({ ...common, left: l, top: t, width: w, height: h, fill: 'transparent' });
  }
  if (kind === 'roundedRect') {
    const r = Math.min(w, h) * 0.15;
    return new Rect({ ...common, left: l, top: t, width: w, height: h, rx: r, ry: r, fill: 'transparent' });
  }
  if (kind === 'ellipse') {
    return new Ellipse({ ...common, left: l, top: t, rx: w / 2, ry: h / 2, fill: 'transparent' });
  }
  if (kind === 'triangleEq') {
    // 정삼각형: bbox의 작은 쪽 기준으로 fit, 내부 중앙 정렬
    const side = Math.min(w, h * 2 / Math.sqrt(3));
    const triH = side * Math.sqrt(3) / 2;
    const baseY = t + (h + triH) / 2;
    return new Polygon([
      { x: cx - side / 2, y: baseY },
      { x: cx + side / 2, y: baseY },
      { x: cx, y: baseY - triH },
    ], { ...common, fill: 'transparent' });
  }
  if (kind === 'triangleIso') {
    // 이등변: bbox 가득, 꼭짓점은 위쪽 중앙
    return new Polygon([
      { x: l, y: t + h },
      { x: l + w, y: t + h },
      { x: cx, y: t },
    ], { ...common, fill: 'transparent' });
  }
  if (kind === 'triangleRight') {
    // 직각 좌하단, 수직 좌변, 수평 밑변, 빗변은 좌상-우하
    return new Polygon([
      { x: l, y: t },
      { x: l, y: t + h },
      { x: l + w, y: t + h },
    ], { ...common, fill: 'transparent' });
  }
  if (kind === 'diamond') {
    return new Polygon([
      { x: cx, y: t },
      { x: l + w, y: cy },
      { x: cx, y: t + h },
      { x: l, y: cy },
    ], { ...common, fill: 'transparent' });
  }
  if (kind === 'parallelogram') {
    const skew = Math.min(w * 0.25, h * 0.5);
    return new Polygon([
      { x: l + skew, y: t },
      { x: l + w, y: t },
      { x: l + w - skew, y: t + h },
      { x: l, y: t + h },
    ], { ...common, fill: 'transparent' });
  }
  if (kind === 'star') {
    // 5각 별: 10 포인트 (외·내 교대), 시작은 상단
    const outerR = Math.min(w, h) / 2;
    const innerR = outerR * 0.4;
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const a = -Math.PI / 2 + i * (Math.PI / 5); // 36° 간격
      points.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
    return new Polygon(points, { ...common, fill: 'transparent' });
  }
  if (kind === 'heart') {
    const pathStr = [
      `M ${cx} ${t + h * 0.3}`,
      `C ${cx} ${t + h * 0.08}, ${l + w * 0.2} ${t - h * 0.02}, ${l + w * 0.1} ${t + h * 0.28}`,
      `C ${l} ${t + h * 0.55}, ${l + w * 0.25} ${t + h * 0.78}, ${cx} ${t + h}`,
      `C ${l + w * 0.75} ${t + h * 0.78}, ${l + w} ${t + h * 0.55}, ${l + w * 0.9} ${t + h * 0.28}`,
      `C ${l + w * 0.8} ${t - h * 0.02}, ${cx} ${t + h * 0.08}, ${cx} ${t + h * 0.3}`,
      'Z',
    ].join(' ');
    return new Path(pathStr, { ...common, fill: 'transparent' });
  }
  if (kind === 'arrow') {
    const { startX: sX, startY: sY, endX: eX, endY: eY } = bbox;
    const dx = eX - sX;
    const dy = eY - sY;
    const len = Math.hypot(dx, dy);
    if (len < 1) {
      return new Line([sX, sY, sX, sY], { ...common, strokeLineCap: 'round' });
    }
    const ux = dx / len;
    const uy = dy / len;
    const headLen = Math.max(12, strokeWidth * 3);
    const headHalf = Math.max(6, strokeWidth * 1.5);
    const bX = eX - ux * headLen;
    const bY = eY - uy * headLen;
    const nx = -uy;
    const ny = ux;
    const p1x = bX + nx * headHalf;
    const p1y = bY + ny * headHalf;
    const p2x = bX - nx * headHalf;
    const p2y = bY - ny * headHalf;
    const pathStr = `M ${sX} ${sY} L ${bX} ${bY} M ${p1x} ${p1y} L ${eX} ${eY} L ${p2x} ${p2y} Z`;
    return new Path(pathStr, { ...common, fill: color });
  }
  if (kind === 'arrowDouble') {
    const { startX: sX, startY: sY, endX: eX, endY: eY } = bbox;
    const dx = eX - sX;
    const dy = eY - sY;
    const len = Math.hypot(dx, dy);
    if (len < 1) {
      return new Line([sX, sY, sX, sY], { ...common, strokeLineCap: 'round' });
    }
    const ux = dx / len;
    const uy = dy / len;
    const headLen = Math.max(12, strokeWidth * 3);
    const headHalf = Math.max(6, strokeWidth * 1.5);
    const bsX = sX + ux * headLen;
    const bsY = sY + uy * headLen;
    const beX = eX - ux * headLen;
    const beY = eY - uy * headLen;
    const nx = -uy;
    const ny = ux;
    const sH1x = bsX + nx * headHalf;
    const sH1y = bsY + ny * headHalf;
    const sH2x = bsX - nx * headHalf;
    const sH2y = bsY - ny * headHalf;
    const eH1x = beX + nx * headHalf;
    const eH1y = beY + ny * headHalf;
    const eH2x = beX - nx * headHalf;
    const eH2y = beY - ny * headHalf;
    const pathStr = [
      `M ${bsX} ${bsY} L ${beX} ${beY}`,
      `M ${sH1x} ${sH1y} L ${sX} ${sY} L ${sH2x} ${sH2y} Z`,
      `M ${eH1x} ${eH1y} L ${eX} ${eY} L ${eH2x} ${eH2y} Z`,
    ].join(' ');
    return new Path(pathStr, { ...common, fill: color });
  }
  if (kind === 'axes') {
    const r = l + w;
    const b = t + h;
    const headLen = Math.max(10, strokeWidth * 2.5);
    const headHalf = Math.max(5, strokeWidth * 1.2);
    const pathStr = [
      `M ${l} ${cy} L ${r} ${cy}`,
      `M ${cx} ${t} L ${cx} ${b}`,
      // 오른쪽
      `M ${r - headLen} ${cy - headHalf} L ${r} ${cy} L ${r - headLen} ${cy + headHalf} Z`,
      // 왼쪽
      `M ${l + headLen} ${cy - headHalf} L ${l} ${cy} L ${l + headLen} ${cy + headHalf} Z`,
      // 위
      `M ${cx - headHalf} ${t + headLen} L ${cx} ${t} L ${cx + headHalf} ${t + headLen} Z`,
      // 아래
      `M ${cx - headHalf} ${b - headLen} L ${cx} ${b} L ${cx + headHalf} ${b - headLen} Z`,
    ].join(' ');
    return new Path(pathStr, { ...common, fill: color });
  }

  // 안전망 (도달 불가)
  return new Rect({ ...common, left: l, top: t, width: w, height: h, fill: 'transparent' });
}

interface UseChalkCanvasOptions {
  canvasElRef: React.RefObject<HTMLCanvasElement | null>;
  mode: ChalkboardMode;
  color: string;
  penSize: number;
  eraserSize: number;
  boardColor: string;
  shapeKind: ShapeKind;
  /** 도형 1개를 성공적으로 그린 직후 호출. PowerPoint 스타일로 select 모드 자동 전환에 사용. */
  onShapeDrawn?: () => void;
}

/**
 * step 간격으로 total 길이 안에 내부 위치를 중앙 정렬해 배치.
 * 예: total=800 step=40 → [40, 80, ..., 760] (양쪽 20px 여백).
 *     total=825 step=40 → [22.5, 62.5, ..., 802.5] 유사하게 균등.
 * 항상 좌우(또는 상하) 여백이 대칭이 되도록 시작 위치를 계산.
 */
function centeredGridPositions(total: number, step: number): number[] {
  if (step <= 0 || total <= step) return [];
  const count = Math.floor((total - step) / step); // 내부 간격 개수
  const span = count * step;
  const start = (total - span) / 2;
  const result: number[] = [];
  for (let i = 0; i <= count; i++) {
    const pos = start + i * step;
    if (pos > 0 && pos < total) result.push(pos);
  }
  return result;
}

function createGridObjects(w: number, h: number, gridMode: GridMode): Line[] {
  // CSS 경로 배경(지도)은 Fabric에 그리지 않음 — 컨테이너 div가 책임
  if (BACKGROUND_RENDER_KIND[gridMode] !== 'canvas') return [];
  if (gridMode === 'none') return [];

  const lines: Line[] = [];
  const baseOpts = {
    stroke: 'rgba(255,255,255,0.12)',
    strokeWidth: 0.5,
    selectable: false,
    evented: false,
    excludeFromExport: true,
  } as const;

  if (gridMode === 'grid') {
    const step = 40;
    for (const x of centeredGridPositions(w, step)) {
      const l = new Line([x, 0, x, h], baseOpts);
      markGrid(l);
      lines.push(l);
    }
    for (const y of centeredGridPositions(h, step)) {
      const l = new Line([0, y, w, y], baseOpts);
      markGrid(l);
      lines.push(l);
    }
  } else if (gridMode === 'lines') {
    const step = 48;
    for (const y of centeredGridPositions(h, step)) {
      const l = new Line([0, y, w, y], baseOpts);
      markGrid(l);
      lines.push(l);
    }
  } else if (gridMode === 'staff') {
    // 오선지: 5선 한 세트 + 세트 간 공백을 세로로 반복. 악보처럼 좌우 여백을 넉넉히 두어 수평 중앙 정렬.
    const STAFF_LINE_GAP = 14;                              // 선 사이 간격
    const STAFF_SET_HEIGHT = STAFF_LINE_GAP * 4;            // 5선 = 4간격
    const STAFF_SET_GAP = 60;                               // 세트 사이 공백
    const SET_PERIOD = STAFF_SET_HEIGHT + STAFF_SET_GAP;
    const STAFF_WIDTH_RATIO = 0.72;                         // 캔버스 폭의 72%만 사용 → 중앙에 블록처럼 보이게
    const staffWidth = Math.round(w * STAFF_WIDTH_RATIO);
    const xStart = Math.round((w - staffWidth) / 2);
    const xEnd = xStart + staffWidth;
    const opts = { ...baseOpts, stroke: 'rgba(255,255,255,0.35)', strokeWidth: 0.8 } as const;

    // 세로도 중앙 정렬: 캔버스 높이 안에 들어갈 세트 수를 먼저 계산한 뒤 위/아래 여백을 균등 분배
    const MARGIN_Y_MIN = 32;
    const availableH = h - MARGIN_Y_MIN * 2;
    const setsCount = Math.max(1, Math.floor((availableH + STAFF_SET_GAP) / SET_PERIOD));
    const usedH = setsCount * STAFF_SET_HEIGHT + (setsCount - 1) * STAFF_SET_GAP;
    const topMargin = Math.max(MARGIN_Y_MIN, Math.round((h - usedH) / 2));

    for (let s = 0; s < setsCount; s++) {
      const setStart = topMargin + s * SET_PERIOD;
      for (let i = 0; i < 5; i++) {
        const y = setStart + i * STAFF_LINE_GAP;
        const l = new Line([xStart, y, xEnd, y], opts);
        markGrid(l);
        lines.push(l);
      }
    }
  }
  return lines;
}

export function useChalkCanvas({ canvasElRef, mode, color, penSize, eraserSize, boardColor, shapeKind, onShapeDrawn }: UseChalkCanvasOptions) {
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
  const shapeKindRef = useRef<ShapeKind>(shapeKind);
  const onShapeDrawnRef = useRef<(() => void) | undefined>(onShapeDrawn);
  const initializedRef = useRef(false);

  // 도형 드래그 상태
  const shapeDraftRef = useRef<{
    obj: FabricObject;
    kind: ShapeKind;
    startX: number;
    startY: number;
  } | null>(null);

  modeRef.current = mode;
  colorRef.current = color;
  penSizeRef.current = penSize;
  eraserSizeRef.current = eraserSize;
  gridModeRef.current = gridMode;
  shapeKindRef.current = shapeKind;
  onShapeDrawnRef.current = onShapeDrawn;

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
      // text, eraser (object-delete), shape
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

      if (currentMode === 'shape' && !opt.target) {
        // 방어: mode effect 초기 무효화 또는 외부 변경으로 selection=true가
        // 남아있으면 Fabric의 러버밴드가 그려진 도형과 함께 나타난다.
        canvas.selection = false;
        const pointer = getPointerInScene(opt.e as MouseEvent);
        const kind = shapeKindRef.current;
        const strokeColor = colorRef.current;
        const strokeWidth = penSizeRef.current;
        // 0 치수 bbox로 초기 생성 (mouse:move에서 곧바로 재계산).
        const initialBBox: ShapeBBox = {
          left: pointer.x,
          top: pointer.y,
          width: 1,
          height: 1,
          startX: pointer.x,
          startY: pointer.y,
          endX: pointer.x,
          endY: pointer.y,
        };
        const obj = buildShapeForKind(kind, initialBBox, strokeColor, strokeWidth);
        canvas.add(obj);
        shapeDraftRef.current = { obj, kind, startX: pointer.x, startY: pointer.y };
        canvas.renderAll();
      }
    });

    // ── Shape drag: move / up ───────────────────────────
    //   Shift  → 정비율(정사각형/원) + 직선 15° 각도 스냅
    //   Alt    → 시작점을 중심으로 양쪽 대칭 드로잉
    //
    // 포인터 좌표는 canvas.getScenePoint 대신 직접 계산한다.
    // Fabric getScenePoint는 lowerCanvasEl.getBoundingClientRect()만 쓰고
    // CSS size ≠ internal logical size인 상황(Electron HiDPI, 레이아웃 변경 후
    // calcOffset 캐시 스테일, 컨테이너 overflow 등)에서 좌표가 어긋난다.
    // 참고: fabricjs/fabric.js issues #5303, #5430
    const getPointerInScene = (nativeEvent: MouseEvent): { x: number; y: number } => {
      const canvasEl = canvas.lowerCanvasEl;
      const r = canvasEl.getBoundingClientRect();
      const sx = r.width > 0 ? canvas.getWidth() / r.width : 1;
      const sy = r.height > 0 ? canvas.getHeight() / r.height : 1;
      return {
        x: (nativeEvent.clientX - r.left) * sx,
        y: (nativeEvent.clientY - r.top) * sy,
      };
    };

    const updateShapeDraftTo = (pointerX: number, pointerY: number, shift: boolean, alt: boolean) => {
      const draft = shapeDraftRef.current;
      if (!draft) return;
      const bbox = computeShapeBBox(draft.kind, draft.startX, draft.startY, pointerX, pointerY, shift, alt);

      // in-place 업데이트가 가능한 단순 도형은 set()으로 처리 (성능 최적).
      if (draft.kind === 'line') {
        (draft.obj as Line).set({ x1: bbox.startX, y1: bbox.startY, x2: bbox.endX, y2: bbox.endY });
        return;
      }
      if (draft.kind === 'rect' || draft.kind === 'roundedRect') {
        const rectObj = draft.obj as Rect;
        const w = Math.max(1, bbox.width);
        const h = Math.max(1, bbox.height);
        const nextProps: Record<string, number> = { left: bbox.left, top: bbox.top, width: w, height: h };
        if (draft.kind === 'roundedRect') {
          const r = Math.min(w, h) * 0.15;
          nextProps.rx = r;
          nextProps.ry = r;
        }
        rectObj.set(nextProps);
        return;
      }
      if (draft.kind === 'ellipse') {
        (draft.obj as Ellipse).set({
          left: bbox.left,
          top: bbox.top,
          rx: Math.max(1, bbox.width / 2),
          ry: Math.max(1, bbox.height / 2),
        });
        return;
      }

      // Polygon/Path 기반은 remove+recreate. 60fps × 경량 오브젝트 1개라 성능 영향 미미.
      // 색상·굵기는 현재 드래프트 오브젝트에서 읽어 재생성 오브젝트에 그대로 전달.
      const prev = draft.obj as { stroke?: string; strokeWidth?: number };
      const strokeColor = prev.stroke ?? colorRef.current;
      const strokeWidth = prev.strokeWidth ?? penSizeRef.current;
      canvas.remove(draft.obj);
      const newObj = buildShapeForKind(draft.kind, bbox, strokeColor, strokeWidth);
      canvas.add(newObj);
      draft.obj = newObj;
    };

    canvas.on('mouse:move', (opt: TPointerEventInfo<TPointerEvent>) => {
      if (!shapeDraftRef.current) return;
      const nativeEvent = opt.e as MouseEvent;
      const pointer = getPointerInScene(nativeEvent);
      updateShapeDraftTo(pointer.x, pointer.y, nativeEvent.shiftKey === true, nativeEvent.altKey === true);
      // setCoords는 드래프트가 selectable:false라 드래그 중엔 불필요 — 해제 시점에 한 번만.
      // requestRenderAll로 rAF에 병합해 렌더가 mouse 이벤트보다 느려져도 큐잉되지 않도록.
      canvas.requestRenderAll();
    });

    canvas.on('mouse:up', (opt: TPointerEventInfo<TPointerEvent>) => {
      const draft = shapeDraftRef.current;
      if (!draft) return;
      // 캐치업: 해제 시점 커서 위치로 최종 치수 재계산 (mouse:move가 마지막 프레임을 놓쳐도 일치).
      const nativeEvent = opt.e as MouseEvent;
      const pointer = getPointerInScene(nativeEvent);
      updateShapeDraftTo(pointer.x, pointer.y, nativeEvent.shiftKey === true, nativeEvent.altKey === true);
      shapeDraftRef.current = null;
      // remove+recreate 경로에서는 draft.obj가 교체됐을 수 있으므로 최신 참조 사용
      const obj = draft.obj;
      // 드래그 거리가 3px 미만이면 클릭만 한 것으로 간주하고 제거 (모든 도형 공통 기준)
      const dragDist = Math.hypot(pointer.x - draft.startX, pointer.y - draft.startY);
      if (dragDist < 3) {
        canvas.remove(obj);
        canvas.renderAll();
        return;
      }
      // 드래그 중엔 생략했던 setCoords를 이 시점에 한 번 호출 — control handle 위치·히트박스 캐시.
      obj.setCoords();
      // 방금 그린 도형을 select 모드에서 바로 선택 가능하도록 플래그를 켜고
      // 활성 오브젝트로 지정. 그 뒤 onShapeDrawn 콜백이 setMode('select')를
      // 호출하면 mode effect가 모든 오브젝트에 대해 같은 플래그를 재적용한다.
      obj.set({ selectable: true, evented: true });
      canvas.setActiveObject(obj);
      canvas.renderAll();
      pushSnapshot();
      onShapeDrawnRef.current?.();
    });

    // ── 초기 mode 적용 ───────────────────────────────────
    // mode effect는 첫 마운트 시 fabricRef.current가 아직 null이라 조기 반환한다.
    // initCanvas는 rAF 안에서 실행되므로 그 후 mode 변화가 없으면 effect가 다시 돌지 않는다.
    // → canvas 생성 직후 현재 modeRef 기반으로 selection/isDrawingMode를 직접 적용.
    const initialMode = modeRef.current;
    canvas.isDrawingMode = initialMode === 'pen' || initialMode === 'pixelEraser';
    canvas.selection = initialMode === 'select';

    // Initial snapshot
    pushSnapshot();
  }, [canvasElRef, pushSnapshot]);

  // ── Resize ────────────────────────────────────────────
  // window.resize만 들으면 사이드바 토글, 툴 전환, 듀얼모드 split 등 레이아웃
  // 변화에 반응하지 못해 캔버스 CSS 크기 ≠ 내부 logical 크기가 되고
  // Fabric 내부 _offset 캐시가 스테일해져 포인터 좌표가 어긋난다.
  // ResizeObserver로 부모 크기를 직접 관찰하고, 변화 시 calcOffset도 호출.
  useEffect(() => {
    const canvas = fabricRef.current;
    const el = canvasElRef.current;
    if (!el) return;
    const parent = el.parentElement;
    if (!parent) return;

    const sync = () => {
      const c = fabricRef.current;
      if (!c) return;
      const rect = parent.getBoundingClientRect();
      const w = Math.floor(rect.width);
      const h = Math.floor(rect.height);
      if (w > 0 && h > 0 && (c.getWidth() !== w || c.getHeight() !== h)) {
        c.setDimensions({ width: w, height: h });
        redrawGrid();
      }
      c.calcOffset();
    };

    const observer = new ResizeObserver(sync);
    observer.observe(parent);
    window.addEventListener('resize', sync);
    window.addEventListener('scroll', sync, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', sync);
      window.removeEventListener('scroll', sync, true);
    };
    // canvas 의존성은 참조 체크용 (eslint 만족)
    void canvas;
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
    /** 지도 모드에서 컨테이너 div에 주입할 CSS background-image URL. Fabric 경로 모드는 null. */
    currentBackgroundCssUrl: BACKGROUND_ASSETS[gridMode],
    currentPage,
    totalPages,
    goToPage,
    addPage,
    initCanvas,
    deleteSelected,
  };
}
