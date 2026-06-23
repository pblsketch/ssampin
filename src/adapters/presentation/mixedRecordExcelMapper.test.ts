/**
 * mixedRecordExcelMapper 단위 테스트
 *
 * 출결 행과 특기사항 행 전 필드가 올바르게 평탄화되는지 확인한다.
 */
import { describe, it, expect } from 'vitest';
import {
  mapMixedRecordsToFlatRows,
  type AttendanceExcelRow,
  type ObservationExcelRow,
  type MixedExcelRow,
} from './mixedRecordExcelMapper';

const attendanceRow: AttendanceExcelRow = {
  type: 'attendance',
  date: '2026-03-10',
  studentNumber: 5,
  studentName: '홍길동',
  period: 3,
  status: 'absent',
  reason: '질병',
  memo: '결석 확인서 제출',
};

const observationRow: ObservationExcelRow = {
  type: 'observation',
  date: '2026-03-11',
  studentNumber: 7,
  studentName: '김철수',
  tags: ['교과역량', '학습태도'],
  content: '수업 참여도가 높고 발표를 자발적으로 함',
};

const lateRow: AttendanceExcelRow = {
  type: 'attendance',
  date: '2026-03-12',
  studentNumber: 2,
  studentName: '이영희',
  period: 0, // 조회
  status: 'late',
};

const earlyLeaveRow: AttendanceExcelRow = {
  type: 'attendance',
  date: '2026-03-13',
  studentNumber: 3,
  studentName: '박민수',
  period: 9, // 종례
  status: 'earlyLeave',
  reason: '인정',
};

const classAbsenceRow: AttendanceExcelRow = {
  type: 'attendance',
  date: '2026-03-14',
  studentNumber: 4,
  studentName: '최지영',
  period: 5,
  status: 'classAbsence',
};

describe('mapMixedRecordsToFlatRows', () => {
  it('빈 배열을 받으면 빈 배열을 반환한다', () => {
    expect(mapMixedRecordsToFlatRows([])).toEqual([]);
  });

  it('출결 행: 모든 필드가 올바르게 변환된다', () => {
    const result = mapMixedRecordsToFlatRows([attendanceRow])[0]!;
    expect(result).toEqual({
      date: '2026-03-10',
      category: '출결',
      studentNumber: 5,
      studentName: '홍길동',
      periodLabel: '3교시',
      statusOrTags: '결석',
      reason: '질병',
      content: '결석 확인서 제출',
    });
  });

  it('출결 행: reason·memo 없을 때 빈 문자열로 폴백', () => {
    const result = mapMixedRecordsToFlatRows([lateRow])[0]!;
    expect(result.reason).toBe('');
    expect(result.content).toBe('');
    expect(result.statusOrTags).toBe('지각');
  });

  it('출결 행: period 0은 "조회" 라벨', () => {
    const result = mapMixedRecordsToFlatRows([lateRow])[0]!;
    expect(result.periodLabel).toBe('조회');
  });

  it('출결 행: period 9는 "종례" 라벨', () => {
    const result = mapMixedRecordsToFlatRows([earlyLeaveRow])[0]!;
    expect(result.periodLabel).toBe('종례');
    expect(result.statusOrTags).toBe('조퇴');
  });

  it('출결 행: classAbsence는 "결과"로 변환', () => {
    const result = mapMixedRecordsToFlatRows([classAbsenceRow])[0]!;
    expect(result.statusOrTags).toBe('결과');
  });

  it('특기사항 행: 모든 필드가 올바르게 변환된다', () => {
    const result = mapMixedRecordsToFlatRows([observationRow])[0]!;
    expect(result).toEqual({
      date: '2026-03-11',
      category: '특기사항',
      studentNumber: 7,
      studentName: '김철수',
      periodLabel: '',
      statusOrTags: '교과역량, 학습태도',
      reason: '',
      content: '수업 참여도가 높고 발표를 자발적으로 함',
    });
  });

  it('특기사항 행: 태그 없을 때 빈 문자열', () => {
    const noTagRow: ObservationExcelRow = {
      type: 'observation',
      date: '2026-03-15',
      studentNumber: 1,
      studentName: '강나래',
      tags: [],
      content: '내용',
    };
    const result = mapMixedRecordsToFlatRows([noTagRow])[0]!;
    expect(result.statusOrTags).toBe('');
  });

  it('혼합 배열: 입력 순서를 보존한다', () => {
    const input: MixedExcelRow[] = [attendanceRow, observationRow, lateRow];
    const results = mapMixedRecordsToFlatRows(input);
    expect(results).toHaveLength(3);
    expect(results[0]!.category).toBe('출결');
    expect(results[1]!.category).toBe('특기사항');
    expect(results[2]!.category).toBe('출결');
  });
});
