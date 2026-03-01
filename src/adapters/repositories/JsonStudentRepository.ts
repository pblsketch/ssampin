import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IStudentRepository } from '@domain/repositories/IStudentRepository';
import type { Student } from '@domain/entities/Student';

export class JsonStudentRepository implements IStudentRepository {
    constructor(private readonly storage: IStoragePort) { }

    getStudents(): Promise<readonly Student[] | null> {
        return this.storage.read<readonly Student[]>('students');
    }

    saveStudents(students: readonly Student[]): Promise<void> {
        return this.storage.write('students', students);
    }
}
