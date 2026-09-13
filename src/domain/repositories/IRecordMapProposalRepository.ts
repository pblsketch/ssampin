import type { RecordMapProposalData } from '../entities/RecordMapProposal';

/** 여러 학생의 AI 근거 지도 작업과 검토 전 제안을 실제 지도와 분리해 보관한다. */
export interface IRecordMapProposalRepository {
  getRecordMapProposals(): Promise<RecordMapProposalData | null>;
  /** 최신 파일 안에서 변경분을 다시 계산해 생성·중단·검토 경쟁의 유실을 막는다. */
  updateRecordMapProposals(
    update: (current: RecordMapProposalData) => RecordMapProposalData,
  ): Promise<RecordMapProposalData>;
}
