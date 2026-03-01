import type { Memo, MemosData } from '@domain/entities/Memo';
import type { IMemoRepository } from '@domain/repositories/IMemoRepository';

export class ManageMemos {
  constructor(private readonly memoRepository: IMemoRepository) {}

  async getAll(): Promise<readonly Memo[]> {
    const data = await this.memoRepository.getMemos();
    return data?.memos ?? [];
  }

  async add(memo: Memo): Promise<void> {
    const data = await this.memoRepository.getMemos();
    const memos = data?.memos ?? [];

    const updatedMemos: readonly Memo[] = [...memos, memo];
    const updatedData: MemosData = { memos: updatedMemos };

    await this.memoRepository.saveMemos(updatedData);
  }

  async update(memo: Memo): Promise<void> {
    const data = await this.memoRepository.getMemos();
    const memos = data?.memos ?? [];

    const updatedMemos: readonly Memo[] = memos.map((m) =>
      m.id === memo.id ? memo : m
    );
    const updatedData: MemosData = { memos: updatedMemos };

    await this.memoRepository.saveMemos(updatedData);
  }

  async delete(id: string): Promise<void> {
    const data = await this.memoRepository.getMemos();
    const memos = data?.memos ?? [];

    const updatedMemos: readonly Memo[] = memos.filter(
      (m) => m.id !== id
    );
    const updatedData: MemosData = { memos: updatedMemos };

    await this.memoRepository.saveMemos(updatedData);
  }
}
