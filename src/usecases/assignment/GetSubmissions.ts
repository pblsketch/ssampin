import type { Submission } from '@domain/entities/Assignment';
import type { IAssignmentRepository } from '@domain/repositories/IAssignmentRepository';
import type { IAssignmentServicePort } from '@domain/ports/IAssignmentServicePort';
import type { SubmissionStatus } from '@domain/valueObjects/SubmissionStatus';
import { getSubmissionStatus } from '@domain/valueObjects/SubmissionStatus';
import { matchSubmissionsToStudents } from '@domain/rules/submissionMatching';

export interface SubmissionDetail {
  readonly studentId: string;
  readonly studentNumber: number;
  readonly studentName: string;
  readonly studentGrade?: string;
  readonly studentClass?: string;
  readonly status: SubmissionStatus;
  readonly submission?: Submission;
}

/**
 * 조회 결과. `unmatched` 는 **어느 학생 것인지 확정하지 못한** 제출물이다.
 * 소속(학년·반)이 명단과 어긋나거나, 소속 정보가 없는데 같은 번호 학생이 둘 이상인 경우.
 * ★번호만으로 추측해 붙이지 않고 교사에게 알린다.
 */
export interface SubmissionOverview {
  readonly details: SubmissionDetail[];
  readonly unmatched: readonly Submission[];
}

export class GetSubmissions {
  constructor(
    private readonly assignmentRepo: IAssignmentRepository,
    private readonly servicePort: IAssignmentServicePort,
  ) {}

  async execute(assignmentId: string): Promise<SubmissionDetail[]> {
    return (await this.executeDetailed(assignmentId)).details;
  }

  async executeDetailed(assignmentId: string): Promise<SubmissionOverview> {
    // 로컬에서 과제 정보 조회 (학생 명단 포함)
    const data = await this.assignmentRepo.getAssignments();
    const assignment = data?.assignments.find((a) => a.id === assignmentId);
    if (!assignment) {
      throw new Error('과제를 찾을 수 없습니다');
    }

    // Supabase에서 제출 현황 조회
    const submissions = await this.servicePort.getSubmissions(assignmentId, assignment.adminKey);

    // 학생 명단과 제출 데이터 매칭 — 규칙은 `submissionMatching` 한 곳에 있다.
    // ★예전에는 마지막에 "번호만" 비교해서, 1반 3번이 낸 과제가 2반 3번 칸에도 붙었다(2026-09-08 검토 B).
    const { byStudentId, unmatched } = matchSubmissionsToStudents(
      assignment.target.students,
      submissions,
    );

    const details = assignment.target.students.map((student) => {
      const submission = byStudentId.get(student.id);
      const hasSubmitted = submission !== undefined;
      const isLate = submission?.isLate ?? false;

      return {
        studentId: student.id,
        studentNumber: student.number,
        studentName: student.name,
        // 학생 목록의 grade/class 우선 사용 (미제출자도 소속 표시)
        studentGrade: student.grade != null ? String(student.grade) : submission?.studentGrade,
        studentClass:
          student.classNum != null ? String(student.classNum) : submission?.studentClass,
        status: getSubmissionStatus(hasSubmitted, isLate),
        submission,
      };
    });

    return { details, unmatched };
  }
}
