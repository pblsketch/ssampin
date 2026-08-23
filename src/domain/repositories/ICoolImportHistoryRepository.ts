import type { CoolImportHistory } from '@domain/entities/CoolMessage';

/** 쿨메신저에서 이미 가져온 항목 기록의 저장소 */
export interface ICoolImportHistoryRepository {
  load(): Promise<CoolImportHistory | null>;
  save(data: CoolImportHistory): Promise<void>;
}
