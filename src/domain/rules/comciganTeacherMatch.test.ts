import { describe, it, expect } from 'vitest';
import { locateTeacherByFingerprint } from './comciganTeacherMatch';
import type { ComciganTeacherSummary } from '../entities/ComciganTimetable';

function T(
  partial: Partial<ComciganTeacherSummary> & { index: number; name: string },
): ComciganTeacherSummary {
  return {
    weeklyHours: 10,
    subjects: [],
    isDummy: false,
    maskedNameCollision: false,
    ...partial,
  };
}

describe('locateTeacherByFingerprint — 지문 재매칭', () => {
  it('이름이 유일하면 시수/과목이 변해도 그 교사로 수용', () => {
    const summaries = [
      T({ index: 3, name: '백순*', subjects: ['문학', '독서'], weeklyHours: 22 }),
      T({ index: 5, name: '이철*', subjects: ['수학'] }),
    ];
    // 저장 지문의 과목(언매)이 지금과 달라도(과목 개편) 이름 유일 → 매칭
    const match = locateTeacherByFingerprint(summaries, {
      maskedName: '백순*',
      subjects: ['언매'],
    });
    expect(match?.index).toBe(3);
  });

  it('이름이 중복이면 과목 교집합이 큰 후보로 구분', () => {
    const summaries = [
      T({ index: 1, name: '김민*', subjects: ['국어', '문학'] }),
      T({ index: 2, name: '김민*', subjects: ['수학', '미적분'] }),
    ];
    const match = locateTeacherByFingerprint(summaries, {
      maskedName: '김민*',
      subjects: ['수학'],
    });
    expect(match?.index).toBe(2);
  });

  it('이름 중복 + 과목 교집합 동점이면 모호 → null (오적용 방지)', () => {
    const summaries = [
      T({ index: 1, name: '김민*', subjects: ['국어'] }),
      T({ index: 2, name: '김민*', subjects: ['수학'] }),
    ];
    const match = locateTeacherByFingerprint(summaries, {
      maskedName: '김민*',
      subjects: ['영어'],
    });
    expect(match).toBeNull();
  });

  it('이름이 목록에 없으면 null', () => {
    const summaries = [T({ index: 1, name: '박교*', subjects: ['과학'] })];
    expect(locateTeacherByFingerprint(summaries, { maskedName: '없음*', subjects: [] })).toBeNull();
  });

  it('더미 항목은 후보에서 제외한다', () => {
    const summaries = [
      T({ index: 9, name: '자*', subjects: ['자율'], isDummy: true }),
      T({ index: 1, name: '자*', subjects: ['국어'] }),
    ];
    const match = locateTeacherByFingerprint(summaries, { maskedName: '자*', subjects: ['국어'] });
    expect(match?.index).toBe(1);
  });
});
