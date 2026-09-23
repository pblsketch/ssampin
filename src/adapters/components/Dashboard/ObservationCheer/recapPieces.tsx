/**
 * 관찰 기록 응원 2·3차(ADR-137, spec §8) — 한 주 정리·학기 돌아보기의 **조각 목록**.
 *
 * 조각마다 고유 이름·순서·제목·(그 주·그 학기에 보여 줄지)·내용을 가진다. 보여 주지 않을 때는
 * null 을 돌려준다. 관찰 조각이 첫 조각이다.
 *
 * ★다른 작업(수업 진도·상담·할 일 조각, 학교 달력 순간)은 아래 목록에 조각 만드는 함수를 **더하기만**
 *   하면 된다. 틀(`RecapModalFrame`)·창은 고치지 않는다. 그 조각이 쓰는 자료는 함수 안에서 스토어를
 *   읽어도 된다(창을 열 때마다 다시 만든다).
 */
import type { RecapCard, TermRecap, WeekRecap } from '@adapters/hooks/observationRecap';
import type { RecapPiece } from './RecapModalFrame';
import { GrassGrid } from './MyGrassSection';
import { ObservationWeekRow } from './ObservationWeekRow';

export const RARELY_USES_SCENES_LINE = '장면을 골라 두면 여기서 고르게 쌓였는지 볼 수 있어요';
export const EMPTY_CURRENT_TERM_LINE = '이번 학기는 아직 기록이 없어요';
export const EMPTY_PAST_TERM_LINE = '지난 학기는 기록이 없었어요';

/**
 * 카드 줄 오른쪽 — 끝낸 바퀴가 있으면 "한 바퀴 N번", 없으면 이번 학기에는 "한 바퀴까지 N명"(1차 카드
 * 머리글과 같은 말), 지난 학기에는 아무것도 적지 않는다. "0번"은 실패로 읽히므로 내지 않는다.
 */
function lapLine(c: RecapCard): string | null {
  if (c.completedLaps > 0) return `한 바퀴 ${c.completedLaps}번`;
  if (c.remaining !== null && c.remaining > 0) return `한 바퀴까지 ${c.remaining}명`;
  return null;
}

// ── 한 주 정리 ──

export interface WeeklyRecapContext {
  readonly week: string;
  /** 관찰 조각 — 그 주 기록이 없으면 null */
  readonly observation: WeekRecap | null;
}

export type WeeklyPieceProvider = (ctx: WeeklyRecapContext) => RecapPiece | null;

const observationWeekPiece: WeeklyPieceProvider = ({ observation }) =>
  observation === null
    ? null
    : {
        id: 'observation',
        order: 0,
        title: null,
        render: () => <ObservationWeekRow recap={observation} />,
      };

/** 한 주 정리 조각 목록 — 다른 작업은 여기에 더한다. */
export const WEEKLY_RECAP_PIECES: readonly WeeklyPieceProvider[] = [observationWeekPiece];

/**
 * 그 주 정리에 보여 줄 조각이 하나라도 있는가 — 먼저 거는 말이 '알릴지'를 이것으로 정한다(spec §8).
 * 조각을 더하면 알림 판단도 저절로 따라온다.
 */
export function weeklyRecapHasContent(week: string, observation: WeekRecap | null): boolean {
  return collectPieces(WEEKLY_RECAP_PIECES, { week, observation }).length > 0;
}

// ── 학기 돌아보기 ──

export interface TermRecapContext {
  readonly recap: TermRecap;
  /** 한 주 정리와 겹친 날에만 — '이번 주' 조각 */
  readonly thisWeek: WeekRecap | null;
  readonly onGoDraft: (card: RecapCard) => void;
}

export type TermPieceProvider = (ctx: TermRecapContext) => RecapPiece | null;

