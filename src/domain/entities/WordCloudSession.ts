export interface WordCloudWord {
  readonly word: string;
  readonly normalized: string;
  readonly count: number;
}

export interface WordCloudGroup {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly words: readonly string[]; // normalized word keys
}

export interface WordCloudSession {
  readonly id: string;
  readonly question: string;
  readonly words: readonly WordCloudWord[];
  readonly groups: readonly WordCloudGroup[];
  readonly totalSubmissions: number;
  readonly createdAt: string;
}

export interface WordCloudHistoryData {
  readonly sessions: readonly WordCloudSession[];
}
