/**
 * "이 반은 평소 언제 수업하나"를 화면 문구로 바꾸는 presenter.
 *
 * 도메인(`getWeeklyLessonSlots`)은 요일·교시 숫자만 돌려준다. 여기서 하는 일은 두 가지다.
 *
 *  1. **교시 이름을 학교 설정대로 붙인다.** 교시는 학교마다 이름을 바꿀 수 있어서(3교시 → '창체')
 *     숫자를 직접 문자열로 만들면 그 학교에는 없는 이름이 화면에 뜬다.
 *  2. **느슨한 매칭을 같은 말로 알린다.** 같은 뜻을 화면마다 다르게 쓰면 사용자는 두 가지 개념으로
 *     읽는다 — 문구는 `MATCH_STAGE_NOTE` 하나만 쓴다.
 */

import { resolvePeriodLabel, resolvePeriodShortLabel } from '@domain/rules/periodLabel';
import {
  groupWeeklyLessonSlotsByDay,
  type WeeklyLessonSlotsResult,
} from '@domain/rules/weeklyLessonSlots';
import type { ProgressMatchStage } from '@domain/rules/progressMatching';
import type { PeriodTime } from '@domain/valueObjects/PeriodTime';

/**
 * 느슨하게 찾은 수업일에 붙이는 안내 문구. **여기가 정본이다** — 진도 화면(`ExcludedDaysPanel`)과
 * 학급 목록이 같은 문장을 써야 사용자가 같은 뜻으로 읽는다.
 */
export const MATCH_STAGE_NOTE: Record<Exclude<ProgressMatchStage, 1>, string> = {
  2: '교실 이름만 맞아서 넣었어요',
  3: '우리 반 시간표를 보고 넣었어요',
};

export interface ClassScheduleLabel {
  /** 좁은 목록용 압축 표기. 예: `월2,3 · 목1` */
  readonly label: string;
  /** 마우스를 올렸을 때 보여줄 완전한 문장. 예: `매주 월요일 2교시·3교시, 목요일 1교시 수업` */
  readonly fullText: string;
  /** 교실명만 맞거나 담임반 시간표로 추정한 경우 true. */
  readonly uncertain: boolean;
  /** `uncertain`일 때만 채워진다. */
  readonly confidenceNote?: string;
}

/**
 * 주간 수업 칸을 화면 문구로 바꾼다. 찾은 칸이 없으면 `null` — 호출처는 줄 자체를 그리지 않는다.
 * (목록의 반이 모두 "시간표 없음"을 반복하면 고장난 화면처럼 보인다.)
 */
export function toClassScheduleLabel(
  result: WeeklyLessonSlotsResult,
  periodTimes?: readonly PeriodTime[],
): ClassScheduleLabel | null {
  const groups = groupWeeklyLessonSlotsByDay(result.slots);
  if (groups.length === 0 || result.matchStage === null) return null;

  const label = groups
    .map((g) => {
      const periods = g.periods.map((p) => resolvePeriodShortLabel(p, periodTimes));
      // '수3'은 한글과 숫자라 경계가 보이지만 '수창체'는 둘 다 한글이라 붙여 놓으면 읽히지 않는다.
      // 이름 붙인 교시가 하나라도 있으면 띄운다 — 요일 사이 구분(' · ')과 겹치지 않는 구분이다.
      // 쉼표가 아니라 **교시 하나씩** 본다. 합친 문자열로 보면 '2,3'의 쉼표까지 이름으로 잡힌다.
      const named = periods.some((text) => /\D/.test(text));
      return `${g.day}${named ? ' ' : ''}${periods.join(',')}`;
    })
    .join(' · ');

  const spoken = groups
    .map(
      (g) => `${g.day}요일 ${g.periods.map((p) => resolvePeriodLabel(p, periodTimes)).join('·')}`,
    )
    .join(', ');

  const uncertain = result.matchStage !== 1;
  if (!uncertain) return { label, fullText: `매주 ${spoken} 수업`, uncertain: false };

  const note = MATCH_STAGE_NOTE[result.matchStage];
  return {
    label,
    fullText: `매주 ${spoken} 수업 — ${note}`,
    uncertain: true,
    confidenceNote: note,
  };
}
