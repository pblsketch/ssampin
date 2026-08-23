/**
 * 쿨메신저 쪽지 본문에서 일정 후보를 뽑는 한국어 날짜/시간 파서.
 *
 * AI·네트워크를 일절 쓰지 않는 순수 규칙 코드다.
 *
 * ## 기준일(base)은 오늘이 아니라 쪽지를 받은 날이다
 * 지난주에 받은 쪽지의 "내일"은 지난주 기준이어야 한다. 이걸 오늘로 잡으면
 * 지나간 일정이 미래로 밀린다.
 *
 * ## `koreanDateParser.ts`와 무엇이 다른가 (헷갈리기 쉬움 — 반드시 읽을 것)
 * | | `koreanDateParser` | 이 파일 |
 * | --- | --- | --- |
 * | 입력 | 사용자가 **직접 친 한 줄** | 남이 보낸 **쪽지 본문 전체** |
 * | 결과 | 할일 **하나** | 일정 후보 **여럿** |
 * | 특징 | `!높음` `#업무` 같은 토큰도 해석 | 기간(`7/21~7/25`)·기한·본문 위치(span) |
 * 둘은 목적이 달라 합치지 않는다. 할일 빠른입력을 고칠 일이면 저쪽 파일이다.
 *
 * ## 원본
 * `coolm-helper`의 `parser/date_parser.py`를 TypeScript로 옮긴 것.
 * 저작자가 이식을 명시적으로 허락했다 (2026-08-21).
 *
 *   Copyright (c) 2026 dacisosl · MIT License
 *   https://github.com/dacisosl/coolm-helper
 *
 * @see docs/01-plan/features/coolmessenger-import.plan.md
 */

/** 요일 이름 → 월=0 기준 번호 (JS `getDay()`의 일=0 기준이 아니다) */
const WEEKDAYS: Readonly<Record<string, number>> = {
  월: 0,
  화: 1,
  수: 2,
  목: 3,
  금: 4,
  토: 5,
  일: 6,
};

// ── 정규식 패턴 ──────────────────────────────────────────────

/**
 * 절대 날짜: 7월 21일 / 7/21 / 2026-07-21 / 7.21(화)
 *
 * ★ 앞뒤 `(?<!\d)` / `(?!\d)` 가 핵심이다. 없으면 정규식이 **앞자리를 버리고 뒤에서 다시
 * 맞춰버린다** — `13월 5일` → `3월 5일`, `8월 32일` → `8월 3일` 처럼 **자신 있게 틀린 날짜**를
 * 만든다. 못 찾는 것보다 나쁘다(잘못된 일정이 달력에 등록된다).
 */
const DATE_ABS =
  /(?<!\d)(?:(?<y>20\d{2})\s*[년./-]\s*)?(?<m>1[0-2]|0?[1-9])\s*(?<sep>[월./-])\s*(?<d>3[01]|[12]\d|0?[1-9])(?!\d)\s*(?<il>일)?\s*(?:\(\s*(?<wd>[월화수목금토일])\s*\))?/g;

/** 상대 날짜: 오늘/내일/모레/글피 */
const DATE_REL_DAY = /오늘|내일|모레|글피/g;

/** 상대 날짜: (이번|다음)주 X요일 */
const DATE_REL_WEEK = /(?<week>이번\s*주|금주|다음\s*주|차주)\s*(?<wd>[월화수목금토일])요일/g;

/**
 * 시간: 14:00 / 오후 2시 / 2시 30분 / 14시 / 2시반
 *
 * `:` 형식은 **분까지 있어야** 인정한다 — `1:` 같은 조각을 시간으로 오인하지 않기 위해서다.
 *
 * ★ 시(hour) 앞의 `(?<!\d)` 도 날짜와 같은 이유다. 없으면 `25시` 가 **5시**로 읽힌다
 * (앞자리 `2`를 버리고 `5시`에 다시 맞춘다).
 */
const TIME =
  /(?:(?<ampm>오전|오후|낮|저녁|밤|아침)\s*)?(?:(?<!\d)(?<h1>2[0-3]|1\d|0?\d):(?<min1>[0-5]\d)(?!\d)|(?<!\d)(?<h2>2[0-3]|1\d|0?\d)\s*시\s*(?:(?<min2>[0-5]?\d)\s*분|(?<half>반))?)/g;

