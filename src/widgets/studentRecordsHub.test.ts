/**
 * 학생 빠른 기록 허브 — 위젯 등록 회귀.
 *
 * ★막으려는 것 1: 허브를 담임 전용으로 되돌리는 것. 이 카드는 수업반 특기사항도 다루므로
 *   교과·부장 선생님에게도 보여야 한다.
 * ★막으려는 것 2: 카드를 하나 더 만드는 것. 위젯 id 는 `student-records` 하나뿐이다.
 * ★막으려는 것 3: 옆핀 노출. 학생 개인정보가 담긴 카드는 늘 떠 있는 옆핀에 올리지 않는다.
 */
import { describe, expect, it } from 'vitest';
import { WIDGET_DEFINITIONS } from './registry';

const hub = WIDGET_DEFINITIONS.find((d) => d.id === 'student-records');

describe('학생 빠른 기록 위젯', () => {
  it('위젯은 하나뿐이다 — 빠른 기록용 카드를 따로 만들지 않는다', () => {
    const studentRecordWidgets = WIDGET_DEFINITIONS.filter((d) => d.id.includes('student-record'));
    expect(studentRecordWidgets.map((d) => d.id)).toEqual(['student-records']);
  });

  it('담임·교과·부장 모두에게 제공한다', () => {
    expect(hub).toBeDefined();
    expect([...hub!.availableFor.role].sort()).toEqual(['admin', 'homeroom', 'subject']);
  });

  it('옆핀에는 올리지 않고 이유를 한국어로 적는다', () => {
    expect(hub!.sidePin?.eligible).toBe(false);
    expect(hub!.sidePin?.eligible === false ? hub!.sidePin.unavailableReason : '').toContain(
      '개인정보',
    );
  });

  it('학급 시간표 위젯의 제공 대상은 담임 그대로다 — 허브 작업이 옆 위젯을 건드리지 않는다', () => {
    const classTimetable = WIDGET_DEFINITIONS.find((d) => d.id === 'class-timetable');
    expect(classTimetable?.availableFor.role).toEqual(['homeroom']);
  });
});
