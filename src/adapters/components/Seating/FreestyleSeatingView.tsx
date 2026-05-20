/**
 * FreestyleSeatingView — 자유 배치 모드 책상 렌더링 + 인터랙션
 *
 * 책임:
 * - `freestyleDesks` 정규화 좌표(0~1000)를 컨테이너 픽셀 좌표로 변환해 absolute 위치 렌더
 * - 컨테이너 종횡비 16:10 + max-height (viewport 잘림 방지)
 * - 교탁 위치 표시 (상단 중앙)
 * - 빈 책상(`studentId: null`) 시각적 표시
 * - 회전된 책상 가로/세로 swap + 텍스트 정방향 보정
 * - 모둠(groupId) 색상 외곽선 + 배경
 *
 * 편집 모드 인터랙션 (Figma 스타일):
 * - 단일 책상 드래그 → 그 책상만 이동 (또는 다른 책상에 drop 시 학생 swap)
 * - 책상 클릭 → 단일 선택, Shift+클릭 → 토글
 * - 빈 공간 드래그 → 사각 선택 박스 (영역 안 책상 모두 선택)
 * - 빈 공간 클릭 → 선택 해제
 * - 선택된 책상 중 하나 드래그 → 선택 전체가 같은 거리만큼 평행 이동
 * - ESC → 선택 해제
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FreestyleDesk } from '@domain/entities/Seating';
import { GROUP_COLORS } from '@domain/entities/Seating';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useSeatingStore } from '@adapters/stores/useSeatingStore';

interface FreestyleSeatingViewProps {
  desks: readonly FreestyleDesk[];
  /** 교사 시점 여부 — Phase 4+ 도입 예정. MVP 는 무시. */
  isTeacherView?: boolean;
  /** 편집 모드 — true 일 때 책상 드래그 이동·다중 선택·학생 swap 가능 */
  isEditing?: boolean;
}

const DRAG_PREFIX = 'freestyle:';

const NAME_SIZE_CLASS: Record<'sm' | 'md' | 'lg' | 'xl', string> = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
  xl: 'text-lg',
};

/** 드래그 박스 인식 임계 — 이보다 작으면 클릭으로 간주 */
const SELECTION_BOX_THRESHOLD_PX = 5;

