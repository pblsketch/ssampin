/**
 * Q2(서브카테고리→태그 흡수) 도메인 단위 테스트.
 *
 * - synthesizeSubcategory: 카테고리별 sentinel + 멤버십(MCP recordNote 통과용).
 * - normalizeStudentRecordsSubcatToTags: 멱등·출결제외·무손실(스냅샷)·P4 엣지·changedCount.
 * - getAttendanceStats praise: tags 주 + 모바일 subcategory-only 형태 영구 이중기준.
 *
 * 설계: docs/02-design/features/record-system-unification-q2-subcategory-to-tags.design.md §4-가·나·라
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeStudentRecordsSubcatToTags,
  getAttendanceStats,
  recordExportLabel,
} from './studentRecordRules';
import {
  DEFAULT_RECORD_CATEGORIES,
  DEFAULT_SUBCATEGORY_SENTINEL,
  synthesizeSubcategory,
} from '../valueObjects/RecordCategory';
import type { StudentRecord } from '../entities/StudentRecord';

function rec(p: Partial<StudentRecord>): StudentRecord {
  return {
    id: p.id ?? 'r1',
    studentId: p.studentId ?? 's1',
    category: p.category ?? 'life',
    subcategory: p.subcategory ?? '',
    content: p.content ?? '',
    date: p.date ?? '2026-06-24',
    createdAt: p.createdAt ?? '2026-06-24T00:00:00.000Z',
    ...(p.tags ? { tags: p.tags } : {}),
    ...(p.attendancePeriods ? { attendancePeriods: p.attendancePeriods } : {}),
  };
}

describe('synthesizeSubcategory — 카테고리별 sentinel', () => {
  it('counseling/life → 일반, etc → 기타', () => {
    expect(synthesizeSubcategory('counseling')).toBe('일반');
    expect(synthesizeSubcategory('life')).toBe('일반');
    expect(synthesizeSubcategory('etc')).toBe('기타');
  });

  it('미지정/커스텀 카테고리 → 전역 기본 sentinel', () => {
    expect(synthesizeSubcategory('custom-xyz')).toBe(DEFAULT_SUBCATEGORY_SENTINEL);
    expect(synthesizeSubcategory('')).toBe(DEFAULT_SUBCATEGORY_SENTINEL);
  });

  it('합성 sentinel 은 해당 카테고리 subcategories[]의 멤버다 (MCP 멤버십 통과)', () => {
    for (const catId of ['counseling', 'life', 'etc'] as const) {
      const cat = DEFAULT_RECORD_CATEGORIES.find((c) => c.id === catId)!;
      expect(cat.subcategories).toContain(synthesizeSubcategory(catId));
    }
  });
});

describe('normalizeStudentRecordsSubcatToTags — 멱등·무손실 마이그레이션', () => {
  it('비출결 subcategory 를 tags 로 복사하고 subcategory 는 보존', () => {
    const input = [rec({ id: 'a', category: 'life', subcategory: '칭찬' })];
    const { records, changedCount } = normalizeStudentRecordsSubcatToTags(input);
    expect(changedCount).toBe(1);
    expect(records[0]!.tags).toEqual(['칭찬']);
    expect(records[0]!.subcategory).toBe('칭찬'); // 보존(삭제 아님)
  });

  it('무손실 스냅샷: 모든 비출결 레코드의 원래 subcategory 가 post tags 에 포함', () => {
    const input = [
      rec({ id: 'a', category: 'counseling', subcategory: '학부모상담' }),
      rec({ id: 'b', category: 'life', subcategory: '생활지도', tags: ['기존태그'] }),
      rec({ id: 'c', category: 'etc', subcategory: '진로' }),
    ];
    const before = input.map((r) => ({ id: r.id, sub: r.subcategory }));
    const { records } = normalizeStudentRecordsSubcatToTags(input);
    for (const snap of before) {
      const after = records.find((r) => r.id === snap.id)!;
      expect(after.tags).toContain(snap.sub);
    }
    // 기존 태그도 보존
    expect(records.find((r) => r.id === 'b')!.tags).toEqual(['기존태그', '생활지도']);
  });

  it('멱등: 재실행 시 변경 없음(changedCount 0, 중복 누적 없음)', () => {
    const input = [rec({ id: 'a', category: 'life', subcategory: '칭찬' })];
    const first = normalizeStudentRecordsSubcatToTags(input);
    const second = normalizeStudentRecordsSubcatToTags(first.records);
    expect(second.changedCount).toBe(0);
    expect(second.records).toBe(first.records); // 동일 참조(no-op)
    expect(second.records[0]!.tags).toEqual(['칭찬']); // 중복 누적 없음
  });

  it('출결(attendance)은 절대 건드리지 않음 — subcategory·attendancePeriods 불변', () => {
    const att = rec({
      id: 'att',
      category: 'attendance',
      subcategory: '결석 (질병)',
      attendancePeriods: [{ period: 1, status: 'absent', reason: '질병' }],
    });
    const { records, changedCount } = normalizeStudentRecordsSubcatToTags([att]);
    expect(changedCount).toBe(0);
    expect(records[0]!.subcategory).toBe('결석 (질병)');
    expect(records[0]!.tags).toBeUndefined();
    expect(records[0]!.attendancePeriods).toEqual([
      { period: 1, status: 'absent', reason: '질병' },
    ]);
  });

  it('빈/공백 subcategory 는 스킵', () => {
    const input = [
      rec({ id: 'a', category: 'life', subcategory: '' }),
      rec({ id: 'b', category: 'counseling', subcategory: '   ' }),
    ];
    const { changedCount } = normalizeStudentRecordsSubcatToTags(input);
    expect(changedCount).toBe(0);
  });

  it('이미 tags 에 있는 값은 중복 추가하지 않음', () => {
    const input = [rec({ id: 'a', category: 'life', subcategory: '칭찬', tags: ['칭찬'] })];
    const { records, changedCount } = normalizeStudentRecordsSubcatToTags(input);
    expect(changedCount).toBe(0);
    expect(records[0]!.tags).toEqual(['칭찬']);
  });

  it('P4 엣지: category 가 비출결인데 subcategory 가 출결 패턴이어도 category 기준 verbatim 복사', () => {
    const input = [rec({ id: 'x', category: 'etc', subcategory: '결석 (질병)' })];
    const { records, changedCount } = normalizeStudentRecordsSubcatToTags(input);
    expect(changedCount).toBe(1);
    expect(records[0]!.tags).toEqual(['결석 (질병)']);
  });
});

describe('recordExportLabel — 표시/내보내기 라벨', () => {
  it('출결은 subcategory 그대로', () => {
    expect(recordExportLabel({ category: 'attendance', subcategory: '결석 (질병)' })).toBe(
      '결석 (질병)',
    );
  });

  it('비출결 + 태그 → 콤마 결합', () => {
    expect(
      recordExportLabel({ category: 'life', subcategory: '일반', tags: ['칭찬', '성실'] }),
    ).toBe('칭찬, 성실');
  });

  it('비출결 + 태그 없음 → subcategory fallback', () => {
    expect(recordExportLabel({ category: 'counseling', subcategory: '학부모상담' })).toBe(
      '학부모상담',
    );
  });
});

describe('getAttendanceStats praise — 영구 이중기준', () => {
  it('태그 기반 칭찬 집계(마이그레이션 후)', () => {
    const records = [rec({ category: 'life', subcategory: '일반', tags: ['칭찬'] })];
    expect(getAttendanceStats(records, 's1').praise).toBe(1);
  });

  it('모바일 형태(subcategory=칭찬, tags 없음) 집계 — 영구 fallback', () => {
    const records = [rec({ category: 'life', subcategory: '칭찬' })];
    expect(getAttendanceStats(records, 's1').praise).toBe(1);
  });

  it('두 형태 혼재 시 각각 1건씩(이중카운트 없음)', () => {
    const records = [
      rec({ id: 'a', category: 'life', subcategory: '칭찬', tags: ['칭찬'] }),
      rec({ id: 'b', category: 'life', subcategory: '칭찬' }),
    ];
    expect(getAttendanceStats(records, 's1').praise).toBe(2);
  });

  it('life 아닌 카테고리의 칭찬 태그는 미집계', () => {
    const records = [rec({ category: 'etc', tags: ['칭찬'] })];
    expect(getAttendanceStats(records, 's1').praise).toBe(0);
  });
});
