import { describe, it, expect } from 'vitest';
import {
  assignGroups,
  calcGroupCount,
  calcGroupQuotas,
  calcMembersPerGroup,
  describeGroupSizes,
  validateConstraints,
  type Gender,
  type GroupingMember,
  type GroupResult,
  type Level,
} from './groupingRules';

/** 모둠별 인원 수 (예: [6, 5, 5, 5]) */
function sizes(result: readonly GroupResult[]): number[] {
  return result.map((g) => g.members.length);
}

/** 배정된 전체 인원 (아무도 누락되지 않았는지 확인용) */
function placedNames(result: readonly GroupResult[]): string[] {
  return result.flatMap((g) => g.members.map((m) => m.name)).sort();
}

function makeMembers(n: number): GroupingMember[] {
  return Array.from({ length: n }, (_, i) => ({ name: `학생${i + 1}`, number: i + 1 }));
}

const GENDERS: Gender[] = ['M', 'F'];
const LEVELS: Level[] = ['high', 'mid', 'low'];

function withGender(members: readonly GroupingMember[]): GroupingMember[] {
  return members.map((m, i) => ({ ...m, gender: GENDERS[i % 2]! }));
}

function withLevel(members: readonly GroupingMember[]): GroupingMember[] {
  return members.map((m, i) => ({ ...m, level: LEVELS[i % 3]! }));
}

