/**
 * 일정 추가 폼(EventFormModal) 결과를 스토어의 addEvent 파라미터로 옮겨 담는 순수 매핑.
 *
 * 이 매핑에서 필드를 빠뜨리면 사용자가 폼에서 고른 값이 조용히 버려진다
 * (실제 사고: 교시(period)를 골라도 저장되지 않음). 컴포넌트에서 인라인으로
 * 나열하면 새 필드가 추가될 때마다 누락을 놓치므로, 계약을 여기로 모으고
 * eventFormMapping.test.ts 가 지킨다.
 */
import type { SchoolEvent, AlertTiming, Recurrence } from '@domain/entities/SchoolEvent';

/** useEventsStore.addEvent 가 받는 파라미터 형태 */
export interface AddEventParamsShape {
  title: string;
  date: string;
  category: string;
  description?: string;
  endDate?: string;
  time?: string;
  location?: string;
  isDDay?: boolean;
  alerts?: readonly AlertTiming[];
  recurrence?: Recurrence;
  period?: string;
  periodEnd?: string;
}

/** 폼이 만든 SchoolEvent 를 addEvent 파라미터로 변환한다 (id 는 스토어가 새로 발급). */
export function toAddEventParams(event: SchoolEvent): AddEventParamsShape {
  return {
    title: event.title,
    date: event.date,
    category: event.category,
    description: event.description,
    endDate: event.endDate,
    time: event.time,
    location: event.location,
    isDDay: event.isDDay,
    alerts: event.alerts ? [...event.alerts] : undefined,
    recurrence: event.recurrence,
    period: event.period,
    periodEnd: event.periodEnd,
  };
}
