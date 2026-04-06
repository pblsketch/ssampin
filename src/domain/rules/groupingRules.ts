/**
 * 모둠 편성 순수 함수 (domain 레이어 — 외부 의존 없음)
 */

import { shuffleArray } from './randomRules';

export type Gender = 'M' | 'F';
export type Level = 'high' | 'mid' | 'low';

export interface GroupingMember {
  readonly name: string;
  readonly number?: number;
  readonly gender?: Gender;
  readonly level?: Level;
  /** 배정된 역할 */
  readonly role?: string;
}

export type LeaderMethod = 'none' | 'first-number' | 'random';
export type RoleAssignMode = 'none' | 'random' | 'manual';

export interface RoleConfig {
  readonly name: string;
  /** 해당 역할에 배정할 인원 수 (기본 1) */
  readonly count: number;
}

export interface GroupResult {
  readonly label: string;
  readonly members: GroupingMember[];
  /** 모둠장 이름 (LeaderMethod !== 'none' 일 때) */
  readonly leaderName?: string;
}

export type GroupingMethod = 'random' | 'number' | 'name';
export type GenderMode = 'none' | 'mix' | 'same';

export interface GroupingConstraints {
  /** 같은 모둠에 배치할 쌍 */
  readonly together: readonly [string, string][];
  /** 다른 모둠에 배치할 쌍 */
  readonly apart: readonly [string, string][];
}

export interface GroupingOptions {
  readonly method: GroupingMethod;
  readonly constraints?: GroupingConstraints;
  readonly genderMode?: GenderMode;
  readonly balanceLevel?: boolean;
  readonly leaderMethod?: LeaderMethod;
  readonly roles?: readonly RoleConfig[];
  readonly roleAssignMode?: RoleAssignMode;
}

/**
 * RoleConfig를 count만큼 펼쳐서 역할명 배열로 변환
 * 예: [{ name: '이끔이', count: 1 }, { name: '기록이', count: 2 }] → ['이끔이', '기록이', '기록이']
 */
export function expandRoles(roles: readonly RoleConfig[]): string[] {
  const result: string[] = [];
  for (const r of roles) {
    for (let i = 0; i < Math.max(1, r.count); i++) {
      result.push(r.name);
    }
  }
  return result;
}

/**
 * 역할을 모둠 멤버에게 배정 (랜덤)
 * - 총 역할 슬롯 = sum(role.count)
 * - 슬롯 수 <= 멤버 수: 남은 멤버에는 역할 없음
 * - 슬롯 수 > 멤버 수: 한 명이 복수 역할
 */
export function assignRolesToGroup(
  members: GroupingMember[],
  roles: readonly RoleConfig[],
): GroupingMember[] {
  if (roles.length === 0) return members;

  const expanded = shuffleArray(expandRoles(roles));
  const totalSlots = expanded.length;

  if (totalSlots <= members.length) {
    const shuffledMembers = shuffleArray(members);
    return shuffledMembers.map((m, i) => ({
      ...m,
      role: i < totalSlots ? expanded[i] : undefined,
    }));
  } else {
    const shuffledMembers = shuffleArray(members);
    const roleAssignment: string[][] = members.map(() => []);
    for (let i = 0; i < totalSlots; i++) {
      roleAssignment[i % members.length]!.push(expanded[i]!);
    }
    return shuffledMembers.map((m, i) => ({
      ...m,
      role: roleAssignment[i]!.join(', ') || undefined,
    }));
  }
}

/**
 * 모둠 수 계산: 총 인원과 모둠당 인원수로 계산
 */
export function calcGroupCount(totalMembers: number, membersPerGroup: number): number {
  if (membersPerGroup <= 0 || totalMembers <= 0) return 0;
  return Math.ceil(totalMembers / membersPerGroup);
}

/**
 * 모둠당 인원 수 계산: 총 인원과 모둠 수로 계산
 */
export function calcMembersPerGroup(totalMembers: number, groupCount: number): number {
  if (groupCount <= 0 || totalMembers <= 0) return 0;
  return Math.ceil(totalMembers / groupCount);
}

