/**
 * pinPresence — 아이콘 모드 펫이 "무엇을 알릴지" 정하는 순수 로직 (v2.2.3~).
 *
 * 펫(파란 압정 캐릭터)은 4개 스프라이트 동작(idle / jump / wave / celebrate)을
 * 표현 수단으로 쓴다. 이 모듈은 React 없이 순수 함수로:
 *   - derivePinInfo: 지금 시각 기준 다음 수업(과목+교실) / 마감 할 일 / 다가오는 일정 계산
 *   - decidePeek:    능동 말풍선으로 "먼저 알릴" 가장 급한 1건 + 어떤 동작으로 표현할지
 *   - buildSummary:  마우스 호버 시 보여줄 전체 요약
 *
 * 모든 시간 비교는 주입된 now 기준 — 테스트에서 고정 시각으로 검증 가능.
 */
import type { Todo } from '@domain/entities/Todo';
import { resolvePeriodLabel } from '@domain/rules/periodLabel';
import type { SchoolEvent } from '@domain/entities/SchoolEvent';
import type { TeacherScheduleData } from '@domain/entities/Timetable';
import type { PeriodTime } from '@domain/valueObjects/PeriodTime';
import { getCurrentPeriod, getDayOfWeek } from '@domain/rules/periodRules';

/** 펫이 재생할 수 있는 스프라이트 동작 상태 */
export type PinState = 'idle' | 'jump' | 'wave' | 'celebrate';

export interface PinClassInfo {
  readonly number: number;
  readonly subject: string;
  readonly classroom: string;
  /** 수업 시작까지 남은 분. 진행 중이거나 시작 시각을 모르면 0 */
  readonly minutesUntil: number;
}

export interface PinDueTodos {
  /** 오늘까지(지난 것 포함) 마감인 미완료 할 일 수 */
  readonly count: number;
  /** 마감이 이미 지난 미완료 할 일 수 */
  readonly overdueCount: number;
  /** 가장 급한 할 일 텍스트(짧게 자름). 없으면 null */
  readonly topText: string | null;
}

export interface PinEventInfo {
  readonly title: string;
  /** 오늘 일정이고 시작 시각을 알면 시작까지 남은 분, 아니면 null */
  readonly minutesUntil: number | null;
  readonly today: boolean;
  /** 일정 날짜 "YYYY-MM-DD" — 말풍선에 날짜·요일 표기용 (v2.2.7) */
  readonly date: string;
}

const WEEKDAY_LABEL = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** "YYYY-MM-DD" → "M월 D일 (요일)" (못 읽으면 원문 그대로) */
function formatMonthDayWeekday(dateStr: string): string {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return dateStr;
  const [, y, mo, d] = m;
  const day = new Date(Number(y), Number(mo) - 1, Number(d)).getDay();
  return `${Number(mo)}월 ${Number(d)}일 (${WEEKDAY_LABEL[day]})`;
}

export interface PinLunchInfo {
  /** 중식 메뉴 요약 (짧게 자름) */
  readonly menu: string;
  /** 점심 시작까지 남은 분 (지났으면 음수, 시작 시각을 모르면 null) */
  readonly minutesUntil: number | null;
}

export interface PinInfo {
  readonly current: {
    readonly number: number;
    readonly subject: string;
    readonly classroom: string;
  } | null;
  readonly next: PinClassInfo | null;
  readonly dueTodos: PinDueTodos;
  readonly nextEvent: PinEventInfo | null;
  /** 오늘 실제 수업이 있는 교시 수 (아침 브리핑용, v2.2.7) */
  readonly todayClassCount: number;
  /** 오늘 첫 수업 (아침 브리핑용, v2.2.7) — 시작 여부와 무관하게 시간표 기준 */
  readonly firstClass: PinClassInfo | null;
  /** 오늘 급식(중식) — 메뉴 데이터가 없으면 null (v2.2.7) */
  readonly lunch: PinLunchInfo | null;
}

