/**
 * ManageStudentRecords 쓰기 경합 회귀 테스트 (2026-07 codex QA critical).
 *
 * 이 usecase의 변이는 "파일 전체 읽기 → 일부 교체 → 전체 쓰기" 구조라, 직렬화 없이
 * 병렬 실행되면 전부 같은 스냅샷에서 출발해 마지막 쓰기만 저장소에 남는다
 * (재현: 2건 일괄 처리 후 재시작 시 첫 건의 완료 플래그가 되살아남).
 * 아래 테스트는 ① updateMany 원자 일괄 저장 ② update 직렬화 ③ 실패 격리를 고정한다.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { StudentRecord, StudentRecordsData } from '@domain/entities/StudentRecord';
import type { IStudentRecordsRepository } from '@domain/repositories/IStudentRecordsRepository';
import { resetFileWriteLocksForTest } from '@usecases/shared/fileWriteLock';
import { ManageStudentRecords } from './ManageStudentRecords';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeRecord(id: string, overrides: Partial<StudentRecord> = {}): StudentRecord {
  return {
    id,
    studentId: `student-${id}`,
    category: 'attendance',
    subcategory: '결석 (질병)',
    content: '',
    date: '2026-07-13',
    createdAt: '2026-07-13T09:00:00.000Z',
    reportedToNeis: false,
    ...overrides,
  };
}

/** 읽기에 지연을 줘 직렬화 없이는 경합이 반드시 재현되게 하는 가짜 저장소. */
class FakeRepo implements IStudentRecordsRepository {
  data: StudentRecordsData | null;
  saveCount = 0;
  failNextSave = false;
  constructor(records: readonly StudentRecord[]) {
    this.data = { records };
  }
  async getRecords(): Promise<StudentRecordsData | null> {
    await sleep(5);
    // 저장 시점 스냅샷처럼 동작하도록 깊은 복사 반환
    return this.data ? (JSON.parse(JSON.stringify(this.data)) as StudentRecordsData) : null;
  }
  async saveRecords(data: StudentRecordsData): Promise<void> {
    await sleep(2);
    if (this.failNextSave) {
      this.failNextSave = false;
      throw new Error('save failed (test)');
    }
    this.data = data;
    this.saveCount++;
  }
}

describe('ManageStudentRecords 쓰기 경합 방지', () => {
  // 직렬화가 per-instance 체인 → 전역 파일 락(withFileLock)으로 바뀌어, 테스트 간
  // 'student-records' 체인 공유를 끊는다(테스트 격리 — 계약 자체는 동일).
  beforeEach(() => {
    resetFileWriteLocksForTest();
  });

  it('updateMany는 여러 기록의 변경을 한 번의 쓰기로 전부 저장한다 (일괄 유실 방지)', async () => {
    const repo = new FakeRepo([makeRecord('a'), makeRecord('b'), makeRecord('c')]);
    const manage = new ManageStudentRecords(repo);

    await manage.updateMany([
      makeRecord('a', { reportedToNeis: true }),
      makeRecord('b', { reportedToNeis: true }),
    ]);

    expect(repo.saveCount).toBe(1);
    const saved = repo.data!.records;
    expect(saved.find((r) => r.id === 'a')?.reportedToNeis).toBe(true);
    expect(saved.find((r) => r.id === 'b')?.reportedToNeis).toBe(true);
    // 대상이 아닌 기록은 그대로
    expect(saved.find((r) => r.id === 'c')?.reportedToNeis).toBe(false);
    // updatedAt 스탬프(동기화 최신 우선 병합 근거)가 찍힌다
    expect(saved.find((r) => r.id === 'a')?.updatedAt).toBeTruthy();
  });

  it('update 두 건을 병렬 호출해도 직렬화되어 둘 다 저장된다 (마지막 쓰기 승리 유실 방지)', async () => {
    const repo = new FakeRepo([makeRecord('a'), makeRecord('b')]);
    const manage = new ManageStudentRecords(repo);

    // 직렬화가 없다면 두 호출 모두 같은 스냅샷을 읽어 a의 변경이 b의 쓰기에 덮인다
    await Promise.all([
      manage.update(makeRecord('a', { reportedToNeis: true })),
      manage.update(makeRecord('b', { reportedToNeis: true })),
    ]);

    const saved = repo.data!.records;
    expect(saved.find((r) => r.id === 'a')?.reportedToNeis).toBe(true);
    expect(saved.find((r) => r.id === 'b')?.reportedToNeis).toBe(true);
  });

  it('같은 기록에 대한 서로 다른 플래그 변이도 순서대로 반영된다 (연속 토글 유실 방지)', async () => {
    const repo = new FakeRepo([makeRecord('a', { documentSubmitted: false })]);
    const manage = new ManageStudentRecords(repo);

    // 토글 1: 나이스 반영 / 토글 2: 서류 제출 — 직렬화되면 둘 다 남는다.
    // (스토어 토글은 호출 시점 최신 상태를 읽어 만들므로, 여기서는 usecase 직렬화만 고정한다:
    //  두 번째 변이가 첫 변이 이후의 파일 스냅샷 위에서 수행되는지)
    const first = manage.update(makeRecord('a', { reportedToNeis: true }));
    const second = first.then(() =>
      manage.update({
        ...(repo.data!.records.find((r) => r.id === 'a') as StudentRecord),
        documentSubmitted: true,
      }),
    );
    await second;

    const saved = repo.data!.records.find((r) => r.id === 'a');
    expect(saved?.reportedToNeis).toBe(true);
    expect(saved?.documentSubmitted).toBe(true);
  });

  it('앞선 쓰기가 실패해도 체인이 끊기지 않고 다음 쓰기는 정상 저장된다', async () => {
    const repo = new FakeRepo([makeRecord('a'), makeRecord('b')]);
    const manage = new ManageStudentRecords(repo);

    repo.failNextSave = true;
    await expect(manage.update(makeRecord('a', { reportedToNeis: true }))).rejects.toThrow(
      'save failed (test)',
    );

    await manage.update(makeRecord('b', { reportedToNeis: true }));
    expect(repo.data!.records.find((r) => r.id === 'b')?.reportedToNeis).toBe(true);
    // 실패한 첫 건은 저장되지 않은 상태 그대로
    expect(repo.data!.records.find((r) => r.id === 'a')?.reportedToNeis).toBe(false);
  });

  it('빈 목록 updateMany는 쓰기를 발생시키지 않는다', async () => {
    const repo = new FakeRepo([makeRecord('a')]);
    const manage = new ManageStudentRecords(repo);
    await manage.updateMany([]);
    expect(repo.saveCount).toBe(0);
  });
});
