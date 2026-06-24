/**
 * displayRecord ViewModel 변환 테스트 — 두 도메인 형태가 동일 DisplayRecord로 정규화되는지.
 */
import { describe, it, expect } from 'vitest';
import {
  mixedRecordToDisplay,
  studentRecordToDisplay,
  type MixedDisplayInput,
} from './displayRecord';
import type { StudentRecord } from '@domain/entities/StudentRecord';
import type { Student } from '@domain/entities/Student';
import type { RecordCategoryItem } from '@domain/valueObjects/RecordCategory';

describe('mixedRecordToDisplay (수업)', () => {
  it('출결 → kind=attendance, kindLabel=출결, status·memo 보존', () => {
    const input: MixedDisplayInput = {
      type: 'attendance',
      date: '2026-03-10',
      studentKey: 'tc:c1:5',
      studentName: '홍길동',
      studentNumber: 5,
      status: 'absent',
      period: 3,
      reason: '질병',
      memo: '결석 확인서 제출',
    };
    const d = mixedRecordToDisplay(input);
    expect(d.kind).toBe('attendance');
    expect(d.kindKey).toBe('attendance');
    expect(d.kindLabel).toBe('출결');
    expect(d.status).toBe('absent');
    expect(d.studentKey).toBe('tc:c1:5');
    expect(d.studentName).toBe('홍길동');
    expect(d.studentNumber).toBe(5);
    expect(d.content).toBe('결석 확인서 제출');
    expect(d.reason).toBe('질병');
    expect(d.periodLabel).toBe('3교시');
    expect(d.key).toContain('attendance-2026-03-10-tc:c1:5');
  });

  it('특기 → kind=observation, kindLabel=특기사항, tags·content 보존', () => {
    const input: MixedDisplayInput = {
      type: 'observation',
      date: '2026-03-11',
      studentKey: 'tc:c1:7',
      studentName: '김철수',
      studentNumber: 7,
      id: 'obs-1',
      tags: ['교과역량', '학습태도'],
      content: '발표를 적극적으로 함',
    };
    const d = mixedRecordToDisplay(input);
    expect(d.kind).toBe('observation');
    expect(d.kindKey).toBe('observation');
    expect(d.kindLabel).toBe('특기사항');
    expect(d.tags).toEqual(['교과역량', '학습태도']);
    expect(d.content).toBe('발표를 적극적으로 함');
    expect(d.key).toBe('observation-obs-1');
  });

  it('출결 memo 없으면 content 빈 문자열', () => {
    const d = mixedRecordToDisplay({
      type: 'attendance',
      date: '2026-03-12',
      studentKey: 'tc:c1:2',
      studentName: '이영희',
      studentNumber: 2,
      status: 'late',
      period: 0,
    });
    expect(d.content).toBe('');
    expect(d.status).toBe('late');
    expect(d.periodLabel).toBe('조회');
    expect(d.reason).toBeUndefined();
  });
});

describe('studentRecordToDisplay (담임)', () => {
  const studentMap = new Map<string, Student>([
    ['s1', { id: 's1', name: '김민준', studentNumber: 3 } as unknown as Student],
  ]);
  const categories: RecordCategoryItem[] = [
    { id: 'counseling', name: '상담 (관계)', color: 'blue' } as unknown as RecordCategoryItem,
    { id: 'attendance', name: '출결', color: 'red' } as unknown as RecordCategoryItem,
  ];

  it('비출결 → kind=category, kindLabel=카테고리명(괄호 앞), 이름·번호 해석', () => {
    const rec = {
      id: 'r1',
      studentId: 's1',
      category: 'counseling',
      subcategory: '학부모상담',
      content: '전화 상담함',
      date: '2026-03-10',
      createdAt: '2026-03-10T09:00:00.000Z',
    } as unknown as StudentRecord;
    const d = studentRecordToDisplay(rec, { categories, studentMap });
    expect(d.kind).toBe('category');
    expect(d.kindKey).toBe('counseling'); // 카테고리 id 보존(클릭 필터용)
    expect(d.kindLabel).toBe('상담'); // '상담 (관계)' → '상담'
    expect(d.studentName).toBe('김민준');
    expect(d.studentNumber).toBe(3);
    expect(d.content).toBe('전화 상담함');
    expect(d.key).toBe('r1');
  });

  it('출결 카테고리 → kind=attendance, kindLabel=출결', () => {
    const rec = {
      id: 'r2',
      studentId: 's1',
      category: 'attendance',
      subcategory: '결석 (질병)',
      content: '',
      date: '2026-03-11',
      createdAt: '2026-03-11T09:00:00.000Z',
    } as unknown as StudentRecord;
    const d = studentRecordToDisplay(rec, { categories, studentMap });
    expect(d.kind).toBe('attendance');
    expect(d.kindKey).toBe('attendance');
    expect(d.kindLabel).toBe('출결');
    expect(d.status).toBe('absent');
    expect(d.reason).toBe('질병');
  });

  it('미등록 학생/카테고리 fallback', () => {
    const rec = {
      id: 'r3',
      studentId: 'unknown',
      category: 'custom-x',
      subcategory: '기타',
      content: '메모',
      date: '2026-03-12',
      createdAt: '2026-03-12T09:00:00.000Z',
    } as unknown as StudentRecord;
    const d = studentRecordToDisplay(rec, { categories, studentMap });
    expect(d.studentName).toBe('?');
    expect(d.studentNumber).toBeUndefined();
    expect(d.kindLabel).toBe('custom-x'); // 카테고리 미등록 시 id fallback
  });
});
