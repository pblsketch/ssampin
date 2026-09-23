/**
 * 내 잔디 — 이번 학기 평일마다 관찰 기록한 학생 수를 진하기로만 보여 준다(ADR-135).
 *
 * ★칸에 숫자·이름을 적지 않는다. 진하기는 `bg-sp-accent` + `opacity-*`로 낸다 —
 *   `bg-sp-accent/40` 같은 색 뒤 투명도는 CSS 가 만들어지지 않는다.
 * ★주말 칸은 없다(연속 셈에는 들어간다). 학기 밖 날은 자리만 비워 둔다.
 */
import { grassLevel } from '@domain/rules/observationStreak';
import type { MyGrassView } from '@adapters/hooks/useObservationCheer';

/** 잔디 칸 하나(1차 내 잔디·학기 돌아보기 공용). */
export interface GrassGridDay {
  readonly date: string;
  readonly count: number;
  readonly future: boolean;
  readonly inTerm: boolean;
}

const WEEKDAY_LABELS = ['월', '화', '수', '목', '금'] as const;

const LEVEL_CLASS: Record<0 | 1 | 2 | 3, string> = {
  0: 'border border-sp-border',
  1: 'bg-sp-accent opacity-30',
  2: 'bg-sp-accent opacity-70',
  3: 'bg-sp-accent',
};

function dayLabel(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${m ?? ''}월 ${d ?? ''}일`;
}

function GrassCell({ day }: { readonly day: GrassGridDay }): JSX.Element {
  if (!day.inTerm) return <span aria-hidden className="h-3.5 w-3.5" />;
  if (day.future) {
    return (
      <span
        role="img"
        aria-label={`${dayLabel(day.date)} · 아직 오지 않음`}
        className="h-3.5 w-3.5 rounded-sm border border-sp-border opacity-40"
      />
    );
  }
  return (
    <span
      role="img"
      aria-label={`${dayLabel(day.date)} · 기록 ${day.count}명`}
      className={`h-3.5 w-3.5 rounded-sm ${LEVEL_CLASS[grassLevel(day.count)]}`}
    />
  );
}

interface MyGrassSectionProps {
  readonly weeks: MyGrassView['weeks'];
  /** 그리드 아래 한 줄 — 오늘의 응원이 있으면 응원, 없으면 연속 주 문구 */
  readonly lineText: string;
}

export function MyGrassSection({ weeks, lineText }: MyGrassSectionProps): JSX.Element {
  return (
    <section className="rounded-xl border border-sp-border bg-sp-card p-3" aria-label="내 기록">
      <h4 className="mb-2 text-sm font-sp-semibold text-sp-text">내 기록</h4>
      <GrassGrid weeks={weeks} label="이번 학기 평일 기록" />
      <p className="mt-2 text-sm font-medium text-sp-text">{lineText}</p>
    </section>
  );
}

/** 잔디 그리드 — 요일 머리 + 주마다 한 줄(학기 돌아보기도 같은 그리드를 쓴다, ADR-137). */
export function GrassGrid({
  weeks,
  label,
}: {
  readonly weeks: readonly { readonly weekStart: string; readonly days: readonly GrassGridDay[] }[];
  readonly label: string;
}): JSX.Element {
  return (
    <div className="flex gap-1.5">
      <div aria-hidden className="flex shrink-0 flex-col gap-0.5">
        {WEEKDAY_LABELS.map((w) => (
          <span key={w} className="flex h-3.5 items-center text-[10px] leading-none text-sp-muted">
            {w}
          </span>
        ))}
      </div>
      <div className="min-w-0 overflow-x-auto pb-1">
        <div role="group" aria-label={label} className="flex gap-0.5">
          {weeks.map((w) => (
            <div key={w.weekStart} className="flex flex-col gap-0.5">
              {w.days.map((d) => (
                <GrassCell key={d.date} day={d} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
