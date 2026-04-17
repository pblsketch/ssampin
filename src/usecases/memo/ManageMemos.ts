import type { Memo, MemosData } from '@domain/entities/Memo';
import type { IMemoRepository } from '@domain/repositories/IMemoRepository';
import type { MemoFontSize } from '@domain/valueObjects/MemoFontSize';
import type { MemoImage } from '@domain/valueObjects/MemoImage';

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

  async updateFontSize(id: string, fontSize: MemoFontSize): Promise<void> {
    const data = await this.memoRepository.getMemos();
    const memos = data?.memos ?? [];
    const updatedAt = new Date().toISOString();
    const updatedMemos: readonly Memo[] = memos.map((m) =>
      m.id === id ? { ...m, fontSize, updatedAt } : m,
    );
    await this.memoRepository.saveMemos({ memos: updatedMemos });
  }

  async attachImage(id: string, image: MemoImage): Promise<void> {
    const data = await this.memoRepository.getMemos();
    const memos = data?.memos ?? [];
    const updatedAt = new Date().toISOString();
    const updatedMemos: readonly Memo[] = memos.map((m) =>
      m.id === id ? { ...m, image, updatedAt } : m,
    );
    await this.memoRepository.saveMemos({ memos: updatedMemos });
  }

  async detachImage(id: string): Promise<void> {
    const data = await this.memoRepository.getMemos();
    const memos = data?.memos ?? [];
    const updatedAt = new Date().toISOString();
    const updatedMemos: readonly Memo[] = memos.map((m) => {
      if (m.id !== id) return m;
      // image 필드 제거 (exactOptionalPropertyTypes 대응)
      const { image: _removed, ...rest } = m;
      return { ...rest, updatedAt };
    });
    await this.memoRepository.saveMemos({ memos: updatedMemos });
  }
}
