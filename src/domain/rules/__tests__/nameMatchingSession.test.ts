/**
 * "매칭하기" 모드 규칙.
 *
 * 이 모드의 조용한 실패는 **한 학생이 두 번 출제되거나, 남은 후보가 안 줄어드는 것**이다.
 * 둘 다 화면상으론 멀쩡해 보여서 눈으로는 못 잡는다.
 */
import { describe, it, expect } from 'vitest';
import { buildMatchOptions, pickNextMatchTarget } from '../nameMatchingSession';

const POOL = [
  { studentId: 'c', name: '박지효', studentNumber: 3 },
  { studentId: 'a', name: '강나영', studentNumber: 1 },
  { studentId: 'b', name: '김가영', studentNumber: 2 },
];

describe('buildMatchOptions', () => {
  it('학번 순으로 늘어선다', () => {
    expect(buildMatchOptions(POOL, new Set()).map((o) => o.name)).toEqual([
      '강나영',
      '김가영',
      '박지효',
    ]);
  });

  it('★한 번 나온 학생은 명단에서 빠진 것으로 표시된다 (짝 맞추기가 좁혀져야 한다)', () => {
    const options = buildMatchOptions(POOL, new Set(['a']));
    expect(options.find((o) => o.studentId === 'a')!.matched).toBe(true);
    expect(options.filter((o) => !o.matched)).toHaveLength(2);
  });

  it('★틀린 학생도 명단에서 빠진다 (재시도 없음 — 이름 쓰기와 같은 규칙)', () => {
    // answered 는 정답 여부가 아니라 "이미 나왔는가"다
    expect(buildMatchOptions(POOL, new Set(['b'])).find((o) => o.studentId === 'b')!.matched).toBe(
      true,
    );
  });

  it('학번이 없는 학생은 뒤로 간다', () => {
    const withNoNumber = [...POOL, { studentId: 'z', name: '무학번' }];
    expect(buildMatchOptions(withNoNumber, new Set()).at(-1)!.name).toBe('무학번');
  });
});

describe('pickNextMatchTarget', () => {
  it('★이미 나온 학생은 다시 출제되지 않는다', () => {
    const answered = new Set(['a', 'b']);
    expect(pickNextMatchTarget(POOL, answered, () => 0)).toBe('c');
    expect(pickNextMatchTarget(POOL, answered, () => 0.99)).toBe('c');
  });

  it('다 풀면 null (한 바퀴 끝 신호)', () => {
    expect(pickNextMatchTarget(POOL, new Set(['a', 'b', 'c']), () => 0)).toBeNull();
  });

  it('★난수가 1.0 이어도 목록 밖을 집지 않는다', () => {
    // Math.random() 은 1 미만이지만, 경계에서 undefined 를 집으면 화면이 통째로 멈춘다.
    // 남은 목록은 POOL 순서를 지키므로 마지막은 'b' 다.
    expect(pickNextMatchTarget(POOL, new Set(), () => 1)).toBe('b');
  });

  it('빈 명단이면 null', () => {
    expect(pickNextMatchTarget([], new Set(), () => 0)).toBeNull();
  });

  it('남은 학생 전체가 언젠가는 출제된다 (한쪽에 몰리지 않는다)', () => {
    const picked = new Set<string>();
    for (let i = 0; i < 3; i++) {
      picked.add(pickNextMatchTarget(POOL, new Set(), () => i / 3)!);
    }
    expect(picked.size).toBe(3);
  });
});
