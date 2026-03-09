import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IAssignmentRepository } from '@domain/repositories/IAssignmentRepository';
import type { AssignmentsData } from '@domain/entities/Assignment';

export class JsonAssignmentRepository implements IAssignmentRepository {
  constructor(private readonly storage: IStoragePort) {}

  getAssignments(): Promise<AssignmentsData | null> {
    return this.storage.read<AssignmentsData>('assignments');
  }

  saveAssignments(data: AssignmentsData): Promise<void> {
    return this.storage.write('assignments', data);
  }
}
