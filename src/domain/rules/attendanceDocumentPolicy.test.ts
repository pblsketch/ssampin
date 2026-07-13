import { describe, it, expect } from 'vitest';
import {
  requiresDocument,
  DEFAULT_ATTENDANCE_DOCUMENT_POLICY,
  ALL_DOC_STATUSES,
  type AttendanceDocumentPolicy,
} from './attendanceDocumentPolicy';
import type { AttendancePeriodEntry } from '@domain/entities/StudentRecord';

const rec = (
  attendancePeriods?: readonly AttendancePeriodEntry[],
  subcategory = '결석 (질병)',
  category = 'attendance',
) => ({ category, subcategory, attendancePeriods });

const p = (
  status: AttendancePeriodEntry['status'],
  reason?: AttendancePeriodEntry['reason'],
  period = 1,
): AttendancePeriodEntry => ({ period, status, ...(reason ? { reason } : {}) });

describe('requiresDocument 진리표 (M4 D-1)', () => {
  it('① 단일 교시 — 기본 정책(인정만 요구)에서 질병 지각은 미요구', () => {
    expect(requiresDocument(rec([p('late', '질병')]))).toBe(false);
  });

  it('② 단일 교시 — 인정 결석은 기본 정책에서 요구', () => {
    expect(requiresDocument(rec([p('absent', '인정')]))).toBe(true);
  });

  it('③ 다중 교시 혼합 — OR 집약: 어느 한 교시라도 요구면 요구', () => {
    expect(requiresDocument(rec([p('late', '질병', 1), p('classAbsence', '인정', 3)]))).toBe(true);
  });

  it('④ 다중 교시 전부 미요구 — false', () => {
    expect(requiresDocument(rec([p('late', '질병', 1), p('earlyLeave', '기타', 6)]))).toBe(false);
  });

  it('⑤ attendancePeriods 결측(레거시) — subcategory 추론, 기본 정책에서 질병 결석 false·인정 결석 true', () => {
    expect(requiresDocument(rec(undefined, '결석 (질병)'))).toBe(false);
    expect(requiresDocument(rec(undefined, '지각 (인정)'))).toBe(true);
    // 상태 추론 불가 → 보수적 false
    expect(requiresDocument(rec(undefined, '기타 기록'))).toBe(false);
    // 사유 미상 → '기타' 축 → 기본 정책 미요구
    expect(requiresDocument(rec(undefined, '결석'))).toBe(false);
  });

  it('⑥ 빈 배열 — 결측과 동일 취급(subcategory 추론)', () => {
    expect(requiresDocument(rec([], '조퇴 (인정)'))).toBe(true);
    expect(requiresDocument(rec([], '조퇴 (질병)'))).toBe(false);
  });

  it('출결 카테고리가 아니면 항상 false', () => {
    expect(requiresDocument(rec([p('absent', '인정')], '결석 (인정)', 'counseling'))).toBe(false);
  });

  it("'미인정' subcategory가 '인정'으로 오판되지 않는다", () => {
    expect(requiresDocument(rec(undefined, '결석 (미인정)'))).toBe(false);
    expect(requiresDocument(rec([p('absent', '미인정')]))).toBe(false);
  });

  it('정책 변경 — 질병 지각·조퇴·결과 요구를 켜면 해당 기록이 요구로 바뀐다', () => {
    const policy: AttendanceDocumentPolicy = {
      requiredBy: {
        인정: ALL_DOC_STATUSES,
        질병: ['late', 'earlyLeave', 'classAbsence'],
      },
    };
    expect(requiresDocument(rec([p('late', '질병')]), policy)).toBe(true);
    expect(requiresDocument(rec([p('absent', '질병')]), policy)).toBe(false); // 결석은 안 켬
    expect(requiresDocument(rec([p('late', '기타')]), policy)).toBe(false);
  });

  it('reason 없는 교시는 기타 축으로 판정한다', () => {
    const policy: AttendanceDocumentPolicy = { requiredBy: { 기타: ['absent'] } };
    expect(requiresDocument(rec([p('absent')]), policy)).toBe(true);
    expect(requiresDocument(rec([p('absent')]))).toBe(false); // 기본 정책은 기타 미요구
  });
});

describe('과다 카운트 교정 회귀 — 소비처 산식 (교정 전/후 카운트)', () => {
  // 소비처(배너·검토 큐·조회 필터)와 동일 형태의 필터로 카운트 차이를 고정한다.
  const records = [
    { ...rec([p('absent', '질병')], '결석 (질병)'), documentSubmitted: false, id: 'a' },
    { ...rec([p('absent', '인정')], '결석 (인정)'), documentSubmitted: false, id: 'b' },
    { ...rec([p('late', '미인정')], '지각 (미인정)'), documentSubmitted: false, id: 'c' },
    { ...rec([p('absent', '인정')], '결석 (인정)'), documentSubmitted: true, id: 'd' },
  ];

  it('교정 전(모든 출결=서류 필요)은 3건, 교정 후(기본 정책)는 인정 미제출 1건만 남는다', () => {
    const before = records.filter((r) => r.category === 'attendance' && !r.documentSubmitted);
    expect(before).toHaveLength(3); // 과다 카운트 — 질병 결석·미인정 지각까지 포함

    const after = records.filter(
      (r) =>
        r.category === 'attendance' &&
        requiresDocument(r, DEFAULT_ATTENDANCE_DOCUMENT_POLICY) &&
        !r.documentSubmitted,
    );
    expect(after.map((r) => r.id)).toEqual(['b']); // 질병 결석은 사라지고 인정 기록은 남는다
  });

  it('분모 재정의 — 요구 대상 2건 중 제출 1건 (통계 "N중 M" 정합)', () => {
    const required = records.filter((r) => requiresDocument(r));
    expect(required).toHaveLength(2); // b, d
    const submitted = required.filter((r) => r.documentSubmitted);
    expect(submitted).toHaveLength(1); // d
  });
});
