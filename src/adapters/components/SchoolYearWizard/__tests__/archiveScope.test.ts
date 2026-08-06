/**
 * archiveScope — 마법사 ①·② 단계의 보관 범위 표시 매핑 검증 (S2.3).
 * 표시 매핑이 전환 정본(YEAR_TRANSITION_FILES)과 어긋나면 안내가 거짓말이 된다 — 1:1 대응 고정.
 */
import { describe, expect, test } from 'vitest';
import type { IStoragePort } from '@domain/ports/IStoragePort';
import { YEAR_TRANSITION_FILES } from '@usecases/schoolYear/ExecuteYearTransition';
import { ARCHIVE_SCOPE_ITEMS, countScopeEntries, readArchiveScopeCounts } from '../archiveScope';

function fakeStorage(files: Record<string, unknown>, failKeys: string[] = []): IStoragePort {
  return {
    async read<T>(key: string): Promise<T | null> {
      if (failKeys.includes(key)) throw new Error('읽기 실패(테스트)');
      return (files[key] as T | undefined) ?? null;
    },
    async write() {},
    async remove() {},
    async readBinary() {
      return null;
    },
    async writeBinary() {},
    async removeBinary() {},
    async listBinary() {
      return [];
    },
  };
}

describe('ARCHIVE_SCOPE_ITEMS ↔ YEAR_TRANSITION_FILES 1:1 대응', () => {
  test('키 집합이 정확히 같다(누락·초과 없음)', () => {
    const scopeKeys = ARCHIVE_SCOPE_ITEMS.map((i) => i.key).sort();
    const transitionKeys = YEAR_TRANSITION_FILES.map((f) => f.key).sort();
    expect(scopeKeys).toEqual(transitionKeys);
  });

  test('라벨은 전부 비어 있지 않은 한국어 사용자 언어', () => {
    for (const item of ARCHIVE_SCOPE_ITEMS) {
      expect(item.label.length).toBeGreaterThan(0);
    }
  });
});

describe('countScopeEntries — 건수 계산(추측 금지)', () => {
  const arrayRootItem = ARCHIVE_SCOPE_ITEMS.find((i) => i.key === 'students')!;
  const envelopeItem = ARCHIVE_SCOPE_ITEMS.find((i) => i.key === 'attendance')!;
  const objectItem = ARCHIVE_SCOPE_ITEMS.find((i) => i.key === 'seating')!;

  test('파일 부재 → 비어 있음(exists=false)', () => {
    expect(countScopeEntries(envelopeItem, null)).toEqual({
      key: 'attendance',
      exists: false,
      count: 0,
    });
  });

  test('배열 루트 파일은 루트 length', () => {
    expect(countScopeEntries(arrayRootItem, [{}, {}, {}]).count).toBe(3);
  });

  test('봉투 파일은 지정 필드의 length', () => {
    expect(countScopeEntries(envelopeItem, { records: [{}, {}] }).count).toBe(2);
  });

  test('단일 객체 파일은 건수 대신 null("저장됨")', () => {
    const result = countScopeEntries(objectItem, { rows: 5, cols: 6 });
    expect(result.exists).toBe(true);
    expect(result.count).toBeNull();
  });

  test('형태가 기대와 다르면 null — 지어내지 않는다', () => {
    expect(countScopeEntries(envelopeItem, { records: '이상함' }).count).toBeNull();
    expect(countScopeEntries(arrayRootItem, { not: 'array' }).count).toBeNull();
  });
});

describe('readArchiveScopeCounts — 읽기 전용 조회', () => {
  test('개별 읽기 실패가 전체를 막지 않는다', async () => {
    const storage = fakeStorage({ attendance: { records: [{}] }, students: [{}, {}] }, [
      'observations',
    ]);
    const counts = await readArchiveScopeCounts(storage);
    expect(counts.get('attendance')?.count).toBe(1);
    expect(counts.get('students')?.count).toBe(2);
    expect(counts.get('observations')).toEqual({ key: 'observations', exists: false, count: null });
    // 정본 키 전부에 대한 답이 있다
    expect(counts.size).toBe(YEAR_TRANSITION_FILES.length);
  });
});
