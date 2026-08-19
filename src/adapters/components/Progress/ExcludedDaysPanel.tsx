/**
 * 차시 숫자의 **근거**를 여는 패널 — 뺀 날과 넣은 날을 둘 다 보여준다.
 *
 * ## 넣은 날을 함께 여는 이유
 *
 * 뺀 날만 보여 주면 **과대 추정 쪽 오차를 사용자가 확인할 방법이 없다.** 이 계산은 시간표
 * 매칭에 기대는데, 그 매칭은 교실 이름 부분 일치까지 허용한다 — `'3-1'`이 `'3-10'`에 걸린다.
 * 하루씩 볼 때는 눈앞에서 바로 알아채던 오차가, 학기 100일을 하나의 숫자로 접으면 보이지 않는다.
 *
 * 그래서 **어떤 근거로 넣었는지**를 날짜마다 표시한다:
 * - 1단계(교실+과목 일치) — 표시 없음. 확실한 날이다.
 * - 2단계(교실 이름만 일치) · 3단계(우리 반 시간표 추정) — **점선 왼쪽 테두리 + 칩**으로 구분.
 *
 * 구분에 색을 쓰지 않은 이유는 두 가지다. 3개 테마(라이트·다크·뉴트럴)에서 색 대비를 모두
 * 보장하기 어렵고, 무엇보다 **빨간색은 오류처럼 읽힌다.** 이 날들은 틀린 게 아니라 "덜 확실한"
 * 날이다. 겁주지 않으면서 눈에 띄어야 해서 선의 질감으로 표현했다.
 *
 * 날짜가 100개를 넘을 수 있어 월 단위로 접는다.
 */

import { useMemo, useState } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { resolvePeriodLabel } from '@domain/rules/periodLabel';
import type { LessonCountView } from '@adapters/hooks/useLessonCountEstimate';
import type { ProgressMatchStage } from '@domain/rules/progressMatching';

interface ExcludedDaysPanelProps {
  readonly view: LessonCountView;
  /** 되돌리기 — 그날을 수업일로 되살리거나(hasLesson) 다시 뺀다(noLesson). null이면 정정 해제. */
  readonly onAdjust: (date: string, kind: 'hasLesson' | 'noLesson' | null) => void;
}

type Section = 'excluded' | 'included';

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** '2026-09-07' → '9/7(월)' */
function formatDateKo(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (m === null) return iso;
  const d = new Date(`${iso}T00:00:00`);
  const day = Number.isNaN(d.getTime()) ? '' : `(${DAY_LABELS[d.getDay()]})`;
  return `${Number(m[2])}/${Number(m[3])}${day}`;
}

/** '2026-09-07' → '2026년 9월' */
function monthKeyKo(iso: string): string {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(iso);
  return m === null ? iso : `${m[1]}년 ${Number(m[2])}월`;
}

const STAGE_NOTE: Record<Exclude<ProgressMatchStage, 1>, string> = {
  2: '교실 이름만 맞아서 넣었어요',
  3: '우리 반 시간표를 보고 넣었어요',
};

function groupByMonth<T extends { date: string }>(items: readonly T[]): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = monthKeyKo(item.date);
    const list = map.get(key);
    if (list === undefined) map.set(key, [item]);
    else list.push(item);
  }
  return [...map.entries()];
}

