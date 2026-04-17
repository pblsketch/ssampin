import { DUAL_TOOL_LIST, type DualToolId, type ToolMeta } from './toolRegistry';

interface DualToolPickerProps {
  exclude: readonly DualToolId[];
  onSelect: (id: DualToolId) => void;
  /** Picker 자체를 닫을 때(슬롯 자체는 유지하고 교체 취소) */
  onCancel?: () => void;
  /** 반대 슬롯에 도구가 있을 때만 활성. Picker 상태 슬롯 헤더에서 사용 */
  onSwapSlot?: () => void;
  canSwapSlot?: boolean;
  onCloseSlot: () => void;
  /** 슬롯 헤더 제목 (예: "우측 슬롯") */
  headerHint?: string;
}

export function DualToolPicker({
  exclude,
  onSelect,
  onSwapSlot,
  canSwapSlot,
  onCloseSlot,
  headerHint,
}: DualToolPickerProps) {
  const available = DUAL_TOOL_LIST.filter((t) => !exclude.includes(t.id));

  return (
    <div className="h-full flex flex-col">
      {/* 슬롯 헤더 — Tool 로드되지 않은 상태의 간이 헤더 */}
      <div className="flex items-center justify-between mb-4 px-1">
        <h2 className="text-base font-bold text-sp-text flex items-center gap-2">
          <span className="material-symbols-outlined text-icon-md">construction</span>
          <span>도구 선택</span>
          {headerHint && <span className="text-xs text-sp-muted ml-1">· {headerHint}</span>}
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onSwapSlot}
            disabled={!canSwapSlot}
            className="p-2 rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-text/5 transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-sp-muted"
            title={canSwapSlot ? '좌우 전환' : '반대 슬롯이 비어 있어 사용할 수 없습니다'}
            aria-label="좌우 슬롯 전환"
          >
            <span className="material-symbols-outlined text-icon-lg">swap_vert</span>
          </button>
          <button
            type="button"
            onClick={onCloseSlot}
            className="p-2 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all"
            title="슬롯 닫기"
            aria-label="이 슬롯 닫기"
          >
            <span className="material-symbols-outlined text-icon-lg">close</span>
          </button>
        </div>
      </div>

      {/* 도구 카드 그리드 */}
      <div className="flex-1 min-h-0 overflow-auto">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pr-1">
          {available.map((tool) => (
            <ToolPickerCard key={tool.id} tool={tool} onSelect={() => onSelect(tool.id)} />
          ))}
        </div>
        {available.length === 0 && (
          <div className="flex items-center justify-center h-full text-sp-muted text-sm">
            선택 가능한 도구가 없습니다
          </div>
        )}
      </div>
    </div>
  );
}

interface ToolPickerCardProps {
  tool: ToolMeta;
  onSelect: () => void;
}

function ToolPickerCard({ tool, onSelect }: ToolPickerCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="bg-sp-card rounded-xl p-4 text-left border border-transparent hover:border-sp-accent/40 hover:scale-[1.02] transition-all group"
    >
      <div className="text-3xl mb-2">{tool.emoji}</div>
      <h3 className="text-sm font-bold text-sp-text group-hover:text-sp-accent transition-colors">
        {tool.name}
      </h3>
    </button>
  );
}
