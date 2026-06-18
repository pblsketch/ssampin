import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IGradeAnalysisRepository } from '@domain/repositories/IGradeAnalysisRepository';
import type { GradeAnalysisData } from '@domain/entities/GradeAnalysis';

/** 성적 분석 로컬 JSON 저장소('grade-analysis'). 네트워크 전송 없음. */
export class JsonGradeAnalysisRepository implements IGradeAnalysisRepository {
  constructor(private readonly storage: IStoragePort) {}

  load(): Promise<GradeAnalysisData | null> {
    return this.storage.read<GradeAnalysisData>('grade-analysis');
  }

  save(data: GradeAnalysisData): Promise<void> {
    return this.storage.write('grade-analysis', data);
  }
}
