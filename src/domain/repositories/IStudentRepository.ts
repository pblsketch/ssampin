import type { Student } from '../entities/Student';

export interface IStudentRepository {
    getStudents(): Promise<readonly Student[] | null>;
    saveStudents(students: readonly Student[]): Promise<void>;
}
