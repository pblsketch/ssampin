/**
 * AnonymizeSession — 학생 실명 → "학생N" 변환 + 매핑 보관 (Design §4 U9, §11.1).
 *
 * 순수 함수 — 외부 의존성 0. EndLessonSession이 내부에서 호출.
 */

import type {
  LessonSession,
  SessionStudent,
} from '@domain/entities/InteractiveSlides';
import { anonymizeStudents } from '@domain/rules/overlayRules';

export interface AnonymizeSessionInput {
  readonly session: LessonSession;
  readonly students: readonly SessionStudent[];
}

export interface AnonymizeSessionResult {
  readonly session: LessonSession;
  readonly students: readonly SessionStudent[];
  /** studentToken → "학생N" 매핑 (snapshot.anonymizationMap에 저장) */
  readonly mapping: Readonly<Record<string, string>>;
}

export function AnonymizeSession(
  input: AnonymizeSessionInput,
): AnonymizeSessionResult {
  if (input.session.anonymized) {
    return {
      session: input.session,
      students: input.students,
      mapping: {},
    };
  }

  const { anonymized, mapping } = anonymizeStudents(input.students);

  return {
    session: { ...input.session, anonymized: true },
    students: anonymized,
    mapping,
  };
}
