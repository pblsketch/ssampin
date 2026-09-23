/**
 * 학교 달력 인사 — 그날 쌤핀이 건넬 한마디의 **종류**를 정한다(날짜 판정만, 문구는 화면 쪽).
 *
 * - 날짜는 **나이스 학교 일정(호출자가 숨긴 것·선생님 일정을 거른 것)·등록된 개학일·날짜가 정해진 기념일**
 *   에서만 가져온다. 달력으로 짐작한 개학일(`nominalTermStartDate`)은 인사 날짜로 쓰지 않는다
 *   (학기 창의 경계로만 쓴다).
 * - 인사는 **등교일에만** 한다. 한 날에 하나(`MOMENT_PRIORITY` 순서).
 * - 1·2월 날짜는 '학기 첫날'이 아니다 — 겨울방학 뒤 잠깐 등교하는 학교의 2월 개학은 새 학기가 아니다.
 * - 수능은 수능일 **전의 마지막 등교일**에 한다. 시험장 학교는 수능날 학생이 오지 않고 감독 선생님은
 *   휴대폰도 낸다. 학교급이 고등학교일 때만.
 */
import { isCeremonyEvent } from './lessonDayExclusion';
import { addDaysIso, type SchoolCalendarDays } from './schoolCalendarDays';
import { isSchoolDay } from './schoolDays';
import {
  nextTerm,
  previousTerm,
  resolveCurrentTerm,
  resolveTermStartDate,
  termEndDate,
  type TermStartDates,
} from './schoolTermStart';

export type MomentKind =
  | 'termStart'
  | 'vacationEve'
  | 'teachersDay'
  | 'suneungEve'
  | 'schoolEvent'
  | 'ceremony';

export type PinLook = 'season' | 'flower' | 'headband' | 'flag';

export const MOMENT_LOOK: Readonly<Record<MomentKind, PinLook>> = {
  termStart: 'season',
  vacationEve: 'season',
  teachersDay: 'flower',
  suneungEve: 'headband',
  schoolEvent: 'flag',
  ceremony: 'flag',
};

/** 한 날에 여럿이면 앞의 것 하나(조정 가능). */
export const MOMENT_PRIORITY: readonly MomentKind[] = [
  'ceremony',
  'vacationEve',
  'termStart',
  'suneungEve',
  'teachersDay',
  'schoolEvent',
];

/** 대학수학능력시험 날짜(교육부 발표). 해마다 새 버전에서 다음 해를 더한다 — 없는 해는 인사하지 않는다. */
export const SUNEUNG_DATES: readonly string[] = ['2026-11-19', '2027-11-18'];

/**
 * 학기 첫날로 볼 학사일정 제목 낱말(조정 가능). 개학일 후보 규칙(`termStartFromSchedule`)의 '개학'·'등교개시'에
 * 1학기 첫날이 흔히 올라오는 '시업식'을 더했다. '방학·개학 안내'처럼 방학이 함께 적힌 제목은 버린다(같은 규칙).
 */
export const TERM_START_WORDS: readonly string[] = ['개학', '등교개시', '시업식'];

function isTermStartTitle(title: string): boolean {
  const n = normalize(title);
  return !n.includes('방학') && TERM_START_WORDS.some((w) => n.includes(w));
}

/** 인사할 학교 행사 제목 낱말(조정 가능). */
export const SCHOOL_EVENT_WORDS: readonly string[] = [
  '체육대회',
  '운동회',
  '수학여행',
  '축제',
  '체험학습',
  '소풍',
];

/** 기념일이 등교일이 아니면 앞 등교일로 당기되, 이만큼보다 멀면 인사하지 않는다(조정 가능). */
export const MOMENT_SHIFT_LIMIT_DAYS = 7;

/** 호출자가 넘기는 학사일정 한 건 — 나이스 학교 일정만, 숨긴 것 제외. */
export interface MomentEvent {
  readonly title: string;
  /** 시작일 'YYYY-MM-DD' */
  readonly date: string;
}

export interface MomentInput {
  /** 오늘 'YYYY-MM-DD' */
  readonly date: string;
  readonly events: readonly MomentEvent[];
  readonly calendar: SchoolCalendarDays;
  readonly termStartDates: TermStartDates | undefined;
  /** 설정의 학년도 마무리 학기(`settings.currentTerm`) — 학기 판정에만 쓴다 */
  readonly currentTerm?: string;
  readonly isHighSchool: boolean;
  readonly suneungDates?: readonly string[];
}

