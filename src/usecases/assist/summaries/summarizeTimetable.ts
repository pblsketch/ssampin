/**
 * 교사 본인 시간표를 모델에 보낼 요약으로 바꾼다(순수 함수).
 *
 * ★하루치 시간표를 **직접 조립하지 않는다.** 요일 판정·주말 수업 설정·변동 시간표
 * (교체·보강·자습)를 합치는 규칙은 이미 스토어 선택자(`getEffectiveTeacherSchedule`)에
 * 들어 있다. 여기서 다시 구현하면 시간표 화면과 AI 의 답이 어긋나는 두 정본 문제가
 * 생긴다 — 일정(summarizeEvents)이 `getEventsForDate` 를 그대로 부르는 것과 같은 이유다.
 * 그래서 "그날의 시간표를 주는 함수"를 인자로 받는다.
 *
 * 과목명·교실은 선생님이 손으로 고칠 수 있는 자리라 자유 입력으로 취급한다
 * (freeTextFields). 빈 교시는 아예 담지 않는다 — 보내 봐야 토큰만 쓴다.
 */
import type { TeacherPeriod } from '@domain/entities/Timetable';

import { dayName, eachDate } from './dateWalk';

export interface SummarizeTimetableOptions {
  /** YYYY-MM-DD (포함) */
  readonly from: string;
  /** YYYY-MM-DD (포함) */
  readonly to: string;
  /** 담을 날 수의 상한. 기본 7일 */
  readonly maxDays?: number;
  /**
   * 담을 교시 수의 상한. 기본 80칸.
   *
   * ★날 수만 제한하면 부족하다. 하루 7~8교시라 2주만 돼도 100칸을 넘고,
   * 서버의 도구 결과 상한(4,000자)에 걸려 요청이 통째로 거절된다.
   */
  readonly maxItems?: number;
}

export interface TimetableSummary {
  readonly period: string;
  readonly truncated: boolean;
  readonly items: readonly {
    readonly date: string;
    /** '월'~'일' */
    readonly day: string;
    /**
     * 몇 교시인가(1부터).
     *
     * ★`period` 라고 못 쓴다 — 최상위 `period` 가 이미 "기간 라벨"로 쓰이고 있어
     * (급식·일정과 같은 모양) 같은 이름이 두 뜻을 갖게 된다.
     */
    readonly periodNo: number;
    readonly subject: string;
    readonly classroom: string;
  }[];
}

export function summarizeTimetable(
  /** 그날의 유효 시간표(변동 반영)를 돌려주는 함수. 수업 없는 날은 빈 배열 */
  getDaySchedule: (date: string) => readonly (TeacherPeriod | null)[],
  opts: SummarizeTimetableOptions,
): TimetableSummary {
  const maxItems = opts.maxItems ?? 80;
  const { dates, truncated: dayCut } = eachDate(opts.from, opts.to, opts.maxDays ?? 7);

  const items: TimetableSummary['items'][number][] = [];
  let itemCut = false;

  for (const date of dates) {
    const day = dayName(date);
    getDaySchedule(date).forEach((slot, index) => {
      if (itemCut) return;
      // 빈 교시(null) · 과목이 비어 있는 자습 칸은 담지 않는다.
      if (!slot || slot.subject.trim().length === 0) return;
      if (items.length >= maxItems) {
        itemCut = true;
        return;
      }
      items.push({
        date,
        day,
        periodNo: index + 1,
        subject: slot.subject,
        classroom: slot.classroom,
      });
    });
  }

  return {
    period: `${opts.from} ~ ${opts.to}`,
    truncated: dayCut || itemCut,
    items,
  };
}
