import { describe, it, expect } from 'vitest';
import { diffSettingsKeys } from './diffSettingsKeys';

describe('diffSettingsKeys — 설정에서 달라진 항목 이름만 추린다', () => {
  it('바뀐 항목의 이름을 돌려준다', () => {
    expect(diffSettingsKeys({ staffRoomEnabled: false }, { staffRoomEnabled: true })).toEqual([
      'staffRoomEnabled',
    ]);
  });

  it('안 바뀐 항목은 넣지 않는다', () => {
    expect(diffSettingsKeys({ a: 1, b: 2 }, { a: 1, b: 2 })).toEqual([]);
  });

  it('한 겹 안쪽까지는 어느 값이 바뀌었는지 알려 준다', () => {
    expect(
      diffSettingsKeys(
        { widget: { opacity: 1, mode: 'normal' } },
        { widget: { opacity: 0.8, mode: 'normal' } },
      ),
    ).toEqual(['widget.opacity']);
  });

  it('두 겹보다 깊이는 파고들지 않는다 — 항목이 수십 개로 쏟아지면 통계가 잡음에 덮인다', () => {
    const before = { periodTimes: { '1': { start: '09:00', end: '09:50' } } };
    const after = { periodTimes: { '1': { start: '08:50', end: '09:40' } } };
    expect(diffSettingsKeys(before, after)).toEqual(['periodTimes.1']);
  });

  it('한쪽에만 있는 항목도 잡는다', () => {
    expect(diffSettingsKeys({}, { pin: 'x' })).toEqual(['pin']);
    expect(diffSettingsKeys({ pin: 'x' }, {})).toEqual(['pin']);
  });

  it('★값은 절대 담지 않는다 — 학교명·교사 이름이 통계로 새면 안 된다', () => {
    const keys = diffSettingsKeys(
      { schoolName: '가나고등학교', teacherName: '김철수' },
      { schoolName: '다라중학교', teacherName: '이영희' },
    );
    expect(keys).toEqual(['schoolName', 'teacherName']);
    expect(keys.join(' ')).not.toContain('고등학교');
    expect(keys.join(' ')).not.toContain('김철수');
  });

  it('항목이 아주 많아도 25개에서 자른다 — 통계는 목록이 아니라 신호다', () => {
    const before: Record<string, number> = {};
    const after: Record<string, number> = {};
    for (let i = 0; i < 40; i += 1) {
      before[`k${i}`] = 0;
      after[`k${i}`] = 1;
    }
    expect(diffSettingsKeys(before, after)).toHaveLength(25);
  });

  it('배열은 통째로 견준다 — 순서만 바뀌어도 바뀐 것으로 본다', () => {
    expect(diffSettingsKeys({ toolsOrder: ['a', 'b'] }, { toolsOrder: ['b', 'a'] })).toEqual([
      'toolsOrder',
    ]);
    expect(diffSettingsKeys({ toolsOrder: ['a', 'b'] }, { toolsOrder: ['a', 'b'] })).toEqual([]);
  });
});