/** 기한 힌트: '~7/21까지', '마감', '제출' */
const DEADLINE_HINT = /까지|마감|기한|제출|신청\s*마감/;

/** 기간 연결자: 날짜 ~ 날짜 / 날짜부터 날짜까지 */
const RANGE_CONNECT = /^\s*(?:~|-|부터|에서)\s*$/;

/** 전각 → 반각 (길이 보존 — span 위치가 유지되어야 한다) */
const FULLWIDTH_FROM = '０１２３４５６７８９：／．（）～';
const FULLWIDTH_TO = '0123456789:/.()~';

/**
 * 전각→반각 변환.
 *
 * **길이를 바꾸지 않는다.** 변환 후에도 글자 위치(span)가 그대로여야
 * 원문에서 날짜 구간을 잘라내거나 빨간 표시를 할 수 있기 때문이다.
 */
export function normalize(text: string): string {
  let out = '';
  for (const ch of text) {
    const index = FULLWIDTH_FROM.indexOf(ch);
    out += index === -1 ? ch : FULLWIDTH_TO[index];
  }
  return out;
}

/** 쪽지에서 찾아낸 일정 후보 하나 */
export interface ParsedCoolEvent {
  readonly start: Date;
  /** 기간 일정일 때만 채워진다 (7/21~7/25) */
  readonly end: Date | null;
  /** 시간이 안 붙었으면 종일 일정 */
  readonly allDay: boolean;
  /**
   * 같은 줄에 '까지/마감/제출'이 뒤따르는가 — 사실 그대로의 정보다.
   *
   * ⚠️ **이 값으로 일정이냐 할일이냐를 자동으로 정하지 말 것.**
   * 예전에 `isDeadline ? 할일 : 일정` 으로 미리 골라 뒀다가 오너 지시로 걷어냈다.
   * "8월 27일 14:00 회의 자료 제출"처럼 회의인데 할일로 잡히는 일이 생기고,
   * 무엇보다 **어디에 넣을지는 선생님이 정할 몫**이다.
   * 화면은 일정·할일·둘 다·안 함 네 가지를 그대로 보여주고, 기본은 '안 함'이다.
   */
  readonly isDeadline: boolean;
  /** 매칭된 원문 조각 (로컬 표시용) */
  readonly sourceText: string;
  /** 본문에서의 위치 [시작, 끝) — 제목 정리·하이라이트용 */
  readonly spans: readonly (readonly [number, number])[];
}

// ── 내부 헬퍼 ────────────────────────────────────────────────

/** 달력에 없는 날짜(2월 30일 등)를 걸러낸다 — JS `Date`는 조용히 넘겨버린다 */
function makeDate(year: number, month: number, day: number): Date | null {
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
    return null;
  }
  return d;
}

