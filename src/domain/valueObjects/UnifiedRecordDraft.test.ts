/**
 * UnifiedRecordDraft 단위 테스트
 *
 * UT-2: 매핑 무손실 + 교과 관찰→분류 '수업 관찰' 기본.
 * CT-1: toObservation 결과 tags 에 분류(category) 미혼입.
 * additive 하위호환: category/tags 없는 기존 레코드 from* 안전 기본값.
 *
 * 설계: docs/02-design/features/record-system-unification-phase1.design.md §3.2
 */
import { describe, it, expect } from 'vitest';
import {
  toStudentRecord,
  toObservation,
  fromObservation,
  fromStudentRecord,
  DEFAULT_TEACHING_CATEGORY,
} from './UnifiedRecordDraft';
import type { UnifiedRecordDraft } from './UnifiedRecordDraft';
import type { ObservationRecord } from '../entities/Observation';
import type { StudentRecord } from '../entities/StudentRecord';

// ─── 픽스처 ──────────────────────────────────────────────────────────────────

const homeroomDraft: UnifiedRecordDraft = {
  context: 'homeroom',
  studentRef: 'stu-001',
  date: '2026-06-23',
  category: 'life',
  subcategory: '칭찬',
  tags: ['성실', '발표'],
  content: '수업 태도가 매우 좋음',
  followUp: '가정통신문 발송 예정',
};

const teachingDraft: UnifiedRecordDraft = {
  context: 'teaching',
  studentRef: 'tc:class-abc:3-2-5',
  classId: 'class-abc',
  date: '2026-06-23',
  category: '수업 관찰',
  tags: ['교과역량', '학습태도'],
  content: '모둠 토의에서 적극적으로 발언함',
};

// ─── UT-2: toStudentRecord 무손실 변환 ───────────────────────────────────────

describe('UT-2 toStudentRecord — 무손실 변환', () => {
  it('category / subcategory / content / date / tags 전부 매핑', () => {
    const result = toStudentRecord(homeroomDraft);
    expect(result.category).toBe('life');
    expect(result.subcategory).toBe('칭찬');
    expect(result.content).toBe('수업 태도가 매우 좋음');
    expect(result.date).toBe('2026-06-23');
    expect(result.tags).toEqual(['성실', '발표']);
    expect(result.followUp).toBe('가정통신문 발송 예정');
  });

  it('tags 빈 배열이면 undefined 저장(스키마 절약)', () => {
    const draft: UnifiedRecordDraft = { ...homeroomDraft, tags: [] };
    const result = toStudentRecord(draft);
    expect(result.tags).toBeUndefined();
  });

  it('subcategory 없으면 빈 문자열 기본값', () => {
    const draft: UnifiedRecordDraft = { ...homeroomDraft, subcategory: undefined };
    const result = toStudentRecord(draft);
    expect(result.subcategory).toBe('');
  });

  it('반환값에 id / studentId / createdAt 없음(어댑터가 채움)', () => {
    const result = toStudentRecord(homeroomDraft);
    expect((result as Record<string, unknown>)['id']).toBeUndefined();
    expect((result as Record<string, unknown>)['studentId']).toBeUndefined();
    expect((result as Record<string, unknown>)['createdAt']).toBeUndefined();
  });
});

// ─── UT-2: toObservation 무손실 변환 + 분류 '수업 관찰' 기본 ─────────────────

describe('UT-2 toObservation — 무손실 변환 + 기본 분류', () => {
  it('content / date / tags / classId / category 전부 매핑', () => {
    const result = toObservation(teachingDraft);
    expect(result.content).toBe('모둠 토의에서 적극적으로 발언함');
    expect(result.date).toBe('2026-06-23');
    expect(result.tags).toEqual(['교과역량', '학습태도']);
    expect(result.classId).toBe('class-abc');
    expect(result.category).toBe('수업 관찰');
  });

  it('교과 분류 기본값이 DEFAULT_TEACHING_CATEGORY("수업 관찰")와 일치', () => {
    expect(DEFAULT_TEACHING_CATEGORY).toBe('수업 관찰');
    const draft: UnifiedRecordDraft = { ...teachingDraft, category: DEFAULT_TEACHING_CATEGORY };
    const result = toObservation(draft);
    expect(result.category).toBe('수업 관찰');
  });

  it('classId 미지정이면 빈 문자열 기본값', () => {
    const draft: UnifiedRecordDraft = { ...teachingDraft, classId: undefined };
    const result = toObservation(draft);
    expect(result.classId).toBe('');
  });
});

// ─── CT-1: tags 에 category 미혼입 (P3 핵심 불가침) ─────────────────────────

describe('CT-1 tags 분류 혼입 금지', () => {
  it('toObservation — tags 배열에 category 값이 포함되지 않음(교과)', () => {
    const result = toObservation(teachingDraft);
    expect(result.tags).not.toContain(result.category);
    // category 는 별도 필드에만 존재
    expect(result.tags).toEqual(['교과역량', '학습태도']);
    expect(result.category).toBe('수업 관찰');
  });

  it('toObservation — 커스텀 분류도 tags 에 혼입되지 않음', () => {
    const draft: UnifiedRecordDraft = {
      ...teachingDraft,
      category: '특기사항',
      tags: ['진로흥미'],
    };
    const result = toObservation(draft);
    expect(result.tags).not.toContain('특기사항');
    expect(result.category).toBe('특기사항');
  });

  it('toStudentRecord — tags 배열에 category 값이 포함되지 않음(담임)', () => {
    const result = toStudentRecord(homeroomDraft);
    expect(result.tags).not.toContain(homeroomDraft.category);
    expect(result.tags).toEqual(['성실', '발표']);
  });
});