export function ExcludedDaysPanel({ view, onAdjust }: ExcludedDaysPanelProps) {
  // 교시 이름은 학교마다 바꿀 수 있다('1교시' → '1블록'). 직접 문자열을 만들지 않는다.
  const periodTimes = useSettingsStore((s) => s.settings.periodTimes);
  const [section, setSection] = useState<Section>('excluded');
  const [collapsedMonths, setCollapsedMonths] = useState<ReadonlySet<string>>(new Set());

  const excludedByMonth = useMemo(() => groupByMonth(view.excludedDays), [view.excludedDays]);
  const includedByMonth = useMemo(() => groupByMonth(view.lessonDays), [view.lessonDays]);

  const uncertainCount = view.lessonDays.filter((d) => d.matchStage !== 1).length;

  const toggleMonth = (key: string) => {
    setCollapsedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const groups = section === 'excluded' ? excludedByMonth : includedByMonth;

  return (
    <div className="rounded-xl border border-sp-border bg-sp-card">
      {/* 구획 전환 */}
      <div className="flex items-center gap-1 border-b border-sp-border px-2 py-2">
        <button
          type="button"
          onClick={() => setSection('excluded')}
          className={`rounded-lg px-3 py-1.5 text-xs font-sp-medium transition-all duration-sp-base ease-sp-out active:scale-95 ${
            section === 'excluded'
              ? 'bg-sp-surface text-sp-text'
              : 'text-sp-muted hover:text-sp-text'
          }`}
        >
          뺀 날 <span className="tabular-nums">{view.excludedDays.length}</span>
        </button>
        <button
          type="button"
          onClick={() => setSection('included')}
          className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-sp-medium transition-all duration-sp-base ease-sp-out active:scale-95 ${
            section === 'included'
              ? 'bg-sp-surface text-sp-text'
              : 'text-sp-muted hover:text-sp-text'
          }`}
        >
          넣은 날 <span className="tabular-nums">{view.lessonDays.length}</span>
          {uncertainCount > 0 && (
            <span className="rounded-lg border border-dashed border-sp-border px-1.5 py-0.5 text-[10px] leading-none tabular-nums">
              확인 {uncertainCount}
            </span>
          )}
        </button>
      </div>

      <div className="max-h-80 overflow-y-auto p-2">
        {groups.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-sp-muted">
            {section === 'excluded' ? '뺀 날이 없어요.' : '넣은 날이 없어요.'}
          </p>
        )}

        {groups.map(([month, items]) => {
          const collapsed = collapsedMonths.has(month);
          return (
            <div key={month} className="mb-1">
              <button
                type="button"
                onClick={() => toggleMonth(month)}
                aria-expanded={!collapsed}
                className="flex w-full items-center gap-1 rounded-lg px-2 py-1.5 text-left text-xs font-sp-medium text-sp-muted transition-all duration-sp-base ease-sp-out hover:text-sp-text"
              >
                <span aria-hidden className="material-symbols-outlined text-sm">
                  {collapsed ? 'chevron_right' : 'expand_more'}
                </span>
                {month}
                <span className="tabular-nums">({items.length})</span>
              </button>

              {!collapsed && (
                <ul className="space-y-1 pl-2">
                  {items.map((item) => {
                    const isExcluded = 'exclusion' in item;
                    const stage = 'matchStage' in item ? item.matchStage : null;
                    const uncertain = stage !== null && stage !== 1;

                    return (
                      <li
                        key={item.date}
                        className={`rounded-lg px-2 py-1.5 ${
                          uncertain ? 'border-l-2 border-dashed border-sp-border pl-3' : ''
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-xs font-sp-medium text-sp-text tabular-nums">
                            {formatDateKo(item.date)}
                          </span>

                          {isExcluded ? (
                            <>
                              <span className="text-xs text-sp-muted">{item.exclusion.label}</span>
                              {item.exclusion.sourceLabel !== undefined && (
                                <span className="text-xs text-sp-muted opacity-80">
                                  · {item.exclusion.sourceLabel}
                                </span>
                              )}
                              {item.exclusion.userOverridable && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onAdjust(
                                      item.date,
                                      item.exclusion.reason === 'userMarkedNoLesson'
                                        ? null
                                        : 'hasLesson',
                                    )
                                  }
                                  className="ml-auto rounded-lg border border-sp-border px-2 py-0.5 text-[11px] font-sp-medium text-sp-muted transition-all duration-sp-base ease-sp-out hover:text-sp-text active:scale-95"
                                >
                                  {item.exclusion.reason === 'userMarkedNoLesson'
                                    ? '되돌리기'
                                    : '이 날은 수업했어요'}
                                </button>
                              )}
                            </>
                          ) : (
                            <>
                              <span className="text-xs text-sp-muted tabular-nums">
                                {item.periods
                                  .map((p) => resolvePeriodLabel(p, periodTimes))
                                  .join('·')}
                              </span>
                              {uncertain && stage !== null && (
                                <span className="rounded-lg border border-dashed border-sp-border px-1.5 py-0.5 text-[10px] leading-none text-sp-muted">
                                  {STAGE_NOTE[stage as Exclude<ProgressMatchStage, 1>]}
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => onAdjust(item.date, 'noLesson')}
                                className="ml-auto rounded-lg border border-sp-border px-2 py-0.5 text-[11px] font-sp-medium text-sp-muted transition-all duration-sp-base ease-sp-out hover:text-sp-text active:scale-95"
                              >
                                수업 안 했어요
                              </button>
                            </>
                          )}
                        </div>

                        {item.notices.length > 0 && (
                          <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-sp-muted">
                            <span aria-hidden className="material-symbols-outlined text-xs">
                              help
                            </span>
                            {item.notices.map((n) => (
                              <span key={n.sourceLabel}>{n.sourceLabel} — 확인해 주세요</span>
                            ))}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <p className="border-t border-sp-border px-3 py-2 text-[11px] leading-relaxed text-sp-muted">
        점선으로 표시된 날은 쌤핀이 <b className="font-semibold">덜 확신하는</b> 날이에요. 시험·행사
        기간은 자동으로 빼지 않으니, 수업을 안 하셨다면 직접 빼주세요.
      </p>
    </div>
  );
}
