import type { StudentRecord, StudentRecordsData } from '@domain/entities/StudentRecord';
import type { RecordCategoryItem } from '@domain/valueObjects/RecordCategory';
import { DEFAULT_RECORD_CATEGORIES } from '@domain/valueObjects/RecordCategory';
import type { IStudentRecordsRepository } from '@domain/repositories/IStudentRecordsRepository';

export class ManageStudentRecords {
  constructor(private readonly studentRecordsRepository: IStudentRecordsRepository) {}

  /* ─── 기록 CRUD ────────────────────────────────────── */

  async getAll(): Promise<readonly StudentRecord[]> {
    const data = await this.studentRecordsRepository.getRecords();
    return data?.records ?? [];
  }

  async add(record: StudentRecord): Promise<void> {
    const data = await this.studentRecordsRepository.getRecords();
    const current = data?.records ?? [];
    // 신규 레코드는 updatedAt = createdAt 로 시작(동기화 병합 근거).
    const stamped: StudentRecord = {
      ...record,
      updatedAt: record.updatedAt ?? record.createdAt,
    };
    await this.studentRecordsRepository.saveRecords({
      records: [...current, stamped],
      categories: data?.categories,
    });
  }

  async update(updated: StudentRecord): Promise<void> {
    const data = await this.studentRecordsRepository.getRecords();
    const current = data?.records ?? [];
    // 수정 시 updatedAt 갱신 — 동기화가 "가장 최근 수정본"을 채택해 플래그 편집이 되살아나지 않게 한다.
    const stamped: StudentRecord = { ...updated, updatedAt: new Date().toISOString() };
    const records = current.map((r) => (r.id === updated.id ? stamped : r));
    await this.studentRecordsRepository.saveRecords({
      records,
      categories: data?.categories,
    });
  }

  async delete(id: string): Promise<void> {
    const data = await this.studentRecordsRepository.getRecords();
    const current = data?.records ?? [];
    const records = current.filter((r) => r.id !== id);
    await this.studentRecordsRepository.saveRecords({
      records,
      categories: data?.categories,
    });
  }

  /* ─── 카테고리 관리 ────────────────────────────────── */

  async getCategories(): Promise<readonly RecordCategoryItem[]> {
    const data = await this.studentRecordsRepository.getRecords();
    return data?.categories ?? [...DEFAULT_RECORD_CATEGORIES];
  }

  async saveCategories(categories: readonly RecordCategoryItem[]): Promise<void> {
    const data = await this.studentRecordsRepository.getRecords();
    const updatedData: StudentRecordsData = {
      records: data?.records ?? [],
      categories,
    };
    await this.studentRecordsRepository.saveRecords(updatedData);
  }

  async addCategory(category: RecordCategoryItem): Promise<void> {
    const categories = await this.getCategories();
    await this.saveCategories([...categories, category]);
  }

  async updateCategory(updated: RecordCategoryItem): Promise<void> {
    const categories = await this.getCategories();
    const next = categories.map((c) => (c.id === updated.id ? updated : c));
    await this.saveCategories(next);
  }

  async deleteCategory(id: string): Promise<void> {
    const categories = await this.getCategories();
    const next = categories.filter((c) => c.id !== id);
    await this.saveCategories(next);
  }
}
