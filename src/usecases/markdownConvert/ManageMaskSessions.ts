/**
 * 복원표 보관 관리 유스케이스 — 저장소 포트 위임(암호화 저장은 infrastructure 구현).
 */
import type {
  IMaskMappingRepository,
  SavedMaskSession,
} from '@domain/ports/IMaskMappingRepository';

export class ManageMaskSessions {
  constructor(private readonly repo: IMaskMappingRepository) {}

  list(): Promise<SavedMaskSession[]> {
    return this.repo.list();
  }

  save(session: SavedMaskSession): Promise<void> {
    return this.repo.save(session);
  }

  remove(id: string): Promise<void> {
    return this.repo.remove(id);
  }

  clearAll(): Promise<void> {
    return this.repo.clearAll();
  }
}
