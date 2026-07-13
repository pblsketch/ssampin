import { describe, it, expect } from 'vitest';
import {
  compareAttendance,
  deriveReasonAxis,
  type NeisAttendanceRow,
  type SsampinAttendanceEntry,
} from './neisAttendanceAuditRules';

const ssam = (
  number: number,
  date: string,
  status: SsampinAttendanceEntry['status'],
  reasonAxis: SsampinAttendanceEntry['reasonAxis'],
  extra: Partial<SsampinAttendanceEntry> = {},
): SsampinAttendanceEntry => ({ number, date, status, reasonAxis, ...extra });

const neis = (
  number: number,
  date: string,
  status: NeisAttendanceRow['status'],
  reason?: string,
  extra: Partial<NeisAttendanceRow> = {},
): NeisAttendanceRow => ({ number, date, status, reason, ...extra });

describe('deriveReasonAxis', () => {
  it("'미인정'은 '인정'보다 먼저 판정한다 (부분 문자열 함정)", () => {
    expect(deriveReasonAxis('미인정')).toBe('미인정');
    expect(deriveReasonAxis('미인정결석')).toBe('미인정');
    expect(deriveReasonAxis('무단')).toBe('미인정');
    expect(deriveReasonAxis('인정')).toBe('인정');
    expect(deriveReasonAxis('출석인정')).toBe('인정');
    expect(deriveReasonAxis('질병')).toBe('질병');
    expect(deriveReasonAxis('')).toBe('기타');
    expect(deriveReasonAxis(undefined)).toBe('기타');
    expect(deriveReasonAxis('가사')).toBe('기타');
  });
});

describe('compareAttendance (나이스 대조 도메인 코어, M3)', () => {
  it('완전 일치 — 불일치 0건', () => {
    const diff = compareAttendance(
      [ssam(1, '2026-07-13', '지각', '질병', { periods: '조회~1' })],
      [neis(1, '2026-07-13', '지각', '질병', { periods: '조회~1' })],
    );
    expect(diff.onlyInSsampin).toHaveLength(0);
    expect(diff.onlyInNeis).toHaveLength(0);
    expect(diff.mismatch).toHaveLength(0);
  });

  it('쌤핀에만 있음 / 나이스에만 있음을 분류한다', () => {
    const diff = compareAttendance(
      [ssam(1, '2026-07-13', '결석', '미인정')],
      [neis(2, '2026-07-13', '결석', '미인정')],
    );
    expect(diff.onlyInSsampin).toHaveLength(1);
    expect(diff.onlyInSsampin[0]!.number).toBe(1);
    expect(diff.onlyInNeis).toHaveLength(1);
    expect(diff.onlyInNeis[0]!.number).toBe(2);
    expect(diff.mismatch).toHaveLength(0);
  });

  it('구분(상태) 차이 — mismatch(status)', () => {
    const diff = compareAttendance(
      [ssam(1, '2026-07-13', '지각', '질병')],
      [neis(1, '2026-07-13', '조퇴', '질병')],
    );
    expect(diff.mismatch).toEqual([
      expect.objectContaining({ field: 'status', ssampin: '지각', neis: '조퇴' }),
    ]);
  });

  it('교시 차이 — 양쪽 모두 교시가 있을 때만 mismatch(periods)', () => {
    const both = compareAttendance(
      [ssam(1, '2026-07-13', '지각', '질병', { periods: '조회~1' })],
      [neis(1, '2026-07-13', '지각', '질병', { periods: '조회 ~ 2' })],
    );
    expect(both.mismatch).toEqual([
      expect.objectContaining({ field: 'periods', ssampin: '조회~1', neis: '조회~2' }),
    ]);

    // 한쪽이 교시 정보를 안 주면 판단 보류 (코어 관용)
    const oneSide = compareAttendance(
      [ssam(1, '2026-07-13', '지각', '질병', { periods: '조회~1' })],
      [neis(1, '2026-07-13', '지각', '질병')],
    );
    expect(oneSide.mismatch).toHaveLength(0);
  });

  it('사유 축 차이 — 1:1 짝이면 mismatch(reason)로 보고한다', () => {
    const diff = compareAttendance(
      [ssam(1, '2026-07-13', '지각', '질병')],
      [neis(1, '2026-07-13', '지각', '인정')],
    );
    expect(diff.mismatch).toEqual([
      expect.objectContaining({ field: 'reason', ssampin: '질병', neis: '인정' }),
    ]);
  });

  it('이름 표기차(공백 등)는 불일치로 계상하지 않는다 — 식별은 (번호, 날짜)', () => {
    const diff = compareAttendance(
      [ssam(1, '2026-07-13', '결석', '질병', { name: '김 민준' })],
      [neis(1, '2026-07-13', '결석', '질병', { name: '김민준' })],
    );
    expect(diff.mismatch).toHaveLength(0);
    expect(diff.onlyInSsampin).toHaveLength(0);
    expect(diff.onlyInNeis).toHaveLength(0);
  });

  it('같은 날 공식+인정 복수 건은 클래스별로 짝지어 비교한다 (별표8 규칙 라)', () => {
    const diff = compareAttendance(
      [
        ssam(1, '2026-07-13', '지각', '질병', { periods: '조회~1' }),
        ssam(1, '2026-07-13', '조퇴', '인정', { periods: '6~종례' }),
      ],
      [
        neis(1, '2026-07-13', '지각', '질병', { periods: '조회~1' }),
        neis(1, '2026-07-13', '조퇴', '인정', { periods: '6~종례' }),
      ],
    );
    expect(diff.mismatch).toHaveLength(0);
    expect(diff.onlyInSsampin).toHaveLength(0);
    expect(diff.onlyInNeis).toHaveLength(0);
  });

  it('공식·인정 복수 건에서 인정 쪽만 나이스에 없으면 그 건만 쌤핀-only', () => {
    const diff = compareAttendance(
      [ssam(1, '2026-07-13', '지각', '질병'), ssam(1, '2026-07-13', '조퇴', '인정')],
      [neis(1, '2026-07-13', '지각', '질병')],
    );
    expect(diff.mismatch).toHaveLength(0);
    expect(diff.onlyInSsampin).toHaveLength(1);
    expect(diff.onlyInSsampin[0]!.reasonAxis).toBe('인정');
    expect(diff.onlyInNeis).toHaveLength(0);
  });

  it('빈 입력 — 양쪽 다 비면 전부 0건', () => {
    const diff = compareAttendance([], []);
    expect(diff.onlyInSsampin).toHaveLength(0);
    expect(diff.onlyInNeis).toHaveLength(0);
    expect(diff.mismatch).toHaveLength(0);
  });

  it('여러 항목이 동시에 다르면 항목별로 각각 보고한다', () => {
    const diff = compareAttendance(
      [ssam(1, '2026-07-13', '지각', '질병', { periods: '조회~1' })],
      [neis(1, '2026-07-13', '조퇴', '기타', { periods: '5~종례' })],
    );
    const fields = diff.mismatch.map((m) => m.field).sort();
    expect(fields).toEqual(['periods', 'reason', 'status']);
  });
});
