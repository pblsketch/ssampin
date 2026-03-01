import type { MessageData } from '../entities/Message';

export interface IMessageRepository {
  getMessage(): Promise<MessageData | null>;
  saveMessage(data: MessageData): Promise<void>;
}
