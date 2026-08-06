/**
 * 보관함 뷰어 파서(P3 S3.2) — 관대 파싱·요약·검색·삭제 게이트 순수 함수.
 * 아카이브는 과거 앱 버전이 쓴 파일이라 필드 부재·형태 변형을 허용해야 한다(throw 금지).
 */
import { describe, it, expect } from 'vitest';
import {
  buildArchivedClassLookup,
  deleteConfirmPhrase,
  isDeleteConfirmed,
  matchesSearch,
  parseArchivedAttachments,
  parseArchivedObservations,
  parseArchivedProgress,
  parseArchivedStudentRecords,
  parseArchivedStudents,
  summarizeArchivedAttendance,
} from '../archiveViewerData';

describe('관대 파싱 — 어떤 입력에도 throw하지 않는다', () => {
  const GARBAGE: unknown[] = [
    null,
    undefined,
    42,
    'str',
    [],
    {},
    { records: 'not-array' },
    [null, 1, 'x'],
  ];

  it('전 파서가 쓰레기 입력에서 빈 결과를 돌려준다', () => {
    for (const g of GARBAGE) {
      expect(parseArchivedStudents(g)).toEqual([]);
      expect(parseArchivedStudentRecords(g)).toEqual([]);
      expect(parseArchivedObservations(g)).toEqual([]);
      expect(parseArchivedAttachments(g)).toEqual([]);
      expect(parseArchivedProgress(g)).toEqual([]);
      expect(summarizeArchivedAttendance(g).recordCount).toBe(0);
      expect(buildArchivedClassLookup(g).classLabel.size).toBe(0);
    }
  });

  it('필드 부재 레코드는 건너뛰거나 기본값으로 채운다', () => {
    const students = parseArchivedStudents([
      { id: 's1', name: '김한별', studentNumber: 3 },
      { name: '이이름만' }, // id 없음 — name으로 대체
      { id: 'no-name' }, // name 없음 — 제외
    ]);
    expect(students.map((s) => s.name)).toEqual(['김한별', '이이름만']);

    const records = parseArchivedStudentRecords({
      records: [{ id: 'r1' }, { noId: true }],
    });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ id: 'r1', content: '', date: '' });
  });
});

describe('명렬 — 번호순 정렬', () => {
  it('studentNumber 오름차순, 번호 없는 학생은 뒤로', () => {
    const students = parseArchivedStudents([
      { id: 'a', name: '나중', studentNumber: 12 },
      { id: 'b', name: '먼저', studentNumber: 3 },
      { id: 'c', name: '번호없음' },
    ]);
    expect(students.map((s) => s.name)).toEqual(['먼저', '나중', '번호없음']);
  });
});

describe('수업반 lookup — studentKey 해석', () => {
  const lookup = buildArchivedClassLookup({
    classes: [
      {
        id: 'tc-1',
        name: '3-1',
        subject: '통합과학',
        students: [
          { number: 5, grade: 3, classNum: 1, name: '김복합' },
          { number: 7, name: '이단순' },
        ],
      },
    ],
  });

  it('복합 키(학년-반-번호)와 단순 키(번호) 둘 다 해석한다', () => {
    expect(lookup.studentName.get('tc-1|3-1-5')).toBe('김복합');
    expect(lookup.studentName.get('tc-1|7')).toBe('이단순');
    expect(lookup.classLabel.get('tc-1')).toBe('3-1 · 통합과학');
  });
});

describe('출결 통계 요약', () => {
  it('상태별 합계·날짜 범위·반별 건수를 집계하고 미상 상태는 원문 유지', () => {
    const summary = summarizeArchivedAttendance({
      records: [
        {
          classId: 'tc-1',
          date: '2026-04-01',
          period: 1,
          students: [
            { number: 1, status: 'late' },
            { number: 2, status: 'absent' },
          ],
        },
        {
          classId: 'tc-1',
          date: '2026-03-02',
          period: 2,
          students: [{ number: 1, status: 'unknown-status' }],
        },
      ],
    });
    expect(summary.recordCount).toBe(2);
    expect(summary.firstDate).toBe('2026-03-02');
    expect(summary.lastDate).toBe('2026-04-01');
    expect(summary.statusCounts).toContainEqual({ label: '지각', count: 1 });
    expect(summary.statusCounts).toContainEqual({ label: '결석', count: 1 });
    expect(summary.statusCounts).toContainEqual({ label: 'unknown-status', count: 1 });
    expect(summary.perClass).toEqual([{ classId: 'tc-1', count: 2 }]);
  });
});

describe('검색', () => {
  it('빈 검색어는 전부, 부분 일치는 대소문자 무시', () => {
    expect(matchesSearch('김한별 관찰 내용', '')).toBe(true);
    expect(matchesSearch('김한별 관찰 내용', '한별')).toBe(true);
    expect(matchesSearch('Kim HanByul', 'hanbyul')).toBe(true);
    expect(matchesSearch('김한별', '없는말')).toBe(false);
  });
});

describe('삭제 게이트 — 확인 문구 정확 일치 (S3.3)', () => {
  it('정확히 "라벨 삭제"를 입력해야만 통과한다', () => {
    const label = '2026학년도 1학기';
    expect(deleteConfirmPhrase(label)).toBe('2026학년도 1학기 삭제');
    expect(isDeleteConfirmed('2026학년도 1학기 삭제', label)).toBe(true);
    expect(isDeleteConfirmed('  2026학년도 1학기 삭제  ', label)).toBe(true); // 앞뒤 공백 허용
    expect(isDeleteConfirmed('2026학년도 1학기', label)).toBe(false);
    expect(isDeleteConfirmed('삭제', label)).toBe(false);
    expect(isDeleteConfirmed('', label)).toBe(false);
  });
});
