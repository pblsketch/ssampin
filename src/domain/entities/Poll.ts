export interface PollOption {
  readonly id: string;
  readonly text: string;
  readonly votes: number;
  readonly color: string;
}

export interface PollQuestion {
  readonly id: string;
  readonly question: string;
  readonly options: PollOption[];
}

export interface Poll {
  readonly id: string;
  readonly question: string;
  readonly options: PollOption[];
  readonly totalVotes: number;
  readonly isOpen: boolean;
  readonly showResults: boolean;
  readonly createdAt: number;
}
