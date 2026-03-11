import type { Submission } from '@domain/entities/Assignment';
import type { IAssignmentRepository } from '@domain/repositories/IAssignmentRepository';
import type { IAssignmentServicePort } from '@domain/ports/IAssignmentServicePort';
import type { SubmissionStatus } from '@domain/valueObjects/SubmissionStatus';
import { getSubmissionStatus } from '@domain/valueObjects/SubmissionStatus';

export interface SubmissionDetail {
  readonly studentId: string;
  readonly studentNumber: number;
  readonly studentName: string;
  readonly studentGrade?: string;
  readonly studentClass?: string;
  readonly status: SubmissionStatus;
  readonly submission?: Submission;
}

export class GetSubmissions {
  constructor(
    private readonly assignmentRepo: IAssignmentRepository,
    private readonly servicePort: IAssignmentServicePort,
  ) {}

  async execute(assignmentId: string): Promise<SubmissionDetail[]> {
    // 로컬에서 과제 정보 조회 (학생 명단 포함)
    const data = await this.assignmentRepo.getAssignments();
    const assignment = data?.assignments.find((a) => a.id === assignmentId);
    if (!assignment) {
      throw new Error('과제를 찾을 수 없습니다');
    }

    // Supabase에서 제출 현황 조회
    const submissions = await this.servicePort.getSubmissions(
      assignmentId,
      assignment.adminKey,
    );

    // 학생 명단과 제출 데이터 매칭
    return assignment.target.students.map((student) => {
      // 매칭 우선순위: ① student_id → ② student_number 폴백
      const submission = submissions.find(
        (s) => s.studentId === student.id,
      ) ?? submissions.find(
        (s) => s.studentNumber === student.number,
      );

      const hasSubmitted = submission !== undefined;
      const isLate = submission?.isLate ?? false;

      return {
        studentId: student.id,
        studentNumber: student.number,
        studentName: student.name,
        studentGrade: submission?.studentGrade,
        studentClass: submission?.studentClass,
        status: getSubmissionStatus(hasSubmitted, isLate),
        submission,
      };
    });
  }
}