export interface SchoolMoment {
  readonly kind: MomentKind;
  readonly look: PinLook;
  /** 학사일정 제목(행사·방학식·입학식 등). 기념일·수능은 null */
  readonly title: string | null;
  /** 인사가 가리키는 날 — 수능은 수능일, 스승의 날은 5월 15일, 그 밖에는 오늘 */
  readonly targetDate: string;
  /** 그날이 든 학기 라벨('2026-2') */
  readonly term: string;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalize(title: string): string {
  return title.replace(/\s+/g, '');
}

function monthOf(date: string): number {
  return Number(date.slice(5, 7));
}

/** `target` 이 등교일이면 그날, 아니면 `limit` 일 안의 바로 앞 등교일. 없으면 null. */
function onOrBeforeSchoolDay(
  target: string,
  cal: SchoolCalendarDays,
  limit: number,
): string | null {
  for (let i = 0; i <= limit; i++) {
    const day = addDaysIso(target, -i);
    if (isSchoolDay(day, cal)) return day;
  }
  return null;
}

/** `target` 전날부터 `limit` 일 안의 마지막 등교일. 없으면 null. */
function lastSchoolDayBefore(
  target: string,
  cal: SchoolCalendarDays,
  limit: number,
): string | null {
  for (let i = 1; i <= limit; i++) {
    const day = addDaysIso(target, -i);
    if (isSchoolDay(day, cal)) return day;
  }
  return null;
}

interface TermWindow {
  readonly term: string;
  readonly start: string;
  readonly end: string;
}

/**
 * 오늘이 든 학기 창. 앱의 학기 판단(`resolveCurrentTerm`)에서 시작하되, 오늘이 그 창 밖이면 앞뒤 학기로 옮긴다.
 * 1학기 개학일만 등록한 선생님은 2학기 내내 앱 학기가 1학기로 나오는데(`termFromStartDates`), 그 창으로
 * 보면 2학기의 개학·행사 인사가 모두 사라진다.
 */
function termWindowOf(input: MomentInput): TermWindow | null {
  let term = resolveCurrentTerm({
    today: new Date(`${input.date}T00:00:00`),
    termStartDates: input.termStartDates,
    currentTerm: input.currentTerm,
  });
  for (let i = 0; i < 4; i++) {
    const start = resolveTermStartDate(term, input.termStartDates);
    if (start === null) return null;
    const end = termEndDate(term, input.termStartDates) ?? '9999-12-31';
    const moved =
      input.date < start ? previousTerm(term) : input.date > end ? nextTerm(term) : term;
    if (moved === null) return null;
    if (moved === term) return { term, start, end };
    term = moved;
  }
  return null;
}

function inWindow(date: string, w: TermWindow): boolean {
  return date >= w.start && date <= w.end;
}

/** 그 학기의 첫날 — 등록된 개학일 → 학사일정 '개학'·'등교개시'·'시업식' 가운데 가장 이른 날 → 없음. 1·2월은 아니다. */
export function termFirstDay(
  term: string,
  window: { readonly start: string; readonly end: string },
  events: readonly MomentEvent[],
  termStartDates: TermStartDates | undefined,
): string | null {
  const registered = termStartDates?.[term];
  const candidate =
    typeof registered === 'string' && ISO_DATE_RE.test(registered)
      ? registered
      : (events
          .filter(
            (e) => e.date >= window.start && e.date <= window.end && isTermStartTitle(e.title),
          )
          .map((e) => e.date)
          .sort()[0] ?? null);
  if (candidate === null) return null;
  const month = monthOf(candidate);
  return month === 1 || month === 2 ? null : candidate;
}

/** 오늘의 인사 하나. 없으면 null. */
export function momentOfDay(input: MomentInput): SchoolMoment | null {
  const { date, calendar: cal } = input;
  if (!ISO_DATE_RE.test(date) || !isSchoolDay(date, cal)) return null;
  const window = termWindowOf(input);
  if (window === null) return null;

  const found = new Map<MomentKind, SchoolMoment>();
  const put = (kind: MomentKind, title: string | null, targetDate: string): void => {
    if (!found.has(kind)) {
      found.set(kind, { kind, look: MOMENT_LOOK[kind], title, targetDate, term: window.term });
    }
  };

  const today = input.events.filter((e) => e.date === date);
  for (const e of today) {
    const n = normalize(e.title);
    if (n.includes('입학식') || n.includes('졸업식')) put('ceremony', e.title.trim(), date);
    if (isCeremonyEvent(e.title)) put('vacationEve', e.title.trim(), date);
  }

  if (termFirstDay(window.term, window, input.events, input.termStartDates) === date) {
    put('termStart', null, date);
  }

  if (input.isHighSchool) {
    for (const exam of input.suneungDates ?? SUNEUNG_DATES) {
      if (lastSchoolDayBefore(exam, cal, MOMENT_SHIFT_LIMIT_DAYS) === date) {
        put('suneungEve', null, exam);
      }
    }
  }

  const teachersDay = `${date.slice(0, 4)}-05-15`;
  if (onOrBeforeSchoolDay(teachersDay, cal, MOMENT_SHIFT_LIMIT_DAYS) === date) {
    put('teachersDay', null, teachersDay);
  }

  for (const e of today) {
    const n = normalize(e.title);
    if (!SCHOOL_EVENT_WORDS.some((w) => n.includes(w))) continue;
    // 같은 이름은 그 학기에 처음 나오는 날에만 — 여러 날 행사는 첫날.
    const first = input.events
      .filter((o) => normalize(o.title) === n && inWindow(o.date, window))
      .map((o) => o.date)
      .sort()[0];
    if (first === date) put('schoolEvent', e.title.trim(), date);
  }

  for (const kind of MOMENT_PRIORITY) {
    const m = found.get(kind);
    if (m !== undefined) return m;
  }
  return null;
}