describe('calcGroupQuotas', () => {
  it('나머지가 있으면 앞 모둠부터 1명씩만 더 준다 (21명 4모둠 → 6-5-5-5)', () => {
    expect(calcGroupQuotas(21, 4)).toEqual([6, 5, 5, 5]);
  });

  it('딱 떨어지면 전부 같은 인원', () => {
    expect(calcGroupQuotas(24, 4)).toEqual([6, 6, 6, 6]);
  });

  it('총합은 항상 전체 인원과 같고, 최대·최소 차이는 1명 이내', () => {
    for (let total = 1; total <= 40; total++) {
      for (let count = 1; count <= 12; count++) {
        const quotas = calcGroupQuotas(total, count);
        expect(quotas).toHaveLength(count);
        expect(quotas.reduce((a, b) => a + b, 0)).toBe(total);
        expect(Math.max(...quotas) - Math.min(...quotas)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('인원이나 모둠 수가 0 이하면 빈 배열', () => {
    expect(calcGroupQuotas(0, 4)).toEqual([]);
    expect(calcGroupQuotas(21, 0)).toEqual([]);
    expect(calcGroupQuotas(-3, 4)).toEqual([]);
  });
});

describe('describeGroupSizes', () => {
  it('인원이 다르면 각각 표기', () => {
    expect(describeGroupSizes([6, 5, 5, 5])).toBe('6명 1모둠 · 5명 3모둠');
  });

  it('인원이 같으면 "N명씩"으로 표기', () => {
    expect(describeGroupSizes([5, 5, 5])).toBe('5명씩 3모둠');
  });

  it('빈 배열은 빈 문자열', () => {
    expect(describeGroupSizes([])).toBe('');
  });
});

describe('assignGroups — 인원 균등 배분 (사용자 피드백: 21명 4모둠이 6-6-6-3으로 나옴)', () => {
  const members21 = makeMembers(21);

  it('기본 배정은 6-5-5-5', () => {
    expect(sizes(assignGroups(members21, 4, { method: 'number' })).sort((a, b) => b - a)).toEqual([
      6, 5, 5, 5,
    ]);
  });

  it('수준 균등 배분을 켜도 6-5-5-5 (수준 태그가 없어도 마찬가지)', () => {
    const noTag = sizes(assignGroups(members21, 4, { method: 'number', balanceLevel: true }));
    expect(noTag.sort((a, b) => b - a)).toEqual([6, 5, 5, 5]);

    const tagged = sizes(
      assignGroups(withLevel(members21), 4, { method: 'number', balanceLevel: true }),
    );
    expect(tagged.sort((a, b) => b - a)).toEqual([6, 5, 5, 5]);
  });

  it('성별 혼합 배분을 켜도 6-5-5-5', () => {
    const result = assignGroups(withGender(members21), 4, {
      method: 'number',
      genderMode: 'mix',
    });
    expect(sizes(result).sort((a, b) => b - a)).toEqual([6, 5, 5, 5]);
  });

  it('성별+수준을 동시에 켜도 6-5-5-5', () => {
    const result = assignGroups(withLevel(withGender(members21)), 4, {
      method: 'number',
      genderMode: 'mix',
      balanceLevel: true,
    });
    expect(sizes(result).sort((a, b) => b - a)).toEqual([6, 5, 5, 5]);
  });

  it('한 명짜리 모둠이 생기지 않는다 (21명 5모둠 → 5-4-4-4-4)', () => {
    const result = assignGroups(members21, 5, { method: 'number', balanceLevel: true });
    expect(sizes(result).sort((a, b) => b - a)).toEqual([5, 4, 4, 4, 4]);
  });

  it('어떤 옵션 조합에서도 최대·최소 차이가 1명을 넘지 않고 아무도 누락되지 않는다', () => {
    const optionSets = [
      { method: 'random' as const },
      { method: 'number' as const },
      { method: 'name' as const },
      { method: 'random' as const, genderMode: 'mix' as const },
      { method: 'random' as const, balanceLevel: true },
      { method: 'random' as const, genderMode: 'mix' as const, balanceLevel: true },
    ];
    for (let total = 4; total <= 36; total++) {
      const base = withLevel(withGender(makeMembers(total)));
      for (let count = 2; count <= 8; count++) {
        for (const opts of optionSets) {
          const result = assignGroups(base, count, opts);
          const s = sizes(result);
          expect(Math.max(...s) - Math.min(...s)).toBeLessThanOrEqual(1);
          expect(placedNames(result)).toHaveLength(total);
        }
      }
    }
  });
});

describe('assignGroups — 기본 동작 유지', () => {
  it('인원이 0이거나 모둠 수가 0이면 빈 결과', () => {
    expect(assignGroups([], 4, { method: 'random' })).toEqual([]);
    expect(assignGroups(makeMembers(10), 0, { method: 'random' })).toEqual([]);
  });

  it('모둠 수가 인원보다 많으면 인원 수만큼만 만든다', () => {
    const result = assignGroups(makeMembers(3), 8, { method: 'number' });
    expect(result).toHaveLength(3);
    expect(sizes(result)).toEqual([1, 1, 1]);
  });

  it('모둠 이름은 1모둠부터 순서대로', () => {
    const result = assignGroups(makeMembers(8), 4, { method: 'number' });
    expect(result.map((g) => g.label)).toEqual(['1모둠', '2모둠', '3모둠', '4모둠']);
  });

  it('동반(together) 지정한 두 명은 같은 모둠', () => {
    const result = assignGroups(makeMembers(20), 4, {
      method: 'number',
      constraints: { together: [['학생1', '학생20']], apart: [] },
    });
    const group = result.find((g) => g.members.some((m) => m.name === '학생1'));
    expect(group?.members.some((m) => m.name === '학생20')).toBe(true);
    expect(placedNames(result)).toHaveLength(20);
  });

  it('분리(apart) 지정한 두 명은 다른 모둠', () => {
    const result = assignGroups(makeMembers(20), 4, {
      method: 'number',
      constraints: { together: [], apart: [['학생1', '학생2']] },
    });
    const g1 = result.findIndex((g) => g.members.some((m) => m.name === '학생1'));
    const g2 = result.findIndex((g) => g.members.some((m) => m.name === '학생2'));
    expect(g1).not.toBe(g2);
  });

  it('제약 조건이 있어도 인원 균형은 유지된다', () => {
    const result = assignGroups(makeMembers(21), 4, {
      method: 'number',
      constraints: {
        together: [
          ['학생1', '학생2'],
          ['학생5', '학생6'],
        ],
        apart: [['학생3', '학생4']],
      },
    });
    const s = sizes(result);
    expect(Math.max(...s) - Math.min(...s)).toBeLessThanOrEqual(1);
    expect(placedNames(result)).toHaveLength(21);
  });

  it('모둠장 지정: 번호가 가장 빠른 학생', () => {
    const result = assignGroups(makeMembers(12), 3, {
      method: 'number',
      leaderMethod: 'first-number',
    });
    for (const g of result) {
      const minNumber = Math.min(...g.members.map((m) => m.number ?? Infinity));
      expect(g.leaderName).toBe(g.members.find((m) => m.number === minNumber)?.name);
    }
  });
});

describe('assignGroups — 동성 모둠', () => {
  it('한 모둠에 남녀가 섞이지 않는다', () => {
    const members = withGender(makeMembers(20));
    const result = assignGroups(members, 4, { method: 'number', genderMode: 'same' });
    for (const g of result) {
      const genders = new Set(g.members.map((m) => m.gender));
      expect(genders.size).toBeLessThanOrEqual(1);
    }
    expect(placedNames(result)).toHaveLength(20);
  });

  it('요청한 모둠 수를 넘기지 않는다', () => {
    const members = withGender(makeMembers(21));
    expect(assignGroups(members, 4, { method: 'number', genderMode: 'same' }).length).toBe(4);
  });

  it('한 성별만 있어도 요청한 모둠 수를 지킨다', () => {
    const allFemale = makeMembers(20).map((m) => ({ ...m, gender: 'F' as Gender }));
    const result = assignGroups(allFemale, 4, { method: 'number', genderMode: 'same' });
    expect(result).toHaveLength(4);
    expect(placedNames(result)).toHaveLength(20);
  });

  it('성별 태그가 하나도 없으면 일반 배정으로 폴백한다 (오류 없이)', () => {
    const result = assignGroups(makeMembers(21), 4, { method: 'number', genderMode: 'same' });
    expect(result).toHaveLength(4);
    expect(placedNames(result)).toHaveLength(21);
    expect(sizes(result).sort((a, b) => b - a)).toEqual([6, 5, 5, 5]);
  });

  it('일부만 성별 태그가 있어도 나머지가 한 모둠에 몰리지 않는다', () => {
    const members = makeMembers(21).map((m, i) => (i === 0 ? { ...m, gender: 'M' as Gender } : m));
    const result = assignGroups(members, 4, { method: 'number', genderMode: 'same' });
    expect(result).toHaveLength(4);
    expect(placedNames(result)).toHaveLength(21);
    expect(Math.max(...sizes(result))).toBeLessThanOrEqual(7);
  });

  it('모둠이 1개면 전원 한 모둠', () => {
    const result = assignGroups(withGender(makeMembers(10)), 1, {
      method: 'number',
      genderMode: 'same',
    });
    expect(result).toHaveLength(1);
    expect(placedNames(result)).toHaveLength(10);
  });
});

describe('calcGroupCount / calcMembersPerGroup', () => {
  it('모둠당 인원으로 모둠 수 계산', () => {
    expect(calcGroupCount(21, 6)).toBe(4);
    expect(calcGroupCount(21, 5)).toBe(5);
    expect(calcGroupCount(0, 5)).toBe(0);
    expect(calcGroupCount(21, 0)).toBe(0);
  });

  it('모둠 수로 모둠당 인원 계산', () => {
    expect(calcMembersPerGroup(21, 4)).toBe(6);
    expect(calcMembersPerGroup(0, 4)).toBe(0);
    expect(calcMembersPerGroup(21, 0)).toBe(0);
  });
});

describe('validateConstraints', () => {
  it('동반과 분리에 같은 쌍이 있으면 오류', () => {
    const errors = validateConstraints({
      together: [['가', '나']],
      apart: [['나', '가']],
    });
    expect(errors).toHaveLength(1);
  });

  it('충돌이 없으면 오류 없음', () => {
    expect(validateConstraints({ together: [['가', '나']], apart: [['다', '라']] })).toEqual([]);
  });
});
