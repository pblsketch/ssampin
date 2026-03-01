import { create } from 'zustand';
import { messageRepository } from '@adapters/di/container';
import { format } from 'date-fns';

interface MessageState {
  message: string;
  isLoaded: boolean;
  loadMessage: () => Promise<void>;
  setMessage: (msg: string) => Promise<void>;
}

export const useMessageStore = create<MessageState>((set) => ({
  message: '',
  isLoaded: false,

  loadMessage: async () => {
    try {
      const data = await messageRepository.getMessage();
      set({
        message: data?.content ?? '',
        isLoaded: true,
      });
    } catch {
      set({ message: '', isLoaded: true });
    }
  },

  setMessage: async (msg: string) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    try {
      await messageRepository.saveMessage({
        title: '오늘의 메시지',
        content: msg,
        date: today,
        visible: true,
      });
      set({ message: msg });
    } catch {
      // 저장 실패 시 UI 상태만 업데이트
      set({ message: msg });
    }
  },
}));
