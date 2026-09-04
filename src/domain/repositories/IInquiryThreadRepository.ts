import type { InquiryThreadData } from '../entities/InquiryThread';

/**
 * 탐구 흐름(InquiryThread) 저장소 인터페이스.
 * inquiry-threads.json 단일 파일을 통째로 읽고/쓴다(RecordEvidence 저장 방식 미러).
 */
export interface IInquiryThreadRepository {
  getInquiryThreads(): Promise<InquiryThreadData | null>;
  saveInquiryThreads(data: InquiryThreadData): Promise<void>;
}
