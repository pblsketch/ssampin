import { describe, it, expect } from 'vitest';
import {
  isStudentActive,
  isStudentInactive,
  normalizeStudentStatus,
  normalizeStudentList,
  filterActive,
  filterInactive,
} from './studentActivity';
import type { StudentStatus } from '@domain/entities/Student';

describe('isStudentActive — status × isVacant 매트릭스', () => {
  type Case = {
    input: { status?: StudentStatus; isVacant?: boolean };
    expected: boolean;
    label: string;
  };

  const cases: Case[] = [
    { input: { status: 'active', isVacant: false }, expected: true, label: 'active+vacant=false → 활성' },
    { input: { status: 'active', isVacant: true }, expected: true, label: 'active+vacant=true → status 우선, 활성' },
    { input: { status: 'transferred', isVacant: false }, expected: false, label: '⚠ 회귀 케이스: transferred+vacant=false → 비활성' },
    { input: { status: 'transferred', isVacant: true }, expected: false, label: 'transferred+vacant=true → 비활성' },
    { input: { status: 'suspended', isVacant: false }, expected: false, label: 'suspended → 비활성' },
    { input: { status: 'expelled', isVacant: false }, expected: false, label: 'expelled → 비활성' },
    { input: { status: 'withdrawn', isVacant: false }, expected: false, label: 'withdrawn → 비활성' },
    { input: { status: 'dropped', isVacant: false }, expected: false, label: 'dropped → 비활성' },
    { input: { status: 'other', isVacant: false }, expected: false, label: 'other → 비활성' },
    { input: { isVacant: false }, expected: true, label: 'status 미설정+vacant=false → 활성 (하위호환)' },
    { input: { isVacant: true }, expected: false, label: 'status 미설정+vacant=true → 비활성 (하위호환)' },
    { input: {}, expected: true, label: '둘 다 미설정 → 활성 (안전한 default)' },
  ];

  it.each(cases)('$label', ({ input, expected }) => {
    expect(isStudentActive(input)).toBe(expected);
    expect(isStudentInactive(input)).toBe(!expected);
  });
});

describe('normalizeStudentStatus', () => {
  it('status 있고 isVacant 불일치 시 isVacant 동기화', () => {
    const input = { status: 'transferred' as StudentStatus, isVacant: false };
    expect(normalizeStudentStatus(input)).toEqual({ status: 'transferred', isVacant: true });
  });

  it('status 있고 isVacant 일치 시 같은 참조 반환', () => {
    const input = { status: 'active' as StudentStatus, isVacant: false };
    expect(normalizeStudentStatus(input)).toBe(input);
  });

  it('status 없고 isVacant=true → status=withdrawn 추정', () => {
    const input = { isVacant: true };
    expect(normalizeStudentStatus(input)).toEqual({ status: 'withdrawn', isVacant: true });
  });

  it('status 없고 isVacant=false → 변경 없음 (기본 active 취급)', () => {
    const input = { isVacant: false };
    expect(normalizeStudentStatus(input)).toBe(input);
  });

  it('둘 다 미설정 → 변경 없음', () => {
    const input = {};
    expect(normalizeStudentStatus(input)).toBe(input);
  });

  it('추가 필드 보존 (id, name 등)', () => {
    const input = { id: 's01', name: '김철수', status: 'transferred' as StudentStatus, isVacant: false };
    const result = normalizeStudentStatus(input);
    expect(result).toEqual({ id: 's01', name: '김철수', status: 'transferred', isVacant: true });
  });

  it('isInactive→active 복귀 시 isVacant=false로 동기화', () => {
    const input = { status: 'active' as StudentStatus, isVacant: true };
    expect(normalizeStudentStatus(input)).toEqual({ status: 'active', isVacant: false });
  });
});

describe('normalizeStudentList', () => {
  it('전부 정규화 상태면 같은 참조 반환', () => {
    const input = [
      { status: 'active' as StudentStatus, isVacant: false },
      { status: 'transferred' as StudentStatus, isVacant: true },
    ];
    expect(normalizeStudentList(input)).toBe(input);
  });

  it('하나라도 비정규 항목 있으면 새 배열 반환, 정규화된 항목들 포함', () => {
    const input = [
      { id: 'a', status: 'active' as StudentStatus, isVacant: false },        // OK
      { id: 'b', status: 'transferred' as StudentStatus, isVacant: false },   // ← 비정규
      { id: 'c', isVacant: true },                                            // ← 비정규
    ];
    const result = normalizeStudentList(input);
    expect(result).not.toBe(input);
    expect(result).toEqual([
      { id: 'a', status: 'active', isVacant: false },
      { id: 'b', status: 'transferred', isVacant: true },
      { id: 'c', status: 'withdrawn', isVacant: true },
    ]);
  });

  it('빈 배열은 같은 참조 반환', () => {
    const input: { status?: StudentStatus; isVacant?: boolean }[] = [];
    expect(normalizeStudentList(input)).toBe(input);
  });
});

describe('filterActive / filterInactive', () => {
  const list = [
    { id: 'a', status: 'active' as StudentStatus, isVacant: false },
    { id: 'b', status: 'transferred' as StudentStatus, isVacant: false }, // 회귀 케이스: vacant=false라도 비활성
    { id: 'c', isVacant: true },
    { id: 'd', isVacant: false },
    { id: 'e', status: 'suspended' as StudentStatus, isVacant: true },
  ];

  it('filterActive — status 우선 판정으로 활성만 추출', () => {
    expect(filterActive(list).map((s) => s.id)).toEqual(['a', 'd']);
  });

  it('filterInactive — 비활성만 추출 (회귀 케이스 포함)', () => {
    expect(filterInactive(list).map((s) => s.id)).toEqual(['b', 'c', 'e']);
  });

  it('두 필터 결과의 합이 원본 길이와 같다', () => {
    expect(filterActive(list).length + filterInactive(list).length).toBe(list.length);
  });
});