export function FreestyleSeatingView({ desks, isEditing }: FreestyleSeatingViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [dragOverDeskId, setDragOverDeskId] = useState<string | null>(null);
  const getStudent = useStudentStore((s) => s.getStudent);
  const nameSize = useSettingsStore((s) => s.settings.seatingNameSize ?? 'sm');
  const nameSizeClass = NAME_SIZE_CLASS[nameSize];
  const moveFreestyleDesk = useSeatingStore((s) => s.moveFreestyleDesk);
  const moveMultipleFreestyleDesks = useSeatingStore((s) => s.moveMultipleFreestyleDesks);
  const swapFreestyleStudents = useSeatingStore((s) => s.swapFreestyleStudents);

  /* ─── 선택 상태 ─── */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  /** 화면 픽셀 좌표 기준 선택 박스 (드래그 중) */
  const [selectionBox, setSelectionBox] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  /** 선택 박스 드래그 시작 픽셀 좌표 */
  const selectionStartRef = useRef<{ x: number; y: number; shift: boolean } | null>(null);

  /* ─── 드래그(이동) 컨텍스트 — HTML5 dragstart 에서 채워지고 drop 에서 소비 ─── */
  const dragSourceRef = useRef<{
    /** 함께 이동할 desk id 목록 (단일 또는 다중) */
    ids: string[];
    /** 드래그 시작 시 정규화 좌표 (마우스 위치) */
    startNorm: { x: number; y: number };
    /** 각 desk 의 시작 시점 정규화 좌표 */
    initialPositions: Map<string, { x: number; y: number }>;
  } | null>(null);

  /** groupId → 색상 매핑 (clusters 프리셋에서 같은 모둠 시각적 묶음) */
  const groupColorMap = useMemo(() => {
    const map = new Map<string, string>();
    const uniqueGroupIds: string[] = [];
    for (const d of desks) {
      if (d.groupId && !map.has(d.groupId)) {
        uniqueGroupIds.push(d.groupId);
        map.set(d.groupId, GROUP_COLORS[uniqueGroupIds.length - 1] ?? GROUP_COLORS[0]!);
      }
    }
    return map;
  }, [desks]);

  /** 컨테이너 픽셀 → 정규화 좌표 (0~1000) 변환 */
  const pxToNorm = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    const x = ((clientX - rect.left) / rect.width) * 1000;
    const y = ((clientY - rect.top) / rect.height) * 1000;
    return { x, y };
  }, []);

  /* ─── 책상 클릭 — 단일 선택 / Shift 토글 ─── */
  const handleDeskPointerDown = useCallback(
    (e: React.PointerEvent, desk: FreestyleDesk) => {
      if (!isEditing) return;
      // 책상 자체 pointerdown 은 캔버스 선택 박스 시작을 막아야 한다
      e.stopPropagation();
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (e.shiftKey) {
          if (next.has(desk.id)) next.delete(desk.id);
          else next.add(desk.id);
          return next;
        }
        // 이미 다중 선택 안에 포함된 책상을 그냥 클릭한 경우는 선택 유지(그룹 드래그 준비)
        if (next.size > 1 && next.has(desk.id)) return next;
        return new Set([desk.id]);
      });
    },
    [isEditing],
  );

  /* ─── HTML5 dragstart — 단일 또는 다중 이동 컨텍스트 설정 ─── */
  const handleDragStart = useCallback(
    (e: React.DragEvent, desk: FreestyleDesk) => {
      if (!isEditing) return;
      e.dataTransfer.effectAllowed = 'move';
      const startNorm = pxToNorm(e.clientX, e.clientY);
      if (!startNorm) return;
      // 다중 선택에 이 책상이 포함되면 모두 함께 이동, 아니면 이 책상만
      const ids =
        selectedIds.has(desk.id) && selectedIds.size > 1 ? Array.from(selectedIds) : [desk.id];
      const initialPositions = new Map<string, { x: number; y: number }>();
      for (const id of ids) {
        const d = desks.find((dx) => dx.id === id);
        if (d) initialPositions.set(id, { x: d.x, y: d.y });
      }
      dragSourceRef.current = { ids, startNorm, initialPositions };
      e.dataTransfer.setData('text/plain', `${DRAG_PREFIX}group:${ids.join(',')}`);
    },
    [isEditing, selectedIds, desks, pxToNorm],
  );

  const handleDragOverDesk = useCallback(
    (e: React.DragEvent, desk: FreestyleDesk) => {
      if (!isEditing) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDragOverDeskId(desk.id);
    },
    [isEditing],
  );

  /** 다중 그룹 이동 적용 — drop 좌표와 시작 좌표 사이 delta 평행 이동 */
  const applyGroupDelta = useCallback(
    (clientX: number, clientY: number) => {
      const src = dragSourceRef.current;
      if (!src) return false;
      const endNorm = pxToNorm(clientX, clientY);
      if (!endNorm) return false;
      const dx = endNorm.x - src.startNorm.x;
      const dy = endNorm.y - src.startNorm.y;
      if (src.ids.length === 1) {
        // 단일 책상은 정확한 마우스 위치로 이동
        void moveFreestyleDesk(src.ids[0]!, endNorm.x, endNorm.y);
      } else {
        const updates = src.ids.map((id) => {
          const start = src.initialPositions.get(id)!;
          return { id, x: start.x + dx, y: start.y + dy };
        });
        void moveMultipleFreestyleDesks(updates);
      }
      return true;
    },
    [moveFreestyleDesk, moveMultipleFreestyleDesks, pxToNorm],
  );

  const handleDropOnDesk = useCallback(
    (e: React.DragEvent, targetDesk: FreestyleDesk) => {
      if (!isEditing) return;
      e.preventDefault();
      e.stopPropagation();
      setDragOverDeskId(null);
      const src = dragSourceRef.current;
      if (!src) return;
      // 다중 선택 중에는 swap 비활성, delta 이동만 적용
      if (src.ids.length > 1) {
        applyGroupDelta(e.clientX, e.clientY);
        dragSourceRef.current = null;
        return;
      }
      const sourceDeskId = src.ids[0];
      if (!sourceDeskId || sourceDeskId === targetDesk.id) {
        dragSourceRef.current = null;
        return;
      }
      void swapFreestyleStudents(sourceDeskId, targetDesk.id);
      dragSourceRef.current = null;
    },
    [isEditing, applyGroupDelta, swapFreestyleStudents],
  );

  const handleDropOnCanvas = useCallback(
    (e: React.DragEvent) => {
      if (!isEditing) return;
      e.preventDefault();
      if (dragSourceRef.current) {
        applyGroupDelta(e.clientX, e.clientY);
        dragSourceRef.current = null;
      }
    },
    [isEditing, applyGroupDelta],
  );

  /* ─── 빈 공간 pointerdown — 선택 박스 시작 또는 선택 해제 ─── */
  const handleCanvasPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!isEditing) return;
      // 책상이 stopPropagation 했으므로 이 핸들러는 빈 공간에서만 도달
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      selectionStartRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        shift: e.shiftKey,
      };
      setSelectionBox({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        w: 0,
        h: 0,
      });
    },
    [isEditing],
  );

  const handleCanvasPointerMove = useCallback((e: React.PointerEvent) => {
    if (!selectionStartRef.current) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const curX = e.clientX - rect.left;
    const curY = e.clientY - rect.top;
    const start = selectionStartRef.current;
    setSelectionBox({
      x: Math.min(start.x, curX),
      y: Math.min(start.y, curY),
      w: Math.abs(curX - start.x),
      h: Math.abs(curY - start.y),
    });
  }, []);

  const handleCanvasPointerUp = useCallback(() => {
    if (!selectionStartRef.current) return;
    const box = selectionBox;
    const isClick =
      !box || (box.w < SELECTION_BOX_THRESHOLD_PX && box.h < SELECTION_BOX_THRESHOLD_PX);
    const shift = selectionStartRef.current.shift;

    if (isClick) {
      // 빈 공간 단순 클릭 — 선택 해제 (Shift 면 유지)
      if (!shift) setSelectedIds(new Set());
    } else if (box) {
      // 선택 박스 안에 들어온 책상 모두 선택
      const rect = containerRef.current?.getBoundingClientRect();
      const newSelected = new Set<string>();
      if (rect) {
        for (const d of desks) {
          const px = (d.x / 1000) * rect.width;
          const py = (d.y / 1000) * rect.height;
          if (px >= box.x && px <= box.x + box.w && py >= box.y && py <= box.y + box.h) {
            newSelected.add(d.id);
          }
        }
      }
      setSelectedIds((prev) => {
        if (shift) {
          // Shift 누른 박스 → 기존 선택에 추가
          const merged = new Set(prev);
          newSelected.forEach((id) => merged.add(id));
          return merged;
        }
        return newSelected;
      });
    }

    selectionStartRef.current = null;
    setSelectionBox(null);
  }, [selectionBox, desks]);

  /* ─── ESC → 선택 해제 ─── */
  useEffect(() => {
    if (!isEditing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedIds(new Set());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isEditing]);

  /* ─── 편집 모드 해제 시 선택도 해제 ─── */
  useEffect(() => {
    if (!isEditing) setSelectedIds(new Set());
  }, [isEditing]);

  /* ─── 컨테이너 크기 측정 ─── */
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  if (desks.length === 0) {
    return (
      <div className="w-full max-w-6xl mx-auto">
        <div
          className="relative w-full rounded-xl border border-dashed border-sp-border bg-sp-card/30 flex items-center justify-center"
          style={{ aspectRatio: '16 / 10', maxHeight: 'min(62vh, 640px)' }}
        >
          <div className="text-center px-6">
            <span className="material-symbols-outlined text-5xl text-sp-muted mb-3 block">
              add_chart
            </span>
            <p className="text-base text-sp-text font-medium mb-1">자유 배치를 시작해 보세요</p>
            <p className="text-sm text-sp-muted">
              프리셋(일제식·모둠·ㄷ자형 등)을 선택하면 책상이 자동으로 배치됩니다.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const selectedCount = selectedIds.size;

  return (
    <div className="w-full max-w-6xl mx-auto">
      {/* 다중 선택 안내 칩 — 편집 모드에서 1개 이상 선택 시 노출 */}
      {isEditing && selectedCount > 0 && (
        <div className="mb-2 flex items-center justify-between px-3 py-2 rounded-lg bg-sp-accent/10 border border-sp-accent/30 text-sm">
          <span className="text-sp-accent font-medium">
            <span className="material-symbols-outlined text-base align-middle mr-1">
              check_circle
            </span>
            {selectedCount}개 책상 선택됨 — 하나를 끌면 함께 이동합니다 (ESC 로 해제)
          </span>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="text-sp-muted hover:text-sp-text text-xs px-2 py-1 rounded-md hover:bg-sp-surface transition-colors"
          >
            선택 해제
          </button>
        </div>
      )}

      <div
        className="relative w-full rounded-xl border border-sp-border bg-sp-card/30 overflow-hidden"
        style={{ aspectRatio: '16 / 10', maxHeight: 'min(62vh, 640px)' }}
      >
        {/* 교탁 표시는 상위 Seating 페이지(보드)가 「[ 교 탁 ]」 헤더로 이미 그리므로
            컨테이너 내부 교탁 칩은 제거 (사용자 요청: 자유 모드에서 교탁 중복 노출) */}

        <div
          ref={containerRef}
          className={`relative w-full h-full ${isEditing ? 'cursor-crosshair' : ''}`}
          onDragOver={(e) => {
            if (isEditing) e.preventDefault();
          }}
          onDrop={handleDropOnCanvas}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
        >
          {/* 선택 박스 시각화 */}
          {selectionBox &&
            (selectionBox.w >= SELECTION_BOX_THRESHOLD_PX ||
              selectionBox.h >= SELECTION_BOX_THRESHOLD_PX) && (
              <div
                className="absolute pointer-events-none border-2 border-sp-accent bg-sp-accent/10"
                style={{
                  left: `${selectionBox.x}px`,
                  top: `${selectionBox.y}px`,
                  width: `${selectionBox.w}px`,
                  height: `${selectionBox.h}px`,
                }}
              />
            )}

          {desks.map((desk) => {
            const left = (desk.x / 1000) * size.width;
            const top = (desk.y / 1000) * size.height;
            const student = getStudent(desk.studentId);
            const isEmpty = desk.studentId === null;
            const rotation = desk.rotation ?? 0;
            const isDragOver = dragOverDeskId === desk.id;
            const isSelected = selectedIds.has(desk.id);
            const groupColor = desk.groupId ? groupColorMap.get(desk.groupId) : undefined;

            const baseBorderClass = isDragOver
              ? 'border-sp-accent ring-2 ring-sp-accent/50 bg-sp-accent/10'
              : isSelected
                ? 'border-sp-accent ring-2 ring-sp-accent/70'
                : isEmpty
                  ? 'border-dashed border-sp-border bg-sp-surface/50'
                  : 'border-sp-border bg-sp-card hover:border-sp-accent/50';

            return (
              <div
                key={desk.id}
                draggable={isEditing}
                onPointerDown={(e) => handleDeskPointerDown(e, desk)}
                onDragStart={(e) => handleDragStart(e, desk)}
                onDragOver={(e) => handleDragOverDesk(e, desk)}
                onDragLeave={() => setDragOverDeskId((id) => (id === desk.id ? null : id))}
                onDrop={(e) => handleDropOnDesk(e, desk)}
                className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-lg border p-2 shadow-sm transition-colors ${baseBorderClass} ${
                  isEditing ? 'cursor-move' : 'cursor-default'
                }`}
                style={{
                  left: `${left}px`,
                  top: `${top}px`,
                  ...(rotation === 90 || rotation === 270
                    ? { width: 56, minHeight: 88 }
                    : { width: 88, minHeight: 56 }),
                  transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
                  ...(groupColor && !isDragOver && !isSelected
                    ? {
                        borderTop: `3px solid ${groupColor}`,
                        background: `${groupColor}10`,
                      }
                    : {}),
                }}
              >
                <div
                  className="flex flex-col items-center gap-0.5 w-full"
                  style={rotation !== 0 ? { transform: `rotate(${-rotation}deg)` } : undefined}
                >
                  {isEmpty ? (
                    <span className="text-xs text-sp-muted">빈자리</span>
                  ) : (
                    <>
                      {/* 학번 + 출석 dot (격자 모드 SeatCard 와 동일 시각 규칙) */}
                      <div className="w-full flex items-center justify-between gap-1 leading-none">
                        <span className="text-[10px] font-mono text-sp-muted">
                          {student?.studentNumber !== undefined
                            ? String(student.studentNumber).padStart(2, '0')
                            : '--'}
                        </span>
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.4)]"
                          title="출석"
                        />
                      </div>
                      {/* 학생 이름 */}
                      <span
                        className={`${nameSizeClass} font-medium text-sp-text leading-tight text-center truncate w-full`}
                      >
                        {student?.name ?? '알 수 없음'}
                      </span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
