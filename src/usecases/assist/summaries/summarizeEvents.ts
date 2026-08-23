/**
 * 일정을 모델에 보낼 요약으로 바꾼다(순수 함수).
 *
 * ★반복 일정(매주 회의 등)은 직접 펼치지 않고 `getEventsForDate`(domain 규칙)에
 * 날짜별로 물어본다. 반복·제외일(excludeDates)·여러 날 걸침 판정이 전부 그 안에
 * 있어서, 여기서 다시 구현하면 캘린더 화면과 답이 어긋나는 두 정본 문제가 생긴다.
 *
 * 제목·장소는 선생님 자유 입력 — 학생 이름이 들어갈 수 있어 freeTextFields 대상.
 * 설명(description)은 보내지 않는다(상담 메모 등 긴 자유 글이 들어가는 자리다).
 */
import type { SchoolEvent } from '@domain/entities/SchoolEvent';
import { getEventsForDate, parseLocalDate } from '@domain/rules/eventRules';

export interface SummarizeEventsOptions {
  /** YYYY-MM-DD (포함) */
  readonly from: string;
  /** YYYY-MM-DD (포함) */
  readonly to: string;
  /** 폭주 방지 상한. 기본 60일 — 기간 자체는 무상한(오너 결정 ④)이라 잘리면 표시한다 */
  readonly maxDays?: number;
}

export interface EventsSummary {
  readonly period: string;
  /** maxDays 를 넘겨 잘렸으면 true — 조용한 절단은 "다 보여줬다"로 읽힌다 */
  readonly truncated: boolean;
  readonly items: readonly {
    readonly date: string;
    readonly title: string;
    readonly time: string;
    readonly location: string;
  }[];
}

function toDashed(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export function summarizeEvents(
  events: readonly SchoolEvent[],
  opts: SummarizeEventsOptions,
): EventsSummary {
  const maxDays = opts.maxDays ?? 60;
  const items: { date: string; title: string; time: string; location: string }[] = [];

  const cursor = parseLocalDate(opts.from);
  const end = parseLocalDate(opts.to);
  let days = 0;
  let truncated = false;

  while (cursor.getTime() <= end.getTime()) {
    if (days >= maxDays) {
      truncated = true;
      break;
    }
    const dateStr = toDashed(cursor);
    for (const ev of getEventsForDate(events, cursor)) {
      items.push({
        date: dateStr,
        title: ev.title,
        time: ev.time ?? '',
        location: ev.location ?? '',
      });
    }
    cursor.setDate(cursor.getDate() + 1);
    days += 1;
  }

  return { period: `${opts.from} ~ ${opts.to}`, truncated, items };
}