/** 자정으로 맞춘 사본 */
function atMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** 월=0 기준 요일 */
function mondayBasedWeekday(d: Date): number {
  return (d.getDay() + 6) % 7;
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

/**
 * 연도 생략 시: 기준일에서 30일 이상 과거면 이듬해로 해석한다.
 *
 * 12월에 받은 쪽지의 "1월 10일"은 다음 해 1월이라는 뜻이다.
 */
function resolveYear(month: number, day: number, base: Date): Date | null {
  const cutoff = addDays(atMidnight(base), -30);
  let last: Date | null = null;
  for (const year of [base.getFullYear(), base.getFullYear() + 1]) {
    const d = makeDate(year, month, day);
    if (d === null) return null;
    last = d;
    if (d.getTime() >= cutoff.getTime()) return d;
  }
  return last; // 둘 다 과거면 마지막 후보
}

function resolveAbs(groups: Record<string, string | undefined>, base: Date): Date | null {
  const month = Number(groups.m);
  const day = Number(groups.d);
  if (groups.y) return makeDate(Number(groups.y), month, day);
  // '.'/'-' 구분자의 연도 없는 날짜는 요일/일 표기가 있어야 인정한다.
  // ('2. 3' 같은 목록 번호, '1-2교시' 같은 표현을 날짜로 오인하지 않기 위해서다.)
  const sep = groups.sep ?? '';
  if ((sep === '.' || sep === '-') && !(groups.wd || groups.il)) return null;
  return resolveYear(month, day, base);
}

function resolveRelDay(word: string, base: Date): Date {
  const offset: Readonly<Record<string, number>> = { 오늘: 0, 내일: 1, 모레: 2, 글피: 3 };
  return addDays(atMidnight(base), offset[word] ?? 0);
}

function resolveRelWeek(groups: Record<string, string | undefined>, base: Date): Date {
  const targetWeekday = WEEKDAYS[groups.wd ?? ''] ?? 0;
  const week = (groups.week ?? '').replace(/\s/g, '');
  let monday = addDays(atMidnight(base), -mondayBasedWeekday(base));
  if (week === '다음주' || week === '차주') monday = addDays(monday, 7);
  return addDays(monday, targetWeekday);
}

function resolveTime(groups: Record<string, string | undefined>): readonly [number, number] | null {
  let hour = Number(groups.h1 ?? groups.h2);
  const minuteGroup = groups.min1 ?? groups.min2;
  const minute = minuteGroup !== undefined ? Number(minuteGroup) : groups.half ? 30 : 0;
  const ampm = groups.ampm;
  if (ampm === '오후' && hour < 12) hour += 12;
  else if ((ampm === '저녁' || ampm === '밤') && hour < 12) hour += 12;
  else if (ampm === '낮' && hour <= 6) hour += 12;
  if (hour > 24 || minute > 59) return null;
  return [hour % 24, minute];
}

interface DateHit {
  readonly start: number;
  readonly end: number;
  readonly date: Date;
}

interface TimeHit {
  readonly start: number;
  readonly end: number;
  readonly hour: number;
  readonly minute: number;
}

/** 텍스트에서 날짜를 위치순으로 수집한다. 절대 날짜가 우선이고, 겹치는 상대 표현은 버린다. */
function findDates(text: string, base: Date): DateHit[] {
  const found: DateHit[] = [];
  const covered: Array<readonly [number, number]> = [];

  for (const m of text.matchAll(DATE_ABS)) {
    const d = resolveAbs(m.groups ?? {}, base);
    if (!d) continue;
    const start = m.index;
    const end = start + m[0].length;
    found.push({ start, end, date: d });
    covered.push([start, end]);
  }

  const overlaps = (s: number, e: number): boolean => covered.some(([cs, ce]) => s < ce && e > cs);

  for (const m of text.matchAll(DATE_REL_WEEK)) {
    const start = m.index;
    const end = start + m[0].length;
    if (overlaps(start, end)) continue;
    found.push({ start, end, date: resolveRelWeek(m.groups ?? {}, base) });
    covered.push([start, end]);
  }

  for (const m of text.matchAll(DATE_REL_DAY)) {
    const start = m.index;
    const end = start + m[0].length;
    if (overlaps(start, end)) continue;
    found.push({ start, end, date: resolveRelDay(m[0], base) });
    covered.push([start, end]);
  }

  found.sort((a, b) => a.start - b.start || a.end - b.end);
  return found;
}

/** 날짜 매치와 겹치는 구간(예: '21일'의 21)은 시간으로 보지 않는다. */
function findTimes(text: string, dateSpans: ReadonlyArray<readonly [number, number]>): TimeHit[] {
  const out: TimeHit[] = [];
  for (const m of text.matchAll(TIME)) {
    const start = m.index;
    const end = start + m[0].length;
    if (dateSpans.some(([s, e]) => start < e && end > s)) continue;
    const hm = resolveTime(m.groups ?? {});
    if (!hm) continue;
    out.push({ start, end, hour: hm[0], minute: hm[1] });
  }
  return out;
}

// ── 공개 API ─────────────────────────────────────────────────

/** 날짜 뒤 이 거리(글자 수) 안의 시간을 그 날짜에 붙인다 */
const TIME_ATTACH_WINDOW = 30;

/** 기간 연결자로 인정하는 최대 길이 ('~', '부터' 등) */
const RANGE_GAP_MAX = 8;

/** 기한 힌트를 찾을 꼬리 길이 */
const DEADLINE_TAIL = 15;

/**
 * 날짜 뒤에 '까지/마감/제출'이 붙었는지 본다 — 붙었으면 일정이 아니라 할일로 추천한다.
 *
 * ★ **줄을 넘어가서 보면 안 된다.** 실제 쪽지는 여러 줄이라, 그냥 15글자를 읽으면
 * 다음 줄의 단어를 집어온다:
 *
 *     체험 당일 8월 31일(월) 09:00     ← 일정이어야 하는데
 *     보고서 제출 9월 4일까지           ← 이 '제출'을 집어와 할일이 돼 버렸다
 */
function looksLikeDeadline(text: string, from: number): boolean {
  const tail = text.slice(from, from + DEADLINE_TAIL);
  const sameLine = tail.split('\n', 1)[0] ?? '';
  return DEADLINE_HINT.test(sameLine);
}

/**
 * 쪽지 본문에서 일정 후보를 뽑는다.
 *
 * @param text 쪽지 본문 (제목 + 본문을 이어 붙여 넣어도 된다)
 * @param base **쪽지를 받은 날.** 오늘이 아니다 — 상대 날짜의 기준이 된다.
 */
export function extractCoolEvents(text: string, base: Date): ParsedCoolEvent[] {
  const normalized = normalize(text);
  const dates = findDates(normalized, base);
  if (dates.length === 0) return [];
  const times = findTimes(
    normalized,
    dates.map((d) => [d.start, d.end] as const),
  );

  const usedTimes = new Set<number>();

  /** 날짜 바로 뒤에서 가장 가까운(아직 안 쓴) 시간을 찾아 붙인다 */
  const attachTime = (dateEnd: number): TimeHit | null => {
    let bestGap = Number.POSITIVE_INFINITY;
    let bestIndex = -1;
    for (let t = 0; t < times.length; t += 1) {
      if (usedTimes.has(t)) continue;
      const hit = times[t]!;
      if (hit.start < dateEnd || hit.start > dateEnd + TIME_ATTACH_WINDOW) continue;
      const gap = hit.start - dateEnd;
      if (gap < bestGap) {
        bestGap = gap;
        bestIndex = t;
      }
    }
    if (bestIndex === -1) return null;
    usedTimes.add(bestIndex);
    return times[bestIndex]!;
  };

  const events: ParsedCoolEvent[] = [];
  let i = 0;
  while (i < dates.length) {
    const cur = dates[i]!;

    // 기간 감지: 이 날짜와 다음 날짜 사이가 '~' / '부터' 뿐인가
    const next = dates[i + 1];
    if (next) {
      const between = normalized.slice(cur.end, next.start);
      if (
        between.length <= RANGE_GAP_MAX &&
        RANGE_CONNECT.test(between) &&
        next.date.getTime() >= cur.date.getTime()
      ) {
        events.push({
          start: atMidnight(cur.date),
          end: atMidnight(next.date),
          allDay: true,
          isDeadline: looksLikeDeadline(normalized, next.end),
          sourceText: normalized.slice(cur.start, next.end),
          spans: [[cur.start, next.end]],
        });
        i += 2;
        continue;
      }
    }

    const hm = attachTime(cur.end);
    const day = atMidnight(cur.date);
    events.push({
      start: hm
        ? new Date(day.getFullYear(), day.getMonth(), day.getDate(), hm.hour, hm.minute)
        : day,
      end: null,
      allDay: hm === null,
      isDeadline: looksLikeDeadline(normalized, cur.end),
      sourceText: normalized.slice(cur.start, cur.end),
      spans: [[cur.start, cur.end]],
    });
    i += 1;
  }

  // 같은 시각 중복 제거 (본문에 같은 날짜가 여러 번 나오는 경우)
  const seen = new Set<string>();
  return events.filter((ev) => {
    const key = `${ev.start.getTime()}${ev.isDeadline ? 'D' : ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * 제목 생성용: 날짜/시간 표현을 지우고 다듬는다.
 *
 * "[7월 21일(화) 14:00] 학폭위 심의" → "학폭위 심의"
 */
export function stripCoolDateExpressions(text: string, base: Date): string {
  let out = normalize(text);
  const dates = findDates(out, base);
  const times = findTimes(
    out,
    dates.map((d) => [d.start, d.end] as const),
  );
  const spans: Array<readonly [number, number]> = [
    ...dates.map((d) => [d.start, d.end] as const),
    ...times.map((t) => [t.start, t.end] as const),
  ].sort((a, b) => b[0] - a[0]);

  for (const [s, e] of spans) out = out.slice(0, s) + ' ' + out.slice(e);

  out = out.replace(/[[(]\s*[\])]/g, ' '); // 빈 괄호 제거
  out = out.replace(/\s{2,}/g, ' ');
  return out.replace(/^[\s~,.·:/-]+|[\s~,.·:/-]+$/g, '');
}
