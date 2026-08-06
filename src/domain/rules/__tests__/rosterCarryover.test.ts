/**
 * 학생 승계(S4.3) 계획 규칙 테스트 — 재학생만 승계, 비활성 제외 카운트,
 * 번호 부재 학생의 안전한 이어 붙이기, 관대 파싱(throw 금지).
 */
import { describe, expect, it } from 'vitest';
import { planRosterCarryover } from '../rosterCarryover';

describe('planRosterCarryover', () => {
  it('재학(active·미설정) 학생만 승계하고 비활성은 제외 개수로 보고한다', () => {
    const plan = planRosterCarryover([
      { id: 's1', name: '김재학', studentNumber: 1 },
      { id: 's2', name: '이전출', studentNumber: 2, status: 'transferred' },
      { id: 's3', name: '박휴학', studentNumber: 3, status: 'suspended' },
      { id: 's4', name: '최재학', studentNumber: 4, status: 'active' },
    ]);
    expect(plan.importable.map((s) => s.name)).toEqual(['김재학', '최재학']);
    expect(plan.excludedInactive).toBe(2);
  });

  it('연락처·생일·결번 필드를 보존하고 없는 필드는 빈 값으로 채운다', () => {
    const plan = planRosterCarryover({
      students: [
        {
          id: 's1',
          name: '김학생',
          studentNumber: 7,
          phone: '010-1111-2222',
          parentPhone: '010-3333-4444',
          parentPhoneLabel: '어머니',
          birthDate: '2010-05-01',
          isVacant: false,
        },
        { id: 's2', name: '이학생', studentNumber: 8, isVacant: true },
      ],
    });
    expect(plan.importable[0]).toEqual({
      name: '김학생',
      studentNumber: 7,
      phone: '010-1111-2222',
      parentPhone: '010-3333-4444',
      parentPhoneLabel: '어머니',
      parentPhone2: '',
      parentPhone2Label: '',
      birthDate: '2010-05-01',
      isVacant: false,
    });
    // 결번 필드 멤버 접근 금지(studentActivityCallSites 메타 가드) — 객체 매칭으로 단언
    expect(plan.importable[1]).toMatchObject({ name: '이학생', isVacant: true });
  });

  it('번호가 없는 학생은 기존 최대 번호 다음부터 이어 붙인다(0·중복 주입 금지)', () => {
    const plan = planRosterCarryover([
      { id: 's1', name: '가', studentNumber: 3 },
      { id: 's2', name: '나' },
      { id: 's3', name: '다' },
    ]);
    expect(plan.importable.map((s) => [s.name, s.studentNumber])).toEqual([
      ['가', 3],
      ['나', 4],
      ['다', 5],
    ]);
  });

  it('번호 오름차순으로 정렬한다', () => {
    const plan = planRosterCarryover([
      { id: 's1', name: '셋', studentNumber: 3 },
      { id: 's2', name: '하나', studentNumber: 1 },
    ]);
    expect(plan.importable.map((s) => s.name)).toEqual(['하나', '셋']);
  });

  it('관대 파싱 — 손상·비배열 입력에 throw하지 않고 빈 계획을 돌려준다', () => {
    expect(planRosterCarryover(null)).toEqual({ importable: [], excludedInactive: 0 });
    expect(planRosterCarryover('broken')).toEqual({ importable: [], excludedInactive: 0 });
    expect(planRosterCarryover({ students: 'x' })).toEqual({ importable: [], excludedInactive: 0 });
    expect(planRosterCarryover([{ id: 'noname' }, null, 42]).importable).toEqual([]);
  });
});
