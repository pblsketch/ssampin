import { describe, it, expect } from 'vitest';
import {
  smartAutoAssignColors,
  extractSubjectsFromSchedule,
  extractClassroomsFromSchedule,
  autoAssignClassroomColors,
} from './subjectColorRules';
import { COLOR_PRESETS, DEFAULT_SUBJECT_COLORS } from '../valueObjects/SubjectColor';

const ALL_COLOR_IDS = COLOR_PRESETS.map((p) => p.id);

describe('smartAutoAssignColors', () => {
  it('기존 매핑(DEFAULT 포함)을 보존한다', () => {
    const result = smartAutoAssignColors({}, []);
    for (const [subject, colorId] of Object.entries(DEFAULT_SUBJECT_COLORS)) {
      expect(result[subject]).toBe(colorId);
    }
  });

  it('사용자 지정 색상이 DEFAULT 보다 우선하고, 유사 과목명이 그 색을 상속한다', () => {
    const result = smartAutoAssignColors({ 영어: 'red' }, ['공통영어1', '심화영어']);
    expect(result['영어']).toBe('red'); // 사용자 지정 보존
    expect(result['공통영어1']).toBe('red'); // "영어" 포함 → 상속
    expect(result['심화영어']).toBe('red');
  });

  it('기본 과목명을 포함하면 그 색상을 상속한다', () => {
    const result = smartAutoAssignColors({}, ['통합사회1', '공통수학2']);
    expect(result['통합사회1']).toBe(DEFAULT_SUBJECT_COLORS['사회']);
    expect(result['공통수학2']).toBe(DEFAULT_SUBJECT_COLORS['수학']);
  });

  it('키워드 매핑으로 색상을 추론한다 (문학→국어, 프로그래밍→기술)', () => {
    const result = smartAutoAssignColors({}, ['문학', '프로그래밍']);
    expect(result['문학']).toBe(DEFAULT_SUBJECT_COLORS['국어']);
    expect(result['프로그래밍']).toBe(DEFAULT_SUBJECT_COLORS['기술']);
  });

  it('추론 실패 시 아직 안 쓰인 색상을 배정한다', () => {
    const result = smartAutoAssignColors({}, ['댄스부']);
    // DEFAULT 가 13색 사용 → 미사용은 lime/rose/slate 중 첫 번째
    expect(['lime', 'rose', 'slate']).toContain(result['댄스부']);
    expect(ALL_COLOR_IDS).toContain(result['댄스부']);
  });

  it('이미 매핑된 과목은 다시 배정하지 않는다', () => {
    const result = smartAutoAssignColors({ 국어: 'blue' }, ['국어']);
    expect(result['국어']).toBe('blue');
  });
});

describe('extractSubjectsFromSchedule', () => {
  it('중복 제거 + 트림 + 빈 값/"(미정)" 제외', () => {
    const data = {
      mon: [{ subject: '국어' }, { subject: '  수학  ' }, { subject: '' }, { subject: '(미정)' }],
      tue: [{ subject: '국어' }, { subject: '영어' }],
    };
    expect(extractSubjectsFromSchedule(data)).toEqual(['국어', '수학', '영어']);
  });

  it('빈 데이터는 빈 배열', () => {
    expect(extractSubjectsFromSchedule({})).toEqual([]);
  });
});

describe('extractClassroomsFromSchedule', () => {
  it('null/빈 값 제외 + 트림 + 중복 제거', () => {
    const data = {
      mon: [{ classroom: '1-3' }, null, { classroom: ' 2-5 ' }, { classroom: '' }],
      tue: [{ classroom: '1-3' }, { classroom: '3-1' }],
    };
    expect(extractClassroomsFromSchedule(data)).toEqual(['1-3', '2-5', '3-1']);
  });
});

describe('autoAssignClassroomColors', () => {
  it('미사용 색상을 팔레트 순서대로 배정한다', () => {
    const result = autoAssignClassroomColors({}, ['1-3', '2-5']);
    expect(result['1-3']).toBe(ALL_COLOR_IDS[0]); // 'yellow'
    expect(result['2-5']).toBe(ALL_COLOR_IDS[1]); // 'green'
  });

  it('기존 매핑은 보존하고, 그 색은 새 학반에 배정하지 않는다', () => {
    const result = autoAssignClassroomColors({ '1-3': 'blue' }, ['1-3', '2-5']);
    expect(result['1-3']).toBe('blue');
    expect(result['2-5']).not.toBe('blue');
    expect(ALL_COLOR_IDS).toContain(result['2-5']);
  });

  it('이미 매핑된 학반은 건너뛴다', () => {
    const result = autoAssignClassroomColors({ '1-3': 'red' }, ['1-3']);
    expect(result['1-3']).toBe('red');
  });
});
