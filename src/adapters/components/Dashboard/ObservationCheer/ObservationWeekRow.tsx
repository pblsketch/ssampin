/**
 * 관찰 기록 응원 2·3차(ADR-137, 설계 §8.1) — 한 주 정리의 관찰 조각: 월~금 5칸 + 만난 학생 수.
 *
 * 칸은 있음(채움)·빈칸·옅게(아직·쉬는 날) 셋뿐이다. 쉬는 날과 아직은 모양이 같고 읽는 이름으로만
 * 가른다 — 경고색·새 색을 만들지 않는다. 쉬는 날이라도 기록이 있으면 채운다(기록이 이긴다).
 * 학생 이름·학생별 건수는 넣지 않는다.
 */
import type { WeekRecap } from '@adapters/hooks/observationRecap';
import type { WeekDayCellState } from '@domain/rules/observationWeeklySummary';
import { weekStartOf } from '@domain/rules/schoolCalendarDays';
import { toLocalDateString } from '@shared/utils/localDate';

const WEEKDAY_LABELS = ['월', '화', '수', '목', '금'] as const;

const STATE_LABEL: Record<WeekDayCellState, string> = {
  recorded: '기록 있음',
  empty: '기록 없음',
  rest: '쉬는 날',
  future: '아직',
};

function md(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${m ?? ''}월 ${d ?? ''}일`;
}

export function ObservationWeekRow({ recap }: { readonly recap: WeekRecap }): JSX.Element {
  // 다음 등교일에 지난주 정리를 열면 "그 주"라고 말한다.
  const which =
    recap.weekStart === weekStartOf(toLocalDateString(new Date())) ? '이번 주' : '그 주';
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex gap-1.5" role="group" aria-label={`${which} 기록한 날`}>
        {recap.cells.map((c, i) => (
          <div key={c.date} className="flex flex-col items-center gap-1">
            <span aria-hidden className="text-[10px] text-sp-muted">
              {WEEKDAY_LABELS[i]}
            </span>
            <span
              role="img"
              aria-label={`${md(c.date)} · ${STATE_LABEL[c.state]}`}
              className={`h-5 w-5 rounded-sm ${
                c.state === 'recorded'
                  ? 'bg-sp-accent'
                  : c.state === 'empty'
                    ? 'border border-sp-border'
                    : 'border border-sp-border opacity-40'
              }`}
            />
          </div>
        ))}
      </div>
      <p className="text-sm font-medium text-sp-text">
        {which} 만난 학생 {recap.metStudents}명
      </p>
    </div>
  );
}
