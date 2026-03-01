import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IMessageRepository } from '@domain/repositories/IMessageRepository';
import type { MessageData } from '@domain/entities/Message';

export class JsonMessageRepository implements IMessageRepository {
  constructor(private readonly storage: IStoragePort) {}

  getMessage(): Promise<MessageData | null> {
    return this.storage.read<MessageData>('message');
  }

  saveMessage(data: MessageData): Promise<void> {
    return this.storage.write('message', data);
  }
}
