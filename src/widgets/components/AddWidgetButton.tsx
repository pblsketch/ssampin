interface AddWidgetButtonProps {
  onClick: () => void;
}

/**
 * 위젯 추가 버튼
 * 그리드 끝에 표시되어 설정 드로어를 열 수 있는 진입점
 */
export function AddWidgetButton({ onClick }: AddWidgetButtonProps) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-sp-border/50 bg-sp-card/30 p-6 text-sp-muted hover:border-sp-accent/40 hover:text-sp-accent hover:bg-sp-card/50 transition-all min-h-[120px]"
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
      <span className="text-sm">위젯 추가</span>
    </button>
  );
}
