/**
 * 위젯 카드 주 줄(ADR-137 결정 16) — 핀 줄 바로 아래, 한 칸이 한 주다.
 *
 * - 진하기는 그 주에 기록한 **날 수**다(학생 수가 아니다). 점선 칸은 기록 없는 쉬는 주,
 *   옅은 칸은 아직 기록 전인 이번 주다. 칸에 숫자·이름을 적지 않는다.
 * - 가장 최근 주가 늘 오른쪽 끝이다. 카드가 좁으면 오래된 주부터 왼쪽으로 잘린다
 *   (`justify-end` + 넘침 숨김 — 폭을 재는 스크립트가 없다).
 * - 단추가 아니다 — 누르면 카드 빈 곳을 누른 것과 같아 확장 창의 [잔디] 탭이 열린다(WidgetCard).
 * - 이번 학기 기록이 하나도 없으면 그리지 않는다 — 빈 칸만 늘어선 줄은 부담이다.
 */
import { useMyGrass } from '@adapters/hooks/useObservationCheer';
import type { WeekStripCell } from '@domain/rules/observationStreak';
import { GRASS_LEVEL_CLASS } from './grassLevelClass';

const CELL = 'h-2 w-2 shrink-0 rounded-sm';

function weekLabel(weekStart: string, isThisWeek: boolean): string {
  if (isThisWeek) return '이번 주';
  const [, m, d] = weekStart.split('-').map(Number);
  return `${m ?? ''}월 ${d ?? ''}일 주`;
}

function cellTitle(cell: WeekStripCell, isThisWeek: boolean): string {
  const week = weekLabel(cell.weekStart, isThisWeek);
  if (cell.kind === 'rest') return `${week} · 쉬는 주`;
  if (cell.kind === 'pending') return `${week} · 아직 기록 전`;
  return cell.recordedDays > 0 ? `${week} · ${cell.recordedDays}일 기록` : `${week} · 기록 없음`;
}

function cellClass(cell: WeekStripCell): string {
  if (cell.kind === 'rest') return `${CELL} border border-dashed border-sp-border`;
  if (cell.kind === 'pending') return `${CELL} border border-sp-border opacity-40`;
  return `${CELL} ${GRASS_LEVEL_CLASS[cell.level]}`;
}

export function WeekGrassStrip(): JSX.Element | null {
  const { strip, line } = useMyGrass();
  if (line.kind === 'firstRecord' || strip.length === 0) return null;

  // 쉬는 주·아직 기록 전인 이번 주는 셈에 넣지 않는다(비었다가 아니다).
  const judged = strip.filter((c) => c.kind === 'level');
  const recordedWeeks = judged.filter((c) => c.recordedDays > 0).length;
  const lastIndex = strip.length - 1; // 마지막 칸은 늘 이번 주(weekGrassStrip)

  return (
    <div
      role="img"
      aria-label={`이번 학기 주마다 기록한 날 — ${judged.length}주 가운데 ${recordedWeeks}주 기록`}
      className="-mt-1 mb-2 flex h-2 shrink-0 justify-end gap-0.5 overflow-hidden"
    >
      {strip.map((cell, i) => (
        <span
          key={cell.weekStart}
          title={cellTitle(cell, i === lastIndex)}
          className={cellClass(cell)}
        />
      ))}
    </div>
  );
}
