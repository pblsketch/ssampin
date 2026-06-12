import type { RubricsData } from '../entities/Rubric';

/** 수행평가 루브릭/채점 기록 저장소 (로컬 JSON 'rubrics' 키) */
export interface IRubricRepository {
  load(): Promise<RubricsData | null>;
  save(data: RubricsData): Promise<void>;
}