export interface DerivePinInfoParams {
  readonly now: Date;
  readonly periodTimes: readonly PeriodTime[] | undefined;
  readonly teacherSchedule: TeacherScheduleData | null | undefined;
  readonly todos: readonly Todo[];
  readonly events: readonly SchoolEvent[];
  /** 오늘 중식 메뉴 요약 문자열 (선택 — 급식 브리핑용, v2.2.7) */
  readonly lunchMenu?: string | null;
  /** 점심이 몇 교시 직후인지 (settings.lunchAfterPeriod, 선택) */
  readonly lunchAfterPeriod?: number;
  /** 레거시 점심 시작 시각 "HH:mm" 폴백 (settings.lunchStart, 선택) */
  readonly lunchStartFallback?: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 로컬 타임존 기준 "YYYY-MM-DD" */
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** "HH:mm" 또는 "HH:mm - HH:mm"(앞쪽)을 자정 기준 분으로. 못 읽으면 null */
function parseHHmm(value: string | undefined): number | null {
  if (!value) return null;
  const m = value.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (Number.isNaN(h) || Number.isNaN(min)) return null;
  return h * 60 + min;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/**
 * 남은 분 → 사람이 읽는 "후" 표기 (v2.2.14 사용자 피드백).
 * 60분 미만 "M분 후" · 정각 "H시간 후" · 그 외 "H시간 M분 후" — "345분 후" 방지.
 */
export function formatMinutesUntil(minutes: number): string {
  if (minutes < 60) return `${minutes}분 후`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}시간 후` : `${h}시간 ${m}분 후`;
}

/** 지금 시각 기준 펫이 알 수 있는 정보(수업/할 일/일정/급식)를 한 번에 계산 */
export function derivePinInfo(params: DerivePinInfoParams): PinInfo {
  const { now, periodTimes, teacherSchedule, todos, events, lunchMenu } = params;
  const today = localDateStr(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const day = getDayOfWeek(now);

  // ── 수업(교사 시간표: 과목 + 교실) ──────────────────────────────
  const getSlot = (period: number) => {
    if (!day || !teacherSchedule) return null;
    const slots = teacherSchedule[day];
    return slots ? (slots[period - 1] ?? null) : null;
  };

  let current: PinInfo['current'] = null;
  let next: PinClassInfo | null = null;

  // ── 오늘 수업 수 + 첫 수업 (아침 브리핑용, v2.2.7) ────────────────
  let todayClassCount = 0;
  let firstClass: PinClassInfo | null = null;
  if (day && periodTimes && periodTimes.length > 0) {
    for (let p = 1; p <= periodTimes.length; p++) {
      const slot = getSlot(p);
      if (slot && slot.subject) {
        todayClassCount++;
        if (!firstClass) {
          const start = parseHHmm(periodTimes[p - 1]?.start);
          firstClass = {
            number: p,
            subject: slot.subject,
            classroom: slot.classroom ?? '',
            minutesUntil: start != null ? Math.max(0, start - nowMinutes) : 0,
          };
        }
      }
    }
  }

  if (day && periodTimes && periodTimes.length > 0) {
    const curNum = getCurrentPeriod(periodTimes, now);
    if (curNum) {
      const slot = getSlot(curNum);
      current = {
        number: curNum,
        subject: slot?.subject ?? '',
        classroom: slot?.classroom ?? '',
      };
    }

    // 다음으로 "실제 수업이 있는" 교시 찾기 (빈 교시는 건너뜀)
    const startPeriod = curNum ? curNum + 1 : 1;
    for (let p = startPeriod; p <= periodTimes.length; p++) {
      const pt = periodTimes[p - 1];
      const start = parseHHmm(pt?.start);
      if (start == null) continue;
      // 쉬는 시간(현재 교시 없음)일 땐 이미 지난 교시는 제외
      if (!curNum && start <= nowMinutes) continue;
      const slot = getSlot(p);
      if (slot && slot.subject) {
        next = {
          number: p,
          subject: slot.subject,
          classroom: slot.classroom ?? '',
          minutesUntil: Math.max(0, start - nowMinutes),
        };
        break;
      }
    }
  }

  // ── 마감 할 일(오늘까지, 미완료, 아카이브 제외) ──────────────────
  const dueList = todos.filter(
    (t) => !t.completed && !t.archivedAt && t.dueDate != null && t.dueDate <= today,
  );
  const overdueCount = dueList.filter((t) => (t.dueDate as string) < today).length;
  const sortedDue = [...dueList].sort((a, b) => {
    const ad = a.dueDate ?? '';
    const bd = b.dueDate ?? '';
    if (ad !== bd) return ad.localeCompare(bd);
    const at = a.time ?? '99:99';
    const bt = b.time ?? '99:99';
    if (at !== bt) return at.localeCompare(bt);
    return a.text.localeCompare(b.text);
  });
  const dueTodos: PinDueTodos = {
    count: dueList.length,
    overdueCount,
    topText: sortedDue.length > 0 ? truncate(sortedDue[0]!.text, 16) : null,
  };

  // ── 다가오는 일정(오늘 이후, 숨김 제외, 오늘 이미 지난 시각은 제외) ──
  const eventStart = (e: SchoolEvent): number => parseHHmm(e.startTime ?? e.time) ?? 9999;
  const upcoming = events
    .filter((e) => !e.isHidden && e.date >= today)
    .sort((a, b) =>
      a.date !== b.date ? a.date.localeCompare(b.date) : eventStart(a) - eventStart(b),
    );

  let nextEvent: PinEventInfo | null = null;
  for (const e of upcoming) {
    if (e.date === today) {
      const start = parseHHmm(e.startTime ?? e.time);
      if (start != null && start < nowMinutes) continue; // 오늘 이미 지난 시각 일정 제외
      nextEvent = {
        title: e.title,
        today: true,
        minutesUntil: start != null ? Math.max(0, start - nowMinutes) : null,
        date: e.date,
      };
    } else {
      nextEvent = { title: e.title, today: false, minutesUntil: null, date: e.date };
    }
    break;
  }

  // ── 오늘 급식(중식) — 메뉴가 주어졌을 때만 (v2.2.7) ──────────────
  // 점심 시작 시각: ① lunchAfterPeriod 교시의 종료 시각 ② 레거시 lunchStart ③ 모름(null)
  let lunch: PinLunchInfo | null = null;
  if (lunchMenu && lunchMenu.trim().length > 0) {
    let lunchStart: number | null = null;
    if (params.lunchAfterPeriod && periodTimes) {
      lunchStart = parseHHmm(periodTimes[params.lunchAfterPeriod - 1]?.end);
    }
    if (lunchStart == null) {
      lunchStart = parseHHmm(params.lunchStartFallback);
    }
    lunch = {
      menu: truncate(lunchMenu.trim(), 22),
      minutesUntil: lunchStart != null ? lunchStart - nowMinutes : null,
    };
  }

  return { current, next, dueTodos, nextEvent, todayClassCount, firstClass, lunch };
}

/**
 * 능동 말풍선으로 "먼저 알릴" 가장 급한 1건을 고르고, 어떤 동작으로 표현할지 결정.
 * 우선순위(v2.2.7): 곧 시작하는 수업(5분 내) > 아침 첫 수업 브리핑(30분 전)
 *   > 급식 브리핑(60분 전) > 마감 할 일 > 임박한 오늘 일정(30분 내).
 * 시간 창이 있는 알림(수업·브리핑·급식)을 상시 알림(할 일)보다 앞세운다 —
 * 할 일이 하루 종일 남아 있어도 시간성 알림이 창이 열리는 순간 끼어들 수 있게.
 * 알릴 게 없으면 null(평상시 idle).
 */
export function decidePeek(
  info: PinInfo,
  periodTimes?: readonly PeriodTime[],
): { state: PinState; text: string } | null {
  if (info.next && info.next.minutesUntil > 0 && info.next.minutesUntil <= 5) {
    const room = info.next.classroom ? ` · ${info.next.classroom}` : '';
    return {
      state: 'wave',
      text: `곧 ${resolvePeriodLabel(info.next.number, periodTimes)} ${info.next.subject}${room}`,
    };
  }
  // 아침 브리핑 — 오늘 첫 수업 시작 30분 전부터 (수업 전이므로 current 없음)
  if (
    !info.current &&
    info.next &&
    info.firstClass &&
    info.next.number === info.firstClass.number &&
    info.next.minutesUntil > 5 &&
    info.next.minutesUntil <= 30
  ) {
    const room = info.next.classroom ? ` · ${info.next.classroom}` : '';
    return {
      state: 'wave',
      text: `오늘 수업 ${info.todayClassCount}개 · 첫 수업 ${resolvePeriodLabel(info.next.number, periodTimes)} ${info.next.subject}${room} (${formatMinutesUntil(info.next.minutesUntil)})`,
    };
  }
  // 급식 브리핑 — 점심 시작 60분 전부터 시작 전까지
  if (
    info.lunch &&
    info.lunch.minutesUntil != null &&
    info.lunch.minutesUntil > 0 &&
    info.lunch.minutesUntil <= 60
  ) {
    return { state: 'jump', text: `오늘 급식 · ${info.lunch.menu}` };
  }
  if (info.dueTodos.count > 0) {
    const top = info.dueTodos.topText ? ` · ${info.dueTodos.topText}` : '';
    return { state: 'jump', text: `할 일 ${info.dueTodos.count}개${top}` };
  }
  if (
    info.nextEvent &&
    info.nextEvent.today &&
    info.nextEvent.minutesUntil != null &&
    info.nextEvent.minutesUntil > 0 &&
    info.nextEvent.minutesUntil <= 30
  ) {
    return { state: 'jump', text: `일정 · ${info.nextEvent.title}` };
  }
  return null;
}

export interface PinTodayClass {
  readonly number: number;
  readonly subject: string;
  readonly classroom: string;
  /** 교시 시작 시각 "HH:mm" (모르면 null) — 팝오버 시간 안내용 (v2.2.7) */
  readonly start: string | null;
  readonly isCurrent: boolean;
  readonly isNext: boolean;
}

/**
 * 팝오버 "오늘 수업" 목록 (v2.2.7) — 빈 교시 제외, 현재/다음 표시 포함.
 * current/next 판정은 derivePinInfo 결과를 재사용해 규칙이 갈라지지 않게 한다.
 */
export function listTodayClasses(
  params: Pick<DerivePinInfoParams, 'now' | 'periodTimes' | 'teacherSchedule'>,
  info: Pick<PinInfo, 'current' | 'next'>,
): PinTodayClass[] {
  const { now, periodTimes, teacherSchedule } = params;
  const day = getDayOfWeek(now);
  if (!day || !teacherSchedule || !periodTimes || periodTimes.length === 0) return [];
  const slots = teacherSchedule[day];
  if (!slots) return [];
  const out: PinTodayClass[] = [];
  for (let p = 1; p <= periodTimes.length; p++) {
    const slot = slots[p - 1];
    if (!slot || !slot.subject) continue;
    // 시작 시각 — "HH:mm - HH:mm" 형태도 앞쪽만 추려 통일
    const rawStart = periodTimes[p - 1]?.start;
    const startMatch = rawStart?.match(/\d{1,2}:\d{2}/);
    out.push({
      number: p,
      subject: slot.subject,
      classroom: slot.classroom ?? '',
      start: startMatch ? startMatch[0] : null,
      isCurrent: info.current?.number === p,
      isNext: info.next?.number === p,
    });
  }
  return out;
}

export interface PinDueTodoItem {
  readonly id: string;
  readonly text: string;
  readonly overdue: boolean;
}

/**
 * 팝오버 "마감 할 일" 상위 N개 (v2.2.7) — derivePinInfo 의 dueTodos 와 같은
 * 필터·정렬 규칙(오늘까지 마감, 미완료, 아카이브 제외, 마감일→시각→텍스트순).
 */
export function listTopDueTodos(
  todos: readonly Todo[],
  now: Date,
  limit: number,
): PinDueTodoItem[] {
  const today = localDateStr(now);
  const dueList = todos.filter(
    (t) => !t.completed && !t.archivedAt && t.dueDate != null && t.dueDate <= today,
  );
  const sorted = [...dueList].sort((a, b) => {
    const ad = a.dueDate ?? '';
    const bd = b.dueDate ?? '';
    if (ad !== bd) return ad.localeCompare(bd);
    const at = a.time ?? '99:99';
    const bt = b.time ?? '99:99';
    if (at !== bt) return at.localeCompare(bt);
    return a.text.localeCompare(b.text);
  });
  return sorted.slice(0, limit).map((t) => ({
    id: t.id,
    text: t.text,
    overdue: (t.dueDate as string) < today,
  }));
}

/** 마우스 호버 시 보여줄 전체 요약(제목 1줄 + 보조 줄들) */
export function buildSummary(
  info: PinInfo,
  periodTimes?: readonly PeriodTime[],
): { title: string; lines: string[] } {
  const lines: string[] = [];
  const title = info.current
    ? `${resolvePeriodLabel(info.current.number, periodTimes)} ${info.current.subject || '수업'}${info.current.classroom ? ` · ${info.current.classroom}` : ''}`
    : '쉬는 시간';

  if (info.next) {
    const room = info.next.classroom ? ` · ${info.next.classroom}` : '';
    const when =
      info.next.minutesUntil > 0 ? ` (${formatMinutesUntil(info.next.minutesUntil)})` : '';
    lines.push(
      `다음: ${resolvePeriodLabel(info.next.number, periodTimes)} ${info.next.subject}${room}${when}`,
    );
  }
  if (info.dueTodos.count > 0) {
    const top = info.dueTodos.topText ? ` · ${info.dueTodos.topText}` : '';
    lines.push(`할 일 ${info.dueTodos.count}개${top}`);
  }
  // 급식 — 시작 전 또는 시작 후 1시간까지만 (지나간 메뉴는 정보 가치 없음)
  if (info.lunch && (info.lunch.minutesUntil == null || info.lunch.minutesUntil > -60)) {
    lines.push(`급식: ${info.lunch.menu}`);
  }
  if (info.nextEvent) {
    // 오늘이면 남은 시간, 아니면 날짜·요일을 함께 안내 (v2.2.7 사용자 요청)
    const when = info.nextEvent.today
      ? info.nextEvent.minutesUntil != null
        ? ` (오늘, ${formatMinutesUntil(info.nextEvent.minutesUntil)})`
        : ' (오늘)'
      : ` (${formatMonthDayWeekday(info.nextEvent.date)})`;
    lines.push(`일정: ${info.nextEvent.title}${when}`);
  }
  if (lines.length === 0 && !info.current) lines.push('오늘 일정 없음');
  return { title, lines };
}
