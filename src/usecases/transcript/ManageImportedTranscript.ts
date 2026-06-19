/**
 * 담임 학급 전과목 성적 CRUD 유스케이스.
 *
 * 계획서: docs/01-plan/features/grade-analysis.plan.md (§5, Phase 6)
 * "현재 데이터 + 변경"을 받아 "다음 데이터"를 돌려주고 저장한다.
 * 학생 식별은 studentKey 기준 upsert. domain만 import.
 */
import type {
  ImportedTranscriptData,
  StudentTranscript,
} from '@domain/entities/ImportedTranscript';
import type { IImportedTranscriptRepository } from '@domain/repositories/IImportedTranscriptRepository';

/** 빈 전과목 데이터. */
export const EMPTY_TRANSCRIPT: ImportedTranscriptData = { students: [] };

export class ManageImportedTranscript {
  constructor(private readonly repository: IImportedTranscriptRepository) {}

  /** 저장된 데이터를 불러온다(없으면 빈 데이터). */
  async load(): Promise<ImportedTranscriptData> {
    return (await this.repository.load()) ?? EMPTY_TRANSCRIPT;
  }

  /** 학생 1명 upsert (studentKey 기준). */
  async upsertStudent(
    current: ImportedTranscriptData,
    student: StudentTranscript,
  ): Promise<ImportedTranscriptData> {
    const exists = current.students.some((s) => s.studentKey === student.studentKey);
    const next: ImportedTranscriptData = {
      students: exists
        ? current.students.map((s) => (s.studentKey === student.studentKey ? student : s))
        : [...current.students, student],
    };
    await this.repository.save(next);
    return next;
  }

  /** 여러 학생 일괄 upsert (NEIS 파일 import용, studentKey 기준 병합). */
  async upsertMany(
    current: ImportedTranscriptData,
    students: readonly StudentTranscript[],
  ): Promise<ImportedTranscriptData> {
    const byKey = new Map(current.students.map((s) => [s.studentKey, s]));
    for (const student of students) {
      byKey.set(student.studentKey, student);
    }
    const next: ImportedTranscriptData = { students: [...byKey.values()] };
    await this.repository.save(next);
    return next;
  }

  /** 학생 1명 제거. */
  async removeStudent(
    current: ImportedTranscriptData,
    studentKey: string,
  ): Promise<ImportedTranscriptData> {
    const next: ImportedTranscriptData = {
      students: current.students.filter((s) => s.studentKey !== studentKey),
    };
    await this.repository.save(next);
    return next;
  }

  /** 전체 비우기. */
  async clear(): Promise<ImportedTranscriptData> {
    await this.repository.save(EMPTY_TRANSCRIPT);
    return EMPTY_TRANSCRIPT;
  }
}
