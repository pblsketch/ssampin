export interface ParticipationConfig {
  readonly roomId: string;
  readonly title: string;
  readonly purpose: 'quiz' | 'discussion' | 'activity';
  readonly competitionMode: boolean;
}

export interface PersonalResult {
  readonly studentId: string;
  readonly correctCount: number;
  readonly score: number;
  readonly completedCount: number;
  readonly rank?: number;
  readonly rankChange?: number;
  readonly isCorrect?: boolean;
  readonly answer?: string;
  readonly explanation?: string;
  readonly review: readonly {
    question: string;
    isCorrect: boolean;
    /** 내가 낸 답 (읽을 수 있는 말로) */
    mine?: string;
    /** 내가 쓴 이유 */
    myReason?: string;
    /** 토론 전 처음 생각 — 차수가 여럿일 때만 */
    myFirst?: string;
    answer?: string;
    explanation?: string;
  }[];
}

export interface ParticipationControl {
  readonly roomId: string;
  readonly questionIndex: number;
  readonly attempt: number;
  readonly action: 'activate' | 'close' | 'publish' | 'advance' | 'reopen' | 'end';
  readonly results?: readonly PersonalResult[];
}

export interface ParticipationAnswer {
  readonly optionIds?: string[];
  readonly text?: string;
  readonly scale?: number;
  readonly reason?: string;
  readonly attempt?: number;
  readonly submittedAt?: string;
}

export interface ParticipationControlResult {
  readonly votes?: readonly import('./ParticipationVote').ParticipationVote[];
  readonly answers: readonly { studentId: string; answer: ParticipationAnswer }[];
}
