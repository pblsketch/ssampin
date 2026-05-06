import { useEffect, useRef, useState } from 'react';
import {
  MAX_GRID_CELLS,
  MAX_GRID_DIMENSION,
  MIN_GRID_DIMENSION,
  type DesktopOrganizeConfig,
  type GridDimension,
} from '@domain/entities/DesktopOrganizeConfig';
import { validateGridDimensions } from '@usecases/desktopOrganize/validateGridDimensions';
import type { GridResizePlan } from '@usecases/desktopOrganize/computeGridResizePlan';
import { PresetButton } from './PresetButton';
import { NumberInput } from './NumberInput';

interface DesktopOrganizeGridSettingsProps {
  readonly anchorRect: DOMRect | null;
  readonly currentConfig: DesktopOrganizeConfig;
  readonly planResize: (cols: GridDimension, rows: GridDimension) => GridResizePlan | null;
  readonly onApply: (plan: GridResizePlan) => void;
  readonly onToggleBoxTransparent: (boxTransparent: boolean) => void;
  readonly onClose: () => void;
}

const PRESETS: ReadonlyArray<{ cols: GridDimension; rows: GridDimension; label: string }> = [
  { cols: 1, rows: 3, label: '1×3' },
  { cols: 3, rows: 1, label: '3×1' },
  { cols: 2, rows: 2, label: '2×2' },
];

/**
 * 그리드 설정 팝오버.
 * - 프리셋 3종 클릭 시 즉시 cols/rows 미리 설정 (적용은 별도)
 * - 직접 입력 (1~6, 합 ≤ 12)
 * - 잘리는 박스 안내 (사용자 확인은 ConfirmGridResizeModal에서)
 *
 * 외부 클릭 시 자동 닫기. 카드 우상단 ⚙️ 버튼 anchorRect 기준 절대 위치.
 */
export function DesktopOrganizeGridSettings({
  anchorRect,
  currentConfig,
  planResize,
  onApply,
  onToggleBoxTransparent,
  onClose,
}: DesktopOrganizeGridSettingsProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState<number>(currentConfig.cols);
  const [rows, setRows] = useState<number>(currentConfig.rows);

  // 외부 클릭으로 닫기
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (!popoverRef.current) return;
      if (e.target instanceof Node && popoverRef.current.contains(e.target)) return;
      onClose();
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [onClose]);

  // ESC로 닫기
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const validation = validateGridDimensions(cols, rows);
  const totalCells = cols * rows;

  // plan 미리 계산 (잘림 안내용) — 검증 통과 시에만
  const plan: GridResizePlan | null = validation.ok
    ? planResize(validation.cols, validation.rows)
    : null;

  const willChange = plan !== null && (plan.to.cols !== currentConfig.cols || plan.to.rows !== currentConfig.rows);
  const hasTruncation = plan !== null && plan.truncated.length > 0;

  const handleApply = () => {
    if (!plan || !validation.ok) return;
    if (!willChange) {
      onClose();
      return;
    }
    onApply(plan);
  };

  // 위치 계산: anchor 우측 정렬, 8px 아래
  const popoverWidth = 280;
  const top = anchorRect ? anchorRect.bottom + 8 : 80;
  const right = anchorRect
    ? Math.max(8, window.innerWidth - anchorRect.right)
    : 16;

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="그리드 설정"
      style={{
        position: 'fixed',
        top,
        right,
        width: popoverWidth,
        zIndex: 50,
      }}
      className="rounded-xl bg-sp-card border border-sp-border shadow-2xl p-4"
    >
      <h3 className="text-sm font-bold text-sp-text mb-3">그리드 구성</h3>

      {/* 프리셋 */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {PRESETS.map((preset) => (
          <PresetButton
            key={preset.label}
            cols={preset.cols}
            rows={preset.rows}
            active={cols === preset.cols && rows === preset.rows}
            onClick={() => {
              setCols(preset.cols);
              setRows(preset.rows);
            }}
          />
        ))}
      </div>

      <hr className="border-sp-border/40 my-3" />

      {/* 직접 입력 */}
      <p className="text-xs text-sp-muted mb-2">직접 설정</p>
      <div className="flex items-center gap-2 mb-2">
        <NumberInput
          value={cols}
          min={MIN_GRID_DIMENSION}
          max={MAX_GRID_DIMENSION}
          onChange={setCols}
          label="가로"
        />
        <span className="text-sp-muted">×</span>
        <NumberInput
          value={rows}
          min={MIN_GRID_DIMENSION}
          max={MAX_GRID_DIMENSION}
          onChange={setRows}
          label="세로"
        />
      </div>

      {/* 검증 결과 */}
      {validation.ok ? (
        <p className="text-xs text-sp-muted">→ {totalCells}칸 생성</p>
      ) : (
        <p className="text-xs text-red-400">{validation.reason}</p>
      )}

      {/* 잘림 경고 */}
      {hasTruncation && plan && (
        <div className="mt-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/30">
          <p className="text-xs text-red-300 leading-snug">
            <span className="font-bold">박스 {plan.truncated.map((t) => t.index + 1).join(', ')}</span>
            의 제목이 사라집니다 ({plan.truncated.map((t) => `"${t.title}"`).join(', ')})
          </p>
        </div>
      )}

      <hr className="border-sp-border/40 my-3" />

      {/* 박스 스타일 토글 */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-xs font-medium text-sp-text">박스 내부 투명</span>
          <span className="text-[11px] text-sp-muted leading-tight">
            {currentConfig.boxTransparent
              ? '바탕화면 아이콘이 그대로 보여요'
              : '박스 영역을 색으로 구분해요'}
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={currentConfig.boxTransparent}
          aria-label="박스 내부 투명 토글"
          onClick={() => onToggleBoxTransparent(!currentConfig.boxTransparent)}
          className={[
            'relative w-10 h-5 rounded-full transition-colors motion-reduce:transition-none shrink-0',
            currentConfig.boxTransparent ? 'bg-sp-accent' : 'bg-sp-border',
          ].join(' ')}
        >
          <span
            className={[
              'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-sp-text transition-transform motion-reduce:transition-none',
              currentConfig.boxTransparent ? 'translate-x-5' : 'translate-x-0',
            ].join(' ')}
          />
        </button>
      </div>

      {/* 액션 버튼 */}
      <div className="flex gap-2 mt-4">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 px-3 py-2 rounded-lg text-sm text-sp-muted hover:text-sp-text transition-colors motion-reduce:transition-none"
        >
          취소
        </button>
        <button
          type="button"
          onClick={handleApply}
          disabled={!validation.ok || totalCells > MAX_GRID_CELLS}
          className="flex-1 px-3 py-2 rounded-lg bg-sp-accent text-sm font-medium text-white hover:bg-sp-accent/90 transition-colors motion-reduce:transition-none disabled:opacity-50 disabled:cursor-not-allowed"
        >
          적용
        </button>
      </div>
    </div>
  );
}
