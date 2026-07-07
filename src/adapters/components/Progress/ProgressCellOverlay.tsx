import type { ProgressEntry, ProgressStatus } from '@domain/entities/CurriculumProgress';
import type { WeeklyProgressCell } from '@domain/rules/progressCalendarRules';

/**
 * 진도 셀 오버레이 — A안(시간표 오버레이)과 B안(캘린더 셀)이 공유하는
 * 한 칸(반·날짜·교시)의 진도 표현 비주얼.
 *
 * - 반 매칭 실패(공강/자습/미매칭): 아무것도 렌더하지 않는다.
 * - 진도 등록됨: 대표 상태 배지 + 단원 > 차시 요약 + (있으면) 반 진도율 칩.
 * - 진도 미등록(반 매칭은 성공): 은은한 "+" 어포던스.
 *
 * 색상은 전부 sp-* 테마 토큰(라이트/다크 모두 정상)만 사용한다.
 * `text-white`는 이 프로젝트에서 라이트 모드에 sp-text(어두움)로 강제 치환되므로(index.css) 쓰지 않는다.
 */
export interface ProgressCellOverlayProps {
  cell: WeeklyProgressCell;
  /** 이 셀의 반의 '전체' 진도 요약(진도율 칩용). 없으면 칩 숨김 */
  classSummary?: { completed: number; total: number; percent: number };
  /** 빈 칸(반 매칭 성공·진도 미등록) "+" 클릭 */
  onAddClick?: () => void;
  /** 진도 항목 클릭(상태 순환/편집 진입) */
  onEntryClick?: () => void;
  /** A안 오버레이용: 절대배치로 기존 시간표 셀 위에 얹힘. B안은 false(정적 흐름) */
  asOverlay?: boolean;
}

const STATUS_LABEL: Record<ProgressStatus, string> = {
  completed: '완료',
  planned: '예정',
  skipped: '미실시',
};

/** 상태 배지 색상 — Tailwind 컬러(green/blue/amber) 알파. sp 토큰이 아니므로 정상 생성됨 */
const STATUS_BADGE: Record<ProgressStatus, string> = {
  completed: 'bg-green-500/20 text-green-400',
  planned: 'bg-blue-500/20 text-blue-400',
  skipped: 'bg-amber-500/20 text-amber-400',
};

/** 대표 상태 우선순위: 완료 > 미실시 > 예정 */
const STATUS_PRIORITY: readonly ProgressStatus[] = ['completed', 'skipped', 'planned'];

function pickRepresentativeEntry(entries: readonly ProgressEntry[]): ProgressEntry | null {
  if (entries.length === 0) return null;
  for (const status of STATUS_PRIORITY) {
    const found = entries.find((e) => e.status === status);
    if (found) return found;
  }
  return entries[0] ?? null;
}

export function ProgressCellOverlay({
  cell,
  classSummary,
  onAddClick,
  onEntryClick,
  asOverlay = false,
}: ProgressCellOverlayProps) {
  // 공강/자습/미매칭 — 진도 표현 대상이 아니므로 아무것도 렌더하지 않는다
  if (cell.matchedClass === null) return null;

  const representative = pickRepresentativeEntry(cell.entries);

  if (!representative) {
    // 반 매칭은 됐지만 진도 미등록 — 은은한 "+" 어포던스
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onAddClick?.();
        }}
        title="진도 추가"
        aria-label="진도 추가"
        className={
          asOverlay
            ? 'absolute bottom-1 right-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-sp-accent text-white shadow transition-transform hover:scale-110'
            : 'flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-sp-border py-1 text-xs text-sp-muted transition-colors hover:border-sp-accent hover:text-sp-accent'
        }
      >
        <span className="material-symbols-outlined text-icon-sm leading-none">add</span>
        {!asOverlay && '진도 추가'}
      </button>
    );
  }

  const summaryText =
    representative.unit && representative.lesson
      ? `${representative.unit} > ${representative.lesson}`
      : representative.unit || representative.lesson || '';

  const content = (
    <>
      <span
        className={`shrink-0 rounded px-1.5 py-0.5 text-micro font-bold ${STATUS_BADGE[representative.status]}`}
      >
        {STATUS_LABEL[representative.status]}
      </span>
      {summaryText && (
        <span className="min-w-0 flex-1 truncate text-left text-detail text-sp-text">
          {summaryText}
        </span>
      )}
      {classSummary && classSummary.total > 0 && (
        <span className="shrink-0 rounded-full bg-black/10 px-1.5 py-0.5 text-micro font-semibold text-sp-accent dark:bg-white/10">
          {classSummary.percent}%
        </span>
      )}
    </>
  );

  if (asOverlay) {
    // 시간표 셀 위: 불투명 sp-card 스트립으로 얹어 어떤 과목색 위에서도 읽히게 한다
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onEntryClick?.();
        }}
        title={summaryText || STATUS_LABEL[representative.status]}
        className="absolute inset-x-0 bottom-0 z-10 flex items-center gap-1 rounded-b-lg border-t border-sp-border bg-sp-card px-1.5 py-1 shadow-sm transition-colors hover:bg-sp-surface"
      >
        {content}
      </button>
    );
  }

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onEntryClick?.();
      }}
      title={summaryText || STATUS_LABEL[representative.status]}
      className="flex w-full items-center gap-1 rounded-lg px-1 py-1 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/10"
    >
      {content}
    </button>
  );
}
