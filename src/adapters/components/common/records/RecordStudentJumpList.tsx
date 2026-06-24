/**
 * 조회 화면 좌측 학생 점프 리스트 (공용 · 읽기 전용).
 *
 * 학생 단위로 빠르게 이동하는 좌측 컬럼. 카운트·경고는 호출부가 주입(domain 무관)하므로
 * 담임/수업 양쪽이 같은 부품을 쓸 수 있다. 선택 키는 호출부의 식별키(담임=Student.id,
 * 수업=studentKey) 그대로 — 변환·병합하지 않는다.
 */
interface JumpListItem {
  /** 학생 식별키(원본 그대로). */
  readonly key: string;
  /** 표시 이름. */
  readonly label: string;
  /** 표시 번호(출석번호 등). */
  readonly number?: number;
  /** 기록 건수. */
  readonly count: number;
  /** 경고 점 표시 여부. */
  readonly hasWarning?: boolean;
  /** 경고 점 툴팁. */
  readonly warningTitle?: string;
}

interface RecordStudentJumpListProps {
  items: readonly JumpListItem[];
  /** 선택된 학생 키('' = 전체). */
  selectedKey: string;
  onSelect: (key: string) => void;
  /** 헤더 라벨(기본: "학생 목록"). */
  title?: string;
}

export type { JumpListItem };

export function RecordStudentJumpList({
  items,
  selectedKey,
  onSelect,
  title = '학생 목록',
}: RecordStudentJumpListProps) {
  return (
    <div className="w-[180px] shrink-0 rounded-xl bg-sp-card flex flex-col min-h-0">
      <div className="px-3 py-2.5 border-b border-sp-border shrink-0">
        <h4 className="text-xs font-bold text-sp-text flex items-center gap-1.5">
          <span className="material-symbols-outlined text-sm">people</span>
          {title}
        </h4>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* 전체 보기 */}
        <button
          onClick={() => onSelect('')}
          className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sp-accent ${
            !selectedKey
              ? 'bg-sp-accent/10 text-sp-accent font-bold'
              : 'text-sp-muted hover:bg-sp-surface hover:text-sp-text'
          }`}
        >
          <span className="material-symbols-outlined text-sm">group</span>
          전체
        </button>

        {items.map((item, idx) => {
          const isSelected = selectedKey === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onSelect(item.key)}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sp-accent ${
                isSelected
                  ? 'bg-sp-accent/10 text-sp-accent font-bold'
                  : item.count > 0
                    ? 'text-sp-text hover:bg-sp-surface'
                    : 'text-sp-muted/50 hover:bg-sp-surface hover:text-sp-muted'
              }`}
            >
              <span className="w-5 text-right tabular-nums text-xs shrink-0">
                {item.number ?? idx + 1}
              </span>
              <span className="truncate flex-1 text-left">{item.label}</span>
              <div className="flex items-center gap-1 shrink-0">
                {item.hasWarning && (
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-red-400"
                    title={item.warningTitle}
                    aria-label={item.warningTitle ?? '주의 필요'}
                  />
                )}
                {item.count > 0 && (
                  <span
                    className={`text-xs tabular-nums ${isSelected ? 'text-sp-accent' : 'text-sp-muted'}`}
                  >
                    {item.count}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
