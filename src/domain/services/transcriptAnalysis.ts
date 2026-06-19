/**
 * 담임 학급 성적(전과목) 분석 — 도메인 서비스 (순수 함수).
 *
 * 계획서: docs/01-plan/features/grade-analysis.plan.md (§7.3, Phase 6)
 * 학생 한 명의 전과목 성적표에서 상담 신호를 뽑는다.
 * 석차등급/성취도는 기관 산출값을 그대로 쓰고, near-miss(한 등급 경계)만 계산한다.
 * 도메인 내부(entities/rules)만 import.
 */
import type {
  StudentTranscript,
  TranscriptSubjectRow,
  SubjectCategory,
} from '@domain/entities/ImportedTranscript';
import { peopleToNextGrade } from '@domain/rules/gradeStandardRules';

const CATEGORY_KEYWORDS: ReadonlyArray<readonly [SubjectCategory, readonly string[]]> = [
  ['수학', ['수학', '미적분', '기하', '확률', '통계', '미적']],
  ['영어', ['영어', '영독', '영작', '영문']],
  ['국어', ['국어', '문학', '독서', '화법', '작문', '언어', '매체']],
  ['사회', ['사회', '역사', '지리', '윤리', '정치', '경제', '한국사', '세계사', '도덕', '법']],
  ['과학', ['과학', '물리', '화학', '생명', '지구', '생물']],
];

/** 과목명을 계열로 분류. 매칭 없으면 '기타'. */
export function subjectCategoryOf(subject: string): SubjectCategory {
  const s = subject.replace(/\s/g, '');
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some((k) => s.includes(k))) return category;
  }
  return '기타';
}

export interface NearMissSubject {
  readonly subject: string;
  readonly rankGrade: number;
  readonly peopleToNext: number;
}

/**
 * 한 등급만 올리면 되는 과목(석차제) — peopleToNext 오름차순, 상위 limit개.
 * 석차등급·석차·수강자 정보가 있고 2등급 이하(개선 여지)인 과목만 대상.
 */
export function nearMissSubjects(
  transcript: StudentTranscript,
  scale: 'rank5' | 'rank9',
  limit = 5,
): NearMissSubject[] {
  const candidates: NearMissSubject[] = [];
  for (const row of transcript.subjects) {
    if (
      row.rankGrade === undefined ||
      row.rankGrade <= 1 ||
      row.rank === undefined ||
      row.totalStudents === undefined
    ) {
      continue;
    }
    const peopleToNext = peopleToNextGrade(
      row.rank,
      row.tieCount ?? 1,
      row.totalStudents,
      scale,
      row.rankGrade,
    );
    if (peopleToNext <= 0) continue;
    candidates.push({ subject: row.subject, rankGrade: row.rankGrade, peopleToNext });
  }
  candidates.sort((a, b) => a.peopleToNext - b.peopleToNext);
  return candidates.slice(0, limit);
}

export interface TranscriptSummary {
  readonly subjectCount: number;
  /** 석차등급 평균(있는 과목만, 소수 1자리). 없으면 null. */
  readonly avgRankGrade: number | null;
  /** 성취도 분포(A~E 등 등장한 등급별 개수). */
  readonly achievementDistribution: Readonly<Record<string, number>>;
}

/** 학생 전과목 요약 — 과목 수, 석차등급 평균, 성취도 분포. */
export function studentTranscriptSummary(transcript: StudentTranscript): TranscriptSummary {
  const grades = transcript.subjects
    .map((r) => r.rankGrade)
    .filter((g): g is number => g !== undefined);
  const avgRankGrade =
    grades.length > 0
      ? Math.round((grades.reduce((a, b) => a + b, 0) / grades.length) * 10) / 10
      : null;

  const dist: Record<string, number> = {};
  for (const row of transcript.subjects) {
    if (row.achievement !== undefined && row.achievement !== '') {
      dist[row.achievement] = (dist[row.achievement] ?? 0) + 1;
    }
  }

  return { subjectCount: transcript.subjects.length, avgRankGrade, achievementDistribution: dist };
}

/** 취약 과목(상담 신호) — 성취도 D·E. */
export function weakSubjects(transcript: StudentTranscript): readonly TranscriptSubjectRow[] {
  return transcript.subjects.filter((r) => r.achievement === 'D' || r.achievement === 'E');
}