// ─── additive 하위호환: 기존 레코드(category/tags 없음) from* 안전 기본값 ────

describe('additive 하위호환 — 기존 레코드 from* 안전 기본값', () => {
  const legacyObservation: ObservationRecord = {
    id: 'obs-legacy',
    studentId: 'tc:class-abc:3-2-5',
    classId: 'class-abc',
    authorId: 'teacher-1',
    date: '2026-01-01',
    content: '기존 관찰 기록',
    tags: ['학습태도'],
    visibility: 'private',
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    // category 필드 없음(기존 레코드)
  };

  it('fromObservation — category 없으면 DEFAULT_TEACHING_CATEGORY 기본값', () => {
    const result = fromObservation(legacyObservation, legacyObservation.studentId);
    expect(result.category).toBe(DEFAULT_TEACHING_CATEGORY);
    expect(result.category).toBe('수업 관찰');
  });

  it('fromObservation — tags 는 기존 값 그대로, 분류 미포함', () => {
    const result = fromObservation(legacyObservation, legacyObservation.studentId);
    expect(result.tags).toEqual(['학습태도']);
    expect(result.tags).not.toContain('수업 관찰');
  });

  it('fromObservation — context / studentRef / classId 정확히 채워짐', () => {
    const result = fromObservation(legacyObservation, legacyObservation.studentId);
    expect(result.context).toBe('teaching');
    expect(result.studentRef).toBe('tc:class-abc:3-2-5');
    expect(result.classId).toBe('class-abc');
  });

  const legacyStudentRecord: StudentRecord = {
    id: 'rec-legacy',
    studentId: 'stu-001',
    category: 'counseling',
    subcategory: '학생상담',
    content: '기존 담임 기록',
    date: '2026-01-01',
    createdAt: '2026-01-01T09:00:00.000Z',
    // tags 필드 없음(기존 레코드)
  };

  it('fromStudentRecord — tags 없으면 빈 배열 기본값', () => {
    const result = fromStudentRecord(legacyStudentRecord, legacyStudentRecord.studentId);
    expect(result.tags).toEqual([]);
  });

  it('fromStudentRecord — category / subcategory / content / date 무손실', () => {
    const result = fromStudentRecord(legacyStudentRecord, legacyStudentRecord.studentId);
    expect(result.category).toBe('counseling');
    expect(result.subcategory).toBe('학생상담');
    expect(result.content).toBe('기존 담임 기록');
    expect(result.date).toBe('2026-01-01');
  });

  it('fromStudentRecord — context / studentRef 정확히 채워짐', () => {
    const result = fromStudentRecord(legacyStudentRecord, legacyStudentRecord.studentId);
    expect(result.context).toBe('homeroom');
    expect(result.studentRef).toBe('stu-001');
  });
});

// ─── UT-2: 무손실 왕복 (from* ∘ to*) ────────────────────────────────────────

describe('UT-2 무손실 왕복 — fromObservation(toObservation(draft)) 핵심 필드 보존', () => {
  it('교과 드래프트 → toObservation → fromObservation 왕복', () => {
    const partial = toObservation(teachingDraft);
    // 왕복 시뮬: toObservation 결과에 id/authorId/visibility/createdAt/updatedAt 채워 완성
    const saved: ObservationRecord = {
      id: 'obs-new',
      studentId: teachingDraft.studentRef,
      authorId: 'teacher-1',
      visibility: 'private',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...partial,
    };
    const recovered = fromObservation(saved, teachingDraft.studentRef);
    expect(recovered.category).toBe(teachingDraft.category);
    expect(recovered.tags).toEqual([...teachingDraft.tags]);
    expect(recovered.content).toBe(teachingDraft.content);
    expect(recovered.date).toBe(teachingDraft.date);
  });

  it('담임 드래프트 → toStudentRecord → fromStudentRecord 왕복', () => {
    const partial = toStudentRecord(homeroomDraft);
    const saved: StudentRecord = {
      id: 'rec-new',
      studentId: homeroomDraft.studentRef,
      createdAt: '2026-06-23T09:00:00.000Z',
      ...partial,
      // subcategory는 toStudentRecord 결과에 포함됨
    };
    const recovered = fromStudentRecord(saved, homeroomDraft.studentRef);
    expect(recovered.category).toBe(homeroomDraft.category);
    expect(recovered.subcategory).toBe(homeroomDraft.subcategory);
    expect(recovered.tags).toEqual([...homeroomDraft.tags]);
    expect(recovered.content).toBe(homeroomDraft.content);
    expect(recovered.date).toBe(homeroomDraft.date);
    expect(recovered.followUp).toBe(homeroomDraft.followUp);
  });
});
