import type {
  Assignment,
  Submission,
} from '@domain/entities/Assignment';
import type { IAssignmentRepository } from '@domain/repositories/IAssignmentRepository';
import type { IAssignmentServicePort } from '@domain/ports/IAssignmentServicePort';

export interface AssignmentWithStatus extends Assignment {
  readonly submissions: readonly Submission[];
  readonly submittedCount: number;
  readonly totalCount: number;
  readonly isExpired: boolean;
}

export class GetAssignments {
  constructor(
    private readonly assignmentRepo: IAssignmentRepository,
    private readonly servicePort: IAssignmentServicePort,
  ) {}

  async execute(): Promise<AssignmentWithStatus[]> {
    const data = await this.assignmentRepo.getAssignments();
    const assignments = data?.assignments ?? [];

    const now = new Date();

    const results: AssignmentWithStatus[] = [];

    for (const assignment of assignments) {
      let submissions: readonly Submission[] = [];
      try {
        submissions = await this.servicePort.getSubmissions(
          assignment.id,
          assignment.adminKey,
        );
      } catch {
        // 네트워크 오류 시 빈 배열 (오프라인)
      }

      results.push({
        ...assignment,
        submissions,
        submittedCount: submissions.length,
        totalCount: assignment.target.students.length,
        isExpired: new Date(assignment.deadline) < now,
      });
    }

    return results;
  }
}
