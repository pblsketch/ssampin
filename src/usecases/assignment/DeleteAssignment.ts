import type { AssignmentsData } from '@domain/entities/Assignment';
import type { IAssignmentRepository } from '@domain/repositories/IAssignmentRepository';
import type { IAssignmentServicePort } from '@domain/ports/IAssignmentServicePort';

export class DeleteAssignment {
  constructor(
    private readonly assignmentRepo: IAssignmentRepository,
    private readonly servicePort: IAssignmentServicePort,
  ) {}

  async execute(assignmentId: string): Promise<void> {
    const data = await this.assignmentRepo.getAssignments();
    const assignments = data?.assignments ?? [];

    const assignment = assignments.find((a) => a.id === assignmentId);
    if (!assignment) {
      throw new Error('과제를 찾을 수 없습니다');
    }

    // Supabase DB 삭제 (CASCADE → submissions도 삭제)
    await this.servicePort.deleteAssignment(assignmentId, assignment.adminKey);

    // 로컬 JSON에서도 삭제
    const updatedData: AssignmentsData = {
      assignments: assignments.filter((a) => a.id !== assignmentId),
    };
    await this.assignmentRepo.saveAssignments(updatedData);

    // ⚠️ 구글 드라이브 파일은 삭제하지 않음 (안전)
  }
}
