import { describe, it, expect } from 'vitest';
import type { Student } from '@domain/entities/Student';
import {
  mapToInputs,
  studentToBasicInput,
} from './pdfTemplatePresenter';

describe('mapToInputs', () => {
  it('빈 배열 → 빈 배열', () => {
    expect(mapToInputs([], () => ({}))).toEqual([]);
  });

  it('각 요소를 매퍼로 변환하여 순서 유지', () => {
    const items = [1, 2, 3];
    const result = mapToInputs(items, (n, i) => ({
      num: String(n),
      index: String(i),
    }));
    expect(result).toEqual([
      { num: '1', index: '0' },
      { num: '2', index: '1' },
      { num: '3', index: '2' },
    ]);
  });

  it('readonly array 도 허용 (타입 레벨 호환성)', () => {
    const frozen: readonly string[] = Object.freeze(['a', 'b']);
    const result = mapToInputs(frozen, (s) => ({ value: s }));
    expect(result).toEqual([{ value: 'a' }, { value: 'b' }]);
  });
});

describe('studentToBasicInput', () => {
  const baseStudent: Student = {
    id: 's1',
    name: '홍길동',
    studentNumber: 10201,
    phone: '010-1234-5678',
    parentPhone: '010-9876-5432',
    parentPhoneLabel: '어머니',
    birthDate: '2012-03-15',
    status: 'active',
  };

  it('모든 필드가 채워진 학생 → 문자열 맵 (한글 상태 라벨 포함)', () => {
    const input = studentToBasicInput(baseStudent, {
      schoolName: '쌤핀중학교',
      className: '1학년 2반',
      teacherName: '홍길동 선생님',
      generatedAt: new Date(2026, 3, 21), // 2026-04-21
    });

    expect(input.name).toBe('홍길동');
    expect(input.studentNumber).toBe('10201');
    expect(input.phone).toBe('010-1234-5678');
    expect(input.parentPhone).toBe('010-9876-5432');
    expect(input.parentPhoneLabel).toBe('어머니');
    expect(input.birthDate).toBe('2012.03.15'); // YYYY-MM-DD → YYYY.MM.DD
    expect(input.status).toBe('재학'); // active → '재학'
    expect(input.schoolName).toBe('쌤핀중학교');
    expect(input.className).toBe('1학년 2반');
    expect(input.teacherName).toBe('홍길동 선생님');
    expect(input.generatedDate).toBe('2026년 04월 21일');
  });

  it('선택 필드 없음 → 빈 문자열로 정규화', () => {
    const minimal: Student = { id: 's2', name: '김철수' };
    const input = studentToBasicInput(minimal);

    expect(input.name).toBe('김철수');
    expect(input.studentNumber).toBe('');
    expect(input.phone).toBe('');
    expect(input.parentPhone).toBe('');
    expect(input.parentPhoneLabel).toBe('');
    expect(input.parentPhone2).toBe('');
    expect(input.parentPhone2Label).toBe('');
    expect(input.birthDate).toBe('');
    expect(input.statusNote).toBe('');
    expect(input.schoolName).toBe('');
    expect(input.className).toBe('');
    expect(input.teacherName).toBe('');
  });

  it('status 미지정 → "재학" 기본값', () => {
    const s: Student = { id: 's3', name: '이영희' }; // status 없음
    const input = studentToBasicInput(s);
    expect(input.status).toBe('재학');
  });

  it('status = "transferred" → "전출"', () => {
    const s: Student = {
      id: 's4',
      name: '박민수',
      status: 'transferred',
      statusNote: '2026.4.1 전출 - OO중학교로',
    };
    const input = studentToBasicInput(s);
    expect(input.status).toBe('전출');
    expect(input.statusNote).toBe('2026.4.1 전출 - OO중학교로');
  });

  it('birthDate 포맷 불일치 → 원본 유지 (YYYY.MM.DD 가 아닌 값)', () => {
    const s: Student = { id: 's5', name: '테스트', birthDate: '2012/3/15' };
    const input = studentToBasicInput(s);
    expect(input.birthDate).toBe('2012/3/15'); // YYYY-MM-DD 포맷 아니면 그대로
  });

  it('generatedAt 생략 시 현재 시각 사용', () => {
    const s: Student = { id: 's6', name: '이름' };
    const input = studentToBasicInput(s);
    // generatedDate 는 YYYY년 MM월 DD일 패턴
    expect(input.generatedDate).toMatch(/^\d{4}년 \d{2}월 \d{2}일$/);
  });
});

describe('mapToInputs + studentToBasicInput 통합', () => {
  it('students 배열 → inputs 배열 (renderTemplate 에 바로 주입 가능)', () => {
    const students: Student[] = [
      { id: 's1', name: '홍길동', status: 'active' },
      { id: 's2', name: '김철수', status: 'transferred' },
      { id: 's3', name: '이영희' },
    ];
    const context = { className: '1학년 2반' };

    const inputs = mapToInputs(students, (s) => studentToBasicInput(s, context));

    expect(inputs).toHaveLength(3);
    const [first, second, third] = inputs;
    expect(first?.name).toBe('홍길동');
    expect(first?.status).toBe('재학');
    expect(second?.status).toBe('전출');
    expect(third?.status).toBe('재학');
    expect(first?.className).toBe('1학년 2반'); // context 각 row 에 주입
    expect(second?.className).toBe('1학년 2반');
  });
});
