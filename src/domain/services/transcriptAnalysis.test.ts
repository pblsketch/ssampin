import { describe, it, expect } from 'vitest';
import type { StudentTranscript, TranscriptSubjectRow } from '@domain/entities/ImportedTranscript';
import {
  subjectCategoryOf,
  nearMissSubjects,
  studentTranscriptSummary,
  weakSubjects,
} from './transcriptAnalysis';

describe('subjectCategoryOf', () => {
  it('계열 분류', () => {
    expect(subjectCategoryOf('통합과학')).toBe('과학');
    expect(subjectCategoryOf('미적분')).toBe('수학');
    expect(subjectCategoryOf('문학')).toBe('국어');
    expect(subjectCategoryOf('영어I')).toBe('영어');
    expect(subjectCategoryOf('통합사회')).toBe('사회');
    expect(subjectCategoryOf('생활과 윤리')).toBe('사회');
    expect(subjectCategoryOf('체육')).toBe('기타');
  });
});

function sub(overrides: Partial<TranscriptSubjectRow>): TranscriptSubjectRow {
  return { subject: '과목', category: '기타', ...overrides };
}

function transcript(subjects: TranscriptSubjectRow[]): StudentTranscript {
  return { studentKey: '1', studentName: '홍길동', term: '2026 1학기', subjects };
}

describe('nearMissSubjects', () => {
  it('한 등급 경계 과목을 가까운 순으로', () => {
    const t = transcript([
      sub({
        subject: '국어',
        category: '국어',
        rank: 35,
        tieCount: 1,
        totalStudents: 100,
        rankGrade: 3,
      }), // 1명
      sub({
        subject: '수학',
        category: '수학',
        rank: 67,
        tieCount: 1,
        totalStudents: 100,
        rankGrade: 4,
      }), // 1명 (0.66 컷)
      sub({
        subject: '영어',
        category: '영어',
        rank: 3,
        tieCount: 1,
        totalStudents: 100,
        rankGrade: 1,
      }), // 1등급 제외
    ]);
    const result = nearMissSubjects(t, 'rank5');
    expect(result.map((r) => r.subject)).toContain('국어');
    expect(result.find((r) => r.subject === '국어')?.peopleToNext).toBe(1);
    expect(result.find((r) => r.subject === '영어')).toBeUndefined(); // 1등급 제외
  });

  it('석차 정보 없으면 제외', () => {
    const t = transcript([sub({ subject: '미술', achievement: 'A' })]);
    expect(nearMissSubjects(t, 'rank5')).toEqual([]);
  });
});

describe('studentTranscriptSummary', () => {
  it('과목 수·석차등급 평균·성취도 분포', () => {
    const t = transcript([
      sub({ subject: '국어', rankGrade: 2, achievement: 'A' }),
      sub({ subject: '수학', rankGrade: 4, achievement: 'C' }),
      sub({ subject: '영어', achievement: 'A' }),
    ]);
    const s = studentTranscriptSummary(t);
    expect(s.subjectCount).toBe(3);
    expect(s.avgRankGrade).toBe(3); // (2+4)/2
    expect(s.achievementDistribution).toEqual({ A: 2, C: 1 });
  });

  it('석차등급 없으면 평균 null', () => {
    const s = studentTranscriptSummary(transcript([sub({ achievement: 'B' })]));
    expect(s.avgRankGrade).toBeNull();
  });
});

describe('weakSubjects', () => {
  it('성취도 D·E만', () => {
    const t = transcript([
      sub({ subject: '국어', achievement: 'A' }),
      sub({ subject: '수학', achievement: 'D' }),
      sub({ subject: '과학', achievement: 'E' }),
    ]);
    expect(weakSubjects(t).map((r) => r.subject)).toEqual(['수학', '과학']);
  });
});
