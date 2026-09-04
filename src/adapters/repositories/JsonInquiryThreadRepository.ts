import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IInquiryThreadRepository } from '@domain/repositories/IInquiryThreadRepository';
import type { InquiryThreadData } from '@domain/entities/InquiryThread';

export class JsonInquiryThreadRepository implements IInquiryThreadRepository {
  constructor(private readonly storage: IStoragePort) {}

  getInquiryThreads(): Promise<InquiryThreadData | null> {
    return this.storage.read<InquiryThreadData>('inquiry-threads');
  }

  saveInquiryThreads(data: InquiryThreadData): Promise<void> {
    return this.storage.write('inquiry-threads', data);
  }
}
