import { describe, it, expect } from 'vitest';
import type { SchoolEvent } from '@domain/entities/SchoolEvent';
import { toAddEventParams } from './eventFormMapping';

/** 폼에서 사용자가 직접 입력·선택할 수 있는 값을 모두 채운 일정 */
const FILLED_EVENT: SchoolEvent = {
  id: 'form-generated-id',
  title: '학년 협의회',
  date: '2026-08-20',
  category: 'school',
  description: '2학기 평가 협의',
  endDate: '2026-08-21',
  time: '09:00 - 10:00',
  location: '회의실',
  isDDay: true,
  alerts: ['30min', 'custom:120'],
  recurrence: 'weekly',
  period: '3',
  periodEnd: '4',
};

describe('toAddEventParams', () => {
  it('폼에서 고른 교시를 그대로 넘긴다 (누락 시 교시가 저장되지 않던 회귀)', () => {
    const params = toAddEventParams(FILLED_EVENT);

    expect(params.period).toBe('3');
    expect(params.periodEnd).toBe('4');
  });

  it('폼에서 입력 가능한 값이 하나도 빠지지 않는다', () => {
    const params = toAddEventParams(FILLED_EVENT);

    expect(params).toEqual({
      title: '학년 협의회',
      date: '2026-08-20',
      category: 'school',
      description: '2학기 평가 협의',
      endDate: '2026-08-21',
      time: '09:00 - 10:00',
      location: '회의실',
      isDDay: true,
      alerts: ['30min', 'custom:120'],
      recurrence: 'weekly',
      period: '3',
      periodEnd: '4',
    });
  });

  it('알림 배열은 새 배열로 복사해 폼 상태와 공유하지 않는다', () => {
    const params = toAddEventParams(FILLED_EVENT);

    expect(params.alerts).toEqual(FILLED_EVENT.alerts);
    expect(params.alerts).not.toBe(FILLED_EVENT.alerts);
  });

  it('비워 둔 값은 undefined 로 넘겨 스토어가 필드를 생략하게 한다', () => {
    const minimal: SchoolEvent = {
      id: 'x',
      title: '제목만',
      date: '2026-08-20',
      category: 'etc',
    };

    const params = toAddEventParams(minimal);

    expect(params.title).toBe('제목만');
    expect(params.period).toBeUndefined();
    expect(params.periodEnd).toBeUndefined();
    expect(params.alerts).toBeUndefined();
    expect(params.recurrence).toBeUndefined();
  });
});
