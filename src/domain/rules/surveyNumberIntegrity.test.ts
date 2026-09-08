/**
 * 설문 번호·PIN 무결성 회귀 테스트 (2026-09-08 검토 C·D).
 *
 * 재현 스크립트(`docs/03-analysis/student-number-audit-20260908.cjs`)는 결함을 확인했다.
 * 여기서는 반대로 **올바른 결과**를 고정한다.
 */
import { describe, it, expect } from 'vitest';
import {
  formatSurveyForCSV,
  formatSurveyForClipboard,
  generateStudentPins,
  surveyAnswerableNumbers,
  verifyStudentPin,
  type SurveyRosterStudent,
} from '@domain/rules/surveyRules';
import type { Survey, SurveyLocalEntry } from '@domain/entities/Survey';

const survey = {
  id: 's1',
  title: '가상 설문',
  questions: [{ id: 'q1', label: '준비물 챙겼나요', type: 'yesno', required: true }],
  mode: 'teacher',
  categoryColor: 'blue',
  isArchived: false,
  createdAt: '2026-09-08',
} as Survey;

/** 담임 명렬표 — 2번 전출 */
const homeroom: SurveyRosterStudent[] = [
  { id: 'a', name: '가상가', studentNumber: 1, status: 'active' },
  { id: 'b', name: '가상나', studentNumber: 2, status: 'transferred' },
  { id: 'c', name: '가상다', studentNumber: 3, status: 'active' },
];

const entries: SurveyLocalEntry[] = [
  { studentId: 'c', questionId: 'q1', value: 'yes', updatedAt: '2026-09-08' },
];

describe('C. 설문 CSV 번호가 결번 뒤에서 밀리지 않는다', () => {
  it('2번 전출 → CSV 번호는 1·3 (2·2 아님)', () => {
    const { rows } = formatSurveyForCSV(survey, entries, homeroom);
    expect(rows.map((r) => r.number)).toEqual(['1', '3']);
  });

  it('이름·답·메모가 그 번호에 그대로 붙어 있다', () => {
    const { rows } = formatSurveyForCSV(survey, entries, homeroom, { c: '메모 다' });
    const third = rows.find((r) => r.number === '3')!;
    expect(third.name).toBe('가상다');
    expect(third.q0).toBe('yes');
    expect(third.memo).toBe('메모 다');
  });

  it('수업반 명단(number 필드)도 실제 번호를 쓴다', () => {
    const teaching: SurveyRosterStudent[] = [
      { id: 't1', name: '가상하나', number: 5, grade: 1, classNum: 2 },
      { id: 't2', name: '가상둘', number: 9, grade: 1, classNum: 2 },
    ];
    const { rows } = formatSurveyForCSV(survey, [], teaching);
    expect(rows.map((r) => r.number)).toEqual(['5', '9']);
  });

  it('명단 정렬이 바뀌어도 이름↔번호가 유지된다', () => {
    const shuffled = [homeroom[2]!, homeroom[0]!, homeroom[1]!];
    const { rows } = formatSurveyForCSV(survey, entries, shuffled);
    expect(rows.find((r) => r.name === '가상다')!.number).toBe('3');
    expect(rows.find((r) => r.name === '가상가')!.number).toBe('1');
  });

  it('클립보드 포맷도 실제 번호를 쓴다', () => {
    const text = formatSurveyForClipboard(survey, entries, homeroom);
    expect(text).toContain('3가상다');
    expect(text).not.toContain('2가상다');
  });
});

describe('D. 결번이 있어도 마지막 번호까지 응답·PIN 이 있다', () => {
  const numbers = [1, 3, 32, 33];

  it('PIN 은 인원수가 아니라 실제 번호로 만들어진다', () => {
    const pins = generateStudentPins(numbers);
    expect(
      Object.keys(pins)
        .map(Number)
        .sort((a, b) => a - b),
    ).toEqual(numbers);
    expect(pins[32]).toMatch(/^\d{4}$/);
    expect(pins[33]).toMatch(/^\d{4}$/);
    expect(pins[2]).toBeUndefined(); // 결번에는 PIN 이 없다
  });

  it('PIN 은 서로 겹치지 않는다', () => {
    const pins = generateStudentPins(Array.from({ length: 40 }, (_, i) => i + 1));
    expect(new Set(Object.values(pins)).size).toBe(40);
  });

  it('결번 번호로는 PIN 검증이 통과하지 않는다', () => {
    const pins = generateStudentPins(numbers);
    expect(verifyStudentPin(pins, 33, pins[33]!)).toBe(true);
    expect(verifyStudentPin(pins, 2, pins[33]!)).toBe(false);
  });

  it('새 설문은 targetNumbers 를, 구형 설문은 1..targetCount 를 쓴다', () => {
    expect(surveyAnswerableNumbers({ targetNumbers: [3, 1, 33] })).toEqual([1, 3, 33]);
    expect(surveyAnswerableNumbers({ targetCount: 3 })).toEqual([1, 2, 3]);
    expect(surveyAnswerableNumbers({})).toEqual([]);
  });

  it('빈 번호 목록은 구형 설문으로 보고 targetCount 로 되돌아간다', () => {
    expect(surveyAnswerableNumbers({ targetNumbers: [], targetCount: 2 })).toEqual([1, 2]);
  });
});
