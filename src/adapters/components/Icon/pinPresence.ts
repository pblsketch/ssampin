/**
 * pinPresence — 아이콘 모드 펫이 "무엇을 알릴지" 정하는 순수 로직 (v2.2.3~).
 *
 * 펫(파란 압정 캐릭터)은 4개 스프라이트 동작(idle / jump / wave / celebrate)을
 * 표현 수단으로 쓴다. 이 모듈은 React 없이 순수 함수로:
 *   - derivePinInfo: 지금 시각 기준 다음 수업(과목+교실) / 마감 할 일 / 다가오는 일정 계산
 *   - decidePeek:    능동 말풍선으로 "먼저 알릴" 가장 급한 1건 + 어떤 동작으로 표현할지
 *   - buildSummary:  마우스 호버 시 보여줄 전체 요약
 *   - hasPinAlert:   주황 알림 링을 켤지 여부(임박한 것만)
 *
 * 모든 시간 비교는 주입된 now 기준 — 테스트에서 고정 시각으로 검증 가능.
 */
import type { Todo } from '@domain/entities/Todo';
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
}

export interface DerivePinInfoParams {
  readonly now: Date;
  readonly periodTimes: readonly PeriodTime[] | undefined;
  readonly teacherSchedule: TeacherScheduleData | null | undefined;
  readonly todos: readonly Todo[];
  readonly events: readonly SchoolEvent[];
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

/** 지금 시각 기준 펫이 알 수 있는 정보(수업/할 일/일정)를 한 번에 계산 */
export function derivePinInfo(params: DerivePinInfoParams): PinInfo {
  const { now, periodTimes, teacherSchedule, todos, events } = params;
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
      };
    } else {
      nextEvent = { title: e.title, today: false, minutesUntil: null };
    }
    break;
  }

  return { current, next, dueTodos, nextEvent };
}

/**
 * 능동 말풍선으로 "먼저 알릴" 가장 급한 1건을 고르고, 어떤 동작으로 표현할지 결정.
 * 우선순위: 곧 시작하는 수업(5분 내) > 마감 할 일 > 임박한 오늘 일정(30분 내).
 * 알릴 게 없으면 null(평상시 idle).
 */
export function decidePeek(info: PinInfo): { state: PinState; text: string } | null {
  if (info.next && info.next.minutesUntil > 0 && info.next.minutesUntil <= 5) {
    const room = info.next.classroom ? ` · ${info.next.classroom}` : '';
    return { state: 'wave', text: `곧 ${info.next.number}교시 ${info.next.subject}${room}` };
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

/** 마우스 호버 시 보여줄 전체 요약(제목 1줄 + 보조 줄들) */
export function buildSummary(info: PinInfo): { title: string; lines: string[] } {
  const lines: string[] = [];
  const title = info.current
    ? `${info.current.number}교시 ${info.current.subject || '수업'}${info.current.classroom ? ` · ${info.current.classroom}` : ''}`
    : '쉬는 시간';

  if (info.next) {
    const room = info.next.classroom ? ` · ${info.next.classroom}` : '';
    const when = info.next.minutesUntil > 0 ? ` (${info.next.minutesUntil}분 후)` : '';
    lines.push(`다음: ${info.next.number}교시 ${info.next.subject}${room}${when}`);
  }
  if (info.dueTodos.count > 0) {
    const top = info.dueTodos.topText ? ` · ${info.dueTodos.topText}` : '';
    lines.push(`할 일 ${info.dueTodos.count}개${top}`);
  }
  if (info.nextEvent) {
    const when = info.nextEvent.today
      ? info.nextEvent.minutesUntil != null
        ? ` (${info.nextEvent.minutesUntil}분 후)`
        : ' (오늘)'
      : '';
    lines.push(`일정: ${info.nextEvent.title}${when}`);
  }
  if (lines.length === 0 && !info.current) lines.push('오늘 일정 없음');
  return { title, lines };
}

/** 주황 알림 링을 켤지 — 임박한 것(5분 내 수업/일정)이나 지난 마감만 */
export function hasPinAlert(info: PinInfo): boolean {
  if (info.next && info.next.minutesUntil > 0 && info.next.minutesUntil <= 5) return true;
  if (info.dueTodos.overdueCount > 0) return true;
  if (
    info.nextEvent &&
    info.nextEvent.today &&
    info.nextEvent.minutesUntil != null &&
    info.nextEvent.minutesUntil <= 5
  ) {
    return true;
  }
  return false;
}
