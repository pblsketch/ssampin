/**
 * 한 주 정리·학기 돌아보기 창의 **숫자 한 줄** 훅(돌아보기 spec 2·3).
 *
 * - 수업·끝낸 할 일은 이 컴퓨터 자료라 창이 열리자마자 있다.
 * - 상담은 창을 열 때(학기 돌아보기는 그 학기를 처음 볼 때) 한 번 서버에 묻고, 답이 모두 오면 줄 끝에 붙는다.
 *   창이 열려 있는 동안 같은 기간·같은 일정은 다시 묻지 않는다(창 하나가 `ConsultationSession` 하나를 나눠 쓴다).
 *   창을 닫으면 아직 오지 않은 답은 화면에 붙이지 않는다.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useTodoStore } from '@adapters/stores/useTodoStore';
import { readTodoCompletionSince } from '@adapters/utils/todoCompletionSince';
import {
  clampRangeToToday,
  isPartialTodoTerm,
  workCountItems,
  workCountLine,
  type DateRange,
  type WorkCounts,
} from '@domain/rules/recapWorkCounts';
import { toLocalDateString } from '@shared/utils/localDate';
import {
  createConsultationFetchCache,
  fetchConsultationCount,
  type ConsultationFetchCache,
} from './consultationRecapFetch';
import {
  classLessonCounts,
  localWorkCounts,
  todoCountNote,
  weekDateRange,
  type ClassLessonCount,
} from './recapWorkData';

/** 수업·할 일 자료를 불러 둔다(이미 있으면 그대로). */
export function useWorkStoresLoaded(): void {
  useEffect(() => {
    if (!useTodoStore.getState().loaded) void useTodoStore.getState().load();
    if (!useTeachingClassStore.getState().loaded) void useTeachingClassStore.getState().load();
  }, []);
}

/** 창 하나가 열려 있는 동안의 상담 답 — 기간별 답과 일정별 답. 창을 새로 열면 새로 만든다. */
export interface ConsultationSession {
  readonly ranges: Map<string, Promise<number | null>>;
  readonly fetch: ConsultationFetchCache;
}

export function createConsultationSession(): ConsultationSession {
  return { ranges: new Map(), fetch: createConsultationFetchCache() };
}

const ConsultationSessionContext = createContext<ConsultationSession | null>(null);

/** 정리 창이 감싸 둔다 — 안의 숫자 줄(학기·접힌 이번 주)이 같은 답을 나눠 쓴다. */
export const ConsultationSessionProvider = ConsultationSessionContext.Provider;

/**
 * 기간의 상담 예약 수 — 아직 안 왔거나 못 가져왔으면 null. 창이 열려 있는 동안 기간별로 한 번만 묻는다
 * (다른 학기로 갔다가 돌아와도, 답이 오기 전에 떠났어도 다시 묻지 않는다).
 * @param range 오늘까지로 자른 기간. null 이면 묻지 않는다.
 */
export function useConsultationCount(range: DateRange | null): number | null {
  const shared = useContext(ConsultationSessionContext);
  const own = useRef<ConsultationSession | null>(null);
  const session = shared ?? (own.current ??= createConsultationSession());
  const key = range === null ? null : `${range.start}~${range.end}`;
  const [value, setValue] = useState<{ key: string; count: number | null } | null>(null);

  useEffect(() => {
    if (range === null || key === null) return;
    let asked = session.ranges.get(key);
    if (asked === undefined) {
      asked = fetchConsultationCount(range, session.fetch);
      session.ranges.set(key, asked);
    }
    let cancelled = false;
    void asked.then((count) => {
      if (!cancelled) setValue({ key, count });
    });
    return () => {
      cancelled = true;
    };
    // range 는 key 로 대신한다(같은 기간이면 다시 묻지 않는다).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, session]);

  return value !== null && value.key === key ? value.count : null;
}

/** 한 주(월요일 시작)의 숫자 줄. 그 주가 통째로 미래이거나 셋 다 없으면 null. */
export function useWeekWorkLine(week: string | null): string | null {
  const todos = useTodoStore((s) => s.todos);
  const entries = useTeachingClassStore((s) => s.progressEntries);
  useWorkStoresLoaded();
  const today = toLocalDateString(new Date());
  const range = week === null ? null : clampRangeToToday(weekDateRange(week), today);
  const consultations = useConsultationCount(range);
  return useMemo(() => {
    if (week === null) return null;
    const local = localWorkCounts(
      weekDateRange(week),
      today,
      todos,
      entries,
      readTodoCompletionSince(),
    );
    return workCountLine(workCountItems({ ...local, consultations }));
  }, [week, today, todos, entries, consultations]);
}

export interface TermWork {
  /** 화면 숫자 줄(없으면 null) */
  readonly line: string | null;
  /** 반별 완료 차시(0인 반 없음) */
  readonly byClass: readonly ClassLessonCount[];
  /** 학기 중간부터 센 할 일 안내(없으면 null) */
  readonly todoNote: string | null;
  /** 그림에 넣을 숫자(상담은 가져오기에 성공했을 때만) */
  readonly counts: WorkCounts;
  /** 끝낸 할 일이 학기 중간부터 센 수인가 — 그림에서 할 일을 뺀다 */
  readonly partialTodoTerm: boolean;
}

/** 학기 창의 숫자 줄·반별 줄·할 일 안내. */
export function useTermWork(termRange: DateRange | null): TermWork | null {
  const todos = useTodoStore((s) => s.todos);
  const entries = useTeachingClassStore((s) => s.progressEntries);
  const classes = useTeachingClassStore((s) => s.classes);
  useWorkStoresLoaded();
  const today = toLocalDateString(new Date());
  const range = termRange === null ? null : clampRangeToToday(termRange, today);
  const consultations = useConsultationCount(range);
  const start = termRange?.start ?? null;
  const end = termRange?.end ?? null;
  return useMemo(() => {
    if (start === null || end === null) return null;
    const since = readTodoCompletionSince();
    const local = localWorkCounts({ start, end }, today, todos, entries, since);
    const counts: WorkCounts = { ...local, consultations };
    return {
      line: workCountLine(workCountItems(counts)),
      byClass: classLessonCounts(entries, { start, end }, today, classes),
      todoNote: todoCountNote(start, since, local.todos),
      counts,
      partialTodoTerm: isPartialTodoTerm(start, since),
    };
  }, [start, end, today, todos, entries, classes, consultations]);
}
