import type { IAssignmentRepository } from '@domain/repositories/IAssignmentRepository';
import type { IAssignmentServicePort } from '@domain/ports/IAssignmentServicePort';
import { matchSubmissionsToStudents } from '@domain/rules/submissionMatching';

export class CopyMissingList {
  constructor(
    private readonly assignmentRepo: IAssignmentRepository,
    private readonly servicePort: IAssignmentServicePort,
  ) {}

  async execute(assignmentId: string): Promise<string> {
    const data = await this.assignmentRepo.getAssignments();
    const assignment = data?.assignments.find((a) => a.id === assignmentId);
    if (!assignment) {
      throw new Error('과제를 찾을 수 없습니다');
    }

    const submissions = await this.servicePort.getSubmissions(assignmentId, assignment.adminKey);

    // 미제출 판정은 상세 화면과 **같은 규칙**을 쓴다(`submissionMatching`).
    // 예전에는 여기만 복합키를 보고 상세 화면은 번호만 봐서 두 화면의 결과가 달랐다(2026-09-08 검토 B).
    const { byStudentId } = matchSubmissionsToStudents(assignment.target.students, submissions);
    const missingStudents = assignment.target.students.filter((s) => !byStudentId.has(s.id));

    if (missingStudents.length === 0) {
      return `[${assignment.title}] 모든 학생이 제출했습니다!`;
    }

    // 미제출자 목록 텍스트 생성 (소속 정보 포함)
    const studentList = missingStudents
      .map((s) => {
        const prefix = s.grade != null && s.classNum != null ? `${s.grade}-${s.classNum} ` : '';
        return `${prefix}${s.number}번 ${s.name}`;
      })
      .join(', ');

    // 마감일 포맷 (한국어)
    const deadline = new Date(assignment.deadline);
    const year = deadline.getFullYear();
    const month = deadline.getMonth() + 1;
    const day = deadline.getDate();
    const hours = String(deadline.getHours()).padStart(2, '0');
    const minutes = String(deadline.getMinutes()).padStart(2, '0');

    return `[${assignment.title}] 미제출 학생 (${missingStudents.length}명)\n${studentList}\n\n마감: ${year}년 ${month}월 ${day}일 ${hours}:${minutes}`;
  }
}
