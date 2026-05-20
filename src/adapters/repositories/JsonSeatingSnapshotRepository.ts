import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { ISeatingSnapshotRepository } from '@domain/repositories/ISeatingSnapshotRepository';
import type { SeatingSnapshot } from '@domain/entities/SeatingSnapshot';

const STORAGE_KEY = 'seating-snapshots';
const MAX_SNAPSHOTS = 50;

/**
 * JSON 파일 기반 자리배치 스냅샷 리포지토리.
 *
 * - Electron: `userData/data/seating-snapshots.json`
 * - 브라우저(개발): localStorage('seating-snapshots')
 *
 * 모든 조회는 timestamp DESC (최신순) 정렬해 반환.
 * 저장 시 50개 초과분은 가장 오래된 것부터 자동 삭제.
 */
export class JsonSeatingSnapshotRepository implements ISeatingSnapshotRepository {
  constructor(private readonly storage: IStoragePort) {}

  async getSnapshots(): Promise<readonly SeatingSnapshot[]> {
    const data = await this.storage.read<SeatingSnapshot[]>(STORAGE_KEY);
    if (!data) return [];
    return [...data].sort((a, b) => b.timestamp - a.timestamp);
  }

  async saveSnapshot(snapshot: SeatingSnapshot): Promise<void> {
    const current = await this.getSnapshots();
    const next = [snapshot, ...current].slice(0, MAX_SNAPSHOTS);
    await this.storage.write(STORAGE_KEY, next);
  }

  async deleteSnapshot(id: string): Promise<void> {
    const current = await this.getSnapshots();
    const next = current.filter((s) => s.id !== id);
    await this.storage.write(STORAGE_KEY, [...next]);
  }

  async clearAll(): Promise<void> {
    await this.storage.write(STORAGE_KEY, []);
  }
}