function makeLabels(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${i + 1}모둠`);
}

function emptyGroups(count: number): GroupingMember[][] {
  return Array.from({ length: count }, () => []);
}

function smallestGroupIdx(groups: GroupingMember[][]): number {
  let minIdx = 0;
  let minLen = Infinity;
  for (let i = 0; i < groups.length; i++) {
    if (groups[i]!.length < minLen) {
      minLen = groups[i]!.length;
      minIdx = i;
    }
  }
  return minIdx;
}

/**
 * 성별 분리 그룹의 인원 배분을 위해, 해당 성별이 가장 적은 그룹 인덱스 반환
 */
function leastGenderIdx(
  groups: GroupingMember[][],
  gender: Gender,
  maxPerGroup: number,
): number {
  let minIdx = -1;
  let minCount = Infinity;
  for (let i = 0; i < groups.length; i++) {
    if (groups[i]!.length >= maxPerGroup) continue;
    const count = groups[i]!.filter((m) => m.gender === gender).length;
    if (count < minCount) {
      minCount = count;
      minIdx = i;
    }
  }
  return minIdx === -1 ? smallestGroupIdx(groups) : minIdx;
}

/**
 * 수준별 균등 배분: 해당 레벨이 가장 적은 그룹 인덱스
 */
function leastLevelIdx(
  groups: GroupingMember[][],
  level: Level,
  maxPerGroup: number,
): number {
  let minIdx = -1;
  let minCount = Infinity;
  for (let i = 0; i < groups.length; i++) {
    if (groups[i]!.length >= maxPerGroup) continue;
    const count = groups[i]!.filter((m) => m.level === level).length;
    if (count < minCount) {
      minCount = count;
      minIdx = i;
    }
  }
  return minIdx === -1 ? smallestGroupIdx(groups) : minIdx;
}

/**
 * 성별 동성 그룹: 남녀 따로 모둠 구성
 */
function assignSameGender(
  members: readonly GroupingMember[],
  groupCount: number,
  method: GroupingMethod,
): GroupResult[] {
  const males = members.filter((m) => m.gender === 'M');
  const females = members.filter((m) => m.gender === 'F');
  const untagged = members.filter((m) => !m.gender);

  // 성별별로 그룹 수 비례 배분
  const total = members.length;
  const maleGroups = total > 0 ? Math.max(1, Math.round(groupCount * males.length / total)) : 0;
  const femaleGroups = Math.max(groupCount - maleGroups, females.length > 0 ? 1 : 0);
  const actualMaleGroups = males.length > 0 ? Math.min(maleGroups, males.length) : 0;
  const actualFemaleGroups = females.length > 0 ? Math.min(femaleGroups, females.length) : 0;

  const maleResults = actualMaleGroups > 0
    ? assignGroups(males, actualMaleGroups, { method })
    : [];
  const femaleResults = actualFemaleGroups > 0
    ? assignGroups(females, actualFemaleGroups, { method })
    : [];

  // 미지정 성별은 가장 작은 그룹에 분배
  const all = [...maleResults, ...femaleResults];
  if (untagged.length > 0) {
    const ordered = method === 'random' ? shuffleArray(untagged) : untagged;
    for (const m of ordered) {
      const minGroup = all.reduce((prev, curr) =>
        curr.members.length < prev.members.length ? curr : prev, all[0]!);
      minGroup.members.push(m);
    }
  }

  // 번호 재매기기
  return all.map((g, i) => ({ ...g, label: `${i + 1}모둠` }));
}

/**
 * 모둠장 선정
 */
function pickLeader(members: GroupingMember[], leaderMethod: LeaderMethod): string | undefined {
  if (leaderMethod === 'none' || members.length === 0) return undefined;
  if (leaderMethod === 'first-number') {
    const withNumber = members.filter((m) => m.number != null);
    if (withNumber.length > 0) {
      const sorted = [...withNumber].sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
      return sorted[0]!.name;
    }
    return members[0]!.name;
  }
  // random
  const idx = Math.floor(Math.random() * members.length);
  return members[idx]!.name;
}

/**
 * 메인 모둠 편성 함수
 */
export function assignGroups(
  members: readonly GroupingMember[],
  groupCount: number,
  options: GroupingOptions = { method: 'random' },
): GroupResult[] {
  const { method, constraints, genderMode, balanceLevel, leaderMethod, roles, roleAssignMode } = options;

  if (members.length === 0 || groupCount <= 0) return [];
  const actualGroupCount = Math.min(groupCount, members.length);

  // 동성 모둠 특수 처리
  if (genderMode === 'same') {
    const results = assignSameGender(members, actualGroupCount, method);
    if (leaderMethod && leaderMethod !== 'none') {
      return results.map((g) => ({ ...g, leaderName: pickLeader([...g.members], leaderMethod) }));
    }
    return results;
  }

  const labels = makeLabels(actualGroupCount);
  const groups = emptyGroups(actualGroupCount);
  const maxPerGroup = Math.ceil(members.length / actualGroupCount);

  // 정렬된 멤버 목록 준비
  let ordered: GroupingMember[];
  switch (method) {
    case 'number':
      ordered = [...members].sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
      break;
    case 'name':
      ordered = [...members].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
      break;
    case 'random':
    default:
      ordered = shuffleArray(members);
      break;
  }

  const placed = new Set<string>();

  // 1단계: together 쌍을 같은 그룹에 배치
  if (constraints?.together.length) {
    for (const [a, b] of constraints.together) {
      if (placed.has(a) && placed.has(b)) continue;

      let targetIdx = -1;
      if (placed.has(a)) {
        targetIdx = groups.findIndex((g) => g.some((m) => m.name === a));
      } else if (placed.has(b)) {
        targetIdx = groups.findIndex((g) => g.some((m) => m.name === b));
      }

      if (targetIdx === -1) {
        targetIdx = smallestGroupIdx(groups);
      }

      for (const name of [a, b]) {
        if (placed.has(name)) continue;
        const member = ordered.find((m) => m.name === name);
        if (member && groups[targetIdx]!.length < maxPerGroup) {
          groups[targetIdx]!.push(member);
          placed.add(name);
        }
      }
    }
  }

  // 2단계: apart 쌍을 서로 다른 그룹에 분산
  if (constraints?.apart.length) {
    for (const [a, b] of constraints.apart) {
      for (const name of [a, b]) {
        if (placed.has(name)) continue;
        const member = ordered.find((m) => m.name === name);
        if (!member) continue;

        const otherName = name === a ? b : a;
        const avoidIdx = groups.findIndex((g) => g.some((m) => m.name === otherName));

        let bestIdx = -1;
        let bestLen = Infinity;
        for (let i = 0; i < groups.length; i++) {
          if (i === avoidIdx) continue;
          if (groups[i]!.length < bestLen && groups[i]!.length < maxPerGroup) {
            bestLen = groups[i]!.length;
            bestIdx = i;
          }
        }

        if (bestIdx === -1) bestIdx = smallestGroupIdx(groups);
        groups[bestIdx]!.push(member);
        placed.add(name);
      }
    }
  }

  // 3단계: 나머지 멤버 배치 (성별 혼합 / 수준별 균등)
  const remaining = ordered.filter((m) => !placed.has(m.name));

  if (genderMode === 'mix' && balanceLevel) {
    // 성별+수준 동시 균형: 수준별로 분류 후 성별 교차 배치
    const byLevel: Record<string, GroupingMember[]> = { high: [], mid: [], low: [], none: [] };
    for (const m of remaining) {
      byLevel[m.level ?? 'none']!.push(m);
    }
    for (const level of ['high', 'mid', 'low', 'none'] as const) {
      const levelMembers = method === 'random' ? shuffleArray(byLevel[level]!) : byLevel[level]!;
      for (const m of levelMembers) {
        const idx = m.gender
          ? leastGenderIdx(groups, m.gender, maxPerGroup)
          : leastLevelIdx(groups, m.level ?? 'mid', maxPerGroup);
        groups[idx]!.push(m);
      }
    }
  } else if (genderMode === 'mix') {
    // 성별 혼합만
    const males = remaining.filter((m) => m.gender === 'M');
    const females = remaining.filter((m) => m.gender === 'F');
    const untagged = remaining.filter((m) => !m.gender);

    // 남녀 교차 배치
    for (const genderGroup of [males, females]) {
      const shuffled = method === 'random' ? shuffleArray(genderGroup) : genderGroup;
      for (const m of shuffled) {
        const idx = leastGenderIdx(groups, m.gender!, maxPerGroup);
        groups[idx]!.push(m);
      }
    }
    for (const m of untagged) {
      groups[smallestGroupIdx(groups)]!.push(m);
    }
  } else if (balanceLevel) {
    // 수준별 균등만
    const byLevel: Record<string, GroupingMember[]> = { high: [], mid: [], low: [], none: [] };
    for (const m of remaining) {
      byLevel[m.level ?? 'none']!.push(m);
    }
    for (const level of ['high', 'mid', 'low', 'none'] as const) {
      const shuffled = method === 'random' ? shuffleArray(byLevel[level]!) : byLevel[level]!;
      for (const m of shuffled) {
        const idx = leastLevelIdx(groups, m.level ?? 'mid', maxPerGroup);
        groups[idx]!.push(m);
      }
    }
  } else {
    // 기본: 순서대로 가장 작은 그룹에 배치
    for (const member of remaining) {
      const idx = smallestGroupIdx(groups);
      groups[idx]!.push(member);
    }
  }

  const results = labels.map((label, i) => {
    const membersWithRoles = (roles?.length && roleAssignMode === 'random')
      ? assignRolesToGroup(groups[i]!, roles)
      : groups[i]!;
    return {
      label,
      members: membersWithRoles,
      leaderName: leaderMethod ? pickLeader(groups[i]!, leaderMethod) : undefined,
    };
  });

  return results;
}

/**
 * 제약 조건 검증: 충돌하는 together+apart 쌍 검출
 */
export function validateConstraints(
  constraints: GroupingConstraints,
): string[] {
  const errors: string[] = [];
  const togetherSet = new Set(constraints.together.map(([a, b]) => [a, b].sort().join('|')));

  for (const [a, b] of constraints.apart) {
    const key = [a, b].sort().join('|');
    if (togetherSet.has(key)) {
      errors.push(`'${a}'와(과) '${b}'이(가) 동반과 분리 조건에 동시에 지정되어 있습니다.`);
    }
  }
  return errors;
}
