import { describe, it, expect, vi } from 'vitest';
import type { INeisPort } from '@domain/ports/INeisPort';
import type { NeisTimetableRow } from '@domain/entities/NeisTimetable';
import { fetchNeisTimetableWithSemesterFallback } from './FetchNeisTimetable';

const BASE_QUERY = {
  apiKey: 'key',
  officeCode: 'B10',
  schoolCode: '7010000',
  schoolLevel: 'his' as const,
  grade: '2',
  className: '3',
  // 8월 셋째 주 — 학사 달력은 2학기(대부분 8월 중순 개학)지만, 8월 말까지 1학기인 학교도 있다.
  // 그래서 이 주는 어느 쪽으로도 갈 수 있는 구간이며 폴백이 실제로 쓰이는 지점이다.
  fromDate: '20260817',
  toDate: '20260821',
};

const ROW = { PERIO: '1', ITRT_CNTNT: '수학', ALL_TI_YMD: '20260817' } as NeisTimetableRow;

/** semester별 응답을 지정하는 가짜 나이스 포트 */
function portReturning(bySemester: Record<string, readonly NeisTimetableRow[]>): {
  port: INeisPort;
  calls: { academicYear: string; semester: string }[];
} {
  const calls: { academicYear: string; semester: string }[] = [];
  const port = {
    getTimetable: vi.fn(async (p: { academicYear: string; semester: string }) => {
      calls.push({ academicYear: p.academicYear, semester: p.semester });
      return bySemester[p.semester] ?? [];
    }),
  } as unknown as INeisPort;
  return { port, calls };
}

describe('fetchNeisTimetableWithSemesterFallback', () => {
  it('8월에 개학한 학교 — 날짜에서 파생한 2학기로 한 번에 성공한다(재시도 없음)', async () => {
    const { port, calls } = portReturning({ '2': [ROW] });

    const result = await fetchNeisTimetableWithSemesterFallback(port, BASE_QUERY);

    expect(result.rows).toEqual([ROW]);
    expect(result.axis).toEqual({ academicYear: '2026', semester: '2' });
    expect(result.usedFallbackSemester).toBe(false);
    expect(calls).toEqual([{ academicYear: '2026', semester: '2' }]); // 1회만
  });

  it('8월 말까지 1학기인 학교 — 2학기가 비면 1학기로 재시도해 살려낸다', async () => {
    const { port, calls } = portReturning({ '1': [ROW] });

    const result = await fetchNeisTimetableWithSemesterFallback(port, BASE_QUERY);

    expect(result.rows).toEqual([ROW]);
    expect(result.axis).toEqual({ academicYear: '2026', semester: '1' });
    expect(result.usedFallbackSemester).toBe(true);
    expect(calls).toEqual([
      { academicYear: '2026', semester: '2' },
      { academicYear: '2026', semester: '1' }, // 학년도는 그대로
    ]);
  });

  it('두 학기 모두 비면 빈 결과 — 재시도는 1회로 끝난다(무한 탐색 금지)', async () => {
    const { port, calls } = portReturning({});

    const result = await fetchNeisTimetableWithSemesterFallback(port, BASE_QUERY);

    expect(result.rows).toEqual([]);
    expect(result.usedFallbackSemester).toBe(false);
    expect(result.axis).toEqual({ academicYear: '2026', semester: '2' }); // 처음 축 유지
    expect(calls).toHaveLength(2);
  });

  it('확정된 축을 주면 그 축으로 먼저 조회한다 — 학급마다 재시도 반복 방지', async () => {
    const { port, calls } = portReturning({ '2': [ROW] });

    const result = await fetchNeisTimetableWithSemesterFallback(port, BASE_QUERY, {
      academicYear: '2026',
      semester: '2',
    });

    expect(result.rows).toEqual([ROW]);
    expect(result.usedFallbackSemester).toBe(false);
    expect(calls).toEqual([{ academicYear: '2026', semester: '2' }]); // 1학기 조회 없음
  });

  it('9월 조회는 2학기가 1순위 — 경계 밖에서는 첫 조회로 끝난다', async () => {
    const { port, calls } = portReturning({ '2': [ROW] });

    const result = await fetchNeisTimetableWithSemesterFallback(port, {
      ...BASE_QUERY,
      fromDate: '20260907',
      toDate: '20260911',
    });

    expect(result.axis).toEqual({ academicYear: '2026', semester: '2' });
    expect(calls).toEqual([{ academicYear: '2026', semester: '2' }]);
  });

  it('날짜 형식이 깨졌으면 축을 지어내지 않고 오류를 던진다', async () => {
    const { port } = portReturning({ '1': [ROW] });

    await expect(
      fetchNeisTimetableWithSemesterFallback(port, { ...BASE_QUERY, fromDate: '2026-08-17' }),
    ).rejects.toThrow('날짜 형식');
  });

  it('조회 실패(예외)는 삼키지 않고 그대로 올린다', async () => {
    const port = {
      getTimetable: vi.fn(async () => {
        throw new Error('NEIS 점검 중');
      }),
    } as unknown as INeisPort;

    await expect(fetchNeisTimetableWithSemesterFallback(port, BASE_QUERY)).rejects.toThrow(
      'NEIS 점검 중',
    );
  });
});
