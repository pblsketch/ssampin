import type { RealtimeWallLayoutMode } from '@domain/entities/RealtimeWall';

export interface RealtimeWallCreateViewProps {
  readonly title: string;
  readonly layoutMode: RealtimeWallLayoutMode;
  readonly columnInputs: string[];
  readonly onTitleChange: (value: string) => void;
  readonly onLayoutModeChange: (value: RealtimeWallLayoutMode) => void;
  readonly onColumnChange: (index: number, value: string) => void;
  readonly onAddColumn: () => void;
  readonly onRemoveColumn: (index: number) => void;
  readonly onStart: () => void;
  readonly onShowPastResults: () => void;
}

export function RealtimeWallCreateView({
  title,
  layoutMode,
  columnInputs,
  onTitleChange,
  onLayoutModeChange,
  onColumnChange,
  onAddColumn,
  onRemoveColumn,
  onStart,
  onShowPastResults,
}: RealtimeWallCreateViewProps) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      {/* 단계 1: 레이아웃 선택 */}
      <section className="rounded-xl border border-sp-border bg-sp-card p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sp-accent text-xs font-bold text-white">1</span>
            <h2 className="text-base font-bold text-sp-text">보드 형태 선택</h2>
          </div>
          <button
            type="button"
            onClick={onShowPastResults}
            className="flex items-center gap-1.5 rounded-lg border border-sp-border bg-sp-surface px-3 py-1.5 text-xs text-sp-muted transition hover:border-sp-accent hover:text-sp-accent"
          >
            <span className="material-symbols-outlined text-[14px]">history</span>
            지난 결과
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => onLayoutModeChange('kanban')}
            className={`relative rounded-xl border p-4 text-left transition ${
              layoutMode === 'kanban'
                ? 'border-sp-accent bg-sp-accent/10 ring-1 ring-sp-accent/30'
                : 'border-sp-border bg-sp-surface hover:border-sp-accent/40'
            }`}
          >
            {layoutMode === 'kanban' && (
              <span className="absolute right-3 top-3 flex h-4 w-4 items-center justify-center rounded-full bg-sp-accent">
                <span className="material-symbols-outlined text-[11px] text-white">check</span>
              </span>
            )}
            <div className="mb-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-sp-accent">view_kanban</span>
              <p className="font-bold text-sp-text">칸반형</p>
            </div>
            <p className="text-sm leading-relaxed text-sp-muted">
              주제별 컬럼에 카드를 나눠 토론 흐름을 정리합니다.
            </p>
          </button>
          <button
            type="button"
            onClick={() => onLayoutModeChange('freeform')}
            className={`relative rounded-xl border p-4 text-left transition ${
              layoutMode === 'freeform'
                ? 'border-sp-accent bg-sp-accent/10 ring-1 ring-sp-accent/30'
                : 'border-sp-border bg-sp-surface hover:border-sp-accent/40'
            }`}
          >
            {layoutMode === 'freeform' && (
              <span className="absolute right-3 top-3 flex h-4 w-4 items-center justify-center rounded-full bg-sp-accent">
                <span className="material-symbols-outlined text-[11px] text-white">check</span>
              </span>
            )}
            <div className="mb-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-sp-accent">dashboard</span>
              <p className="font-bold text-sp-text">자유 배치형</p>
            </div>
            <p className="text-sm leading-relaxed text-sp-muted">
              보드 위에서 카드를 옮기고 크기를 바꾸며 자유롭게 정리합니다.
            </p>
          </button>
        </div>
      </section>

      {/* 단계 2: 제목 입력 */}
      <section className="rounded-xl border border-sp-border bg-sp-card p-5">
        <div className="mb-3 flex items-center gap-2.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sp-accent text-xs font-bold text-white">2</span>
          <h2 className="text-base font-bold text-sp-text">담벼락 제목</h2>
        </div>
        <input
          type="text"
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          maxLength={50}
          placeholder="예: 2학년 3반 주장 모으기"
          className="w-full rounded-lg border border-sp-border bg-sp-bg px-4 py-3 text-sp-text outline-none transition focus:border-sp-accent"
        />
        <p className="mt-2 text-xs text-sp-muted">비워두면 '실시간 담벼락'으로 표시됩니다.</p>
      </section>

      {/* 단계 3: 컬럼 설정 (칸반만) */}
      {layoutMode === 'kanban' && (
        <section className="rounded-xl border border-sp-border bg-sp-card p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sp-accent text-xs font-bold text-white">3</span>
              <h2 className="text-base font-bold text-sp-text">컬럼 이름</h2>
            </div>
            <button
              type="button"
              onClick={onAddColumn}
              disabled={columnInputs.length >= 6}
              className="flex items-center gap-1 rounded-lg border border-sp-border bg-sp-surface px-3 py-1.5 text-xs text-sp-muted transition hover:border-sp-accent hover:text-sp-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-[14px]">add</span>
              컬럼 추가
            </button>
          </div>
          <div className="space-y-2">
            {columnInputs.map((value, index) => (
              <div key={`column-input-${index}`} className="flex items-center gap-2">
                <span className="w-6 shrink-0 text-center text-xs font-bold text-sp-muted">
                  {index + 1}
                </span>
                <input
                  type="text"
                  value={value}
                  onChange={(event) => onColumnChange(index, event.target.value)}
                  placeholder={`컬럼 ${index + 1}`}
                  maxLength={20}
                  className="flex-1 rounded-lg border border-sp-border bg-sp-bg px-3 py-2 text-sm text-sp-text outline-none transition focus:border-sp-accent"
                />
                <button
                  type="button"
                  onClick={() => onRemoveColumn(index)}
                  disabled={columnInputs.length <= 2}
                  className="rounded-lg p-2 text-sp-muted/60 transition hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30"
                  title="삭제"
                >
                  <span className="material-symbols-outlined text-[16px]">delete</span>
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 사용 안내 + 시작 버튼 */}
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="rounded-xl border border-sp-border/60 bg-sp-surface px-4 py-3 text-xs text-sp-muted">
          <p className="mb-1 font-semibold text-sp-muted">이렇게 진행돼요</p>
          <p>담벼락 열기 → 학생에게 링크 공유 → 제출된 카드 승인 → 보드에서 정리</p>
          <p className="mt-1 text-sp-muted/60">교사 PC가 인터넷에 연결되어 있어야 학생이 참여할 수 있습니다.</p>
        </div>
        <button
          type="button"
          onClick={onStart}
          className="rounded-xl bg-sp-accent px-6 py-3 text-sm font-bold text-white shadow-lg shadow-sp-accent/20 transition hover:bg-sp-accent/85"
        >
          담벼락 열기
        </button>
      </div>
    </div>
  );
}