const termGrassPiece: TermPieceProvider = ({ recap }) => ({
  id: 'termGrass',
  order: 0,
  title: '학기 잔디',
  render: () => (
    <div className="space-y-3">
      <GrassGrid weeks={recap.grassWeeks} label={`${recap.termLabel} 평일 기록`} />
      {recap.recordedWeeks > 0 ? (
        <p className="text-sm font-medium text-sp-text">기록한 주 {recap.recordedWeeks}주</p>
      ) : (
        <p className="text-sm text-sp-muted">
          {recap.isCurrent ? EMPTY_CURRENT_TERM_LINE : EMPTY_PAST_TERM_LINE}
        </p>
      )}
      {recap.recordedWeeks > 0 && recap.cards.length > 0 && (
        <ul className="space-y-1.5">
          {recap.cards.map((c) => (
            <li
              key={c.card}
              className="flex items-center justify-between gap-3 rounded-lg bg-sp-surface px-3 py-2 text-sm"
            >
              <span className="min-w-0 truncate text-sp-text">{c.title}</span>
              <span className="shrink-0 text-sp-muted">
                {lapLine(c)}
                {c.completedLaps > 0 && c.completedLaps <= 5 && (
                  <span aria-hidden className="ml-1.5 text-sp-accent">
                    {'●'.repeat(c.completedLaps)}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  ),
});

function ScenePills({
  label,
  scenes,
  dashed,
}: {
  readonly label: string;
  readonly scenes: readonly string[];
  readonly dashed: boolean;
}): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-sp-muted">{label}</span>
      {scenes.map((s) => (
        <span
          key={s}
          className={
            dashed
              ? 'rounded-full border border-dashed border-sp-border px-2 py-0.5 text-sp-muted'
              : 'rounded-full border border-sp-border px-2 py-0.5 text-sp-text'
          }
        >
          {s}
        </span>
      ))}
    </div>
  );
}

const scenePiece: TermPieceProvider = ({ recap }) =>
  recap.cards.length === 0
    ? null
    : {
        id: 'scene',
        order: 10,
        title: '장면',
        render: () => (
          <div className="space-y-2">
            {recap.cards.map((c) => (
              <div key={c.card} className="rounded-lg bg-sp-surface px-3 py-2 text-sm">
                <p className="mb-1.5 font-medium text-sp-text">{c.title}</p>
                {c.scenes.rarelyUsesScenes ? (
                  <p className="text-xs text-sp-muted">{RARELY_USES_SCENES_LINE}</p>
                ) : (
                  <div className="space-y-1">
                    {c.scenes.topScenes.length > 0 && (
                      <ScenePills
                        label="자주 담은 장면"
                        scenes={c.scenes.topScenes}
                        dashed={false}
                      />
                    )}
                    {c.scenes.emptyDefaultScenes.length > 0 && (
                      <ScenePills
                        label="아직 없는 장면"
                        scenes={c.scenes.emptyDefaultScenes}
                        dashed
                      />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ),
      };

const draftReadyPiece: TermPieceProvider = ({ recap, onGoDraft }) =>
  !recap.isCurrent || recap.cards.length === 0
    ? null
    : {
        id: 'draftReady',
        order: 20,
        title: '초안 준비',
        render: () => (
          <div className="space-y-2">
            {recap.cards.map((c) => (
              <div key={c.card} className="rounded-lg bg-sp-surface px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate font-medium text-sp-text">{c.title}</span>
                  {!c.scenes.rarelyUsesScenes && c.readiness !== null && (
                    <span className="shrink-0 text-sp-muted">{c.readiness.readyCount}명 준비</span>
                  )}
                </div>
                {/* 장면을 거의 안 쓰는 반은 숫자·명단을 숨긴다 — 안내 한 줄은 '장면' 조각에 이미 있어 되풀이하지 않는다. */}
                {!c.scenes.rarelyUsesScenes &&
                  c.readiness !== null &&
                  c.readiness.notReady.length > 0 && (
                    <div
                      className="mt-1.5 flex flex-wrap items-center gap-1"
                      role="group"
                      aria-label="장면이 더 필요한 학생"
                    >
                      <span aria-hidden className="mr-0.5 shrink-0 text-xs text-sp-muted">
                        장면이 더 필요한 학생
                      </span>
                      {c.readiness.notReady.map((s) => {
                        const name =
                          s.displayName.length > 0
                            ? `${s.label}번 ${s.displayName}`
                            : `${s.label}번 학생`;
                        return (
                          <span
                            key={s.ref}
                            role="img"
                            tabIndex={0}
                            aria-label={name}
                            className="group relative flex h-6 min-w-[1.5rem] items-center justify-center rounded-md border border-sp-border px-1 text-[11px] text-sp-text outline-none focus-visible:ring-2 focus-visible:ring-sp-accent"
                          >
                            {s.label}
                            {/* 이름은 마우스·키보드 초점에서만(spec 1-3) */}
                            {s.displayName.length > 0 && (
                              <span
                                aria-hidden
                                data-sp-floating
                                className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-sp-border bg-sp-card px-2 py-0.5 text-caption text-sp-text opacity-0 shadow-sp-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
                              >
                                {s.displayName}
                              </span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}
                <button
                  type="button"
                  onClick={() => onGoDraft(c)}
                  className="mt-2 rounded-lg border border-sp-border px-3 py-1 text-xs text-sp-text transition-colors hover:border-sp-accent"
                >
                  초안 쓰러 가기
                </button>
              </div>
            ))}
          </div>
        ),
      };

const thisWeekPiece: TermPieceProvider = ({ thisWeek }) =>
  thisWeek === null
    ? null
    : {
        id: 'thisWeek',
        order: 30,
        title: '이번 주',
        render: () => <ObservationWeekRow recap={thisWeek} />,
      };

/** 학기 돌아보기 조각 목록 — 다른 작업은 여기에 더한다. */
export const TERM_RECAP_PIECES: readonly TermPieceProvider[] = [
  termGrassPiece,
  scenePiece,
  draftReadyPiece,
  thisWeekPiece,
];

/** 목록의 조각을 만들고, 보여 주지 않을 조각은 뺀다. */
export function collectPieces<C>(
  providers: readonly ((ctx: C) => RecapPiece | null)[],
  ctx: C,
): RecapPiece[] {
  const out: RecapPiece[] = [];
  for (const make of providers) {
    const piece = make(ctx);
    if (piece !== null) out.push(piece);
  }
  return out;
}
