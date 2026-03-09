import type { AssignmentsData } from '../entities/Assignment';

export interface IAssignmentRepository {
  getAssignments(): Promise<AssignmentsData | null>;
  saveAssignments(data: AssignmentsData): Promise<void>;
}
