export interface ObservationRecord {
  readonly id: string;
  readonly studentId: string;
  readonly classId: string;
  readonly authorId: string;
  readonly date: string;             // YYYY-MM-DD (수업일 기준)
  readonly content: string;          // 최대 500자
  readonly tags: readonly string[];
  readonly visibility: 'private' | 'shared';
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface ObservationData {
  readonly records: readonly ObservationRecord[];
  readonly customTags?: readonly string[];
}

export const DEFAULT_OBSERVATION_TAGS = [
  '교과역량',
  '학습태도',
  '진로흥미',
  '특이사항',
] as const;
