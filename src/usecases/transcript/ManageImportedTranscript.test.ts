import { describe, it, expect, beforeEach } from 'vitest';
import type {
  ImportedTranscriptData,
  StudentTranscript,
} from '@domain/entities/ImportedTranscript';
import type { IImportedTranscriptRepository } from '@domain/repositories/IImportedTranscriptRepository';
import { ManageImportedTranscript, EMPTY_TRANSCRIPT } from './ManageImportedTranscript';

class FakeRepo implements IImportedTranscriptRepository {
  data: ImportedTranscriptData | null = null;
  load(): Promise<ImportedTranscriptData | null> {
    return Promise.resolve(this.data);
  }
  save(data: ImportedTranscriptData): Promise<void> {
    this.data = data;
    return Promise.resolve();
  }
}

function student(key: string, name: string): StudentTranscript {
  return { studentKey: key, studentName: name, term: '2026 1학기', subjects: [] };
}

describe('ManageImportedTranscript', () => {
  let repo: FakeRepo;
  let mgr: ManageImportedTranscript;
  beforeEach(() => {
    repo = new FakeRepo();
    mgr = new ManageImportedTranscript(repo);
  });

  it('load는 저장값 없으면 빈 데이터', async () => {
    expect(await mgr.load()).toEqual(EMPTY_TRANSCRIPT);
  });

  it('upsertStudent: 추가 후 같은 키면 교체', async () => {
    const a = await mgr.upsertStudent(EMPTY_TRANSCRIPT, student('1', '홍길동'));
    expect(a.students).toHaveLength(1);
    const b = await mgr.upsertStudent(a, student('1', '홍길동(수정)'));
    expect(b.students).toHaveLength(1);
    expect(b.students[0]!.studentName).toBe('홍길동(수정)');
    expect(repo.data).toEqual(b);
  });

  it('upsertMany: 키 기준 병합(추가+교체)', async () => {
    const a = await mgr.upsertStudent(EMPTY_TRANSCRIPT, student('1', '홍길동'));
    const b = await mgr.upsertMany(a, [student('1', '홍길동(갱신)'), student('2', '김철수')]);
    expect(b.students).toHaveLength(2);
    expect(b.students.find((s) => s.studentKey === '1')?.studentName).toBe('홍길동(갱신)');
  });

  it('removeStudent / clear', async () => {
    const a = await mgr.upsertMany(EMPTY_TRANSCRIPT, [
      student('1', '홍길동'),
      student('2', '김철수'),
    ]);
    const b = await mgr.removeStudent(a, '1');
    expect(b.students.map((s) => s.studentKey)).toEqual(['2']);
    const c = await mgr.clear();
    expect(c.students).toHaveLength(0);
  });
});
