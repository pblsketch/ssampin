import { create } from 'zustand';
import { messageRepository } from '@adapters/di/container';
import { format } from 'date-fns';
import type { MessageStyle } from '@domain/entities/Message';
import { DEFAULT_MESSAGE_STYLE } from '@domain/entities/Message';

interface MessageState {
  message: string;
  style: MessageStyle;
  isLoaded: boolean;
  loadMessage: () => Promise<void>;
  setMessage: (msg: string) => Promise<void>;
  setStyle: (patch: Partial<MessageStyle>) => Promise<void>;
}

export const useMessageStore = create<MessageState>((set, get) => ({
  message: '',
  style: DEFAULT_MESSAGE_STYLE,
  isLoaded: false,

  loadMessage: async () => {
    try {
      const data = await messageRepository.getMessage();
      set({
        message: data?.content ?? '',
        style: { ...DEFAULT_MESSAGE_STYLE, ...data?.style },
        isLoaded: true,
      });
    } catch {
      set({ message: '', style: DEFAULT_MESSAGE_STYLE, isLoaded: true });
    }
  },

  setMessage: async (msg: string) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const { style } = get();
    try {
      await messageRepository.saveMessage({
        title: '오늘의 메시지',
        content: msg,
        date: today,
        visible: true,
        style,
      });
      set({ message: msg });
    } catch {
      set({ message: msg });
    }
  },

  setStyle: async (patch: Partial<MessageStyle>) => {
    const { message, style } = get();
    const newStyle = { ...style, ...patch };
    const today = format(new Date(), 'yyyy-MM-dd');
    try {
      await messageRepository.saveMessage({
        title: '오늘의 메시지',
        content: message,
        date: today,
        visible: true,
        style: newStyle,
      });
      set({ style: newStyle });
    } catch {
      set({ style: newStyle });
    }
  },
}));
